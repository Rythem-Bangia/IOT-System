import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  Text,
  View,
} from "react-native";
import { buildMoisturePresets } from "../../data/labDynamic";
import { formatError } from "../../lib/formatError";
import {
  submitReading,
  tryInvokeLeakEmailAfterSubmit,
  updateDeviceMode,
} from "../../lib/iot";
import {
  LAB_PART_INFO,
  LAB_PART_LABELS,
  LAB_PART_ORDER,
  type LabPartId,
} from "./labContent";
import { LabSchematic } from "./LabSchematic";

export type LabWorkbenchProps = {
  moisture: number;
  threshold: number;
  valveOpen: boolean;
  zoneId?: string;
  deviceId?: string;
  onCloudSynced?: () => void;
};

const PART_ICONS: Record<
  LabPartId,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  pots: "water-outline",
  buzzer: "volume-high-outline",
  leds: "bulb-outline",
  mcu: "hardware-chip-outline",
  valve: "swap-horizontal-outline",
  wires: "git-network-outline",
};

export function LabWorkbench({
  moisture,
  threshold,
  valveOpen,
  zoneId,
  deviceId,
  onCloudSynced,
}: LabWorkbenchProps) {
  const [followLive, setFollowLive] = useState(true);
  const [simMoisture, setSimMoisture] = useState(moisture);
  const [simValveOpen, setSimValveOpen] = useState(valveOpen);
  const [selectedPart, setSelectedPart] = useState<LabPartId | null>(null);
  const [sending, setSending] = useState(false);

  const prevZoneValve = useRef(valveOpen);

  useEffect(() => {
    if (followLive) setSimMoisture(moisture);
  }, [moisture, followLive]);

  useEffect(() => {
    if (followLive) {
      setSimValveOpen(valveOpen);
    } else if (valveOpen !== prevZoneValve.current) {
      setSimValveOpen(valveOpen);
    }
    prevZoneValve.current = valveOpen;
  }, [valveOpen, followLive]);

  const m = followLive ? moisture : simMoisture;
  const vOpen = followLive ? valveOpen : simValveOpen;
  const overThreshold = m >= threshold;
  const leakOrShutoff = overThreshold || !vOpen;
  const greenLit = !leakOrShutoff;
  const redLit = leakOrShutoff;

  const canSendCloud = Boolean(zoneId && deviceId);

  const moisturePresets = useMemo(
    () => buildMoisturePresets(threshold),
    [threshold],
  );

  const sendToCloud = useCallback(async () => {
    if (!zoneId || !deviceId) return;
    setSending(true);
    try {
      await updateDeviceMode(deviceId, "virtual");
      const res = await submitReading(zoneId, m, "virtual");
      const email = res?.leak_detected
        ? await tryInvokeLeakEmailAfterSubmit(res)
        : null;
      onCloudSynced?.();
      let msg = res?.leak_detected
        ? "Leak detected — the valve may have closed."
        : "Reading saved to your zone.";
      if (email?.attempted) {
        if (email.emailed) msg += "\n\nLeak alert email sent.";
        else if (email.userMessage) msg += `\n\nEmail: ${email.userMessage}`;
      }
      Alert.alert("Saved", msg);
    } catch (e) {
      Alert.alert("Could not send", formatError(e));
    } finally {
      setSending(false);
    }
  }, [zoneId, deviceId, m, onCloudSynced]);

  return (
    <View>
      {/* 1 — The diagram */}
      <View className="rounded-3xl border border-indigo-500/30 overflow-hidden bg-[#070b14] mb-5">
        <View className="px-4 pt-4 pb-2 bg-[#0c1020] border-b border-indigo-950/80">
          <Text className="text-indigo-200 text-lg font-bold">How your system works</Text>
          <Text className="text-slate-500 text-sm mt-1 leading-5">
            Tap any block to learn what it does. The valve at the bottom shows your current state.
          </Text>
        </View>
        <LabSchematic
          moisture={m}
          threshold={threshold}
          valveOpen={vOpen}
          greenLit={greenLit}
          redLit={redLit}
          buzzerAlarm={leakOrShutoff}
          onSelectPart={(id) => setSelectedPart((p) => (p === id ? null : id))}
          onLayout={() => {}}
        />
      </View>

      {/* Part info (shows below diagram when tapped) */}
      {selectedPart ? (
        <View className="bg-slate-900 rounded-2xl p-4 border border-slate-700 border-l-4 border-l-teal-500 mb-5">
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name={PART_ICONS[selectedPart]} size={20} color="#2dd4bf" />
            <Text className="text-white font-bold text-lg">
              {LAB_PART_INFO[selectedPart].title}
            </Text>
          </View>
          <Text className="text-slate-400 text-sm leading-6">
            {LAB_PART_INFO[selectedPart].body}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedPart(null)}
            className="mt-4 self-start bg-teal-600/20 px-4 py-2 rounded-xl border border-teal-500/20"
          >
            <Text className="text-teal-300 font-semibold text-sm">Got it</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2 mb-5">
          {LAB_PART_ORDER.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={LAB_PART_LABELS[id]}
              onPress={() => setSelectedPart(id)}
              className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 active:opacity-70"
            >
              <Ionicons name={PART_ICONS[id]} size={16} color="#94a3b8" />
              <Text className="text-slate-400 text-xs font-medium">
                {LAB_PART_LABELS[id]}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* 2 — Simulation controls */}
      <View className="rounded-[22px] border border-slate-800/90 bg-slate-900/80 overflow-hidden mb-4">
        <View className="px-4 pt-4 pb-3 border-b border-slate-800/80 bg-slate-950/50">
          <Text className="text-white text-lg font-bold">Try different values</Text>
          <Text className="text-slate-500 text-sm mt-1 leading-5">
            By default this uses your real zone data. Turn that off to practice with fake numbers.
          </Text>
        </View>

        <View className="px-4 py-4 gap-5">
          {/* Live toggle */}
          <View className="flex-row items-center justify-between min-h-[52px]">
            <View className="flex-1 pr-4">
              <Text className="text-white text-base font-medium">Use real data</Text>
              <Text className="text-slate-500 text-sm">From your zone (same as Monitor)</Text>
            </View>
            <Switch
              accessibilityLabel="Use real zone data"
              value={followLive}
              onValueChange={(v) => {
                setFollowLive(v);
                if (!v) {
                  setSimMoisture(moisture);
                  setSimValveOpen(valveOpen);
                }
              }}
              trackColor={{ false: "#334155", true: "#115e59" }}
              thumbColor={followLive ? "#2dd4bf" : "#94a3b8"}
            />
          </View>

          {!followLive ? (
            <>
              {/* Moisture slider */}
              <View>
                <Text className="text-slate-300 text-sm font-medium mb-2">Moisture level</Text>
                <View className="flex-row items-center gap-3">
                  <Text className="text-3xl font-bold text-teal-300 w-20 tabular-nums">
                    {Math.round(m)}%
                  </Text>
                  <Slider
                    accessibilityLabel="Moisture percentage"
                    style={{ flex: 1, height: 48 }}
                    minimumValue={0}
                    maximumValue={100}
                    value={simMoisture}
                    onValueChange={setSimMoisture}
                    minimumTrackTintColor="#14b8a6"
                    maximumTrackTintColor="#334155"
                    thumbTintColor="#2dd4bf"
                  />
                </View>
              </View>

              {/* Quick presets — percentages follow your zone leak limit */}
              <View className="flex-row gap-2 flex-wrap">
                {moisturePresets.map((p) => (
                  <Pressable
                    key={p.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Set moisture to ${p.value} percent, ${p.label}`}
                    onPress={() => setSimMoisture(p.value)}
                    className="flex-1 min-w-[72px] items-center py-3 rounded-xl bg-slate-800 border border-slate-700 active:opacity-70"
                  >
                    <Ionicons name={p.icon} size={20} color="#94a3b8" />
                    <Text className="text-slate-200 text-[10px] font-semibold mt-1 text-center">
                      {p.label}
                    </Text>
                    <Text className="text-slate-500 text-[10px] mt-0.5">{p.value}%</Text>
                  </Pressable>
                ))}
              </View>

              {/* Valve toggle */}
              <View className="flex-row items-center justify-between min-h-[52px]">
                <View className="flex-1 pr-4">
                  <Text className="text-slate-200 text-base font-medium">Valve open</Text>
                  <Text className="text-slate-500 text-sm">Toggle to simulate shutoff</Text>
                </View>
                <Switch
                  accessibilityLabel="Simulated valve open"
                  value={simValveOpen}
                  onValueChange={setSimValveOpen}
                  trackColor={{ false: "#7f1d1d", true: "#14532d" }}
                  thumbColor={simValveOpen ? "#4ade80" : "#fca5a5"}
                />
              </View>
            </>
          ) : (
            <View className="bg-slate-950/60 rounded-2xl px-4 py-4 border border-slate-800 flex-row items-center gap-3">
              <Ionicons name="radio-outline" size={20} color="#2dd4bf" />
              <Text className="text-slate-300 text-sm flex-1">
                Using live zone: {m.toFixed(0)}% moisture · valve{" "}
                {vOpen ? "open" : "closed"}
              </Text>
            </View>
          )}

          {/* Send button */}
          {canSendCloud ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Send ${Math.round(m)} percent to cloud`}
              onPress={sendToCloud}
              disabled={sending}
              className="bg-teal-600 rounded-2xl py-4 px-4 items-center border border-teal-400/25 active:opacity-90"
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                  <Text className="text-white font-bold text-base">
                    Send {Math.round(m)}% to cloud
                  </Text>
                </View>
              )}
            </Pressable>
          ) : (
            <View className="bg-amber-950/35 border border-amber-900/50 rounded-2xl px-4 py-4 flex-row items-center gap-3">
              <Ionicons name="information-circle-outline" size={20} color="#fbbf24" />
              <Text className="text-amber-100 text-sm flex-1 leading-5">
                Open Monitor once to create your zone, then come back here to send readings.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
