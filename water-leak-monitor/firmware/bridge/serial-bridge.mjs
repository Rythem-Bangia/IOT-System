/**
 * Reads moisture % lines from Arduino serial (9600) and serves GET /moisture as JSON
 * for the mobile app: Live tab → Bridge endpoint.
 *
 * Usage:
 *   npm install
 *   set SERIAL_PORT=COM3   (Windows) or /dev/ttyUSB0 (Linux) or /dev/tty.usbserial-* (macOS)
 *   set HTTP_PORT=4000
 *   npm start
 *
 * Arduino must print one integer 0–100 per line (see aquaguard_iot.ino).
 */

import http from "node:http";
import { SerialPort } from "serialport";

const SERIAL_PATH = process.env.SERIAL_PORT ?? "COM3";
const HTTP_PORT = Number(process.env.HTTP_PORT ?? "4000");

let lastMoisture = 0;
let lastLineAt = 0;
let buf = "";

const port = new SerialPort({
  path: SERIAL_PATH,
  baudRate: 9600,
});

port.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split(/\r?\n/);
  buf = lines.pop() ?? "";
  for (const line of lines) {
    const n = parseInt(line.trim(), 10);
    if (Number.isFinite(n)) {
      lastMoisture = Math.max(0, Math.min(100, n));
      lastLineAt = Date.now();
    }
  }
});

port.on("error", (err) => {
  console.error("Serial error:", err.message);
});

const server = http.createServer((req, res) => {
  if (req.url === "/moisture" || req.url.startsWith("/moisture?")) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        moisture: lastMoisture,
        age_ms: lastLineAt ? Date.now() - lastLineAt : null,
      }),
    );
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`HTTP  http://0.0.0.0:${HTTP_PORT}/moisture`);
  console.log(`Serial  ${SERIAL_PATH} @ 9600`);
});
