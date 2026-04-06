"""
On-device AI for the Raspberry Pi edge gateway.

Runs entirely locally — no internet required. Provides:
  1. Anomaly detection  (rolling Z-score)
  2. Trend prediction   (linear regression slope)
  3. Stuck sensor alert (consecutive identical readings)
  4. Leak risk score    (0-100 composite)

These complement the cloud AI in ai-hub; the Pi gets instant local
insight while optionally forwarding to the cloud for deeper analysis.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field

import config


@dataclass
class AIInsight:
    """Result of one local AI analysis pass."""
    moisture: float
    timestamp: float

    is_anomaly: bool = False
    anomaly_score: float = 0.0

    trend_slope: float = 0.0
    trend_direction: str = "stable"

    is_stuck: bool = False
    stuck_count: int = 0

    risk_score: int = 0
    risk_label: str = "low"

    summary: str = ""


class LocalAI:
    """Lightweight on-device intelligence for moisture monitoring."""

    def __init__(self, window_size: int | None = None):
        self._window_size = window_size or config.AI_WINDOW_SIZE
        self._readings: deque[tuple[float, float]] = deque(maxlen=self._window_size)
        self._last_values: deque[float] = deque(maxlen=config.STUCK_SENSOR_COUNT)

    @property
    def reading_count(self) -> int:
        return len(self._readings)

    def analyze(self, moisture: float, threshold: float) -> AIInsight:
        """Run all local AI checks on a new reading."""
        now = time.time()
        self._readings.append((now, moisture))
        self._last_values.append(round(moisture, 1))

        insight = AIInsight(moisture=moisture, timestamp=now)

        self._check_anomaly(insight)
        self._check_trend(insight)
        self._check_stuck(insight)
        self._compute_risk(insight, threshold)
        self._build_summary(insight, threshold)

        return insight

    # ─── Anomaly detection (Z-score) ─────────────────────────────────

    def _check_anomaly(self, insight: AIInsight):
        if len(self._readings) < 5:
            return

        values = [v for _, v in self._readings]
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std = math.sqrt(variance) if variance > 0 else 0.001

        z = abs(insight.moisture - mean) / std
        insight.anomaly_score = round(z, 2)
        insight.is_anomaly = z > config.ANOMALY_Z_THRESHOLD

    # ─── Trend prediction (linear regression) ────────────────────────

    def _check_trend(self, insight: AIInsight):
        n = len(self._readings)
        if n < 5:
            insight.trend_direction = "insufficient_data"
            return

        recent = list(self._readings)[-min(30, n):]
        t0 = recent[0][0]
        xs = [(t - t0) for t, _ in recent]
        ys = [v for _, v in recent]

        # Guard: if the time span is too short, slope is meaningless
        time_span = xs[-1] - xs[0] if len(xs) > 1 else 0
        if time_span < 1.0:
            insight.trend_slope = 0.0
            insight.trend_direction = "stable"
            return

        n_pts = len(xs)
        sum_x = sum(xs)
        sum_y = sum(ys)
        sum_xy = sum(x * y for x, y in zip(xs, ys))
        sum_x2 = sum(x * x for x in xs)

        denom = n_pts * sum_x2 - sum_x * sum_x
        if abs(denom) < 1e-10:
            insight.trend_slope = 0.0
            insight.trend_direction = "stable"
            return

        slope = (n_pts * sum_xy - sum_x * sum_y) / denom
        slope_per_min = slope * 60

        insight.trend_slope = round(slope_per_min, 3)

        if slope_per_min > 1.0:
            insight.trend_direction = "rising_fast"
        elif slope_per_min > 0.2:
            insight.trend_direction = "rising"
        elif slope_per_min < -1.0:
            insight.trend_direction = "falling_fast"
        elif slope_per_min < -0.2:
            insight.trend_direction = "falling"
        else:
            insight.trend_direction = "stable"

    # ─── Stuck sensor detection ──────────────────────────────────────

    def _check_stuck(self, insight: AIInsight):
        if len(self._last_values) < config.STUCK_SENSOR_COUNT:
            return

        vals = list(self._last_values)
        if all(v == vals[0] for v in vals):
            insight.is_stuck = True
            insight.stuck_count = len(vals)

    # ─── Composite risk score ────────────────────────────────────────

    def _compute_risk(self, insight: AIInsight, threshold: float):
        score = 0

        proximity = insight.moisture / max(threshold, 1) * 100
        if proximity >= 100:
            score += 40
        elif proximity >= 80:
            score += 25
        elif proximity >= 60:
            score += 10

        if insight.is_anomaly:
            score += 20

        if insight.trend_direction in ("rising", "rising_fast"):
            score += 15 if insight.trend_direction == "rising_fast" else 8

        if insight.is_stuck:
            score += 15

        score = min(100, max(0, score))
        insight.risk_score = score

        if score >= 70:
            insight.risk_label = "critical"
        elif score >= 50:
            insight.risk_label = "high"
        elif score >= 25:
            insight.risk_label = "medium"
        else:
            insight.risk_label = "low"

    # ─── Summary ─────────────────────────────────────────────────────

    def _build_summary(self, insight: AIInsight, threshold: float):
        parts: list[str] = []

        pct = round(insight.moisture, 1)
        parts.append(f"Moisture {pct}% (threshold {threshold}%)")

        if insight.moisture >= threshold:
            parts.append("ABOVE THRESHOLD — leak likely")

        if insight.is_anomaly:
            parts.append(f"Anomaly detected (z={insight.anomaly_score})")

        if insight.trend_direction == "rising_fast":
            parts.append(f"Rising fast ({insight.trend_slope}%/min)")
        elif insight.trend_direction == "rising":
            parts.append(f"Rising ({insight.trend_slope}%/min)")
        elif insight.trend_direction == "falling_fast":
            parts.append(f"Falling fast ({insight.trend_slope}%/min)")

        if insight.is_stuck:
            parts.append(f"Sensor may be stuck ({insight.stuck_count} identical readings)")

        parts.append(f"Risk: {insight.risk_label.upper()} ({insight.risk_score}/100)")

        insight.summary = " | ".join(parts)

    # ─── Utilities ───────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """Current rolling window statistics for cloud AI context."""
        if not self._readings:
            return {"count": 0}

        values = [v for _, v in self._readings]
        return {
            "count": len(values),
            "mean": round(sum(values) / len(values), 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "std": round(
                math.sqrt(sum((v - sum(values) / len(values)) ** 2 for v in values) / len(values)),
                2,
            ),
            "window_seconds": round(self._readings[-1][0] - self._readings[0][0], 1)
            if len(self._readings) > 1
            else 0,
        }

    def reset(self):
        self._readings.clear()
        self._last_values.clear()
