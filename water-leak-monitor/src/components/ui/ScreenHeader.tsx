import { Text, View } from "react-native";

type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
};

export function ScreenHeader({ eyebrow, title, subtitle }: Props) {
  return (
    <View className="mb-6">
      <Text className="text-teal-400/90 text-[10px] font-bold uppercase tracking-[0.22em]">
        {eyebrow}
      </Text>
      <Text className="text-white text-[26px] font-bold mt-1.5 tracking-tight">
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-slate-400 text-[15px] mt-2.5 leading-[22px]">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
