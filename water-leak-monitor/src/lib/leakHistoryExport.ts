import type { LeakEventRow } from "./iot";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function zoneNameOf(row: LeakEventRow): string {
  const z = row.zones;
  if (z && typeof z === "object" && "name" in z) {
    return String((z as { name: string }).name);
  }
  return "Zone";
}

/** Plain-text export for sharing or copying leak history. */
export function formatLeakHistoryForExport(rows: LeakEventRow[]): string {
  const header = "Water leak monitor — leak history export\n";
  if (rows.length === 0) return `${header}(no events)`;
  const lines = rows.map((item) => {
    const zn = zoneNameOf(item);
    const email = item.email_sent_at
      ? "email sent"
      : item.email_last_error
        ? `email error: ${item.email_last_error}`
        : "email not sent";
    const resp =
      item.response_ms != null ? `${item.response_ms} ms` : "—";
    return `${formatTime(item.created_at)} | ${zn} | moisture ${item.moisture_at_trigger}% | response ${resp} | ${email}`;
  });
  return `${header.trimEnd()}\n${lines.join("\n")}`;
}
