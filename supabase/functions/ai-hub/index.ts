/// <reference path="./edge-globals.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/* ─────────────────────────────────────────────
 * Multi-provider LLM layer (all free tiers)
 *
 * Priority: GEMINI_API_KEY → GROQ_API_KEY → PUTER_AUTH_TOKEN
 *
 * Get a free key:
 *   Gemini : https://aistudio.google.com/apikey   (15 req/min, 1M tokens/day)
 *   Groq   : https://console.groq.com             (30 req/min free plan)
 *   Puter  : https://puter.com  → Account → token (fallback)
 *
 * Set as Supabase Edge secret:
 *   npx supabase@latest secrets set GEMINI_API_KEY=<key>
 * Optional: AI_MODEL to override the default model per provider.
 * ───────────────────────────────────────────── */

type LlmProvider = "gemini" | "groq" | "puter";
type ProviderEntry = { provider: LlmProvider; key: string };

/** Returns ALL configured providers in priority order (try each until one works). */
function allProviders(): ProviderEntry[] {
  const out: ProviderEntry[] = [];
  const gemini = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (gemini) out.push({ provider: "gemini", key: gemini });
  const groq = Deno.env.get("GROQ_API_KEY")?.trim();
  if (groq) out.push({ provider: "groq", key: groq });
  const puter = Deno.env.get("PUTER_AUTH_TOKEN")?.trim();
  if (puter) out.push({ provider: "puter", key: puter });
  return out;
}

function providerModel(provider: LlmProvider): string {
  const custom = Deno.env.get("AI_MODEL")?.trim();
  if (custom) return custom;
  switch (provider) {
    case "gemini": return "gemini-2.0-flash";
    case "groq":   return "llama-3.3-70b-versatile";
    case "puter":  return "gpt-4o-mini";
  }
}

const EDGE_LLM_HINT =
  "Set one of these free API keys as a Supabase Edge secret: GEMINI_API_KEY (aistudio.google.com/apikey), GROQ_API_KEY (console.groq.com), or PUTER_AUTH_TOKEN. Set multiple for automatic fallback.";

function llmBearer(): string | null {
  const providers = allProviders();
  return providers.length > 0 ? providers[0].key : null;
}

/* ── Gemini (Google) ── */

async function geminiChat(
  key: string, model: string, system: string, user: string,
  maxTokens: number, temperature: number,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`llm:${res.status}:${t.slice(0, 400)}`);
  }
  const j = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function geminiVision(
  key: string, model: string, system: string, instruction: string,
  dataUrl: string, maxTokens: number,
): Promise<string> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match?.[1] ?? "image/jpeg";
  const b64 = match?.[2] ?? dataUrl;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{
        role: "user",
        parts: [
          { text: instruction },
          { inlineData: { mimeType, data: b64 } },
        ],
      }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`llm:${res.status}:${t.slice(0, 400)}`);
  }
  const j = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

/* ── OpenAI-compatible (Groq / Puter) ── */

function openaiUrl(provider: LlmProvider): string {
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  return "https://api.puter.com/puterai/openai/v1/chat/completions";
}

async function openaiChat(
  apiUrl: string, key: string, model: string,
  system: string, user: string, maxTokens: number, temperature: number,
): Promise<string> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages: [{ role: "system", content: system }, { role: "user", content: user }],
      max_tokens: maxTokens, temperature,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`llm:${res.status}:${t.slice(0, 400)}`);
  }
  const j = await res.json() as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

async function openaiVision(
  apiUrl: string, key: string, model: string,
  system: string, instruction: string, dataUrl: string, maxTokens: number,
): Promise<string> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: dataUrl } },
        ]},
      ],
      max_tokens: maxTokens, temperature: 1,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`llm:${res.status}:${t.slice(0, 400)}`);
  }
  const j = await res.json() as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ── Unified interface with provider fallback + retry ── */

async function tryOneChat(
  provider: LlmProvider, key: string,
  system: string, user: string, maxTokens: number, temperature: number,
): Promise<string> {
  const model = providerModel(provider);
  if (provider === "gemini") return await geminiChat(key, model, system, user, maxTokens, temperature);
  return await openaiChat(openaiUrl(provider), key, model, system, user, maxTokens, temperature);
}

async function tryOneVision(
  provider: LlmProvider, key: string,
  system: string, instruction: string, dataUrl: string, maxTokens: number,
): Promise<string> {
  const model = providerModel(provider);
  if (provider === "gemini") return await geminiVision(key, model, system, instruction, dataUrl, maxTokens);
  return await openaiVision(openaiUrl(provider), key, model, system, instruction, dataUrl, maxTokens);
}

function isRetryable(msg: string): boolean {
  return /^llm:(429|5\d\d):/.test(msg);
}

