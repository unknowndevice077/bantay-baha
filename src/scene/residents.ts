/**
 * Residents idle around their homes; from WARNING on they run along the
 * road/lanes to the barangay hall on higher ground, and walk home once the
 * status has been calm for a while. North-bank households climb the north hill.
 */
import * as THREE from 'three';
import { ASSEMBLY, HOUSES } from './layout';
import { EVAC_LANE_X, LANES_Z, riverZ } from '../config';
import { type Status, bus } from '../state';
import { colorize, dampAngle, merge } from '../util';
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

export class Residents {
  readonly group = new THREE.Group();
  private readonly people: Person[] = [];
  private calm = 0;

  constructor() {
    const legGeo = new THREE.BoxGeometry(0.14, 0.8, 0.14);
    legGeo.translate(0, -0.4, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
    armGeo.translate(0, -0.3, 0);
    const pants = new THREE.MeshLambertMaterial({ color: 0x2f3640 });
    const bodies = SHIRTS.map((shirt) => {
      const torso = colorize(new THREE.BoxGeometry(0.42, 0.6, 0.25), shirt);
      torso.translate(0, 1.15, 0);
      const head = colorize(new THREE.SphereGeometry(0.13, 10, 8), SKIN);
      head.translate(0, 1.6, 0);
      const hair = colorize(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x1a1410);
      hair.translate(0, 1.63, -0.01);
      return { geo: merge([torso, head, hair]), mat: new THREE.MeshLambertMaterial({ color: shirt }) };
    });
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });

    HOUSES.forEach((h, i) => {
      const door = new THREE.Vector3(0, 0, h.d / 2 + 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
      const home = new THREE.Vector2(h.x + door.x, h.z + door.z);
      const look = bodies[i % bodies.length];
      const root = new THREE.Group();
      root.rotation.order = 'YXZ'; // so the running lean tilts along the heading
      const body = new THREE.Mesh(look.geo, bodyMat);
      body.castShadow = true;
      root.add(body);
      const legs = [-0.1, 0.1].map((x) => {
        const leg = new THREE.Mesh(legGeo, pants);
        leg.position.set(x, 0.85, 0);
        root.add(leg);
        return leg;
      });
      const arms = [-0.27, 0.27].map((x) => {
        const arm = new THREE.Mesh(armGeo, look.mat);
        arm.position.set(x, 1.42, 0);
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

  /** Nearest road/lane → evacuation lane → assembly point in front of the hall. */
  private routeFor(p: Person): THREE.Vector2[] {
    if (p.north) return [new THREE.Vector2(p.pos.x + jitter(1), p.pos.y - 24)];
    const lane = LANES_Z.reduce((best, z) => (Math.abs(z - p.pos.y) < Math.abs(best - p.pos.y) ? z : best));
    return [
      new THREE.Vector2(p.pos.x, lane + jitter(0.6)),
      new THREE.Vector2(EVAC_LANE_X + jitter(0.8), lane + jitter(0.6)),
      new THREE.Vector2(EVAC_LANE_X + jitter(0.8), ASSEMBLY.z - 2),
      new THREE.Vector2(ASSEMBLY.x + jitter(6), ASSEMBLY.z + jitter(1)),
    ];
  }

  update(dt: number, levelY: number, status: Status): void {
    this.calm = status === 'NORMAL' || status === 'ADVISORY' ? this.calm + dt : 0;
    for (const p of this.people) {
      if ((p.mode === 'evac' || p.mode === 'shelter') && this.calm > ALL_CLEAR_S) {
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
        const ground = groundHeight(p.pos.x, p.pos.y);
        if (levelY - ground > 0.2) speed *= 0.55; // wading
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
          // Mill around home (or the assembly area) between short pauses.
          const center = p.mode === 'shelter' ? new THREE.Vector2(ASSEMBLY.x, ASSEMBLY.z) : p.home;
          p.route = [new THREE.Vector2(center.x + jitter(p.mode === 'shelter' ? 6 : 3), center.y + jitter(1.5))];
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
    const ground = groundHeight(p.pos.x, p.pos.y);
    const bounce = running ? Math.abs(Math.cos(p.phase)) * 0.08 : 0;
    p.root.position.set(p.pos.x, ground + bounce, p.pos.y);
    p.root.rotation.y = p.heading;
    p.root.rotation.x = running ? 0.18 : 0;
    // Hide people standing in deep water rather than drawing them submerged.
    p.root.visible = levelY - ground < 1.4;
  }
}
