import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

type Props = {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  children: ReactNode;
  contentClassName?: string;
};

export function SectionCard({
  title,
  description,
  icon = "layers-outline",
  children,
  contentClassName = "px-4 py-4",
}: Props) {
  return (
    <View className="rounded-[22px] border border-slate-800/90 bg-slate-900/80 overflow-hidden mb-5 shadow-sm">
      <View className="px-4 pt-4 pb-3 border-b border-slate-800/80 bg-slate-950/50">
        <View className="flex-row items-center gap-2.5">
          <View className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 items-center justify-center">
            <Ionicons name={icon} size={18} color="#2dd4bf" />
          </View>
          <View className="flex-1">
            <Text className="text-white text-[17px] font-bold">{title}</Text>
            {description ? (
              <Text className="text-slate-500 text-[13px] mt-0.5 leading-5">
                {description}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <View className={contentClassName}>{children}</View>
    </View>
  );
}
