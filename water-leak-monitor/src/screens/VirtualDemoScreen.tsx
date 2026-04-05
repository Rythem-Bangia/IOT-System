import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { DemoSystemComponents } from "../components/DemoSystemComponents";
import { useAuth } from "../context/AuthContext";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { formatError } from "../lib/formatError";
import {
  ensureDefaultSetup,
  fetchZones,
  resetValve,
  runSimulationForRoom,
  sendLeakEmail,
  submitReading,
  updateDeviceMode,
  type ZoneRow,
} from "../lib/iot";

type LastLeak = {
  responseMs: number | null;
  emailSent: boolean;
  emailError?: string;
};

/**
 * Virtual lab: moisture → Supabase RPC → automatic valve close + optional email.
 * Includes full component list and leak-response checklist.
 */
export function VirtualDemoScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { user } = useAuth();
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [moisture, setMoisture] = useState(40);
  const [busy, setBusy] = useState(false);
  const [autoTick, setAutoTick] = useState(false);
  const [autoCloseOnCross, setAutoCloseOnCross] = useState(false);
  const [lastLeak, setLastLeak] = useState<LastLeak | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMoistureRef = useRef<number | null>(null);
  const autoSubmittingRef = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    await ensureDefaultSetup(user.id);
    const zones = await fetchZones();
    const z = zones[0];
    if (!z) {
      setZone(null);
      return;
    }
    setZone(z);
    await updateDeviceMode(z.devices.id, "virtual");
    setMoisture(Math.min(100, z.last_moisture ?? 40));
    prevMoistureRef.current = null;
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => Alert.alert("Load error", formatError(e)))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!autoTick) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = setInterval(() => {
      setMoisture((m) => {
        const delta = (Math.random() - 0.42) * 10;
        return Math.max(0, Math.min(100, m + delta));
      });
    }, 2000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [autoTick]);

  useEffect(() => {
    if (!autoCloseOnCross) {
      prevMoistureRef.current = null;
    }
  }, [autoCloseOnCross]);

  const threshold = zone?.moisture_threshold ?? 65;

  /** When enabled, first crossing from below → at/above threshold sends one reading (automatic closure). */
  useEffect(() => {
    if (!zone || !autoCloseOnCross || busy || autoSubmittingRef.current) return;
    if (!zone.valve_open) return;

    const prev = prevMoistureRef.current;
    if (prev === null) {
      prevMoistureRef.current = moisture;
      return;
    }
    if (prev < threshold && moisture >= threshold) {
      autoSubmittingRef.current = true;
      void (async () => {
        try {
          await pushReadingInner({ silent: true });
        } finally {
          autoSubmittingRef.current = false;
          prevMoistureRef.current = moisture;
        }
      })();
      return;
    }
    prevMoistureRef.current = moisture;
  }, [moisture, autoCloseOnCross, zone, busy, threshold]);

  async function pushReadingInner(opts?: { silent?: boolean }) {
    if (!zone) return;
    const silent = opts?.silent ?? false;
    setBusy(true);
    try {
      const res = await submitReading(zone.id, moisture, "virtual");
      await load();

      if (res.leak_detected && res.leak_event_id) {
        let emailSent = false;
        let emailError: string | undefined;
        try {
          const mail = await sendLeakEmail(res.leak_event_id);
          emailSent = Boolean(mail?.emailed);
          if (!emailSent && mail && typeof mail === "object" && "message" in mail) {
            emailError = String((mail as { message?: string }).message);
          }
        } catch (e) {
          emailError = formatError(e);
        }
        setLastLeak({
          responseMs: res.response_ms ?? null,
          emailSent,
          emailError,
        });
        if (!silent) {
          Alert.alert(
            "Leak detected — valve closed automatically",
            `Response ~${res.response_ms ?? "—"} ms. Email: ${emailSent ? "sent" : emailError ?? "check Resend"}`,
          );
        }
      } else {
        if (!silent) {
          Alert.alert("Sent", "Moisture recorded; no leak trip (below threshold or valve already closed).");
        }
      }
    } catch (e) {
      if (!silent) Alert.alert("Send failed", formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function pushReading() {
    await pushReadingInner({ silent: false });
  }

  async function runLeakDemo() {
    if (!zone) return;
    const t = zone.moisture_threshold ?? 65;
    const target = Math.max(t + 15, 85);
    setMoisture(target);
    setBusy(true);
    try {
      const sim = await runSimulationForRoom(zone.name, target);
      await load();
      if (sim.leakDetected) {
        const emailSent = Boolean(sim.emailSent);
        const emailError = sim.emailMessage;
        setLastLeak({
          responseMs: sim.responseMs ?? null,
          emailSent,
          emailError,
        });
        Alert.alert(
          "Demo leak",
          emailSent
            ? "Moisture pushed above threshold. Valve closed; alert email sent."
            : `Moisture pushed above threshold. Valve closed. Email not sent: ${emailError ?? "check Settings → leak alert email and Resend secrets."}`,
        );
      } else {
        Alert.alert(
          "Demo",
          "Threshold not crossed — lower threshold in Supabase or raise moisture further.",
        );
      }
    } catch (e) {
      Alert.alert("Demo failed", formatError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!zone) return;
    try {
      await resetValve(zone.id);
      setMoisture(0);
      setLastLeak(null);
      prevMoistureRef.current = null;
      await load();
      Alert.alert(
        "Reset",
        "Valve reopened and last moisture cleared to 0%. You can run another leak demo.",
      );
    } catch (e) {
      Alert.alert("Reset failed", formatError(e));
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color="#0369a1" />
        <Text className="text-slate-500 mt-3">Preparing demo…</Text>
      </View>
    );
  }

  if (!zone) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center px-6">
        <Text className="text-slate-600 text-center">
          No zone found. Open Monitor once to create your default setup.
        </Text>
      </View>
    );
  }

  const overThreshold = moisture >= threshold;
  const barColor = overThreshold ? "bg-red-500" : "bg-ocean-500";

  return (
    <ScrollView
      className="flex-1 bg-slate-50 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: scrollBottom }}
    >
      <Text className="text-lg font-bold text-slate-900 mb-1">
        Virtual demo lab
      </Text>
      <Text className="text-slate-500 text-sm mb-4 leading-5">
        Moisture at or above the minimum threshold triggers automatic valve closure
        in the cloud (same RPC as production). Scroll down for the full component
        list, roles, and last leak checklist.
      </Text>

      <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-100">
        <Text className="text-slate-900 font-semibold">{zone.name}</Text>
        <Text className="text-slate-500 text-sm mt-1">
          Minimum (leak) threshold: {threshold}% moisture
        </Text>
        <Text className="text-4xl font-bold text-slate-900 mt-4">
          {moisture.toFixed(0)}%
        </Text>
        <Text className="text-slate-400 text-xs mb-2">simulated moisture</Text>
        <View className="h-3 bg-slate-200 rounded-full overflow-hidden mb-1">
          <View
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${moisture}%` }}
          />
        </View>
        <Text
          className={`text-xs mt-1 ${overThreshold ? "text-red-600 font-semibold" : "text-slate-500"}`}
        >
          {overThreshold
            ? "At or above threshold — send (or auto-close) trips shutoff if valve was open"
            : "Below threshold — safe"}
        </Text>
      </View>

      <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-100">
        <Text className="text-slate-800 font-medium mb-3">Adjust moisture</Text>
        <Slider
          minimumValue={0}
          maximumValue={100}
          value={moisture}
          onValueChange={setMoisture}
          minimumTrackTintColor="#0369a1"
          maximumTrackTintColor="#cbd5e1"
          thumbTintColor="#0ea5e9"
        />
        <View className="flex-row flex-wrap gap-2 mt-4">
          {[
            ["Dry", 18],
            ["Normal", 42],
            ["Damp", 58],
            ["Wet", 72],
          ].map(([label, v]) => (
            <Pressable
              key={label}
              onPress={() => setMoisture(v as number)}
              className="bg-slate-100 px-3 py-2 rounded-lg"
            >
              <Text className="text-slate-800 text-sm">{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-100 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-slate-900 font-semibold">Auto-close on cross</Text>
          <Text className="text-slate-500 text-xs mt-1 leading-5">
            When the slider crosses from below to at/above {threshold}%, send one
            reading automatically (valve closes if still open).
          </Text>
        </View>
        <Switch
          value={autoCloseOnCross}
          onValueChange={setAutoCloseOnCross}
          trackColor={{ false: "#cbd5e1", true: "#7dd3fc" }}
          thumbColor={autoCloseOnCross ? "#0369a1" : "#f4f4f5"}
        />
      </View>

      <Pressable
        onPress={pushReading}
        disabled={busy}
        className="bg-ocean-600 rounded-xl py-4 items-center mb-3"
      >
        <Text className="text-white font-bold">
          {busy ? "Sending…" : "Send reading to cloud"}
        </Text>
      </Pressable>

      <Pressable
        onPress={runLeakDemo}
        disabled={busy}
        className="bg-red-600 rounded-xl py-4 items-center mb-3"
      >
        <Text className="text-white font-bold">
          Run leak demo (jump above threshold)
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setAutoTick(!autoTick)}
        className="bg-slate-200 rounded-xl py-3 items-center mb-3"
      >
        <Text className="text-slate-800 font-medium">
          {autoTick ? "Stop random drift" : "Start random drift (visual only)"}
        </Text>
      </Pressable>

      {!zone.valve_open ? (
        <Pressable
          onPress={onReset}
          className="bg-slate-800 rounded-xl py-4 items-center mb-4"
        >
          <Text className="text-white font-semibold">Reset valve after demo</Text>
        </Pressable>
      ) : null}

      <DemoSystemComponents
        threshold={threshold}
        moisture={moisture}
        valveOpen={zone.valve_open}
        lastLeak={lastLeak}
      />
    </ScrollView>
  );
}
