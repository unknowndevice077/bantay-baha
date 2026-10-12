/**
 * Instanced grass clumps (three crossed alpha-cut cards each) scattered over
 * open ground, swaying in the wind; gusts strengthen with rainfall.
 */
import * as THREE from 'three';
import { WORLD_SIZE } from '../config';
import { merge, mulberry32 } from '../util';
import { isOpenGround } from './layout';
import { groundHeight } from './terrain';
import { grassTexture } from './textures';

const COUNT = 16000;

export class Grass {
  readonly mesh: THREE.InstancedMesh;
  private readonly uTime = { value: 0 };
  private readonly uWind = { value: 0.3 };

  constructor() {
    const cards = [0, 1, 2].map((i) => {
      const p = new THREE.PlaneGeometry(1, 1);
      p.translate(0, 0.5, 0);
      p.rotateY((i * Math.PI) / 3);
      return p;
    });
    const geo = merge(cards);
    // Blade normals point up so clumps light like a soft lawn rather than flat cards.
    const n = geo.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);

    const mat = new THREE.MeshStandardMaterial({
      map: grassTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.uniforms.uWind = this.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec2 rootXZ = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
          float gust = sin(uTime * 1.6 + rootXZ.x * 0.15 + rootXZ.y * 0.1) * 0.6 + sin(uTime * 3.7 + rootXZ.x * 0.7) * 0.4;
          transformed.x += gust * uWind * position.y * position.y;
          transformed.z += gust * uWind * 0.4 * position.y * position.y;`,
        );
    };

    const rnd = mulberry32(57);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const dry = new THREE.Color(0xb3b062);
    const lush = new THREE.Color(0x4f8a2e);
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    let placed = 0;
    for (let tries = 0; placed < COUNT && tries < COUNT * 4; tries++) {
      const x = (rnd() - 0.5) * (WORLD_SIZE - 4);
      const z = (rnd() - 0.5) * (WORLD_SIZE - 4);
      if (!isOpenGround(x, z, 0.4)) continue;
      const h = 0.35 + rnd() * 0.45;
      p.set(x, groundHeight(x, z) - 0.02, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      s.set(h * 1.3, h, h * 1.3);
      this.mesh.setMatrixAt(placed, m.compose(p, q, s));
      this.mesh.setColorAt(placed, c.lerpColors(lush, dry, rnd() * 0.5));
      placed++;
    }
    this.mesh.count = placed;
    this.mesh.receiveShadow = true;
    this.mesh.userData.noAO = true;
  }

  /** @param rain mm/hr */
  update(dt: number, rain: number): void {
    this.uTime.value += dt;
    this.uWind.value = 0.15 + (rain / 100) * 0.45;
  }
}
