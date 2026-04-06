import { formatEdgeFunctionInvokeError } from "./formatError";
import { supabase } from "./supabase";

export type AiHubResult = {
  reply: string;
  model?: string;
  stats?: unknown;
  score?: number;
};

/**
 * Cloud AI → `ai-hub`. Uses `functions.invoke` so `apikey` + session JWT match `createClient`.
 *
 * Hosted **Invalid JWT** at the gateway is prevented by `supabase/config.toml`:
 *   [functions.ai-hub]
 *   verify_jwt = false
 * Redeploy after any config change: `npm run deploy:ai-hub`
 *
 * Puter: Edge secret `PUTER_AUTH_TOKEN` (puter.com dashboard).
 */
export async function invokeAiHub(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<AiHubResult> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new Error(
      "Session invalid or expired. Sign out, sign in again, then retry Cloud AI.",
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sign in to use cloud AI.");
  }

  const exp = session.expires_at;
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp != null && exp < nowSec + 300) {
    await supabase.auth.refreshSession();
  }

  const invoke = () =>
    supabase.functions.invoke("ai-hub", {
      body: { action, ...payload },
    });

  let { data, error, response } = await invoke();

  for (let i = 0; i < 2 && error && response?.status === 401; i++) {
    await supabase.auth.refreshSession();
    ({ data, error, response } = await invoke());
  }

  if (error) {
    const msg = await formatEdgeFunctionInvokeError(error, response);
    if (response?.status === 401 || /invalid jwt/i.test(msg)) {
      throw new Error(
        `${msg}\n\nFix: from repo root run \`npm run deploy:ai-hub\` so Supabase applies supabase/config.toml (verify_jwt = false for ai-hub). Then reload the app. If it persists, sign out and sign in.`,
      );
    }
    throw new Error(msg);
  }

  const d = data as {
    reply?: string;
    error?: string;
    hint?: string;
    model?: string;
    stats?: unknown;
    score?: number;
  };

  if (d?.error) {
    const line = [d.error, d.hint].filter(Boolean).join(" — ");
    if (String(d.error).toLowerCase().includes("unauthorized")) {
      throw new Error(
        `${line}\n\nSign out and back in; app Supabase URL must match the project where ai-hub is deployed.`,
      );
    }
    throw new Error(line);
  }
  if (!d?.reply) {
    throw new Error(
      "Cloud AI returned no text. The model may have produced an empty response — try again.",
    );
  }

  return {
    reply: d.reply,
    model: d.model,
    stats: d.stats,
    score: d.score,
  };
}
