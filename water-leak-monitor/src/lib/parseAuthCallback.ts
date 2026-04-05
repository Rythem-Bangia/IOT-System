/**
 * Parses Supabase auth redirect URLs (implicit flow hash tokens or PKCE `code`).
 * Pure — safe for unit tests without Expo.
 */
export function parseAuthCallbackUrl(url: string): {
  access_token?: string;
  refresh_token?: string;
  code?: string;
} | null {
  try {
    const hashIdx = url.indexOf("#");
    if (hashIdx !== -1) {
      const hash = url.slice(hashIdx + 1);
      const q = new URLSearchParams(hash);
      const access_token = q.get("access_token") ?? undefined;
      const refresh_token = q.get("refresh_token") ?? undefined;
      if (access_token && refresh_token) {
        return { access_token, refresh_token };
      }
    }
    const qIdx = url.indexOf("?");
    if (qIdx !== -1) {
      const search = url.slice(qIdx + 1).split("#")[0];
      const q = new URLSearchParams(search);
      const code = q.get("code");
      if (code) return { code };
    }
  } catch {
    return null;
  }
  return null;
}
