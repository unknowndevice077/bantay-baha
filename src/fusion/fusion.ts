/**
 * Fuses the ultrasonic level with the gauge camera's and watches both for faults.
 *
 * Normally the two are combined by inverse variance (the ultrasonic is far less
 * noisy, so it dominates). If they disagree by more than DISAGREE_M for
 * DISAGREE_S simulated seconds, or one of them shows a recognisable failure
 * (frozen, erratic, no picture), a SENSOR FAULT is raised and the level comes
 * from the healthier source alone until they agree again. When the creek is
 * too low for the camera to read, it only knows "no higher than X", which
 * counts as agreement as long as the ultrasonic says so too.
 *
 * Disagreement with no recognisable cause is settled conservatively: the
 * higher reading is used, so a faulty sensor can make a warning early but
 * never make one late.
 */
import type { CameraReading } from './cameraGauge';

export type Source = 'fused' | 'ultrasonic' | 'camera';

export interface FusionResult {
  level: number;
  source: Source;
  /** Plain description of the fault, or null when all is well. */
  fault: string | null;
  ultrasonic: number;
  camera: number | null;
}

/** Disagreement that counts as a fault, and for how long (m, simulated s). */
const DISAGREE_M = 0.3;
const DISAGREE_S = 30;
/** Identical ultrasonic readings in a row that mean the sensor is stuck. */
const FROZEN_N = 8;
/** Window for spotting frozen or erratic sensors (simulated s). */
const WINDOW_S = 60;
/** Noise variance of each sensor (m²): ultrasonic ±3 mm; camera ±6 cm (measured, waves included). */
const VAR_US = 0.003 ** 2;
const VAR_CAM = 0.06 ** 2;

interface Sample {
  t: number;
  u: number;
}

export class Fusion {
  private readonly window: Sample[] = [];
  private disagreeSince: number | null = null;

  update(t: number, u: number, cam: Pick<CameraReading, 'level' | 'low'>): FusionResult {
    const c = cam.level;
    this.window.push({ t, u });
    while (this.window.length && this.window[0].t < t - WINDOW_S) this.window.shift();
    const us = this.window.map((s) => s.u);

    // Recognisable ultrasonic failures. A working sensor always jitters by a few millimetres,
    // so the same value FROZEN_N times running means it is stuck.
    const last = us.slice(-FROZEN_N);
    const frozen = last.length === FROZEN_N && Math.max(...last) - Math.min(...last) < 1e-4;
    const jumps = us.slice(1).filter((v, i) => Math.abs(v - us[i]) > 0.25).length;
    const erratic = jumps >= 2;
    /** The camera can stand in for the ultrasonic (it sees the waterline, not just "too low to read"). */
    const camOk = c !== null && !cam.low;

    // Persistent disagreement (the drift case, or anything not recognised above).
    const apart = c === null ? 0 : cam.low ? Math.max(0, u - c) : Math.abs(u - c);
    if (apart > DISAGREE_M) this.disagreeSince ??= t;
    else this.disagreeSince = null;
    const disagree = this.disagreeSince !== null && t - this.disagreeSince >= DISAGREE_S;

    if (frozen) return camOk ? this.result(c, 'camera', 'Ultrasonic reading frozen', u, c) : this.result(u, 'ultrasonic', 'Ultrasonic reading frozen and camera cannot help', u, c);
    if (erratic && camOk) return this.result(c, 'camera', 'Ultrasonic giving erratic echoes', u, c);
    if (disagree) {
      // No recognisable cause: fail safe and use the higher reading.
      const useCam = c! > u;
      return this.result(useCam ? c! : u, useCam ? 'camera' : 'ultrasonic', `Sensors disagree by ${Math.round(apart * 100)} cm`, u, c);
    }
    // Creek too low for the camera, and the ultrasonic agrees: nothing to fuse with.
    if (cam.low) return this.result(u, 'ultrasonic', erratic ? 'Ultrasonic giving erratic echoes' : null, u, c);
    if (!camOk) return this.result(u, 'ultrasonic', erratic ? 'Ultrasonic erratic and camera unavailable' : 'Gauge camera unavailable', u, c);
    const level = (u / VAR_US + c / VAR_CAM) / (1 / VAR_US + 1 / VAR_CAM);
    return this.result(level, 'fused', null, u, c);
  }

  reset(): void {
    this.window.length = 0;
    this.disagreeSince = null;
  }

  private result(level: number, source: Source, fault: string | null, ultrasonic: number, camera: number | null): FusionResult {
    return { level, source, fault, ultrasonic, camera };
  }
}
