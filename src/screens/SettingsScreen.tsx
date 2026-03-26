import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { useAuth } from "../context/AuthContext";
import { getEmailRedirectUrl } from "../lib/authRedirect";
import { formatError } from "../lib/formatError";
import { fetchProfile, fetchZones, updateProfileAlertEmail } from "../lib/iot";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { brand } from "../theme/brand";

export function SettingsScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { signOut, user, refreshUser } = useAuth();
  const [alertEmail, setAlertEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [refreshingVerify, setRefreshingVerify] = useState(false);
  const [deviceSecret, setDeviceSecret] = useState<string | null>(null);

  const signInEmail = user?.email?.trim() ?? "";
  const emailVerified = Boolean(user?.email_confirmed_at);

  const load = useCallback(async () => {
    const p = await fetchProfile();
    if (p?.alert_email) setAlertEmail(p.alert_email);
    const zones = await fetchZones();
    if (zones[0]?.devices?.device_secret) {
      setDeviceSecret(zones[0].devices.device_secret);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function saveEmail() {
    setSaving(true);
    try {
      await updateProfileAlertEmail(alertEmail.trim());
      Alert.alert(
        "Saved",
        "Leak alerts will use this address when the server can send mail.",
      );
    } catch (e) {
      Alert.alert("Error", formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    if (!signInEmail) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: signInEmail,
        options: { emailRedirectTo: getEmailRedirectUrl() },
      });
      if (error) Alert.alert("Could not resend", error.message);
      else {
        Alert.alert(
          "Email sent",
          "Open the link in your mail app, then tap “Refresh verification status” below so the app updates.",
        );
      }
    } finally {
      setResending(false);
    }
  }

  async function onRefreshVerification() {
    setRefreshingVerify(true);
    try {
      const { error, verified } = await refreshUser();
      if (error) {
        Alert.alert("Could not refresh", error);
        return;
      }
      if (verified) {
        Alert.alert("Verified", "Your sign-in email is now confirmed.");
      } else {
        Alert.alert(
          "Still pending",
          "If you already opened the link, wait a moment and try again. Check spam and that the link opened in this app’s redirect URL.",
        );
      }
    } finally {
      setRefreshingVerify(false);
    }
  }

  function useSignInEmailForAlerts() {
    if (!signInEmail) return;
    setAlertEmail(signInEmail);
  }

  async function copySecret() {
    if (deviceSecret) {
      await Clipboard.setStringAsync(deviceSecret);
      Alert.alert("Copied", "Device secret copied for firmware.");
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-shell px-4 pt-4"
      contentContainerStyle={{ paddingBottom: scrollBottom }}
    >
      <ScreenHeader
        eyebrow="Settings"
        title="Account"
        subtitle="Sign-in email, leak alerts, and device setup."
      />

      <SectionCard
        title="Sign-in email"
        description="Used to log in. Separate from the leak alert address below."
        icon="person-circle-outline"
      >
        <Text className="text-slate-100 text-base font-medium">
          {signInEmail || "—"}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap mt-3">
          <View
            className={`px-3 py-1.5 rounded-xl ${emailVerified ? "bg-emerald-950/70 border border-emerald-700/45" : "bg-amber-950/55 border border-amber-700/40"}`}
          >
            <Text
              className={`text-xs font-bold ${emailVerified ? "text-emerald-300" : "text-amber-200"}`}
            >
              {emailVerified ? "Verified" : "Not verified"}
            </Text>
          </View>
        </View>
        {!emailVerified && signInEmail ? (
          <>
            <Text className="text-slate-500 text-sm leading-5 mt-3">
              You can verify anytime while logged in. After you tap the link in your
              inbox, refresh here so the app shows “Verified”.
            </Text>
            <Pressable
              onPress={resendVerification}
              disabled={resending}
              className="mt-3 bg-amber-600/20 border border-amber-500/40 rounded-2xl py-3.5 items-center active:opacity-85"
            >
              <Text className="text-amber-100 font-semibold text-sm">
                {resending ? "Sending…" : "Send verification email"}
              </Text>
            </Pressable>
            <Pressable
              onPress={onRefreshVerification}
              disabled={refreshingVerify}
              className="mt-2 bg-slate-800/90 border border-slate-700/80 rounded-2xl py-3.5 items-center active:opacity-85"
            >
              <Text className="text-slate-200 font-semibold text-sm">
                {refreshingVerify ? "Refreshing…" : "Refresh verification status"}
              </Text>
            </Pressable>
          </>
        ) : signInEmail ? (
          <Text className="text-slate-500 text-sm leading-5 mt-3">
            Your sign-in email is confirmed with Supabase.
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Leak alert email"
        description="The edge function sends leak emails to this profile field only — not automatically to your sign-in email unless you set it here."
        icon="notifications-outline"
      >
        <TextInput
          className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white text-base"
          placeholder="you@example.com"
          placeholderTextColor="#64748b"
          value={alertEmail}
          onChangeText={setAlertEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        {signInEmail ? (
          <Pressable
            onPress={useSignInEmailForAlerts}
            className="mt-3 bg-slate-800/90 border border-slate-700/70 rounded-2xl py-3 items-center active:opacity-85"
          >
            <Text className="text-teal-300 font-semibold text-sm">
              Use my sign-in email
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={saveEmail}
          disabled={saving}
          className="mt-3 bg-teal-600 rounded-2xl py-3.5 items-center border border-teal-400/25 active:opacity-90"
        >
          <Text className="text-white font-bold text-sm">
            {saving ? "Saving…" : "Save leak alert email"}
          </Text>
        </Pressable>
        <View className="mt-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl px-3.5 py-3.5 gap-2">
          <Text className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">
            If you never get leak emails
          </Text>
          <Text className="text-slate-500 text-xs leading-[18px]">
            • Save an address above (required).{"\n"}• If History shows{" "}
            <Text className="text-slate-400">NOT_FOUND</Text>, deploy{" "}
            <Text className="font-mono text-[10px] text-slate-400">send-leak-alert</Text>
            .{"\n"}• Set secrets{" "}
            <Text className="text-slate-400">RESEND_API_KEY</Text> and optional{" "}
            <Text className="text-slate-400">RESEND_FROM</Text>.{"\n"}• Verified domain
            needed for arbitrary inboxes on Resend.{"\n"}• Check spam.
          </Text>
        </View>
      </SectionCard>

      <SectionCard
        title="Device secret"
        description="Use this in your MCU firmware for the RPC call."
        icon="hardware-chip-outline"
      >
        {deviceSecret ? (
          <Pressable
            onPress={copySecret}
            className="bg-slate-950 border border-slate-800 rounded-2xl p-4 active:opacity-80"
          >
            <Text className="font-mono text-xs text-slate-300 leading-5">
              {deviceSecret}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-3">
              <Ionicons name="copy-outline" size={15} color={brand.accent} />
              <Text className="text-teal-400 text-xs font-semibold">Tap to copy</Text>
            </View>
          </Pressable>
        ) : (
          <Text className="text-slate-500 text-sm">No device yet — open Monitor first.</Text>
        )}
      </SectionCard>

      <View className="rounded-2xl px-4 py-3.5 border border-slate-800/90 bg-slate-900/50 mb-4 flex-row items-center gap-3">
        <Ionicons
          name={supabaseConfigured ? "checkmark-circle" : "alert-circle"}
          size={20}
          color={supabaseConfigured ? brand.success : brand.warning}
        />
        <Text className="text-slate-500 text-xs flex-1 leading-[18px]">
          {supabaseConfigured
            ? "Supabase URL and anon key loaded"
            : "Missing EXPO_PUBLIC_SUPABASE_* env vars"}
        </Text>
      </View>

      <Pressable
        onPress={() => signOut()}
        className="bg-slate-800/90 rounded-2xl py-4 items-center border border-slate-700/80 active:opacity-85"
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="log-out-outline" size={20} color="#94a3b8" />
          <Text className="text-slate-200 font-bold text-sm">Sign out</Text>
        </View>
      </Pressable>
    </ScrollView>
  );
}
