/// <reference path="./deno-env.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You explain a hypothetical moisture reading for a home leak monitor.
The user may be running a simulation. Compare the value to the zone threshold and valve state.
Give 3-5 short sentences: what the app would typically do, what the numbers mean, and one practical check (e.g. sensor placement).
Do not claim real-world flooding is happening — this may be a test. Not a plumber.`;

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

  let body: { zone_id?: string; moisture?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const zoneId = typeof body.zone_id === "string" ? body.zone_id.trim() : "";
  if (!zoneId) {
    return new Response(JSON.stringify({ error: "zone_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawM = Number(body.moisture);
  if (!Number.isFinite(rawM)) {
    return new Response(JSON.stringify({ error: "moisture must be a number" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const moisture = Math.round(Math.max(0, Math.min(100, rawM)));

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

  const { data: zone, error: zoneErr } = await userClient
    .from("zones")
    .select("id, name, moisture_threshold, last_moisture, valve_open")
    .eq("id", zoneId)
    .maybeSingle();

  if (zoneErr) {
    return new Response(
      JSON.stringify({ error: "Zone lookup failed", detail: zoneErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!zone) {
    return new Response(JSON.stringify({ error: "Zone not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(
      JSON.stringify({
        error: "AI not configured",
        hint: "Set OPENAI_API_KEY in Edge Function secrets.",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
  const thr = Math.round(Number(zone.moisture_threshold));
  const last =
    zone.last_moisture == null ? "unknown" : String(Math.round(Number(zone.last_moisture)));
  const valve = zone.valve_open ? "open" : "closed";

  const userContent = [
    `Zone name: ${zone.name}`,
    `Threshold: ${thr}%`,
    `Valve currently: ${valve}`,
    `Last stored moisture in cloud: ${last}%`,
    `Hypothetical / slider reading to explain: ${moisture}%`,
    `If this reading were submitted while the valve is open and moisture >= threshold, the app would close the valve and log a leak event.`,
  ].join("\n");

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
      max_tokens: 400,
      temperature: 0.45,
    }),
  });

  if (!openaiRes.ok) {
    const t = await openaiRes.text();
    console.error("ai-moisture-hint: OpenAI", openaiRes.status, t.slice(0, 400));
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
