import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { brand } from "../theme/brand";

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit() {
    setMessage(null);
    setBusy(true);
    try {
      const fn = register ? signUp : signIn;
      const { error } = await fn(email, password, name || undefined);
      if (error) setMessage(error);
      else if (register) {
        setMessage(
          "If your project sends a confirmation email, open it when you can. You can also verify later from Settings after signing in.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-shell" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: 20,
            paddingVertical: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center mb-8">
            <View className="w-[72px] h-[72px] rounded-[22px] bg-teal-500/12 border border-teal-400/25 items-center justify-center mb-5">
              <Ionicons name="water" size={38} color={brand.accent} />
            </View>
            <Text className="text-white text-[28px] font-bold tracking-tight text-center">
              Water leak monitor
            </Text>
            <Text className="text-slate-400 text-[15px] mt-2 text-center leading-[22px] px-2">
              Moisture sensing, automatic valve shutoff, and email alerts.
            </Text>
          </View>

          <View className="rounded-[24px] border border-slate-800/90 bg-slate-900/70 p-5">
            {register ? (
              <TextInput
                className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white mb-3 text-[16px]"
                placeholder="Full name (optional)"
                placeholderTextColor="#64748b"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            ) : null}

            <TextInput
              className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white mb-3 text-[16px]"
              placeholder="Email"
              placeholderTextColor="#64748b"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
            />

            <TextInput
              className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white mb-4 text-[16px]"
              placeholder="Password"
              placeholderTextColor="#64748b"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType={register ? "newPassword" : "password"}
              autoComplete={register ? "password-new" : "password"}
            />

            {message ? (
              <Text className="text-amber-200/95 mb-4 text-sm leading-5">{message}</Text>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={busy}
              className="bg-teal-600 rounded-2xl py-4 items-center border border-teal-400/25 active:opacity-90"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-[16px]">
                  {register ? "Create account" : "Sign in"}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setRegister(!register)}
              className="py-4 mt-1"
            >
              <Text className="text-teal-400/90 text-center text-[15px] font-semibold">
                {register
                  ? "Already have an account? Sign in"
                  : "Need an account? Register"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
