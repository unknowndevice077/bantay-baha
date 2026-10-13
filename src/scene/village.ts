/**
 * Houses (instanced), barangay hall with entrance stairs, basketball court,
 * fences and trees (instanced). PBR materials with procedural plaster,
 * corrugated-iron, thatch and bark detail; alpha-cut palm and banana leaves.
 * Windows glow warm at night via one shared material (bright enough to bloom).
 */
import * as THREE from 'three';
import { COURT, HALL, riverZ } from '../config';
import { canvasTexture, merge, mulberry32 } from '../util';
import { bananaCrown, gableRoof, palmCrown } from './geo';
import {
  COURT_PAD,
  type Furniture,
  HALL_PAD,
  HALL_PLAN,
  HALL_STAIRS,
  HOUSES,
  type HousePlan,
  WALL_T,
  doorHalf,
  frontSteps,
  furniture,
  isOpenGround,
  roomCeiling,
  roomFloor,
  wallBoxes,
} from './layout';
import { groundHeight } from './terrain';
import {
  bananaLeafTexture,
  barkSurface,
  concreteSurface,
  corrugatedSurface,
  palmLeafTexture,
  plasterSurface,
  thatchSurface,
} from './textures';

const UP = new THREE.Vector3(0, 1, 0);
const DAY_GLASS = new THREE.Color(0x2a3540);
const WARM = new THREE.Color(0xffc177);
/** Glass seen from inside: bright daylight, dark night. */
const DAY_VIEW = new THREE.Color(0xa9c3d6);
const NIGHT_VIEW = new THREE.Color(0x0b1118);

export interface Village {
  group: THREE.Group;
  update(night: number): void;
}

interface Instance {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

const pbr = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...opts });

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: Instance[], shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Matrix for something placed in a house's local frame (local +z = front). */
function local(p: HousePlan, lx: number, y: number, lz: number, ry: number, sx: number, sy: number, sz = 1): THREE.Matrix4 {
  const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(UP, p.rot).add(new THREE.Vector3(p.x, y, p.z));
  const q = new THREE.Quaternion().setFromAxisAngle(UP, p.rot + ry);
  return new THREE.Matrix4().compose(v, q, new THREE.Vector3(sx, sy, sz));
}

/** Interior parts, gathered by material while the buildings are laid out. */
interface Rooms {
  /** Painted furniture and fittings (instance colour). */
  furnishings: Instance[];
  /** Ceiling lamps (unlit material, always on). */
  lamps: Instance[];
  /** Framed pictures and calendars on the walls. */
  pictures: Instance[];
  /** Curtains and rugs. */
  textiles: Instance[];
}

/**
 * Hollow shell: walls with real thickness and an open doorway, a threshold, a
 * floor, a ceiling and glass on the inside of every window, so any building can
 * be walked into. The footprints come from layout.wallBoxes (also used for collisions).
 */
function roomShell(p: HousePlan, walls: Instance[], trims: Instance[], panes: Instance[], windowCols: number[]): void {
  const t = WALL_T;
  const top = p.floorY + p.h;
  const base = p.baseY;
  const floor = roomFloor(p);
  const wall = new THREE.Color(p.wall);
  for (const b of wallBoxes(p)) walls.push({ matrix: local(p, b.lx, (base + top) / 2, b.lz, 0, b.w, top - base, b.d), color: wall });
  const door = doorHalf(p);
  const head = floor + 2.05;
  const front = p.d / 2 - t / 2;
  walls.push({ matrix: local(p, 0, (head + top) / 2, front, 0, door * 2, top - head, t), color: wall });
  if (floor > base) walls.push({ matrix: local(p, 0, (base + floor) / 2, front, 0, door * 2, floor - base, t), color: wall });
  const tile = p.type === 'nipa' ? 0x9c8358 : p.type === 'hall' ? 0xa9a597 : 0xc9c2b2;
  trims.push(
    { matrix: local(p, 0, floor - 0.025, 0, 0, p.w - 0.02, 0.06, p.d - 0.02), color: new THREE.Color(tile) },
    { matrix: local(p, 0, roomCeiling(p) + 0.05, 0, 0, p.w - 2 * t, 0.1, p.d - 2 * t), color: new THREE.Color(p.type === 'nipa' ? 0x8c7448 : 0xe8e5dc) },
  );
  // Glass on the inside faces, behind the panes drawn on the outside.
  const wy = p.floorY + 1.45;
  const ww = p.type === 'nipa' ? 0.9 : 1.0;
  for (const fx of windowCols) {
    panes.push({ matrix: local(p, fx * p.w, wy, p.d / 2 - t - 0.01, Math.PI, ww, 0.9) });
    panes.push({ matrix: local(p, fx * p.w, wy, -p.d / 2 + t + 0.01, 0, ww, 0.9) });
  }
  for (const sx of [-1, 1]) panes.push({ matrix: local(p, sx * (p.w / 2 - t - 0.01), wy, 0, (-sx * Math.PI) / 2, ww, 0.9) });
}

