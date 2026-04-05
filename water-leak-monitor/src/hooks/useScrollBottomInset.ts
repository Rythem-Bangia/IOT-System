import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Extra padding below scroll content so it clears the home indicator comfortably. */
export function useScrollBottomInset(extra = 20) {
  const { bottom } = useSafeAreaInsets();
  return bottom + extra;
}
