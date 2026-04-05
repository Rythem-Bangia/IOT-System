export type LabPartId =
  | "pots"
  | "buzzer"
  | "leds"
  | "mcu"
  | "valve"
  | "wires";

/** Short labels for chips (internal ids stay stable for selection logic). */
export const LAB_PART_LABELS: Record<LabPartId, string> = {
  pots: "Pots",
  buzzer: "Buzzer",
  leds: "LEDs",
  mcu: "MCU",
  valve: "Valve",
  wires: "Wires",
};

export const LAB_PART_INFO: Record<
  LabPartId,
  { title: string; body: string }
> = {
  pots: {
    title: "Analog inputs (pots)",
    body: "These stand in for trimmers feeding the MCU ADC. In simulation, the moisture slider drives the same idea: a 0–100% signal the firmware compares to your threshold.",
  },
  buzzer: {
    title: "Audible alarm",
    body: "Driven by a digital pin when the system declares a leak. The lab pulses the icon when moisture is at or above threshold or the valve is closed.",
  },
  leds: {
    title: "Status indicators",
    body: "Green: nominal (under threshold, valve open). Red: alarm state — wet enough to trip, or valve already shut after detection.",
  },
  mcu: {
    title: "Microcontroller (MCU)",
    body: "Runs your sense → decide → act loop. In production this app uses Supabase RPC for the same decision with virtual devices.",
  },
  valve: {
    title: "Solenoid valve",
    body: "Cuts water when the system commands a close. The OPEN / CLOSED badge on the bench matches the same valve state as the metrics row and your zone (after sync from the cloud).",
  },
  wires: {
    title: "Signal routing",
    body: "Represents power, ground, and signal paths between the sensors, MCU, and valve.",
  },
};

/** Stable chip order (Object.keys order is not guaranteed for UX). */
export const LAB_PART_ORDER: LabPartId[] = [
  "pots",
  "wires",
  "buzzer",
  "leds",
  "mcu",
  "valve",
];
