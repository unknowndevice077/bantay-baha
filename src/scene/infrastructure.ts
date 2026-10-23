/** Roads, lanes, the bridge, the concrete drainage canal and the power-line poles. */
import * as THREE from 'three';
import { BED_Y, BRIDGE_X, CANAL, EVAC_LANE_X, ROAD_Z, riverZ } from '../config';
import { canvasTexture, clamp, colorize, merge } from '../util';
import { ASSEMBLY } from './layout';
import { baseHeight, canalFloor } from './terrain';
import { asphaltNormal, concreteSurface, groundSurface } from './textures';

const RZ = riverZ(BRIDGE_X);

/** Bridge geometry facts shared with the debris snagging logic. */
export const BRIDGE = {
  x: BRIDGE_X,
  zc: RZ,
  half: 15,
  width: 5,
  piers: [RZ - 4.5, RZ + 4.5],
  /** Upstream face of the deck/piers where floating debris gets caught. */
  snagX: BRIDGE_X - 2.8,
};

/** Arched deck top: meets the banks at both ends and peaks at 1.6 m mid-span. */
export function deckTop(z: number): number {
  const t = clamp((z - RZ) / BRIDGE.half, -1, 1);
  const end = baseHeight(BRIDGE_X, RZ + (t < 0 ? -1 : 1) * BRIDGE.half) + 0.08;
  return 1.6 - (1.6 - end) * t * t;
}
export const deckUnderside = (z: number): number => deckTop(z) - 0.55;

type HeightFn = (x: number, z: number) => number;

const line = (x0: number, z0: number, x1: number, z1: number, step: number): THREE.Vector2[] => {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
  return Array.from({ length: n + 1 }, (_, i) => new THREE.Vector2(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n));
};

/** A straight ribbon of road or lane: its centre line, width, and the surface height at each centre point. */
interface Paved {
  path: THREE.Vector2[];
  width: number;
  ys: number[];
}

/** Flat across its width, at the highest of the ground under its centre and edges, plus `lift`. */
function paved(path: THREE.Vector2[], width: number, height: HeightFn, lift: number): Paved {
  const ys = path.map((p, i) => {
    const next = path[Math.min(i + 1, path.length - 1)];
    const prev = path[Math.max(i - 1, 0)];
    const dir = new THREE.Vector2().subVectors(next, prev).normalize();
    const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
    return Math.max(height(p.x + n.x, p.y + n.y), height(p.x, p.y), height(p.x - n.x, p.y - n.y)) + lift;
  });
  return { path, width, ys };
}

/** The main road, the road north of the bridge, the two lanes and the evacuation lane. */
const ROADS: Paved[] = [
  paved(line(-100, ROAD_Z, 100, ROAD_Z, 2), 6, baseHeight, 0.08),
  paved(line(BRIDGE.x, RZ - BRIDGE.half, BRIDGE.x, -100, 2), 6, baseHeight, 0.08),
];
const LANES: Paved[] = [
  paved(line(-98, 34, 98, 34, 2), 2.6, baseHeight, 0.05),
  paved(line(-98, 50, 98, 50, 2), 2.6, baseHeight, 0.05),
  paved(line(EVAC_LANE_X, ROAD_Z + 3, EVAC_LANE_X, ASSEMBLY.z + 0.8, 2), 2.6, baseHeight, 0.05),
];

/**
 * Height of the road or lane surface at (x, z), or null off them. People walk on this, not on
 * the ground under it: the ribbons sit a few centimetres proud of the terrain.
 */
export function pavedTop(x: number, z: number): number | null {
  let top: number | null = null;
  for (const r of [...ROADS, ...LANES]) {
    const a = r.path[0];
    const b = r.path[r.path.length - 1];
    const ab = new THREE.Vector2(b.x - a.x, b.y - a.y);
    const len = ab.length();
    const t = ((x - a.x) * ab.x + (z - a.y) * ab.y) / (len * len);
    if (t < 0 || t > 1) continue;
    const off = Math.abs((x - a.x) * ab.y - (z - a.y) * ab.x) / len;
    if (off > r.width / 2) continue;
    const f = t * (r.path.length - 1);
    const i = Math.min(Math.floor(f), r.path.length - 2);
    const y = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * (f - i);
    top = top === null ? y : Math.max(top, y);
  }
  return top;
}

