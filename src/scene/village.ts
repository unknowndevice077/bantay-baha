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
import { COURT_PAD, HALL_PAD, HALL_PLAN, HALL_STAIRS, HOUSES, type HousePlan, isOpenGround } from './layout';
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

function buildings(group: THREE.Group, windowMat: THREE.MeshBasicMaterial): void {
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
  const sills: Instance[] = [];
  const doors: Instance[] = [];
  const fencePosts: Instance[] = [];
  const fenceRails: Instance[] = [];

  plans.forEach((p, i) => {
    const top = p.floorY + p.h;
    const nipa = p.type === 'nipa';
    walls.push({ matrix: local(p, 0, (p.baseY + top) / 2, 0, 0, p.w, top - p.baseY, p.d), color: new THREE.Color(p.wall) });
    (nipa ? thatchRoofs : metalRoofs).push({
      matrix: local(p, 0, top + 0.02, 0, 0, p.w + 0.8, p.roofH, p.d + 0.8),
      color: new THREE.Color(p.roof),
    });
    // A slightly proud plinth at the foot of the wall and a fascia band under the eaves give the boxes depth.
    if (!nipa) {
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
    const columns = p.type === 'hall' ? [-0.38, -0.2, 0.2, 0.38] : [-0.28, 0.28];
    for (const fx of columns) {
      addWindow(fx * p.w, wy, p.d / 2 + 0.02, 0, ww, 0.9);
      addWindow(fx * p.w, wy, -p.d / 2 - 0.02, Math.PI, ww, 0.9);
    }
    for (const side of [-1, 1]) addWindow(side * (p.w / 2 + 0.02), wy, 0, (side * Math.PI) / 2, ww, 0.9);
    if (p.type === 'twoStorey') {
      for (const fx of [-0.3, 0, 0.3]) addWindow(fx * p.w, p.floorY + 4.2, p.d / 2 + 0.02, 0, 1.1, 1.0);
      slabs.push({ matrix: local(p, 0, p.floorY + 2.9, p.d / 2 + 0.5, 0, p.w * 0.6, 0.12, 1.0) });
    }
    doors.push({ matrix: local(p, 0, p.floorY + 1.0, p.d / 2 + 0.03, 0, p.type === 'hall' ? 2.2 : 0.9, 2.0) });
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
    instanced(box, pbr({ color: 0xd8d2c4 }), sills),
    instanced(plane, pbr({ color: 0x5b3a22, roughness: 0.6 }), doors, false),
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
    ctx.fillText('BRGY. BANTAY', 280, 40);
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
  buildings(group, windowMat);
  return {
    group,
    update(night: number) {
      // Above 1.0 so lit windows feed the bloom pass after dark.
      windowMat.color.lerpColors(DAY_GLASS, WARM, night).multiplyScalar(1 + night * 1.6);
    },
  };
}
