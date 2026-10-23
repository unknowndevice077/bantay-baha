/**
 * Street lighting that switches on at dusk (photocell). Lamps hang off the
 * utility poles along the main road (as in most barangays) and on standalone
 * posts along the lanes, the evacuation route, the bridge and the hall.
 * Each lamp has an emissive head (feeds bloom) and a soft light pool on the
 * ground; a fixed pool of real point lights follows the lamps nearest the
 * camera so the cost stays constant however many lamps there are.
 */
import * as THREE from 'three';
import { EVAC_LANE_X, ROAD_Z } from '../config';
import { smoothstep } from '../util';
import { BRIDGE, deckTop } from './infrastructure';
import { ASSEMBLY, HALL_PAD, HALL_STAIRS } from './layout';
import { baseHeight } from './terrain';
import { glowPoolTexture } from './textures';

const LAMP_COLOR = 0xffc98a;
const REAL_LIGHTS = 8;
const POOL_RADIUS = 5.5;

interface Lamp {
  /** Light-emitting head position. */
  head: THREE.Vector3;
  /** Ground point under the head. */
  ground: THREE.Vector3;
}

/** Utility poles carrying a lamp arm (x along the main road; these poles already exist). */
const UTILITY_POLES = [-84, -68, -52, -36, -16, 6, 26, 44, 62, 80];

function layoutLamps(): { lamps: Lamp[]; posts: THREE.Vector3[] } {
  const lamps: Lamp[] = [];
  const posts: THREE.Vector3[] = [];
  const lamp = (hx: number, hy: number, hz: number, gy: number) =>
    lamps.push({ head: new THREE.Vector3(hx, hy, hz), ground: new THREE.Vector3(hx, gy, hz) });

  // Arms on the utility poles, reaching over the main road.
  const poleZ = ROAD_Z + 3.4;
  for (const x of UTILITY_POLES) {
    const g = baseHeight(x, poleZ);
    lamp(x, g + 6.6, poleZ - 1.7, baseHeight(x, poleZ - 1.7) + 0.09);
  }

  // Standalone 5 m posts: lanes, evacuation lane, near the hall stairs.
  const post = (x: number, z: number, armDx: number, armDz: number, y = baseHeight(x, z)) => {
    posts.push(new THREE.Vector3(x, y, z));
    lamp(x + armDx, y + 5, z + armDz, baseHeight(x + armDx, z + armDz) + 0.06);
  };
  for (const x of [-60, -24, 24, 60]) post(x, 35.4, 0, -1);
  for (const x of [-30, 30]) post(x, 51.4, 0, -1);
  for (const z of [28, 42]) post(EVAC_LANE_X + 1.6, z, -1.1, 0);
  post(HALL_STAIRS.x + HALL_STAIRS.width / 2 + 0.6, ASSEMBLY.z, -1.2, 0);
  post(HALL_STAIRS.x - HALL_STAIRS.width / 2 - 0.6, HALL_STAIRS.z1 + 0.6, 1.2, 0, HALL_PAD.top);

  // Bridge: posts on the railing at the quarter points.
  for (const dz of [-8, 8]) {
    const z = BRIDGE.zc + dz;
    const y = deckTop(z);
    posts.push(new THREE.Vector3(BRIDGE.x + BRIDGE.width / 2 - 0.1, y, z));
    lamps.push({ head: new THREE.Vector3(BRIDGE.x + 1.2, y + 5, z), ground: new THREE.Vector3(BRIDGE.x + 1.2, y + 0.04, z) });
  }
  return { lamps, posts };
}

export class StreetLights {
  readonly group = new THREE.Group();
  private readonly lamps: Lamp[];
  private readonly lights: THREE.PointLight[] = [];
  private readonly headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: LAMP_COLOR, emissiveIntensity: 0 });
  private readonly poolMat = new THREE.MeshBasicMaterial({
    map: glowPoolTexture(),
    color: LAMP_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  private assignTimer = 0;

  constructor() {
    const { lamps, posts } = layoutLamps();
    this.lamps = lamps;
    const m = new THREE.Matrix4();
    const steel = new THREE.MeshStandardMaterial({ color: 0x8c949b, metalness: 0.6, roughness: 0.45 });

    // Posts and arms (arms run from the post/pole top out to the head).
    const postGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 10);
    postGeo.translate(0, 0.5, 0);
    const postMesh = new THREE.InstancedMesh(postGeo, steel, posts.length);
    posts.forEach((p, i) => postMesh.setMatrixAt(i, m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 5.1, 1))));
    const armMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), steel, lamps.length);
    const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.12, 0.25), this.headMat, lamps.length);
    const poolMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(POOL_RADIUS, 32).rotateX(-Math.PI / 2), this.poolMat, lamps.length);
    const up = new THREE.Vector3(0, 1, 0);
    lamps.forEach((l, i) => {
      // Arm from the nearest post/pole top to the head: approximate the root as 1.6 m back toward the support.
      const root = this.armRoot(l, posts);
      const dir = l.head.clone().sub(root);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
      armMesh.setMatrixAt(i, m.compose(root.clone().lerp(l.head, 0.5), q, new THREE.Vector3(1, len, 1)));
      const yaw = Math.atan2(dir.x, dir.z);
      headMesh.setMatrixAt(
        i,
        m.compose(l.head, new THREE.Quaternion().setFromAxisAngle(up, yaw + Math.PI / 2), new THREE.Vector3(1, 1, 1)),
      );
      poolMesh.setMatrixAt(i, m.makeTranslation(l.ground.x, l.ground.y, l.ground.z));
    });
    postMesh.castShadow = armMesh.castShadow = headMesh.castShadow = true;
    poolMesh.userData.noAO = true;
    poolMesh.renderOrder = 2;
    this.group.add(postMesh, armMesh, headMesh, poolMesh);

    for (let i = 0; i < REAL_LIGHTS; i++) {
      const light = new THREE.PointLight(LAMP_COLOR, 0, 22, 2);
      this.lights.push(light);
      this.group.add(light);
    }
  }

  /** Where a lamp's arm attaches: the standalone post it belongs to, or its utility pole. */
  private armRoot(l: Lamp, posts: THREE.Vector3[]): THREE.Vector3 {
    let best: THREE.Vector3 | null = null;
    for (const p of posts) {
      if (Math.hypot(p.x - l.head.x, p.z - l.head.z) < 1.8 && (!best || p.distanceTo(l.head) < best.distanceTo(l.head))) best = p;
    }
    if (best) return new THREE.Vector3(best.x, best.y + 5.05, best.z);
    return new THREE.Vector3(l.head.x, l.head.y + 0.35, l.head.z + 1.7); // utility pole side of the road
  }

  /** @param night 0..1 darkness from the sky (photocell) */
  update(dt: number, night: number, camera: THREE.Camera): void {
    const on = smoothstep(0.35, 0.7, night);
    this.headMat.emissiveIntensity = on * 6;
    this.poolMat.opacity = on * 0.55;
    this.assignTimer -= dt;
    if (this.assignTimer <= 0) {
      this.assignTimer = 0.4;
      const cam = camera.position;
      const nearest = [...this.lamps].sort((a, b) => a.head.distanceToSquared(cam) - b.head.distanceToSquared(cam));
      this.lights.forEach((light, i) => light.position.copy(nearest[i].head).add(new THREE.Vector3(0, -0.2, 0)));
    }
    for (const light of this.lights) light.intensity = on * 55;
  }
}
