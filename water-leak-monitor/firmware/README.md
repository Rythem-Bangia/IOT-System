# AQUAGUARD IoT - Dynamic Water Leak Detection

This connects a **Tinkercad simulation** (or real Arduino) to the **Water leak monitor** app's **Live** tab.

## Circuit Layout (Tinkercad)

### Components needed

| Component | Qty | Purpose |
|-----------|-----|---------|
| Arduino Uno | 1 | Controller |
| Potentiometer (10k) | 4 | 3 moisture sensors + 1 threshold knob |
| Red LED + 220 ohm resistor | 1 | Alarm indicator |
| Green LED + 220 ohm resistor | 1 | Valve status (ON = open) |
| Piezo buzzer | 1 | Audible alarm |
| Micro servo | 1 | Valve open/close visualizer |
| Pushbutton | 1 | Manual reset after leak |

### Pin wiring

| Arduino Pin | Component | Notes |
|-------------|-----------|-------|
| **A0** | Pot 1 (middle pin) | Kitchen moisture sensor |
| **A1** | Pot 2 (middle pin) | Bathroom moisture sensor |
| **A2** | Pot 3 (middle pin) | Basement moisture sensor |
| **A3** | Pot 4 (middle pin) | **Threshold knob** - turn to set trip point |
| **D2** | Red LED (via 220 ohm) | Alarm - lights when leak confirmed |
| **D3** | Green LED (via 220 ohm) | Valve status - ON = open, OFF = closed |
| **D4** | Piezo buzzer | Sounds while leak is active |
| **D5** | Pushbutton (other leg to GND) | Reset - clears alarm, reopens valve |
| **D9** | Servo signal wire | Valve visualizer - 90 deg = open, 0 deg = closed |
| **5V** | All pot left pins, servo VCC | Power rail |
| **GND** | All pot right pins, servo GND, LED cathodes, buzzer GND, button GND | Ground rail |

### Changes from the old circuit

1. **Add a 4th potentiometer** to **A3** - this is the threshold knob. Turn it to change the leak trip point (0-100%) live during simulation. No more hardcoded threshold.
2. **Add a micro servo** to **D9** - this physically shows the valve opening/closing (90 deg = open, sweeps to 0 = closed on leak). Drag "Micro Servo" from the Tinkercad component panel.
3. **Add a pushbutton** between **D5** and **GND** - press it to reset the alarm and reopen the valve after a leak event. The code uses INPUT_PULLUP so no external resistor is needed.

### How the dynamic code works

- **Threshold is live**: turn pot A3 and the trip point changes immediately. The Serial Monitor shows the current threshold so you can match it in the app's Monitor tab.
- **Leak confirmation**: when any sensor pot exceeds the threshold, a 2-second confirmation timer starts. If it stays above for 2s, the leak is confirmed - alarm LED lights, buzzer sounds, servo closes, green valve LED turns off.
- **Reset**: press the pushbutton on D5 to clear the alarm, silence the buzzer, and reopen the valve (servo goes back to 90 deg).
- **Serial output** (9600 baud, every 500ms):
  - Line 1: plain number `0-100` (max moisture %) - **this is what you type into the app**
  - Line 2: detailed `MOISTURE:72|THRESHOLD:65|VALVE:OPEN|ALARM:OFF|K:45|B:72|S:30`

## Connecting Tinkercad to the App

No external server or bridge needed. Everything happens inside the app.

### Step by step

1. **Tinkercad**: Open your circuit, paste the code from `aquaguard_iot.ino`, click **Start Simulation**
2. **Adjust pots**: Turn the sensor pots (A0-A2) to simulate different moisture levels. Turn the threshold pot (A3) to set the trip point.
3. **Read Serial Monitor**: Open Serial Monitor in Tinkercad. You'll see lines like:
   ```
   72
   MOISTURE:72|THRESHOLD:65|VALVE:OPEN|ALARM:OFF|K:45|B:72|S:30
   ```
4. **App - Monitor tab**: Set the threshold slider to match the threshold % shown in Serial Monitor, then Save
5. **App - Live tab**: Type the moisture number (e.g. `72`) into the control panel, tap **Send**. Or drag the slider and tap **Send to cloud**.
6. **Result**: Both Tinkercad and the app now show the same behavior - if moisture exceeds threshold, both close the valve and trigger the alarm. The app also sends a leak alert email if configured.

### Presets in the app

The Live tab has quick presets: Dry (15%), Normal (40%), Damp (65%), Wet (80%), Leak (95%). Tap any to instantly send that value.

### Auto-repeat mode

Turn on auto-repeat in the Live tab to keep sending the current slider value every few seconds - useful to simulate a continuous sensor feed while you watch the valve/alarm react.

## Real Arduino (USB)

For a physical Arduino instead of Tinkercad:

1. Wire the circuit as above
2. Upload the sketch via Arduino IDE
3. The serial bridge (`firmware/bridge/serial-bridge.mjs`) can read the COM port automatically:
   ```powershell
   cd firmware/bridge
   npm install
   $env:SERIAL_PORT="COM3"   # your Arduino's port from Device Manager
   npm start
   ```
4. Or just read the Serial Monitor value and type it into the app's Live tab - same as Tinkercad.
