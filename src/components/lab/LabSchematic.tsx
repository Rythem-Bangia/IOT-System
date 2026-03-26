import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import type { LabPartId } from "./labContent";

type Props = {
  moisture: number;
  threshold: number;
  valveOpen: boolean;
  greenLit: boolean;
  redLit: boolean;
  buzzerAlarm: boolean;
  onSelectPart: (id: LabPartId) => void;
  onLayout: (e: LayoutChangeEvent) => void;
};

function Arrow() {
  return (
    <View className="items-center py-1">
      <View className="w-0.5 h-4 bg-indigo-700" />
      <Ionicons name="chevron-down" size={14} color="#6366f1" />
    </View>
  );
}

export function LabSchematic({
  moisture,
  threshold,
  valveOpen,
  greenLit,
  redLit,
  buzzerAlarm,
  onSelectPart,
  onLayout,
}: Props) {
  return (
    <View onLayout={onLayout} className="px-4 py-5">
      {/* Sensor / pots */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sensors"
        onPress={() => onSelectPart("pots")}
        className="bg-indigo-950 border-2 border-indigo-700 rounded-2xl p-4 active:opacity-70"
      >
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-xl bg-indigo-900 items-center justify-center">
            <Ionicons name="water-outline" size={24} color="#a5b4fc" />
          </View>
          <View className="flex-1">
            <Text className="text-indigo-200 text-base font-bold">Moisture sensors</Text>
            <Text className="text-slate-400 text-sm mt-0.5">
              Reading: {Math.round(moisture)}% · limit: {threshold}%
            </Text>
          </View>
          <View
            className={`px-2.5 py-1 rounded-lg ${moisture >= threshold ? "bg-rose-900/80" : "bg-emerald-900/80"}`}
          >
            <Text
              className={`text-xs font-bold ${moisture >= threshold ? "text-rose-300" : "text-emerald-300"}`}
            >
              {moisture >= threshold ? "OVER" : "OK"}
            </Text>
          </View>
        </View>
      </Pressable>

      <Arrow />

      {/* Wires */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Signal wires"
        onPress={() => onSelectPart("wires")}
        className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 active:opacity-70"
      >
        <View className="flex-row items-center gap-3">
          <Ionicons name="git-network-outline" size={18} color="#94a3b8" />
          <Text className="text-slate-300 text-sm font-medium flex-1">
            Signal wires carry data to the brain
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#475569" />
        </View>
      </Pressable>

      <Arrow />

      {/* MCU */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="MCU processor"
        onPress={() => onSelectPart("mcu")}
        className="bg-indigo-950 border-2 border-indigo-700 rounded-2xl p-4 active:opacity-70"
      >
        <View className="flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-xl bg-indigo-900 items-center justify-center">
            <Ionicons name="hardware-chip-outline" size={24} color="#a5b4fc" />
          </View>
          <View className="flex-1">
            <Text className="text-indigo-200 text-base font-bold">MCU (brain)</Text>
            <Text className="text-slate-400 text-sm mt-0.5">
              Compares moisture vs limit, decides what to do
            </Text>
          </View>
        </View>
      </Pressable>

      <Arrow />

      {/* Outputs row: buzzer + LEDs side by side */}
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buzzer alarm"
          onPress={() => onSelectPart("buzzer")}
          className={`flex-1 rounded-2xl p-4 active:opacity-70 border-2 ${
            buzzerAlarm
              ? "bg-amber-950/80 border-amber-600"
              : "bg-slate-900 border-slate-700"
          }`}
        >
          <View className="items-center">
            <Ionicons
              name="volume-high"
              size={28}
              color={buzzerAlarm ? "#fbbf24" : "#64748b"}
            />
            <Text
              className={`text-sm font-bold mt-2 ${buzzerAlarm ? "text-amber-300" : "text-slate-400"}`}
            >
              Buzzer
            </Text>
            <Text className="text-slate-500 text-xs mt-1">
              {buzzerAlarm ? "Sounding" : "Quiet"}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="LED indicators"
          onPress={() => onSelectPart("leds")}
          className="flex-1 bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 active:opacity-70"
        >
          <View className="items-center">
            <View className="flex-row gap-3">
              <View
                className={`w-7 h-7 rounded-full border-2 items-center justify-center ${
                  redLit
                    ? "bg-rose-500 border-rose-400"
                    : "bg-slate-800 border-slate-600"
                }`}
              >
                {redLit ? (
                  <View className="w-3 h-3 rounded-full bg-rose-200" />
                ) : null}
              </View>
              <View
                className={`w-7 h-7 rounded-full border-2 items-center justify-center ${
                  greenLit
                    ? "bg-emerald-500 border-emerald-400"
                    : "bg-slate-800 border-slate-600"
                }`}
              >
                {greenLit ? (
                  <View className="w-3 h-3 rounded-full bg-emerald-200" />
                ) : null}
              </View>
            </View>
            <Text className="text-slate-300 text-sm font-bold mt-2">LEDs</Text>
            <Text className="text-slate-500 text-xs mt-1">
              {greenLit ? "Green on" : "Red on"}
            </Text>
          </View>
        </Pressable>
      </View>

      <Arrow />

      {/* Valve — the main event */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Water valve, currently ${valveOpen ? "open" : "closed"}`}
        onPress={() => onSelectPart("valve")}
        className={`rounded-2xl p-5 active:opacity-70 border-2 ${
          valveOpen
            ? "bg-emerald-950/80 border-emerald-500"
            : "bg-rose-950/80 border-rose-500"
        }`}
      >
        <View className="flex-row items-center gap-4">
          <View
            className={`w-14 h-14 rounded-2xl items-center justify-center ${
              valveOpen ? "bg-emerald-900" : "bg-rose-900"
            }`}
          >
            <Ionicons
              name={valveOpen ? "lock-open-outline" : "lock-closed-outline"}
              size={28}
              color={valveOpen ? "#6ee7b7" : "#fda4af"}
            />
          </View>
          <View className="flex-1">
            <Text
              className={`text-xl font-black ${valveOpen ? "text-emerald-300" : "text-rose-300"}`}
            >
              {valveOpen ? "VALVE OPEN" : "VALVE CLOSED"}
            </Text>
            <Text className="text-slate-400 text-sm mt-1">
              {valveOpen
                ? "Water is flowing through the pipe"
                : "Water is shut off — leak protection active"}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
