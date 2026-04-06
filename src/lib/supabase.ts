import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;

const url = (
  extra?.supabaseUrl ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  ""
).trim();
const anon = (
  extra?.supabaseAnonKey ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  ""
).trim();

export const supabaseConfigured = Boolean(url && anon);
/** Anon key from env/extra (empty until configured). Edge `apikey` must match `createClient`’s key — use `functions.invoke`, not raw `fetch` with this alone. */
export const supabaseAnonKey = anon;

const safeUrl = url || "https://placeholder.supabase.co";

const safeAnon =
  anon ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const supabase = createClient(safeUrl, safeAnon, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
