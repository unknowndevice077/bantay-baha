/**
 * Replay a night: the creek's level and the rain, recorded from the simulator
 * (or built from a real node's log) as JSON, and played back at 1-10x.
 */
import { LEVEL } from '../config';
import { DRAIN, RAIN_GAIN, STORM_DURATION, stormRainfall } from '../sim';
import { clamp } from '../util';

export interface ReplayPoint {
  /** Seconds since the start of the recording. */
  t: number;
  /** m above the gauge datum */
  level: number;
  /** mm/hr */
  rain: number;
}

export interface Recording {
  version: 1;
  title: string;
  recordedAt: string;
  points: ReplayPoint[];
}

/** One point every 30 simulated seconds is plenty for a 90-minute storm and keeps files small. */
export const POINT_EVERY_S = 30;

/** Reads a recording from JSON text. Throws an Error that says what's wrong. */
export function parseRecording(text: string): Recording {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file');
  }
  const rec = raw as Partial<Recording> | null;
  if (!rec || rec.version !== 1 || !Array.isArray(rec.points)) throw new Error('Not a Bantay Baha recording (version 1)');
  if (rec.points.length < 2) throw new Error('Recording needs at least two points');
  let last = -Infinity;
  for (const p of rec.points) {
    if (!p || ![p.t, p.level, p.rain].every(Number.isFinite)) throw new Error('Recording has a point with missing numbers');
    if (p.t < last) throw new Error('Recording points are out of order');
    last = p.t;
  }
  return {
    version: 1,
    title: typeof rec.title === 'string' ? rec.title : 'Recording',
    recordedAt: typeof rec.recordedAt === 'string' ? rec.recordedAt : '',
    points: rec.points.map((p) => ({ t: p.t, level: clamp(p.level, LEVEL.min, LEVEL.max), rain: Math.max(0, p.rain) })),
  };
}

export const durationOf = (rec: Recording): number => rec.points[rec.points.length - 1].t;

/** Level and rain at time t, interpolated between the surrounding points (held at the ends). */
export function sampleAt(points: ReplayPoint[], t: number): { level: number; rain: number } {
  if (t <= points[0].t) return { level: points[0].level, rain: points[0].rain };
  const end = points[points.length - 1];
  if (t >= end.t) return { level: end.level, rain: end.rain };
  let i = 1;
  while (points[i].t < t) i++;
  const a = points[i - 1];
  const b = points[i];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { level: a.level + (b.level - a.level) * f, rain: a.rain + (b.rain - a.rain) * f };
}

/** The Auto-Storm typhoon run through the catchment model, as a recording to play without recording one first. */
export function sampleRecording(): Recording {
  const points: ReplayPoint[] = [];
  let level: number = LEVEL.base;
  for (let t = 0; t <= STORM_DURATION; t += POINT_EVERY_S) {
    const rain = stormRainfall(t);
    points.push({ t, level: +level.toFixed(3), rain: +rain.toFixed(1) });
    level = clamp(level + (rain * RAIN_GAIN - (level - LEVEL.base) * DRAIN) * POINT_EVERY_S, LEVEL.min, LEVEL.max);
  }
  return { version: 1, title: 'Sample typhoon rain band', recordedAt: '', points };
}

/** Collects readings as they come in. */
export class Recorder {
  private points: ReplayPoint[] = [];
  private t0 = 0;
  active = false;

  start(): void {
    this.points = [];
    this.active = true;
  }

  /** @param t simulated seconds (any origin, the first reading becomes time zero) */
  add(t: number, level: number, rain: number): void {
    if (!this.active) return;
    if (!this.points.length) this.t0 = t;
    const rel = t - this.t0;
    const last = this.points[this.points.length - 1];
    if (last && rel - last.t < POINT_EVERY_S) return;
    this.points.push({ t: Math.round(rel), level: +level.toFixed(3), rain: +rain.toFixed(1) });
  }

  get length(): number {
    return this.points.length;
  }

  /** Stops recording. Null if there is too little to play back. */
  stop(title: string): Recording | null {
    this.active = false;
    if (this.points.length < 2) return null;
    return { version: 1, title, recordedAt: new Date().toISOString(), points: this.points };
  }
}
