import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { getEmailRedirectUrl } from "../lib/authRedirect";
import { parseAuthCallbackUrl } from "../lib/parseAuthCallback";
import { supabase } from "../lib/supabase";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Call after opening the Supabase confirmation link so the app picks up verified status. */
  refreshUser: () => Promise<{ error?: string; verified?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function handleAuthUrl(url: string) {
      const tokens = parseAuthCallbackUrl(url);
      if (!tokens) return;

      if (tokens.access_token && tokens.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) console.warn("setSession from email link:", error.message);
        return;
      }

      if (tokens.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(tokens.code);
        if (error) console.warn("exchangeCodeForSession:", error.message);
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) void handleAuthUrl(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      void handleAuthUrl(url);
    });

    return () => sub.remove();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const emailRedirectTo = getEmailRedirectUrl();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName ?? "" },
          emailRedirectTo,
        },
      });
      return { error: error?.message };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshUser = useCallback(async () => {
    await supabase.auth.refreshSession();
    const { data, error } = await supabase.auth.getUser();
    if (error) return { error: error.message };
    if (!data.user) return { error: "No user" };
    setSession((prev) => {
      if (!prev) return prev;
      return { ...prev, user: data.user };
    });
    return { verified: Boolean(data.user.email_confirmed_at) };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      refreshUser,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, refreshUser, signIn, signUp, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
