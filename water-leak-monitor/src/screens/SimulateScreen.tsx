import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AiTextSheet } from "../components/AiTextSheet";
import { LiveDemo } from "../components/lab/LiveDemo";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { useAuth } from "../context/AuthContext";
import { formatError } from "../lib/formatError";
import { roomHintSample } from "../data/rooms";
import { buildMoistureInsight } from "../lib/localInsights";
import {
  ensureDefaultSetup,
  fetchZones,
  getSelectedRoom,
  syncZoneNameWithSelectedRoom,
  type ZoneRow,
} from "../lib/iot";
import { brand } from "../theme/brand";

export function SimulateScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { user } = useAuth();
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomLocation, setRoomLocation] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [moistureHintOpen, setMoistureHintOpen] = useState(false);
  const [previewMoisture, setPreviewMoisture] = useState(55);

  const load = useCallback(async () => {
    if (!user?.id) return;
    await ensureDefaultSetup(user.id);
    const zones = await fetchZones();
    setZone(zones[0] ?? null);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      load(),
      user?.id
        ? getSelectedRoom(user.id).then((val) => setRoomLocation(val))
        : Promise.resolve(setRoomLocation("")),
    ])
      .catch((e) => Alert.alert("Load error", formatError(e)))
      .finally(() => setLoading(false));
  }, [load, user?.id]);

  // Emails use `zones.name` — align with Monitor / stored location (including custom text).
  useEffect(() => {
    if (!zone || !user?.id || !roomLocation.trim()) return;
    let cancelled = false;
    void (async () => {
      try {
        const changed = await syncZoneNameWithSelectedRoom(user.id, zone);
        if (!changed) return;
        if (!cancelled) await load();
      } catch {
        /* Dashboard may sync; avoid noisy alerts */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zone?.id, zone?.name, roomLocation, load]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
      if (user?.id) {
        const loc = await getSelectedRoom(user.id);
        setRoomLocation(loc);
      }
    } catch (e) {
      Alert.alert("Refresh failed", formatError(e));
    } finally {
      setRefreshing(false);
    }
  }, [load, user?.id]);

  useEffect(() => {
    if (!zone) return;
    const thr = zone.moisture_threshold ?? 65;
    setPreviewMoisture(Math.min(95, Math.max(5, Math.round(thr + 10))));
  }, [zone?.id, zone?.moisture_threshold]);

  if (loading) {
    return (
      <View className="flex-1 bg-shell items-center justify-center px-8">
        <ActivityIndicator color={brand.accent} size="large" />
        <Text className="text-slate-500 mt-4 text-center text-sm font-medium">
          Loading…
        </Text>
      </View>
    );
  }

  const threshold = zone?.moisture_threshold ?? 65;
  const valveOpen = zone?.valve_open ?? true;

  return (
    <View className="flex-1 bg-shell">
    <ScrollView
      keyboardShouldPersistTaps="handled"
      className="flex-1 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: scrollBottom }}
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
        eyebrow="Simulate"
        title="Water leak simulation"
        subtitle="Watch the full leak detection cycle — flow, sensor, valve, cloud sync, and email alert."
      />

      {zone ? (
        <View className="flex-row gap-2 mb-5">
          {roomLocation ? (
            <View className="flex-1 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90 items-center">
              <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                Location
              </Text>
              <Text
                className="text-teal-300 text-sm font-black mt-0.5"
                numberOfLines={1}
              >
                {roomLocation}
              </Text>
            </View>
          ) : null}
          <View className="flex-1 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90 items-center">
            <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">
              Threshold
            </Text>
            <Text className="text-amber-300 text-lg font-black mt-0.5">
              {threshold}%
            </Text>
          </View>
          <View
            className={`flex-1 rounded-2xl px-3 py-3 border items-center ${
              valveOpen
                ? "bg-emerald-950/40 border-emerald-800/45"
                : "bg-rose-950/40 border-rose-800/45"
            }`}
          >
            <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wide">
              Valve
            </Text>
            <Text
              className={`text-lg font-black mt-0.5 ${valveOpen ? "text-emerald-300" : "text-rose-300"}`}
            >
              {valveOpen ? "Open" : "Closed"}
            </Text>
          </View>
        </View>
      ) : null}

      {zone ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setMoistureHintOpen(true)}
          className="mb-5 bg-violet-950/50 rounded-2xl py-3.5 px-4 border border-violet-800/40 flex-row items-center gap-3 active:opacity-85"
        >
          <View className="w-10 h-10 rounded-xl bg-violet-500/15 items-center justify-center">
            <Ionicons name="sparkles" size={20} color="#a78bfa" />
          </View>
          <View className="flex-1">
            <Text className="text-violet-200 font-bold text-sm">Reading explainer</Text>
            <Text className="text-violet-300/70 text-xs mt-0.5">
              Pick a moisture % — on-device vs your threshold (no API key)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#a78bfa" />
        </Pressable>
      ) : null}

      {!zone ? (
        <View className="rounded-[20px] border border-amber-800/45 bg-amber-950/30 p-4 mb-5 flex-row items-start gap-3">
          <View className="w-10 h-10 rounded-xl bg-amber-500/15 items-center justify-center">
            <Ionicons name="information-circle" size={22} color="#fbbf24" />
          </View>
          <View className="flex-1">
            <Text className="text-amber-50 font-bold text-base">No zone yet</Text>
            <Text className="text-amber-100/85 text-sm mt-1 leading-5">
              Open the Monitor tab to create your zone, select a room, and set a
              threshold. Then come back here.
            </Text>
          </View>
        </View>
      ) : null}

      {zone && !roomLocation ? (
        <View className="rounded-2xl px-4 py-3.5 border border-teal-900/40 bg-teal-950/25 mb-5 flex-row items-start gap-3">
          <Ionicons name="location-outline" size={18} color={brand.accent} />
          <Text className="text-teal-100/85 text-xs flex-1 leading-[18px]">
            Go to Monitor to select a room ({roomHintSample(4)}…) before running the
            simulation.
          </Text>
        </View>
      ) : null}

      {zone ? (
        <LiveDemo
          zoneId={zone.id}
          deviceId={zone.devices.id}
          threshold={threshold}
          zoneName={zone.name}
          location={roomLocation}
          zoneValveOpen={valveOpen}
          onDone={load}
        />
      ) : null}
    </ScrollView>
    {zone ? (
      <AiTextSheet
        visible={moistureHintOpen}
        onClose={() => setMoistureHintOpen(false)}
        eyebrow="Simulate"
        title="Explain this reading"
        subtitle="This does not send data to the cloud. It uses your current zone threshold and valve state from the server."
        primaryLabel="Explain reading"
        onGenerate={async () =>
          Promise.resolve(
            buildMoistureInsight(
              {
                name: zone.name,
                moisture_threshold: zone.moisture_threshold,
                last_moisture: zone.last_moisture,
                valve_open: zone.valve_open,
              },
              previewMoisture,
            ),
          )
        }
        footerNote="No cloud AI — uses your zone threshold and valve state from Supabase."
      >
        <View className="bg-slate-900/90 rounded-2xl border border-slate-800 px-4 py-4">
          <Text className="text-slate-500 text-[10px] font-bold uppercase mb-1">
            Hypothetical moisture
          </Text>
          <Text className="text-amber-300 text-4xl font-black text-center mb-2">
            {Math.round(previewMoisture)}%
          </Text>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={previewMoisture}
            onValueChange={setPreviewMoisture}
            minimumTrackTintColor="#8b5cf6"
            maximumTrackTintColor="#334155"
            thumbTintColor="#a78bfa"
          />
        </View>
      </AiTextSheet>
    ) : null}
    </View>
  );
}
