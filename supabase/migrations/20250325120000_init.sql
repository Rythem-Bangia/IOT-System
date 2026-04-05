-- Water leak IoT: profiles, devices (physical | virtual), zones, readings, leak events

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  alert_email text,
  created_at timestamptz default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'Main unit',
  mode text not null check (mode in ('physical', 'virtual')),
  device_secret uuid not null default gen_random_uuid(),
  created_at timestamptz default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices on delete cascade,
  name text not null,
  moisture_threshold numeric not null default 70 check (moisture_threshold >= 0 and moisture_threshold <= 100),
  last_moisture numeric default 0 check (last_moisture is null or (last_moisture >= 0 and last_moisture <= 100)),
  valve_open boolean not null default true,
  valve_closed_at timestamptz,
  updated_at timestamptz default now()
);

create table public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones on delete cascade,
  moisture_value numeric not null,
  source text not null check (source in ('physical', 'virtual')),
  recorded_at timestamptz default now()
);

create index sensor_readings_zone_recorded_at on public.sensor_readings (zone_id, recorded_at desc);

create table public.leak_events (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones on delete cascade,
  moisture_at_trigger numeric not null,
  valve_closed_at timestamptz,
  response_ms integer,
  email_sent_at timestamptz,
  email_last_attempt_at timestamptz,
  email_last_error text,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create index leak_events_zone_created on public.leak_events (zone_id, created_at desc);

-- New user profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, alert_email)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Submit reading: compare threshold, close valve, log leak (once until reset)
create or replace function public.submit_sensor_reading(
  p_zone_id uuid,
  p_moisture numeric,
  p_source text default 'virtual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := clock_timestamp();
  v_zone record;
  v_leak_id uuid;
  v_response_ms integer;
begin
  if p_moisture < 0 or p_moisture > 100 then
    raise exception 'Moisture must be 0-100';
  end if;

  if p_source not in ('physical', 'virtual') then
    raise exception 'Invalid source';
  end if;

  select z.*, d.user_id as owner_id
  into v_zone
  from public.zones z
  join public.devices d on d.id = z.device_id
  where z.id = p_zone_id;

  if not found then
    raise exception 'Zone not found';
  end if;

  if v_zone.owner_id is distinct from auth.uid() then
    raise exception 'Not authorized for this zone';
  end if;

  insert into public.sensor_readings (zone_id, moisture_value, source)
  values (p_zone_id, p_moisture, p_source);

  update public.zones
  set last_moisture = p_moisture, updated_at = now()
  where id = p_zone_id;

  if p_moisture >= v_zone.moisture_threshold and v_zone.valve_open then
    update public.zones
    set valve_open = false, valve_closed_at = now(), updated_at = now()
    where id = p_zone_id;

    v_response_ms := greatest(1, (extract(epoch from (clock_timestamp() - v_start)) * 1000)::integer);

    insert into public.leak_events (zone_id, moisture_at_trigger, valve_closed_at, response_ms)
    values (p_zone_id, p_moisture, now(), v_response_ms)
    returning id into v_leak_id;

    return jsonb_build_object(
      'leak_detected', true,
      'leak_event_id', v_leak_id,
      'valve_closed', true,
      'response_ms', v_response_ms
    );
  end if;

  return jsonb_build_object(
    'leak_detected', false,
    'valve_closed', false,
    'threshold', v_zone.moisture_threshold
  );
end;
$$;

-- Physical MCU / gateway: same logic, auth via device secret (no user JWT)
create or replace function public.submit_sensor_reading_device(
  p_zone_id uuid,
  p_moisture numeric,
  p_device_secret uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := clock_timestamp();
  v_zone record;
  v_leak_id uuid;
  v_response_ms integer;
begin
  if p_moisture < 0 or p_moisture > 100 then
    raise exception 'Moisture must be 0-100';
  end if;

  select z.*, d.user_id as owner_id, d.id as dev_id
  into v_zone
  from public.zones z
  join public.devices d on d.id = z.device_id
  where z.id = p_zone_id;

  if not found then
    raise exception 'Zone not found';
  end if;

  if p_device_secret is distinct from (
    select device_secret from public.devices where id = v_zone.device_id
  ) then
    raise exception 'Invalid device secret';
  end if;

  insert into public.sensor_readings (zone_id, moisture_value, source)
  values (p_zone_id, p_moisture, 'physical');

  update public.zones
  set last_moisture = p_moisture, updated_at = now()
  where id = p_zone_id;

  if p_moisture >= v_zone.moisture_threshold and v_zone.valve_open then
    update public.zones
    set valve_open = false, valve_closed_at = now(), updated_at = now()
    where id = p_zone_id;

    v_response_ms := greatest(1, (extract(epoch from (clock_timestamp() - v_start)) * 1000)::integer);

    insert into public.leak_events (zone_id, moisture_at_trigger, valve_closed_at, response_ms)
    values (p_zone_id, p_moisture, now(), v_response_ms)
    returning id into v_leak_id;

    return jsonb_build_object(
      'leak_detected', true,
      'leak_event_id', v_leak_id,
      'valve_closed', true,
      'response_ms', v_response_ms
    );
  end if;

  return jsonb_build_object('leak_detected', false, 'valve_closed', false);
end;
$$;

create or replace function public.reset_zone_valve(p_zone_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select d.user_id into v_owner
  from public.zones z
  join public.devices d on d.id = z.device_id
  where z.id = p_zone_id;

  if not found then
    raise exception 'Zone not found';
  end if;

  if v_owner is distinct from auth.uid() then
    raise exception 'Not authorized';
  end if;

  update public.zones
  set
    valve_open = true,
    valve_closed_at = null,
    last_moisture = 0,
    updated_at = now()
  where id = p_zone_id;

  update public.leak_events
  set resolved_at = now()
  where zone_id = p_zone_id and resolved_at is null;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.zones enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.leak_events enable row level security;

create policy "Users read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users manage own devices"
  on public.devices for all using (auth.uid() = user_id);

create policy "Users manage zones of own devices"
  on public.zones for all
  using (
    exists (select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid())
  );

create policy "Users read readings for own zones"
  on public.sensor_readings for select
  using (
    exists (
      select 1 from public.zones z
      join public.devices d on d.id = z.device_id
      where z.id = zone_id and d.user_id = auth.uid()
    )
  );

create policy "Users read leak events for own zones"
  on public.leak_events for select
  using (
    exists (
      select 1 from public.zones z
      join public.devices d on d.id = z.device_id
      where z.id = zone_id and d.user_id = auth.uid()
    )
  );

grant execute on function public.submit_sensor_reading(uuid, numeric, text) to authenticated;
grant execute on function public.submit_sensor_reading_device(uuid, numeric, uuid) to anon, authenticated;
grant execute on function public.reset_zone_valve(uuid) to authenticated;

-- Enable Realtime for zones / leak_events in Supabase Dashboard → Database → Replication if needed.
