/**
 * Rule-based tips from your own data — no external AI API or API keys.
 */

import type { LeakEventRow } from "./iot";

export type ZoneSnapshot = {
  name: string;
  moisture_threshold: number;
  last_moisture: number | null;
  valve_open: boolean;
};

export type RoomStatsSnapshot = {
  leakCount: number;
  maxMoisture: number;
  avgResponseMs: number | null;
  days: number;
};

export type RecentLeakSnippet = {
  moisture_at_trigger: number;
  created_at: string;
};

function roundM(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)));
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso.slice(0, 16);
  }
}

/** Optional user question → extra bullet hints (keyword matching only). */
function hintsFromQuestion(q: string): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: string[] = [];
  if (/valve|shut|close|open|reset|reopen/.test(s)) {
    out.push(
      "Valve: after a real leak the cloud sets the valve to closed. When the area is dry and safe, use Reset valve on the Monitor tab. That also clears last moisture to 0% in the cloud.",
    );
  }
  if (/email|alert|notify|resend|inbox/.test(s)) {
    out.push(
      "Email: set Leak alert email under Settings, deploy send-leak-alert, and add RESEND_API_KEY in Supabase. Retry from History if a send failed.",
    );
  }
  if (/threshold|limit|trip|percent|%/.test(s)) {
    out.push(
      "Threshold: moisture at or above your saved % can trigger a leak event while the valve is open. Lowering the threshold after a high reading may require Save again or Set last reading to 0% so the cloud re-evaluates.",
    );
  }
  if (/sensor|reading|moisture|wet|dry|simulate|virtual|physical/.test(s)) {
    out.push(
      "Readings: the Monitor Moisture value is the last number stored in Supabase (simulator, Live tab, or device) — not your phone’s ambient humidity.",
    );
  }
  if (/false|alarm|wrong|mistake/.test(s)) {
    out.push(
      "False trips: check sensor placement and wiring; use Simulate to rehearse the flow; clear a stale high reading with Set last reading to 0% if appropriate.",
    );
  }
  if (out.length === 0) {
    out.push(
      "For questions that need a custom answer, compare your Monitor numbers (moisture vs threshold vs valve) with the bullets above, or consult a qualified plumber for hidden leaks.",
    );
  }
  return out;
}

export function buildZoneInsights(input: {
  zone: ZoneSnapshot;
  roomStats?: RoomStatsSnapshot | null;
  recentLeaks?: RecentLeakSnippet[];
  question?: string;
}): string {
  const { zone, roomStats, recentLeaks = [], question } = input;
  const thr = roundM(zone.moisture_threshold);
  const last = zone.last_moisture == null ? null : roundM(zone.last_moisture);
  const lines: string[] = [];

  lines.push(`${zone.name} — threshold ${thr}%.`);
  lines.push(
    last == null
      ? "No last moisture stored yet — send a reading from Simulate, Live, or your device."
      : `Last stored moisture: ${last}% (${last >= thr ? "at or above" : "below"} threshold).`,
  );
  lines.push(
    zone.valve_open
      ? "Valve is open (water path allowed if your hardware matches the app)."
      : "Valve is closed in the cloud — inspect, dry, then Reset valve on Monitor when safe.",
  );

  if (roomStats && roomStats.leakCount > 0) {
    lines.push(
      `Last ${roomStats.days} days on this zone: ${roomStats.leakCount} leak event(s), peak ${roomStats.maxMoisture}%, avg response ${roomStats.avgResponseMs ?? "—"} ms.`,
    );
  } else if (roomStats) {
    lines.push(`Last ${roomStats.days} days: no leak events recorded for this zone.`);
  }

  if (recentLeaks.length > 0) {
    lines.push("Recent leak triggers (newest first):");
    for (const e of recentLeaks.slice(0, 5)) {
      const m = roundM(e.moisture_at_trigger);
      lines.push(`  • ${formatWhen(e.created_at)} — moisture ${m}%`);
    }
  }

  const qh = hintsFromQuestion(question ?? "");
  if (qh.length) {
    lines.push("");
    lines.push("Notes for your question:");
    qh.forEach((h) => lines.push(`• ${h}`));
  }

  lines.push("");
  lines.push(
    "These tips are generated on your device from your account data — not a cloud language model.",
  );

  return lines.join("\n");
}

