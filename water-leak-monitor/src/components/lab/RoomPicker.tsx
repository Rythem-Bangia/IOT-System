import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../../context/AuthContext";
import {
  CUSTOM_ROOM_ID,
  type RoomOption,
  ROOM_OPTIONS,
  roomOptionById,
  roomOptionByLabel,
} from "../../data/rooms";
import { getSelectedRoom, setSelectedRoom } from "../../lib/iot";
import { brand } from "../../theme/brand";

type Props = {
  onLocationChange: (location: string) => void;
};

export function RoomPicker({ onLocationChange }: Props) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    getSelectedRoom(user.id).then((val) => {
      if (!val) return;
      const byLabel = roomOptionByLabel(val);
      if (byLabel) {
        setSelected(byLabel.id);
        onLocationChange(val);
      } else {
        setSelected(CUSTOM_ROOM_ID);
        setCustomText(val);
        setShowCustom(true);
        onLocationChange(val);
      }
    });
  }, [onLocationChange, user?.id]);

  const pick = useCallback(
    (roomId: string) => {
      setSelected(roomId);
      if (roomId === CUSTOM_ROOM_ID) {
        setShowCustom(true);
        return;
      }
      setShowCustom(false);
      const room = roomOptionById(roomId);
      const label = room?.label ?? roomId;
      if (user?.id) void setSelectedRoom(user.id, label);
      onLocationChange(label);
    },
    [onLocationChange, user?.id],
  );

  const saveCustom = useCallback(() => {
    const val = customText.trim();
    if (!val) return;
    if (user?.id) void setSelectedRoom(user.id, val);
    onLocationChange(val);
  }, [customText, onLocationChange, user?.id]);

  const customRow: RoomOption = {
    id: CUSTOM_ROOM_ID,
    label: "Custom",
    icon: "create-outline",
  };
  const pickerRows: RoomOption[] = [...ROOM_OPTIONS, customRow];

  return (
    <View className="rounded-[22px] border border-slate-800/90 bg-slate-900/80 overflow-hidden mb-5">
      <View className="px-4 pt-4 pb-3 border-b border-slate-800/80 bg-slate-950/50">
        <View className="flex-row items-center gap-2.5">
          <View className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 items-center justify-center">
            <Ionicons name="location-outline" size={18} color={brand.accent} />
          </View>
          <View className="flex-1">
            <Text className="text-white text-[17px] font-bold">Sensor location</Text>
            <Text className="text-slate-500 text-[13px] mt-0.5">
              Where in the house is the sensor?
            </Text>
          </View>
        </View>
      </View>

      <View className="px-4 py-4">
        <View className="flex-row flex-wrap gap-2 mb-3">
          {pickerRows.map((r) => {
            const active = selected === r.id;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => pick(r.id)}
                className={`flex-row items-center gap-2 px-4 py-3 rounded-2xl border min-h-[48px] ${
                  active
                    ? "bg-teal-500/15 border-teal-400/40"
                    : "bg-slate-800/80 border-slate-700/80"
                } active:opacity-70`}
              >
                <Ionicons
                  name={r.icon}
                  size={18}
                  color={active ? brand.accent : "#94a3b8"}
                />
                <Text
                  className={`text-sm font-semibold ${active ? "text-teal-100" : "text-slate-300"}`}
                >
                  {r.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showCustom ? (
          <View className="gap-3">
            <TextInput
              className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-base"
              placeholder="Type your location…"
              placeholderTextColor="#64748b"
              value={customText}
              onChangeText={setCustomText}
              returnKeyType="done"
              onSubmitEditing={saveCustom}
            />
            <Pressable
              onPress={saveCustom}
              className="bg-teal-600 rounded-2xl py-3.5 items-center border border-teal-400/25 active:opacity-90"
            >
              <Text className="text-white font-bold text-sm">Save</Text>
            </Pressable>
          </View>
        ) : null}

        {selected && selected !== CUSTOM_ROOM_ID ? (
          <View className="flex-row items-center gap-2 bg-emerald-950/40 rounded-xl px-3 py-2.5 mt-2 border border-emerald-800/35">
            <Ionicons name="checkmark-circle" size={16} color="#6ee7b7" />
            <Text className="text-emerald-300 text-sm font-medium">
              Monitoring: {roomOptionById(selected)?.label}
            </Text>
          </View>
        ) : selected === CUSTOM_ROOM_ID && customText.trim() ? (
          <View className="flex-row items-center gap-2 bg-emerald-950/40 rounded-xl px-3 py-2.5 mt-2 border border-emerald-800/35">
            <Ionicons name="checkmark-circle" size={16} color="#6ee7b7" />
            <Text className="text-emerald-300 text-sm font-medium">
              Monitoring: {customText.trim()}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
