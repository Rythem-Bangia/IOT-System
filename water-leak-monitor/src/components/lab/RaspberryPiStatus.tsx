import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

export type PhysicalReading = {
  id: string;
  moisture_value: number;
  source: string;
  recorded_at: string;
};

type PiStatus = "offline" | "online" | "leak";

type Props = {
  zoneId: string;
  threshold: number;
  onRequestAiCompare?: () => void;
};

/** Pi sends a heartbeat each poll (default 5s); allow extra slack for slow networks */
const STALE_SECONDS = 120;

export function RaspberryPiStatus({
  zoneId,
  threshold,
  onRequestAiCompare,
}: Props) {
  const [readings, setReadings] = useState<PhysicalReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const fetchReadings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("sensor_readings")
        .select("id, moisture_value, source, recorded_at")
        .eq("zone_id", zoneId)
        .eq("source", "physical")
        .order("recorded_at", { ascending: false })
        .limit(20);
      if (!error && data) setReadings(data as PhysicalReading[]);
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => {
    fetchReadings();
    const interval = setInterval(fetchReadings, 10_000);
    return () => clearInterval(interval);
  }, [fetchReadings]);

  const latest = readings[0] ?? null;
  const lastSeen = latest
    ? Math.round((Date.now() - new Date(latest.recorded_at).getTime()) / 1000)
    : null;

  const status: PiStatus =
    !latest || lastSeen === null || lastSeen > STALE_SECONDS
      ? "offline"
      : latest.moisture_value >= threshold
        ? "leak"
        : "online";

  useEffect(() => {
    if (status === "online") {
      pulseLoop.current?.stop();
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1200,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.current.start();
    } else if (status === "leak") {
      pulseLoop.current?.stop();
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(0);
    }
    return () => pulseLoop.current?.stop();
  }, [status, pulseAnim]);

  const statusColor =
    status === "leak"
      ? "#ef4444"
      : status === "online"
        ? "#10b981"
        : "#64748b";
  const statusBg =
    status === "leak"
      ? "bg-rose-950/50"
      : status === "online"
        ? "bg-emerald-950/40"
        : "bg-slate-900/90";
  const statusBorder =
    status === "leak"
      ? "border-rose-800/50"
      : status === "online"
        ? "border-emerald-800/40"
        : "border-slate-800/80";

  const recentAboveThreshold = readings.filter(
    (r) => r.moisture_value >= threshold,
  ).length;

  const avgMoisture =
    readings.length > 0
      ? Math.round(
          readings.reduce((s, r) => s + r.moisture_value, 0) / readings.length,
        )
      : null;

  const maxMoisture =
    readings.length > 0
      ? Math.round(Math.max(...readings.map((r) => r.moisture_value)))
      : null;

  function formatAgo(seconds: number): string {
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  }

  return (
    <View
      className={`rounded-[22px] border overflow-hidden mb-5 ${statusBg} ${statusBorder}`}
    >
      {/* Header */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
        className="px-4 pt-4 pb-3 flex-row items-center gap-3 active:opacity-85"
      >
        <View className="relative">
          <View
            className="w-11 h-11 rounded-2xl items-center justify-center"
            style={{
              backgroundColor:
                status === "leak"
                  ? "#7f1d1d"
                  : status === "online"
                    ? "#064e3b"
                    : "#1e293b",
              borderWidth: 2,
              borderColor: statusColor,
            }}
          >
            <Ionicons name="hardware-chip" size={22} color={statusColor} />
          </View>
          {status !== "offline" ? (
            <Animated.View
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: statusColor,
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.3],
                }),
              }}
            />
          ) : null}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-white text-base font-bold">
              Raspberry Pi
            </Text>
            <View
              className="px-2 py-0.5 rounded-full"
              style={{
                backgroundColor:
                  status === "leak"
                    ? "#991b1b"
                    : status === "online"
                      ? "#064e3b"
                      : "#334155",
              }}
            >
              <Text
                className="text-[9px] font-black uppercase tracking-wider"
                style={{ color: statusColor }}
              >
                {status === "leak"
                  ? "LEAK"
                  : status === "online"
                    ? "ONLINE"
                    : "OFFLINE"}
              </Text>
            </View>
          </View>
          <Text className="text-slate-500 text-xs mt-0.5">
            {status === "offline"
              ? "No recent physical data — run python3 main.py with cloud credentials (see raspberry-pi/README)"
              : `Last reading ${formatAgo(lastSeen ?? 0)} · ${readings.length} readings`}
          </Text>
        </View>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#64748b"
        />
      </Pressable>

      {loading ? (
        <View className="px-4 pb-4 items-center">
          <ActivityIndicator size="small" color="#64748b" />
        </View>
      ) : null}

      {/* Expanded content */}
      {expanded && !loading ? (
        <View className="px-4 pb-4">
          {/* Hardware diagram */}
          <View className="bg-slate-950 rounded-2xl border border-slate-800 p-3 mb-3">
            <Text className="text-slate-600 text-[9px] font-bold uppercase tracking-wider mb-2">
              Hardware pipeline
            </Text>
            <View className="flex-row items-center justify-between px-1">
              <PipelineNode
                icon="water"
                label="Sensor"
                color="#22d3ee"
                active={status !== "offline"}
              />
              <PipelineArrow active={status !== "offline"} />
              <PipelineNode
                icon="hardware-chip"
                label="Pi AI"
                color="#a78bfa"
                active={status !== "offline"}
              />
              <PipelineArrow active={status !== "offline"} />
              <PipelineNode
                icon="cloud-upload"
                label="Cloud"
                color="#818cf8"
                active={status !== "offline"}
              />
              <PipelineArrow active={status !== "offline"} />
              <PipelineNode
                icon="lock-closed"
                label="Valve"
                color={status === "leak" ? "#ef4444" : "#10b981"}
                active={status !== "offline"}
              />
              <PipelineArrow active={status === "leak"} />
              <PipelineNode
                icon="volume-high"
                label="Alarm"
                color="#fbbf24"
                active={status === "leak"}
              />
            </View>
          </View>

          {/* Stats row */}
          {readings.length > 0 ? (
            <View className="flex-row gap-2 mb-3">
              <StatCard
                label="Latest"
                value={`${latest?.moisture_value ?? 0}%`}
                color={
                  (latest?.moisture_value ?? 0) >= threshold
                    ? "#fda4af"
                    : "#2dd4bf"
                }
              />
              <StatCard
                label="Average"
                value={avgMoisture !== null ? `${avgMoisture}%` : "—"}
                color="#94a3b8"
              />
              <StatCard
                label="Peak"
                value={maxMoisture !== null ? `${maxMoisture}%` : "—"}
                color={
                  (maxMoisture ?? 0) >= threshold ? "#fbbf24" : "#94a3b8"
                }
              />
              <StatCard
                label="Leaks"
                value={String(recentAboveThreshold)}
                color={recentAboveThreshold > 0 ? "#ef4444" : "#10b981"}
              />
            </View>
          ) : null}

          {/* Recent readings list */}
          {readings.length > 0 ? (
            <View className="bg-slate-950 rounded-2xl border border-slate-800 p-3 mb-3">
              <Text className="text-slate-600 text-[9px] font-bold uppercase tracking-wider mb-2">
                Recent physical readings
              </Text>
              {readings.slice(0, 8).map((r) => {
                const isAbove = r.moisture_value >= threshold;
                const ago = Math.round(
                  (Date.now() - new Date(r.recorded_at).getTime()) / 1000,
                );
                return (
                  <View
                    key={r.id}
                    className="flex-row items-center gap-2 mb-1"
                  >
                    <View
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isAbove ? "#ef4444" : "#10b981",
                      }}
                    />
                    <Text
                      className={`text-[11px] font-bold w-10 ${isAbove ? "text-rose-400" : "text-emerald-400"}`}
                    >
                      {Math.round(r.moisture_value)}%
                    </Text>
                    <View
                      className="flex-1 h-1.5 rounded-full bg-slate-800"
                    >
                      <View
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.min(100, r.moisture_value)}%`,
                          backgroundColor: isAbove ? "#ef4444" : "#10b981",
                          opacity: 0.7,
                        }}
                      />
                    </View>
                    <Text className="text-slate-600 text-[10px] w-12 text-right">
                      {formatAgo(ago)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="bg-slate-950/60 rounded-2xl border border-slate-800 p-4 mb-3 items-center">
              <Ionicons
                name="hardware-chip-outline"
                size={28}
                color="#475569"
              />
              <Text className="text-slate-500 text-xs font-bold mt-2 text-center">
                No physical readings yet
              </Text>
              <Text className="text-slate-600 text-[11px] mt-1 text-center leading-4">
                In <Text className="text-slate-400 font-bold">raspberry-pi/</Text>, set{" "}
                <Text className="text-teal-400 font-bold">SUPABASE_EMAIL</Text> +{" "}
                <Text className="text-teal-400 font-bold">PASSWORD</Text> (app login), or{" "}
                <Text className="text-teal-400 font-bold">ZONE_ID</Text> +{" "}
                <Text className="text-teal-400 font-bold">DEVICE_SECRET</Text> from Supabase,
                then run <Text className="text-teal-400 font-bold">python3 main.py</Text>.
                You should see <Text className="text-slate-400">Cloud: ok</Text> in the terminal.
              </Text>
            </View>
          )}

          {/* AI compare button */}
          {readings.length > 0 && onRequestAiCompare ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRequestAiCompare}
              className="bg-violet-600/80 rounded-2xl py-3 items-center border border-violet-400/25 active:opacity-85"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text className="text-white font-bold text-sm">
                  AI: Compare physical vs virtual
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PipelineNode({
  icon,
  label,
  color,
  active,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  active: boolean;
}) {
  return (
    <View className="items-center" style={{ width: 44 }}>
      <View
        className="w-9 h-9 rounded-xl items-center justify-center"
        style={{
          backgroundColor: active ? `${color}15` : "#1e293b",
          borderWidth: 1,
          borderColor: active ? color : "#334155",
        }}
      >
        <Ionicons name={icon} size={16} color={active ? color : "#475569"} />
      </View>
      <Text
        className="text-[8px] font-bold mt-0.5"
        style={{ color: active ? color : "#475569" }}
      >
        {label}
      </Text>
    </View>
  );
}

function PipelineArrow({ active }: { active: boolean }) {
  return (
    <View
      className="flex-1 mx-0.5"
      style={{
        height: 2,
        backgroundColor: active ? "#334155" : "#1e293b",
        maxWidth: 16,
      }}
    />
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View className="flex-1 bg-slate-950 rounded-xl border border-slate-800 px-2 py-2 items-center">
      <Text className="text-slate-600 text-[8px] font-bold uppercase">
        {label}
      </Text>
      <Text className="text-sm font-black mt-0.5" style={{ color }}>
        {value}
      </Text>
    </View>
  );
}