export function buildHistoryInsights(rows: LeakEventRow[], days = 30): string {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return !Number.isNaN(t) && t >= since;
  });

  if (inWindow.length === 0) {
    return [
      `No leak events in the last ${days} days.`,
      "When moisture stays at or above your threshold while the valve is open, the app logs an event and can email you.",
      "",
      "Summary generated on your device — no external AI.",
    ].join("\n");
  }

  const moistures = inWindow.map((r) => roundM(r.moisture_at_trigger));
  const maxM = Math.max(...moistures);
  const unresolved = inWindow.filter((r) => !r.resolved_at).length;
  const emailed = inWindow.filter((r) => r.email_sent_at).length;
  const responses = inWindow
    .map((r) => r.response_ms)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgMs =
    responses.length > 0
      ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length)
      : null;

  const byZone = new Map<string, number>();
  for (const r of inWindow) {
    const z =
      r.zones && typeof r.zones === "object" && "name" in r.zones
        ? (r.zones as { name: string }).name
        : "Zone";
    byZone.set(z, (byZone.get(z) ?? 0) + 1);
  }
  const zoneParts = [...byZone.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${n}: ${c}`)
    .join("; ");

  const lines: string[] = [
    `Last ${days} days — ${inWindow.length} leak event(s).`,
    `Peak moisture at trigger: ${maxM}%. Average response time: ${avgMs ?? "—"} ms.`,
    `Email marked sent: ${emailed} / ${inWindow.length}. Still awaiting reset: ${unresolved}.`,
    `By zone: ${zoneParts}.`,
    "",
    "Latest events:",
  ];

  for (const r of inWindow.slice(0, 8)) {
    const zn =
      r.zones && typeof r.zones === "object" && "name" in r.zones
        ? (r.zones as { name: string }).name
        : "Zone";
    const m = roundM(r.moisture_at_trigger);
    const res = r.resolved_at ? "resolved" : "needs reset";
    lines.push(`  • ${formatWhen(r.created_at)} — ${zn}, ${m}%, ${res}`);
  }

  lines.push("");
  lines.push(
    "Summary generated on your device from this list — not a cloud language model.",
  );

  return lines.join("\n");
}

export function buildMoistureInsight(
  zone: ZoneSnapshot,
  hypotheticalMoisture: number,
): string {
  const m = roundM(hypotheticalMoisture);
  const thr = roundM(zone.moisture_threshold);
  const lines: string[] = [];

  lines.push(`Hypothetical reading ${m}% for ${zone.name} (threshold ${thr}%).`);

  if (m < thr) {
    lines.push(
      "This is below the trip point — submitting it while the valve is open would normally not create a new leak event (unless rules change).",
    );
  } else if (m >= thr) {
    lines.push(
      "This is at or above the threshold. If you sent this reading while the valve is open in the cloud, the system would treat it as a leak: valve closed, event logged, optional email.",
    );
  }

  lines.push(
    zone.valve_open
      ? "Right now the cloud thinks the valve is open."
      : "Right now the cloud thinks the valve is closed — a new trip typically needs Reset valve first if you are rehearsing.",
  );

  const last = zone.last_moisture == null ? null : roundM(zone.last_moisture);
  if (last != null) {
    lines.push(`Last stored cloud moisture (not updated by this slider): ${last}%.`);
  }

  lines.push(
    "",
    "This explainer does not upload the slider value — only your real Send reading / simulation steps update Supabase.",
    "",
    "Generated on your device — no external AI.",
  );

  return lines.join("\n");
}
