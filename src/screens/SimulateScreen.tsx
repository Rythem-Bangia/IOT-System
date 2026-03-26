import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  View,
} from "react-native";
import { LiveDemo } from "../components/lab/LiveDemo";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { useAuth } from "../context/AuthContext";
import { formatError } from "../lib/formatError";
import { ensureDefaultSetup, fetchZones, type ZoneRow } from "../lib/iot";
import { brand } from "../theme/brand";

export function SimulateScreen() {
  const scrollBottom = useScrollBottomInset(28);
  const { user } = useAuth();
  const [zone, setZone] = useState<ZoneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomLocation, setRoomLocation] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) return;
    await ensureDefaultSetup(user.id);
    const zones = await fetchZones();
    setZone(zones[0] ?? null);
  }, [user?.id]);

  useEffect(() => {
    setLoading(true);
    const locKey = user?.id ? `lab_room_location_${user.id}` : "lab_room_location";
    Promise.all([
      load(),
      AsyncStorage.getItem(locKey).then((val) => setRoomLocation(val ?? "")),
    ])
      .catch((e) => Alert.alert("Load error", formatError(e)))
      .finally(() => setLoading(false));
  }, [load, user?.id]);

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
    <ScrollView
      keyboardShouldPersistTaps="handled"
      className="flex-1 bg-shell px-4 pt-4"
      contentContainerStyle={{ paddingBottom: scrollBottom }}
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
            Go to Monitor to select a room (Kitchen, Bathroom, etc.) before running
            the simulation.
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
          onDone={load}
        />
      ) : null}
    </ScrollView>
  );
}
