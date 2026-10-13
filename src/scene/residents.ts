/**
 * Residents idle around their homes; from WARNING on they run along the
 * road/lanes (north-bank households cross the bridge) to the barangay hall,
 * climb the entrance stairs, go in through the door and wait inside. After
 * the status has been calm for a while they walk home. In the story game they
 * wait for the captain instead (siren, a knock on the door, or an escort) and
 * can be talked to.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { residentLine } from '../alerts/templates';
import { EVAC_LANE_X, LANES_Z, ROAD_Z, riverZ } from '../config';
import { type Status, bus, state } from '../state';
import { dampAngle } from '../util';
import { BRIDGE } from './infrastructure';
import { ASSEMBLY, HALL_DOOR, HALL_INSIDE, HALL_STAIRS, HOUSES } from './layout';
import { type Look, type Model, PersonRig } from './person';
import { groundHeight } from './terrain';
import { walkHeight } from './walkable';

type Mode = 'home' | 'evac' | 'shelter' | 'return' | 'follow';

interface Person {
  rig: PersonRig;
  look: Look;
  home: THREE.Vector2;
  /** (x, z) ground position. */
  pos: THREE.Vector2;
  route: THREE.Vector2[];
  evacRoute: THREE.Vector2[];
  mode: Mode;
  wait: number;
  delay: number;
  heading: number;
  north: boolean;
  bubble: CSS2DObject;
  bubbleFor: number;
  /** Walking/running speed multiplier (elderly residents are slower). */
  pace: number;
  /** Persistent name tag, created on demand. */
  tag: CSS2DObject | null;
}

const MODELS: Model[] = ['casual-man', 'woman-dress', 'beach-man', 'woman-casual', 'hoodie-man', 'farmer'];
/** Filipino skin tones and black / dark-brown hair. */
const SKINS = [0x8d5a3b, 0xa06b47, 0x7a4b2f, 0xb57d55, 0x94603e];
const HAIRS = [0x15110f, 0x1f1712, 0x2b1d14];

/** Deterministic look per household; every fifth resident is a child. */
const residentLook = (i: number): Look => ({
  model: MODELS[i % MODELS.length],
  skin: SKINS[(i * 3) % SKINS.length],
  hair: HAIRS[i % HAIRS.length],
  scale: i % 5 === 4 ? 0.64 : 0.94 + ((i * 7) % 5) * 0.03,
});
/** Seconds of NORMAL/ADVISORY before evacuees head home. */
const ALL_CLEAR_S = 15;
/** m/s when fleeing to the evacuation center. */
const RUN_SPEED = 3.8;
/** An escorted resident keeps this far behind the captain and walks at most this fast (m, m/s). */
const FOLLOW_GAP = 1.6;
const FOLLOW_SPEED = 2.2;
/** Close enough to the hall that an escorted resident goes in by themselves (m). */
const HANDOFF = 8;

const jitter = (r: number) => (Math.random() * 2 - 1) * r;
const v2 = (x: number, z: number) => new THREE.Vector2(x, z);

/** A random spot on the hall floor. */
const insideSpot = () => v2(HALL_INSIDE.x + jitter(HALL_INSIDE.halfW), HALL_INSIDE.z + jitter(HALL_INSIDE.halfD));

export class Residents {
  readonly group = new THREE.Group();
  private readonly people: Person[] = [];
  private calm = 0;
  /** When true, raising WARNING sends everyone to the hall by themselves. The story game turns this off. */
  auto = true;
  private leader: THREE.Vector3 | null = null;
  /** Breadcrumbs of where the leader walked, so a follower goes round houses instead of through them. */
  private readonly trail: THREE.Vector2[] = [];

