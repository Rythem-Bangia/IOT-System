/// <reference path="./deno-env.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You summarize water leak monitor history for a homeowner.
Use only the statistics and event list provided. Be concise: 4-7 short bullet points or two tight paragraphs.
Note trends (frequency, moisture levels, response times, email delivery, unresolved vs resolved).
Do not invent events. If the list is empty, say there were no leaks in the window and suggest monitoring.
Not a plumber or insurer; suggest professional help when patterns suggest recurring problems.`;

type LeakRow = {
  moisture_at_trigger: number;
  response_ms: number | null;
  created_at: string;
  resolved_at: string | null;
  email_sent_at: string | null;
  zone_id: string;
  zones: { name: string } | { name: string }[] | null;
};

function zoneNameFromRow(r: LeakRow): string {
  const z = r.zones;
  if (!z) return "Zone";
  return Array.isArray(z) ? (z[0]?.name ?? "Zone") : z.name;
}

async function openaiReply(system: string, userContent: string): Promise<Response> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(
      JSON.stringify({
        error: "AI not configured",
        hint: "Set OPENAI_API_KEY in Edge Function secrets.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: 650,
      temperature: 0.4,
    }),
  });
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized", hint: "Sign in and retry." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { zone_id?: string; days?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const days = Math.min(90, Math.max(1, Math.round(Number(body.days) || 30)));
  const zoneFilter =
    typeof body.zone_id === "string" && body.zone_id.trim().length > 0
      ? body.zone_id.trim()
      : null;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized", detail: userErr?.message }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  let q = userClient
    .from("leak_events")
    .select(
      "moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at, zone_id, zones ( name )",
    )
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(120);

  if (zoneFilter) {
    q = q.eq("zone_id", zoneFilter);
  }

  const { data: rawRows, error: leakErr } = await q;

  if (leakErr) {
    console.error("ai-history-summary:", leakErr.message);
    return new Response(
      JSON.stringify({ error: "History lookup failed", detail: leakErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const rows = (rawRows ?? []) as LeakRow[];
  const n = rows.length;
  const moistures = rows.map((r) => Number(r.moisture_at_trigger));
  const maxM = moistures.length ? Math.max(...moistures) : 0;
  const responses = rows
    .map((r) => r.response_ms)
    .filter((x): x is number => x != null && !Number.isNaN(x));
  const avgMs = responses.length
    ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length)
    : null;
  const emailed = rows.filter((r) => r.email_sent_at).length;
  const unresolved = rows.filter((r) => !r.resolved_at).length;

  const lines = rows.slice(0, 25).map((r) => {
    const zn = zoneNameFromRow(r);
    const m = Math.round(Number(r.moisture_at_trigger));
    const ms = r.response_ms == null ? "—" : String(r.response_ms);
    const res = r.resolved_at ? "resolved" : "not reset";
    const em = r.email_sent_at ? "email ok" : "no email";
    return `${String(r.created_at).slice(0, 19)} | ${zn} | ${m}% | ${ms} ms | ${em} | ${res}`;
  });

  const stats = [
    `Window: last ${days} days${zoneFilter ? ` (zone_id filter: ${zoneFilter})` : " (all your zones)"}.`,
    `Event count: ${n}.`,
    n > 0
      ? `Peak moisture at trigger: ${maxM}%. Avg response time: ${avgMs ?? "—"} ms.`
      : "",
    n > 0
      ? `Emails recorded sent: ${emailed}/${n}. Rows still awaiting reset (unresolved): ${unresolved}.`
      : "",
    n > 0 ? "Recent events (newest first, up to 25):" : "",
    n > 0 ? lines.join("\n") : "No events in this period.",
  ]
    .filter(Boolean)
    .join("\n");

  const openaiRes = await openaiReply(SYSTEM, stats);
  if (openaiRes.status === 503) {
    return openaiRes;
  }

  if (!openaiRes.ok) {
    const t = await openaiRes.text();
    console.error("ai-history-summary: OpenAI", openaiRes.status, t.slice(0, 400));
    return new Response(
      JSON.stringify({
        error: "AI request failed",
        detail: t.length > 280 ? `${t.slice(0, 277)}…` : t,
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const completion = (await openaiRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
  const reply = completion.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    return new Response(JSON.stringify({ error: "Empty AI response" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ reply, model }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
