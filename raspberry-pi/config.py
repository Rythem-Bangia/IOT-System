"""
Configuration for the Raspberry Pi edge AI water leak monitor.

Override any value via environment variables or by editing this file.
"""

import os

# ─── Supabase ────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    "https://eabomkfkishmmxgbxpzu.supabase.co",
)
SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhYm9ta2ZraXNobW14Z2J4cHp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjIxMzMsImV4cCI6MjA4OTk5ODEzM30.kGWOpJ00ZxAmskPIYPDI7_i5M13YPlf77npDVGBmK0M",
)

# User email + password for Supabase auth (same account you use in the app).
# The Pi signs in to get a JWT so it can call submit_sensor_reading.
SUPABASE_EMAIL = os.getenv("SUPABASE_EMAIL", "")
SUPABASE_PASSWORD = os.getenv("SUPABASE_PASSWORD", "")

# Alternative: device-only auth (no password in scripts). Same values as the Expo app:
# ZONE_ID = your zone UUID from Supabase Table Editor → zones
# DEVICE_SECRET = devices.device_secret for that zone’s device (UUID)
# Readings use RPC submit_sensor_reading_device (anon key + secret).
ZONE_ID = os.getenv("ZONE_ID", "").strip()
DEVICE_SECRET = os.getenv("DEVICE_SECRET", "").strip()

# ─── GPIO pin assignments ────────────────────────────────────────────
# Solenoid valve relay (active-LOW relay module: GPIO HIGH = valve open)
VALVE_RELAY_PIN = int(os.getenv("VALVE_RELAY_PIN", "17"))

# Piezo buzzer
BUZZER_PIN = int(os.getenv("BUZZER_PIN", "27"))

# Status LED (green = normal, blinks red on leak via buzzer pin)
LED_PIN = int(os.getenv("LED_PIN", "22"))

# ─── ADC / sensor ────────────────────────────────────────────────────
# Supported drivers: "ADS1115", "MCP3008", "mock"
# "mock" generates synthetic data for testing without hardware.
SENSOR_DRIVER = os.getenv("SENSOR_DRIVER", "mock")

# ADC channel the moisture sensor is wired to (0-3 for ADS1115, 0-7 for MCP3008)
ADC_CHANNEL = int(os.getenv("ADC_CHANNEL", "0"))

# MCP3008 SPI pins (only used when SENSOR_DRIVER="MCP3008")
MCP3008_CLK = int(os.getenv("MCP3008_CLK", "11"))
MCP3008_MISO = int(os.getenv("MCP3008_MISO", "9"))
MCP3008_MOSI = int(os.getenv("MCP3008_MOSI", "10"))
MCP3008_CS = int(os.getenv("MCP3008_CS", "8"))

# Raw ADC range → moisture %.  Calibrate for your sensor.
# Most capacitive sensors: dry ≈ 30000 (ADS1115) / 800 (MCP3008), wet ≈ 10000 / 300
ADC_DRY = int(os.getenv("ADC_DRY", "30000"))
ADC_WET = int(os.getenv("ADC_WET", "10000"))

# ─── Polling & thresholds ────────────────────────────────────────────
# Seconds between sensor reads
POLL_INTERVAL_S = float(os.getenv("POLL_INTERVAL_S", "5"))

# Local fallback threshold (%). The cloud threshold from Supabase takes priority
# if available; this is used when offline or on first boot.
DEFAULT_MOISTURE_THRESHOLD = int(os.getenv("DEFAULT_MOISTURE_THRESHOLD", "65"))

# How many readings to keep in the local rolling window for AI analysis
AI_WINDOW_SIZE = int(os.getenv("AI_WINDOW_SIZE", "60"))

# Z-score above which a reading is flagged as anomalous
ANOMALY_Z_THRESHOLD = float(os.getenv("ANOMALY_Z_THRESHOLD", "2.5"))

# Number of consecutive identical readings before "stuck sensor" warning
STUCK_SENSOR_COUNT = int(os.getenv("STUCK_SENSOR_COUNT", "20"))

# ─── Behavior ────────────────────────────────────────────────────────
# If True, the Pi will physically close the valve on leak detection.
# Set to False for dry-run testing where you don't want to actuate hardware.
ENABLE_VALVE_CONTROL = os.getenv("ENABLE_VALVE_CONTROL", "true").lower() == "true"

# If True, trigger buzzer + LED on leak
ENABLE_ALARM = os.getenv("ENABLE_ALARM", "true").lower() == "true"

# If True, request cloud AI analysis after each leak event
ENABLE_CLOUD_AI = os.getenv("ENABLE_CLOUD_AI", "true").lower() == "true"

# ─── Hardware availability ───────────────────────────────────────────
# Auto-detect: True when running on a real Pi with GPIO, False on desktop/Mac
try:
    import RPi.GPIO  # noqa: F401
    ON_PI = True
except (ImportError, RuntimeError):
    ON_PI = False