const WOOD = 0x6b4a2e;
const PLASTIC = 0xeeeee8;
const SHEETS = [0xd9cbb0, 0xb7c9d6, 0xd8b4b4, 0xc8d6b9];
const FRAMES = [0x7d9cb8, 0xc9a66b, 0x9bb37a, 0xb37a7a];
const CURTAINS = [0xc0504d, 0x4f81bd, 0xe0b040, 0x6aa36f, 0xd27fa8];

/** Bed, table and monobloc chairs, cabinet, TV, ceiling lamp and a picture, from layout.furniture. */
function furnish(p: HousePlan, rooms: Rooms, rnd: () => number): void {
  const floor = roomFloor(p);
  const add = (f: Furniture, ox: number, y: number, oz: number, sx: number, sy: number, sz: number, color: number) => {
    const c = Math.cos(f.ry);
    const s = Math.sin(f.ry);
    rooms.furnishings.push({ matrix: local(p, f.lx + ox * c + oz * s, floor + y, f.lz - ox * s + oz * c, f.ry, sx, sy, sz), color: new THREE.Color(color) });
  };
  for (const f of furniture(p)) {
    if (f.kind === 'bed') {
      add(f, 0, 0.18, 0, 1.9, 0.36, 1.05, WOOD);
      add(f, 0.03, 0.43, 0, 1.82, 0.16, 0.98, SHEETS[Math.floor(rnd() * SHEETS.length)]);
      add(f, -0.72, 0.55, 0, 0.32, 0.1, 0.72, 0xf4f2ec);
      add(f, -0.93, 0.5, 0, 0.06, 0.8, 1.05, WOOD);
    } else if (f.kind === 'table') {
      add(f, 0, 0.73, 0, 1.0, 0.04, 0.7, 0x8b5e3c);
      for (const [lx, lz] of [[-0.45, -0.3], [0.45, -0.3], [-0.45, 0.3], [0.45, 0.3]]) add(f, lx, 0.36, lz, 0.05, 0.72, 0.05, 0x5e3f26);
    } else if (f.kind === 'chair') {
      add(f, 0, 0.44, 0, 0.46, 0.05, 0.44, PLASTIC);
      add(f, 0, 0.7, -0.2, 0.46, 0.48, 0.05, PLASTIC);
      for (const [lx, lz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) add(f, lx, 0.21, lz, 0.04, 0.42, 0.04, PLASTIC);
    } else if (f.kind === 'cabinet') {
      add(f, 0, 0.9, 0, 0.9, 1.8, 0.45, 0x7a5434);
      add(f, 0, 0.9, 0.226, 0.02, 1.7, 0.01, 0x3e2a1a);
    } else {
      add(f, 0, 0.25, 0, 0.95, 0.5, 0.42, 0x3b2a1c);
      add(f, 0, 0.83, 0, 0.9, 0.55, 0.05, 0x111316);
    }
  }
  if (p.type !== 'hall') {
    const hd = p.d / 2 - WALL_T;
    // Curtains either side of the front and back windows, and a woven banig rug by the table.
    const curtain = new THREE.Color(CURTAINS[Math.floor(rnd() * CURTAINS.length)]);
    const wy = p.floorY + 1.45;
    for (const fx of [-0.28, 0.28]) {
      for (const side of [-1, 1]) {
        for (const lz of [hd - 0.04, -hd + 0.04]) {
          rooms.textiles.push({ matrix: local(p, fx * p.w + side * 0.6, wy, lz, 0, 0.22, 1.2, 0.03), color: curtain });
        }
      }
    }
    const table = furniture(p).find((f) => f.kind === 'table');
    if (table) rooms.textiles.push({ matrix: local(p, table.lx, floor + 0.01, table.lz, 0, 1.8, 0.01, 1.5), color: new THREE.Color(0xb8925a) });
    rooms.pictures.push({ matrix: local(p, 0, floor + 1.75, -hd + 0.01, 0, 0.5, 0.4), color: new THREE.Color(FRAMES[Math.floor(rnd() * FRAMES.length)]) });
  }
  rooms.lamps.push({ matrix: local(p, 0, roomCeiling(p) - 0.02, 0, 0, p.type === 'hall' ? 1.2 : 0.5, 0.04, p.type === 'hall' ? 0.3 : 0.5) });
}

function buildings(group: THREE.Group, windowMat: THREE.MeshBasicMaterial, paneMat: THREE.MeshBasicMaterial): void {
  const rnd = mulberry32(99);
  const plans = [...HOUSES, HALL_PLAN];
  const walls: Instance[] = [];
  const metalRoofs: Instance[] = [];
  const thatchRoofs: Instance[] = [];
  const plinths: Instance[] = [];
  const trims: Instance[] = [];
  const stilts: Instance[] = [];
  const slabs: Instance[] = [];
  const windows: Instance[] = [];
  const panes: Instance[] = [];
  const steps: Instance[] = [];
  const rooms: Rooms = { furnishings: [], lamps: [], pictures: [], textiles: [] };
  const sills: Instance[] = [];
  const doors: Instance[] = [];
  const fencePosts: Instance[] = [];
  const fenceRails: Instance[] = [];

  plans.forEach((p, i) => {
    const top = p.floorY + p.h;
    const nipa = p.type === 'nipa';
    const columns = p.type === 'hall' ? [-0.38, -0.2, 0.2, 0.38] : [-0.28, 0.28];
    roomShell(p, walls, trims, panes, columns);
    furnish(p, rooms, rnd);
    (nipa ? thatchRoofs : metalRoofs).push({
      matrix: local(p, 0, top + 0.02, 0, 0, p.w + 0.8, p.roofH, p.d + 0.8),
      color: new THREE.Color(p.roof),
    });
    // A slightly proud plinth at the foot of the wall and a fascia band under the eaves give the boxes depth.
    if (!nipa && p.type !== 'hall') {
      plinths.push({ matrix: local(p, 0, (p.baseY + p.floorY + 0.15) / 2, 0, 0, p.w + 0.12, p.floorY + 0.15 - p.baseY, p.d + 0.12) });
      trims.push({ matrix: local(p, 0, top - 0.1, 0, 0, p.w + 0.1, 0.2, p.d + 0.1), color: new THREE.Color(p.wall).multiplyScalar(0.8) });
    }

    if (nipa) {
      slabs.push({ matrix: local(p, 0, p.floorY - 0.08, 0.3, 0, p.w + 0.6, 0.16, p.d + 1.2) });
      for (const sx of [-1, 0, 1]) {
        for (const sz of [-1, 1]) {
          const lx = (sx * p.w) / 2;
          const lz = (sz * p.d) / 2 + (sz > 0 ? 0.5 : 0);
          const wp = new THREE.Vector3(lx, 0, lz).applyAxisAngle(UP, p.rot);
          const g = groundHeight(p.x + wp.x, p.z + wp.z) - 0.3;
          stilts.push({ matrix: local(p, lx, (g + p.floorY) / 2, lz, 0, 1, p.floorY - g, 1) });
        }
      }
    }

    // Windows: lit at random so the street looks lived-in at night; each gets a sill.
    const lit = (): THREE.Color => new THREE.Color().setScalar(rnd() < 0.72 ? 0.65 + rnd() * 0.35 : 0.08);
    const wy = p.floorY + 1.45;
    const ww = nipa ? 0.9 : 1.0;
    const addWindow = (lx: number, y: number, lz: number, ry: number, w: number, h: number) => {
      windows.push({ matrix: local(p, lx, y, lz, ry, w, h), color: lit() });
      const out = new THREE.Vector3(0, 0, 0.06).applyAxisAngle(UP, ry);
      sills.push({ matrix: local(p, lx + out.x, y - h / 2 - 0.04, lz + out.z, ry, w + 0.16, 0.07, 0.14) });
    };
    for (const fx of columns) {
      addWindow(fx * p.w, wy, p.d / 2 + 0.02, 0, ww, 0.9);
      addWindow(fx * p.w, wy, -p.d / 2 - 0.02, Math.PI, ww, 0.9);
    }
    for (const side of [-1, 1]) addWindow(side * (p.w / 2 + 0.02), wy, 0, (side * Math.PI) / 2, ww, 0.9);
    if (p.type === 'twoStorey') {
      for (const fx of [-0.3, 0, 0.3]) addWindow(fx * p.w, p.floorY + 4.2, p.d / 2 + 0.02, 0, 1.1, 1.0);
      slabs.push({ matrix: local(p, 0, p.floorY + 2.9, p.d / 2 + 0.5, 0, p.w * 0.6, 0.12, 1.0) });
    }
    // The hall's doorway stays open so evacuees (and the captain) can walk in.
    // Homes: the door leaf stands open against the inside wall. The hall's doorway has no door.
    if (p.type !== 'hall') doors.push({ matrix: local(p, -doorHalf(p) + 0.03, roomFloor(p) + 1.0, p.d / 2 - WALL_T - 0.47, Math.PI / 2, 0.92, 2.0) });
    // Nipa houses: bamboo steps from the ground up to the porch.
    if (nipa) {
      const st = frontSteps(p);
      const n = 6;
      for (let k = 0; k < n; k++) {
        const lz = st.start + ((k + 0.5) / n) * st.length;
        const wp = new THREE.Vector3(0, 0, lz).applyAxisAngle(UP, p.rot);
        const g = groundHeight(p.x + wp.x, p.z + wp.z);
        const y = p.floorY + (g - p.floorY) * ((k + 0.5) / n);
        steps.push({ matrix: local(p, 0, y - 0.04, lz, 0, st.halfW * 2, 0.08, st.length / n - 0.06) });
      }
    }
    trims.push({ matrix: local(p, 0, p.floorY + 2.08, p.d / 2 + 0.06, 0, (p.type === 'hall' ? 2.2 : 0.9) + 0.2, 0.12, 0.1), color: new THREE.Color(0x6b4a2e) });

    // Bamboo fences in front of some homes, with a gate gap at the door.
    if (p.type === 'concrete' && i % 2 === 0) {
      const fz = p.d / 2 + 1.0;
      const xs: number[] = [];
      for (let x = -p.w / 2 - 0.8; x <= p.w / 2 + 0.8; x += 1) if (Math.abs(x) > 0.7) xs.push(x);
      xs.forEach((x, k) => {
        const wp = new THREE.Vector3(x, 0, fz).applyAxisAngle(UP, p.rot);
        const g = groundHeight(p.x + wp.x, p.z + wp.z);
        fencePosts.push({ matrix: local(p, x, g + 0.55, fz, 0, 1, 1.1, 1) });
        const nx = xs[k + 1];
        if (nx !== undefined && nx - x < 1.01) {
          for (const h of [0.4, 0.85]) fenceRails.push({ matrix: local(p, x + 0.5, g + h, fz, 0, 1, 1, 1) });
        }
      });
    }
  });

  const plaster = plasterSurface();
  const metal = corrugatedSurface();
  const thatch = thatchSurface();
  const concrete = concreteSurface();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);
  const roofGeo = gableRoof();
  const bamboo = pbr({ color: 0xa88f55, roughness: 0.7 });
  group.add(
    instanced(box, pbr({ map: plaster.map, normalMap: plaster.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) }), walls),
    instanced(roofGeo, pbr({ map: metal.map, normalMap: metal.normalMap, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }), metalRoofs),
    instanced(roofGeo, pbr({ map: thatch.map, normalMap: thatch.normalMap, normalScale: new THREE.Vector2(1.5, 1.5), side: THREE.DoubleSide }), thatchRoofs),
    instanced(box, pbr({ color: 0x8f8a80, map: concrete.map, normalMap: concrete.normalMap }), plinths),
    instanced(box, pbr({ roughness: 0.8 }), trims),
    instanced(new THREE.CylinderGeometry(0.09, 0.1, 1, 8), pbr({ color: 0x6b5634 }), stilts),
    instanced(box, pbr({ color: 0x8a7650 }), slabs),
    instanced(plane, windowMat, windows, false),
    instanced(plane, paneMat, panes, false),
    instanced(box, pbr({ roughness: 0.95 }), rooms.textiles, false),
    instanced(box, pbr({ color: 0xd8d2c4 }), sills),
    instanced(plane, pbr({ color: 0x5b3a22, roughness: 0.6, side: THREE.DoubleSide }), doors, false),
    instanced(box, bamboo, steps),
    instanced(box, pbr({ roughness: 0.65 }), rooms.furnishings),
    instanced(box, new THREE.MeshBasicMaterial({ color: 0xfff1d6 }), rooms.lamps, false),
    instanced(plane, pbr({ roughness: 0.5 }), rooms.pictures, false),
    instanced(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), bamboo, fencePosts),
    instanced(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).rotateZ(Math.PI / 2), bamboo, fenceRails),
  );
}

