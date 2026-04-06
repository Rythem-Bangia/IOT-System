import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLeakHistoryForExport } from "./leakHistoryExport";
import type { LeakEventRow } from "./iot";

describe("formatLeakHistoryForExport", () => {
  it("handles empty rows", () => {
    assert.ok(formatLeakHistoryForExport([]).includes("no events"));
  });

  it("includes zone and moisture", () => {
    const row = {
      id: "1",
      zone_id: "z",
      moisture_at_trigger: 88,
      response_ms: 120,
      email_sent_at: null,
      email_last_attempt_at: null,
      email_last_error: null,
      resolved_at: null,
      created_at: "2025-01-01T12:00:00.000Z",
      zones: { name: "Bathroom" },
    } satisfies LeakEventRow;
    const out = formatLeakHistoryForExport([row]);
    assert.match(out, /Bathroom/);
    assert.match(out, /88%/);
    assert.match(out, /120 ms/);
  });
});
