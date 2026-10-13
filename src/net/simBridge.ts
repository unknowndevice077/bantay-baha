/**
 * Simulator side of the dashboard link: publishes every reading, device
 * telemetry, evacuation counts and status changes; obeys siren and broadcast
 * commands from the barangay captain's dashboard.
 */
import type { Esp32Node } from '../sensor/esp32';
import { type Reading, bus, state } from '../state';
import { CHANNEL, type DashboardMessage, type ForecastSummary, type Point, type SimMessage } from './protocol';

/** One day of 5-second samples. */
const MAX_POINTS = 17280;

export interface BridgeHooks {
  evacStats(): { inside: number; total: number };
  /** An advisory went out: over the PA (and screens), or as an SMS blast. */
  broadcast(text: string, via: 'pa' | 'sms'): void;
  /** Optional: the current forecast, passed through to the dashboard. */
  forecast?(): ForecastSummary | null;
}

export class SimBridge {
  private readonly channel: BroadcastChannel;
  private readonly points: Point[] = [];

  /**
   * @param channel BroadcastChannel name (the story game uses its own so it never mixes with an open simulator)
   * @param epoch wall-clock ms at simulation time 0; points are stamped epoch + simulated seconds
   */
  constructor(
    private readonly node: Esp32Node,
    private readonly hooks: BridgeHooks,
    channel = CHANNEL,
    private readonly epoch = Date.now(),
  ) {
    this.channel = new BroadcastChannel(channel);
    bus.on('reading', (r) => {
      this.points.push(this.point(r));
      if (this.points.length > MAX_POINTS) this.points.shift();
    });
    this.channel.onmessage = (e: MessageEvent<DashboardMessage>) => {
      const m = e.data;
      if (m.type === 'hello') this.post({ type: 'history', points: this.points });
      else if (m.type === 'siren') state.sirenManual = m.on;
      else if (m.type === 'broadcast') hooks.broadcast(m.text, m.via ?? 'pa');
    };
  }

  /** Readings from before the bridge existed (the story's afternoon), so the dashboard chart starts full. */
  seed(readings: Reading[]): void {
    this.points.unshift(...readings.map((r) => this.point(r)));
  }

  private clock(simT: number): number {
    return this.epoch + simT * 1000;
  }

  private point(r: Reading): Point {
    return { at: this.clock(r.t), level: r.level, distance: r.distance, rate: r.rate, status: r.status };
  }

  private post(m: SimMessage): void {
    this.channel.postMessage(m);
  }

  /** Called once per published MQTT packet (about every second). */
  publish(r: Reading): void {
    this.post({
      type: 'live',
      point: this.point(r),
      telemetry: { ...this.node.t },
      evac: this.hooks.evacStats(),
      rainfall: state.rainfall,
      source: state.source,
      siren: state.sirenManual,
      forecast: this.hooks.forecast?.() ?? undefined,
    });
  }
}
