/**
 * Runs `supabase functions deploy ai-hub` after checking CLI auth.
 * Auth: `npm run supabase:login` or env SUPABASE_ACCESS_TOKEN.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

function sh(cmd) {
  return spawnSync(cmd, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const check = sh("npx --yes supabase@latest projects list");
if (check.status !== 0) {
  console.error(`
Supabase CLI is not authenticated (this is separate from your app .env keys).

Do ONE of the following:

  A) Browser login (recommended, one-time on this Mac):
       npm run supabase:login

  B) Access token (good for scripts / CI):
       Open https://supabase.com/dashboard/account/tokens
       Generate a token, then in this terminal:
       export SUPABASE_ACCESS_TOKEN="<your-token-here>"

Then link this repo to your project (once):

       npm run supabase:link

Then deploy:

       npm run deploy:ai-hub
`);
  process.exit(1);
}

const deploy = spawnSync("npx --yes supabase@latest functions deploy ai-hub", {
  cwd: root,
  shell: true,
  stdio: "inherit",
});
process.exit(deploy.status === 0 ? 0 : deploy.status ?? 1);
