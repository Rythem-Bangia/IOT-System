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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatError } from "../lib/formatError";
import { brand } from "../theme/brand";

type Props = {
  visible: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Extra controls (e.g. slider) above the primary button */
  children?: React.ReactNode;
  primaryLabel: string;
  /** Returns assistant text to display */
  onGenerate: () => Promise<string>;
  footerNote?: string;
};

export function AiTextSheet({
  visible,
  onClose,
  eyebrow = "AI",
  title,
  subtitle,
  children,
  primaryLabel,
  onGenerate,
  footerNote,
}: Props) {
  const insets = useSafeAreaInsets();
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
    setReply(null);
    setLoading(false);
  }, [onClose]);

  const run = useCallback(async () => {
    setLoading(true);
    setReply(null);
    try {
      const text = await onGenerate();
      setReply(text);
    } catch (e) {
      setReply(`Something went wrong.\n\n${formatError(e)}`);
    } finally {
      setLoading(false);
    }
  }, [onGenerate]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        className="flex-1 bg-shell"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-800/90">
          <View className="flex-1 pr-2">
            <Text className="text-violet-400 text-[10px] font-bold uppercase tracking-wider">
              {eyebrow}
            </Text>
            <Text className="text-white text-base font-bold mt-0.5" numberOfLines={2}>
              {title}
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
          {subtitle ? (
            <Text className="text-slate-400 text-sm leading-6 mb-4">{subtitle}</Text>
          ) : null}

          {children}

          <Pressable
            accessibilityRole="button"
            onPress={run}
            disabled={loading}
            className="mt-4 bg-violet-600 rounded-2xl py-4 items-center border border-violet-400/25 active:opacity-90"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View className="flex-row items-center gap-2">
                <Ionicons name="sparkles" size={20} color="#fff" />
                <Text className="text-white font-bold text-base">{primaryLabel}</Text>
              </View>
            )}
          </Pressable>

          {reply ? (
            <View className="mt-6 bg-slate-900/95 rounded-2xl border border-slate-800 p-4">
              <Text className="text-slate-500 text-[10px] font-bold uppercase mb-2">
                Result
              </Text>
              <Text className="text-slate-200 text-[15px] leading-6">{reply}</Text>
            </View>
          ) : null}

          {footerNote ? (
            <View className="mt-6 flex-row items-start gap-2">
              <Ionicons name="information-circle-outline" size={18} color={brand.textMuted} />
              <Text className="text-slate-500 text-xs flex-1 leading-5">{footerNote}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
