import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { getEmailRedirectUrl } from "../lib/authRedirect";
import { supabase } from "../lib/supabase";

const storageKey = (userId: string) =>
  `@water_leak/email_verify_banner_dismissed_${userId}`;

export function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const needsVerification = Boolean(user?.email && !user.email_confirmed_at);

  useEffect(() => {
    if (!user?.id || !needsVerification) {
      setDismissed(true);
      return;
    }
    AsyncStorage.getItem(storageKey(user.id)).then((v) => {
      setDismissed(v === "1");
    });
  }, [user?.id, needsVerification]);

  const dismiss = useCallback(async () => {
    if (!user?.id) return;
    await AsyncStorage.setItem(storageKey(user.id), "1");
    setDismissed(true);
  }, [user?.id]);

  const resend = useCallback(async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
        options: { emailRedirectTo: getEmailRedirectUrl() },
      });
      if (error) {
        Alert.alert("Could not resend", error.message);
      } else {
        Alert.alert(
          "Email sent",
          "Open the link, then use Refresh in Settings or below.",
        );
      }
    } finally {
      setSending(false);
    }
  }, [user?.email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { error, verified } = await refreshUser();
      if (error) Alert.alert("Could not refresh", error);
      else if (verified) Alert.alert("Verified", "Your email is confirmed.");
      else {
        Alert.alert(
          "Still pending",
          "Open the confirmation link from your inbox, then try again.",
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [refreshUser]);

  if (!needsVerification || dismissed) {
    return null;
  }

  return (
    <View className="border-b border-amber-800/40 bg-amber-950/55 px-4 py-3.5">
      <Text className="text-amber-50 font-bold text-sm mb-1">
        Verify your sign-in email
      </Text>
      <Text className="text-amber-100/75 text-xs mb-3 leading-[18px]">
        You stay logged in. After you tap the link in your mail app, refresh so the
        app updates (Settings has the same controls).
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Pressable
          onPress={resend}
          disabled={sending}
          className="bg-amber-500 px-3.5 py-2.5 rounded-xl active:opacity-90"
        >
          <Text className="text-amber-950 text-xs font-bold">
            {sending ? "Sending…" : "Resend email"}
          </Text>
        </Pressable>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          className="bg-slate-900/90 border border-amber-800/35 px-3.5 py-2.5 rounded-xl active:opacity-90"
        >
          <Text className="text-amber-100 text-xs font-bold">
            {refreshing ? "…" : "Refresh status"}
          </Text>
        </Pressable>
        <Pressable
          onPress={dismiss}
          className="bg-slate-950 border border-slate-700 px-3.5 py-2.5 rounded-xl active:opacity-90"
        >
          <Text className="text-slate-400 text-xs font-semibold">Later</Text>
        </Pressable>
      </View>
    </View>
  );
}
