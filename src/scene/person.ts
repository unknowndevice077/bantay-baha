/**
 * Rigged, animated people shared by residents, NPCs and the captain: Quaternius
 * CC0 characters (public/models, see CREDITS.md) with idle / walk / run clips
 * blended by speed. Skin and hair are tinted per person so the barangay looks
 * like a Filipino neighbourhood rather than seven clones.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { damp } from '../util';

export const MODELS = ['casual-man', 'beach-man', 'hoodie-man', 'farmer', 'woman-dress', 'woman-casual', 'worker'] as const;
export type Model = (typeof MODELS)[number];

export interface Look {
  model: Model;
  skin: number;
  hair: number;
  /** Height multiplier (1 = 1.68 m). */
  scale?: number;
}

const HEIGHT = 1.68;
/** Ground speed (m/s) at which the walk and run clips play at normal rate, so feet don't slide. */
const WALK_CLIP = 1.35;
const RUN_CLIP = 3.9;
const SKIN = new Set(['Skin', 'Skin_Darker']);
const HAIR = new Set(['Hair', 'Hair_Blond', 'Hair_Brown', 'Eyebrows', 'Moustache']);

type Gait = 'idle' | 'walk' | 'run';
const CLIPS: Record<Gait, string> = { idle: 'Idle', walk: 'Walk', run: 'Run' };

const library = new Map<Model, { scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number }>();
const tinted = new Map<string, THREE.Material>();

/** Load every character once; call (and await) before building the world. */
export async function loadPeople(): Promise<void> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(
    MODELS.map(async (m) => {
      const gltf = await loader.loadAsync(`models/${m}.glb`);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      library.set(m, { scene: gltf.scene, clips: gltf.animations, scale: HEIGHT / (box.max.y - box.min.y) });
    }),
  );
}

/** Shared material per (original material, tint) so 25 people don't mean 25 copies of each. */
function tint(mat: THREE.Material, look: Look): THREE.Material {
  const color = SKIN.has(mat.name) ? look.skin : HAIR.has(mat.name) ? look.hair : null;
  if (color === null) return mat;
  const key = `${mat.uuid}:${color}`;
  let out = tinted.get(key);
  if (!out) {
    const m = (mat as THREE.MeshStandardMaterial).clone();
    // Skin_Darker (lips, shading) stays a step darker than the chosen skin tone.
    m.color.setHex(color).multiplyScalar(mat.name === 'Skin_Darker' ? 0.8 : 1);
    tinted.set(key, m);
    out = m;
  }
  return out;
}

export class PersonRig {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<Gait, THREE.AnimationAction>;
  private readonly weights: Record<Gait, number> = { idle: 1, walk: 0, run: 0 };

  constructor(look: Look) {
    const src = library.get(look.model);
    if (!src) throw new Error(`Character "${look.model}" not loaded; await loadPeople() first`);
    const model = cloneSkinned(src.scene);
    model.scale.setScalar(src.scale * (look.scale ?? 1));
    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      // Skinned bounds are computed in the bind pose; skip culling rather than pop out mid-stride.
      mesh.frustumCulled = false;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => tint(m, look)) : tint(mesh.material, look);
    });
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    const action = (gait: Gait) => {
      const clip = src.clips.find((c) => c.name === CLIPS[gait]) ?? src.clips[0];
      const a = this.mixer.clipAction(clip);
      a.play();
      a.time = Math.random() * clip.duration;
      a.setEffectiveWeight(gait === 'idle' ? 1 : 0);
      return a;
    };
    this.actions = { idle: action('idle'), walk: action('walk'), run: action('run') };
  }

  /** Blend idle / walk / run for `speed` (m/s) and place the body at (x, floorY, z) facing `heading` (0 = +z). */
  pose(dt: number, speed: number, x: number, floorY: number, z: number, heading: number): void {
    const gait: Gait = speed < 0.15 ? 'idle' : speed < 2.6 ? 'walk' : 'run';
    for (const g of ['idle', 'walk', 'run'] as Gait[]) {
      this.weights[g] = dt > 0 ? damp(this.weights[g], g === gait ? 1 : 0, 10, dt) : g === gait ? 1 : 0;
      this.actions[g].setEffectiveWeight(this.weights[g]);
    }
    this.actions.walk.timeScale = THREE.MathUtils.clamp(speed / WALK_CLIP, 0.5, 1.8);
    this.actions.run.timeScale = THREE.MathUtils.clamp(speed / RUN_CLIP, 0.6, 1.6);
    this.mixer.update(dt);
    this.root.position.set(x, floorY, z);
    this.root.rotation.y = heading;
  }
}
