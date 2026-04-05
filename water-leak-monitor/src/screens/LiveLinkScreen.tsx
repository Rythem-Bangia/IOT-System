import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Slider from "@react-native-community/slider";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { useAuth } from "../context/AuthContext";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { formatError } from "../lib/formatError";
import {
  ensureDefaultSetup,
  fetchZones,
  resetValve,
  submitReading,
  tryInvokeLeakEmailAfterSubmit,
  validateAlertSetup,
  type AlertSetupStatus,
  type ZoneRow,
} from "../lib/iot";
import { brand } from "../theme/brand";

const PRESETS = [
  { label: "Dry", value: 15, color: "#34d399" },
  { label: "Normal", value: 40, color: "#2dd4bf" },
  { label: "Damp", value: 65, color: "#fbbf24" },
  { label: "Wet", value: 80, color: "#f97316" },
  { label: "Leak!", value: 95, color: "#f43f5e" },
] as const;

export function LiveLinkScreen() {
  const { user } = useAuth();
  const scrollBottom = useScrollBottomInset(28);

  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoEmail, setAutoEmail] = useState(true);
  const [autoResetValve, setAutoResetValve] = useState(true);

  const [moistureDraft, setMoistureDraft] = useState(30);
  const [manualInput, setManualInput] = useState("30");
  const [lastSubmitted, setLastSubmitted] = useState<number | null>(null);
  const [lastStatus, setLastStatus] = useState("Waiting for first reading");
  const [lastUpdateAt, setLastUpdateAt] = useState("");

  const [autoMode, setAutoMode] = useState(false);
  const [autoIntervalSec, setAutoIntervalSec] = useState(3);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const [leakResult, setLeakResult] = useState<{
    detected: boolean;
    emailSent?: boolean;
    emailError?: string;
    moisture: number;
    threshold: number;
  } | null>(null);

  const [emailSetup, setEmailSetup] = useState<AlertSetupStatus | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    await ensureDefaultSetup(user.id);
    const zones = await fetchZones();
    setZone(zones[0] ?? null);
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

  const checkEmailSetup = useCallback(async () => {
    setCheckingEmail(true);
    try {
      const status = await validateAlertSetup();
      setEmailSetup(status);
      if (!status.ok) {
        Alert.alert(
          "Email setup incomplete",
          status.issues.map((i) => `- ${i.message}`).join("\n") +
            "\n\nFix these in Settings before leak emails can send.",
        );
      }
    } catch (e) {
      Alert.alert("Check failed", formatError(e));
    } finally {
      setCheckingEmail(false);
    }
  }, []);

  const sendMoisture = useCallback(
    async (moisture: number) => {
      if (!zone) {
        Alert.alert("No zone", "Open Monitor first to create your zone.");
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      try {
        const clamped = Math.round(Math.max(0, Math.min(100, moisture)));
        const currentThreshold = zone.moisture_threshold ?? 65;
        const willExceed = clamped >= currentThreshold;

        if (autoResetValve && !zone.valve_open && willExceed) {
          await resetValve(zone.id);
          const refreshed = await fetchZones();
          const z = refreshed[0] ?? zone;
          setZone(z);
        }

        const res = await submitReading(zone.id, clamped, "virtual");
        setLastSubmitted(clamped);
        setLastUpdateAt(new Date().toLocaleTimeString());

        let emailSent = false;
        let emailError: string | undefined;

        if (res.leak_detected && autoEmail) {
          const mail = await tryInvokeLeakEmailAfterSubmit(res);
          if (mail.attempted && mail.emailed) {
            emailSent = true;
            setLastStatus(`${clamped}% - LEAK! Valve closed, email sent`);
          } else if (mail.attempted && mail.userMessage) {
            emailError = mail.userMessage;
            setLastStatus(`${clamped}% - LEAK! Valve closed. Email failed: ${mail.userMessage}`);
          } else {
            setLastStatus(
              `${clamped}% - LEAK! Valve closed${autoEmail ? " (email not attempted)" : ""}`,
            );
          }
        } else if (res.leak_detected) {
          setLastStatus(`${clamped}% - LEAK! Valve closed (email toggle off)`);
        } else {
          setLastStatus(`${clamped}% - safe, below threshold`);
        }

        if (res.leak_detected) {
          setLeakResult({
            detected: true,
            emailSent,
            emailError,
            moisture: clamped,
            threshold: currentThreshold,
          });
        } else {
          setLeakResult(null);
        }

        const zones = await fetchZones();
        setZone(zones[0] ?? zone);
      } catch (e) {
        setLastStatus(`Error: ${formatError(e)}`);
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [autoEmail, autoResetValve, zone],
  );

  const handleResetValve = useCallback(async () => {
    if (!zone) return;
    try {
      await resetValve(zone.id);
      const zones = await fetchZones();
      setZone(zones[0] ?? zone);
      setLeakResult(null);
      setLastStatus("Valve reopened - system reset");
      setLastUpdateAt(new Date().toLocaleTimeString());
    } catch (e) {
      Alert.alert("Reset failed", formatError(e));
    }
  }, [zone]);

  const stopAuto = useCallback(() => {
    if (autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoMode(false);
  }, []);

  const startAuto = useCallback(() => {
    if (!zone) {
      Alert.alert("No zone", "Open Monitor first to create your zone.");
      return;
    }
    stopAuto();
    setAutoMode(true);
    void sendMoisture(moistureDraft);
    const ms = Math.max(1, autoIntervalSec) * 1000;
    autoTimerRef.current = setInterval(() => {
      void sendMoisture(moistureDraft);
    }, ms);
  }, [autoIntervalSec, moistureDraft, sendMoisture, stopAuto, zone]);

  useEffect(() => {
    return () => stopAuto();
  }, [stopAuto]);

  useEffect(() => {
    if (!autoMode || !autoTimerRef.current) return;
    clearInterval(autoTimerRef.current);
    const ms = Math.max(1, autoIntervalSec) * 1000;
    autoTimerRef.current = setInterval(() => {
      void sendMoisture(moistureDraft);
    }, ms);
  }, [moistureDraft, autoIntervalSec, autoMode, sendMoisture]);

  const onSliderChange = (v: number) => {
    const rounded = Math.round(v);
    setMoistureDraft(rounded);
    setManualInput(String(rounded));
  };

  const onManualSubmit = () => {
    const n = Number(manualInput);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      Alert.alert("Invalid", "Enter a value from 0 to 100.");
      return;
    }
    const clamped = Math.round(n);
    setMoistureDraft(clamped);
    setManualInput(String(clamped));
    void sendMoisture(clamped);
  };

  const onPreset = (value: number) => {
    setMoistureDraft(value);
    setManualInput(String(value));
    void sendMoisture(value);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-shell items-center justify-center">
        <ActivityIndicator color={brand.accent} size="large" />
        <Text className="text-slate-500 mt-4 text-sm">Loading...</Text>
      </View>
    );
  }

  const threshold = zone?.moisture_threshold ?? 65;
  const cloudMoisture = Math.round(zone?.last_moisture ?? 0);
  const isOver = cloudMoisture >= threshold;

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
        eyebrow="Live Link"
        title="Tinkercad bridge"
        subtitle="Set moisture from Tinkercad Serial Monitor here — it goes straight to the cloud. No external server needed."
      />

      {/* ── Live status ── */}
      <View className="flex-row gap-2 mb-3">
        <View className="flex-1 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90 items-center">
          <Text className="text-slate-500 text-[10px] font-bold uppercase">Cloud moisture</Text>
          <Text className={`text-lg font-black mt-0.5 ${isOver ? "text-rose-400" : "text-emerald-400"}`}>
            {cloudMoisture}%
          </Text>
        </View>
        <View className="flex-1 bg-slate-900/90 rounded-2xl px-3 py-3 border border-slate-800/90 items-center">
          <Text className="text-slate-500 text-[10px] font-bold uppercase">Threshold</Text>
          <Text className="text-amber-300 text-lg font-black mt-0.5">{threshold}%</Text>
        </View>
        <View
          className={`flex-1 rounded-2xl px-3 py-3 border items-center ${
            zone?.valve_open
              ? "bg-emerald-950/40 border-emerald-800/50"
              : "bg-rose-950/40 border-rose-800/50"
          }`}
        >
          <Text className="text-slate-500 text-[10px] font-bold uppercase">Valve</Text>
          <Text className={`text-lg font-black mt-0.5 ${zone?.valve_open ? "text-emerald-300" : "text-rose-300"}`}>
            {zone?.valve_open ? "Open" : "Closed"}
          </Text>
        </View>
      </View>

      {/* ── Leak result banner ── */}
      {leakResult?.detected ? (
        <View className={`mb-4 rounded-2xl border px-4 py-3 ${
          leakResult.emailSent
            ? "border-emerald-700/50 bg-emerald-950/40"
            : leakResult.emailError
              ? "border-rose-700/50 bg-rose-950/40"
              : "border-amber-700/50 bg-amber-950/40"
        }`}>
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons
              name={leakResult.emailSent ? "checkmark-circle" : "warning"}
              size={22}
              color={leakResult.emailSent ? "#34d399" : leakResult.emailError ? "#fb7185" : "#fbbf24"}
            />
            <Text className={`font-bold text-sm flex-1 ${
              leakResult.emailSent ? "text-emerald-200" : leakResult.emailError ? "text-rose-200" : "text-amber-200"
            }`}>
              {leakResult.emailSent
                ? "Leak detected - email sent!"
                : leakResult.emailError
                  ? "Leak detected - email FAILED"
                  : "Leak detected - valve closed"}
            </Text>
          </View>
          <Text className="text-slate-300 text-xs leading-[18px] mb-1">
            Moisture {leakResult.moisture}% exceeded threshold {leakResult.threshold}%
          </Text>
          {leakResult.emailError ? (
            <View className="mt-1 bg-rose-950/60 border border-rose-800/40 rounded-xl px-3 py-2">
              <Text className="text-rose-300 text-xs font-bold mb-1">Why email failed:</Text>
              <Text className="text-rose-200/80 text-xs leading-[16px]">{leakResult.emailError}</Text>
            </View>
          ) : null}
          {!leakResult.emailSent && !leakResult.emailError ? (
            <Text className="text-amber-300/70 text-xs mt-1">
              Email toggle is off, or no new leak event was created (valve was already closed).
            </Text>
          ) : null}
          <View className="flex-row gap-2 mt-3">
            <Pressable
              onPress={() => void handleResetValve()}
              className="flex-1 bg-emerald-700/85 rounded-2xl py-3 items-center border border-emerald-500/30 active:opacity-90"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="refresh-outline" size={16} color="#dcfce7" />
                <Text className="text-emerald-100 font-bold text-xs">Reset valve</Text>
              </View>
            </Pressable>
          </View>
          <Text className="text-slate-500 text-[10px] mt-2 text-center">
            In Tinkercad: press the pushbutton on D5 to reset there too
          </Text>
        </View>
      ) : null}

      {/* ── Valve closed banner (no recent leak result) ── */}
      {!zone?.valve_open && !leakResult?.detected ? (
        <View className="mb-4 rounded-2xl border border-rose-700/50 bg-rose-950/40 px-4 py-3">
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="warning" size={20} color="#fb7185" />
            <Text className="text-rose-200 font-bold text-sm flex-1">Valve is closed</Text>
          </View>
          <Text className="text-rose-300/80 text-xs leading-[18px] mb-3">
            The valve is closed from a previous leak. Reset it to test again.
          </Text>
          <Pressable
            onPress={() => void handleResetValve()}
            className="bg-emerald-700/85 rounded-2xl py-3 items-center border border-emerald-500/30 active:opacity-90"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="refresh-outline" size={18} color="#dcfce7" />
              <Text className="text-emerald-100 font-bold text-sm">Reset valve (reopen)</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* ── Email setup check ── */}
      <SectionCard
        title="Email setup"
        description="Check if leak alert emails are configured correctly"
        icon="mail-outline"
      >
        {emailSetup ? (
          <View className={`rounded-xl border px-3 py-2.5 mb-3 ${
            emailSetup.ok
              ? "bg-emerald-950/40 border-emerald-700/40"
              : "bg-rose-950/40 border-rose-700/40"
          }`}>
            <Text className={`text-xs font-bold ${emailSetup.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {emailSetup.ok ? "Ready - emails will send" : "Not ready - fix these:"}
            </Text>
            {!emailSetup.ok ? (
              <Text className="text-slate-300 text-xs mt-1 leading-[16px]">
                {emailSetup.issues.map((i) => `- ${i.message}`).join("\n")}
              </Text>
            ) : (
              <Text className="text-slate-400 text-xs mt-1">
                Alert email: {emailSetup.alertEmail ?? "not set"}
              </Text>
            )}
          </View>
        ) : null}
        <Pressable
          onPress={() => void checkEmailSetup()}
          disabled={checkingEmail}
          className="bg-slate-800/90 border border-slate-700/80 rounded-2xl py-3 items-center active:opacity-85"
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name="shield-checkmark-outline" size={16} color={brand.accent} />
            <Text className="text-teal-300 font-semibold text-sm">
              {checkingEmail ? "Checking..." : "Check email setup"}
            </Text>
          </View>
        </Pressable>
      </SectionCard>

      {/* ── Moisture control panel ── */}
      <SectionCard
        title="Set moisture"
        description="Mirror the % from Tinkercad Serial Monitor, or drag the slider"
        icon="water-outline"
      >
        <View className="items-center mb-2">
          <Text className="text-5xl font-black text-teal-300">{moistureDraft}%</Text>
          {moistureDraft >= threshold ? (
            <Text className="text-rose-400 text-xs font-bold mt-1">
              Above threshold ({threshold}%) - will trigger leak!
            </Text>
          ) : (
            <Text className="text-emerald-400/70 text-xs mt-1">
              Below threshold ({threshold}%)
            </Text>
          )}
        </View>

        <Slider
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={moistureDraft}
          onValueChange={onSliderChange}
          minimumTrackTintColor={moistureDraft >= threshold ? "#f43f5e" : "#14b8a6"}
          maximumTrackTintColor="#334155"
          thumbTintColor={moistureDraft >= threshold ? "#fb7185" : "#2dd4bf"}
        />

        <View className="flex-row gap-2 mt-3 items-center">
          <TextInput
            className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-base text-center"
            placeholder="0-100"
            placeholderTextColor="#64748b"
            value={manualInput}
            onChangeText={setManualInput}
            keyboardType="number-pad"
            returnKeyType="send"
            onSubmitEditing={onManualSubmit}
          />
          <Pressable
            onPress={onManualSubmit}
            disabled={submitting}
            className={`rounded-2xl px-5 py-3 border active:opacity-90 ${
              Number(manualInput) >= threshold
                ? "bg-rose-600 border-rose-400/25"
                : "bg-teal-600 border-teal-400/25"
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text className="text-white font-bold text-sm">Send</Text>
            )}
          </Pressable>
        </View>

        <View className="flex-row gap-2 mt-3 flex-wrap">
          {PRESETS.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => onPreset(p.value)}
              disabled={submitting}
              className="flex-1 min-w-[60px] rounded-2xl py-3 items-center border border-slate-700/80 active:opacity-80"
              style={{ backgroundColor: `${p.color}22` }}
            >
              <Text style={{ color: p.color }} className="text-xs font-black">
                {p.value}%
              </Text>
              <Text className="text-slate-400 text-[10px] font-bold mt-0.5">{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => void sendMoisture(moistureDraft)}
          disabled={submitting}
          className={`rounded-2xl py-4 items-center border active:opacity-90 mt-4 ${
            moistureDraft >= threshold
              ? "bg-rose-600 border-rose-400/25"
              : "bg-teal-600 border-teal-400/25"
          }`}
        >
          <View className="flex-row items-center gap-2">
            <Ionicons name={moistureDraft >= threshold ? "warning" : "push-outline"} size={18} color="#fff" />
            <Text className="text-white font-bold text-base">
              {submitting
                ? "Sending..."
                : moistureDraft >= threshold
                  ? `Send ${moistureDraft}% (will trigger leak!)`
                  : `Send ${moistureDraft}% to cloud`}
            </Text>
          </View>
        </Pressable>
      </SectionCard>

      {/* ── Auto-repeat mode ── */}
      <SectionCard
        title="Auto-repeat"
        description="Keep sending the current slider value at a fixed interval"
        icon="repeat-outline"
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-300 text-sm">Auto-send leak email</Text>
          <Switch
            value={autoEmail}
            onValueChange={setAutoEmail}
            trackColor={{ false: "#334155", true: "#14b8a6" }}
            thumbColor={autoEmail ? "#e2e8f0" : "#cbd5e1"}
          />
        </View>

        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-slate-300 text-sm">Auto-reset valve before leak</Text>
          <Switch
            value={autoResetValve}
            onValueChange={setAutoResetValve}
            trackColor={{ false: "#334155", true: "#14b8a6" }}
            thumbColor={autoResetValve ? "#e2e8f0" : "#cbd5e1"}
          />
        </View>

        <View className="flex-row items-center gap-3 mb-3">
          <Text className="text-slate-400 text-sm">Every</Text>
          <View className="flex-row items-center gap-1">
            {[2, 3, 5, 10].map((s) => (
              <Pressable
                key={s}
                onPress={() => setAutoIntervalSec(s)}
                className={`px-3 py-2 rounded-xl border ${
                  autoIntervalSec === s
                    ? "bg-teal-500/15 border-teal-400/40"
                    : "bg-slate-800/80 border-slate-700/80"
                } active:opacity-70`}
              >
                <Text
                  className={`text-sm font-bold ${
                    autoIntervalSec === s ? "text-teal-200" : "text-slate-400"
                  }`}
                >
                  {s}s
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="flex-row gap-2">
          {!autoMode ? (
            <Pressable
              onPress={startAuto}
              className="flex-1 bg-emerald-700/85 rounded-2xl py-3.5 items-center border border-emerald-500/30 active:opacity-90"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="play" size={18} color="#dcfce7" />
                <Text className="text-emerald-100 font-bold text-sm">Start auto-send</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={stopAuto}
              className="flex-1 bg-rose-700/85 rounded-2xl py-3.5 items-center border border-rose-500/30 active:opacity-90"
            >
              <View className="flex-row items-center gap-2">
                <Ionicons name="stop" size={18} color="#ffe4e6" />
                <Text className="text-rose-100 font-bold text-sm">Stop auto-send</Text>
              </View>
            </Pressable>
          )}
        </View>
      </SectionCard>

      {/* ── Status card ── */}
      <SectionCard
        title="Status"
        description="Last submission result"
        icon="information-circle-outline"
      >
        <View className="flex-row gap-2 mb-3">
          <View className="flex-1 bg-slate-950/80 rounded-xl border border-slate-800 px-3 py-2.5">
            <Text className="text-slate-500 text-[10px] font-bold uppercase">Last sent</Text>
            <Text className="text-teal-300 text-base font-black mt-1">
              {lastSubmitted != null ? `${lastSubmitted}%` : "-"}
            </Text>
          </View>
          <View className="flex-1 bg-slate-950/80 rounded-xl border border-slate-800 px-3 py-2.5">
            <Text className="text-slate-500 text-[10px] font-bold uppercase">At</Text>
            <Text className="text-slate-300 text-base font-black mt-1">
              {lastUpdateAt || "-"}
            </Text>
          </View>
          <View className="flex-1 bg-slate-950/80 rounded-xl border border-slate-800 px-3 py-2.5">
            <Text className="text-slate-500 text-[10px] font-bold uppercase">Mode</Text>
            <Text className={`text-base font-black mt-1 ${autoMode ? "text-amber-300" : "text-slate-400"}`}>
              {autoMode ? "Auto" : "Manual"}
            </Text>
          </View>
        </View>
        <Text className="text-slate-400 text-xs leading-[18px]">{lastStatus}</Text>
      </SectionCard>

      {/* ── How-to hint ── */}
      <View className="rounded-2xl px-4 py-3.5 border border-teal-900/40 bg-teal-950/20 mb-4 flex-row items-start gap-3">
        <View className="w-8 h-8 rounded-lg bg-teal-500/15 items-center justify-center mt-0.5">
          <Ionicons name="bulb-outline" size={18} color={brand.accent} />
        </View>
        <Text className="text-teal-100/85 text-[13px] flex-1 leading-[20px]">
          Open Tinkercad, run your simulation, read the moisture % from Serial Monitor, type it above
          and tap Send. The app handles the rest - cloud logic, valve control, and leak alerts.
        </Text>
      </View>
    </ScrollView>
  );
}
