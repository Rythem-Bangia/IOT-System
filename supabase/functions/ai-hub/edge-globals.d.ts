/**
 * Local types for the editor only. Lives next to index.ts (no ../ paths) so
 * `tsc`/VS Code resolve imports; Supabase runtime still loads the esm.sh URL in Deno.
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
