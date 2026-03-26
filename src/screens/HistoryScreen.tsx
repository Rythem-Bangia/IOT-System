import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { ScreenHeader } from "../components/ui/ScreenHeader";
import { useScrollBottomInset } from "../hooks/useScrollBottomInset";
import { formatFunctionsInvokeCatch } from "../lib/formatError";
import {
  fetchLeakHistory,
  sendLeakEmail,
  type LeakEventRow,
} from "../lib/iot";
import { brand } from "../theme/brand";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function Badge({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const bg =
    tone === "ok"
      ? "bg-emerald-950/50 border-emerald-800/40"
      : tone === "warn"
        ? "bg-amber-950/45 border-amber-800/35"
        : "bg-slate-800/90 border-slate-700/60";
  const tx =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-200"
        : "text-slate-400";
  return (
    <View className={`px-2.5 py-1 rounded-lg border ${bg}`}>
      <Text className={`text-[11px] font-semibold ${tx}`}>{label}</Text>
    </View>
  );
}

export function HistoryScreen() {
  const listBottom = useScrollBottomInset(32);
  const [rows, setRows] = useState<LeakEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchLeakHistory(80);
    setRows(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const retryEmail = useCallback(
    async (id: string) => {
      setRetryingId(id);
      try {
        const r = await sendLeakEmail(id);
        await load();
        Alert.alert(
          r?.emailed ? "Email sent" : "Email not delivered",
          r?.emailed
            ? "Check the inbox for your leak alert address."
            : (r?.message ??
                "See the row below for the reason (Resend, alert email, etc.)."),
        );
      } catch (e) {
        await load();
        const msg = await formatFunctionsInvokeCatch(e);
        Alert.alert("Retry failed", msg);
      } finally {
        setRetryingId(null);
      }
    },
    [load],
  );

  if (loading) {
    return (
      <View className="flex-1 bg-shell items-center justify-center">
        <ActivityIndicator size="large" color={brand.accent} />
        <Text className="text-slate-500 text-sm mt-4">Loading history…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-shell">
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: listBottom, paddingTop: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={brand.accent}
          />
        }
        ListHeaderComponent={
          <View className="px-4 pb-4">
            <ScreenHeader
              eyebrow="History"
              title="Leak events"
              subtitle="Each leak logs response time and email status. Retry email from a row if delivery failed."
            />
          </View>
        }
        ListEmptyComponent={
          <View className="items-center px-8 py-20">
            <View className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 items-center justify-center mb-5">
              <Ionicons name="shield-checkmark-outline" size={32} color={brand.accent} />
            </View>
            <Text className="text-slate-300 text-center text-lg font-bold">
              No leak events yet
            </Text>
            <Text className="text-slate-500 text-center mt-2 text-sm leading-5 max-w-[280px]">
              History appears after moisture crosses your threshold.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const zoneName =
            item.zones &&
            typeof item.zones === "object" &&
            "name" in item.zones
              ? (item.zones as { name: string }).name
              : "Zone";
          return (
            <View className="mx-4 mb-3 rounded-[20px] p-4 border border-slate-800/90 bg-slate-900/80">
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-bold text-[17px]">{zoneName}</Text>
                <Text className="text-slate-500 text-[11px] font-medium">
                  {formatTime(item.created_at)}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2 mt-3">
                <Badge label={`Moisture ${item.moisture_at_trigger}%`} />
                <Badge
                  label={
                    item.response_ms != null
                      ? `Response ${item.response_ms} ms`
                      : "Response —"
                  }
                />
                <Badge
                  tone={
                    item.email_sent_at
                      ? "ok"
                      : item.email_last_error
                        ? "warn"
                        : "muted"
                  }
                  label={
                    item.email_sent_at
                      ? "Email sent"
                      : item.email_last_error
                        ? "Email failed"
                        : item.email_last_attempt_at
                          ? "Email not sent"
                          : "No send attempted"
                  }
                />
                {item.resolved_at ? (
                  <Badge tone="ok" label="Resolved" />
                ) : (
                  <Badge tone="warn" label="Awaiting reset" />
                )}
              </View>
              {item.email_last_error ? (
                <Text
                  className="text-amber-200/90 text-xs mt-2.5 leading-[18px]"
                  selectable
                >
                  {item.email_last_error}
                </Text>
              ) : null}
              {!item.email_sent_at ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => retryEmail(item.id)}
                  disabled={retryingId === item.id}
                  className="mt-3 bg-slate-800/90 border border-slate-700/80 rounded-2xl py-3 items-center active:opacity-85"
                >
                  <Text className="text-teal-300 text-sm font-bold">
                    {retryingId === item.id ? "Sending…" : "Retry leak email"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
