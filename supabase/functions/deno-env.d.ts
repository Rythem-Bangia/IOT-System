/**
 * Optional: for local editors only. Do NOT use /// <reference path="../deno-env.d.ts" />
 * in index.ts — Supabase’s deploy bundler can fail resolving parent paths.
 * Deno at runtime already provides `Deno` on Edge Functions.
 */
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };

  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.49.1" {
  export { createClient } from "@supabase/supabase-js";
  export type { SupabaseClient } from "@supabase/supabase-js";
}
