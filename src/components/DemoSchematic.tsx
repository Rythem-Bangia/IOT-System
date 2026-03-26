import { Text, View } from "react-native";

/** Simple inline “diagrams” for the demo (not CAD — visual memory aid). */

export function SensorSchematic() {
  return (
    <View className="h-[72px] w-full rounded-xl bg-sky-100 border border-sky-200 overflow-hidden justify-center px-3">
      <View className="flex-row items-end justify-center gap-3">
        <View className="items-center">
          <View className="w-1.5 h-10 bg-amber-800 rounded-t" />
          <Text className="text-[9px] text-sky-800 mt-0.5">probe</Text>
        </View>
        <View className="items-center pb-1">
          <Text className="text-2xl">💧</Text>
          <Text className="text-[9px] text-sky-700">moisture</Text>
        </View>
        <View className="items-center">
          <View className="w-1.5 h-10 bg-amber-800 rounded-t" />
          <Text className="text-[9px] text-sky-800 mt-0.5">probe</Text>
        </View>
      </View>
    </View>
  );
}

export function McuSchematic() {
  return (
    <View className="h-[72px] w-full rounded-xl bg-indigo-100 border border-indigo-200 items-center justify-center px-2">
      <View className="w-[85%] h-10 bg-slate-700 rounded-md border-2 border-slate-600 flex-row items-center justify-center px-1">
        <View className="flex-1 h-6 bg-emerald-600/30 rounded-sm" />
        <Text className="text-[10px] text-white font-mono px-1">MCU</Text>
        <View className="flex-1 h-6 bg-emerald-600/30 rounded-sm" />
      </View>
      <Text className="text-[9px] text-indigo-800 mt-1">read • compare • drive</Text>
    </View>
  );
}

export function ValveSchematic({ closed }: { closed: boolean }) {
  return (
    <View className="h-[72px] w-full rounded-xl bg-slate-100 border border-slate-200 items-center justify-center">
      <View className="flex-row items-center">
        <View className="w-10 h-2 bg-slate-400 rounded" />
        <View
          className={`w-8 h-8 rounded-full border-4 items-center justify-center ${
            closed ? "bg-red-200 border-red-500" : "bg-emerald-200 border-emerald-500"
          }`}
        >
          <View
            className={`w-3 h-3 rounded-full ${closed ? "bg-red-600" : "bg-emerald-600"}`}
          />
        </View>
        <View className="w-10 h-2 bg-slate-400 rounded" />
      </View>
      <Text className="text-[9px] text-slate-600 mt-1">
        {closed ? "solenoid OFF (no flow)" : "solenoid ON (flow)"}
      </Text>
    </View>
  );
}

export function AlarmSchematic() {
  return (
    <View className="h-[72px] w-full rounded-xl bg-amber-100 border border-amber-200 items-center justify-center">
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-full bg-slate-800 items-center justify-center">
          <Text className="text-lg">🔊</Text>
        </View>
        <View className="w-4 h-4 rounded-full bg-red-500" />
        <View className="w-4 h-4 rounded-full bg-green-500" />
      </View>
      <Text className="text-[9px] text-amber-900 mt-1">buzzer + LEDs</Text>
    </View>
  );
}

export function CloudSchematic() {
  return (
    <View className="h-[72px] w-full rounded-xl bg-violet-100 border border-violet-200 items-center justify-center px-2">
      <View className="flex-row flex-wrap justify-center gap-1">
        <View className="bg-white rounded px-2 py-1 border border-violet-200">
          <Text className="text-[8px] text-violet-900 font-mono">zones</Text>
        </View>
        <View className="bg-white rounded px-2 py-1 border border-violet-200">
          <Text className="text-[8px] text-violet-900 font-mono">RPC</Text>
        </View>
        <View className="bg-white rounded px-2 py-1 border border-violet-200">
          <Text className="text-[8px] text-violet-900 font-mono">events</Text>
        </View>
      </View>
      <Text className="text-[9px] text-violet-800 mt-1">Supabase Postgres</Text>
    </View>
  );
}

export function EmailSchematic() {
  return (
    <View className="h-[72px] w-full rounded-xl bg-rose-100 border border-rose-200 items-center justify-center">
      <View className="w-14 h-10 bg-white border border-rose-300 rounded-sm items-center justify-center">
        <Text className="text-xl">✉️</Text>
      </View>
      <Text className="text-[9px] text-rose-900 mt-1">Edge fn → Resend</Text>
    </View>
  );
}

export function AppSchematic() {
  return (
    <View className="h-[72px] w-full rounded-xl bg-teal-100 border border-teal-200 items-center justify-center">
      <View className="w-11 h-[52px] bg-slate-800 rounded-lg border-2 border-slate-600 items-center pt-1">
        <View className="w-8 h-8 bg-teal-400/40 rounded-sm" />
        <View className="w-6 h-1 bg-slate-600 rounded mt-1" />
      </View>
      <Text className="text-[9px] text-teal-900 mt-1">Expo app</Text>
    </View>
  );
}
