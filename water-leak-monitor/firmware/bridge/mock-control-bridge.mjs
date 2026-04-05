import http from "node:http";

const PORT = Number(process.env.HTTP_PORT ?? "4011");
let moisture = 40;

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function page() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Moisture Control</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; max-width: 680px; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
      .row { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      button { padding: 8px 12px; border-radius: 8px; border: 1px solid #ccc; background: #f7f7f7; cursor: pointer; }
      code { background: #f3f3f3; padding: 2px 6px; border-radius: 6px; }
      #val { font-weight: 700; color: #0f766e; }
      .hint { color: #555; font-size: 14px; line-height: 1.5; }
      input[type="number"] { width: 72px; padding: 6px 8px; border-radius: 8px; border: 1px solid #ccc; }
    </style>
  </head>
  <body>
    <h2>Live Link Moisture Control</h2>
    <p class="hint">
      <strong>Tinkercad note:</strong> The browser simulation cannot push data to this PC automatically.
      Run your circuit in Tinkercad, read the number in <strong>Serial Monitor</strong>, then type that same
      value below (or use the slider). Your phone app will then match via <code>/moisture</code>.
    </p>
    <p>App polls: <code>/moisture</code></p>

    <div class="card">
      <strong>Mirror from Tinkercad Serial Monitor</strong>
      <p class="hint">Copy the latest line (0–100) from Tinkercad Serial Monitor and apply.</p>
      <div class="row">
        <label>Moisture % <input id="mirror" type="number" min="0" max="100" placeholder="e.g. 67" /></label>
        <button type="button" onclick="applyMirror()">Apply to bridge</button>
      </div>
    </div>

    <div class="card">
      <div>Current bridge value: <span id="val">${moisture}</span>%</div>
      <div class="row">
        <input id="s" type="range" min="0" max="100" value="${moisture}" style="width:100%" />
      </div>
      <div class="row">
        <button onclick="setM(20)">Dry 20%</button>
        <button onclick="setM(50)">Normal 50%</button>
        <button onclick="setM(80)">Leak 80%</button>
        <button onclick="setM(95)">Critical 95%</button>
      </div>
    </div>
    <script>
      const val = document.getElementById('val');
      const s = document.getElementById('s');
      const mirror = document.getElementById('mirror');
      async function setM(n) {
        const r = await fetch('/set?m=' + n);
        const j = await r.json();
        s.value = j.moisture;
        val.textContent = j.moisture;
      }
      async function applyMirror() {
        const n = Number(mirror.value);
        if (!Number.isFinite(n)) { alert('Enter 0–100'); return; }
        await setM(n);
      }
      s.addEventListener('input', () => setM(s.value));
      setInterval(async () => {
        const r = await fetch('/moisture');
        const j = await r.json();
        s.value = j.moisture;
        val.textContent = j.moisture;
      }, 1000);
    </script>
  </body>
</html>`;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "POST" && u.pathname === "/set") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        const j = body ? JSON.parse(body) : {};
        const q = Number(j.moisture ?? j.m);
        if (Number.isFinite(q)) moisture = clamp(q);
      } catch {
        /* ignore */
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ ok: true, moisture }));
    });
    return;
  }

  if (u.pathname === "/moisture") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ moisture, source: "mock-control" }));
    return;
  }

  if (u.pathname === "/set") {
    const q = Number(u.searchParams.get("m"));
    if (Number.isFinite(q)) moisture = clamp(q);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ ok: true, moisture }));
    return;
  }

  if (u.pathname === "/" || u.pathname === "/control") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page());
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MOCK_CONTROL_READY http://0.0.0.0:${PORT}/control`);
});

