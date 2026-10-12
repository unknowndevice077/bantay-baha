/**
 * Floating debris with lightweight buoyancy physics: bodies ride the wave
 * surface, are dragged by a current field that follows the river, strand when
 * the water gets too shallow, and snag on the bridge piers/deck where they pile up.
 * More rain → more debris.
 */
import * as THREE from 'three';
import { riverZ } from '../config';
import { bangkaGeo, bottleGeo, chairGeo, frondGeo, logGeo, sackGeo, tireGeo } from '../scene/geo';
import { BRIDGE, deckTop, deckUnderside } from '../scene/infrastructure';
import { baseHeight, groundHeight } from '../scene/terrain';
import { bus } from '../state';
import { damp, dampAngle, smoothstep } from '../util';
import { waveHeight } from '../water/water';

interface Kind {
  name: string;
  weight: number;
  geo: THREE.BufferGeometry;
  /** Collision radius used for piling. */
  radius: number;
  /** How deep it sits; it strands when the water is shallower than this. */
  draft: number;
  /** How quickly it matches the current (1/s). */
  drag: number;
}

interface Body {
  kind: Kind;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector2;
  yaw: number;
  phase: number;
  snagged: boolean;
  floating: boolean;
  stranded: number;
}

const MAX_BODIES = 60;
const SPAWN_X = -96;
const EXIT_X = 97;

/** Flow direction follows the river centre-line; strongest in the channel, slower on the floodplain. */
function current(x: number, z: number, level: number, rain: number, out: THREE.Vector2): THREE.Vector2 {
  const a = Math.abs(z - riverZ(x));
  const channel = 1 - smoothstep(6, 14, a) * 0.75;
  const speed = (0.5 + (rain / 100) * 1.6 + Math.max(0, level - 1) * 0.35) * channel;
  out.set(1, 0.105 * Math.cos(x * 0.035)).normalize().multiplyScalar(speed);
  out.y += Math.sin(x * 0.08 + z * 0.3) * 0.08;
  return out;
}

export class DebrisField {
  readonly group = new THREE.Group();
  private readonly kinds: Kind[];
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private bodies: Body[] = [];
  private cooldown = 0;
  private readonly cur = new THREE.Vector2();

  constructor() {
    this.kinds = [
      { name: 'log', weight: 2, geo: logGeo(), radius: 1.3, draft: 0.18, drag: 0.8 },
      { name: 'bottle', weight: 3, geo: bottleGeo(), radius: 0.2, draft: 0.03, drag: 1.6 },
      { name: 'frond', weight: 2, geo: frondGeo(), radius: 1.1, draft: 0.03, drag: 1.2 },
      { name: 'tire', weight: 1, geo: tireGeo(), radius: 0.45, draft: 0.08, drag: 1.0 },
      { name: 'sack', weight: 1, geo: sackGeo(), radius: 0.45, draft: 0.12, drag: 0.9 },
      { name: 'chair', weight: 0.6, geo: chairGeo(), radius: 0.45, draft: 0.1, drag: 1.1 },
      { name: 'sampan', weight: 0.25, geo: bangkaGeo(), radius: 2.0, draft: 0.15, drag: 0.5 },
    ];
    bus.on('reset', () => this.clear());
  }

  private clear(): void {
    for (const b of this.bodies) this.group.remove(b.mesh);
    this.bodies = [];
  }

  private pickKind(): Kind {
    // Only one drifting sampan at a time keeps it "occasional".
    const pool = this.bodies.some((b) => b.kind.name === 'sampan') ? this.kinds.filter((k) => k.name !== 'sampan') : this.kinds;
    let r = Math.random() * pool.reduce((s, k) => s + k.weight, 0);
    for (const k of pool) if ((r -= k.weight) <= 0) return k;
    return pool[0];
  }

  private spawn(x: number, levelY: number): void {
    const kind = this.pickKind();
    let half = 0;
    while (half < 40 && baseHeight(x, riverZ(x) + half) < levelY) half += 0.5;
    const z = riverZ(x) + (Math.random() * 2 - 1) * Math.max(1, Math.min(half - 1.5, 9));
    const mesh = new THREE.Mesh(kind.geo, this.material);
    mesh.rotation.order = 'YXZ';
    mesh.castShadow = true;
    if (kind.name === 'log') mesh.scale.set(0.7 + Math.random() * 0.6, 1, 1);
    this.group.add(mesh);
    this.bodies.push({
      kind,
      mesh,
      pos: new THREE.Vector3(x, levelY, z),
      vel: new THREE.Vector2(),
      yaw: Math.random() * Math.PI * 2,
      phase: Math.random() * 10,
      snagged: false,
      floating: true,
      stranded: 0,
    });
  }

