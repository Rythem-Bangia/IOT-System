import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatEdgeFunctionInvokeError, formatError } from "./formatError";
import { roomOptionById } from "../data/rooms";
import { supabase, supabaseAnonKey } from "./supabase";

export type DeviceMode = "physical" | "virtual";

function roomLocationKey(userId: string) {
  return `lab_room_location_${userId}`;
}

export async function getSelectedRoom(userId: string): Promise<string> {
  const raw = await AsyncStorage.getItem(roomLocationKey(userId));
  return raw?.trim() ?? "";
}

export async function setSelectedRoom(userId: string, room: string): Promise<void> {
  const value = room.trim();
  if (!value) return;
  await AsyncStorage.setItem(roomLocationKey(userId), value);
}

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
    name: "Primary zone",
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

/** Display name in emails / history — should match the room the user selected in Monitor. */
export async function updateZoneName(zoneId: string, name: string) {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return;
  const { error } = await supabase
    .from("zones")
    .update({ name: trimmed })
    .eq("id", zoneId);
  if (error) throw error;
}

/**
 * Syncs Supabase zone name with the user's selected room.
 * Returns true when an update was applied.
 */
export async function syncZoneNameWithSelectedRoom(
  userId: string,
  zone?: Pick<ZoneRow, "id" | "name"> | null,
): Promise<boolean> {
  const selected = (await getSelectedRoom(userId)).trim();
  if (!selected) return false;
  const target = roomOptionById(selected)?.label ?? selected;
  const targetZone = zone ?? (await fetchZones())[0] ?? null;
  if (!targetZone || targetZone.name === target) return false;
  await updateZoneName(targetZone.id, target);
  return true;
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

export type LeakEmailPreview = {
  subject: string;
  text: string;
};

export function buildLeakEmailPreview(input: {
  zoneName: string;
  moistureAtTrigger: number;
  responseMs?: number | null;
}): LeakEmailPreview {
  const zone = input.zoneName.trim() || "Your zone";
  const moisture = Math.round(Math.max(0, Math.min(100, input.moistureAtTrigger)));
  const responseMs =
    input.responseMs == null || Number.isNaN(input.responseMs)
      ? "—"
      : String(Math.max(0, Math.round(input.responseMs)));
  return {
    subject: `Water leak detected - ${zone}`,
    text: `Leak alert\n\nZone: ${zone}\nMoisture at trigger: ${moisture}%\nEstimated response time: ${responseMs} ms\n\nThe solenoid valve has been closed automatically. Inspect the area, repair if needed, then reset the valve from the app after conditions are safe.`,
  };
}

export type AlertSetupIssueCode =
  | "NOT_SIGNED_IN"
  | "NO_ZONE"
  | "NO_DEVICE_SECRET"
  | "NO_ALERT_EMAIL";

export type AlertSetupStatus = {
  ok: boolean;
  issues: { code: AlertSetupIssueCode; message: string }[];
  zoneName?: string;
  alertEmail?: string;
};

export async function validateAlertSetup(): Promise<AlertSetupStatus> {
  const issues: AlertSetupStatus["issues"] = [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    issues.push({ code: "NOT_SIGNED_IN", message: "You are not signed in." });
    return { ok: false, issues };
  }

  await ensureDefaultSetup(user.id);
  const zones = await fetchZones();
  const zone = zones[0];
  if (!zone) {
    issues.push({
      code: "NO_ZONE",
      message: "No zone found. Open Monitor to create a zone.",
    });
  }
  if (!zone?.devices?.device_secret?.trim()) {
    issues.push({
      code: "NO_DEVICE_SECRET",
      message: "Device secret is missing. Reopen Monitor to initialize the device.",
    });
  }

  const profile = await fetchProfile();
  const alertEmail = profile?.alert_email?.trim() ?? "";
  if (!alertEmail) {
    issues.push({
      code: "NO_ALERT_EMAIL",
      message: "Set leak alert email in Settings.",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    zoneName: zone?.name,
    alertEmail: alertEmail || undefined,
  };
}

export async function retrySendLeakEmail(leakEventId: string) {
  return sendLeakEmail(leakEventId);
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

export type RoomStats = {
  zoneId: string;
  zoneName: string;
  days: number;
  leakCount: number;
  maxMoisture: number;
  avgResponseMs: number | null;
};

export async function getRoomStats(zoneId: string, days = 7): Promise<RoomStats> {
  const safeDays = Math.max(1, Math.floor(days));
  const sinceIso = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: zoneRow, error: zoneErr } = await supabase
    .from("zones")
    .select("id, name")
    .eq("id", zoneId)
    .single();
  if (zoneErr) throw zoneErr;

  const { data: events, error: eventsErr } = await supabase
    .from("leak_events")
    .select("moisture_at_trigger, response_ms, created_at")
    .eq("zone_id", zoneId)
    .gte("created_at", sinceIso);
  if (eventsErr) throw eventsErr;

  const rows = (events ??
    []) as { moisture_at_trigger?: number; response_ms?: number | null }[];
  const leakCount = rows.length;
  const maxMoisture = rows.reduce(
    (acc, r) => Math.max(acc, Math.round(r.moisture_at_trigger ?? 0)),
    0,
  );
  const validResponse = rows
    .map((r) => r.response_ms)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const avgResponseMs =
    validResponse.length > 0
      ? Math.round(validResponse.reduce((a, b) => a + b, 0) / validResponse.length)
      : null;

  return {
    zoneId: zoneRow.id,
    zoneName: zoneRow.name,
    days: safeDays,
    leakCount,
    maxMoisture,
    avgResponseMs,
  };
}

export type RoomSimulationResult = {
  zoneId: string;
  zoneName: string;
  moistureSent: number;
  leakDetected: boolean;
  leakEventId?: string;
  responseMs?: number;
  emailAttempted: boolean;
  emailSent?: boolean;
  emailMessage?: string;
};

/**
 * Runs one cloud simulation pass for a room id (e.g. "bathroom").
 * If the room does not exist yet, it reuses the current zone and renames it.
 */
export async function runSimulationForRoom(
  roomId: string,
  moistureValue?: number,
): Promise<RoomSimulationResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Not signed in");

  await ensureDefaultSetup(user.id);
  const roomLabel = roomOptionById(roomId)?.label ?? roomId.trim();
  if (!roomLabel) throw new Error("Room is required");

  let zones = await fetchZones();
  let zone =
    zones.find((z) => z.name.toLowerCase() === roomLabel.toLowerCase()) ?? zones[0];
  if (!zone) throw new Error("No zone found");

  if (zone.name !== roomLabel) {
    await updateZoneName(zone.id, roomLabel);
    zones = await fetchZones();
    zone =
      zones.find((z) => z.id === zone.id) ??
      zones.find((z) => z.name.toLowerCase() === roomLabel.toLowerCase()) ??
      zone;
  }

  await setSelectedRoom(user.id, roomLabel);

  const targetMoisture = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        moistureValue == null ? Math.max((zone.moisture_threshold ?? 65) + 15, 85) : moistureValue,
      ),
    ),
  );
  const res = await submitReading(zone.id, targetMoisture, "virtual");
  const email = await tryInvokeLeakEmailAfterSubmit(res);

  return {
    zoneId: zone.id,
    zoneName: roomLabel,
    moistureSent: targetMoisture,
    leakDetected: Boolean(res?.leak_detected),
    leakEventId: res?.leak_event_id,
    responseMs: res?.response_ms,
    emailAttempted: email.attempted,
    emailSent: email.emailed,
    emailMessage: email.userMessage,
  };
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

/** For on-device “smart tips” — recent leak triggers for one zone. */
export async function fetchRecentLeakSnippets(
  zoneId: string,
  limit = 5,
): Promise<{ moisture_at_trigger: number; created_at: string }[]> {
  const { data, error } = await supabase
    .from("leak_events")
    .select("moisture_at_trigger, created_at")
    .eq("zone_id", zoneId)
    .order("created_at", { ascending: false })
    .limit(Math.min(20, Math.max(1, limit)));
  if (error) throw error;
  return (data ?? []) as { moisture_at_trigger: number; created_at: string }[];
}
