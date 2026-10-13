"""Seeded synthetic storms for training and testing the water-level forecaster.

Each storm is a rainfall profile run through the simulator's own catchment
model (src/sim.ts): a linear reservoir, dL/dt = RAIN_GAIN * rain - (L - BASE) * DRAIN,
integrated every 10 simulated seconds and sampled once a minute. The observed
level gets the same few-millimetre jitter as the simulated ultrasonic sensor.

Profiles: the simulator's Auto-Storm typhoon band (exactly, plus time/intensity
rescaled copies), two-band storms, short flash-flood bursts and long drizzles,
each with slow random wobble in the rain rate and a random wet or dry start.

    python tools/forecast/generate_dataset.py            # 900 storms, seed 2026
    python tools/forecast/generate_dataset.py --storms 300 --seed 7
"""
import argparse
from pathlib import Path

import numpy as np

from features import BASE_LEVEL, DRAIN, RAIN_GAIN

# Mirrors src/sim.ts and src/config.ts.
STORM = [(0, 5), (8, 15), (20, 45), (32, 80), (42, 100), (52, 90), (62, 55), (72, 25), (82, 8), (90, 0)]
LEVEL = {"min": 0.3, "base": BASE_LEVEL, "max": 5.5}
SENSOR_JITTER_M = 0.003
DT_S = 10

OUT = Path(__file__).parent / "data" / "storms.npz"


def keyframe_rain(frames, minutes: np.ndarray) -> np.ndarray:
    times, rates = zip(*frames)
    return np.interp(minutes, times, rates, left=0.0, right=0.0)


def random_profile(rng: np.random.Generator, minutes: np.ndarray) -> np.ndarray:
    kind = rng.choice(["typhoon", "typhoon", "two_band", "flash", "drizzle"])
    start = rng.uniform(0, 60)
    if kind == "typhoon":
        st, sr = rng.uniform(0.6, 1.8), rng.uniform(0.4, 1.4)
        rain = keyframe_rain([(start + m * st, r * sr) for m, r in STORM], minutes)
    elif kind == "two_band":
        a = keyframe_rain([(start + m * rng.uniform(0.5, 1.0), r * rng.uniform(0.4, 1.0)) for m, r in STORM], minutes)
        gap = rng.uniform(40, 140)
        b = keyframe_rain([(start + gap + m * rng.uniform(0.5, 1.2), r * rng.uniform(0.4, 1.2)) for m, r in STORM], minutes)
        rain = a + b
    elif kind == "flash":
        peak, length = rng.uniform(90, 150), rng.uniform(15, 45)
        rain = keyframe_rain([(start, 0), (start + length * 0.3, peak), (start + length, 0)], minutes)
    else:
        rate, length = rng.uniform(8, 35), rng.uniform(120, 300)
        rain = keyframe_rain([(start, 0), (start + 15, rate), (start + length, rate), (start + length + 20, 0)], minutes)
    # Rain bands are gusty: slow multiplicative wobble (AR(1), ~10 min memory).
    wobble = np.zeros_like(minutes)
    for i in range(1, len(minutes)):
        wobble[i] = 0.9 * wobble[i - 1] + rng.normal(0, 0.08)
    return np.clip(rain * (1 + wobble), 0, 160)


def simulate(rain_per_min: np.ndarray, start_level: float, rng: np.random.Generator):
    true = np.empty_like(rain_per_min)
    level = start_level
    steps = 60 // DT_S
    for i, rain in enumerate(rain_per_min):
        true[i] = level
        for _ in range(steps):
            level += (rain * RAIN_GAIN - (level - LEVEL["base"]) * DRAIN) * DT_S
            level = min(max(level, LEVEL["min"]), LEVEL["max"])
    observed = true + rng.uniform(-SENSOR_JITTER_M, SENSOR_JITTER_M, size=true.shape)
    return observed, true


def generate(n: int, seed: int):
    rng = np.random.default_rng(seed)
    storms = []
    for k in range(n):
        minutes = np.arange(0, rng.uniform(240, 480), 1.0)
        # Storm 0 is the simulator's Auto-Storm exactly, from a calm creek.
        rain = keyframe_rain(STORM, minutes) if k == 0 else random_profile(rng, minutes)
        start = LEVEL["base"] if k == 0 else LEVEL["base"] + rng.uniform(0, 0.8)
        observed, true = simulate(rain, start, rng)
        storms.append((observed, true, rain))
    return storms


def save(storms, path: Path = OUT):
    path.parent.mkdir(parents=True, exist_ok=True)
    arrays = {}
    for i, (obs, true, rain) in enumerate(storms):
        arrays[f"obs_{i}"], arrays[f"true_{i}"], arrays[f"rain_{i}"] = obs, true, rain
    np.savez_compressed(path, n=len(storms), **arrays)


def load(path: Path = OUT):
    d = np.load(path)
    return [(d[f"obs_{i}"], d[f"true_{i}"], d[f"rain_{i}"]) for i in range(int(d["n"]))]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--storms", type=int, default=900)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()
    storms = generate(args.storms, args.seed)
    save(storms)
    peaks = [float(t.max()) for _, t, _ in storms]
    print(f"{len(storms)} storms, {sum(len(o) for o, _, _ in storms):,} minutes -> {OUT}")
    print(f"peak level: median {np.median(peaks):.2f} m, max {max(peaks):.2f} m; "
          f"{sum(p >= 3.3 for p in peaks)} storms reach EVACUATE (3.30 m)")
