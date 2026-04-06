import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const PUTER_CHAT_URL =
  "https://api.puter.com/puterai/openai/v1/chat/completions";
const EDGE_LLM_HINT =
  "Set PUTER_AUTH_TOKEN (Puter dashboard). Optional PUTER_MODEL (default gpt-5-nano).";

function llmBearer(): string | null {
  return Deno.env.get("PUTER_AUTH_TOKEN")?.trim() ?? null;
}

function chatModel(): string {
  return Deno.env.get("PUTER_MODEL")?.trim() || "gpt-5-nano";
}

const PUTER_TEMPERATURE = 1;

async function llmChat(
  system: string,
  user: string,
  maxTokens: number,
  _temperature: number,
): Promise<{ text: string; model: string }> {
  const key = llmBearer();
  if (!key) throw new Error("NO_LLM");
  const m = chatModel();
  const res = await fetch(PUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: m,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: PUTER_TEMPERATURE,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`llm:${res.status}:${t.slice(0, 400)}`);
  }
  const completion = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty_completion");
  return { text, model: m };
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a concise home water-safety assistant for a leak monitor app.
You only explain and suggest based on the zone data the user provides. You are not a plumber or insurer.
Keep answers practical: short paragraphs or bullet points, under 250 words unless the user asks for detail.
If moisture is high or the valve is closed, mention inspecting for leaks, drying the area, and using Reset valve in the app only after it is safe.
Never claim certainty about hidden pipe damage; suggest professional help when appropriate.`;

const MAX_QUESTION_LEN = 500;

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
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized", hint: "Sign in and retry." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { zone_id?: string; question?: string };
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

  let question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length > MAX_QUESTION_LEN) {
    question = question.slice(0, MAX_QUESTION_LEN);
  }

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
    .select(
      "id, name, moisture_threshold, last_moisture, valve_open, valve_closed_at",
    )
    .eq("id", zoneId)
    .maybeSingle();

  if (zoneErr) {
    console.error("ai-zone-tips: zone query", zoneErr.message);
    return new Response(JSON.stringify({ error: "Zone lookup failed", detail: zoneErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!zone) {
    return new Response(JSON.stringify({ error: "Zone not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: events, error: evErr } = await userClient
    .from("leak_events")
    .select("moisture_at_trigger, response_ms, created_at")
    .eq("zone_id", zoneId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (evErr) {
    console.error("ai-zone-tips: events", evErr.message);
  }

  if (!llmBearer()) {
    return new Response(
      JSON.stringify({
        error: "AI not configured",
        hint: EDGE_LLM_HINT,
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const lastM =
    zone.last_moisture == null ? "unknown" : String(Math.round(Number(zone.last_moisture)));
  const thr = Math.round(Number(zone.moisture_threshold));
  const valve = zone.valve_open ? "open" : "closed";

  const eventLines = (events ?? []).map((e) => {
    const m = Math.round(Number(e.moisture_at_trigger));
    const ms = e.response_ms == null ? "—" : String(e.response_ms);
    const when = e.created_at ? String(e.created_at).slice(0, 19) : "—";
    return `- ${when}: moisture ${m}%, response ${ms} ms`;
  });

  const context = [
    `Zone: ${zone.name}`,
    `Moisture threshold: ${thr}%`,
    `Last stored moisture: ${lastM}%`,
    `Valve: ${valve}`,
    eventLines.length
      ? `Recent leak events (newest first):\n${eventLines.join("\n")}`
      : "No recent leak events in history.",
    question ? `User question: ${question}` : "User did not ask a specific question — give brief maintenance and interpretation tips for this snapshot.",
  ].join("\n");

  let reply: string;
  let model: string;
  try {
    const out = await llmChat(SYSTEM, context, 700, 0.45);
    reply = out.text;
    model = out.model;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("llm:")) {
      const t = msg.replace(/^llm:\d+:/, "");
      console.error("ai-zone-tips: LLM", msg.slice(0, 120));
      return new Response(
        JSON.stringify({
          error: "AI request failed",
          detail: t.length > 300 ? `${t.slice(0, 297)}…` : t,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
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
