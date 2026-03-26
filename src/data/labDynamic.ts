import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type MoisturePreset = {
  label: string;
  value: number;
  icon: ComponentProps<typeof Ionicons>["name"];
};

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Quick-test moisture buttons — values follow your zone leak limit, not fixed 18/45/72/88.
 */
export function buildMoisturePresets(threshold: number): MoisturePreset[] {
  const t = clampPct(threshold);
  const safeBelow = t > 15 ? t - 15 : Math.max(0, t - 5);
  const over = Math.min(100, t + 15);

  return [
    { label: "Dry", value: clampPct(t * 0.28), icon: "water-outline" },
    { label: "Safe", value: clampPct(safeBelow), icon: "sunny-outline" },
    { label: "At limit", value: t, icon: "alert-outline" },
    { label: "Over", value: over, icon: "alert-circle-outline" },
  ];
}

export type PipelineStoryStep = { title: string; body: string };

/**
 * Timeline copy for the pipeline card — references live zone fields.
 */
export function buildPipelineStory(
  moisture: number,
  threshold: number,
  valveOpen: boolean,
  zoneName?: string,
): PipelineStoryStep[] {
  const m = moisture.toFixed(0);
  const t = threshold.toFixed(0);
  const v = valveOpen ? "open" : "closed";
  const z = zoneName?.trim() ? `“${zoneName.trim()}”` : "your zone";

  return [
    {
      title: "1 · Moisture at the pipe",
      body: `Right now ${z} shows ${m}% at the sensor. Probes send readings the same way a physical device would.`,
    },
    {
      title: "2 · Edge logic",
      body: `Your leak limit is ${t}%. The cloud compares each reading to that limit (same rule as \`submit_sensor_reading\`).`,
    },
    {
      title: "3 · Stopping water",
      body: `The valve is ${v}. When a leak trips, \`valve_open\` in the database is what Monitor and this app both read.`,
    },
    {
      title: "4 · People on site",
      body: "Buzzers and LEDs warn people immediately — in the real install they’re wired to the MCU outputs.",
    },
    {
      title: "5 · Cloud record",
      body: `Readings and events for ${z} stay in Supabase with row-level security. History is your audit trail.`,
    },
    {
      title: "6 · Off-site alert",
      body: "The send-leak-alert Edge Function can email you when Resend is configured on the project.",
    },
    {
      title: "7 · You monitor & reset",
      body: `Use Monitor for live ${m}% / ${t}% / valve ${v}; after a fix, reset the valve from the app.`,
    },
  ];
}

/**
 * Short hint under each pipeline node — tied to current step context when useful.
 */
export function buildPipelineNodeHints(
  moisture: number,
  threshold: number,
  valveOpen: boolean,
): string[] {
  const m = moisture.toFixed(0);
  const t = threshold.toFixed(0);
  const v = valveOpen ? "open" : "closed";
  return [
    `${m}% · sensor in`,
    `${t}% limit`,
    `Valve ${v}`,
    "Local alert",
    "Supabase RPC",
    "Email (optional)",
    "This app",
  ];
}
