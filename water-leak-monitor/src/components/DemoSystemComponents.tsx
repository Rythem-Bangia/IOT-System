import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import {
  AlarmSchematic,
  AppSchematic,
  CloudSchematic,
  EmailSchematic,
  McuSchematic,
  SensorSchematic,
  ValveSchematic,
} from "./DemoSchematic";

type Props = {
  threshold: number;
  moisture: number;
  valveOpen: boolean;
  lastLeak: {
    responseMs: number | null;
    emailSent: boolean;
    emailError?: string;
  } | null;
  /**
   * When false, hides the static horizontal “signal flow” strip — use on the Water tab
   * where the 3D project flow view is shown instead.
   */
  showSignalFlowStrip?: boolean;
};

type FlowStep = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
};

const FLOW: FlowStep[] = [
  { id: "s", label: "Sensor", icon: "water-outline", color: "#0284c7" },
  { id: "m", label: "MCU", icon: "hardware-chip-outline", color: "#4f46e5" },
  { id: "v", label: "Valve", icon: "toggle-outline", color: "#0d9488" },
  { id: "a", label: "Alarm", icon: "notifications-outline", color: "#d97706" },
  { id: "c", label: "Cloud", icon: "cloud-outline", color: "#7c3aed" },
  { id: "e", label: "Email", icon: "mail-outline", color: "#e11d48" },
  { id: "p", label: "App", icon: "phone-portrait-outline", color: "#0f766e" },
];

const COMPONENTS: {
  id: string;
  name: string;
  role: string;
  demoNote: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
}[] = [
  {
    id: "sensor",
    name: "Moisture sensors",
    role: "Measure water presence / humidity at pipe base or critical zones; output analog or digital to the MCU.",
    demoNote: "Here: slider / presets = simulated sensor % sent as virtual readings.",
    icon: "water-outline",
    iconBg: "bg-sky-100",
    iconColor: "#0284c7",
  },
  {
    id: "mcu",
    name: "Microcontroller (MCU)",
    role: "Reads sensors, compares to threshold, timestamps events, drives valve driver and local alarms.",
    demoNote: "Here: Supabase RPC + app replace on-device logic; same decision outcome.",
    icon: "hardware-chip-outline",
    iconBg: "bg-indigo-100",
    iconColor: "#4f46e5",
  },
  {
    id: "valve",
    name: "Solenoid valve + driver",
    role: "Cuts main or branch water when a leak is confirmed — automatic shutoff without human action.",
    demoNote: "Here: valve state is stored in Supabase (`valve_open`). CLOSED = flow stopped.",
    icon: "toggle-outline",
    iconBg: "bg-teal-100",
    iconColor: "#0d9488",
  },
  {
    id: "alarm",
    name: "Local alarm (buzzer / LED)",
    role: "Immediate on-site alert so occupants notice before checking the phone.",
    demoNote: "Physical only; not simulated in this app — shown for completeness.",
    icon: "notifications-outline",
    iconBg: "bg-amber-100",
    iconColor: "#d97706",
  },
  {
    id: "cloud",
    name: "Cloud (Supabase)",
    role: "Stores zones, readings, leak events, enforces threshold logic via RPC, RLS for your account.",
    demoNote: "All Send actions hit `submit_sensor_reading` → closes valve + logs when over threshold.",
    icon: "cloud-outline",
    iconBg: "bg-violet-100",
    iconColor: "#7c3aed",
  },
  {
    id: "email",
    name: "Email (Edge Function + Resend)",
    role: "Sends alert to your profile alert email after a leak event is created.",
    demoNote: "Runs after leak detection if Resend is configured in Supabase.",
    icon: "mail-outline",
    iconBg: "bg-rose-100",
    iconColor: "#e11d48",
  },
  {
    id: "app",
    name: "Mobile app (Expo)",
    role: "Monitor zones, history, reset valve after repair, demo lab.",
    demoNote:
      "Monitor + Demo + Water + History: live `zones` and `leak_events`; Water tab is the full walkthrough.",
    icon: "phone-portrait-outline",
    iconBg: "bg-teal-100",
    iconColor: "#0f766e",
  },
];

function StepRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <View className="flex-row gap-3 mb-3">
      <View
        className={`w-7 h-7 rounded-full items-center justify-center ${
          done ? "bg-emerald-500" : "bg-slate-200"
        }`}
      >
        <Text className="text-white text-xs font-bold">{done ? "✓" : "•"}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 font-medium text-sm">{label}</Text>
        <Text className="text-slate-500 text-xs mt-0.5 leading-5">{detail}</Text>
      </View>
    </View>
  );
}

function SchematicFor({
  id,
  valveClosed,
}: {
  id: string;
  valveClosed: boolean;
}) {
  switch (id) {
    case "sensor":
      return <SensorSchematic />;
    case "mcu":
      return <McuSchematic />;
    case "valve":
      return <ValveSchematic closed={valveClosed} />;
    case "alarm":
      return <AlarmSchematic />;
    case "cloud":
      return <CloudSchematic />;
    case "email":
      return <EmailSchematic />;
    case "app":
      return <AppSchematic />;
    default:
      return null;
  }
}

