/**
 * AQUAGUARD IoT — Dynamic Water Leak Detection
 * Arduino Uno / Tinkercad Circuits
 *
 * SENSORS (potentiometers simulating moisture):
 *   A0  Kitchen
 *   A1  Bathroom
 *   A2  Basement
 *   A3  Threshold knob (turn to set leak threshold 0-100%)
 *
 * OUTPUTS:
 *   D2  Alarm LED (red)           — ON when leak is confirmed
 *   D3  Valve LED (green)         — ON = valve open, OFF = valve closed
 *   D4  Buzzer                    — sounds while leak is active
 *   D5  Reset button (INPUT_PULLUP) — press to clear alarm and reopen valve
 *   D9  Servo (valve visualizer)  — 90 = open, 0 = closed
 *
 * SERIAL OUTPUT (9600 baud, every 500ms):
 *   Line format: MOISTURE:<max%>|THRESHOLD:<thr%>|VALVE:<OPEN/CLOSED>|ALARM:<ON/OFF>|K:<k%>|B:<b%>|S:<s%>
 *   Also prints a clean number line (just the moisture %) for easy app mirroring.
 *
 * HOW TO USE WITH THE APP:
 *   1. Run simulation in Tinkercad
 *   2. Turn sensor pots (A0-A2) to change moisture levels
 *   3. Turn threshold pot (A3) to set trip point
 *   4. Read the moisture % from Serial Monitor
 *   5. Type that value into the app's Live tab and tap Send
 *   6. Both Tinkercad and app now show the same behavior
 */

#include <Servo.h>

const int S_KITCHEN  = A0;
const int S_BATHROOM = A1;
const int S_BASEMENT = A2;
const int S_THRESH   = A3;

const int ALARM_LED  = 2;
const int VALVE_LED  = 3;
const int BUZZER_PIN = 4;
const int RESET_BTN  = 5;
const int SERVO_PIN  = 9;

const unsigned long CONFIRM_MS       = 2000;
const unsigned long SERIAL_INTERVAL  = 500;
const unsigned long DEBOUNCE_MS      = 200;

Servo valveServo;

bool valveOpen    = true;
bool alarmOn      = false;
bool leakLatched  = false;
unsigned long leakStartMs   = 0;
unsigned long lastSerialMs  = 0;
unsigned long lastResetMs   = 0;

int toPercent(int raw) {
  return constrain(map(raw, 0, 1023, 0, 100), 0, 100);
}

void setValve(bool open) {
  valveOpen = open;
  digitalWrite(VALVE_LED, open ? HIGH : LOW);
  valveServo.write(open ? 90 : 0);
}

void clearAlarm() {
  alarmOn = false;
  leakLatched = false;
  leakStartMs = 0;
  digitalWrite(ALARM_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  setValve(true);
}

void setup() {
  pinMode(ALARM_LED, OUTPUT);
  pinMode(VALVE_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RESET_BTN, INPUT_PULLUP);

  valveServo.attach(SERVO_PIN);

  digitalWrite(ALARM_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  setValve(true);

  Serial.begin(9600);
  Serial.println("AQUAGUARD READY");
}

void loop() {
  unsigned long now = millis();

  // --- Read sensors ---
  int rawK = analogRead(S_KITCHEN);
  int rawB = analogRead(S_BATHROOM);
  int rawS = analogRead(S_BASEMENT);
  int rawT = analogRead(S_THRESH);

  int pctK = toPercent(rawK);
  int pctB = toPercent(rawB);
  int pctS = toPercent(rawS);
  int threshold = toPercent(rawT);

  int maxPct = max(pctK, max(pctB, pctS));
  bool wet = maxPct >= threshold;

  // --- Reset button (active LOW with pull-up) ---
  if (digitalRead(RESET_BTN) == LOW && (now - lastResetMs > DEBOUNCE_MS)) {
    lastResetMs = now;
    clearAlarm();
  }

  // --- Leak detection with confirmation delay ---
  if (wet && !leakLatched) {
    if (leakStartMs == 0) {
      leakStartMs = now;
    } else if (now - leakStartMs >= CONFIRM_MS) {
      leakLatched = true;
      alarmOn = true;
      setValve(false);
    }
  }

  if (!wet && !leakLatched) {
    leakStartMs = 0;
  }

  // --- Drive outputs ---
  digitalWrite(ALARM_LED, alarmOn ? HIGH : LOW);
  digitalWrite(BUZZER_PIN, (alarmOn && wet) ? HIGH : LOW);

  // --- Serial output ---
  if (now - lastSerialMs >= SERIAL_INTERVAL) {
    lastSerialMs = now;

    // Clean number for app mirroring
    Serial.println(maxPct);

    // Detailed line for debugging / display
    Serial.print("MOISTURE:");
    Serial.print(maxPct);
    Serial.print("|THRESHOLD:");
    Serial.print(threshold);
    Serial.print("|VALVE:");
    Serial.print(valveOpen ? "OPEN" : "CLOSED");
    Serial.print("|ALARM:");
    Serial.print(alarmOn ? "ON" : "OFF");
    Serial.print("|K:");
    Serial.print(pctK);
    Serial.print("|B:");
    Serial.print(pctB);
    Serial.print("|S:");
    Serial.println(pctS);
  }
}
