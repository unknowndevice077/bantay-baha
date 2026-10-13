/**
 * "Simulate sensor failure" for demos: breaks the ultrasonic sensor (or the
 * gauge camera) in one of the ways they really fail in the field.
 */
export type FaultMode = 'stuck' | 'spikes' | 'drift' | 'camera';

export const FAULT_NAMES: Record<FaultMode, string> = {
  stuck: 'Ultrasonic stuck (frozen reading)',
  spikes: 'Ultrasonic erratic echoes (rain, insects)',
  drift: 'Ultrasonic drifting (mount sagging)',
  camera: 'Camera lens blocked',
};

export class FaultInjector {
  mode: FaultMode | null = null;
  private frozen = 0;
  private since = 0;

  start(mode: FaultMode, t: number, distance: number): void {
    this.mode = mode;
    this.frozen = distance;
    this.since = t;
  }

  stop(): void {
    this.mode = null;
  }

  /** What the ultrasonic reports given the true distance (m) at simulated time t (s). */
  ultrasonic(distance: number, t: number): number {
    switch (this.mode) {
      case 'stuck':
        return this.frozen;
      case 'spikes':
        // Every few readings an echo comes back early, off a raindrop or a moth.
        return Math.random() < 0.3 ? distance - (0.4 + Math.random() * 1.6) : distance;
      case 'drift':
        // Bracket sagging: reads 5 cm further every simulated minute (fast enough to see in a demo).
        return distance + ((t - this.since) / 60) * 0.05;
      default:
        return distance;
    }
  }
}