export function DemoSystemComponents({
  threshold,
  moisture,
  valveOpen,
  lastLeak,
  showSignalFlowStrip = true,
}: Props) {
  const leakActive = !valveOpen;
  const overThreshold = moisture >= threshold;
  const valveClosed = !valveOpen;

  return (
    <View className="mb-4">
      {showSignalFlowStrip ? (
        <>
          <Text className="text-lg font-bold text-slate-900 mb-2">
            Visual — signal flow
          </Text>
          <Text className="text-slate-500 text-sm mb-3 leading-5">
            Left-to-right: how data and actions move in the full system (hardware +
            cloud). Your phone shows the same valve and history as the cloud state.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4 -mx-1"
            contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 4 }}
          >
            {FLOW.map((step, i) => (
              <View key={step.id} className="flex-row items-center">
                <View className="items-center w-[76px]">
                  <View
                    className="w-14 h-14 rounded-2xl items-center justify-center bg-white border border-slate-200 shadow-sm"
                    style={{ shadowOpacity: 0.06, shadowRadius: 4 }}
                  >
                    <Ionicons name={step.icon} size={28} color={step.color} />
                  </View>
                  <Text className="text-[10px] text-slate-700 font-medium mt-1 text-center" numberOfLines={2}>
                    {step.label}
                  </Text>
                </View>
                {i < FLOW.length - 1 ? (
                  <Text className="text-slate-400 text-lg px-0.5 mb-6">→</Text>
                ) : null}
              </View>
            ))}
          </ScrollView>

          <View className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-200">
            <Text className="text-slate-600 text-xs leading-5">
              <Text className="font-semibold text-slate-800">Flow:</Text> sensor → MCU
              decides → valve + local alarm → readings/events to cloud → email to you
              → this app shows status & reset.
            </Text>
          </View>
        </>
      ) : null}

      <Text className="text-lg font-bold text-slate-900 mb-2">
        Automatic response (threshold: {threshold}%)
      </Text>
      <Text className="text-slate-500 text-sm mb-3 leading-5">
        When moisture is at or above the threshold and you send a reading (or
        auto-close triggers), the cloud closes the valve and logs a leak event —
        same rule as real hardware.
      </Text>

      <View
        className={`rounded-2xl p-4 mb-4 border flex-row items-start gap-3 ${
          leakActive
            ? "bg-red-50 border-red-200"
            : "bg-emerald-50 border-emerald-200"
        }`}
      >
        <View className="w-12 h-12 rounded-xl bg-white items-center justify-center border border-slate-200">
          <Ionicons
            name="toggle-outline"
            size={26}
            color={leakActive ? "#dc2626" : "#059669"}
          />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Valve (solenoid state in cloud)
          </Text>
          <Text className="text-xl font-bold text-slate-900">
            {valveOpen ? "OPEN — water can flow" : "CLOSED — automatic shutoff active"}
          </Text>
          <Text className="text-slate-600 text-sm mt-2">
            {valveOpen
              ? "No active leak trip for this zone. Raise moisture and send, or use Run leak demo."
              : "Threshold was exceeded; RPC set the valve to closed. Use Reset valve after inspection."}
          </Text>
        </View>
      </View>

      {lastLeak ? (
        <View className="bg-white rounded-2xl p-4 mb-4 border border-slate-100">
          <Text className="text-slate-900 font-semibold mb-3">
            Last leak handling
          </Text>
          <StepRow
            done
            label="Threshold exceeded"
            detail={`Reading ≥ ${threshold}% triggered leak logic.`}
          />
          <StepRow
            done
            label="Valve commanded closed"
            detail="Supabase RPC set `valve_open = false` for this zone."
          />
          <StepRow
            done={lastLeak.responseMs != null && lastLeak.responseMs > 0}
            label="Response timing"
            detail={
              lastLeak.responseMs != null
                ? `~${lastLeak.responseMs} ms (server-side timing)`
                : "Recorded when available."
            }
          />
          <StepRow
            done={lastLeak.emailSent}
            label="Email notification"
            detail={
              lastLeak.emailSent
                ? "Edge Function sent alert to your profile email."
                : lastLeak.emailError
                  ? `Not sent: ${lastLeak.emailError}`
                  : "Configure Resend + deploy send-leak-alert for email."
            }
          />
          <StepRow
            done
            label="History"
            detail="Event stored under History tab for audit."
          />
        </View>
      ) : null}

      <Text className="text-lg font-bold text-slate-900 mb-2 mt-2">
        Components — icon, schematic & role
      </Text>
      <Text className="text-slate-500 text-sm mb-3">
        Each block has a vector icon, a simple app-drawn schematic, and what it does
        in the real install vs this demo.
      </Text>

      {COMPONENTS.map((c) => (
        <View
          key={c.id}
          className="bg-white rounded-2xl p-3 mb-3 border border-slate-100 overflow-hidden"
        >
          <View className="flex-row gap-3">
            <View
              className={`w-16 h-16 rounded-2xl items-center justify-center ${c.iconBg}`}
            >
              <Ionicons name={c.icon} size={34} color={c.iconColor} />
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 font-semibold text-base">{c.name}</Text>
              <Text className="text-slate-600 text-xs mt-1 leading-5">{c.role}</Text>
            </View>
          </View>

          <View className="mt-3">
            <Text className="text-slate-500 text-[10px] font-semibold uppercase mb-1.5">
              Visual / schematic
            </Text>
            <SchematicFor id={c.id} valveClosed={valveClosed} />
          </View>

          <View className="bg-slate-50 rounded-lg px-2 py-2 mt-3">
            <Text className="text-ocean-800 text-xs font-medium">In this demo</Text>
            <Text className="text-slate-600 text-xs mt-0.5 leading-5">
              {c.demoNote}
            </Text>
          </View>
        </View>
      ))}

      <View className="bg-slate-100 rounded-xl p-3 mt-2">
        <Text className="text-slate-600 text-xs leading-5">
          Current UI: moisture {moisture.toFixed(0)}% vs threshold {threshold}% —{" "}
          {overThreshold ? "at/above (will trip on next qualifying send)" : "below"}.
        </Text>
      </View>
    </View>
  );
}
