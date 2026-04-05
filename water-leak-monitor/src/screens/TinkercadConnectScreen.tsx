import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { useAuth } from "../context/AuthContext";
import { formatError } from "../lib/formatError";
import {
  ensureDefaultSetup,
  fetchZones,
  getSelectedRoom,
  type ZoneRow,
} from "../lib/iot";
import {
  getSavedCircuitUrl,
  parseHttpUrl,
  setSavedCircuitUrl,
  TINKERCAD_CIRCUITS_HOME,
} from "../lib/tinkercadLink";
import { brand } from "../theme/brand";

export function TinkercadConnectScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { user } = useAuth();
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [roomLabel, setRoomLabel] = useState("");
  const [circuitDraft, setCircuitDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    await ensureDefaultSetup(user.id);
    const zones = await fetchZones();
    setZone(zones[0] ?? null);
    const [loc, savedUrl] = await Promise.all([
      getSelectedRoom(user.id),
      getSavedCircuitUrl(user.id),
    ]);
    setRoomLabel(loc);
    setCircuitDraft(savedUrl);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => Alert.alert("Load error", formatError(e)))
      .finally(() => setLoading(false));
  }, [load]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      Alert.alert("Refresh failed", formatError(e));
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  async function openUrl(url: string) {
    const normalized = parseHttpUrl(url);
    if (!normalized) {
      Alert.alert("Invalid link", "Enter a full https:// link to your design.");
      return;
    }
    const can = await Linking.canOpenURL(normalized);
    if (!can) {
      Alert.alert("Cannot open", "This device cannot open that URL.");
      return;
    }
    await Linking.openURL(normalized);
  }

  async function saveCircuitLink() {
    if (!user?.id) return;
    setSaving(true);
    try {
      const t = circuitDraft.trim();
      if (t) {
        const ok = parseHttpUrl(t);
        if (!ok) {
          Alert.alert("Invalid URL", "Use a full address, e.g. https://www.tinkercad.com/things/...");
          return;
        }
        await setSavedCircuitUrl(user.id, ok);
        setCircuitDraft(ok);
      } else {
        await setSavedCircuitUrl(user.id, "");
      }
      Alert.alert("Saved", t ? "Your Tinkercad link is saved on this device." : "Saved link cleared.");
    } catch (e) {
      Alert.alert("Save failed", formatError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-shell items-center justify-center">
        <ActivityIndicator color={brand.accent} size="large" />
        <Text className="text-slate-500 mt-4 text-sm">Loading...</Text>
      </View>
    );
  }

  const threshold = zone?.moisture_threshold ?? 65;
  const valveOpen = zone?.valve_open ?? true;
  const parsed = parseHttpUrl(circuitDraft);

  return (
    <ScrollView
      className="flex-1 bg-shell px-4 pt-4"
      contentContainerStyle={{ paddingBottom: scrollBottom }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onPullRefresh}
          tintColor={brand.accent}
          colors={[brand.accent]}
        />
      }
    >
      <ScreenHeader
        eyebrow="Tinkercad"
        title="Circuits & this app"
        subtitle="Link your virtual breadboard to the same rules you use in Monitor and Simulate."
      />

      <SectionCard
        title="How it works together"
        description="Run Tinkercad in the browser, mirror values in the Live tab"
        icon="git-network-outline"
      >
        <Text className="text-slate-400 text-sm leading-[22px]">
          1. In Tinkercad Circuits, model moisture as a value (potentiometer or serial monitor) and
          compare it to a threshold in code - use the same percentage as{" "}
          <Text className="text-teal-300 font-semibold">Monitor</Text>.{"\n\n"}
          2. When you press <Text className="text-teal-300 font-semibold">Start simulation</Text> in
          Tinkercad, run <Text className="text-teal-300 font-semibold">Simulate</Text> here so Supabase
          closes the valve and can send the leak email.{"\n\n"}
          3. Open the <Text className="text-teal-300 font-semibold">Live</Text> tab, read the moisture
          % from Tinkercad Serial Monitor, type it into the built-in control panel and tap{" "}
          <Text className="text-teal-300 font-semibold">Send</Text>. No external server or bridge is
          needed - the value goes straight to the cloud.{"\n\n"}
          4. For a real device later, firmware calls your Supabase RPC with the device secret from
          Settings.
        </Text>
      </SectionCard>

      <SectionCard
        title="Current app targets"
        description="Match these in your Tinkercad sketch"
        icon="locate-outline"
      >
        <View className="gap-2">
          <Text className="text-slate-300 text-sm">
            <Text className="text-slate-500">Room / zone label: </Text>
            {roomLabel || zone?.name || "-"}
          </Text>
          <Text className="text-slate-300 text-sm">
            <Text className="text-slate-500">Leak threshold: </Text>
            {threshold}%
          </Text>
          <Text className="text-slate-300 text-sm">
            <Text className="text-slate-500">Valve (cloud): </Text>
            {valveOpen ? "Open" : "Closed"}
          </Text>
        </View>
      </SectionCard>

      <SectionCard
        title="Your circuit link"
        description="Paste the share or editor URL for your design"
        icon="link-outline"
      >
        <TextInput
          className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white text-base mb-3"
          placeholder="https://www.tinkercad.com/things/..."
          placeholderTextColor="#64748b"
          value={circuitDraft}
          onChangeText={setCircuitDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Pressable
          onPress={saveCircuitLink}
          disabled={saving}
          className="bg-teal-600 rounded-2xl py-3.5 items-center border border-teal-400/25 active:opacity-90 mb-2"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-sm">Save link on this device</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => openUrl(TINKERCAD_CIRCUITS_HOME)}
          className="bg-slate-800/90 border border-slate-700/80 rounded-2xl py-3.5 items-center active:opacity-85 mb-2"
        >
          <Text className="text-teal-300 font-semibold text-sm">Open Tinkercad Circuits</Text>
        </Pressable>
        {parsed ? (
          <Pressable
            onPress={() => openUrl(parsed)}
            className="bg-slate-800/90 border border-slate-700/80 rounded-2xl py-3.5 items-center active:opacity-85"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="open-outline" size={18} color={brand.accent} />
              <Text className="text-teal-300 font-semibold text-sm">Open my saved circuit</Text>
            </View>
          </Pressable>
        ) : null}
      </SectionCard>
    </ScrollView>
  );
}
