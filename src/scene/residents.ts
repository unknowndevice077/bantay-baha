/**
 * Residents idle around their homes; from WARNING on they run along the
 * road/lanes (north-bank households cross the bridge) to the barangay hall,
 * climb the entrance stairs, go in through the door and wait inside. After
 * the status has been calm for a while they walk home.
 */
import * as THREE from 'three';
import { EVAC_LANE_X, HALL, LANES_Z, ROAD_Z, riverZ } from '../config';
import { type Status, bus } from '../state';
import { clamp, colorize, dampAngle, merge } from '../util';
import { BRIDGE, deckTop } from './infrastructure';
import { ASSEMBLY, HALL_DOOR, HALL_INSIDE, HALL_PAD, HALL_STAIRS, HOUSES } from './layout';
import { groundHeight } from './terrain';

type Mode = 'home' | 'evac' | 'shelter' | 'return';

interface Person {
  root: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  home: THREE.Vector2;
  /** (x, z) ground position. */
  pos: THREE.Vector2;
  route: THREE.Vector2[];
  evacRoute: THREE.Vector2[];
  mode: Mode;
  wait: number;
  delay: number;
  phase: number;
  heading: number;
  north: boolean;
}

const SHIRTS = [0xd94848, 0x3a7bd5, 0xf2c14e, 0x4caf50, 0xf5f5f5, 0x9c27b0, 0xff8a3d];
const SKIN = 0x9a6a46;
/** Seconds of NORMAL/ADVISORY before evacuees head home. */
const ALL_CLEAR_S = 15;
/** m/s when fleeing to the evacuation center. */
const RUN_SPEED = 3.8;

const jitter = (r: number) => (Math.random() * 2 - 1) * r;
const v2 = (x: number, z: number) => new THREE.Vector2(x, z);

/** Height of whatever the person stands on: bridge deck, hall stairs/pad, or ground. */
function walkHeight(x: number, z: number): number {
  if (Math.abs(x - BRIDGE.x) < BRIDGE.width / 2 && Math.abs(z - BRIDGE.zc) < BRIDGE.half) return deckTop(z);
  const padHalf = (HALL.w + 4) / 2;
  if (Math.abs(x - HALL_STAIRS.x) < padHalf && z >= HALL_STAIRS.z1) return HALL_PAD.top;
  if (Math.abs(x - HALL_STAIRS.x) < HALL_STAIRS.width / 2 && z > HALL_STAIRS.z0) {
    const t = clamp((z - HALL_STAIRS.z0) / (HALL_STAIRS.z1 - HALL_STAIRS.z0), 0, 1);
    return groundHeight(x, z) + (HALL_PAD.top - groundHeight(x, z)) * t;
  }
  return groundHeight(x, z);
}

/** A random spot on the hall floor. */
const insideSpot = () => v2(HALL_INSIDE.x + jitter(HALL_INSIDE.halfW), HALL_INSIDE.z + jitter(HALL_INSIDE.halfD));

export class Residents {
  readonly group = new THREE.Group();
  private readonly people: Person[] = [];
  private calm = 0;

