/** Orbit controls plus eased camera presets and a cinematic fly-through. Any drag cancels automation. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type Preset = 'overview' | 'sensor' | 'street' | 'bridge';
export interface View {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const FLY_SECONDS = 32;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraRig {
  readonly controls: OrbitControls;
  private tween: { from: View; to: View; t: number } | null = null;
  private flyT = -1;
  private readonly fly: THREE.CatmullRomCurve3;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private readonly views: Record<Preset, View>,
  ) {
    this.controls = new OrbitControls(camera, dom);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.495, minDistance: 1.5, maxDistance: 260 });
    this.controls.addEventListener('start', () => {
      this.tween = null;
      this.flyT = -1;
    });
    camera.position.copy(views.overview.pos);
    this.controls.target.copy(views.overview.target);

    // Upstream → down the creek past the sensor → over the bridge → up the village lane → hall.
    this.fly = new THREE.CatmullRomCurve3(
      [
        [-95, 30, -40],
        [-60, 12, -8],
        [-25, 4.5, -3],
        [0, 5, -1],
        [14, 4, -4],
        [30, 6, 8],
        [16, 4.5, 26],
        [0, 3.5, 30],
        [-2, 4, 42],
        [0, 9, 50],
        [-30, 22, 75],
        [-60, 40, 20],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.35,
    );
  }

  goTo(name: Preset | 'cinematic'): void {
    if (name === 'cinematic') {
      this.flyT = 0;
      this.tween = null;
      return;
    }
    this.flyT = -1;
    this.tween = { from: { pos: this.camera.position.clone(), target: this.controls.target.clone() }, to: this.views[name], t: 0 };
  }

  update(dt: number): void {
    if (this.flyT >= 0) {
      this.flyT += dt / FLY_SECONDS;
      if (this.flyT >= 1) {
        this.goTo('overview');
      } else {
        this.camera.position.copy(this.fly.getPointAt(this.flyT));
        this.controls.target.copy(this.fly.getPointAt(Math.min(1, this.flyT + 0.03))).add(new THREE.Vector3(0, -2.5, 0));
      }
    } else if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 1.8);
      const e = ease(tw.t);
      this.camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      this.controls.target.lerpVectors(tw.from.target, tw.to.target, e);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
  }
}
