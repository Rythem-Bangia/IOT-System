import * as Linking from "expo-linking";

/**
 * Returns Supabase `emailRedirectTo` so the confirmation link does not use
 * `localhost` on a physical device (phone's localhost ≠ your PC).
 *
 * Prefer:
 * - EXPO_PUBLIC_AUTH_REDIRECT_URL — HTTPS tunnel (ngrok) or production URL
 * - EXPO_PUBLIC_METRO_LAN_HOST — e.g. 192.168.1.41 (replaces localhost in dev URLs)
 */
export function getEmailRedirectUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL;
  if (explicit) return explicit.trim();

  let uri = Linking.createURL("/auth/callback");

  const lan = process.env.EXPO_PUBLIC_METRO_LAN_HOST?.trim();
  if (lan && (uri.includes("localhost") || uri.includes("127.0.0.1"))) {
    uri = uri.replace(/localhost/g, lan).replace(/127\.0\.0\.1/g, lan);
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (
    supabaseUrl &&
    (uri.includes("localhost") || uri.includes("127.0.0.1")) &&
    !lan
  ) {
    return `${supabaseUrl}/`;
  }

  return uri;
}

export { parseAuthCallbackUrl } from "./parseAuthCallback";
