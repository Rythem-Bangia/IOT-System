import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

/**
 * Single source for room ids, labels, and icons (Monitor, Lab picker, hints).
 * Emails and history use `zones.name` in Supabase — keep that in sync when the user picks a room.
 */

export type RoomOption = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

export const ROOM_OPTIONS: RoomOption[] = [
  { id: "kitchen", label: "Kitchen", icon: "restaurant-outline" },
  { id: "bathroom", label: "Bathroom", icon: "water-outline" },
  { id: "basement", label: "Basement", icon: "arrow-down-outline" },
  { id: "laundry", label: "Laundry", icon: "shirt-outline" },
  { id: "garage", label: "Garage", icon: "car-outline" },
  { id: "bedroom", label: "Bedroom", icon: "bed-outline" },
  { id: "utility", label: "Utility room", icon: "build-outline" },
];

/** Shown in RoomPicker after fixed rooms (Monitor does not use this id). */
export const CUSTOM_ROOM_ID = "custom";

export function roomOptionById(id: string): RoomOption | undefined {
  return ROOM_OPTIONS.find((r) => r.id === id);
}

export function roomOptionByLabel(label: string): RoomOption | undefined {
  return ROOM_OPTIONS.find((r) => r.label === label);
}

/** AsyncStorage value may be a known label or custom free text (legacy Lab picker). */
export function parseStoredLocation(stored: string | null): {
  id: string | null;
  label: string;
} {
  if (!stored?.trim()) return { id: null, label: "" };
  const t = stored.trim();
  const match = roomOptionByLabel(t);
  if (match) return { id: match.id, label: match.label };
  return { id: null, label: t };
}

/** Short hint like "Kitchen, Bathroom, Laundry" for UI copy. */
export function roomHintSample(max = 3): string {
  return ROOM_OPTIONS.slice(0, max)
    .map((r) => r.label)
    .join(", ");
}
