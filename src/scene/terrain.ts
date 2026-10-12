/** Procedural terrain: riverbed, sloped banks, concrete canal cut, and a height texture for the water shader. */
import * as THREE from 'three';
import { BED_Y, CANAL, WORLD_SIZE, riverZ } from '../config';
import { lerp, smoothstep } from '../util';
import { groundSurface } from './textures';

const HEIGHT_RES = 256;

/** Gentle rolling variation so the land doesn't look machine-flat. */
function undulation(x: number, z: number): number {
  return Math.sin(x * 0.13 + z * 0.07) * 0.08 + Math.sin(x * 0.051 - z * 0.11) * 0.1 + Math.sin(x * 0.31 + z * 0.27) * 0.03;
}

/**
 * Natural ground height: riverbed, smooth banks, then land rising toward
 * higher ground on both sides (the barangay sits on the south side, z > 0).
 */
export function baseHeight(x: number, z: number): number {
  const d = z - riverZ(x);
  const a = Math.abs(d);
  if (a < 7) return BED_Y + (a / 7) ** 2 * 0.4;
  if (a < 13) return BED_Y + 0.4 + smoothstep(7, 13, a) * 2.4;
  const r = a - 13;
  const n = undulation(x, z) * Math.min(1, r / 4);
  if (d > 0) return 0.6 + Math.min(r, 32) * 0.05 + Math.max(0, r - 32) * 0.09 + n;
  return 0.6 + r * 0.07 + Math.max(0, r - 25) * 0.12 + n;
}

/** 0..1 weight of the concrete drainage canal cut at (x, z). */
function canalWeight(x: number, z: number): number {
  const rz = riverZ(x);
  if (z > CANAL.zEnd || z < rz + 8) return 0;
  const across = smoothstep(CANAL.halfW + 0.4, CANAL.halfW, Math.abs(x - CANAL.x));
  return across * smoothstep(CANAL.zEnd, CANAL.zEnd - 1.5, z) * smoothstep(rz + 8, rz + 10, z);
}

/** Canal floor height; it drains downhill into the river. */
export function canalFloor(z: number): number {
  return Math.max(BED_Y + 0.6, baseHeight(CANAL.x, z) - CANAL.depth);
}

/** Ground height including the canal: what water and walkers actually meet. */
export function groundHeight(x: number, z: number): number {
  const h = baseHeight(x, z);
  const w = canalWeight(x, z);
  return w > 0 ? Math.min(h, lerp(h, canalFloor(z), w)) : h;
}

export function createTerrain(): { mesh: THREE.Mesh; heightTexture: THREE.DataTexture } {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const mud = new THREE.Color(0x4f4031);
  const sand = new THREE.Color(0x8c7b55);
  const grassA = new THREE.Color(0x4a7428);
  const grassB = new THREE.Color(0x77913c);
  const concrete = new THREE.Color(0x8d8b84);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    const a = Math.abs(z - riverZ(x));
    if (canalWeight(x, z) > 0.2) c.copy(concrete);
    else if (a < 13.5) c.lerpColors(mud, sand, smoothstep(8, 11.5, a)).lerp(grassA, smoothstep(11.5, 13.5, a));
    else c.lerpColors(grassA, grassB, smoothstep(-0.15, 0.15, undulation(x * 1.7, z * 1.3)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const detail = groundSurface();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: detail.map, normalMap: detail.normalMap, roughness: 0.95 }),
  );
  mesh.receiveShadow = true;

  // Half-float heightfield (filterable in WebGL2) so the water shader knows local depth for foam + edges.
  const data = new Uint16Array(HEIGHT_RES * HEIGHT_RES);
  for (let j = 0; j < HEIGHT_RES; j++) {
    for (let i = 0; i < HEIGHT_RES; i++) {
      const x = ((i + 0.5) / HEIGHT_RES - 0.5) * WORLD_SIZE;
      const z = ((j + 0.5) / HEIGHT_RES - 0.5) * WORLD_SIZE;
      data[j * HEIGHT_RES + i] = THREE.DataUtils.toHalfFloat(groundHeight(x, z));
    }
  }
  const heightTexture = new THREE.DataTexture(data, HEIGHT_RES, HEIGHT_RES, THREE.RedFormat, THREE.HalfFloatType);
  heightTexture.magFilter = THREE.LinearFilter;
  heightTexture.minFilter = THREE.LinearFilter;
  heightTexture.needsUpdate = true;
  return { mesh, heightTexture };
}
