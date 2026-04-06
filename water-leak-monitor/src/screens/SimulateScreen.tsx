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
import { LiveDemo, type SimulationResult } from "../components/lab/LiveDemo";
import { RaspberryPiStatus } from "../components/lab/RaspberryPiStatus";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { useAuth } from "../context/AuthContext";
import { invokeAiHub } from "../lib/aiHub";
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

type AiSheet = "moisture_hint" | "sim_analysis" | "sensor_health" | "threshold" | "emergency_checklist" | "predictive_risk" | "pi_compare" | null;

export function SimulateScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { user } = useAuth();
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomLocation, setRoomLocation] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeSheet, setActiveSheet] = useState<AiSheet>(null);
  const [previewMoisture, setPreviewMoisture] = useState(55);
  const [moistureCloud, setMoistureCloud] = useState(false);

  const [lastSimResult, setLastSimResult] = useState<SimulationResult | null>(null);

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
  }, [zone?.id, zone?.name, roomLocation, load, user?.id]);

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

  const handleSimDone = useCallback(
    (result?: SimulationResult) => {
      if (result) setLastSimResult(result);
      void load();
    },
    [load],
  );

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

      {/* AI quick-access row */}
      {zone ? (
        <View className="mb-5">
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveSheet("moisture_hint")}
            className="bg-violet-950/50 rounded-2xl py-3.5 px-4 border border-violet-800/40 flex-row items-center gap-3 active:opacity-85 mb-2"
          >
            <View className="w-10 h-10 rounded-xl bg-violet-500/15 items-center justify-center">
              <Ionicons name="sparkles" size={20} color="#a78bfa" />
            </View>
            <View className="flex-1">
              <Text className="text-violet-200 font-bold text-sm">Reading explainer</Text>
              <Text className="text-violet-300/70 text-xs mt-0.5">
                Local rules or cloud AI — compare a % to your threshold
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#a78bfa" />
          </Pressable>

          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setActiveSheet("sensor_health")}
              className="flex-1 px-3 py-3 rounded-xl bg-slate-800/95 border border-slate-700/80 active:opacity-85 items-center"
            >
              <Ionicons name="pulse-outline" size={18} color="#a78bfa" />
              <Text className="text-violet-200 text-[11px] font-bold mt-1">Sensor health</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveSheet("threshold")}
              className="flex-1 px-3 py-3 rounded-xl bg-slate-800/95 border border-slate-700/80 active:opacity-85 items-center"
            >
              <Ionicons name="options-outline" size={18} color="#a78bfa" />
              <Text className="text-violet-200 text-[11px] font-bold mt-1">Threshold idea</Text>
            </Pressable>
            {lastSimResult ? (
              <Pressable
                onPress={() => setActiveSheet("sim_analysis")}
                className="flex-1 px-3 py-3 rounded-xl bg-teal-900/60 border border-teal-700/50 active:opacity-85 items-center"
              >
                <Ionicons name="analytics-outline" size={18} color="#2dd4bf" />
                <Text className="text-teal-200 text-[11px] font-bold mt-1">Analyze run</Text>
              </Pressable>
            ) : null}
          </View>
          {lastSimResult ? (
            <View className="flex-row gap-2 mt-2">
              <Pressable
                onPress={() => setActiveSheet("emergency_checklist")}
                className="flex-1 px-3 py-3 rounded-xl bg-rose-950/50 border border-rose-800/40 active:opacity-85 items-center"
              >
                <Ionicons name="list-outline" size={18} color="#fda4af" />
                <Text className="text-rose-200 text-[11px] font-bold mt-1">Emergency steps</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveSheet("predictive_risk")}
                className="flex-1 px-3 py-3 rounded-xl bg-amber-950/50 border border-amber-800/40 active:opacity-85 items-center"
              >
                <Ionicons name="warning-outline" size={18} color="#fbbf24" />
                <Text className="text-amber-200 text-[11px] font-bold mt-1">Risk prediction</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
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
          onDone={handleSimDone}
        />
      ) : null}

      {/* Post-simulation AI analysis card */}
      {zone && lastSimResult ? (
        <View className="mb-5">
          <View className="bg-slate-900/90 rounded-2xl border border-teal-800/30 p-4">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="checkmark-circle" size={20} color="#2dd4bf" />
              <Text className="text-teal-200 text-sm font-bold flex-1">
                Last simulation result
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-x-4 gap-y-1 mb-3">
              <Text className="text-slate-400 text-xs">
                Leak: {lastSimResult.leakDetected ? "Yes" : "No"}
              </Text>
              <Text className="text-slate-400 text-xs">
                Valve: {lastSimResult.valveClosed ? "Closed" : "Open"}
              </Text>
              <Text className="text-slate-400 text-xs">
                Response: {lastSimResult.responseMs ?? "—"}ms
              </Text>
              <Text className="text-slate-400 text-xs">
                Email: {lastSimResult.emailSent ? "Sent" : lastSimResult.emailError ? "Failed" : "—"}
              </Text>
              <Text className="text-slate-400 text-xs">
                Source: {lastSimResult.source}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setActiveSheet("sim_analysis")}
              className="bg-teal-600 rounded-2xl py-3.5 items-center border border-teal-400/30 active:opacity-90"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text className="text-white font-bold text-sm">
                  AI analysis of this run
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Raspberry Pi live status */}
      {zone ? (
        <RaspberryPiStatus
          zoneId={zone.id}
          threshold={threshold}
          onRequestAiCompare={() => setActiveSheet("pi_compare")}
        />
      ) : null}
    </ScrollView>

    {/* ─── AI Sheets ─── */}
    {zone ? (
      <>
        {/* Reading explainer */}
        <AiTextSheet
          visible={activeSheet === "moisture_hint"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Simulate"
          title="Explain this reading"
          subtitle={
            moistureCloud
              ? "Cloud AI uses your zone threshold and valve state from Supabase."
              : "On-device only — uses your current zone threshold and valve state from the server."
          }
          primaryLabel={moistureCloud ? "Explain with AI" : "Explain reading"}
          onGenerate={async () => {
            if (moistureCloud) {
              const { reply } = await invokeAiHub("moisture_hint", {
                zone_id: zone.id,
                moisture: previewMoisture,
              });
              return reply;
            }
            return buildMoistureInsight(
              {
                name: zone.name,
                moisture_threshold: zone.moisture_threshold,
                last_moisture: zone.last_moisture,
                valve_open: zone.valve_open,
              },
              previewMoisture,
            );
          }}
          footerNote={
            moistureCloud
              ? "Requires ai-hub with PUTER_AUTH_TOKEN."
              : "No cloud AI — rules only."
          }
        >
          <View className="flex-row rounded-2xl border border-slate-800 bg-slate-950/80 p-1 mb-4">
            <Pressable
              onPress={() => setMoistureCloud(false)}
              className={`flex-1 py-2.5 rounded-[14px] items-center ${
                !moistureCloud ? "bg-slate-800 border border-slate-700/80" : ""
              }`}
            >
              <Text
                className={`text-xs font-bold ${!moistureCloud ? "text-teal-300" : "text-slate-500"}`}
              >
                On-device
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMoistureCloud(true)}
              className={`flex-1 py-2.5 rounded-[14px] items-center ${
                moistureCloud ? "bg-violet-950/80 border border-violet-800/50" : ""
              }`}
            >
              <Text
                className={`text-xs font-bold ${moistureCloud ? "text-violet-200" : "text-slate-500"}`}
              >
                Cloud AI
              </Text>
            </Pressable>
          </View>
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

        {/* Post-simulation AI analysis */}
        <AiTextSheet
          visible={activeSheet === "sim_analysis"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Cloud AI"
          title="Simulation analysis"
          subtitle="AI reviews your latest run — system response, threshold, sensor data, and recommendations for both virtual and physical setups."
          primaryLabel="Analyze simulation"
          onGenerate={async () => {
            const payload: Record<string, unknown> = { zone_id: zone.id };
            if (lastSimResult) {
              payload.simulation_result = {
                leak_detected: lastSimResult.leakDetected,
                valve_closed: lastSimResult.valveClosed,
                response_ms: lastSimResult.responseMs,
                moisture_sent: lastSimResult.moistureSent,
                threshold: lastSimResult.threshold,
                email_sent: lastSimResult.emailSent,
                email_error: lastSimResult.emailError,
                source: lastSimResult.source,
              };
            }
            const { reply } = await invokeAiHub("simulate_analysis", payload);
            return reply;
          }}
          footerNote="Analyzes cloud data + your last simulation. Works for virtual and physical sensor data."
        />

        {/* Sensor health */}
        <AiTextSheet
          visible={activeSheet === "sensor_health"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Cloud AI"
          title="Sensor health check"
          subtitle="Analyzes recent sensor readings for anomalies, stuck values, and reliability."
          primaryLabel="Run health check"
          onGenerate={async () => {
            const { reply } = await invokeAiHub("sensor_health", {
              zone_id: zone.id,
            });
            return reply;
          }}
          footerNote="Uses sensor_readings from Supabase. Deploy ai-hub + set PUTER_AUTH_TOKEN."
        />

        {/* Threshold suggestion */}
        <AiTextSheet
          visible={activeSheet === "threshold"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Cloud AI"
          title="Threshold suggestion"
          subtitle="AI recommends a threshold based on your historical readings."
          primaryLabel="Get suggestion"
          onGenerate={async () => {
            const { reply } = await invokeAiHub("threshold_suggest", {
              zone_id: zone.id,
            });
            return reply;
          }}
          footerNote="You must confirm and save any threshold change on the Monitor tab."
        />

        {/* Emergency checklist */}
        <AiTextSheet
          visible={activeSheet === "emergency_checklist"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Cloud AI"
          title="Emergency checklist"
          subtitle="AI generates a step-by-step action plan based on the detected leak — what to check, who to notify, and how to prevent damage."
          primaryLabel="Generate checklist"
          onGenerate={async () => {
            const payload: Record<string, unknown> = { zone_id: zone.id };
            if (lastSimResult) {
              payload.simulation_result = {
                leak_detected: lastSimResult.leakDetected,
                valve_closed: lastSimResult.valveClosed,
                response_ms: lastSimResult.responseMs,
                moisture_sent: lastSimResult.moistureSent,
                threshold: lastSimResult.threshold,
                email_sent: lastSimResult.emailSent,
                email_error: lastSimResult.emailError,
                source: lastSimResult.source,
              };
            }
            const { reply } = await invokeAiHub("emergency_checklist", payload);
            return reply;
          }}
          footerNote="Personalized to your zone, threshold, and last simulation."
        />

        {/* Predictive risk */}
        <AiTextSheet
          visible={activeSheet === "predictive_risk"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Cloud AI"
          title="Risk prediction"
          subtitle="AI predicts potential damage, estimates severity, and suggests preventive measures based on moisture levels and response time."
          primaryLabel="Predict risk"
          onGenerate={async () => {
            const payload: Record<string, unknown> = { zone_id: zone.id };
            if (lastSimResult) {
              payload.simulation_result = {
                leak_detected: lastSimResult.leakDetected,
                valve_closed: lastSimResult.valveClosed,
                response_ms: lastSimResult.responseMs,
                moisture_sent: lastSimResult.moistureSent,
                threshold: lastSimResult.threshold,
                email_sent: lastSimResult.emailSent,
                email_error: lastSimResult.emailError,
                source: lastSimResult.source,
              };
            }
            const { reply } = await invokeAiHub("predictive_risk", payload);
            return reply;
          }}
          footerNote="Uses moisture readings, response time, and zone history to estimate risk."
        />

        {/* Pi vs Virtual comparison */}
        <AiTextSheet
          visible={activeSheet === "pi_compare"}
          onClose={() => setActiveSheet(null)}
          eyebrow="Cloud AI"
          title="Physical vs Virtual"
          subtitle="AI compares your Raspberry Pi's physical sensor data against virtual simulation readings — highlighting discrepancies, calibration issues, and reliability."
          primaryLabel="Compare data sources"
          onGenerate={async () => {
            const fallbackPayload: Record<string, unknown> = {
              zone_id: zone.id,
              simulation_result: {
                source: "physical_vs_virtual_compare",
                leak_detected: false,
                valve_closed: false,
                moisture_sent: zone.last_moisture ?? null,
                threshold: zone.moisture_threshold ?? 65,
                note:
                  "User requested Physical vs Virtual. Compare sensor_readings where source=physical vs source=virtual: volume, offset, calibration, noise/stuck sensor, threshold fit. Say clearly if physical or virtual data is missing.",
              },
            };
            try {
              const { reply } = await invokeAiHub("pi_compare", {
                zone_id: zone.id,
              });
              return reply;
            } catch (e) {
              if (/unknown action/i.test(formatError(e))) {
                const { reply } = await invokeAiHub(
                  "simulate_analysis",
                  fallbackPayload,
                );
                return reply;
              }
              throw e;
            }
          }}
          footerNote="Works with your current ai-hub deploy; uses a dedicated compare action when available. Run at least one simulation (virtual) and Pi heartbeats (physical) for best results."
        />
      </>
    ) : null}
    </View>
  );
}
