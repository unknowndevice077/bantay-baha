/**
 * Coastal mode: sea level at a seaside barangay = astronomical tide + storm surge + waves.
 * Heights are metres above mean sea level (MSL), time is seconds from the start of the run.
 *
 * The station doesn't trust a single reading: waves make the surface jump around, so it
 * averages the last 10 minutes (what a stilling well does mechanically). The danger is not
 * a high number on its own but the surge (the part the tide doesn't explain), and above all
 * a surge that lines up with high tide.
 */
import type { Status } from '../state';

export const HOUR = 3600;

/** Top of the seawall, floor of the houses behind it (on short stilts). */
export const COAST = { seawall: 2.0, homes: 2.7 };

/** PAGASA issues storm-surge outlooks for a typhoon roughly a day and a half before landfall. */
export const OUTLOOK_LEAD = 36 * HOUR;

export type Storm = {
  /** PAGASA Tropical Cyclone Wind Signal at landfall, 1-5. */
  signal: number;
  /** Seconds from the start of the run. */
  landfall: number;
};

/** Peak surge height for a signal (rough, for a shallow bay like those around Leyte and Samar). */
export const surgePeakFor = (signal: number): number => [0, 0.4, 0.9, 1.6, 2.6, 3.8][Math.max(1, Math.min(5, signal))];

// Three tidal constituents: principal lunar (M2), principal solar (S2), lunisolar diurnal (K1).
const TIDE = [
  { amp: 0.62, period: 12.42 * HOUR, phase: 0.3 },
  { amp: 0.24, period: 12.0 * HOUR, phase: 1.1 },
  { amp: 0.22, period: 23.93 * HOUR, phase: 2.0 },
];

export function tide(t: number): number {
  let h = 0;
  for (const c of TIDE) h += c.amp * Math.cos((2 * Math.PI * t) / c.period + c.phase);
  return h;
}

/** Surge shape: builds for hours as the typhoon approaches, drains faster after landfall. Peak = 1. */
export function surgeShape(t: number, landfall: number): number {
  const dt = t - landfall;
  const sigma = dt < 0 ? 5 * HOUR : 2.5 * HOUR;
  return Math.exp(-0.5 * (dt / sigma) ** 2);
}

export const surge = (t: number, s: Storm): number => surgePeakFor(s.signal) * surgeShape(t, s.landfall);

/** Wave height grows as the storm gets close. Deterministic so tests and replays agree. */
export function waves(t: number, s: Storm): number {
  const near = Math.exp(-Math.abs(t - s.landfall) / (8 * HOUR));
  const a = 0.06 + 0.12 * s.signal * near;
  return a * (Math.sin(t / 5.3) * 0.6 + Math.sin(t / 2.9 + 1.7) * 0.3 + Math.sin(t / 8.1 + 0.4) * 0.4);
}

export const seaLevel = (t: number, s: Storm): number => tide(t) + surge(t, s) + waves(t, s);

/** What the sensor reports: a 10-minute running average, sampled every 30 s. */
export function filtered(t: number, s: Storm): number {
  let sum = 0;
  const n = 20;
  for (let i = 0; i < n; i++) sum += seaLevel(t - i * 30, s);
  return sum / n;
}

/** Next high tide after t (searched in 6-minute steps). */
export function nextHighTide(t: number): { at: number; height: number } {
  let best = { at: t, height: -Infinity };
  let prev = tide(t);
  let rising = tide(t + 360) > prev;
  for (let k = 1; k <= 26 * 10; k++) {
    const at = t + k * 360;
    const h = tide(at);
    if (rising && h < prev) return { at: at - 360, height: prev };
    if (h > best.height) best = { at, height: h };
    rising = h > prev;
    prev = h;
  }
  return best;
}

export type Forecast = {
  /** Has PAGASA put out a surge outlook yet? */
  outlook: boolean;
  /** Surge the station currently sees (filtered level minus predicted tide). */
  surgeNow: number;
  /** Forecast total water level, one point per 15 minutes for the next 24 h. */
  points: { t: number; level: number }[];
  peak: { t: number; level: number };
};

/**
 * What the barangay can know at `now`: the tide exactly, the surge from PAGASA's outlook
 * (a bit pessimistic early on, which is the safe direction), corrected by what the
 * station is actually measuring once the surge has started showing up.
 */
export function forecast(now: number, s: Storm): Forecast {
  const lead = s.landfall - now;
  const outlook = lead <= OUTLOOK_LEAD;
  const surgeNow = filtered(now, s) - tide(now);
  const shapeNow = surgeShape(now, s.landfall);

  let peak = 0;
  if (outlook) {
    const early = Math.max(0, Math.min(1, lead / OUTLOOK_LEAD));
    peak = surgePeakFor(s.signal) * (1 + 0.25 * early);
    // once the surge is clearly there, scale the outlook to match what the sensor sees
    if (shapeNow > 0.25 && surgeNow > 0.15) peak = Math.max(peak * 0.5, surgeNow / shapeNow);
  }

  const points: Forecast['points'] = [];
  let best = { t: now, level: -Infinity };
  for (let k = 0; k <= 96; k++) {
    const t = now + k * 900;
    const level = tide(t) + (outlook ? peak * surgeShape(t, s.landfall) : 0);
    points.push({ t, level });
    if (level > best.level) best = { t, level };
  }
  return { outlook, surgeNow, points, peak: best };
}

/**
 * Coastal alert levels. Unlike the creek, the call has to be made hours ahead:
 * people need daylight and time to walk up to higher ground.
 */
export function coastStatus(now: number, f: Forecast, measured: number): Status {
  const hoursTo = (f.peak.t - now) / HOUR;
  if (measured >= COAST.seawall || (f.peak.level >= COAST.homes && hoursTo <= 6)) return 'EVACUATE';
  if (f.peak.level >= COAST.seawall && hoursTo <= 12) return 'WARNING';
  if (f.outlook && f.peak.level >= COAST.seawall - 0.4) return 'ADVISORY';
  // after the peak the sea stays high for a while: don't send people home yet
  if (f.surgeNow > 0.4) return 'ADVISORY';
  return 'NORMAL';
}
