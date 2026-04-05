import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatError } from "../lib/formatError";
import { buildZoneInsights } from "../lib/localInsights";
import {
  fetchRecentLeakSnippets,
  type RoomStats,
  type ZoneRow,
} from "../lib/iot";
import { brand } from "../theme/brand";

type Props = {
  visible: boolean;
  onClose: () => void;
  zone: ZoneRow;
  roomStats?: RoomStats | null;
};

export function ZoneTipsSheet({ visible, onClose, zone, roomStats }: Props) {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForOpen = useCallback(() => {
    setReply(null);
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setQuestion("");
    setReply(null);
    setLoading(false);
  }, [onClose]);

  const run = useCallback(async () => {
    setLoading(true);
    setReply(null);
    try {
      const recentLeaks = await fetchRecentLeakSnippets(zone.id, 5);
      const text = buildZoneInsights({
        zone: {
          name: zone.name,
          moisture_threshold: zone.moisture_threshold,
          last_moisture: zone.last_moisture,
          valve_open: zone.valve_open,
        },
        roomStats: roomStats
          ? {
              leakCount: roomStats.leakCount,
              maxMoisture: roomStats.maxMoisture,
              avgResponseMs: roomStats.avgResponseMs,
              days: roomStats.days,
            }
          : null,
        recentLeaks,
        question: question.trim() || undefined,
      });
      setReply(text);
    } catch (e) {
      setReply(`Could not load tips.\n\n${formatError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [zone, roomStats, question]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={resetForOpen}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-shell"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-800/90">
          <View className="flex-1 pr-2">
            <Text className="text-teal-400 text-[10px] font-bold uppercase tracking-wider">
              Smart tips
            </Text>
            <Text className="text-white text-base font-bold mt-0.5" numberOfLines={1}>
              {zone.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={handleClose}
            className="w-10 h-10 rounded-xl bg-slate-800 items-center justify-center active:opacity-70"
          >
            <Ionicons name="close" size={22} color="#94a3b8" />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-4 pt-4"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <Text className="text-slate-400 text-sm leading-6 mb-3">
            Built from your zone data in Supabase (no OpenAI or other AI API keys). Optional
            keywords in your question add focused hints (valve, email, threshold, sensor).
          </Text>

          <Text className="text-slate-500 text-[10px] font-bold uppercase mb-1.5">
            Question (optional)
          </Text>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="e.g. Why is my valve still closed?"
            placeholderTextColor="#64748b"
            multiline
            maxLength={500}
            editable={!loading}
            className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-slate-200 text-[15px] min-h-[88px]"
            style={{ textAlignVertical: "top" }}
          />

          <Pressable
            accessibilityRole="button"
            onPress={run}
            disabled={loading}
            className="mt-4 bg-teal-600 rounded-2xl py-4 items-center border border-teal-400/25 active:opacity-90"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="bulb-outline" size={20} color="#fff" />
                <Text className="text-white font-bold text-base">Get tips</Text>
              </View>
            )}
          </Pressable>

          {reply ? (
            <View className="mt-6 bg-slate-900/95 rounded-2xl border border-slate-800 p-4">
              <Text className="text-slate-500 text-[10px] font-bold uppercase mb-2">
                Suggestions
              </Text>
              <Text className="text-slate-200 text-[15px] leading-6">{reply}</Text>
            </View>
          ) : null}

          <View className="mt-6 flex-row items-start gap-2">
            <Ionicons name="information-circle-outline" size={18} color={brand.textMuted} />
            <Text className="text-slate-500 text-xs flex-1 leading-5">
              For serious flooding or electrical risk, prioritize safety and contact a
              professional. Tips are rules-based, not medical or legal advice.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
