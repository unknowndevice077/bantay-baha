/**
 * Everything beyond the 200 m play area, so the barangay doesn't end at a cliff
 * edge: the same land continued outward at low resolution, rising into
 * forested hills, a few thousand low-poly trees, and the creek running on to
 * the horizon. Fog does the rest.
 */
import * as THREE from 'three';
import { BED_Y, WORLD_SIZE, riverZ } from '../config';
import { colorize, merge, mulberry32, smoothstep } from '../util';
import { baseHeight } from './terrain';

const EXTENT = 900;
const CELL = 12;
/** The far land tucks under the play area's edge so there is never a seam gap. */
const TUCK = 6;
const SINK = 0.35;

/** Play-area land continued outward, with ridges growing in with distance. */
function farHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const ridge = smoothstep(140, 520, edge);
  const n =
    Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013) + 0.5 * Math.sin(x * 0.027 - z * 0.019) + 0.25 * Math.sin(x * 0.061 + z * 0.047);
  const land = Math.min(baseHeight(x, z), 45);
  return land + ridge * (40 + n * 32) - SINK;
}

function farLand(): THREE.Mesh {
  const n = Math.round((EXTENT * 2) / CELL);
  const half = WORLD_SIZE / 2 - TUCK;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const near = new THREE.Color(0x3d6123);
  const forest = new THREE.Color(0x2c4a22);
  const bank = new THREE.Color(0x6b5a3e);
  const c = new THREE.Color();
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -EXTENT + i * CELL;
      const z = -EXTENT + j * CELL;
      pos.push(x, farHeight(x, z), z);
      const edge = Math.max(Math.abs(x), Math.abs(z));
      c.lerpColors(near, forest, smoothstep(110, 320, edge));
      if (Math.abs(z - riverZ(x)) < 13) c.lerp(bank, 0.6);
      col.push(c.r, c.g, c.b);
    }
  }
  const at = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -EXTENT + i * CELL;
      const z0 = -EXTENT + j * CELL;
      // Skip cells wholly inside the play area (its own terrain covers them).
      if (x0 >= -half && x0 + CELL <= half && z0 >= -half && z0 + CELL <= half) continue;
      idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = false;
  return mesh;
}

/** A low-poly broadleaf / palm silhouette: dense enough at a distance, cheap up close. */
function treeGeometry(): THREE.BufferGeometry {
  const trunk = colorize(new THREE.CylinderGeometry(0.25, 0.35, 4, 5).translate(0, 2, 0).toNonIndexed(), 0x5a4630);
  const crown = colorize(new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.85, 1).translate(0, 5.2, 0), 0x355b26);
  return merge([trunk, crown]);
}

function farTrees(): THREE.InstancedMesh {
  const rnd = mulberry32(7);
  const half = WORLD_SIZE / 2;
  const items: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  for (let tries = 0; items.length < 2600 && tries < 20000; tries++) {
    const x = (rnd() * 2 - 1) * 420;
    const z = (rnd() * 2 - 1) * 420;
    // Start well past the play area so the simple silhouettes only ever appear through haze.
    if (Math.abs(x) < half + 28 && Math.abs(z) < half + 28) continue;
    if (Math.abs(z - riverZ(x)) < 15) continue;
    // Thicker forest farther out; scattered trees near the barangay.
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (rnd() > 0.35 + smoothstep(110, 260, edge) * 0.65) continue;
    const s = 0.8 + rnd() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    items.push(
      new THREE.Matrix4().compose(new THREE.Vector3(x, farHeight(x, z) - 0.2, z), q, new THREE.Vector3(s, s * (0.8 + rnd() * 0.5), s)),
    );
  }
  const mesh = new THREE.InstancedMesh(
    treeGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }),
    items.length,
  );
  const tint = new THREE.Color();
  items.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    // Mixed canopy: some trees lighter, some olive, some deep green.
    mesh.setColorAt(i, tint.setHSL(0.24 + rnd() * 0.08, 0.3 + rnd() * 0.25, 0.6 + rnd() * 0.3));
  });
  mesh.userData.noAO = true;
  return mesh;
}

/** The creek beyond the play area: a flat ribbon at the current water level. */
function farCreek(): THREE.Mesh {
  const pts: number[] = [];
  const idx: number[] = [];
  const half = WORLD_SIZE / 2 - TUCK;
  let k = 0;
  for (const side of [-1, 1]) {
    for (let x = half; x <= EXTENT; x += 8) {
      const wx = side * x;
      const rz = riverZ(wx);
      pts.push(wx, 0, rz - 12, wx, 0, rz + 12);
      if (x > half) {
        const a = k - 2;
        idx.push(a, a + 1, k, k, a + 1, k + 1);
      }
      k += 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x3a5560, roughness: 0.45, envMapIntensity: 0.35, side: THREE.DoubleSide }),
  );
}

export class Surroundings {
  readonly group = new THREE.Group();
  private readonly creek = farCreek();
  private readonly creekMat = this.creek.material as THREE.MeshStandardMaterial;
  private readonly clear = new THREE.Color(0x3a5560);
  private readonly muddy = new THREE.Color(0x6b5a40);

  constructor() {
    this.group.add(farLand(), farTrees(), this.creek);
  }

  /** @param levelY world height of the water @param mud 0..1 turbidity, matching the creek in the play area */
  update(levelY: number, mud: number): void {
    // Never below the far bed; out there the creek stays bank-full rather than flooding land we never drew detail for.
    this.creek.position.y = Math.min(Math.max(levelY, BED_Y + 0.5), 0.3);
    this.creekMat.color.lerpColors(this.clear, this.muddy, mud);
  }
}
