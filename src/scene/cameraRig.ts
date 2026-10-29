/**
 * First-person free camera: left-drag turns your view (yaw/pitch) from where
 * you stand, WASD/QE move, the wheel moves forward/back, right-drag pans.
 * Presets ease the camera to a viewpoint and the cinematic preset flies a path;
 * any manual input cancels the automation.
 *
 * Keys: W/S forward/back, A/D strafe, Q or C down, E or Space up, Shift = fast.
 */
import * as THREE from 'three';
import { clamp } from '../util';
import { groundHeight } from './terrain';

export type Preset = 'overview' | 'sensor' | 'street' | 'bridge';
export interface View {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

const FLY_SECONDS = 32;
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'c', ' ']);
const LOOK_SPEED = 0.0035; // radians per pixel
const MAX_PITCH = 1.48;
/** Free-camera limits (m): a little beyond the 200 m map, up to 120 m altitude. */
const BOUNDS = { xz: 130, top: 120 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraRig {
  private yaw = 0;
  private pitch = 0;
  private tween: { fromPos: THREE.Vector3; fromQ: THREE.Quaternion; toPos: THREE.Vector3; toQ: THREE.Quaternion; t: number } | null = null;
  private flyT = -1;
  private readonly fly: THREE.CatmullRomCurve3;
  private readonly keys = new Set<string>();
  private fast = false;
  private drag: { button: number; x: number; y: number } | null = null;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly move = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly ground: (x: number, z: number) => number;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private readonly views: Record<Preset, View>,
    /** Another map (coastal mode) can bring its own ground and fly-through path. */
    opts: { ground?: (x: number, z: number) => number; fly?: number[][] } = {},
  ) {
    this.ground = opts.ground ?? groundHeight;
    camera.rotation.order = 'YXZ';
    camera.position.copy(views.overview.pos);
    camera.lookAt(views.overview.target);
    this.syncAngles();
    this.bindPointer(dom);
    this.bindKeys();

    // Upstream → down the creek past the sensor → over the bridge → up the village lane → hall.
    this.fly = new THREE.CatmullRomCurve3(
      (
        opts.fly ?? [
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
        ]
      ).map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.35,
    );
  }

  private bindPointer(dom: HTMLElement): void {
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      else this.drag = { button: e.button, x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return this.touchMove(e);
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (dx === 0 && dy === 0) return;
      this.stopAutomation();
      if (this.drag.button === 0) this.look(dx, dy);
      else this.pan(dx, dy);
    });
    const end = (e: PointerEvent) => {
      this.drag = null;
      this.touches.delete(e.pointerId);
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.stopAutomation();
        this.camera.getWorldDirection(this.move).multiplyScalar(-e.deltaY * 0.02 * this.speedScale());
        this.translate(this.move);
      },
      { passive: false },
    );
  }

  /** One finger looks around; two fingers pinch to move forward/back. */
  private touchMove(e: PointerEvent): void {
    const prev = this.touches.get(e.pointerId);
    if (!prev) return;
    this.stopAutomation();
    if (this.touches.size === 1) {
      this.look(e.clientX - prev.x, e.clientY - prev.y);
    } else {
      const other = [...this.touches.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        this.camera.getWorldDirection(this.move).multiplyScalar((after - before) * 0.05 * this.speedScale());
        this.translate(this.move);
      }
    }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  private bindKeys(): void {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
    window.addEventListener('keydown', (e) => {
      this.fast = e.shiftKey;
      const k = e.key.toLowerCase();
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey || !MOVE_KEYS.has(k)) return;
      if (k === ' ') {
        e.preventDefault(); // don't scroll or re-click the last focused button
        (document.activeElement as HTMLElement | null)?.blur();
      }
      this.keys.add(k);
      this.stopAutomation();
    });
    window.addEventListener('keyup', (e) => {
      this.fast = e.shiftKey;
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  private look(dx: number, dy: number): void {
    this.yaw -= dx * LOOK_SPEED;
    this.pitch = clamp(this.pitch - dy * LOOK_SPEED, -MAX_PITCH, MAX_PITCH);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private pan(dx: number, dy: number): void {
    const s = 0.02 * this.speedScale();
    this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.move
      .set(0, 1, 0)
      .applyQuaternion(this.camera.quaternion)
      .multiplyScalar(dy * s)
      .addScaledVector(this.right, -dx * s);
    this.translate(this.move);
  }

  /** Movement scales with height above ground: slow at street level, quick from the air. */
  private speedScale(): number {
    const p = this.camera.position;
    return clamp(1 + (p.y - this.ground(p.x, p.z)) / 8, 1, 8);
  }

  private translate(delta: THREE.Vector3): void {
    const p = this.camera.position.add(delta);
    // Stay over the map and below the clouds; never tunnel into the ground.
    p.x = clamp(p.x, -BOUNDS.xz, BOUNDS.xz);
    p.z = clamp(p.z, -BOUNDS.xz, BOUNDS.xz);
    p.y = clamp(p.y, this.ground(p.x, p.z) + 0.6, BOUNDS.top);
  }

  /** Adopt wherever the camera currently is pointing. */
  private syncAngles(): void {
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this.euler.y;
    this.pitch = this.euler.x;
  }

  private stopAutomation(): void {
    if (this.tween || this.flyT >= 0) this.syncAngles();
    this.tween = null;
    this.flyT = -1;
  }

  goTo(name: Preset | 'cinematic'): void {
    if (name === 'cinematic') {
      this.flyT = 0;
      this.tween = null;
      return;
    }
    this.flyT = -1;
    const v = this.views[name];
    const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(v.pos, v.target, this.camera.up));
    this.tween = { fromPos: this.camera.position.clone(), fromQ: this.camera.quaternion.clone(), toPos: v.pos.clone(), toQ, t: 0 };
  }

  private walk(dt: number): void {
    const k = this.keys;
    const axis = (pos: string, neg: string) => (k.has(pos) ? 1 : 0) - (k.has(neg) ? 1 : 0);
    this.camera.getWorldDirection(this.fwd).setY(0).normalize();
    this.right.crossVectors(this.fwd, this.camera.up).normalize();
    this.move
      .copy(this.fwd)
      .multiplyScalar(axis('w', 's'))
      .addScaledVector(this.right, axis('d', 'a'))
      .addScaledVector(this.camera.up, (k.has('e') || k.has(' ') ? 1 : 0) - (k.has('q') || k.has('c') ? 1 : 0));
    if (this.move.lengthSq() === 0) return;
    this.move.normalize().multiplyScalar(6 * this.speedScale() * (this.fast ? 3 : 1) * dt);
    this.translate(this.move);
  }

  update(dt: number): void {
    if (this.keys.size) this.walk(dt);
    if (this.flyT >= 0) {
      this.flyT += dt / FLY_SECONDS;
      if (this.flyT >= 1) {
        this.goTo('overview');
      } else {
        this.camera.position.copy(this.fly.getPointAt(this.flyT));
        this.camera.lookAt(this.fly.getPointAt(Math.min(1, this.flyT + 0.03)).add(new THREE.Vector3(0, -2.5, 0)));
      }
    } else if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 1.8);
      const e = ease(tw.t);
      this.camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      this.camera.quaternion.slerpQuaternions(tw.fromQ, tw.toQ, e);
      if (tw.t >= 1) {
        this.tween = null;
        this.syncAngles();
      }
    }
  }
}
