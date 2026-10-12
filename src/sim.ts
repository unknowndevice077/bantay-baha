/**
 * Simulation clock, Auto-Storm timeline and the rainfall→water-level model.
 * Produces the single water level value (state.level) that the rest of the app reads.
 */
import { LEVEL, SENSOR_HEIGHT, SIM_RATE } from './config';
import { bus, state } from './state';
import { clamp, damp } from './util';

/** Auto-Storm rainfall keyframes: [sim minute, mm/hr]. A typhoon rain band passing over. */
const STORM: [number, number][] = [
  [0, 5],
  [8, 15],
  [20, 45],
  [32, 80],
  [42, 100],
  [52, 90],
  [62, 55],
  [72, 25],
  [82, 8],
  [90, 0],
];
export const STORM_DURATION = STORM[STORM.length - 1][0] * 60;

/** Linear-reservoir catchment: m/s of rise per mm/hr of rain, and recession rate (1/s). */
const RAIN_GAIN = 4e-5;
const DRAIN = 1 / 900;

export function stormRainfall(t: number): number {
  const m = t / 60;
  for (let i = 1; i < STORM.length; i++) {
    const [m1, r1] = STORM[i];
    const [m0, r0] = STORM[i - 1];
    if (m <= m1) return r0 + ((r1 - r0) * (m - m0)) / (m1 - m0);
  }
  return 0;
}

/** Advances the simulation; returns the simulated seconds that elapsed. */
export function updateSim(dtReal: number): number {
  const dtSim = dtReal * SIM_RATE * state.speed;
  state.simTime += dtSim;

  if (state.stormPlaying) {
    state.stormTime = Math.min(STORM_DURATION, state.stormTime + dtSim);
    state.rainfall = stormRainfall(state.stormTime);
    if (state.stormTime >= STORM_DURATION) state.stormPlaying = false;
  }

  if (state.source === 'rain') {
    const rise = state.rainfall * RAIN_GAIN - (state.targetLevel - LEVEL.base) * DRAIN;
    state.targetLevel = clamp(state.targetLevel + rise * dtSim, LEVEL.min, LEVEL.max);
  }
  state.level = damp(state.level, state.targetLevel, 4, dtReal);
  return dtSim;
}

/** A live ESP32 reported a distance; the water level follows it. */
export function applyRemoteDistance(distanceCm: number): void {
  state.source = 'remote';
  state.stormPlaying = false;
  state.targetLevel = clamp(SENSOR_HEIGHT - distanceCm / 100, LEVEL.min, LEVEL.max);
}

export function resetSim(): void {
  Object.assign(state, {
    level: LEVEL.base,
    targetLevel: LEVEL.base,
    rainfall: 0,
    source: 'rain',
    stormPlaying: false,
    stormTime: 0,
  });
  bus.emit('reset', undefined);
}