async function llmChat(
  system: string, user: string, maxTokens: number, temperature: number,
): Promise<{ text: string; model: string }> {
  const providers = allProviders();
  if (providers.length === 0) throw new Error("NO_LLM");

  let lastError: Error | null = null;
  for (const { provider, key } of providers) {
    const model = providerModel(provider);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await tryOneChat(provider, key, system, user, maxTokens, temperature);
        if (text) return { text, model };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (isRetryable(lastError.message)) {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
          break; // move to next provider
        }
        break; // non-retryable → try next provider
      }
      // empty text — retry once
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 500)); continue; }
    }
    console.warn(`ai-hub: ${provider} failed, trying next provider…`);
  }

  if (lastError && !isRetryable(lastError.message)) throw lastError;
  throw new Error("EMPTY_COMPLETION");
}

async function llmVision(
  system: string, instruction: string, dataUrl: string, maxTokens: number,
): Promise<{ text: string; model: string }> {
  const providers = allProviders();
  if (providers.length === 0) throw new Error("NO_LLM");

  let lastError: Error | null = null;
  for (const { provider, key } of providers) {
    const model = providerModel(provider);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await tryOneVision(provider, key, system, instruction, dataUrl, maxTokens);
        if (text) return { text, model };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        if (isRetryable(lastError.message)) {
          if (attempt === 0) { await new Promise((r) => setTimeout(r, 800)); continue; }
          break;
        }
        break;
      }
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 500)); continue; }
    }
    console.warn(`ai-hub: ${provider} vision failed, trying next provider…`);
  }

  if (lastError && !isRetryable(lastError.message)) throw lastError;
  throw new Error("EMPTY_COMPLETION");
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_QUESTION = 500;
const MAX_NL_QUERY = 400;
const MAX_PHOTO_B64 = 1_200_000; // ~900KB binary

function json(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requireUserClient(
  req: Request,
): Promise<
  | { ok: false; res: Response }
  | { ok: true; userId: string; client: SupabaseClient }
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization")?.trim() ?? "";

  if (!supabaseUrl || !anonKey) {
    return { ok: false, res: json(500, { error: "Server misconfigured" }) };
  }
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  const accessToken = m?.[1]?.trim() ?? "";
  if (!accessToken) {
    return {
      ok: false,
      res: json(401, {
        error: "Unauthorized",
        hint: "Sign in and retry.",
      }),
    };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser(accessToken);

  if (userErr || !user?.id) {
    return {
      ok: false,
      res: json(401, {
        error: "Unauthorized",
        detail: userErr?.message,
        hint: "Sign out and sign in, or redeploy ai-hub with supabase/config.toml verify_jwt = false.",
      }),
    };
  }

  return { ok: true, userId: user.id, client };
}

type ReadingRow = { moisture_value: number; recorded_at: string; source: string };

function readingStats(rows: ReadingRow[]): {
  n: number; min: number; max: number; mean: number;
  stdev: number; maxJump: number; stuckLongest: number;
} {
  const vals = rows.map((r) => Number(r.moisture_value)).filter((x) => Number.isFinite(x));
  const n = vals.length;
  if (n === 0) return { n: 0, min: 0, max: 0, mean: 0, stdev: 0, maxJump: 0, stuckLongest: 0 };
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  let maxJump = 0;
  for (let i = 1; i < n; i++) maxJump = Math.max(maxJump, Math.abs(vals[i] - vals[i - 1]));
  let run = 1;
  let stuckLongest = 1;
  for (let i = 1; i < n; i++) {
    if (Math.abs(vals[i] - vals[i - 1]) < 0.5) { run++; stuckLongest = Math.max(stuckLongest, run); }
    else run = 1;
  }
  return {
    n, min, max,
    mean: Math.round(mean * 10) / 10,
    stdev: Math.round(stdev * 10) / 10,
    maxJump: Math.round(maxJump * 10) / 10,
    stuckLongest,
  };
}

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

function looksLikeMissingLeakEmailAuditColumn(msg: string): boolean {
  return /email_last_error|email_last_attempt_at|does not exist|schema cache/i.test(msg);
}

async function selectLeakEventsForOps(
  client: SupabaseClient, sinceIso: string, limit: number,
): Promise<{ ok: true; rows: Record<string, unknown>[] } | { ok: false; message: string }> {
  const extended = "id, zone_id, moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at, email_last_error";
  const basic = "id, zone_id, moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at";

  const ext = await client.from("leak_events").select(extended)
    .gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit);
  if (!ext.error) return { ok: true, rows: (ext.data ?? []) as Record<string, unknown>[] };
  if (!looksLikeMissingLeakEmailAuditColumn(ext.error.message ?? "")) return { ok: false, message: ext.error.message };

  const bas = await client.from("leak_events").select(basic)
    .gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit);
  if (bas.error) return { ok: false, message: bas.error.message };
  return { ok: true, rows: (bas.data ?? []).map((r) => ({ ...r, email_last_error: null as string | null })) };
}