  constructor() {
    const legGeo = new THREE.CapsuleGeometry(0.075, 0.68, 4, 8);
    legGeo.translate(0, -0.42, 0);
    const armGeo = new THREE.CapsuleGeometry(0.055, 0.5, 4, 8);
    armGeo.translate(0, -0.3, 0);
    const pants = new THREE.MeshStandardMaterial({ color: 0x2f3640, roughness: 0.9 });
    const bodies = SHIRTS.map((shirt) => {
      const torso = colorize(new THREE.CapsuleGeometry(0.19, 0.36, 4, 12), shirt);
      torso.scale(1, 1, 0.68);
      torso.translate(0, 1.17, 0);
      const neck = colorize(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), SKIN);
      neck.translate(0, 1.5, 0);
      const head = colorize(new THREE.SphereGeometry(0.12, 16, 12), SKIN);
      head.scale(0.92, 1.08, 1);
      head.translate(0, 1.64, 0);
      const hair = colorize(new THREE.SphereGeometry(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), 0x1a1410);
      hair.translate(0, 1.67, -0.012);
      return { geo: merge([torso, neck, head, hair]), mat: new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }) };
    });
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

    HOUSES.forEach((h, i) => {
      const door = new THREE.Vector3(0, 0, h.d / 2 + 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
      const home = v2(h.x + door.x, h.z + door.z);
      const look = bodies[i % bodies.length];
      const root = new THREE.Group();
      root.rotation.order = 'YXZ'; // so the running lean tilts along the heading
      const body = new THREE.Mesh(look.geo, bodyMat);
      body.castShadow = true;
      root.add(body);
      const legs = [-0.09, 0.09].map((x) => {
        const leg = new THREE.Mesh(legGeo, pants);
        leg.position.set(x, 0.86, 0);
        leg.castShadow = true;
        root.add(leg);
        return leg;
      });
      const arms = [-0.25, 0.25].map((x) => {
        const arm = new THREE.Mesh(armGeo, look.mat);
        arm.position.set(x, 1.4, 0);
        root.add(arm);
        return arm;
      });
      this.group.add(root);
      this.people.push({
        root,
        legs,
        arms,
        home,
        pos: home.clone(),
        route: [],
        evacRoute: [],
        mode: 'home',
        wait: Math.random() * 4,
        delay: 0,
        phase: Math.random() * 6,
        heading: Math.random() * Math.PI * 2,
        north: h.z < riverZ(h.x),
      });
    });

    // Preemptive evacuation: everyone runs for the hall as soon as WARNING is raised.
    bus.on('status', ({ to }) => {
      if (to === 'WARNING' || to === 'EVACUATE') this.evacuate();
    });
    bus.on('reset', () => {
      for (const p of this.people) {
        p.pos.copy(p.home);
        p.route = [];
        p.mode = 'home';
      }
    });
  }

  private evacuate(): void {
    for (const p of this.people) {
      if (p.mode === 'evac' || p.mode === 'shelter') continue;
      p.evacRoute = this.routeFor(p);
      p.route = p.evacRoute.map((v) => v.clone());
      p.mode = 'evac';
      p.delay = Math.random() * 1.5;
    }
  }

  /** Nearest road/lane → evacuation lane → stairs → door → a spot inside the hall. */
  private routeFor(p: Person): THREE.Vector2[] {
    const approach: THREE.Vector2[] = [];
    if (p.north) {
      // Across the bridge, then down the main road to the evacuation lane.
      const nz = BRIDGE.zc - BRIDGE.half - 2;
      approach.push(v2(p.pos.x, nz + jitter(0.5)), v2(BRIDGE.x + jitter(0.8), nz), v2(BRIDGE.x + jitter(0.8), ROAD_Z), v2(EVAC_LANE_X + jitter(0.8), ROAD_Z + jitter(0.5)));
    } else {
      const lane = LANES_Z.reduce((best, z) => (Math.abs(z - p.pos.y) < Math.abs(best - p.pos.y) ? z : best));
      approach.push(v2(p.pos.x, lane + jitter(0.6)), v2(EVAC_LANE_X + jitter(0.8), lane + jitter(0.6)));
    }
    return [
      ...approach,
      v2(ASSEMBLY.x + jitter(0.6), ASSEMBLY.z),
      v2(HALL_STAIRS.x + jitter(0.8), HALL_STAIRS.z1 + 0.4),
      v2(HALL_DOOR.x + jitter(0.5), HALL_DOOR.z + 0.4),
      insideSpot(),
    ];
  }

  update(dt: number, levelY: number, status: Status): void {
    this.calm = status === 'NORMAL' || status === 'ADVISORY' ? this.calm + dt : 0;
    for (const p of this.people) {
      if ((p.mode === 'evac' || p.mode === 'shelter') && this.calm > ALL_CLEAR_S) {
        // Leave through the door, retrace the route, then home.
        p.route = [...p.evacRoute.slice(0, -1).reverse(), p.home.clone()];
        p.mode = 'return';
      }
      if (p.delay > 0) {
        p.delay -= dt;
        this.pose(p, dt, 0, levelY);
        continue;
      }
      const target = p.route[0];
      let speed = 0;
      if (target) {
        speed = p.mode === 'evac' ? RUN_SPEED : p.mode === 'return' ? 1.3 : 0.9;
        if (levelY - groundHeight(p.pos.x, p.pos.y) > 0.2) speed *= 0.55; // wading
        const to = target.clone().sub(p.pos);
        const dist = to.length();
        if (dist < 0.3) {
          p.route.shift();
        } else {
          p.pos.addScaledVector(to, Math.min(dist, speed * dt) / dist);
          p.heading = dampAngle(p.heading, Math.atan2(to.x, to.y), 8, dt);
        }
      } else {
        if (p.mode === 'evac') p.mode = 'shelter';
        if (p.mode === 'return') p.mode = 'home';
        p.wait -= dt;
        if (p.wait < 0) {
          // Mill around home, or shuffle about on the evacuation-center floor.
          p.route = [p.mode === 'shelter' ? insideSpot() : v2(p.home.x + jitter(3), p.home.y + jitter(1.5))];
          p.wait = 2 + Math.random() * 4;
        }
      }
      this.pose(p, dt, speed, levelY);
    }
  }

  private pose(p: Person, dt: number, speed: number, levelY: number): void {
    // Running = faster cadence, bigger stride, bent arms pumping, forward lean and a little bounce.
    const running = speed > 2.5;
    p.phase += dt * speed * (running ? 2.6 : 3.2);
    const swing = speed > 0 ? Math.sin(p.phase) * Math.min(running ? 1.0 : 0.7, 0.3 + speed * 0.18) : 0;
    p.legs[0].rotation.x = swing;
    p.legs[1].rotation.x = -swing;
    const armBend = running ? -0.6 : 0;
    p.arms[0].rotation.x = armBend - swing * 0.8;
    p.arms[1].rotation.x = armBend + swing * 0.8;
    const floor = walkHeight(p.pos.x, p.pos.y);
    const bounce = running ? Math.abs(Math.cos(p.phase)) * 0.08 : 0;
    p.root.position.set(p.pos.x, floor + bounce, p.pos.y);
    p.root.rotation.y = p.heading;
    p.root.rotation.x = running ? 0.18 : 0;
    // Hide people standing in deep water rather than drawing them submerged.
    p.root.visible = levelY - floor < 1.4;
  }
}