function hallSign(): THREE.Mesh {
  const tex = canvasTexture(1024, 128, (ctx) => {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 1012, 116);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BARANGAY HALL • EVACUATION CENTER', 512, 66);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.1), pbr({ map: tex, roughness: 0.6 }));
  sign.applyMatrix4(local(HALL_PLAN, 0, HALL_PLAN.floorY + 3.3, HALL.d / 2 + 0.04, 0, 1, 1));
  return sign;
}

function pad(x: number, z: number, w: number, d: number, top: number, bottom: number, color: number): THREE.Mesh {
  const c = concreteSurface();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, top - bottom, d), pbr({ color, map: c.map, normalMap: c.normalMap }));
  m.position.set(x, (top + bottom) / 2, z);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

/** Concrete steps from the evacuation lane up onto the hall's raised pad. */
function hallStairs(): THREE.Mesh {
  const { x, width, z0, z1 } = HALL_STAIRS;
  const bottom = groundHeight(x, z0) - 0.1;
  const rise = HALL_PAD.top - bottom;
  const steps = Math.max(2, Math.ceil(rise / 0.18));
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < steps; i++) {
    const h = (rise * (i + 1)) / steps;
    const zs = z0 + ((z1 - z0) * i) / steps;
    const g = new THREE.BoxGeometry(width, h + 0.4, z1 - zs);
    g.translate(x, bottom + h / 2 - 0.2, (zs + z1) / 2);
    geos.push(g);
  }
  const c = concreteSurface();
  const mesh = new THREE.Mesh(merge(geos), pbr({ color: 0xb8b3a7, map: c.map, normalMap: c.normalMap }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function court(): THREE.Group {
  const g = new THREE.Group();
  const { top, bottom } = COURT_PAD;
  g.add(pad(COURT.x, COURT.z, COURT.w + 1, COURT.d + 1, top, bottom, 0x9d9a92));
  const tex = canvasTexture(560, 300, (ctx) => {
    ctx.fillStyle = '#2f6f9f';
    ctx.fillRect(0, 0, 560, 300);
    ctx.fillStyle = '#c0533a';
    ctx.fillRect(0, 105, 90, 90);
    ctx.fillRect(470, 105, 90, 90);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 552, 292);
    ctx.beginPath();
    ctx.moveTo(280, 4);
    ctx.lineTo(280, 296);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(280, 150, 36, 0, Math.PI * 2);
    ctx.stroke();
    for (const [cx, dir] of [[4, 1], [556, -1]] as const) {
      ctx.strokeRect(dir > 0 ? cx : cx - 90, 105, 90, 90);
      ctx.beginPath();
      ctx.arc(cx, 150, 128, -Math.PI / 2, Math.PI / 2, dir < 0);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BRGY. SAN ROQUE', 280, 40);
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(COURT.w, COURT.d), pbr({ map: tex, roughness: 0.55 }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(COURT.x, top + 0.01, COURT.z);
  surface.receiveShadow = true;
  g.add(surface);

  const steel = pbr({ color: 0x5d646b, metalness: 0.6, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const x = COURT.x + side * (COURT.w / 2 + 0.3);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 12), steel);
    post.position.set(x, top + 1.8, COURT.z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.05, 1.8), pbr({ color: 0xf5f5f5, roughness: 0.4 }));
    board.position.set(x - side * 0.35, top + 3.35, COURT.z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 24), pbr({ color: 0xff6a00, metalness: 0.5, roughness: 0.4 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x - side * 0.62, top + 3.05, COURT.z);
    post.castShadow = board.castShadow = true;
    g.add(post, board, rim);
  }
  return g;
}

/** Coconut palms (riverbanks + yards) and banana clumps, all instanced. */
function trees(): THREE.Group {
  const rnd = mulberry32(42);
  type Tree = { x: number; z: number; coconut: boolean; h: number; q: THREE.Quaternion; s: number; yaw: number };
  const list: Tree[] = [];
  for (let tries = 0; list.length < 80 && tries < 5000; tries++) {
    const coconut = list.length < 52;
    const x = (rnd() * 2 - 1) * 95;
    let z = -95 + rnd() * 180;
    if (coconut && rnd() < 0.5) z = riverZ(x) + (rnd() < 0.6 ? 1 : -1) * (11.5 + rnd() * 4);
    if (!isOpenGround(x, z, coconut ? 1.2 : 1.0)) continue;
    if (list.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 6.25)) continue;
    const tilt = coconut ? rnd() * 0.25 : rnd() * 0.06;
    const dir = rnd() * Math.PI * 2;
    list.push({
      x,
      z,
      coconut,
      h: coconut ? 7 + rnd() * 4 : 2 + rnd(),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * Math.cos(dir), 0, tilt * Math.sin(dir))),
      s: coconut ? 1 : 1.6,
      yaw: rnd() * Math.PI * 2,
    });
  }

  const palmTrunks: Instance[] = [];
  const bananaTrunks: Instance[] = [];
  const palms: Instance[] = [];
  const bananas: Instance[] = [];
  for (const t of list) {
    const base = new THREE.Vector3(t.x, groundHeight(t.x, t.z) - 0.2, t.z);
    (t.coconut ? palmTrunks : bananaTrunks).push({ matrix: new THREE.Matrix4().compose(base, t.q, new THREE.Vector3(t.s, t.h, t.s)) });
    const crownPos = new THREE.Vector3(0, t.h, 0).applyQuaternion(t.q).add(base);
    const crownQ = t.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(UP, t.yaw));
    const sc = 0.85 + (t.h % 1) * 0.3;
    (t.coconut ? palms : bananas).push({ matrix: new THREE.Matrix4().compose(crownPos, crownQ, new THREE.Vector3(sc, sc, sc)) });
  }
  // Trunks taper and flare slightly at the base.
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 1, 12, 8);
  trunkGeo.translate(0, 0.5, 0);
  const tp = trunkGeo.getAttribute('position');
  for (let i = 0; i < tp.count; i++) {
    const flare = 1 + Math.max(0, 0.12 - tp.getY(i)) * 3;
    tp.setX(i, tp.getX(i) * flare);
    tp.setZ(i, tp.getZ(i) * flare);
  }
  trunkGeo.computeVertexNormals();
  const bark = barkSurface();
  const leafMat = (map: THREE.Texture) => pbr({ vertexColors: true, map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
  const g = new THREE.Group();
  g.add(
    instanced(trunkGeo, pbr({ color: 0x8a7458, map: bark.map, normalMap: bark.normalMap }), palmTrunks),
    instanced(trunkGeo, pbr({ color: 0x6f7f3a, roughness: 0.7 }), bananaTrunks),
    instanced(palmCrown(), leafMat(palmLeafTexture()), palms),
    instanced(bananaCrown(), leafMat(bananaLeafTexture()), bananas),
  );
  g.traverse((o) => (o.userData.noAO = true)); // alpha-cut cards would show as solid quads in the AO pass
  return g;
}

export function createVillage(): Village {
  const group = new THREE.Group();
  const windowMat = new THREE.MeshBasicMaterial({ color: DAY_GLASS.clone() });
  group.add(pad(HALL.x, HALL.z, HALL.w + 4, HALL.d + 4, HALL_PAD.top, HALL_PAD.bottom, 0xb5b1a6), hallStairs(), hallSign(), court(), trees());
  const paneMat = new THREE.MeshBasicMaterial({ color: DAY_VIEW.clone() });
  buildings(group, windowMat, paneMat);
  return {
    group,
    update(night: number) {
      // Above 1.0 so lit windows feed the bloom pass after dark.
      windowMat.color.lerpColors(DAY_GLASS, WARM, night).multiplyScalar(1 + night * 1.6);
      paneMat.color.lerpColors(DAY_VIEW, NIGHT_VIEW, night);
    },
  };
}
