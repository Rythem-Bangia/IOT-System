import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { formatError } from "../../lib/formatError";
import { invokeAiHub } from "../../lib/aiHub";
import {
  resetValve,
  sendLeakEmail,
  submitReading,
  updateDeviceMode,
} from "../../lib/iot";

type Phase =
  | "idle"
  | "flowing"
  | "detecting"
  | "processing"
  | "cloud"
  | "closing"
  | "alarm"
  | "email"
  | "ai"
  | "done";

export type SimulationResult = {
  leakDetected: boolean;
  leakEventId?: string;
  valveClosed: boolean;
  responseMs?: number;
  moistureSent: number;
  threshold: number;
  emailSent?: boolean;
  emailError?: string;
  zoneName: string;
  source: "virtual" | "physical";
};

type Props = {
  zoneId: string;
  deviceId: string;
  threshold: number;
  zoneName: string;
  location: string;
  /** When false, demo calls reset (reopens valve; cloud last_moisture → 0) before submitting. */
  zoneValveOpen?: boolean;
  onDone: (result?: SimulationResult) => void;
};

/* ─── Animated water particles ─── */
function WaterParticles({ flowing }: { flowing: boolean }) {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;
  const loops = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (flowing) {
      const make = (a: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(a, {
              toValue: 1,
              duration: 1600,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
            Animated.timing(a, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        );
      loops.current = Animated.parallel([
        make(a1, 0),
        make(a2, 500),
        make(a3, 1000),
      ]);
      loops.current.start();
    } else {
      loops.current?.stop();
      a1.setValue(0);
      a2.setValue(0);
      a3.setValue(0);
    }
    return () => loops.current?.stop();
  }, [flowing, a1, a2, a3]);

  if (!flowing) return null;

  return (
    <>
      {[a1, a2, a3].map((a, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            top: 5,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: "#38bdf8",
            opacity: a.interpolate({
              inputRange: [0, 0.2, 0.8, 1],
              outputRange: [0, 1, 1, 0],
            }),
            transform: [
              {
                translateX: a.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 240],
                }),
              },
            ],
          }}
        />
      ))}
    </>
  );
}

