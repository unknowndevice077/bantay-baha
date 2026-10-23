/**
 * Wires sensor fusion into the simulator: the gauge camera on the bank, the
 * fused level fed to the monitor (so status and alerts follow it), the
 * "Simulate sensor failure" control, the SENSOR FAULT banner and the camera
 * picture in the Bantay Baha+ panel.
 */
import { SENSOR_HEIGHT } from '../config';
import { onPlus, plus } from '../plus/flags';
import type { Monitor } from '../sensor/monitor';
import { state } from '../state';
import type { World } from '../world';
import { CameraGauge } from './cameraGauge';
import { FAULT_NAMES, FaultInjector, type FaultMode } from './faults';
import { Fusion, type FusionResult } from './fusion';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class FusionView {
  private readonly camera: CameraGauge;
  private readonly faults = new FaultInjector();
  private readonly fusion = new Fusion();
  private result: FusionResult | null = null;
  private renderIn = 0;

  constructor(
    world: World,
    private readonly monitor: Monitor,
  ) {
    this.camera = new CameraGauge(world.renderer, world.scene, world.gauge.group, world.water.mesh);
    world.scene.add(this.camera.prop);

    const mode = $<HTMLSelectElement>('fu-mode');
    mode.replaceChildren(...(Object.keys(FAULT_NAMES) as FaultMode[]).map((m) => new Option(FAULT_NAMES[m], m)));
    $('fu-break').addEventListener('click', () => {
      if (this.faults.mode) this.faults.stop();
      else this.faults.start(mode.value as FaultMode, state.simTime, SENSOR_HEIGHT - state.level);
      this.camera.blocked = this.faults.mode === 'camera';
      this.render();
    });
    onPlus((flag, on) => {
      if (flag !== 'fusion') return;
      if (!on) {
        this.fusion.reset();
        this.result = null;
      }
      this.render();
    });
    this.render();
  }

  /** The monitor's measurement: the (possibly broken) ultrasonic, fused with the camera when fusion is on. */
  private measure(t: number): { distance: number; level: number } {
    const distance = this.faults.ultrasonic(SENSOR_HEIGHT - state.level + (Math.random() - 0.5) * 0.006, t);
    const ultrasonic = SENSOR_HEIGHT - distance;
    if (!plus.fusion) return { distance, level: ultrasonic };
    // One camera frame per sensor reading, so both run on the same (simulated) clock at any speed.
    this.result = this.fusion.update(t, ultrasonic, this.camera.capture());
    return { distance, level: this.result.level };
  }

  update(dt: number): void {
    // Only step in when needed: with fusion off and nothing broken, the monitor reads the sensor itself.
    this.monitor.measure = plus.fusion || this.faults.mode ? (t) => this.measure(t) : null;
    if (!plus.fusion) return;
    this.renderIn -= dt;
    if (this.renderIn > 0) return;
    this.renderIn = 0.5;
    this.render();
  }

  private render(): void {
    const on = plus.fusion;
    const r = on ? this.result : null;
    const broken = this.faults.mode;
    $('fu-break').textContent = broken ? 'Repair the sensor' : 'Simulate sensor failure';
    $<HTMLSelectElement>('fu-mode').disabled = !!broken;

    const banner = $('fu-fault');
    banner.hidden = !r?.fault;
    if (r?.fault) banner.textContent = `Sensor fault · ${r.fault} · using ${r.source === 'camera' ? 'gauge camera' : 'ultrasonic'}`;

    const cam = this.camera.latest;
    const line = $('fu-line');
    line.hidden = !r;
    if (r) {
      const camText =
        cam.level === null ? 'no picture' : cam.low ? `low (< ${Math.round(cam.level * 100)} cm)` : `${Math.round(cam.level * 100)} cm`;
      line.textContent = `Ultrasonic ${Math.round(r.ultrasonic * 100)} cm · Camera ${camText} · Using ${r.source}`;
    }

    $('fu-cam-box').hidden = !on;
    if (!on) return;
    this.camera.draw($<HTMLCanvasElement>('fu-cam'));
    $('fu-cam-text').textContent = this.camera.blocked
      ? 'Lens blocked: no picture.'
      : cam.level === null
        ? 'Waterline not found in this frame.'
        : cam.low
          ? `Creek too low for the camera to read (below ${Math.round(cam.level * 100)} cm).`
          : `Waterline at ${Math.round(cam.level * 100)} cm (median of the last 3 frames).`;
  }
}
