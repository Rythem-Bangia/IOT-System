/// <reference path="./deno-env.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type DeviceRow = { user_id: string; device_secret: string };

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmailResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const from =
    Deno.env.get("RESEND_FROM") ?? "Water Leak Monitor <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({
        error: "Server misconfigured",
        hint: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: { leak_event_id?: string; device_secret?: string | string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const leakEventId = body.leak_event_id;
  if (!leakEventId) {
    return new Response(JSON.stringify({ error: "leak_event_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const deviceSecret = body.device_secret;
  if (deviceSecret == null || (Array.isArray(deviceSecret) && deviceSecret.length === 0)) {
    return new Response(JSON.stringify({ error: "device_secret required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: leak, error: leakErr } = await admin
    .from("leak_events")
    .select(
      `
      id,
      moisture_at_trigger,
      response_ms,
      email_sent_at,
      zones!inner (
        name,
        devices!inner ( user_id, device_secret )
      )
    `,
    )
    .eq("id", leakEventId)
    .single();

  if (leakErr || !leak) {
    console.error("send-leak-alert: event not found", leakEventId, leakErr?.message);
    return new Response(
      JSON.stringify({ error: "Event not found", detail: leakErr?.message }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  type LeakWithZones = {
    id: string;
    moisture_at_trigger: number;
    response_ms: number | null;
    email_sent_at: string | null;
    zones:
      | { name: string; devices: DeviceRow | DeviceRow[] }
      | { name: string; devices: DeviceRow | DeviceRow[] }[];
  };

  const row = leak as LeakWithZones;

  const zone = pickOne(
    row.zones as
      | { name: string; devices: DeviceRow | DeviceRow[] }
      | { name: string; devices: DeviceRow | DeviceRow[] }[],
  );
  if (!zone) {
    return new Response(JSON.stringify({ error: "Invalid zone embed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const device = pickOne(zone.devices);
  if (!device) {
    return new Response(JSON.stringify({ error: "Invalid device embed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Auth: match device_secret only (no JWT needed) ---
  const expected = String(device.device_secret).trim().toLowerCase();
  const provided = Array.isArray(deviceSecret) ? deviceSecret : [deviceSecret];
  const matched = provided.some(
    (s) => typeof s === "string" && s.trim().toLowerCase() === expected,
  );

  if (!matched) {
    console.error("send-leak-alert: device_secret mismatch", {
      leak_event_id: leakEventId,
      expectedLast6: expected.slice(-6),
      providedLast6: provided.map((s) => String(s).trim().toLowerCase().slice(-6)),
    });
    return new Response(
      JSON.stringify({ error: "Unauthorized", detail: "device_secret does not match" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ownerId = device.user_id;

  if (row.email_sent_at) {
    console.log("send-leak-alert: skipped already_sent", leakEventId);
    return new Response(JSON.stringify({ skipped: true, reason: "already_sent" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("alert_email, full_name")
    .eq("id", ownerId)
    .maybeSingle();

  const to = profile?.alert_email?.trim();
  if (!to) {
    console.error("send-leak-alert: no alert_email", ownerId);
    return new Response(JSON.stringify({ error: "No alert_email on profile" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const zoneName = escapeHtml(zone.name);
  const subject = `Water leak detected — ${zone.name}`;
  const html = `
    <h2>Leak alert</h2>
    <p>Zone: <strong>${zoneName}</strong></p>
    <p>Moisture at trigger: <strong>${row.moisture_at_trigger}%</strong></p>
    <p>Estimated response time: <strong>${row.response_ms ?? "—"} ms</strong></p>
    <p>The solenoid valve has been closed automatically. Inspect the area, repair if needed, then reset the valve from the app after conditions are safe.</p>
  `;

  const sent = await sendEmailResend(to, subject, html);

  if (!sent.ok && sent.error !== "RESEND_API_KEY not set") {
    console.error("send-leak-alert: Resend error", sent.error);
    return new Response(
      JSON.stringify({ error: "Email failed", detail: sent.error }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (sent.ok) {
    console.log("send-leak-alert: email sent to", to);
    await admin
      .from("leak_events")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", leakEventId);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      emailed: sent.ok,
      message: sent.ok ? "Sent" : (sent.error ?? "Configure RESEND_API_KEY"),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
