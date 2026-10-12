/**
 * What the ESP32 + dashboard compute: samples the ultrasonic distance, converts it
 * to a level, keeps a 10-minute history, derives the rise rate and the alert status.
 */
import { RATE_ESCALATE_CM, SENSOR_HEIGHT, THRESHOLDS } from '../config';
import { type Reading, STATUSES, type Status, bus, state } from '../state';

const SAMPLE_S = 5;
const WINDOW_S = 600;
/** Level must drop this far below a threshold before the status steps down. */
const HYSTERESIS = 0.08;

export class Monitor {
  readonly history: Reading[] = [];
  private acc = SAMPLE_S;

  constructor() {
    bus.on('reset', () => {
      this.history.length = 0;
      this.acc = SAMPLE_S;
    });
  }

  update(dtSim: number): void {
    this.acc += dtSim;
    while (this.acc >= SAMPLE_S) {
      this.acc -= SAMPLE_S;
      this.sample(state.simTime - this.acc);
    }
  }

  private sample(t: number): void {
    // Ultrasonic sensors jitter by a few millimetres.
    const distance = SENSOR_HEIGHT - state.level + (Math.random() - 0.5) * 0.006;
    const level = SENSOR_HEIGHT - distance;
    const rate = this.rateCm(t, level);
    const status = this.classify(level, rate);
    const reading: Reading = { t, distance, level, rate, status };
    this.history.push(reading);
    while (this.history.length && this.history[0].t < t - WINDOW_S - 30) this.history.shift();
    state.reading = reading;
    if (status !== state.status) {
      const from = state.status;
      state.status = status;
      bus.emit('status', { from, to: status });
    }
    bus.emit('reading', reading);
  }

  /** Rise over the last 10 min (scaled up when less history exists, after the first minute). */
  private rateCm(t: number, level: number): number {
    const old = this.history.find((h) => h.t >= t - WINDOW_S);
    if (!old || t - old.t < 60) return 0;
    return ((level - old.level) * 100 * WINDOW_S) / (t - old.t);
  }

  private classify(level: number, rate: number): Status {
    const current = STATUSES.indexOf(state.status);
    const limits = [THRESHOLDS.advisory, THRESHOLDS.warning, THRESHOLDS.evacuate];
    let idx = 0;
    limits.forEach((lim, i) => {
      if (level >= lim - (current > i ? HYSTERESIS : 0)) idx = i + 1;
    });
    // A fast rise escalates one step early (flash-flood behaviour), with some hysteresis on the rate too.
    const fast = rate >= RATE_ESCALATE_CM || (current > idx && rate >= RATE_ESCALATE_CM * 0.6);
    if (fast && level >= THRESHOLDS.advisory - 0.5) idx = Math.min(3, idx + 1);
    return STATUSES[idx];
  }
}
