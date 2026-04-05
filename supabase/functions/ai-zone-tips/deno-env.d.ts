/**
 * Supabase Edge Functions run on Deno. This file supplies globals for the TypeScript
 * language service in editors that are not using the Deno extension.
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