/** A ribbon that follows the ground (path points are (x, z)). */
function strip({ path, width, ys }: Paved, material: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let dist = 0;
  path.forEach((p, i) => {
    const next = path[Math.min(i + 1, path.length - 1)];
    const prev = path[Math.max(i - 1, 0)];
    const dir = new THREE.Vector2().subVectors(next, prev).normalize();
    const n = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
    if (i > 0) dist += p.distanceTo(path[i - 1]);
    const y = ys[i];
    pos.push(p.x + n.x, y, p.y + n.y, p.x - n.x, y, p.y - n.y);
    uv.push(0, dist / 8, 1, dist / 8);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function roadTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#3b3d40';
    ctx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 1500; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
      ctx.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    }
    ctx.fillStyle = '#e8e2c8';
    ctx.fillRect(61, 0, 6, 128);
    ctx.fillStyle = '#b9b6aa';
    ctx.fillRect(4, 0, 3, 256);
    ctx.fillRect(121, 0, 3, 256);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function bridge(): THREE.Mesh {
  const L = BRIDGE.half * 2;
  const bend = (g: THREE.BufferGeometry, offset: number): void => {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + deckTop(p.getZ(i) + RZ) + offset);
    g.computeVertexNormals();
  };
  const parts: THREE.BufferGeometry[] = [];
  const deck = new THREE.BoxGeometry(BRIDGE.width, 0.55, L, 1, 1, 40);
  bend(deck, -0.275);
  deck.translate(BRIDGE.x, 0, RZ);
  parts.push(colorize(deck, 0x9c9a94));
  for (const side of [-1, 1]) {
    const rx = BRIDGE.x + side * (BRIDGE.width / 2 - 0.1);
    const rail = new THREE.BoxGeometry(0.14, 0.12, L, 1, 1, 40);
    bend(rail, 0.95);
    rail.translate(rx, 0, RZ);
    parts.push(colorize(rail, 0xd8d4c8));
    for (let z = -BRIDGE.half + 0.5; z <= BRIDGE.half - 0.5; z += 2.5) {
      const post = new THREE.BoxGeometry(0.16, 0.95, 0.16);
      post.translate(rx, deckTop(z + RZ) + 0.475, z + RZ);
      parts.push(colorize(post, 0xd8d4c8));
    }
  }
  for (const pz of BRIDGE.piers) {
    const h = deckUnderside(pz) - BED_Y + 0.2;
    const pier = new THREE.BoxGeometry(BRIDGE.width - 0.6, h, 0.8);
    pier.translate(BRIDGE.x, BED_Y - 0.2 + h / 2, pz);
    parts.push(colorize(pier, 0x85827a));
  }
  const mesh = new THREE.Mesh(merge(parts), concreteMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Vertex-coloured concrete with procedural grain. */
function concreteMaterial(): THREE.MeshStandardMaterial {
  const c = concreteSurface();
  return new THREE.MeshStandardMaterial({ vertexColors: true, map: c.map, normalMap: c.normalMap, roughness: 0.9 });
}

/** Where the road and lanes cross the drainage canal on concrete box culverts: centre z, half-width, surface lift. */
export const CANAL_CROSSINGS = [
  { z: ROAD_Z, halfW: 3, lift: 0.08 },
  { z: 34, halfW: 1.3, lift: 0.05 },
  { z: 50, halfW: 1.3, lift: 0.05 },
];

/** Walking surface over a culvert (the road continues level instead of dipping into the canal), else null. */
export function culvertTop(x: number, z: number): number | null {
  if (Math.abs(x - CANAL.x) > CANAL.halfW + 0.35) return null;
  const c = CANAL_CROSSINGS.find((k) => Math.abs(z - k.z) <= k.halfW);
  return c ? baseHeight(x, z) + c.lift : null;
}

function canalWalls(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (let z = riverZ(CANAL.x) + 10; z < CANAL.zEnd; z += 2) {
    const len = Math.min(2, CANAL.zEnd - z);
    const zm = z + len / 2;
    const floor = canalFloor(zm);
    for (const side of [-1, 1]) {
      const x = CANAL.x + side * (CANAL.halfW + 0.1);
      const top = Math.max(baseHeight(x, zm), baseHeight(CANAL.x, zm)) + 0.15;
      const wall = new THREE.BoxGeometry(0.22, top - floor, len);
      wall.translate(x, (top + floor) / 2, zm);
      parts.push(colorize(wall, 0x9a978f));
    }
    const slab = new THREE.BoxGeometry(CANAL.halfW * 2, 0.1, len);
    slab.translate(CANAL.x, floor, zm);
    parts.push(colorize(slab, 0x7f7c75));
  }
  // Box culverts carrying the road and lanes over the canal, with a dark opening at each end.
  for (const c of CANAL_CROSSINGS) {
    if (c.z - c.halfW >= CANAL.zEnd) continue;
    const floor = canalFloor(c.z);
    const top = baseHeight(CANAL.x, c.z) + c.lift - 0.02;
    const len = c.halfW * 2 + 0.4;
    const body = new THREE.BoxGeometry(CANAL.halfW * 2 + 0.5, top - floor, len);
    body.translate(CANAL.x, (top + floor) / 2, c.z);
    parts.push(colorize(body, 0x8f8c84));
    const mouthH = Math.min(1.1, (top - floor) * 0.75);
    for (const end of [-1, 1]) {
      const mouth = new THREE.BoxGeometry(CANAL.halfW * 1.6, mouthH, 0.04);
      mouth.translate(CANAL.x, floor + 0.05 + mouthH / 2, c.z + end * (len / 2 + 0.01));
      parts.push(colorize(mouth, 0x14161a));
    }
  }
  const mesh = new THREE.Mesh(merge(parts), concreteMaterial());
  mesh.receiveShadow = true;
  return mesh;
}

/** Wooden utility poles along the main road with sagging three-wire spans. */
function powerLines(): THREE.Group {
  const xs = [-84, -68, -52, -36, -16, 6, 26, 44, 62, 80];
  const z = ROAD_Z + 3.4;
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 8, 12);
  poleGeo.translate(0, 4, 0);
  const c = concreteSurface();
  const poles = new THREE.InstancedMesh(
    poleGeo,
    new THREE.MeshStandardMaterial({ color: 0x8a8378, map: c.map, normalMap: c.normalMap, roughness: 0.9 }),
    xs.length,
  );
  const arms = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.12, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.85 }),
    xs.length,
  );
  const m = new THREE.Matrix4();
  const tops = xs.map((x, i) => {
    const y = baseHeight(x, z);
    poles.setMatrixAt(i, m.makeTranslation(x, y, z));
    arms.setMatrixAt(i, m.makeTranslation(x, y + 7.6, z));
    return new THREE.Vector3(x, y + 7.7, z);
  });
  poles.castShadow = true;
  arms.castShadow = true;

  const pts: number[] = [];
  const SEG = 12;
  const at = (a: THREE.Vector3, b: THREE.Vector3, off: number, t: number): number[] => [
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t - 2.2 * t * (1 - t),
    a.z + off,
  ];
  for (let i = 0; i + 1 < tops.length; i++) {
    for (const off of [-0.75, 0, 0.75]) {
      for (let k = 0; k < SEG; k++) pts.push(...at(tops[i], tops[i + 1], off, k / SEG), ...at(tops[i], tops[i + 1], off, (k + 1) / SEG));
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));

  const g = new THREE.Group();
  g.add(poles, arms, wires);
  return g;
}

export function createInfrastructure(): THREE.Group {
  const g = new THREE.Group();
  const asphalt = new THREE.MeshStandardMaterial({ map: roadTexture(), normalMap: asphaltNormal(), roughness: 0.82 });
  const ground = groundSurface();
  const dirt = new THREE.MeshStandardMaterial({ color: 0x9a8262, map: ground.map, normalMap: ground.normalMap, roughness: 1 });
  const deckRoad: HeightFn = (_x, z) => deckTop(z);

  g.add(
    ...ROADS.map((r) => strip(r, asphalt)),
    strip(paved(line(BRIDGE.x, RZ + BRIDGE.half, BRIDGE.x, RZ - BRIDGE.half, 1), 4.4, deckRoad, 0.02), asphalt),
    ...LANES.map((r) => strip(r, dirt)),
    bridge(),
    canalWalls(),
    powerLines(),
  );
  return g;
}
