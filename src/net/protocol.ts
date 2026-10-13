/**
 * Messages between the 3D simulator and the operations dashboard when both
 * run in the same browser (BroadcastChannel). A real deployment carries the
 * same data over MQTT; the dashboard can connect to that directly instead.
 */
import type { Telemetry } from '../sensor/esp32';
import type { Source, Status } from '../state';

export const CHANNEL = 'bantay-baha';

export interface Point {
  /** Epoch ms (simulated clock for the simulator feed). */
  at: number;
  /** m above gauge datum */
  level: number;
  /** m, sensor to water */
  distance: number;
  /** cm per 10 min */
  rate: number;
  status: Status;
}

/** The water-level forecast, when the sender runs one (src/forecast). */
export interface ForecastSummary {
  /** Plain ETA, e.g. "WARNING level (280 cm) in ~25 min". */
  text: string;
  /** Predicted level (m) at +30 and +60 minutes. */
  at30: number;
  at60: number;
}

export type SimMessage =
  | {
      type: 'live';
      point: Point;
      telemetry: Telemetry;
      evac: { inside: number; total: number };
      rainfall: number;
      source: Source;
      siren: boolean;
      forecast?: ForecastSummary;
    }
  | { type: 'history'; points: Point[] };

export type DashboardMessage = { type: 'hello' } | { type: 'siren'; on: boolean } | { type: 'broadcast'; text: string; via?: 'pa' | 'sms' };