type LeakTriageRow = {
  id: string; moisture_at_trigger: number; response_ms: number | null;
  created_at: string; resolved_at: string | null; email_sent_at: string | null;
  email_last_error?: string | null; zones: unknown;
};

async function selectLeakEventForTriage(
  client: SupabaseClient, leakId: string,
): Promise<{ ok: true; row: LeakTriageRow } | { ok: false; notFound?: boolean; message: string }> {
  const extended = "id, moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at, email_last_error, zones ( name, moisture_threshold, valve_open )";
  const basic = "id, moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at, zones ( name, moisture_threshold, valve_open )";

  let res = await client.from("leak_events").select(extended).eq("id", leakId).maybeSingle();
  if (res.error && looksLikeMissingLeakEmailAuditColumn(res.error.message ?? "")) {
    res = await client.from("leak_events").select(basic).eq("id", leakId).maybeSingle();
  }
  if (res.error) return { ok: false, message: res.error.message };
  if (!res.data) return { ok: false, notFound: true, message: "not found" };
  const row = res.data as LeakTriageRow;
  if (row.email_last_error === undefined) row.email_last_error = null;
  return { ok: true, row };
}

async function handleAction(
  action: string,
  body: Record<string, unknown>,
  client: SupabaseClient,
): Promise<Response> {
  const llmConfigured = llmBearer() !== null;

  try {
    switch (action) {
      case "zone_tips": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        let question = String(body.question ?? "").trim();
        if (question.length > MAX_QUESTION) question = question.slice(0, MAX_QUESTION);
        const { data: zone, error: zoneErr } = await client
          .from("zones")
          .select("id, name, moisture_threshold, last_moisture, valve_open, valve_closed_at")
          .eq("id", zoneId).maybeSingle();
        if (zoneErr) return json(500, { error: "Zone lookup failed", detail: zoneErr.message });
        if (!zone) return json(404, { error: "Zone not found" });
        const { data: events } = await client
          .from("leak_events")
          .select("moisture_at_trigger, response_ms, created_at")
          .eq("zone_id", zoneId).order("created_at", { ascending: false }).limit(5);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const lastM = zone.last_moisture == null ? "unknown" : String(Math.round(Number(zone.last_moisture)));
        const thr = Math.round(Number(zone.moisture_threshold));
        const valve = zone.valve_open ? "open" : "closed";
        const eventLines = (events ?? []).map((e) => {
          const em = Math.round(Number(e.moisture_at_trigger));
          const ms = e.response_ms == null ? "—" : String(e.response_ms);
          const when = e.created_at ? String(e.created_at).slice(0, 19) : "—";
          return `- ${when}: moisture ${em}%, response ${ms} ms`;
        });
        const context = [
          `Zone: ${zone.name}`, `Moisture threshold: ${thr}%`, `Last stored moisture: ${lastM}%`, `Valve: ${valve}`,
          eventLines.length ? `Recent leak events (newest first):\n${eventLines.join("\n")}` : "No recent leak events in history.",
          question ? `User question: ${question}` : "User did not ask a specific question — give brief maintenance and interpretation tips for this snapshot.",
        ].join("\n");
        const { text, model: mo } = await llmChat(
          `You are a concise home water-safety assistant for a leak monitor app.\nYou only explain based on zone data provided. Not a plumber or insurer. Under 250 words.\nSuggest professional help when appropriate; never claim certainty about hidden pipe damage.`,
          context, 700, 0.45,
        );
        return json(200, { reply: text, model: mo });
      }

      case "moisture_hint": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const rawM = Number(body.moisture);
        if (!Number.isFinite(rawM)) return json(400, { error: "moisture must be a number" });
        const moisture = Math.round(Math.max(0, Math.min(100, rawM)));
        const { data: zone, error: zoneErr } = await client
          .from("zones").select("id, name, moisture_threshold, last_moisture, valve_open")
          .eq("id", zoneId).maybeSingle();
        if (zoneErr) return json(500, { error: "Zone lookup failed", detail: zoneErr.message });
        if (!zone) return json(404, { error: "Zone not found" });
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const thr = Math.round(Number(zone.moisture_threshold));
        const last = zone.last_moisture == null ? "unknown" : String(Math.round(Number(zone.last_moisture)));
        const valve = zone.valve_open ? "open" : "closed";
        const userContent = [
          `Zone name: ${zone.name}`, `Threshold: ${thr}%`, `Valve currently: ${valve}`,
          `Last stored moisture in cloud: ${last}%`, `Hypothetical / slider reading to explain: ${moisture}%`,
        ].join("\n");
        const { text, model: mo } = await llmChat(
          `Explain a hypothetical moisture reading for a home leak monitor (may be simulation).\nCompare to threshold and valve. 3–5 short sentences. Not a plumber; do not claim real flooding.`,
          userContent, 400, 0.45,
        );
        return json(200, { reply: text, model: mo });
      }

      case "history_summary": {
        const days = Math.min(90, Math.max(1, Math.round(Number(body.days) || 30)));
        const zoneFilter = typeof body.zone_id === "string" && body.zone_id.trim().length > 0 ? body.zone_id.trim() : null;
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - days);
        let q = client.from("leak_events")
          .select("moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at, zone_id, zones ( name )")
          .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(120);
        if (zoneFilter) q = q.eq("zone_id", zoneFilter);
        const { data: rawRows, error: leakErr } = await q;
        if (leakErr) return json(500, { error: "History lookup failed", detail: leakErr.message });
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const rows = (rawRows ?? []) as LeakRow[];
        const n = rows.length;
        const moistures = rows.map((r) => Number(r.moisture_at_trigger));
        const maxM = moistures.length ? Math.max(...moistures) : 0;
        const responses = rows.map((r) => r.response_ms).filter((x): x is number => x != null && !Number.isNaN(x));
        const avgMs = responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length) : null;
        const emailed = rows.filter((r) => r.email_sent_at).length;
        const unresolved = rows.filter((r) => !r.resolved_at).length;
        const lines = rows.slice(0, 25).map((r) => {
          const zn = zoneNameFromRow(r);
          return `${String(r.created_at).slice(0, 19)} | ${zn} | ${Math.round(Number(r.moisture_at_trigger))}% | ${r.response_ms == null ? "—" : String(r.response_ms)} ms | ${r.email_sent_at ? "email ok" : "no email"} | ${r.resolved_at ? "resolved" : "not reset"}`;
        });
        const stats = [
          `Window: last ${days} days${zoneFilter ? " (zone filter)" : " (all zones)"}.`,
          `Event count: ${n}.`,
          n > 0 ? `Peak moisture at trigger: ${maxM}%. Avg response time: ${avgMs ?? "—"} ms.` : "",
          n > 0 ? `Emails sent: ${emailed}/${n}. Unresolved: ${unresolved}.` : "",
          n > 0 ? "Recent events:\n" + lines.join("\n") : "No events in this period.",
        ].filter(Boolean).join("\n");
        const { text, model: mo } = await llmChat(
          `Summarize leak monitor history for a homeowner. Concise bullets or two short paragraphs.\nUse only provided data. Not a plumber.`,
          stats, 650, 0.4,
        );
        return json(200, { reply: text, model: mo });
      }

      case "leak_triage": {
        const leakId = String(body.leak_event_id ?? "").trim();
        if (!leakId) return json(400, { error: "leak_event_id required" });
        const picked = await selectLeakEventForTriage(client, leakId);
        if (!picked.ok) {
          if (picked.notFound) return json(404, { error: "Leak event not found" });
          return json(500, { error: "Lookup failed", detail: picked.message });
        }
        const row = picked.row;
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const z = row.zones as { name?: string; moisture_threshold?: number; valve_open?: boolean } | null;
        const ctx = JSON.stringify({
          zone: z?.name, threshold: z?.moisture_threshold, valve_open: z?.valve_open,
          moisture_at_trigger: row.moisture_at_trigger, response_ms: row.response_ms,
          created_at: row.created_at, resolved: Boolean(row.resolved_at),
          email_sent: Boolean(row.email_sent_at), email_error: row.email_last_error ?? null,
        });
        const { text, model: mo } = await llmChat(
          `You help a homeowner triage after ONE logged leak event from an IoT monitor.\nOutput: short checklist (inspect area, check sensor placement, when to reset valve in app, when to call a pro).\nNot medical/legal/plumbing diagnosis; practical safety-first steps only.`,
          ctx, 550, 0.4,
        );
        return json(200, { reply: text, model: mo });
      }

      case "setup_copilot": {
        const uid = (await client.auth.getUser()).data.user?.id;
        if (!uid) return json(401, { error: "Unauthorized" });
        const { data: profile } = await client.from("profiles").select("email, alert_email, full_name").eq("id", uid).maybeSingle();
        const { data: zones } = await client.from("zones").select("name, moisture_threshold, valve_open, last_moisture").limit(8);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const ctx = [
          `Profile: alert_email set: ${Boolean(profile?.alert_email?.trim())}`,
          `Sign-in email on file: ${profile?.email ?? "—"}`,
          `Zones (${(zones ?? []).length}):`,
          ...(zones ?? []).map((z) => `- ${z.name}: threshold ${z.moisture_threshold}%, valve ${z.valve_open ? "open" : "closed"}, last moisture ${z.last_moisture ?? "—"}`),
          "Guide the user through: confirm email, set leak alert email in Settings, open Monitor to ensure zone+device exist, deploy send-leak-alert + RESEND_API_KEY if emails fail.",
        ].join("\n");
        const { text, model: mo } = await llmChat(
          `You are an onboarding copilot for a Supabase-backed water leak monitor app.\nGive numbered next steps tailored to the checklist data. Short and actionable.`,
          ctx, 600, 0.35,
        );
        return json(200, { reply: text, model: mo });
      }

      case "sensor_health": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: readings, error } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at, source").eq("zone_id", zoneId)
          .order("recorded_at", { ascending: false }).limit(100);
        if (error) return json(500, { error: "Readings lookup failed", detail: error.message });
        const rows = (readings ?? []) as ReadingRow[];
        const stats = readingStats(rows);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Interpret sensor reading statistics for a moisture monitor. Mention stuck/repeating values, variance, and whether more data is needed.\nNot a guarantee of hardware failure — suggest checks and recalibration.`,
          `Stats (newest-first window, up to 100 rows): ${JSON.stringify(stats)}`, 500, 0.35,
        );
        return json(200, { reply: text, model: mo, stats });
      }

      case "anomaly_narrative": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: readings, error } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at, source").eq("zone_id", zoneId)
          .order("recorded_at", { ascending: false }).limit(100);
        if (error) return json(500, { error: "Readings lookup failed", detail: error.message });
        const rows = (readings ?? []) as ReadingRow[];
        const stats = readingStats(rows);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Explain anomalies (spikes, flatlines, source mix) in plain language for a homeowner.\nUse only the JSON stats; if n is small say the pattern is inconclusive.`,
          JSON.stringify(stats), 500, 0.4,
        );
        return json(200, { reply: text, model: mo, stats });
      }

      case "threshold_suggest": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: zone } = await client.from("zones").select("name, moisture_threshold").eq("id", zoneId).maybeSingle();
        if (!zone) return json(404, { error: "Zone not found" });
        const { data: readings, error } = await client.from("sensor_readings")
          .select("moisture_value").eq("zone_id", zoneId).order("recorded_at", { ascending: false }).limit(200);
        if (error) return json(500, { error: "Readings lookup failed", detail: error.message });
        const vals = (readings ?? []).map((r) => Number(r.moisture_value)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
        let p90 = 0;
        if (vals.length > 0) p90 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))];
        const currentThr = Math.round(Number(zone.moisture_threshold));
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Suggest a moisture threshold (0–100) for leak warnings based on percentile stats.\nCurrent threshold is informational. Output: suggested numeric range + 2 sentences why. User must confirm in app.`,
          JSON.stringify({ zone: zone.name, current_threshold: currentThr, sample_size: vals.length, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, approx_p90: vals.length ? Math.round(p90) : null }),
          450, 0.3,
        );
        return json(200, { reply: text, model: mo, stats: { sample_size: vals.length, approx_p90: vals.length ? Math.round(p90) : null, current_threshold: currentThr } });
      }

      case "notification_copy": {
        const zoneName = String(body.zone_name ?? "Zone").trim() || "Zone";
        const moisture = Math.round(Math.max(0, Math.min(100, Number(body.moisture) || 0)));
        const responseMs = body.response_ms == null || body.response_ms === "" ? null : Math.round(Number(body.response_ms));
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Write 2–3 very short lines suitable for SMS or push (no emojis spam). Leak alert for smart home monitor. Include zone and moisture.`,
          `Zone: ${zoneName}\nMoisture at trigger: ${moisture}%\nResponse ms: ${responseMs ?? "—"}`, 200, 0.5,
        );
        return json(200, { reply: text, model: mo });
      }

      case "history_nl_query": {
        let nq = String(body.query ?? "").trim();
        if (!nq) return json(400, { error: "query required" });
        if (nq.length > MAX_NL_QUERY) nq = nq.slice(0, MAX_NL_QUERY);
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 90);
        const { data: rawRows, error } = await client.from("leak_events")
          .select("moisture_at_trigger, response_ms, created_at, resolved_at, email_sent_at, zones ( name )")
          .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(80);
        if (error) return json(500, { error: "History lookup failed", detail: error.message });
        const rows = (rawRows ?? []) as LeakRow[];
        const lines = rows.map((r) => {
          const zn = zoneNameFromRow(r);
          return `${String(r.created_at).slice(0, 19)} | ${zn} | ${Math.round(Number(r.moisture_at_trigger))}% | ${r.resolved_at ? "resolved" : "open"}`;
        });
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Answer the user's question using ONLY the event list below. If the data does not support an answer, say so.\nDo not invent leaks or zones.`,
          `Question: ${nq}\n\nEvents (newest first, up to 80):\n${lines.length ? lines.join("\n") : "(none)"}`, 600, 0.25,
        );
        return json(200, { reply: text, model: mo });
      }

      case "photo_assist": {
        const b64 = String(body.image_base64 ?? "").trim();
        const mime = String(body.mime_type ?? "image/jpeg").trim() || "image/jpeg";
        if (!b64) return json(400, { error: "image_base64 required" });
        if (b64.length > MAX_PHOTO_B64) return json(400, { error: "Image too large", hint: "Resize or lower quality before upload." });
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const dataUrl = `data:${mime};base64,${b64}`;
        const { text, model: mo } = await llmVision(
          `You help interpret a homeowner photo that may show water staining, pipes, or a sensor area.\nGive non-diagnostic suggestions: what to inspect, safety, when to call a professional.\nNever claim legal/insurance/medical facts. If image is unclear, say so.`,
          "What should the homeowner check next regarding possible water damage or monitoring placement?",
          dataUrl, 550,
        );
        return json(200, { reply: text, model: mo });
      }

      case "alert_fatigue": {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 14);
        const { data: rawRows, error } = await client.from("leak_events")
          .select("created_at, zone_id, resolved_at").gte("created_at", since.toISOString())
          .order("created_at", { ascending: false }).limit(200);
        if (error) return json(500, { error: "Lookup failed", detail: error.message });
        const rows = (rawRows ?? []) as { created_at: string; zone_id: string; resolved_at: string | null }[];
        const byDay: Record<string, number> = {};
        for (const r of rows) { const d = String(r.created_at).slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1; }
        const stats = { window_days: 14, total_events: rows.length, by_day: byDay, unresolved: rows.filter((r) => !r.resolved_at).length };
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Explain alert fatigue risk for repeated leak notifications. Suggest deduping habits, threshold review, and sensor placement — based only on JSON stats.`,
          JSON.stringify(stats), 500, 0.35,
        );
        return json(200, { reply: text, model: mo, stats });
      }

      case "false_positive": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const proposed = body.moisture == null || body.moisture === "" ? null : Math.round(Math.max(0, Math.min(100, Number(body.moisture))));
        const { data: zone } = await client.from("zones").select("moisture_threshold, last_moisture").eq("id", zoneId).maybeSingle();
        if (!zone) return json(404, { error: "Zone not found" });
        const { data: readings } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at").eq("zone_id", zoneId).order("recorded_at", { ascending: false }).limit(12);
        const fpRows = (readings ?? []) as { moisture_value: number; recorded_at: string }[];
        const vals = fpRows.map((r) => Number(r.moisture_value));
        let score = 50;
        if (vals.length >= 2) {
          const jump = Math.abs(vals[0] - vals[1]);
          if (jump > 40) score += 25;
          if (jump < 3 && vals.length >= 4 && vals.slice(0, 4).every((v) => Math.abs(v - vals[0]) < 2)) score -= 15;
        }
        const thr = Number(zone.moisture_threshold);
        const fm = proposed ?? (zone.last_moisture != null ? Number(zone.last_moisture) : null);
        if (fm != null && fm >= thr) score += 10;
        score = Math.max(0, Math.min(100, Math.round(score)));
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `A heuristic score (0–100) estimates false-positive likelihood for a moisture leak trigger (higher = more likely false alarm / condensation / glitch).\nExplain the score briefly; you are not certain.`,
          JSON.stringify({ heuristic_score: score, threshold: thr, last_readings: vals.slice(0, 8), proposed_or_last_moisture: fm }),
          450, 0.35,
        );
        return json(200, { reply: text, model: mo, score, stats: { readings_used: vals.length } });
      }

      case "maintenance_memory": {
        const note = String(body.note ?? "").trim().slice(0, 400);
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 365);
        const { data: rawRows, error } = await client.from("leak_events")
          .select("created_at, moisture_at_trigger, resolved_at, zones ( name )")
          .gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(25);
        if (error) return json(500, { error: "Lookup failed", detail: error.message });
        const rows = (rawRows ?? []) as LeakRow[];
        const lines = rows.map((r) => `${String(r.created_at).slice(0, 10)} ${zoneNameFromRow(r)} ${Math.round(Number(r.moisture_at_trigger))}% ${r.resolved_at ? "ok" : "pending"}`);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Summarize maintenance memory: recurring patterns, seasonal hints, reminders to reset valve after repairs.\nUse only the event lines and optional user note.`,
          `User note: ${note || "(none)"}\nPast year events (newest first):\n${lines.length ? lines.join("\n") : "(none)"}`, 600, 0.35,
        );
        return json(200, { reply: text, model: mo });
      }

      case "simulate_analysis": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: zone } = await client.from("zones")
          .select("name, moisture_threshold, last_moisture, valve_open, valve_closed_at")
          .eq("id", zoneId).maybeSingle();
        if (!zone) return json(404, { error: "Zone not found" });
        const simResult = body.simulation_result as Record<string, unknown> | undefined;
        const { data: recentReadings } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at, source").eq("zone_id", zoneId)
          .order("recorded_at", { ascending: false }).limit(20);
        const { data: recentLeaks } = await client.from("leak_events")
          .select("moisture_at_trigger, response_ms, created_at, resolved_at")
          .eq("zone_id", zoneId).order("created_at", { ascending: false }).limit(10);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const saReadings = (recentReadings ?? []) as ReadingRow[];
        const stats = readingStats(saReadings);
        const sources = new Set(saReadings.map((r) => r.source));
        const leaks = (recentLeaks ?? []) as { moisture_at_trigger: number; response_ms: number | null; created_at: string; resolved_at: string | null }[];
        const unresolvedCount = leaks.filter((l) => !l.resolved_at).length;
        const respTimes = leaks.map((l) => l.response_ms).filter((v): v is number => v != null && Number.isFinite(v));
        const avgMs = respTimes.length ? Math.round(respTimes.reduce((a, b) => a + b, 0) / respTimes.length) : null;
        const ctx = JSON.stringify({
          zone_name: zone.name, threshold: zone.moisture_threshold, last_moisture: zone.last_moisture,
          valve_open: zone.valve_open, valve_closed_at: zone.valve_closed_at, sensor_sources: [...sources],
          sensor_stats: stats, recent_leaks: leaks.slice(0, 5).map((l) => ({ moisture: l.moisture_at_trigger, response_ms: l.response_ms, created_at: l.created_at, resolved: Boolean(l.resolved_at) })),
          unresolved_leaks: unresolvedCount, avg_response_ms: avgMs, simulation_result: simResult ?? null,
        });
        const { text, model: mo } = await llmChat(
          `You are an IoT water leak monitor analysis assistant. Analyze the simulation or sensor test results.\nCover: 1) system response correctness 2) threshold assessment 3) sensor reliability 4) email status 5) recommendations.\nIf only virtual data exists, note physical testing is recommended. Under 300 words. Not a plumber or insurer.`,
          ctx, 800, 0.4,
        );
        return json(200, { reply: text, model: mo, stats });
      }

      case "emergency_checklist": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: zone } = await client.from("zones")
          .select("name, moisture_threshold, last_moisture, valve_open")
          .eq("id", zoneId).maybeSingle();
        if (!zone) return json(404, { error: "Zone not found" });
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const simResult = body.simulation_result as Record<string, unknown> | undefined;
        const ctx = JSON.stringify({
          zone_name: zone.name, threshold: zone.moisture_threshold,
          last_moisture: zone.last_moisture, valve_open: zone.valve_open,
          simulation_result: simResult ?? null,
        });
        const { text, model: mo } = await llmChat(
          `You are an IoT emergency response assistant. A water leak has been detected.\nGenerate a concise numbered emergency checklist (5-8 steps) tailored to this specific zone/room.\nInclude: immediate safety steps, damage prevention, who to contact, what to document, and follow-up actions.\nBe practical and specific to the zone name and moisture level. Under 250 words.`,
          ctx, 600, 0.3,
        );
        return json(200, { reply: text, model: mo });
      }

      case "predictive_risk": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: zone } = await client.from("zones")
          .select("name, moisture_threshold, last_moisture, valve_open, valve_closed_at")
          .eq("id", zoneId).maybeSingle();
        if (!zone) return json(404, { error: "Zone not found" });
        const simResult = body.simulation_result as Record<string, unknown> | undefined;
        const { data: recentReadings } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at, source").eq("zone_id", zoneId)
          .order("recorded_at", { ascending: false }).limit(30);
        const { data: recentLeaks } = await client.from("leak_events")
          .select("moisture_at_trigger, response_ms, created_at, resolved_at")
          .eq("zone_id", zoneId).order("created_at", { ascending: false }).limit(15);
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const leaks = (recentLeaks ?? []) as { moisture_at_trigger: number; response_ms: number | null; created_at: string; resolved_at: string | null }[];
        const readings = (recentReadings ?? []) as ReadingRow[];
        const stats = readingStats(readings);
        const ctx = JSON.stringify({
          zone_name: zone.name, threshold: zone.moisture_threshold,
          last_moisture: zone.last_moisture, valve_open: zone.valve_open,
          valve_closed_at: zone.valve_closed_at, sensor_stats: stats,
          leak_history: leaks.slice(0, 10).map((l) => ({
            moisture: l.moisture_at_trigger, response_ms: l.response_ms,
            created_at: l.created_at, resolved: Boolean(l.resolved_at),
          })),
          total_leaks: leaks.length,
          unresolved: leaks.filter((l) => !l.resolved_at).length,
          simulation_result: simResult ?? null,
        });
        const { text, model: mo } = await llmChat(
          `You are an IoT risk prediction assistant. Based on the leak data and sensor trends:\n1) Assign a risk severity: LOW / MEDIUM / HIGH / CRITICAL with a brief reason\n2) Estimate potential water damage if undetected (e.g. liters, floor damage, cost range)\n3) Evaluate the system response time — was the valve closure fast enough?\n4) Predict likelihood of recurring leaks based on the pattern\n5) Suggest 2-3 preventive measures specific to this zone\nBe concrete with numbers. Under 300 words.`,
          ctx, 800, 0.4,
        );
        return json(200, { reply: text, model: mo });
      }

      case "pi_compare": {
        const zoneId = String(body.zone_id ?? "").trim();
        if (!zoneId) return json(400, { error: "zone_id required" });
        const { data: zone } = await client.from("zones")
          .select("name, moisture_threshold, last_moisture, valve_open")
          .eq("id", zoneId).maybeSingle();
        if (!zone) return json(404, { error: "Zone not found" });
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });

        const { data: physicalReadings } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at, source").eq("zone_id", zoneId)
          .eq("source", "physical")
          .order("recorded_at", { ascending: false }).limit(20);
        const { data: virtualReadings } = await client.from("sensor_readings")
          .select("moisture_value, recorded_at, source").eq("zone_id", zoneId)
          .eq("source", "virtual")
          .order("recorded_at", { ascending: false }).limit(20);

        const phys = (physicalReadings ?? []) as ReadingRow[];
        const virt = (virtualReadings ?? []) as ReadingRow[];
        const physStats = readingStats(phys);
        const virtStats = readingStats(virt);

        const ctx = JSON.stringify({
          zone_name: zone.name, threshold: zone.moisture_threshold,
          physical: { count: phys.length, stats: physStats, recent: phys.slice(0, 10).map((r) => ({ value: r.moisture_value, at: r.recorded_at })) },
          virtual: { count: virt.length, stats: virtStats, recent: virt.slice(0, 10).map((r) => ({ value: r.moisture_value, at: r.recorded_at })) },
        });
        const { text, model: mo } = await llmChat(
          `You are an IoT sensor data analyst. Compare physical Raspberry Pi sensor readings vs virtual simulation readings for this zone.\nAnalyze:\n1) Data volume — are there enough physical readings?\n2) Value comparison — do physical and virtual readings agree? Any systematic offset?\n3) Calibration — does the physical sensor need recalibration based on patterns?\n4) Reliability — which source is more consistent? Any stuck or noisy readings?\n5) Recommendation — should the threshold be adjusted for the physical sensor?\nBe specific with numbers. Under 300 words.`,
          ctx, 800, 0.4,
        );
        return json(200, { reply: text, model: mo });
      }

      case "ops_summary": {
        const days = Math.min(90, Math.max(1, Math.round(Number(body.days) || 14)));
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - days);
        const picked = await selectLeakEventsForOps(client, since.toISOString(), 150);
        if (!picked.ok) return json(500, { error: "Lookup failed", detail: picked.message });
        const rows = picked.rows;
        if (!llmConfigured) return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
        const { text, model: mo } = await llmChat(
          `Produce a terse developer/ops incident summary: counts, email failure hints, latency outliers, unresolved backlog.\nAudience: engineer maintaining Supabase + Edge Functions.`,
          JSON.stringify({ days, count: rows.length, sample: rows.slice(0, 40) }), 700, 0.25,
        );
        return json(200, { reply: text, model: mo });
      }

      default:
        return json(400, {
          error: "Unknown action",
          hint: "Valid actions: zone_tips, moisture_hint, history_summary, leak_triage, setup_copilot, sensor_health, anomaly_narrative, threshold_suggest, notification_copy, history_nl_query, photo_assist, alert_fatigue, false_positive, maintenance_memory, simulate_analysis, emergency_checklist, predictive_risk, pi_compare, ops_summary",
        });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "NO_LLM") {
      return json(503, { error: "AI not configured", hint: EDGE_LLM_HINT });
    }
    if (msg === "EMPTY_COMPLETION") {
      return json(502, {
        error: "AI returned an empty response",
        hint: "The model returned no text after retries. Try again. If it persists, check your API key (GEMINI_API_KEY, GROQ_API_KEY, or PUTER_AUTH_TOKEN).",
      });
    }
    if (msg.startsWith("llm:")) {
      return json(502, { error: "AI request failed", detail: msg.replace(/^llm:\d+:/, "").slice(0, 400) });
    }
    console.error("ai-hub:", msg);
    return json(500, { error: "AI hub error", detail: msg.slice(0, 200) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const auth = await requireUserClient(req);
  if (!auth.ok) return auth.res;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!action) return json(400, { error: "action required" });

  return await handleAction(action, body, auth.client);
});
