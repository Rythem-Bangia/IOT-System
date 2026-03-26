import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  buildPipelineNodeHints,
  buildPipelineStory,
} from "../data/labDynamic";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from "react-native";

const STEP_MS = 2800;

type NodeDef = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
};

const NODES: NodeDef[] = [
  { id: "sensor", label: "Sensor at pipe", icon: "water-outline", color: "#38bdf8" },
  { id: "mcu", label: "MCU / edge logic", icon: "hardware-chip-outline", color: "#818cf8" },
  { id: "valve", label: "Solenoid valve", icon: "toggle-outline", color: "#2dd4bf" },
  { id: "alarm", label: "Local alarm", icon: "notifications-outline", color: "#fbbf24" },
  { id: "cloud", label: "Supabase cloud", icon: "cloud-outline", color: "#a78bfa" },
  { id: "email", label: "Edge + email", icon: "mail-outline", color: "#fb7185" },
  { id: "app", label: "This mobile app", icon: "phone-portrait-outline", color: "#34d399" },
];

type Props = {
  valveOpen?: boolean;
  moisture?: number;
  threshold?: number;
  zoneName?: string;
};

export function ProjectSystem3DView({
  valveOpen = true,
  moisture = 0,
  threshold = 65,
  zoneName,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const pulse = useMemo(() => new Animated.Value(1), []);

  const story = useMemo(
    () => buildPipelineStory(moisture, threshold, valveOpen, zoneName),
    [moisture, threshold, valveOpen, zoneName],
  );

  const nodeHints = useMemo(
    () => buildPipelineNodeHints(moisture, threshold, valveOpen),
    [moisture, threshold, valveOpen],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((s) => (s + 1) % NODES.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.08,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, pulse]);

  return (
    <View className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 mb-4">
      <View className="flex-row items-center justify-between px-3 pt-3 pb-2">
        <View className="flex-1 pr-2">
          <Text className="text-sky-300 text-xs font-semibold uppercase tracking-wide">
            Full project — 3D flow
          </Text>
          <Text className="text-slate-400 text-[11px] mt-0.5 leading-4">
            End-to-end: hardware → cloud → notifications → this app. One working system, not a parts list.
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setPlaying(!playing)}
            className="bg-sky-600 px-2.5 py-1.5 rounded-lg"
          >
            <Text className="text-white text-[10px] font-bold">
              {playing ? "Pause" : "Play"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setStep(0)}
            className="bg-slate-700 px-2.5 py-1.5 rounded-lg"
          >
            <Text className="text-slate-200 text-[10px] font-bold">Reset</Text>
          </Pressable>
        </View>
      </View>

      {/* Stepped timeline (no rotateX — it can hide content on some Android GPUs) */}
      <View className="px-3 pb-3">
        <View>
          {NODES.map((n, i) => {
            const active = step === i;
            const past = step > i;
            const stepDepth = i * 4;
            const hint = nodeHints[i] ?? "";
            return (
              <View
                key={n.id}
                className="flex-row items-start"
                style={{ marginBottom: i === NODES.length - 1 ? 0 : 10, marginLeft: stepDepth }}
              >
                <View className="items-center w-[52px]">
                  {i > 0 ? (
                    <View
                      className="w-0.5 rounded-full mb-1"
                      style={{
                        height: 18,
                        backgroundColor: past || active ? "#38bdf8" : "#475569",
                        opacity: active ? 1 : past ? 0.8 : 0.35,
                        shadowColor: "#38bdf8",
                        shadowOpacity: active ? 0.65 : 0,
                        shadowRadius: 5,
                      }}
                    />
                  ) : (
                    <View className="h-0.5" />
                  )}
                  <NodeTile node={n} active={active} pulse={pulse} />
                </View>
                <View className="flex-1 pl-2 pt-0.5">
                  <Text
                    className={`text-[12px] font-semibold leading-4 ${
                      active ? "text-sky-200" : past ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    {n.label}
                  </Text>
                  <Text className="text-[9px] text-slate-600 mt-0.5">{hint}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View
        className="h-3 mx-4 mb-2 rounded-md bg-slate-800"
        style={{ transform: [{ skewX: "-8deg" }] }}
      />

      <View className="bg-slate-950 px-3 pb-4 pt-2 border-t border-teal-950/40">
        <Text className="text-teal-50 font-semibold text-sm leading-5">
          {story[step]?.title ?? ""}
        </Text>
        <Text className="text-slate-400 text-xs mt-2 leading-5">
          {story[step]?.body ?? ""}
        </Text>
        <Text className="text-slate-600 text-[10px] mt-3">
          Step {step + 1} of {NODES.length}
          {!playing ? " — paused" : ""}
        </Text>

        <View className="mt-3 pt-3 border-t border-slate-800">
          <Text className="text-slate-500 text-[10px] font-semibold uppercase mb-1">
            Live project state
          </Text>
          {zoneName ? (
            <Text className="text-slate-400 text-xs">Zone: {zoneName}</Text>
          ) : null}
          <Text className="text-slate-400 text-xs mt-1">
            Moisture {moisture.toFixed(0)}% · threshold {threshold}% · valve{" "}
            {valveOpen ? "open" : "closed"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function NodeTile({
  node,
  active,
  pulse,
}: {
  node: NodeDef;
  active: boolean;
  pulse: Animated.Value;
}) {
  const face = (
    <View
      className={`w-12 h-12 rounded-2xl items-center justify-center border-2 ${
        active ? "border-sky-400 bg-sky-950" : "border-slate-600 bg-slate-800"
      }`}
      style={{
        shadowColor: "#000",
        shadowOpacity: active ? 0.5 : 0.2,
        shadowRadius: active ? 12 : 4,
        shadowOffset: { width: 0, height: active ? 8 : 3 },
        elevation: active ? 10 : 4,
      }}
    >
      <Ionicons
        name={node.icon}
        size={22}
        color={active ? node.color : "#64748b"}
      />
    </View>
  );

  if (active) {
    return (
      <Animated.View style={{ transform: [{ scale: pulse }] }}>{face}</Animated.View>
    );
  }
  return face;
}