/* ─── Leak drops ─── */
function LeakDrops({ visible }: { visible: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      loop.current = Animated.loop(
        Animated.timing(a, {
          toValue: 1,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      );
      loop.current.start();
    } else {
      loop.current?.stop();
      a.setValue(0);
    }
    return () => loop.current?.stop();
  }, [visible, a]);

  if (!visible) return null;

  return (
    <View style={{ position: "absolute", top: 20, left: "55%", width: 30, height: 50 }}>
      {[0, 10, 20].map((left, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left,
            width: 4,
            height: 8,
            borderRadius: 2,
            backgroundColor: "#38bdf8",
            opacity: a.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: i % 2 === 0 ? [0.3, 1, 0.3] : [1, 0.3, 1],
            }),
            transform: [
              {
                translateY: a.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 30 + i * 5],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

/* ─── Step flow indicator ─── */
function FlowStep({
  icon,
  label,
  status,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  status: "pending" | "active" | "done";
  color: string;
}) {
  return (
    <View className="items-center" style={{ width: 54 }}>
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{
          backgroundColor:
            status === "done"
              ? "#064e3b"
              : status === "active"
                ? "#312e81"
                : "#1e293b",
          borderWidth: status === "active" ? 2 : 1,
          borderColor:
            status === "active"
              ? "#818cf8"
              : status === "done"
                ? "#059669"
                : "#334155",
        }}
      >
        {status === "active" ? (
          <ActivityIndicator size="small" color="#2dd4bf" />
        ) : status === "done" ? (
          <Ionicons name="checkmark" size={18} color="#6ee7b7" />
        ) : (
          <Ionicons name={icon} size={16} color={color} />
        )}
      </View>
      <Text
        className={`text-[9px] font-bold mt-1 text-center ${
          status === "done"
            ? "text-emerald-400"
            : status === "active"
              ? "text-teal-300"
              : "text-slate-600"
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

type LogEntry = {
  id: number;
  text: string;
  type: "info" | "success" | "error" | "warn";
};

/* ─── Main component ─── */
export function LiveDemo({
  zoneId,
  deviceId,
  threshold,
  zoneName,
  location,
  zoneValveOpen = true,
  onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [running, setRunning] = useState(false);
  const [valveOpen, setValveOpen] = useState(true);
  const [sensorReading, setSensorReading] = useState<number | null>(null);
  const [leakVisible, setLeakVisible] = useState(false);
  const [waterFlowing, setWaterFlowing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const logId = useRef(0);
  const cancelled = useRef(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const leakMoisture = Math.min(100, threshold + 20);
  const locLabel = location || zoneName;

  const STEPS: Phase[] = [
    "flowing",
    "detecting",
    "processing",
    "cloud",
    "closing",
    "alarm",
    "email",
    "ai",
  ];

  const stepStatus = useCallback(
    (step: Phase): "pending" | "active" | "done" => {
      const cur = STEPS.indexOf(phase);
      const target = STEPS.indexOf(step);
      if (cur < 0 || target < 0) return "pending";
      if (target < cur || phase === "done") return "done";
      if (target === cur) return "active";
      return "pending";
    },
    [phase],
  );

  const addLog = useCallback(
    (text: string, type: LogEntry["type"] = "info") => {
      logId.current += 1;
      setLogs((prev) =>
        [{ id: logId.current, text, type }, ...prev].slice(0, 20),
      );
    },
    [],
  );

  useEffect(() => {
    return () => pulseLoop.current?.stop();
  }, []);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      const check = setInterval(() => {
        if (cancelled.current) {
          clearTimeout(t);
          clearInterval(check);
          resolve();
        }
      }, 100);
    });

  const runDemo = useCallback(async () => {
    cancelled.current = false;
    setRunning(true);
    setLogs([]);
    setAiBrief(null);
    setValveOpen(true);
    setSensorReading(null);
    setLeakVisible(false);
    setWaterFlowing(false);

    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.current.start();

    try {
      setPhase("flowing");
      setWaterFlowing(true);
      addLog(`Water flowing through pipe at "${locLabel}"`, "info");
      await wait(2500);
      if (cancelled.current) return;

      setPhase("detecting");
      setLeakVisible(true);
      setSensorReading(leakMoisture);
      addLog(
        `Leak detected! Moisture ${leakMoisture}% exceeds ${threshold}%`,
        "warn",
      );
      await wait(2200);
      if (cancelled.current) return;

      setPhase("processing");
      addLog(`MCU: ${leakMoisture}% >= ${threshold}% → CLOSE VALVE`, "info");
      await wait(1500);
      if (cancelled.current) return;

      setPhase("cloud");
      await updateDeviceMode(deviceId, "virtual");
      if (!zoneValveOpen) {
        addLog(
          "Valve was closed — reset reopening it (last moisture → 0% in cloud)…",
          "info",
        );
        await resetValve(zoneId);
      }
      addLog("Sending leak reading to Supabase…", "info");
      const res = await submitReading(zoneId, leakMoisture, "virtual");
      if (cancelled.current) return;
      addLog(
        res?.leak_detected
          ? `Cloud confirmed leak (${res.response_ms ?? "—"}ms)`
          : "Reading saved",
        "success",
      );
      await wait(800);
      if (cancelled.current) return;

      setPhase("closing");
      setWaterFlowing(false);
      if (res?.leak_detected) {
        setValveOpen(false);
        addLog("VALVE CLOSED — water supply cut off", "success");
      } else {
        setValveOpen(true);
        addLog(
          "Cloud did not create a leak (moisture below DB threshold or valve already closed). Check Monitor threshold and reset valve, then run again.",
          "warn",
        );
      }
      await wait(2000);
      if (cancelled.current) return;

      setPhase("alarm");
      addLog("Buzzer + red LED activated", "warn");
      await wait(1200);
      if (cancelled.current) return;

      setPhase("email");
      let emailOk = false;
      let emailErrMsg: string | undefined;
      if (res?.leak_event_id) {
        addLog("Sending email alert…", "info");
        try {
          const mail = await sendLeakEmail(res.leak_event_id);
          if (cancelled.current) return;
          emailOk = Boolean(mail?.emailed);
          if (!emailOk) emailErrMsg = mail?.message ?? "Email skipped";
          addLog(
            mail?.emailed
              ? "Email sent to your inbox"
              : mail?.message ?? "Email skipped",
            mail?.emailed ? "success" : "warn",
          );
        } catch (e) {
          if (cancelled.current) return;
          emailErrMsg = formatError(e);
          addLog(`Email error: ${emailErrMsg}`, "error");
        }
      } else {
        addLog("No new leak event — email skipped", "info");
      }
      await wait(800);
      if (cancelled.current) return;

      setPhase("ai");
      addLog("AI analyzing incident…", "info");
      try {
        const aiPayload: Record<string, unknown> = {
          zone_id: zoneId,
          simulation_result: {
            leak_detected: Boolean(res?.leak_detected),
            valve_closed: Boolean(res?.valve_closed),
            response_ms: res?.response_ms,
            moisture_sent: leakMoisture,
            threshold,
            email_sent: emailOk,
            email_error: emailErrMsg,
            source: "virtual",
          },
        };
        const { reply } = await invokeAiHub("simulate_analysis", aiPayload);
        if (!cancelled.current) {
          setAiBrief(reply);
          addLog("AI brief ready", "success");
        }
      } catch (e) {
        if (!cancelled.current) {
          addLog(`AI: ${formatError(e)}`, "warn");
        }
      }
      await wait(600);
      if (cancelled.current) return;

      setPhase("done");
      setLeakVisible(false);
      addLog("Simulation complete", "success");
      onDone({
        leakDetected: Boolean(res?.leak_detected),
        leakEventId: res?.leak_event_id,
        valveClosed: Boolean(res?.valve_closed),
        responseMs: res?.response_ms,
        moistureSent: leakMoisture,
        threshold,
        emailSent: emailOk,
        emailError: emailErrMsg,
        zoneName: locLabel,
        source: "virtual",
      });
    } catch (e) {
      Alert.alert("Demo error", formatError(e));
      addLog(`Error: ${formatError(e)}`, "error");
    } finally {
      setRunning(false);
      pulseLoop.current?.stop();
    }
  }, [
    zoneId,
    deviceId,
    threshold,
    leakMoisture,
    locLabel,
    zoneValveOpen,
    onDone,
    addLog,
    pulseAnim,
  ]);

  const resetDemo = useCallback(async () => {
    setRunning(true);
    try {
      await resetValve(zoneId);
      onDone();
      setPhase("idle");
      setValveOpen(true);
      setSensorReading(null);
      setLeakVisible(false);
      setWaterFlowing(false);
      setAiBrief(null);
      setLogs([]);
      addLog("Valve reopened, system reset", "success");
    } catch (e) {
      Alert.alert("Reset failed", formatError(e));
    } finally {
      setRunning(false);
    }
  }, [zoneId, onDone, addLog]);

  const stopDemo = useCallback(() => {
    cancelled.current = true;
    setRunning(false);
    setWaterFlowing(false);
    pulseLoop.current?.stop();
    addLog("Stopped by user", "warn");
  }, [addLog]);

  return (
    <View className="bg-slate-900/90 rounded-[22px] border border-teal-500/25 overflow-hidden mb-5">
      {/* Header */}
      <View className="px-4 pt-4 pb-3 bg-slate-950/80 border-b border-teal-950/50">
        <View className="flex-row items-center gap-2">
          <Ionicons name="water" size={20} color="#2dd4bf" />
          <Text className="text-white text-lg font-bold flex-1">
            Live simulation
          </Text>
          {running ? (
            <Animated.View
              style={{
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.3],
                }),
              }}
            >
              <View className="bg-rose-600/30 px-2.5 py-1 rounded-full border border-rose-500/40">
                <Text className="text-rose-300 text-[10px] font-black tracking-wider">
                  LIVE
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </View>
        <Text className="text-slate-500 text-sm mt-1">
          {locLabel} · threshold {threshold}%
        </Text>
      </View>

      {/* ─── Visual pipe diagram ─── */}
      <View className="mx-4 mt-4 mb-2">
        <View
          className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden"
          style={{ height: 180 }}
        >
          {/* Labels */}
          <View className="absolute top-2 left-3 z-10 flex-row items-center gap-1">
            <Ionicons name="water" size={10} color="#0ea5e9" />
            <Text className="text-sky-400 text-[9px] font-bold uppercase">
              Supply
            </Text>
          </View>
          <View className="absolute top-2 right-3 z-10">
            <Text className="text-slate-600 text-[9px] font-bold uppercase">
              {locLabel}
            </Text>
          </View>

          {/* Main pipe */}
          <View className="absolute top-[42px] left-4 right-4">
            <View
              style={{
                height: 20,
                backgroundColor: waterFlowing ? "#0c4a6e" : "#1e293b",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: waterFlowing ? "#0369a1" : "#334155",
                overflow: "hidden",
              }}
            >
              <WaterParticles flowing={waterFlowing} />
            </View>
          </View>

          {/* Valve on pipe */}
          <View className="absolute top-[22px] left-5 z-20 items-center">
            <View
              className="items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: valveOpen ? "#064e3b" : "#4c0519",
                borderWidth: 2,
                borderColor: valveOpen ? "#059669" : "#e11d48",
              }}
            >
              <Ionicons
                name={valveOpen ? "lock-open" : "lock-closed"}
                size={18}
                color={valveOpen ? "#6ee7b7" : "#fda4af"}
              />
            </View>
            <Text
              className={`text-[8px] font-black mt-0.5 ${valveOpen ? "text-emerald-400" : "text-rose-400"}`}
            >
              {valveOpen ? "OPEN" : "CLOSED"}
            </Text>
          </View>

          {/* Sensor on pipe */}
          <View className="absolute top-[22px] right-[25%] z-20 items-center">
            <View
              className="items-center justify-center"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor:
                  sensorReading !== null ? "#164e63" : "#1e293b",
                borderWidth: 2,
                borderColor:
                  sensorReading !== null ? "#06b6d4" : "#334155",
              }}
            >
              <Ionicons
                name="speedometer"
                size={18}
                color={sensorReading !== null ? "#22d3ee" : "#64748b"}
              />
            </View>
            <Text
              className={`text-[8px] font-black mt-0.5 ${sensorReading !== null ? "text-cyan-400" : "text-slate-600"}`}
            >
              {sensorReading !== null ? `${sensorReading}%` : "SENSOR"}
            </Text>
          </View>

          {/* Leak drops */}
          <LeakDrops visible={leakVisible} />

          {/* Leak puddle */}
          {leakVisible ? (
            <View className="absolute bottom-3 left-[50%] z-10">
              <View className="flex-row gap-0.5">
                {[10, 16, 12, 18, 10, 8].map((w, i) => (
                  <View
                    key={i}
                    style={{
                      width: w,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: "#0ea5e9",
                      opacity: 0.3 + (i % 3) * 0.15,
                    }}
                  />
                ))}
              </View>
              <Text className="text-sky-400 text-[8px] font-black mt-1 text-center">
                LEAK DETECTED
              </Text>
            </View>
          ) : null}

          {/* Water cut off label */}
          {!valveOpen && phase !== "idle" ? (
            <View className="absolute top-[70px] left-[20%] z-10">
              <View className="bg-rose-900/70 px-3 py-1.5 rounded-lg border border-rose-700/50">
                <Text className="text-rose-200 text-[10px] font-bold text-center">
                  WATER SUPPLY CUT OFF
                </Text>
              </View>
            </View>
          ) : null}

          {/* MCU at bottom */}
          <View className="absolute bottom-3 left-4 z-10 flex-row items-center gap-2">
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor:
                  stepStatus("processing") === "done"
                    ? "#312e81"
                    : "#1e293b",
                borderWidth: 1,
                borderColor:
                  stepStatus("processing") === "done"
                    ? "#6366f1"
                    : "#334155",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="hardware-chip"
                size={14}
                color={
                  stepStatus("processing") === "done"
                    ? "#a78bfa"
                    : "#64748b"
                }
              />
            </View>
            <Text
              className={`text-[8px] font-bold ${stepStatus("processing") === "done" ? "text-teal-400" : "text-slate-600"}`}
            >
              MCU
            </Text>
          </View>

          {/* Cloud at bottom right */}
          <View className="absolute bottom-3 right-4 z-10 flex-row items-center gap-2">
            <Text
              className={`text-[8px] font-bold ${stepStatus("cloud") === "done" ? "text-cyan-400" : "text-slate-600"}`}
            >
              CLOUD
            </Text>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor:
                  stepStatus("cloud") === "done" ? "#312e81" : "#1e293b",
                borderWidth: 1,
                borderColor:
                  stepStatus("cloud") === "done" ? "#6366f1" : "#334155",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="cloud"
                size={14}
                color={
                  stepStatus("cloud") === "done" ? "#818cf8" : "#64748b"
                }
              />
            </View>
          </View>
        </View>
      </View>

      {/* ─── Step flow bar ─── */}
      <View className="px-2 py-3">
        <ScrollViewHorizontal>
          <View className="flex-row items-center justify-between px-2">
            {(
              [
                { phase: "flowing" as Phase, icon: "water-outline" as const, label: "Flow", color: "#38bdf8" },
                { phase: "detecting" as Phase, icon: "speedometer-outline" as const, label: "Detect", color: "#22d3ee" },
                { phase: "processing" as Phase, icon: "hardware-chip-outline" as const, label: "MCU", color: "#a78bfa" },
                { phase: "cloud" as Phase, icon: "cloud-upload-outline" as const, label: "Cloud", color: "#818cf8" },
                { phase: "closing" as Phase, icon: "lock-closed-outline" as const, label: "Valve", color: "#fda4af" },
                { phase: "alarm" as Phase, icon: "volume-high-outline" as const, label: "Alarm", color: "#fbbf24" },
                { phase: "email" as Phase, icon: "mail-outline" as const, label: "Email", color: "#a5b4fc" },
                { phase: "ai" as Phase, icon: "sparkles-outline" as const, label: "AI", color: "#c084fc" },
              ] as const
            ).map((s, i) => (
              <React.Fragment key={s.phase}>
                {i > 0 ? (
                  <View
                    style={{
                      width: 8,
                      height: 2,
                      backgroundColor:
                        stepStatus(s.phase) === "done" ? "#059669" : "#334155",
                      marginHorizontal: 1,
                    }}
                  />
                ) : null}
                <FlowStep
                  icon={s.icon}
                  label={s.label}
                  status={stepStatus(s.phase)}
                  color={s.color}
                />
              </React.Fragment>
            ))}
          </View>
        </ScrollViewHorizontal>
      </View>

      {/* Status message */}
      <View className="px-4 pb-3">
        <View
          className={`rounded-xl px-4 py-3 border ${
            phase === "done"
              ? "bg-emerald-950/40 border-emerald-800/40"
              : phase === "idle"
                ? "bg-slate-800 border-slate-700/50"
                : "bg-teal-950/35 border-teal-800/40"
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              phase === "done"
                ? "text-emerald-200"
                : phase === "idle"
                  ? "text-slate-400"
                  : "text-teal-100"
            }`}
          >
            {phase === "idle"
              ? "Tap Start to begin the simulation"
              : phase === "flowing"
                ? "Water is flowing through the pipe…"
                : phase === "detecting"
                  ? `Moisture rising… ${leakMoisture}% detected!`
                  : phase === "processing"
                    ? "MCU analyzing sensor data…"
                    : phase === "cloud"
                      ? "Sending reading to cloud…"
                      : phase === "closing"
                        ? "Valve closing — shutting off water!"
                        : phase === "alarm"
                          ? "On-site alarm activated"
                            : phase === "email"
                            ? "Sending email notification…"
                            : phase === "ai"
                              ? "AI analyzing the incident…"
                              : "Simulation complete — system protected"}
          </Text>
        </View>
      </View>

      {/* System log */}
      {logs.length > 0 ? (
        <View className="px-4 pb-3">
          <View className="bg-slate-950 rounded-xl border border-slate-800 p-3">
            <Text className="text-slate-600 text-[9px] font-bold uppercase tracking-wider mb-2">
              System log
            </Text>
            {logs.slice(0, 8).map((l) => (
              <View key={l.id} className="flex-row gap-2 mb-1">
                <Text
                  className={`text-[10px] ${
                    l.type === "success"
                      ? "text-emerald-400"
                      : l.type === "error"
                        ? "text-rose-400"
                        : l.type === "warn"
                          ? "text-amber-400"
                          : "text-slate-500"
                  }`}
                >
                  {l.type === "success"
                    ? "+"
                    : l.type === "error"
                      ? "x"
                      : l.type === "warn"
                        ? "!"
                        : ">"}
                </Text>
                <Text className="text-slate-400 text-[10px] flex-1 leading-[14px]">
                  {l.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* AI incident brief */}
      {aiBrief ? (
        <View className="px-4 pb-3">
          <View className="bg-violet-950/50 rounded-2xl border border-violet-800/40 p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="sparkles" size={16} color="#c084fc" />
              <Text className="text-violet-200 text-xs font-black uppercase tracking-wider">
                AI incident brief
              </Text>
            </View>
            <Text className="text-violet-100/90 text-xs leading-[18px]">
              {aiBrief}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Controls */}
      <View className="px-4 pb-4 gap-3">
        {phase === "idle" ? (
          <Pressable
            accessibilityRole="button"
            onPress={runDemo}
            className="bg-teal-600 rounded-2xl py-4 items-center border border-teal-400/30 active:opacity-90"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="play" size={20} color="#fff" />
              <Text className="text-white font-bold text-base">
                Start simulation
              </Text>
            </View>
          </Pressable>
        ) : running ? (
          <Pressable
            accessibilityRole="button"
            onPress={stopDemo}
            className="bg-rose-600/80 rounded-2xl py-4 items-center border border-rose-400/25 active:opacity-80"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="stop" size={20} color="#fff" />
              <Text className="text-white font-bold text-base">Stop</Text>
            </View>
          </Pressable>
        ) : (
          <View className="gap-3">
            {phase === "done" ? (
              <View className="bg-emerald-950/60 rounded-2xl px-4 py-3 border border-emerald-800/50">
                <Text className="text-emerald-200 text-sm font-semibold">
                  Simulation complete — valve closed, email sent
                </Text>
                <Text className="text-slate-400 text-xs mt-1 leading-4">
                  Check your inbox and the History tab. Reset below to reopen
                  the valve and run again.
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={resetDemo}
              disabled={running}
              className="bg-slate-800 rounded-2xl py-3.5 items-center border border-slate-700 active:opacity-80"
            >
              <Text className="text-slate-200 font-bold text-sm">
                Reset valve & run again
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function ScrollViewHorizontal({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