  constructor() {
    HOUSES.forEach((h, i) => {
      const door = new THREE.Vector3(0, 0, h.d / 2 + 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
      const home = v2(h.x + door.x, h.z + door.z);
      const rig = new PersonRig(residentLook(i));
      const el = document.createElement('div');
      el.className = 'bubble';
      const bubble = new CSS2DObject(el);
      bubble.position.set(0, 2.15, 0);
      bubble.visible = false;
      rig.root.add(bubble);
      this.group.add(rig.root);
      this.people.push({
        rig,
        look: residentLook(i),
        home,
        pos: home.clone(),
        route: [],
        evacRoute: [],
        mode: 'home',
        wait: Math.random() * 4,
        delay: 0,
        heading: Math.random() * Math.PI * 2,
        north: h.z < riverZ(h.x),
        bubble,
        bubbleFor: 0,
        pace: 1,
        tag: null,
      });
    });

    // Preemptive evacuation: everyone runs for the hall as soon as WARNING is raised.
    bus.on('status', ({ to }) => {
      if (this.auto && (to === 'WARNING' || to === 'EVACUATE')) this.evacuate();
    });
    bus.on('reset', () => {
      for (const p of this.people) {
        p.pos.copy(p.home);
        p.route = [];
        p.mode = 'home';
      }
    });
  }

  get count(): number {
    return this.people.length;
  }

  position(index: number): THREE.Vector3 {
    const p = this.people[index];
    return new THREE.Vector3(p.pos.x, walkHeight(p.pos.x, p.pos.y), p.pos.y);
  }

  sheltered(index: number): boolean {
    return this.people[index].mode === 'shelter';
  }

  /** On the way to, or already in, the evacuation center. */
  leaving(index: number): boolean {
    const m = this.people[index].mode;
    return m === 'evac' || m === 'shelter' || m === 'follow';
  }

  /** Swap a resident's body for a different look (keeps their speech bubble and name tag). */
  restyle(index: number, look: Look): void {
    const p = this.people[index];
    const rig = new PersonRig(look);
    p.look = look;
    for (const child of [...p.rig.root.children]) if (child instanceof CSS2DObject) rig.root.add(child);
    this.group.remove(p.rig.root);
    this.group.add(rig.root);
    p.rig = rig;
  }

  /** Move a resident to (x, z) and have them stand there (the story's wandering child). */
  placeAt(index: number, x: number, z: number): void {
    const p = this.people[index];
    p.pos.set(x, z);
    p.home.set(x, z);
    p.route = [];
    p.mode = 'home';
    p.wait = 1e9;
  }

  setPace(index: number, pace: number): void {
    this.people[index].pace = pace;
  }

  /** A name tag above the resident's head (null removes it). */
  setTag(index: number, text: string | null): void {
    const p = this.people[index];
    if (!p.tag) {
      const el = document.createElement('div');
      el.className = 'name-tag';
      p.tag = new CSS2DObject(el);
      p.tag.position.set(0, 2.05, 0);
      p.rig.root.add(p.tag);
    }
    p.tag.element.textContent = text ?? '';
    p.tag.visible = !!text;
  }

  /** Speech bubble with a given line. */
  say(index: number, text: string, seconds = 5): void {
    const p = this.people[index];
    p.bubble.element.textContent = text;
    p.bubble.visible = true;
    p.bubbleFor = seconds;
  }

  /** The resident walks behind `leader` until close to the hall, then goes inside. */
  follow(index: number, leader: THREE.Vector3): void {
    this.leader = leader;
    this.trail.length = 0;
    const p = this.people[index];
    p.mode = 'follow';
    p.route = [];
    p.delay = 0;
  }

  /** How many residents are sheltering inside the evacuation center. */
  evacStats(): { inside: number; total: number } {
    return { inside: this.people.filter((p) => p.mode === 'shelter').length, total: this.people.length };
  }

  /** Nearest visible resident within `range` metres of (x, z), as an index, or -1. */
  nearest(x: number, z: number, range: number, skip: (index: number) => boolean = () => false): number {
    let best = -1;
    let bestD = range;
    this.people.forEach((p, i) => {
      const d = Math.hypot(p.pos.x - x, p.pos.y - z);
      if (d < bestD && p.rig.root.visible && !skip(i)) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** The resident says something fitting the current status and turns to (x, z). */
  /** Returns the line, so the game can voice it. */
  talk(index: number, x: number, z: number): string {
    const p = this.people[index];
    const line = residentLine(state.lang, state.status, p.mode === 'shelter');
    this.say(index, line);
    this.face(index, x, z);
    return line;
  }

  /** Women's models get women's voices; children speak higher. */
  voiceOf(index: number): { gender: 'male' | 'female'; child: boolean } {
    const { look } = this.people[index];
    return { gender: look.model.startsWith('woman') ? 'female' : 'male', child: (look.scale ?? 1) < 0.8 };
  }

  /** Stop for a few seconds and turn toward (x, z), unless on the move to the hall. */
  face(index: number, x: number, z: number): void {
    const p = this.people[index];
    if (p.mode === 'home' || p.mode === 'shelter') {
      p.route = [];
      p.wait = 5;
      p.heading = Math.atan2(x - p.pos.x, z - p.pos.y);
    }
  }

  /** Send residents (all, or those passing `which`) to the evacuation center. */
  evacuate(which: (index: number) => boolean = () => true): void {
    for (const [i, p] of this.people.entries()) {
      if (p.mode === 'evac' || p.mode === 'shelter' || p.mode === 'follow' || !which(i)) continue;
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
      // Behind the north-bank houses: their bamboo steps come down to about 3.5 m past the bridge end.
      const nz = BRIDGE.zc - BRIDGE.half - 6.5;
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
      if (p.bubbleFor > 0) {
        p.bubbleFor -= dt;
        p.bubble.visible = p.bubbleFor > 0;
      }
      // All clear (the simulator only: in the story nobody goes home until morning).
      if (this.auto && (p.mode === 'evac' || p.mode === 'shelter') && this.calm > ALL_CLEAR_S) {
        // Leave through the door, retrace the route, then home.
        p.route = [...p.evacRoute.slice(0, -1).reverse(), p.home.clone()];
        p.mode = 'return';
      }
      if (p.mode === 'follow') {
        this.followLeader(p, dt, levelY);
        continue;
      }
      if (p.delay > 0) {
        p.delay -= dt;
        this.place(p, dt, 0, levelY);
        continue;
      }
      const target = p.route[0];
      let speed = 0;
      if (target) {
        speed = (p.mode === 'evac' ? RUN_SPEED : p.mode === 'return' ? 1.3 : 0.9) * p.pace;
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
      this.place(p, dt, speed, levelY);
    }
  }

  private followLeader(p: Person, dt: number, levelY: number): void {
    const leader = this.leader!;
    if (Math.hypot(p.pos.x - ASSEMBLY.x, p.pos.y - ASSEMBLY.z) < HANDOFF) {
      // At the hall: up the stairs and inside on their own.
      p.evacRoute = [v2(ASSEMBLY.x + jitter(0.6), ASSEMBLY.z), v2(HALL_STAIRS.x + jitter(0.8), HALL_STAIRS.z1 + 0.4), v2(HALL_DOOR.x, HALL_DOOR.z + 0.4), insideSpot()];
      p.route = p.evacRoute.map((v) => v.clone());
      p.mode = 'evac';
      return;
    }
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - leader.x, last.y - leader.z) > 0.8) this.trail.push(v2(leader.x, leader.z));
    while (this.trail.length > 1 && this.trail[0].distanceTo(p.pos) < 0.5) this.trail.shift();
    const gap = Math.hypot(leader.x - p.pos.x, leader.z - p.pos.y);
    const to = this.trail[0].clone().sub(p.pos);
    const dist = to.length();
    let speed = 0;
    if (gap > FOLLOW_GAP && dist > 0.01) {
      speed = Math.min(FOLLOW_SPEED, (gap - FOLLOW_GAP) * 3) * p.pace;
      if (levelY - groundHeight(p.pos.x, p.pos.y) > 0.2) speed *= 0.6;
      p.pos.addScaledVector(to, Math.min(dist, speed * dt) / dist);
      p.heading = dampAngle(p.heading, Math.atan2(to.x, to.y), 8, dt);
    }
    this.place(p, dt, speed, levelY);
  }

  private place(p: Person, dt: number, speed: number, levelY: number): void {
    const floor = walkHeight(p.pos.x, p.pos.y);
    p.rig.pose(dt, speed, p.pos.x, floor, p.pos.y, p.heading);
    // Hide people standing in deep water rather than drawing them submerged.
    p.rig.root.visible = levelY - floor < 1.4;
  }
}
