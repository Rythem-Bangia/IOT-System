"""
Moisture sensor driver.

Supports three backends:
  - ADS1115 (I2C 16-bit ADC — recommended)
  - MCP3008 (SPI 10-bit ADC)
  - mock   (synthetic data for desktop testing)
"""

from __future__ import annotations

import math
import random
import time
from abc import ABC, abstractmethod

import config


class SensorBackend(ABC):
    """Read a single moisture percentage from the sensor."""

    @abstractmethod
    def read_moisture(self) -> float:
        """Return moisture 0-100 %."""


# ─── ADS1115 (I2C) ──────────────────────────────────────────────────

class ADS1115Backend(SensorBackend):
    def __init__(self, channel: int = 0):
        import board  # type: ignore
        import busio  # type: ignore
        import adafruit_ads1x15.ads1115 as ADS  # type: ignore
        from adafruit_ads1x15.analog_in import AnalogIn  # type: ignore

        i2c = busio.I2C(board.SCL, board.SDA)
        ads = ADS.ADS1115(i2c)
        channel_map = {0: ADS.P0, 1: ADS.P1, 2: ADS.P2, 3: ADS.P3}
        self._chan = AnalogIn(ads, channel_map.get(channel, ADS.P0))

    def read_moisture(self) -> float:
        raw = self._chan.value
        pct = (config.ADC_DRY - raw) / max(1, config.ADC_DRY - config.ADC_WET) * 100
        return max(0.0, min(100.0, pct))


# ─── MCP3008 (SPI) ──────────────────────────────────────────────────

class MCP3008Backend(SensorBackend):
    def __init__(self, channel: int = 0):
        import spidev  # type: ignore

        self._channel = channel
        self._spi = spidev.SpiDev()
        self._spi.open(0, 0)
        self._spi.max_speed_hz = 1350000

    def read_moisture(self) -> float:
        cmd = [1, (8 + self._channel) << 4, 0]
        result = self._spi.xfer2(cmd)
        raw = ((result[1] & 3) << 8) + result[2]
        dry, wet = 800, 300
        pct = (dry - raw) / max(1, dry - wet) * 100
        return max(0.0, min(100.0, pct))


# ─── Mock (desktop testing) ─────────────────────────────────────────

class MockBackend(SensorBackend):
    """
    Generates realistic synthetic moisture data:
    - Baseline wanders slowly (simulates ambient humidity)
    - Occasional spike simulates a leak event
    """

    def __init__(self):
        self._t = 0.0
        self._baseline = 30.0
        self._spike_active = False
        self._spike_remaining = 0

    def read_moisture(self) -> float:
        self._t += 1
        self._baseline += random.gauss(0, 0.3)
        self._baseline = max(15, min(55, self._baseline))

        if not self._spike_active and random.random() < 0.02:
            self._spike_active = True
            self._spike_remaining = random.randint(3, 8)

        if self._spike_active:
            spike = 30 + 20 * math.sin(self._spike_remaining * 0.5)
            self._spike_remaining -= 1
            if self._spike_remaining <= 0:
                self._spike_active = False
            return min(100, self._baseline + spike + random.gauss(0, 2))

        noise = random.gauss(0, 1.5)
        return max(0, min(100, self._baseline + noise))


# ─── Factory ─────────────────────────────────────────────────────────

def create_sensor() -> SensorBackend:
    driver = config.SENSOR_DRIVER.upper()
    if driver == "ADS1115":
        print(f"[sensor] Using ADS1115 on channel {config.ADC_CHANNEL}")
        return ADS1115Backend(config.ADC_CHANNEL)
    if driver == "MCP3008":
        print(f"[sensor] Using MCP3008 on channel {config.ADC_CHANNEL}")
        return MCP3008Backend(config.ADC_CHANNEL)
    print("[sensor] Using MOCK sensor (synthetic data)")
    return MockBackend()
