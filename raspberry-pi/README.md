# Raspberry Pi Edge AI — Water Leak Monitor

A Python-based edge AI gateway that turns your Raspberry Pi into a physical
water leak detector. It reads a real moisture sensor, runs local anomaly
detection, controls a solenoid valve, and syncs everything to your Supabase
backend — the same cloud pipeline your Expo app uses.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Raspberry Pi                         │
│                                                       │
│  Moisture Sensor ──► Local AI ──► Supabase Cloud     │
│  (ADC: ADS1115       (anomaly,    (submit_sensor_    │
│   or MCP3008)         trend,       reading RPC)      │
│                       risk)                           │
│       │                  │              │             │
│       ▼                  ▼              ▼             │
│  Solenoid Valve    Buzzer + LED    ai-hub Edge Fn    │
│  (GPIO relay)      (GPIO alarm)   (Cloud AI brief)   │
└──────────────────────────────────────────────────────┘
         │                                 │
         ▼                                 ▼
   Physical water                  Expo App (Dashboard,
   supply shutoff                  History, Simulate)
```

## Quick Start (Mock Mode — No Hardware Needed)

Test the full pipeline on your Mac/PC:

```bash
cd raspberry-pi

# Set your Supabase auth credentials
export SUPABASE_EMAIL="your-email@example.com"
export SUPABASE_PASSWORD="your-password"

# Run with mock sensor (default)
python3 main.py
```

You'll see synthetic moisture data, local AI analysis, and cloud sync
in your terminal. The readings appear in your Expo app's History tab
with `source: physical`.

### What the Raspberry Pi script does

1. **Reads** the moisture sensor (mock, ADS1115, or MCP3008) on a timer (`POLL_INTERVAL_S`, default 5s).
2. **Local AI** — rolling window: anomaly (Z-score), trend (slope), stuck-sensor check, risk score (no internet).
3. **If moisture ≥ threshold** — closes the valve (GPIO), buzzer + LED, then uploads to Supabase; on a new leak it can trigger email + cloud AI (email path needs `device_secret`; cloud AI needs email login).
4. **Every normal cycle** — sends a **heartbeat** reading to Supabase (`source: physical`) so the **Simulate** tab’s Raspberry Pi card shows **ONLINE**.

Without cloud credentials, the script still prints readings locally but **nothing is saved** — the app stays **OFFLINE**.

### Cloud credentials (pick one)

**A — Email + password** (same account as the Expo app):

```bash
export SUPABASE_EMAIL="you@example.com"
export SUPABASE_PASSWORD="your-password"
python3 main.py
```

**B — Device secret** (no password in the shell; good for systemd):

1. Supabase Dashboard → **Table Editor** → `zones` → copy your row’s **id** (UUID).
2. Open the linked `devices` row → copy **device_secret** (UUID).
3. Set `DEFAULT_MOISTURE_THRESHOLD` to match the **Monitor** tab.

```bash
export ZONE_ID="paste-zone-uuid"
export DEVICE_SECRET="paste-device-secret-uuid"
export DEFAULT_MOISTURE_THRESHOLD=65
python3 main.py
```

Success: terminal shows **`Cloud: ok`** each cycle. The Simulate screen should flip to **ONLINE** within about two poll intervals.

### “OFFLINE” in the app — checklist

| Check | What to do |
|-------|------------|
| No `Cloud: ok` in terminal | Set email/password or `ZONE_ID` + `DEVICE_SECRET` |
| Wrong zone | `ZONE_ID` must be the **same** zone the app uses (usually your only zone) |
| Stale > 2 min | Keep `main.py` running; increase `POLL_INTERVAL_S` only if needed |
| `submit failed` in terminal | Fix secret / zone mismatch; confirm Supabase URL + anon key |

## Hardware Setup

### Components Needed

| Component | Purpose | Example |
|-----------|---------|---------|
| Raspberry Pi (any model with GPIO) | Main controller | Pi Zero W, Pi 4, Pi 5 |
| Capacitive moisture sensor | Detect water | Capacitive Soil Moisture Sensor v1.2 |
| ADS1115 ADC module | Analog-to-digital (Pi has no ADC) | Adafruit ADS1115 |
| 5V relay module | Switch solenoid valve | SRD-05VDC-SL-C |
| 12V solenoid valve | Cut water supply | 1/2" brass normally-open |
| Piezo buzzer | Audible alarm | Active buzzer 5V |
| LED + 220Ω resistor | Status indicator | Any standard LED |
| 12V power supply | Power the solenoid | 12V 1A adapter |
| Jumper wires | Connections | Male-to-female |

### Wiring Diagram

```
Raspberry Pi GPIO (BCM numbering)
──────────────────────────────────

                    ┌─────────────┐
 3.3V (pin 1) ─────┤ VDD    ADS  │
 GND  (pin 6) ─────┤ GND   1115  │
 SDA  (pin 3) ─────┤ SDA         │
 SCL  (pin 5) ─────┤ SCL         │
                    │        A0 ◄─┼── Moisture sensor signal
                    └─────────────┘

 GPIO 17 (pin 11) ──── Relay IN ──── Solenoid valve
 GPIO 27 (pin 13) ──── Buzzer (+)
 GPIO 22 (pin 15) ──── LED (+) ──── 220Ω ──── GND

 GND (pin 9)  ──── Relay GND, Buzzer (-), LED (-)
 5V  (pin 2)  ──── Relay VCC, ADS1115 VDD (if 5V tolerant)
