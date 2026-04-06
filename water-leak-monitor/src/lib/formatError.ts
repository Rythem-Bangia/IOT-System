import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

/**
 * Supabase and other APIs often throw plain objects ({ message, code, details }).
 * `String(e)` becomes "[object Object]" — use this for user-visible messages.
 */
export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.length > 0) return msg;
    const details = o.details;
    const hint = o.hint;
    const code = o.code;
    const parts: string[] = [];
    if (typeof code === "string") parts.push(`[${code}]`);
    if (typeof details === "string" && details.length > 0) parts.push(details);
    if (typeof hint === "string" && hint.length > 0) parts.push(hint);
    if (parts.length > 0) return parts.join(" ");
    try {
      return JSON.stringify(e);
    } catch {
      return "Unknown error";
    }
  }
  if (typeof e === "string") return e;
  return String(e);
}

/**
 * `functions.invoke` sets `error` to FunctionsHttpError with a generic message.
 * Read the response body for `error`, `detail`, and `hint` from the edge function.
 */
export async function formatEdgeFunctionInvokeError(
  error: unknown,
  response?: Response | null,
): Promise<string> {
  if (error instanceof FunctionsFetchError) {
    const c = error.context;
    const inner =
      c instanceof Error
        ? c.message
        : typeof c === "object" &&
            c !== null &&
            "message" in c &&
            typeof (c as { message: unknown }).message === "string"
          ? (c as { message: string }).message
          : c != null
            ? String(c)
            : "";
    const connectivityHint =
      /network|fetch|connect|internet|offline|dns|ssl|tls|host/i.test(
        inner,
      )
        ? " Check Wi‑Fi/VPN, EXPO_PUBLIC_SUPABASE_URL (https://…supabase.co), and that this device can open HTTPS."
        : "";
    return inner
      ? `${error.message}: ${inner}${connectivityHint ? ` —${connectivityHint}` : ""}`
      : `${error.message}${connectivityHint ? `.${connectivityHint}` : ""}`;
  }

  const res =
    response ??
    (error instanceof FunctionsHttpError ? (error.context as Response) : null) ??
    (error instanceof FunctionsRelayError && error.context instanceof Response
      ? error.context
      : null);

  if (res && typeof res.clone === "function") {
    try {
      const clone = res.clone();
      const raw = (await clone.text()).trim();
      if (raw.length > 0) {
        try {
          const j = JSON.parse(raw) as {
            code?: string;
            message?: string;
            error?: string;
            detail?: string;
            hint?: string;
          };
          const parts = [j.error, j.message, j.detail, j.hint].filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          );
          if (parts.length > 0) {
            const head = `${parts.join(" — ")} (HTTP ${res.status})`;
            const notFound =
              j.code === "NOT_FOUND" ||
              /function was not found|not found/i.test(parts.join(" "));
            if (notFound) {
              return `${head}\n\nDeploy edge functions from your repo root (the folder that contains supabase/functions):\n  supabase login\n  supabase link --project-ref YOUR_PROJECT_REF\n  supabase functions deploy send-leak-alert\n  supabase functions deploy ai-hub\n\nSecrets: RESEND_API_KEY (and optional RESEND_FROM) for leak emails; PUTER_AUTH_TOKEN for ai-hub.`;
            }
            return head;
          }
          if (typeof j.code === "string" && j.code.length > 0) {
            return `[${j.code}] (HTTP ${res.status})`;
          }
        } catch {
          /* not JSON */
        }
        const short = raw.length > 500 ? `${raw.slice(0, 497)}…` : raw;
        return `${short} (HTTP ${res.status})`;
      }
      return `HTTP ${res.status} (no response body — check function deploy, Authorization header, and request body)`;
    } catch {
      // fall through
    }
  }

  return formatError(error);
}

/** Use in catch() after functions.invoke — surfaces JSON/text body from FunctionsHttpError. */
export async function formatFunctionsInvokeCatch(e: unknown): Promise<string> {
  if (e instanceof FunctionsFetchError) {
    return formatEdgeFunctionInvokeError(e, null);
  }
  if (e instanceof FunctionsHttpError && e.context instanceof Response) {
    return formatEdgeFunctionInvokeError(e, e.context);
  }
  if (e instanceof FunctionsRelayError) {
    if (e.context instanceof Response) {
      return formatEdgeFunctionInvokeError(e, e.context);
    }
    const c = e.context;
    const extra =
      c && typeof c === "object"
        ? JSON.stringify(c)
        : c != null
          ? String(c)
          : "";
    return extra ? `${e.message} — ${extra}` : e.message;
  }
  return formatError(e);
}
