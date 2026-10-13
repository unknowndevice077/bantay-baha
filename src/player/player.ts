/**
 * The playable character in the story game: the barangay captain, seen in
 * first person. The mouse is captured as soon as play starts (and again after
 * the phone or laptop is put away, or on the first movement key), so moving it
 * simply looks around. Where the browser won't capture the mouse, moving it
 * over the view still looks around, and holding it near an edge keeps turning.
 * WASD walk, Shift run, Space jump. Gravity, stairs/bridge/pad
 * heights, swimming in deep floodwater, and collisions with houses (the hall
 * has a doorway). The body is only drawn when a cutscene takes the camera.
 */
import * as THREE from 'three';
import { POLE_X, riverZ } from '../config';
import { HALL_PLAN, HOUSES, type LocalBox, furniture, toWorld, wallBoxes } from '../scene/layout';
import { type Look, PersonRig } from '../scene/person';
import { walkHeight } from '../scene/walkable';
import { clamp } from '../util';

/** Axis-aligned obstacle footprint in the xz plane. */
interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const RADIUS = 0.3;
const WALK = 2.4;
const RUN = 5.5;
const SWIM = 1.4;
const JUMP = 4.6;
const GRAVITY = 13;
/** Water deeper than this (m) above the floor means swimming. */
const SWIM_DEPTH = 1.3;
/** Radians per pixel: captured mouse, and click-drag while the mouse is free. */
const MOUSE_SPEED = 0.0022;
const DRAG_SPEED = 0.004;
/** Without capture: radians per pixel of free mouse movement, and turn rate at the screen edge (rad/s). */
const HOVER_SPEED = 0.003;
const EDGE_TURN = 1.6;
/** Outer share of the view where the free cursor keeps turning. */
const EDGE = 0.08;
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
/** Eye height above the feet (m). */
const EYE = 1.62;
const MAP_LIMIT = 97;
/** Tallest ledge you can walk up without jumping (m). */
const MAX_STEP = 0.5;

function obstacles(): Rect[] {
  const rects: Rect[] = [];
  // Every building's walls (doorway left open) and its bulky furniture; chairs you can brush past.
  for (const p of [...HOUSES, HALL_PLAN]) {
    const solid: LocalBox[] = [...wallBoxes(p), ...furniture(p).filter((f) => f.kind !== 'chair')];
    for (const b of solid) {
      const [x, z] = toWorld(p, b.lx, b.lz);
      rects.push({ x0: x - b.w / 2, x1: x + b.w / 2, z0: z - b.d / 2, z1: z + b.d / 2 });
    }
  }
  // Sensor pole footing.
  const pz = riverZ(POLE_X) + 10.5;
  rects.push({ x0: POLE_X - 0.4, x1: POLE_X + 0.4, z0: pz - 0.4, z1: pz + 0.4 });
  return rects;
}

