import "./global.css";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SimulateScreen } from "./src/screens/SimulateScreen";
import { EmailVerificationBanner } from "./src/components/EmailVerificationBanner";
import { supabaseConfigured } from "./src/lib/supabase";
import { brand } from "./src/theme/brand";

type Tab = "monitor" | "simulate" | "history" | "settings";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconActive: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { id: "monitor", label: "Monitor", icon: "pulse-outline", iconActive: "pulse" },
  {
    id: "simulate",
    label: "Simulate",
    icon: "play-circle-outline",
    iconActive: "play-circle",
  },
  { id: "history", label: "History", icon: "time-outline", iconActive: "time" },
  {
    id: "settings",
    label: "Settings",
    icon: "settings-outline",
    iconActive: "settings",
  },
];

function ConfigMissing() {
  return (
    <View className="flex-1 bg-shell justify-center px-6">
      <View className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <Text className="text-teal-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
          Setup
        </Text>
        <Text className="text-xl font-bold text-white mb-3">Configuration</Text>
        <Text className="text-slate-400 leading-6 mb-4 text-[15px]">
          Create a file <Text className="font-mono text-sm text-teal-300">.env</Text> in{" "}
          <Text className="font-mono text-sm text-teal-300">water-leak-monitor</Text> with:
        </Text>
        <Text className="font-mono text-xs text-slate-200 bg-slate-950 border border-slate-800 p-4 rounded-2xl mb-5 leading-5">
          EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co{"\n"}
          EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
        </Text>
        <Text className="text-slate-500 text-sm leading-5">
          Apply the SQL migration in Supabase, deploy the Edge Function, and set Resend
          secrets. See project README.
        </Text>
      </View>
    </View>
  );
}

function MainTabs() {
  const [tab, setTab] = useState<Tab>("monitor");

  return (
    <SafeAreaView className="flex-1 bg-shell" edges={["top", "bottom"]}>
      <EmailVerificationBanner />

      <View className="px-3 pt-2 pb-2">
        <View className="flex-row p-1 rounded-[18px] bg-slate-900/95 border border-slate-800/90">
          {TABS.map(({ id, label, icon, iconActive }) => {
            const active = tab === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(id)}
                className={`flex-1 py-2.5 rounded-[14px] items-center ${
                  active ? "bg-teal-500/12 border border-teal-500/25" : ""
                }`}
              >
                <Ionicons
                  name={active ? iconActive : icon}
                  size={20}
                  color={active ? brand.accent : brand.textMuted}
                />
                <Text
                  className={`text-[10px] font-bold mt-1 ${
                    active ? "text-teal-300" : "text-slate-500"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {tab === "monitor" ? <DashboardScreen /> : null}
      {tab === "simulate" ? <SimulateScreen /> : null}
      {tab === "history" ? <HistoryScreen /> : null}
      {tab === "settings" ? <SettingsScreen /> : null}
    </SafeAreaView>
  );
}

function Root() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 bg-shell items-center justify-center">
        <View className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 items-center justify-center mb-4">
          <Ionicons name="water" size={26} color={brand.accent} />
        </View>
        <Text className="text-slate-500 text-sm font-medium">Starting…</Text>
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <>
      <MainTabs key={session.user.id} />
      <StatusBar style="light" />
    </>
  );
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <SafeAreaProvider>
        <ConfigMissing />
        <StatusBar style="light" />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
