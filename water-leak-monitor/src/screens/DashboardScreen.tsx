import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import Slider from "@react-native-community/slider";
import { AiTextSheet } from "../components/AiTextSheet";
import { ZoneTipsSheet } from "../components/ZoneTipsSheet";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { useAuth } from "../context/AuthContext";
import { invokeAiHub } from "../lib/aiHub";
import { formatError } from "../lib/formatError";
import {
  clearZoneLastMoisture,
  ensureDefaultSetup,
  fetchZones,
  getSelectedRoom,
  getRoomStats,
  resetValve,
  setSelectedRoom as setStoredSelectedRoom,
  submitReading,
  syncZoneNameWithSelectedRoom,
  tryInvokeLeakEmailAfterSubmit,
  updateThreshold,
  type RoomStats,
  type ZoneRow,
} from "../lib/iot";
import { ROOM_OPTIONS, roomOptionById, roomOptionByLabel } from "../data/rooms";
import { brand } from "../theme/brand";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function thresholdsKey(uid: string) {
  return `room_thresholds_${uid}`;
}

type RoomThresholds = Record<string, number>;

function parseRoomThresholds(raw: string | null): RoomThresholds {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: RoomThresholds = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[k] = Math.round(Math.max(0, Math.min(100, v)));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function DashboardScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { user } = useAuth();
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState(65);
  const [saving, setSaving] = useState(false);
  const [clearingMoisture, setClearingMoisture] = useState(false);
  const [roomThresholds, setRoomThresholds] = useState<RoomThresholds>({});
  const [roomStats, setRoomStats] = useState<RoomStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [tipsOpen, setTipsOpen] = useState(false);
  type DashAiKind = "sensor_health" | "anomaly" | "threshold" | "false_positive";
  const [dashAi, setDashAi] = useState<DashAiKind | null>(null);

  // Load saved room + thresholds from AsyncStorage (scoped per user)
  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      getSelectedRoom(user.id),
      AsyncStorage.getItem(thresholdsKey(user.id)),
    ]).then(([loc, thr]) => {
      const saved: RoomThresholds = parseRoomThresholds(thr);
      setRoomThresholds(saved);
      if (loc) {
        const byLabel = roomOptionByLabel(loc);
        const roomId = byLabel?.id ?? null;
        setSelectedRoom(roomId);
        if (roomId && saved[roomId] !== undefined) {
          setThresholdDraft(saved[roomId]);
        }
      }
    });
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    await withTimeout(ensureDefaultSetup(user.id), 12000, "Setup");
    const z = await withTimeout(fetchZones(), 12000, "Fetch zones");
    setZone(z[0] ?? null);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .then(() => setLastSyncedAt(new Date()))
      .catch((e) => Alert.alert("Load error", formatError(e)))
      .finally(() => setLoading(false));
  }, [refresh]);

  const onPullRefresh = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      await refresh();
      const zones = await fetchZones();
      const id = zones[0]?.id;
      if (id) {
        const s = await getRoomStats(id, 7).catch(() => null);
        if (s) setRoomStats(s);
      }
      setLastSyncedAt(new Date());
    } catch (e) {
      Alert.alert("Refresh failed", formatError(e));
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, refresh]);

  useEffect(() => {
    if (!zone?.id) {
      setRoomStats(null);
      return;
    }
    getRoomStats(zone.id, 7)
      .then(setRoomStats)
      .catch(() => setRoomStats(null));
  }, [zone?.id]);

  // Keep Supabase zone.name aligned with the selected room (emails + history use zone.name).
  useEffect(() => {
    if (!zone || !selectedRoom || !user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncZoneNameWithSelectedRoom(user.id, zone);
        if (!cancelled) await refresh();
      } catch {
        /* pickRoom / Save surface errors; avoid alert loops on load */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zone, selectedRoom, refresh, user?.id]);

  const pickRoom = useCallback(
    (roomId: string) => {
      setSelectedRoom(roomId);
      const room = roomOptionById(roomId);
      const label = room?.label ?? roomId;
      if (user?.id) void setStoredSelectedRoom(user.id, label);

      if (roomThresholds[roomId] !== undefined) {
        setThresholdDraft(roomThresholds[roomId]);
      } else {
        setThresholdDraft(zone?.moisture_threshold ?? 65);
      }

      if (zone) {
        void (async () => {
          try {
            if (user?.id) await syncZoneNameWithSelectedRoom(user.id, zone);
            await refresh();
          } catch (e) {
            Alert.alert("Could not update zone name", formatError(e));
          }
        })();
      }
    },
    [roomThresholds, zone, user?.id, refresh],
  );

  const handleClearLastMoisturePress = useCallback(async () => {
    if (!zone) return;
    const last = Math.round(Math.min(100, zone.last_moisture ?? 0));
    if (last <= 0) return;
    setClearingMoisture(true);
    try {
      await clearZoneLastMoisture(zone.id);
      await refresh();
      Alert.alert(
        "Moisture cleared",
        "Last reading is now 0% in the cloud. You can change the threshold without an old high reading showing. Valve state is unchanged — use Reset valve if it is still closed after a leak.",
      );
    } catch (e) {
      Alert.alert("Could not clear", formatError(e));
    } finally {
      setClearingMoisture(false);
    }
  }, [zone, refresh]);

  async function saveRoomThreshold() {
    if (!selectedRoom || !zone) return;
    setSaving(true);
    try {
      const thr = Math.round(thresholdDraft);
      const updated = { ...roomThresholds, [selectedRoom]: thr };
      setRoomThresholds(updated);
      if (user?.id) await AsyncStorage.setItem(thresholdsKey(user.id), JSON.stringify(updated));
      await updateThreshold(zone.id, thr);
      const roomLabel =
        roomOptionById(selectedRoom)?.label ?? selectedRoom;
      if (user?.id) {
        await setStoredSelectedRoom(user.id, roomLabel);
        await syncZoneNameWithSelectedRoom(user.id, zone);
      }
      await refresh();
      const zonesAfter = await fetchZones();
      const z0 = zonesAfter[0];
      const lastM = z0?.last_moisture;
      let tripped = false;
      let email: Awaited<ReturnType<typeof tryInvokeLeakEmailAfterSubmit>> | null =
        null;
      if (
        z0?.valve_open &&
        lastM != null &&
        lastM >= z0.moisture_threshold
      ) {
        const res = await submitReading(z0.id, lastM, "virtual");
        tripped = Boolean(res?.leak_detected);
        if (tripped) {
          email = await tryInvokeLeakEmailAfterSubmit(res);
        }
        await refresh();
      }
      let body =
        tripped && lastM != null
          ? `${roomLabel}: threshold ${thr}%. Your last reading (${Math.round(lastM)}%) was already at or above it — valve closed and a leak event was logged.`
          : `${roomLabel}: threshold set to ${thr}%.`;
      if (email?.attempted) {
        if (email.emailed) body += "\n\nLeak alert email sent.";
        else if (email.userMessage) body += `\n\nEmail: ${email.userMessage}`;
      }
      Alert.alert("Saved", body);
    } catch (e) {
      Alert.alert("Save failed", formatError(e));
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (!zone) return;
    try {
      await resetValve(zone.id);
      await refresh();
      Alert.alert(
        "Reset",
        "Valve reopened and last moisture reset to 0% after safe inspection.",
      );
    } catch (e) {
      Alert.alert("Reset failed", formatError(e));
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-shell items-center justify-center">
        <ActivityIndicator color={brand.accent} size="large" />
        <Text className="text-slate-500 mt-4 text-sm font-medium">Loading…</Text>
      </View>
    );
  }

  const configuredRooms = Object.entries(roomThresholds)
    .map(([id, thr]) => ({
      id,
      label: ROOM_OPTIONS.find((r) => r.id === id)?.label ?? id,
      icon: ROOM_OPTIONS.find((r) => r.id === id)?.icon ?? ("location-outline" as const),
      threshold: thr,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const m = Math.round(Math.min(100, zone?.last_moisture ?? 0));
  const activeThreshold = zone?.moisture_threshold ?? 65;
  const isOver = m >= activeThreshold;

  /* Moisture “clear to 0%” is handleClearLastMoisturePress (useCallback near top only). */

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
        eyebrow="Monitor"
        title="Zone configuration"
        subtitle="Select a room, set its moisture threshold, and save. Each room remembers its own threshold. Use Simulate for a full leak demo."
      />
      {lastSyncedAt ? (
        <Text className="text-slate-500 text-[11px] mb-3 -mt-1">
          Updated {lastSyncedAt.toLocaleString()}
        </Text>
      ) : null}

      {/* Live status — last cloud reading vs trip threshold vs valve */}
      {zone ? (
        <View className="mb-5">
          <View className="flex-row gap-2">
            <View className="flex-1 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90 items-center">
              <Text className="text-slate-500 text-[10px] font-bold uppercase">
                Moisture
              </Text>
              <Text
                className={`text-lg font-black mt-0.5 ${isOver ? "text-rose-400" : "text-emerald-400"}`}
              >
                {m}%
              </Text>
            </View>
            <View className="flex-1 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90 items-center">
              <Text className="text-slate-500 text-[10px] font-bold uppercase">
                Threshold
              </Text>
              <Text className="text-amber-300 text-lg font-black mt-0.5">
                {activeThreshold}%
              </Text>
            </View>
            <View
              className={`flex-1 rounded-2xl px-3 py-3 border items-center ${
                zone.valve_open
                  ? "bg-emerald-950/40 border-emerald-800/50"
                  : "bg-rose-950/40 border-rose-800/50"
              }`}
            >
              <Text className="text-slate-500 text-[10px] font-bold uppercase">
                Valve
              </Text>
              <Text
                className={`text-lg font-black mt-0.5 ${zone.valve_open ? "text-emerald-300" : "text-rose-300"}`}
              >
                {zone.valve_open ? "Open" : "Closed"}
              </Text>
            </View>
          </View>
          <Text className="text-slate-500 text-xs mt-2 leading-5 px-0.5">
            Moisture is the last reading stored in the cloud (Simulate, device, etc.)
            — not your phone’s sensors. The valve only changes when the cloud
            processes a new reading: moisture must be at or above the threshold while
            the valve is open.
          </Text>
          {isOver && zone.valve_open ? (
            <View className="mt-3 bg-amber-950/40 border border-amber-800/50 rounded-xl px-3 py-2.5">
              <Text className="text-amber-100/90 text-xs leading-5">
                Reading is above threshold but the valve is still open — often the
                limit was lowered after this reading was saved. Tap Save on the
                threshold again; the app will re-send the last reading so the valve
                can close.
              </Text>
            </View>
          ) : null}
          {m > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleClearLastMoisturePress}
              disabled={clearingMoisture}
              className="mt-3 bg-slate-800/90 rounded-2xl py-3.5 items-center border border-slate-700/80 active:opacity-80"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="water-outline" size={18} color="#94a3b8" />
                <Text className="text-slate-200 font-semibold text-sm">
                  {clearingMoisture
                    ? "Clearing…"
                    : "Set last reading to 0% (for new threshold)"}
                </Text>
              </View>
            </Pressable>
          ) : null}
          {roomStats ? (
            <View className="mt-3 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90">
              <Text className="text-slate-500 text-[10px] font-bold uppercase">
                Last 7 days
              </Text>
              <Text className="text-slate-200 text-sm mt-1">
                Leaks: {roomStats.leakCount} · Peak moisture: {roomStats.maxMoisture}% · Avg response:{" "}
                {roomStats.avgResponseMs ?? "—"} ms
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open smart tips for this zone"
            onPress={() => setTipsOpen(true)}
            className="mt-4 bg-violet-950/50 rounded-2xl py-3.5 px-4 border border-violet-800/40 flex-row items-center gap-3 active:opacity-85"
          >
            <View className="w-10 h-10 rounded-xl bg-violet-500/15 items-center justify-center">
              <Ionicons name="bulb-outline" size={20} color="#a78bfa" />
            </View>
            <View className="flex-1">
              <Text className="text-violet-200 font-bold text-sm">Smart tips</Text>
              <Text className="text-violet-300/70 text-xs mt-0.5">
                On-device suggestions from your zone data (no API key)
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#a78bfa" />
          </Pressable>

          <View className="mt-3">
            <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-2">
              Cloud AI · this zone
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Pressable
                onPress={() => setDashAi("sensor_health")}
                className="px-3 py-2.5 rounded-xl bg-slate-800/95 border border-slate-700/80 active:opacity-85"
              >
                <Text className="text-violet-200 text-xs font-bold">Sensor health</Text>
              </Pressable>
              <Pressable
                onPress={() => setDashAi("anomaly")}
                className="px-3 py-2.5 rounded-xl bg-slate-800/95 border border-slate-700/80 active:opacity-85"
              >
                <Text className="text-violet-200 text-xs font-bold">Anomalies</Text>
              </Pressable>
              <Pressable
                onPress={() => setDashAi("threshold")}
                className="px-3 py-2.5 rounded-xl bg-slate-800/95 border border-slate-700/80 active:opacity-85"
              >
                <Text className="text-violet-200 text-xs font-bold">Threshold idea</Text>
              </Pressable>
              <Pressable
                onPress={() => setDashAi("false_positive")}
                className="px-3 py-2.5 rounded-xl bg-slate-800/95 border border-slate-700/80 active:opacity-85"
              >
                <Text className="text-violet-200 text-xs font-bold">False alarm?</Text>
              </Pressable>
            </View>
          </View>

          <ZoneTipsSheet
            visible={tipsOpen}
            onClose={() => setTipsOpen(false)}
            zone={zone}
            roomStats={roomStats}
          />

          <AiTextSheet
            visible={dashAi !== null}
            onClose={() => setDashAi(null)}
            eyebrow="Cloud AI"
            title={
              dashAi === "sensor_health"
                ? "Sensor health"
                : dashAi === "anomaly"
                  ? "Reading anomalies"
                  : dashAi === "threshold"
                    ? "Threshold suggestion"
                    : "False-positive check"
            }
            subtitle="Uses recent sensor_readings in Supabase for this zone (ai-hub + Gemini/Groq)."
            primaryLabel="Run analysis"
            onGenerate={async () => {
              if (!zone) throw new Error("No zone.");
              const zid = zone.id;
              if (dashAi === "sensor_health") {
                return (await invokeAiHub("sensor_health", { zone_id: zid })).reply;
              }
              if (dashAi === "anomaly") {
                return (await invokeAiHub("anomaly_narrative", { zone_id: zid })).reply;
              }
              if (dashAi === "threshold") {
                return (await invokeAiHub("threshold_suggest", { zone_id: zid })).reply;
              }
              const payload: Record<string, unknown> = { zone_id: zid };
              if (zone.last_moisture != null) {
                payload.moisture = zone.last_moisture;
              }
              return (await invokeAiHub("false_positive", payload)).reply;
            }}
            footerNote="Deploy ai-hub and set a free API key (GEMINI_API_KEY, GROQ_API_KEY, or PUTER_AUTH_TOKEN) in Edge secrets."
          />
        </View>
      ) : null}

      {/* Reset valve */}
      {zone && !zone.valve_open ? (
        <Pressable
          accessibilityRole="button"
          onPress={onReset}
          className="bg-emerald-900/40 rounded-2xl py-3.5 items-center border border-emerald-700/40 active:opacity-80 mb-5"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="refresh-outline" size={18} color="#6ee7b7" />
            <Text className="text-emerald-200 font-semibold text-sm">
              Reset valve (after repair)
            </Text>
          </View>
        </Pressable>
      ) : null}

      <SectionCard
        title="Select room"
        description="Tap a room to configure its threshold"
        icon="location-outline"
      >
        <View className="flex-row flex-wrap gap-2">
          {ROOM_OPTIONS.map((r) => {
            const active = selectedRoom === r.id;
            const hasSaved = roomThresholds[r.id] !== undefined;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => pickRoom(r.id)}
                className={`flex-row items-center gap-2 px-4 py-3 rounded-2xl border ${
                  active
                    ? "bg-teal-500/15 border-teal-400/40"
                    : hasSaved
                      ? "bg-emerald-950/35 border-emerald-700/35"
                      : "bg-slate-800/80 border-slate-700/80"
                } active:opacity-70`}
              >
                <Ionicons
                  name={r.icon}
                  size={16}
                  color={active ? brand.accent : hasSaved ? "#6ee7b7" : "#94a3b8"}
                />
                <Text
                  className={`text-sm font-semibold ${
                    active
                      ? "text-teal-200"
                      : hasSaved
                        ? "text-emerald-300"
                        : "text-slate-300"
                  }`}
                >
                  {r.label}
                </Text>
                {hasSaved && !active ? (
                  <Text className="text-emerald-400 text-[10px] font-bold">
                    {roomThresholds[r.id]}%
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </SectionCard>

      {selectedRoom ? (
        <SectionCard
          title={ROOM_OPTIONS.find((r) => r.id === selectedRoom)?.label ?? selectedRoom}
          description="Set the moisture leak threshold for this room"
          icon={
            ROOM_OPTIONS.find((r) => r.id === selectedRoom)?.icon ?? "location-outline"
          }
          contentClassName="px-4 py-5 flex flex-col gap-4"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-slate-300 text-base font-medium">
              Leak threshold
            </Text>
            <Text className="text-amber-300 text-2xl font-black">
              {Math.round(thresholdDraft)}%
            </Text>
          </View>

          <Slider
            minimumValue={10}
            maximumValue={100}
            step={5}
            value={thresholdDraft}
            onValueChange={setThresholdDraft}
            minimumTrackTintColor="#14b8a6"
            maximumTrackTintColor="#334155"
            thumbTintColor="#2dd4bf"
          />

          <Text className="text-slate-500 text-xs leading-[18px]">
            If moisture reaches {Math.round(thresholdDraft)}%, the system will close
            the valve and send you an alert email.
          </Text>

          <Pressable
            onPress={saveRoomThreshold}
            disabled={saving}
            className="bg-teal-600 rounded-2xl py-4 items-center border border-teal-400/30 active:opacity-90"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text className="text-white font-bold text-base">
                  Save {Math.round(thresholdDraft)}% for{" "}
                  {ROOM_OPTIONS.find((r) => r.id === selectedRoom)?.label}
                </Text>
              </View>
            )}
          </Pressable>
        </SectionCard>
      ) : null}

      {configuredRooms.length > 0 ? (
        <SectionCard
          title="Configured rooms"
          description="Saved thresholds for each room"
          icon="list-outline"
          contentClassName="px-2 py-2"
        >
          {configuredRooms.map((room, idx) => {
            const isActive = selectedRoom === room.id;
            const isCurrentZone =
              zone &&
              room.threshold === zone.moisture_threshold &&
              room.label.toLowerCase() === zone.name.toLowerCase();
            return (
              <Pressable
                key={room.id}
                onPress={() => pickRoom(room.id)}
                className={`flex-row items-center gap-3 py-3.5 px-2 active:opacity-70 rounded-xl ${
                  idx < configuredRooms.length - 1
                    ? "border-b border-slate-800/70"
                    : ""
                }`}
              >
                <View
                  className={`w-11 h-11 rounded-2xl items-center justify-center ${
                    isActive ? "bg-teal-500/15 border border-teal-500/25" : "bg-slate-800/90"
                  }`}
                >
                  <Ionicons
                    name={room.icon}
                    size={20}
                    color={isActive ? brand.accent : "#94a3b8"}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={`text-base font-semibold ${
                      isActive ? "text-teal-100" : "text-slate-200"
                    }`}
                  >
                    {room.label}
                  </Text>
                  {isCurrentZone ? (
                    <Text className="text-emerald-400 text-[10px] font-bold mt-0.5">
                      Active on device
                    </Text>
                  ) : null}
                </View>
                <View className="bg-amber-900/35 px-3 py-1.5 rounded-xl border border-amber-700/35">
                  <Text className="text-amber-200 text-sm font-black">
                    {room.threshold}%
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </SectionCard>
      ) : null}

      <View className="rounded-2xl px-4 py-3.5 border border-teal-900/40 bg-teal-950/20 mb-4 flex-row items-start gap-3">
        <View className="w-8 h-8 rounded-lg bg-teal-500/15 items-center justify-center mt-0.5">
          <Ionicons name="play-circle" size={18} color={brand.accent} />
        </View>
        <Text className="text-teal-100/85 text-[13px] flex-1 leading-[20px]">
          Open Simulate to run a full animated leak demo with the room and threshold
          you set here.
        </Text>
      </View>
    </ScrollView>
  );
}