export class Player {
  readonly rig: PersonRig;
  active = false;
  /** In water too deep to stand in. */
  swimming = false;
  /** Feet position. */
  readonly pos = new THREE.Vector3();
  private vy = 0;
  /** Standing on something (not mid-jump or falling). */
  grounded = true;
  /** Look direction: yaw 0 faces −z. */
  private yaw = 0;
  private pitch = 0;
  private bob = 0;
  /** Facing of the body shown in cutscenes. */
  private standHeading = 0;
  private readonly keys = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private readonly rects = obstacles();
  /** The browser refused to capture the mouse: look by moving it freely instead. */
  private hover = false;
  /** Free cursor position over the view, 0..1 (for edge turning). */
  private cursor: { x: number; y: number } | null = null;
  /** Off while something (phone, laptop) is on top of the view. */
  lookEnabled = true;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    look: Look,
  ) {
    this.rig = new PersonRig(look);
    this.rig.root.visible = false;
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
      }
      this.keys.add(k === 'shift' ? 'shift' : k);
      if (MOVE_KEYS.has(k)) this.lock();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k === 'shift' ? 'shift' : k);
      if (!e.shiftKey) this.keys.delete('shift');
    });
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('click', () => this.lock());
    document.addEventListener('pointerlockerror', () => (this.hover = true));
    document.addEventListener('mousemove', (e) => {
      if (!this.active || !this.lookEnabled) return;
      if (this.locked) return this.look(e.movementX * MOUSE_SPEED, e.movementY * MOUSE_SPEED);
      if (!this.hover || this.drag || e.target !== dom) return;
      this.look(e.movementX * HOVER_SPEED, e.movementY * HOVER_SPEED);
      this.cursor = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
    });
    dom.addEventListener('mouseleave', () => (this.cursor = null));
    dom.addEventListener('pointerdown', (e) => {
      if (this.active && !this.locked && !this.hover && e.button === 0) this.drag = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.look((e.clientX - this.drag.x) * DRAG_SPEED, (e.clientY - this.drag.y) * DRAG_SPEED);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => (this.drag = null));
  }

  get locked(): boolean {
    return document.pointerLockElement === this.dom;
  }

  /** Capture the mouse for looking around (needs a click or key press to have just happened). */
  lock(): void {
    if (!this.active || !this.lookEnabled || this.locked || this.hover) return;
    try {
      const pending = this.dom.requestPointerLock?.() as Promise<void> | undefined;
      pending?.catch?.(() => (this.hover = true));
    } catch {
      this.hover = true;
    }
  }

  /** Give the mouse back (when the phone or laptop comes up). */
  release(): void {
    if (this.locked) document.exitPointerLock();
    this.keys.clear();
  }

  private look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.45, 1.45);
  }

  /** Put the player at (x, z) facing `heading` (0 = +z) and hand over the controls. */
  enter(x: number, z: number, heading: number): void {
    this.active = true;
    this.pos.set(x, walkHeight(x, z), z);
    this.vy = 0;
    this.yaw = heading + Math.PI;
    this.pitch = -0.08;
    this.rig.root.visible = false;
  }

  /** Take the controls away and show the captain standing at (x, z), for cutscenes. */
  standAt(x: number, z: number, heading: number): void {
    this.active = false;
    this.dom.style.cursor = '';
    this.release();
    this.pos.set(x, walkHeight(x, z), z);
    this.rig.root.visible = true;
    this.standHeading = heading;
  }

  update(dt: number, waterY: number): void {
    if (!this.active) {
      if (this.rig.root.visible) this.rig.pose(dt, 0, this.pos.x, this.pos.y, this.pos.z, this.standHeading);
      return;
    }
    const k = this.keys;
    const floor = walkHeight(this.pos.x, this.pos.z);
    const swimming = waterY - floor > SWIM_DEPTH;
    this.swimming = swimming;

    // Input → direction relative to where you are looking.
    const fwd = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const side = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let speed = 0;
    if (fwd || side) {
      const len = Math.hypot(fwd, side);
      const sy = Math.sin(this.yaw);
      const cy = Math.cos(this.yaw);
      // Forward is (−sin yaw, −cos yaw); right is (cos yaw, −sin yaw).
      const dx = (-sy * fwd + cy * side) / len;
      const dz = (-cy * fwd - sy * side) / len;
      speed = swimming ? SWIM : k.has('shift') ? RUN : WALK;
      if (!swimming && waterY - floor > 0.3) speed *= 0.6; // wading
      this.move(dx * speed * dt, dz * speed * dt);
    }

    // Vertical: gravity + jump on land, float with your head above the surface when swimming.
    const newFloor = walkHeight(this.pos.x, this.pos.z);
    if (swimming) {
      this.vy = 0;
      this.pos.y = waterY - 1.4 + Math.sin(performance.now() * 0.003) * 0.05;
      this.grounded = false;
    } else {
      if (k.has(' ') && this.grounded) {
        this.vy = JUMP;
        this.grounded = false;
      }
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      // Step up stairs/kerbs instantly; fall off ledges with gravity.
      if (this.pos.y <= newFloor || (this.grounded && this.pos.y - newFloor < 0.45)) {
        this.pos.y = newFloor;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Without mouse capture, hide the cursor over the 3D view anyway so it feels the same; it reappears over the HUD.
    this.dom.style.cursor = this.hover && this.lookEnabled ? 'none' : '';

    // Free cursor resting near an edge keeps the view turning, as in many browser games.
    if (this.hover && this.cursor && this.lookEnabled) {
      const { x, y } = this.cursor;
      const turn = x < EDGE ? -(EDGE - x) / EDGE : x > 1 - EDGE ? (x - (1 - EDGE)) / EDGE : 0;
      const tilt = y < EDGE ? -(EDGE - y) / EDGE : y > 1 - EDGE ? (y - (1 - EDGE)) / EDGE : 0;
      if (turn || tilt) this.look(turn * EDGE_TURN * dt, tilt * EDGE_TURN * 0.5 * dt);
    }

    // Eyes, with a slight step bob while walking.
    this.bob = speed > 0 && this.grounded ? this.bob + dt * speed * 3.2 : 0;
    const bob = Math.sin(this.bob) * (speed > 3 ? 0.05 : 0.03);
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  /**
   * Slide along obstacles: move per axis, refuse ledges taller than MAX_STEP above
   * the feet (jump to get onto them), and push out of any rectangle we end up inside.
   */
  private move(dx: number, dz: number): void {
    const x = clamp(this.pos.x + dx, -MAP_LIMIT, MAP_LIMIT);
    if (walkHeight(x, this.pos.z) - this.pos.y < MAX_STEP) this.pos.x = x;
    this.resolve(true);
    const z = clamp(this.pos.z + dz, -MAP_LIMIT, MAP_LIMIT);
    if (walkHeight(this.pos.x, z) - this.pos.y < MAX_STEP) this.pos.z = z;
    this.resolve(false);
  }

  private resolve(alongX: boolean): void {
    for (const r of this.rects) {
      const { x, z } = this.pos;
      if (x > r.x0 - RADIUS && x < r.x1 + RADIUS && z > r.z0 - RADIUS && z < r.z1 + RADIUS) {
        if (alongX) this.pos.x = x - (r.x0 + r.x1) / 2 < 0 ? r.x0 - RADIUS : r.x1 + RADIUS;
        else this.pos.z = z - (r.z0 + r.z1) / 2 < 0 ? r.z0 - RADIUS : r.z1 + RADIUS;
      }
    }
  }
}
