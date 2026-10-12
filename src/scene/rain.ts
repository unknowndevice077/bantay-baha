/**
 * GPU-instanced rain: every streak is an instance whose fall is computed in the
 * vertex shader, wrapped in a box that follows the camera. Zero per-frame CPU cost.
 */
import * as THREE from 'three';

const MAX_DROPS = 14000;
const BOX = { w: 80, h: 40 };

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform float uWind;
attribute vec3 aOffset;
attribute float aSpeed;
varying float vT;
void main() {
  float fall = uTime * aSpeed;
  vec3 p;
  p.x = uCenter.x + mod(aOffset.x - uCenter.x + uWind * fall * 0.04, ${BOX.w}.0) - ${BOX.w / 2}.0;
  p.z = uCenter.z + mod(aOffset.z - uCenter.z, ${BOX.w}.0) - ${BOX.w / 2}.0;
  p.y = uCenter.y - 15.0 + mod(aOffset.y - fall, ${BOX.h}.0);
  vec3 w = p + vec3(-uWind * 0.03, 1.0, 0.0) * 0.9 * position.y;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  mv.x += position.x * 0.025;
  gl_Position = projectionMatrix * mv;
  vT = position.y;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vT;
void main() {
  gl_FragColor = vec4(uColor, uAlpha * (0.25 + 0.75 * vT));
  #include <colorspace_fragment>
}`;

export class Rain {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly u = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uWind: { value: 0 },
    uColor: { value: new THREE.Color(0xb4bfcc) },
    uAlpha: { value: 0.35 },
  };

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    const offsets = new Float32Array(MAX_DROPS * 3);
    const speeds = new Float32Array(MAX_DROPS);
    for (let i = 0; i < MAX_DROPS; i++) {
      offsets.set([Math.random() * BOX.w, Math.random() * BOX.h, Math.random() * BOX.w], i * 3);
      speeds[i] = 18 + Math.random() * 8;
    }
    this.geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    this.geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader, fragmentShader, transparent: true, depthWrite: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.userData.noAO = true;
  }

  /** @param rain mm/hr @param light 0..1 scene brightness */
  update(dt: number, rain: number, enabled: boolean, camera: THREE.Camera, light: number): void {
    this.geo.instanceCount = enabled ? Math.round((rain / 100) ** 0.8 * MAX_DROPS) : 0;
    this.mesh.visible = this.geo.instanceCount > 0;
    this.u.uTime.value = (this.u.uTime.value + dt) % 1000;
    this.u.uCenter.value.copy(camera.position);
    this.u.uWind.value = 2 + rain * 0.08;
    this.u.uAlpha.value = 0.18 + 0.25 * Math.min(1, light);
  }
}
