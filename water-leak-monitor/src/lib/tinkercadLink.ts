import AsyncStorage from "@react-native-async-storage/async-storage";

/** Tinkercad Circuits editor entry (virtual Arduino / simulation). */
export const TINKERCAD_CIRCUITS_HOME = "https://www.tinkercad.com/circuits";

export function circuitUrlStorageKey(userId: string) {
  return `tinkercad_circuit_url_${userId}`;
}

export async function getSavedCircuitUrl(userId: string): Promise<string> {
  return (await AsyncStorage.getItem(circuitUrlStorageKey(userId)))?.trim() ?? "";
}

export async function setSavedCircuitUrl(userId: string, url: string): Promise<void> {
  const t = url.trim();
  if (!t) {
    await AsyncStorage.removeItem(circuitUrlStorageKey(userId));
    return;
  }
  await AsyncStorage.setItem(circuitUrlStorageKey(userId), t);
}

export function parseHttpUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
