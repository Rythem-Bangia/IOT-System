"""
Hardware actuators: solenoid valve relay, piezo buzzer, status LED.

When running on a desktop (no RPi.GPIO), all calls are no-ops that print
to stdout so you can test the full pipeline without hardware.
"""

from __future__ import annotations

import threading
import time

import config


# ─── GPIO abstraction ────────────────────────────────────────────────

class _GPIOWrapper:
    """Thin wrapper so the rest of the module doesn't need conditional imports."""

    def __init__(self):
        self._gpio = None
        if config.ON_PI:
            import RPi.GPIO as GPIO  # type: ignore
            GPIO.setwarnings(False)
            GPIO.setmode(GPIO.BCM)
            self._gpio = GPIO

    def setup_output(self, pin: int, initial: bool = False):
        if self._gpio:
            self._gpio.setup(
                pin, self._gpio.OUT,
                initial=self._gpio.HIGH if initial else self._gpio.LOW,
            )

    def write(self, pin: int, high: bool):
        if self._gpio:
            self._gpio.output(pin, self._gpio.HIGH if high else self._gpio.LOW)

    def cleanup(self):
        if self._gpio:
            self._gpio.cleanup()


_gpio = _GPIOWrapper()


# ─── Solenoid valve ──────────────────────────────────────────────────

class Valve:
    """
    Controls a solenoid valve via a relay module.
    Relay is active-LOW: GPIO HIGH = relay off = valve OPEN.
    """

    def __init__(self):
        self.is_open = True
        _gpio.setup_output(config.VALVE_RELAY_PIN, initial=True)
        print(f"[valve] Initialized on GPIO {config.VALVE_RELAY_PIN} (open)")

    def close(self):
        if not self.is_open:
            return
        if config.ENABLE_VALVE_CONTROL:
            _gpio.write(config.VALVE_RELAY_PIN, False)
        self.is_open = False
        print("[valve] CLOSED — water supply cut off")

    def open(self):
        if self.is_open:
            return
        if config.ENABLE_VALVE_CONTROL:
            _gpio.write(config.VALVE_RELAY_PIN, True)
        self.is_open = True
        print("[valve] OPENED — water flowing")

    def reset(self):
        self.open()


# ─── Buzzer ──────────────────────────────────────────────────────────

class Buzzer:
    """Piezo buzzer — beeps in a pattern on leak detection."""

    def __init__(self):
        _gpio.setup_output(config.BUZZER_PIN)
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        print(f"[buzzer] Initialized on GPIO {config.BUZZER_PIN}")

    def alarm(self, duration_s: float = 5.0, beep_hz: float = 3.0):
        """Start beeping in a background thread."""
        if not config.ENABLE_ALARM:
            print("[buzzer] Alarm disabled by config")
            return
        self.stop()
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._beep_loop,
            args=(duration_s, beep_hz),
            daemon=True,
        )
        self._thread.start()

    def _beep_loop(self, duration_s: float, beep_hz: float):
        period = 1.0 / max(0.5, beep_hz)
        end_time = time.time() + duration_s
        on = True
        while time.time() < end_time and not self._stop_event.is_set():
            _gpio.write(config.BUZZER_PIN, on)
            if not config.ON_PI and on:
                print("[buzzer] BEEP")
            on = not on
            time.sleep(period / 2)
        _gpio.write(config.BUZZER_PIN, False)

    def stop(self):
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None


# ─── LED ─────────────────────────────────────────────────────────────

class StatusLED:
    """
    Single LED for status indication.
    Steady = normal, fast blink = leak detected.
    """

    def __init__(self):
        _gpio.setup_output(config.LED_PIN)
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self.set_normal()
        print(f"[led] Initialized on GPIO {config.LED_PIN}")

    def set_normal(self):
        """Steady on — system healthy."""
        self._stop_blink()
        _gpio.write(config.LED_PIN, True)

    def set_leak(self, duration_s: float = 10.0):
        """Fast blink — leak detected."""
        if not config.ENABLE_ALARM:
            return
        self._stop_blink()
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._blink_loop,
            args=(duration_s,),
            daemon=True,
        )
        self._thread.start()

    def _blink_loop(self, duration_s: float):
        end_time = time.time() + duration_s
        on = True
        while time.time() < end_time and not self._stop_event.is_set():
            _gpio.write(config.LED_PIN, on)
            on = not on
            time.sleep(0.15)
        _gpio.write(config.LED_PIN, True)

    def _stop_blink(self):
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None

    def off(self):
        self._stop_blink()
        _gpio.write(config.LED_PIN, False)


# ─── Cleanup ─────────────────────────────────────────────────────────

def cleanup():
    """Release all GPIO resources. Call on shutdown."""
    _gpio.cleanup()
    print("[actuators] GPIO cleaned up")
