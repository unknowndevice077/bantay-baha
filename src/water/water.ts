/**
 * Animated flood-water surface. One plane at the current level; the terrain
 * height texture tells each fragment its depth, which drives shoreline foam,
 * edge fade and shallow/deep colour. Turbidity (uMud) shifts it to muddy brown.
 */
import * as THREE from 'three';
import { WORLD_SIZE } from '../config';

const WAVE_GLSL = /* glsl */ `
float waveHeight(vec2 p, float t, float chop) {
  return (sin(p.x * 0.35 + t * 1.3) * 0.05
        + sin(p.y * 0.5 - t * 1.1 + p.x * 0.2) * 0.04
        + sin((p.x + p.y) * 1.3 + t * 2.4) * 0.015) * chop;
}`;

/** CPU twin of the GLSL wave so floating debris rides the visible surface. */
export function waveHeight(x: number, z: number, t: number, chop: number): number {
  return (
    (Math.sin(x * 0.35 + t * 1.3) * 0.05 + Math.sin(z * 0.5 - t * 1.1 + x * 0.2) * 0.04 + Math.sin((x + z) * 1.3 + t * 2.4) * 0.015) * chop
  );
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uLevelY;
uniform float uChop;
varying vec3 vWorld;
varying vec3 vNormalW;
${WAVE_GLSL}
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y = uLevelY + waveHeight(world.xz, uTime, uChop);
  float e = 0.25;
  float hx = waveHeight(world.xz + vec2(e, 0.0), uTime, uChop) - waveHeight(world.xz - vec2(e, 0.0), uTime, uChop);
  float hz = waveHeight(world.xz + vec2(0.0, e), uTime, uChop) - waveHeight(world.xz - vec2(0.0, e), uTime, uChop);
  vNormalW = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D uHeight;
uniform float uSize;
uniform float uTime;
uniform float uMud;
uniform float uLight;
uniform float uFlash;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform vec3 uClearDeep;
uniform vec3 uClearShallow;
uniform vec3 uMudDeep;
uniform vec3 uMudShallow;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  float ground = texture2D(uHeight, vWorld.xz / uSize + 0.5).r;
  float depth = vWorld.y - ground;
  if (depth < -0.02) discard;

  float deep = smoothstep(0.0, 2.5, depth);
  vec3 base = mix(mix(uClearShallow, uClearDeep, deep), mix(uMudShallow, uMudDeep, deep), uMud);

  // Streaks advected along the current (+x).
  vec2 flow = vWorld.xz * vec2(0.18, 0.7) - vec2(uTime * (0.6 + uMud), 0.0);
  base *= 0.85 + 0.35 * vnoise(flow) * vnoise(flow * 2.3 + 3.1);

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 col = mix(base * uLight, uSky, fres * 0.55);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(N, H), 0.0), 140.0) * (1.0 - uMud * 0.5);

  // Foam where the water meets the banks, road and walls.
  float n = vnoise(vWorld.xz * 1.6 + vec2(uTime * 0.35, uTime * 0.2));
  float foam = 1.0 - smoothstep(0.0, 0.18 + n * 0.3, depth);
  col = mix(col, vec3(0.85, 0.82, 0.74) * uLight, foam * 0.8);
  col += vec3(0.6, 0.65, 0.8) * uFlash * 0.25;

  float alpha = mix(0.72, 0.94, deep) * smoothstep(-0.02, 0.06, depth);
  alpha = max(alpha, foam * 0.85 * smoothstep(-0.02, 0.03, depth));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface WaterLighting {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  horizon: THREE.Color;
  light: number;
  flash: number;
}

export class Water {
  readonly mesh: THREE.Mesh;
  /** Shared clock + choppiness so CPU floaters match the shader. */
  time = 0;
  chop = 1;
  private readonly u: Record<string, THREE.IUniform>;

  constructor(heightTexture: THREE.Texture) {
    this.u = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uHeight: { value: heightTexture },
      uSize: { value: WORLD_SIZE },
      uTime: { value: 0 },
      uLevelY: { value: 0 },
      uChop: { value: 1 },
      uMud: { value: 0 },
      uLight: { value: 1 },
      uFlash: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() },
      uClearDeep: { value: new THREE.Color(0x0e3b45) },
      uClearShallow: { value: new THREE.Color(0x3d7f7a) },
      uMudDeep: { value: new THREE.Color(0x4a3720) },
      uMudShallow: { value: new THREE.Color(0x8a6d45) },
    };
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 160, 160);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** @param mud 0 = clear creek, 1 = full muddy flood. @param chop wave amplitude multiplier. */
  update(dt: number, levelY: number, mud: number, chop: number, l: WaterLighting): void {
    this.time += dt;
    this.chop = chop;
    const u = this.u;
    u.uTime.value = this.time;
    u.uLevelY.value = levelY;
    u.uChop.value = chop;
    u.uMud.value = mud;
    u.uLight.value = l.light;
    u.uFlash.value = l.flash;
    (u.uSunDir.value as THREE.Vector3).copy(l.sunDir);
    (u.uSunColor.value as THREE.Color).copy(l.sunColor);
    (u.uSky.value as THREE.Color).copy(l.horizon);
  }
}
