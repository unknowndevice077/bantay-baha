"""Feature extraction shared by train.py and evaluate.py.

Must stay identical to src/forecast/features.ts: same names, same order, same
padding rule. model.json carries reference vectors that the browser checks on
load, so a mismatch disables the forecast instead of showing wrong numbers.
"""
import numpy as np

# Catchment constants from src/sim.ts / src/config.ts: base level (m) the creek
# drains back to, metres of rise per second per mm/hr of rain, recession rate (1/s).
BASE_LEVEL = 0.9
RAIN_GAIN = 4e-5
DRAIN = 1 / 900
HORIZONS_MIN = (30, 60)
FEATURES = [
    "level_m",         # level now
    "excess_m",        # level above the base the catchment drains toward
    "d5_m",            # change over the last 5 / 10 / 20 / 30 minutes
    "d10_m",
    "d20_m",
    "d30_m",
    "rain_mmhr",       # rainfall now
    "rain10_mmhr",     # mean rainfall over the last 10 / 30 minutes
    "rain30_mmhr",
    "rain_trend_mmhr", # rainfall now minus 10 minutes ago
]


def features_at(level: np.ndarray, rain: np.ndarray, i: int) -> list[float]:
    """Features at minute i of a 1-sample-per-minute series. Before the series
    starts, the earliest sample stands in (the same padding the browser uses)."""

    def lv(k: int) -> float:
        return float(level[max(0, i - k)])

    def rain_mean(k: int) -> float:
        lo = max(0, i - k + 1)
        return float(np.mean(rain[lo : i + 1]))

    l0 = float(level[i])
    return [
        l0,
        l0 - BASE_LEVEL,
        l0 - lv(5),
        l0 - lv(10),
        l0 - lv(20),
        l0 - lv(30),
        float(rain[i]),
        rain_mean(10),
        rain_mean(30),
        float(rain[i]) - float(rain[max(0, i - 10)]),
    ]


def build(storms, warmup_min: int = 10):
    """Feature matrix, targets and storm ids.

    `storms` holds (observed level, true level, rainfall) per storm. Features use
    the observed (sensor-jittered) level, as the browser does; targets are the
    true level change at each horizon (m). Samples start after `warmup_min`
    minutes of data and stop when the longest horizon would run past the end."""
    xs, ys, ids = [], [], []
    for sid, (observed, true, rain) in enumerate(storms):
        last = len(observed) - max(HORIZONS_MIN)
        for i in range(warmup_min, last):
            xs.append(features_at(observed, rain, i))
            ys.append([true[i + h] - observed[i] for h in HORIZONS_MIN])
            ids.append(sid)
    return np.asarray(xs), np.asarray(ys), np.asarray(ids)
