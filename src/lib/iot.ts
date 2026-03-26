import { formatEdgeFunctionInvokeError, formatError } from "./formatError";
import { supabase, supabaseAnonKey } from "./supabase";

export type DeviceMode = "physical" | "virtual";

export async function ensureDefaultSetup(userId: string) {
  const { data: existing, error: listErr } = await supabase
    .from("devices")
    .select("id")
    .limit(1);

  if (listErr) throw listErr;
  if (existing?.length) return;

  const { data: device, error: devErr } = await supabase
    .from("devices")
    .insert({
      user_id: userId,
      name: "Main unit",
      mode: "virtual" as DeviceMode,
    })
    .select("id")
    .single();

  if (devErr) throw devErr;

  const { error: zoneErr } = await supabase.from("zones").insert({
    device_id: device.id,
    name: "Kitchen / pipe base",
    moisture_threshold: 65,
  });

  if (zoneErr) throw zoneErr;
}

export type ZoneRow = {
  id: string;
  name: string;
  moisture_threshold: number;
  last_moisture: number | null;
  valve_open: boolean;
  valve_closed_at: string | null;
  devices: {
    id: string;
    mode: DeviceMode;
    name: string;
    device_secret: string;
  };
};

export async function fetchZones(): Promise<ZoneRow[]> {
  const { data, error } = await supabase
    .from("zones")
    .select(
      `
      id,
      name,
      moisture_threshold,
      last_moisture,
      valve_open,
      valve_closed_at,
      devices!inner ( id, mode, name, device_secret )
    `,
    )
    .order("name");

  if (error) throw error;
  return (data ?? []) as unknown as ZoneRow[];
}

export async function updateDeviceMode(
  deviceId: string,
  mode: DeviceMode,
) {
  const { error } = await supabase
    .from("devices")
    .update({ mode })
    .eq("id", deviceId);
  if (error) throw error;
}

export async function submitReading(
  zoneId: string,
  moisture: number,
  source: "physical" | "virtual",
) {
  const { data, error } = await supabase.rpc("submit_sensor_reading", {
    p_zone_id: zoneId,
    p_moisture: moisture,
    p_source: source,
  });

  if (error) throw error;
  return data as {
    leak_detected?: boolean;
    leak_event_id?: string;
    valve_closed?: boolean;
    response_ms?: number;
    threshold?: number;
  };
}

export async function updateThreshold(
  zoneId: string,
  threshold: number,
) {
  const { error } = await supabase
    .from("zones")
    .update({ moisture_threshold: Math.round(Math.max(0, Math.min(100, threshold))) })
    .eq("id", zoneId);
  if (error) throw error;
}

/** Clears the stored last reading to 0% so Monitor/Simulate start “dry” without changing valve state. */
export async function clearZoneLastMoisture(zoneId: string) {
  const { error } = await supabase
    .from("zones")
    .update({ last_moisture: 0 })
    .eq("id", zoneId);
  if (error) throw error;
}

export async function resetValve(zoneId: string) {
  const { error } = await supabase.rpc("reset_zone_valve", {
    p_zone_id: zoneId,
  });
  if (error) throw error;
}

export async function sendLeakEmail(leakEventId: string) {
  // Auth via device_secret (no JWT needed by the edge function).
  const { data: ownedDevices } = await supabase
    .from("devices")
    .select("device_secret");
  const deviceSecrets = (ownedDevices ?? [])
    .map((d) => d?.device_secret?.trim())
    .filter((v): v is string => Boolean(v));

  if (deviceSecrets.length === 0) {
    throw new Error("No devices found — open Monitor first so the app can load your device secret.");
  }

  const { data, error, response } = await supabase.functions.invoke(
    "send-leak-alert",
    {
      body: { leak_event_id: leakEventId, device_secret: deviceSecrets },
      headers: { Authorization: `Bearer ${supabaseAnonKey}` },
    },
  );
  if (error) {
    const message = await formatEdgeFunctionInvokeError(error, response);
    throw new Error(message);
  }
  return data as { ok?: boolean; emailed?: boolean; message?: string; skipped?: boolean };
}

export type SubmitReadingResult = {
  leak_detected?: boolean;
  leak_event_id?: string;
  valve_closed?: boolean;
  response_ms?: number;
  threshold?: number;
};

/**
 * Call after submitReading when the RPC reports a new leak. Safe for all callers:
 * does not throw; returns text for alerts if the edge function or Resend fails.
 */
export async function tryInvokeLeakEmailAfterSubmit(res: SubmitReadingResult): Promise<{
  attempted: boolean;
  emailed?: boolean;
  userMessage?: string;
}> {
  if (!res.leak_detected || !res.leak_event_id) {
    return { attempted: false };
  }
  try {
    const data = await sendLeakEmail(res.leak_event_id);
    if (data?.skipped) {
      return {
        attempted: true,
        userMessage: "Email was already sent for this leak event.",
      };
    }
    if (data?.emailed) {
      return { attempted: true, emailed: true };
    }
    return {
      attempted: true,
      userMessage:
        data?.message ??
        "Leak logged; email not sent — Settings → leak alert email, deploy send-leak-alert, RESEND_API_KEY.",
    };
  } catch (e) {
    return { attempted: true, userMessage: formatError(e) };
  }
}

export type LeakEventRow = {
  id: string;
  zone_id: string;
  moisture_at_trigger: number;
  response_ms: number | null;
  email_sent_at: string | null;
  email_last_attempt_at: string | null;
  email_last_error: string | null;
  resolved_at: string | null;
  created_at: string;
  zones: { name: string };
};

const leakHistorySelectBasic = `
  id,
  zone_id,
  moisture_at_trigger,
  response_ms,
  email_sent_at,
  resolved_at,
  created_at,
  zones ( name )
`;

const leakHistorySelectExtended = `
  id,
  zone_id,
  moisture_at_trigger,
  response_ms,
  email_sent_at,
  email_last_attempt_at,
  email_last_error,
  resolved_at,
  created_at,
  zones ( name )
`;

function normalizeLeakRows(raw: unknown): LeakEventRow[] {
  const list = (raw as Partial<LeakEventRow>[] | null) ?? [];
  return list.map((r) => ({
    ...(r as LeakEventRow),
    email_last_attempt_at: r.email_last_attempt_at ?? null,
    email_last_error: r.email_last_error ?? null,
  }));
}

export async function fetchLeakHistory(limit = 50): Promise<LeakEventRow[]> {
  const extended = await supabase
    .from("leak_events")
    .select(leakHistorySelectExtended)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!extended.error) {
    return normalizeLeakRows(extended.data);
  }

  const em = extended.error.message ?? "";
  const missingAuditCols =
    /email_last_attempt_at|email_last_error|does not exist|schema cache/i.test(
      em,
    );

  if (missingAuditCols) {
    const basic = await supabase
      .from("leak_events")
      .select(leakHistorySelectBasic)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (basic.error) throw basic.error;
    return normalizeLeakRows(basic.data);
  }

  throw extended.error;
}

export async function updateProfileAlertEmail(alertEmail: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("profiles")
    .update({ alert_email: alertEmail })
    .eq("id", user.id);
  if (error) throw error;
}

export async function fetchProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("alert_email, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
