/**
 * What the ESP32 + dashboard compute: samples the ultrasonic distance, converts it
 * to a level, keeps a 10-minute history, derives the rise rate and the alert status.
 */
import { SENSOR_HEIGHT } from '../config';
import { type Reading, bus, state } from '../state';
import { classifyStatus, riseRate } from './status';

const SAMPLE_S = 5;
const WINDOW_S = 600;

export class Monitor {
  readonly history: Reading[] = [];
  /**
   * Bantay Baha+ hook: when set, supplies the measured distance and the level to use
   * (sensor fusion, injected faults) instead of the plain ultrasonic reading.
   */
  measure: ((t: number) => { distance: number; level: number }) | null = null;
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
    const measured = this.measure?.(t);
    // Ultrasonic sensors jitter by a few millimetres.
    const distance = measured?.distance ?? SENSOR_HEIGHT - state.level + (Math.random() - 0.5) * 0.006;
    const level = measured?.level ?? SENSOR_HEIGHT - distance;
    const rate = riseRate(this.history, t, level);
    const status = classifyStatus(level, rate, state.status);
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
}
