/** Day/night cycle, storm darkening, fog, sun/moon light, sky dome and lightning. */
import * as THREE from 'three';
import { bus, state } from '../state';
import { smoothstep } from '../util';
import { groundHeight } from './terrain';

/** Real seconds per full day/night cycle. */
const DAY_LENGTH = 300;
const C = (hex: number) => new THREE.Color(hex);
const P = {
  dayTop: C(0x3a78cf),
  dayHor: C(0xb9d3ea),
  duskTop: C(0x34406e),
  duskHor: C(0xe89a62),
  nightTop: C(0x03050c),
  nightHor: C(0x0c1526),
  stormTop: C(0x3b4048),
  stormHor: C(0x6d737b),
  flash: C(0xdfe6ff),
  sunLow: C(0xffb070),
  sunHigh: C(0xfff4e0),
  moon: C(0x8fa8d8),
};

const domeVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const domeFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uDiscDir;
uniform vec3 uDiscColor;
uniform float uDisc;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, d.y));
  float s = max(dot(d, uDiscDir), 0.0);
  col += uDiscColor * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.25) * uDisc;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const BOLT_POINTS = 18;

/**
 * Pre-filtered outdoor environment (blue sky above, warm bright horizon, earthy
 * ground) for PBR reflections and image-based ambient light. Its strength is
 * modulated per frame with daylight via scene.environmentIntensity.
 */
function skyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: domeVertex,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float y = normalize(vDir).y;
          vec3 sky = mix(vec3(0.75, 0.82, 0.9), vec3(0.32, 0.5, 0.8), smoothstep(0.0, 0.6, y));
          vec3 ground = mix(vec3(0.42, 0.4, 0.33), vec3(0.2, 0.24, 0.14), smoothstep(0.0, -0.4, y));
          gl_FragColor = vec4(y > 0.0 ? sky : ground, 1.0);
        }`,
    }),
  );
  envScene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  sphere.geometry.dispose();
  sphere.material.dispose();
  return tex;
}

export class Sky {
  /** 0 = full day, 1 = full night. */
  night = 0;
  flash = 0;
  /** Overall ambient brightness used by the water shader. */
  light = 1;
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly sunColor = new THREE.Color();
  readonly horizon = new THREE.Color();
  /** Zenith colour (water reflects it when looking at steep angles). */
  readonly zenith = new THREE.Color();
  /** 0..1 storm darkness (drives street-light photocells too). */
  storm = 0;
  private readonly tmp = new THREE.Color();
  private readonly lightDir = new THREE.Vector3();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.5);
  private readonly hemi = new THREE.HemisphereLight(0xbcd6ee, 0x3b3325, 1);
  private readonly fog = new THREE.FogExp2(0xb9d3ea, 0.004);
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly bolt: THREE.Line;
  private boltLife = 0;
  private strikeIn = 4;

  constructor(
    private readonly scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    shadowMapSize: number,
  ) {
    scene.fog = this.fog;
    scene.environment = skyEnvironment(renderer);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    Object.assign(s.shadow.camera, { left: -110, right: 110, top: 110, bottom: -110, near: 1, far: 400 });
    s.shadow.bias = -0.0005;
    s.shadow.normalBias = 0.03;
    scene.add(s, s.target, this.hemi);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: this.zenith },
          uHorizon: { value: this.horizon },
          uDiscDir: { value: this.lightDir },
          uDiscColor: { value: new THREE.Color() },
          uDisc: { value: 1 },
        },
        vertexShader: domeVertex,
        fragmentShader: domeFragment,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    this.dome.userData.noAO = true;

    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_POINTS * 3), 3));
    this.bolt = new THREE.Line(boltGeo, new THREE.LineBasicMaterial({ color: 0xeef3ff, fog: false }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
    scene.add(this.dome, this.bolt);
  }

  update(dt: number, rain: number, camera: THREE.Camera): void {
    if (!state.timeLocked) state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;
    const ang = state.timeOfDay * Math.PI * 2;
    this.sunDir.set(Math.sin(ang) * 0.9, -Math.cos(ang), 0.35).normalize();
    const elev = this.sunDir.y;
    const day = smoothstep(-0.12, 0.25, elev);
    const dusk = 1 - smoothstep(0, 0.35, Math.abs(elev));
    const storm = smoothstep(10, 80, rain);
    this.storm = storm;
    this.night = 1 - day;

    const shade = 0.2 + 0.8 * day;
    this.zenith.lerpColors(P.nightTop, P.dayTop, day).lerp(P.duskTop, dusk * 0.5);
    this.horizon.lerpColors(P.nightHor, P.dayHor, day).lerp(P.duskHor, dusk * 0.6 * (1 - storm));
    this.zenith.lerp(this.tmp.copy(P.stormTop).multiplyScalar(shade), storm * 0.85);
    this.horizon.lerp(this.tmp.copy(P.stormHor).multiplyScalar(shade), storm * 0.85);

    // Lightning: more frequent the harder it rains.
    this.strikeIn -= dt;
    if (rain > 50 && this.strikeIn <= 0) {
      this.strike(camera);
      this.strikeIn = 2.5 + Math.random() * (16 - rain * 0.1);
    }
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      this.bolt.visible = this.boltLife > 0;
      this.flash = Math.random() < 0.7 ? 1 : 0.3;
    } else {
      this.flash *= Math.exp(-dt * 7);
    }
    this.zenith.lerp(P.flash, this.flash * 0.5);
    this.horizon.lerp(P.flash, this.flash * 0.4);

    // One directional light plays the sun by day and the moon by night.
    const sunUp = elev > 0;
    this.lightDir.copy(this.sunDir).multiplyScalar(sunUp ? 1 : -1);
    if (sunUp) {
      this.sun.color.lerpColors(P.sunLow, P.sunHigh, smoothstep(0, 0.4, elev));
      this.sun.intensity = 2.6 * day * (1 - storm * 0.75);
    } else {
      this.sun.color.copy(P.moon);
      this.sun.intensity = 0.3 * smoothstep(0, 0.25, -elev) * (1 - storm * 0.6);
    }
    this.sun.position.copy(this.lightDir).multiplyScalar(150);
    this.hemi.color.copy(this.zenith).lerp(this.horizon, 0.5);
    // Image-based light from the sky environment does most of the ambient work; the hemisphere fills in.
    this.hemi.intensity = 0.35 + 0.45 * day * (1 - storm * 0.35) + this.flash * 2.5;
    this.scene.environmentIntensity = 0.12 + 0.75 * day * (1 - storm * 0.5) + this.flash * 0.8;
    this.light = 0.3 + 0.7 * day * (1 - storm * 0.45) + this.flash * 0.4;
    this.sunColor.copy(this.sun.color).multiplyScalar(this.sun.intensity / 2.6);

    this.fog.color.copy(this.horizon);
    this.fog.density = 0.0032 + storm * 0.009;

    const u = this.dome.material.uniforms;
    (u.uDiscColor.value as THREE.Color).copy(sunUp ? this.sun.color : P.moon);
    u.uDisc.value = (sunUp ? day : 0.4 * this.night) * (1 - storm);
    this.dome.position.copy(camera.position);
  }

  private strike(camera: THREE.Camera): void {
    const ang = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 120;
    const x = camera.position.x + Math.cos(ang) * distance;
    const z = camera.position.z + Math.sin(ang) * distance;
    const gy = groundHeight(x, z);
    const pos = this.bolt.geometry.getAttribute('position') as THREE.BufferAttribute;
    let ox = 0;
    let oz = 0;
    for (let i = 0; i < BOLT_POINTS; i++) {
      const t = i / (BOLT_POINTS - 1);
      pos.setXYZ(i, x + ox, 90 + (gy - 90) * t, z + oz);
      ox += (Math.random() - 0.5) * 6;
      oz += (Math.random() - 0.5) * 6;
    }
    pos.needsUpdate = true;
    this.bolt.visible = true;
    this.boltLife = 0.22;
    bus.emit('lightning', { distance });
  }
}