```

### Pin Assignment

| GPIO | BCM Pin | Physical Pin | Connected To |
|------|---------|-------------|--------------|
| 17 | GPIO17 | Pin 11 | Relay IN (solenoid valve) |
| 27 | GPIO27 | Pin 13 | Buzzer (+) |
| 22 | GPIO22 | Pin 15 | LED anode (+) |
| SDA | GPIO2 | Pin 3 | ADS1115 SDA |
| SCL | GPIO3 | Pin 5 | ADS1115 SCL |

Override in `config.py` or via environment variables:
```bash
export VALVE_RELAY_PIN=17
export BUZZER_PIN=27
export LED_PIN=22
```

## Installation on Raspberry Pi

```bash
# 1. Clone the repo (or copy the raspberry-pi folder)
cd ~/IOT-System/raspberry-pi

# 2. Install system dependencies
sudo apt-get update
sudo apt-get install -y python3-pip python3-venv i2c-tools

# 3. Enable I2C (for ADS1115)
sudo raspi-config nonint do_i2c 0

# 4. Create virtual environment
python3 -m venv venv
source venv/bin/activate

# 5. Install Python dependencies
pip install RPi.GPIO
pip install adafruit-blinka
pip install adafruit-circuitpython-ads1x15

# 6. Verify I2C connection (should show 0x48 for ADS1115)
i2cdetect -y 1

# 7. Configure
export SUPABASE_EMAIL="your-email@example.com"
export SUPABASE_PASSWORD="your-password"
export SENSOR_DRIVER="ADS1115"

# 8. Run
python main.py
```

## Configuration

All settings live in `config.py` and can be overridden via environment
variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SENSOR_DRIVER` | `mock` | `ADS1115`, `MCP3008`, or `mock` |
| `ADC_CHANNEL` | `0` | ADC channel (0-3 for ADS1115) |
| `POLL_INTERVAL_S` | `5` | Seconds between sensor reads |
| `DEFAULT_MOISTURE_THRESHOLD` | `65` | Fallback threshold (cloud overrides) |
| `VALVE_RELAY_PIN` | `17` | GPIO for solenoid relay |
| `BUZZER_PIN` | `27` | GPIO for buzzer |
| `LED_PIN` | `22` | GPIO for status LED |
| `ENABLE_VALVE_CONTROL` | `true` | Set `false` for dry-run testing |
| `ENABLE_ALARM` | `true` | Set `false` to disable buzzer/LED |
| `ENABLE_CLOUD_AI` | `true` | Request cloud AI analysis on leaks |
| `SUPABASE_EMAIL` | | Your Supabase account email |
| `SUPABASE_PASSWORD` | | Your Supabase account password |
| `AI_WINDOW_SIZE` | `60` | Readings in local AI rolling window |
| `ANOMALY_Z_THRESHOLD` | `2.5` | Z-score for anomaly flagging |

## Local AI Features

The Pi runs these AI checks **locally** on every reading — no internet needed:

1. **Anomaly Detection** — Rolling Z-score flags readings that deviate
   significantly from the recent trend.

2. **Trend Prediction** — Linear regression over the last 30 readings
   predicts if moisture is rising, falling, or stable, and how fast
   (%/min).

3. **Stuck Sensor Detection** — If 20+ consecutive readings are identical,
   the sensor may be disconnected or malfunctioning.

4. **Composite Risk Score** — 0-100 score combining proximity to threshold,
   anomaly status, trend direction, and sensor health. Mapped to
   LOW / MEDIUM / HIGH / CRITICAL.

## How It Connects to Your Expo App

The Pi uses the **exact same Supabase backend** as your Expo app:

- Calls `submit_sensor_reading` RPC with `source = 'physical'`
- Triggers the same leak detection logic, valve close, and email alerts
- Physical readings appear in your app's Dashboard and History screens
- AI features (sensor health, risk prediction, emergency checklist)
  work identically for physical and virtual data

## Running as a Service

To run automatically on boot:

```bash
sudo nano /etc/systemd/system/leak-monitor.service
```

```ini
[Unit]
Description=Water Leak Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/IOT-System/raspberry-pi
Environment=SENSOR_DRIVER=ADS1115
Environment=SUPABASE_EMAIL=your-email@example.com
Environment=SUPABASE_PASSWORD=your-password
ExecStart=/home/pi/IOT-System/raspberry-pi/venv/bin/python3 main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable leak-monitor
sudo systemctl start leak-monitor
sudo journalctl -u leak-monitor -f   # view logs
```

## Calibration

Moisture sensor calibration:

1. Read sensor in dry air → note the raw ADC value (`ADC_DRY`)
2. Submerge sensor tip in water → note the raw value (`ADC_WET`)
3. Set these in config:
   ```bash
   export ADC_DRY=30000   # your dry value
   export ADC_WET=10000   # your wet value
   ```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: RPi.GPIO` | Install: `pip install RPi.GPIO` or run in mock mode |
| `i2cdetect` shows nothing | Check wiring, enable I2C in `raspi-config` |
| Readings always 0% or 100% | Calibrate ADC_DRY / ADC_WET values |
| Cloud sync fails | Check SUPABASE_EMAIL/PASSWORD, ensure internet |
| Valve doesn't actuate | Check relay wiring, set `ENABLE_VALVE_CONTROL=true` |
