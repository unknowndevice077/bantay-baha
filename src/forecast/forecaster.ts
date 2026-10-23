/**
 * Runs the exported model on the live sensor feed: keeps its own 30 minutes of
 * (time, level, rainfall), predicts the level 30 and 60 minutes ahead every
 * half simulated minute, and turns that into a predicted status and a plain
 * ETA to the next alert level ("WARNING in ~25 min").
 *
 * Optionally it is given a rainfall outlook (e.g. PAGASA's bulletin for the next
 * hours). The trained model only knows rain that has already fallen, so with an
 * outlook the level is instead projected with the catchment model under the
 * expected rain: that is what lets it see a flood coming while the creek is
 * still rising slowly.
 */
import { LEVEL, THRESHOLDS } from '../config';
import { DRAIN, RAIN_GAIN } from '../sim';
import { STATUSES, type Status, bus, state } from '../state';
import { type Model, type Sample, featuresOf, loadModel } from './model';

/** History the features look back over, plus a margin (s, simulated). */
const KEEP_S = 31 * 60;
/** Needs this much history before it says anything (s). */
const WARMUP_S = 10 * 60;
const EVERY_S = 30;

const LIMITS: [Status, number][] = [
  ['ADVISORY', THRESHOLDS.advisory],
  ['WARNING', THRESHOLDS.warning],
  ['EVACUATE', THRESHOLDS.evacuate],
];

export function statusOf(level: number): Status {
  let s: Status = 'NORMAL';
  for (const [name, t] of LIMITS) if (level >= t) s = name;
  return s;
}

export interface ForecastPoint {
  /** Simulated time (s). */
  t: number;
  level: number;
  /** Typical error at this horizon (m). */
  err: number;
}

export interface Forecast {
  /** Now, +30 min, +60 min. */
  path: ForecastPoint[];
  status: Status[];
  /**
   * Next alert-level line the water crosses along the forecast path within the hour: the
   * line above it (rising) or the one it is above (falling). Named by level, not by the
   * official status, which the fast-rise rule can already have raised.
   */
  eta: { status: Status; cm: number; minutes: number; rising: boolean } | null;
  text: string;
}

export class Forecaster {
  latest: Forecast | null = null;
  /** Expected rainfall (mm/hr) a given number of minutes from now, when a weather outlook is available. */
  outlook: ((minutesAhead: number) => number) | null = null;
  /** Why there is no forecast (loading, warming up, model unusable). */
  note = 'Loading the forecast model';
  private model: Model | null = null;
  private readonly history: Sample[] = [];
  private nextAt = 0;

  constructor() {
    loadModel()
      .then((m) => {
        this.model = m;
        this.note = 'Warming up: needs 10 minutes of readings';
      })
      .catch((e: Error) => {
        this.note = `Forecast unavailable: ${e.message}`;
        console.warn('[forecast]', e);
      });
    bus.on('reading', (r) => this.onReading(r.t, r.level));
    bus.on('reset', () => {
      this.history.length = 0;
      this.latest = null;
      this.nextAt = 0;
    });
  }

  /** Start with history already in hand (the story's afternoon), so the first forecast needn't wait. */
  prime(samples: Sample[]): void {
    // Replace, not append: anything recorded before (e.g. behind a title screen) would sit out of order.
    this.history.splice(0, this.history.length, ...samples);
    this.nextAt = 0;
  }

  /** The forecaster's own history (longer than the HUD's), for drawing. */
  get samples(): readonly Sample[] {
    return this.history;
  }

  private onReading(t: number, level: number): void {
    this.history.push({ t, level, rain: state.rainfall });
    while (this.history.length && this.history[0].t < t - KEEP_S) this.history.shift();
    if (!this.model || t < this.nextAt) return;
    this.nextAt = t + EVERY_S;
    if (t - this.history[0].t < WARMUP_S) {
      this.latest = null;
      return;
    }
    this.latest = this.run(this.model, t, level);
  }

  private run(model: Model, t: number, level: number): Forecast {
    const deltas = this.outlook ? this.project(level, model.horizonsMin, this.outlook) : model.predict(featuresOf(this.history));
    const path: ForecastPoint[] = [
      { t, level, err: 0 },
      ...model.horizonsMin.map((m, k) => ({ t: t + m * 60, level: Math.max(0, level + deltas[k]), err: model.maeM[k] })),
    ];
    const eta = this.eta(path, level);
    // Status from the level as displayed (whole cm), so "330 cm" never reads WARNING.
    return { path, status: path.slice(1).map((p) => statusOf(Math.round(p.level * 100) / 100)), eta, text: this.describe(eta, path) };
  }

  /** Level change at each horizon if the outlook's rain falls: the catchment model run forward a minute at a time. */
  private project(level: number, horizons: number[], outlook: (minutesAhead: number) => number): number[] {
    let l = level;
    const out: number[] = [];
    for (let m = 1; m <= Math.max(...horizons); m++) {
      l = Math.min(LEVEL.max, Math.max(LEVEL.min, l + (outlook(m) * RAIN_GAIN - (l - LEVEL.base) * DRAIN) * 60));
      if (horizons.includes(m)) out.push(l - level);
    }
    return out;
  }

  /** First crossing of the next line up (or the current one down) along the piecewise-linear path. */
  private eta(path: ForecastPoint[], level: number): Forecast['eta'] {
    const idx = STATUSES.indexOf(statusOf(level));
    const up = LIMITS.find(([, lim]) => lim > level);
    const down = idx > 0 ? LIMITS[idx - 1] : null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      for (const [target, rising] of [
        [up, true],
        [down, false],
      ] as const) {
        if (!target) continue;
        const lim = target[1];
        const crosses = rising ? a.level < lim && b.level >= lim : a.level >= lim && b.level < lim;
        if (!crosses) continue;
        const f = (lim - a.level) / (b.level - a.level);
        const minutes = (a.t + f * (b.t - a.t) - path[0].t) / 60;
        return { status: target[0], cm: Math.round(lim * 100), minutes, rising };
      }
    }
    return null;
  }

  /** Minutes until the path first rises through `lim`, or null. */
  private crossing(path: ForecastPoint[], lim: number): number | null {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (a.level < lim && b.level >= lim) return (a.t + ((lim - a.level) / (b.level - a.level)) * (b.t - a.t) - path[0].t) / 60;
    }
    return null;
  }

  private describe(eta: Forecast['eta'], path: ForecastPoint[]): string {
    const when = (minutes: number) => (minutes < 2 ? 'within minutes' : `in ~${Math.round(minutes / 5) * 5 || Math.round(minutes)} min`);
    if (eta) {
      if (!eta.rising) return `Back below ${eta.status} level (${eta.cm} cm) ${when(eta.minutes)}`;
      const first = `${eta.status} level (${eta.cm} cm) ${when(eta.minutes)}`;
      // A higher line also crossed within the hour is the news that matters: name the highest one too.
      const higher = [...LIMITS]
        .reverse()
        .find(([s, lim]) => STATUSES.indexOf(s) > STATUSES.indexOf(eta.status) && this.crossing(path, lim) !== null);
      return higher ? `${first}, then ${higher[0]} (${Math.round(higher[1] * 100)} cm) ${when(this.crossing(path, higher[1])!)}` : first;
    }
    const end = path[path.length - 1].level - path[0].level;
    const trend = end > 0.05 ? 'rising' : end < -0.05 ? 'falling' : 'steady';
    return `No alert level crossed in the next hour (${trend})`;
  }
}