  update(dt: number, level: number, levelY: number, rain: number, enabled: boolean, waveT: number, chop: number): void {
    if (!enabled) {
      if (this.bodies.length) this.clear();
      return;
    }
    const target = Math.min(MAX_BODIES, Math.round(6 + (rain / 100) * 44));
    this.cooldown -= dt;
    if (this.bodies.length < target && this.cooldown <= 0) {
      // Fill quickly along the river when far below target, otherwise feed from upstream.
      this.spawn(this.bodies.length < target * 0.6 ? -90 + Math.random() * 100 : SPAWN_X, levelY);
      this.cooldown = 0.35;
    }

    const snagged = this.bodies.filter((b) => b.snagged);
    for (const b of this.bodies) this.step(b, dt, level, levelY, rain, waveT, chop, snagged);
    this.separatePile(snagged);

    this.bodies = this.bodies.filter((b) => {
      const gone = b.pos.x > EXIT_X || (b.stranded > 30 && this.bodies.length > target);
      if (gone) this.group.remove(b.mesh);
      return !gone;
    });
  }

  private step(b: Body, dt: number, level: number, levelY: number, rain: number, waveT: number, chop: number, pile: Body[]): void {
    const { pos, vel, kind } = b;
    const waterY = levelY + waveHeight(pos.x, pos.z, waveT, chop);
    const depth = waterY - groundHeight(pos.x, pos.z);
    b.floating = depth > kind.draft;
    b.phase += dt;

    if (b.floating) {
      b.stranded = 0;
      current(pos.x, pos.z, level, rain, this.cur);
      const k = 1 - Math.exp(-kind.drag * dt);
      vel.x += (this.cur.x - vel.x) * k;
      vel.y += (this.cur.y - vel.y) * k;
      pos.y = damp(pos.y, waterY - kind.draft * 0.4, 6, dt);
    } else {
      b.stranded += dt;
      vel.multiplyScalar(Math.exp(-3 * dt));
      pos.y = damp(pos.y, groundHeight(pos.x, pos.z) + kind.draft * 0.4, 4, dt);
    }

    const nx = pos.x + vel.x * dt;
    const onSpan = Math.abs(pos.z - BRIDGE.zc) < BRIDGE.half;
    if (!b.snagged && b.floating && onSpan && pos.x < BRIDGE.snagX && nx >= BRIDGE.snagX - kind.radius * 0.5) {
      const deckBlocks = waterY + kind.radius * 0.3 > deckUnderside(pos.z) && waterY < deckTop(pos.z) + 0.3;
      const pierHit = BRIDGE.piers.some((pz) => Math.abs(pos.z - pz) < 0.5 + kind.radius * 0.5);
      if (deckBlocks || pierHit) b.snagged = true;
    }
    // Piling: a floater that bumps into the jam joins it.
    if (!b.snagged && b.floating && onSpan && pos.x < BRIDGE.snagX) {
      b.snagged = pile.some((o) => o.pos.distanceTo(pos) < (o.kind.radius + kind.radius) * 0.6);
    }

    if (b.snagged) {
      const anchored =
        pos.x >= BRIDGE.snagX - kind.radius - 0.4 || pile.some((o) => o !== b && o.pos.distanceTo(pos) < (o.kind.radius + kind.radius) * 0.75);
      const overtopped = waterY > deckTop(pos.z) + 0.35;
      if (!anchored || overtopped) {
        b.snagged = false;
      } else {
        vel.x = 0;
        vel.y *= 0.9;
        pos.x = Math.min(pos.x, BRIDGE.snagX - kind.radius * 0.5);
      }
    }
    pos.x += vel.x * dt;
    pos.z += vel.y * dt;

    // Logs and boats turn to align with the flow; everything bobs.
    if (vel.lengthSq() > 0.01) b.yaw = dampAngle(b.yaw, Math.atan2(-vel.y, vel.x), b.snagged ? 0.3 : 1.2, dt);
    const bob = b.floating ? 1 : 0;
    b.mesh.position.copy(pos);
    b.mesh.rotation.set(Math.sin(b.phase * 1.7) * 0.08 * bob, b.yaw, Math.sin(b.phase * 1.3 + 1) * 0.06 * bob);
  }

  /** Pushes jammed debris apart (mostly upstream) so the pile grows instead of overlapping. */
  private separatePile(pile: Body[]): void {
    for (let i = 0; i < pile.length; i++) {
      for (let j = i + 1; j < pile.length; j++) {
        const a = pile[i].pos;
        const b = pile[j].pos;
        const min = (pile[i].kind.radius + pile[j].kind.radius) * 0.55;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= min || d === 0) continue;
        const push = (min - d) * 0.5;
        const back = b.x < a.x ? b : a;
        back.x -= push;
        b.z += (dz / d) * push * 0.5;
        a.z -= (dz / d) * push * 0.5;
      }
    }
  }
}
