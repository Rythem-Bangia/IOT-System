-- When the user resets the valve after inspection, also clear the displayed last reading.
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
