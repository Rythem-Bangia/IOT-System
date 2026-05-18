-- Disconnect (revoke) a Raspberry Pi from the app side.
--
-- We rotate the device_secret of the zone's device. The Pi's saved secret
-- (in ~/.aquaguard-pi.json) instantly stops working, so its next call to
-- submit_sensor_reading_device returns "Invalid device secret". The Pi
-- catches that error, deletes its saved config, and re-enters the
-- 6-digit pairing flow.
--
-- Only the zone owner (the authenticated user) can call this.

create or replace function public.unlink_pi_device(p_zone_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner     uuid;
  v_device_id uuid;
  v_new_secret uuid := gen_random_uuid();
begin
  select d.user_id, d.id
  into v_owner, v_device_id
  from public.zones z
  join public.devices d on d.id = z.device_id
  where z.id = p_zone_id;

  if not found then
    raise exception 'Zone not found';
  end if;

  if v_owner is distinct from auth.uid() then
    raise exception 'Not authorized for this zone';
  end if;

  update public.devices
  set device_secret = v_new_secret
  where id = v_device_id;

  -- Also wipe any pending pairing rows for this zone so a previous
  -- (un-claimed) code can't accidentally bind to the new secret.
  delete from public.pi_pairings where zone_id = p_zone_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.unlink_pi_device(uuid) to authenticated;
