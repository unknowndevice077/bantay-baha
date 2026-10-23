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
/** One-off actions played while standing: reaching / packing / hugging, and waving. */
export type Gesture = 'interact' | 'wave';
const CLIPS: Record<Gait | Gesture, string> = { idle: 'Idle', walk: 'Walk', run: 'Run', interact: 'Interact', wave: 'Wave' };

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

/** A go-bag: canvas backpack with a darker flap, worn on the back. */
function goBag(color: number): THREE.Group {
  const bag = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.15), cloth);
  const flap = new THREE.Mesh(
    new THREE.BoxGeometry(0.31, 0.12, 0.16),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.9 }),
  );
  flap.position.y = 0.14;
  for (const m of [body, flap]) m.castShadow = true;
  bag.add(body, flap);
  return bag;
}

const BAG_COLORS = [0x2f4f6f, 0x6b3f2a, 0x3f5f3a, 0x7a2f2f, 0x4a4a4a];

export class PersonRig {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<Gait | Gesture, THREE.AnimationAction>;
  private readonly weights: Record<Gait | Gesture, number> = { idle: 1, walk: 0, run: 0, interact: 0, wave: 0 };
  private gesture: Gesture | null = null;
  private gestureLeft = 0;
  private bag: THREE.Group | null = null;
  private readonly arms: Record<'L' | 'R', { upper: THREE.Bone; lower: THREE.Bone } | null>;
  private reachSide: 'L' | 'R' = 'L';
  private reachAt: THREE.Vector3 | null = null;
  private readonly height: number;

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
    const action = (gait: Gait | Gesture) => {
      const clip = src.clips.find((c) => c.name === CLIPS[gait]) ?? src.clips[0];
      const a = this.mixer.clipAction(clip);
      a.play();
      a.time = Math.random() * clip.duration;
      a.setEffectiveWeight(gait === 'idle' ? 1 : 0);
      return a;
    };
    this.actions = { idle: action('idle'), walk: action('walk'), run: action('run'), interact: action('interact'), wave: action('wave') };
    this.height = HEIGHT * (look.scale ?? 1);
    const bone = (name: string) => model.getObjectByName(name) as THREE.Bone | undefined;
    const arm = (side: 'L' | 'R') => {
      const upper = bone(`UpperArm.${side}`);
      const lower = bone(`LowerArm.${side}`);
      return upper && lower ? { upper, lower } : null;
    };
    this.arms = { L: arm('L'), R: arm('R') };
  }

  /** Play a one-off action for `seconds` (only shows while standing still). */
  play(gesture: Gesture, seconds = 2): void {
    this.gesture = gesture;
    this.gestureLeft = seconds;
    this.actions[gesture].reset().play();
  }

  /** Put a go-bag on (true) or take it off. */
  carry(on: boolean): void {
    if (on === !!this.bag) return;
    if (on) {
      this.bag = goBag(BAG_COLORS[Math.floor(Math.random() * BAG_COLORS.length)]);
      // On the back, between the shoulder blades (the models face +z).
      this.bag.position.set(0, this.height * 0.62, -0.17 * (this.height / HEIGHT));
      this.bag.scale.setScalar(this.height / HEIGHT);
      this.root.add(this.bag);
    } else {
      this.root.remove(this.bag!);
      this.bag = null;
    }
  }

  get carrying(): boolean {
    return !!this.bag;
  }

  /** Hold an arm out toward a world point (a hand to hold), or null to let go. */
  reach(at: THREE.Vector3 | null, side: 'L' | 'R' = 'L'): void {
    this.reachAt = at;
    this.reachSide = side;
  }

  /** Blend idle / walk / run for `speed` (m/s) and place the body at (x, floorY, z) facing `heading` (0 = +z). */
  pose(dt: number, speed: number, x: number, floorY: number, z: number, heading: number): void {
    this.gestureLeft -= dt;
    if (this.gestureLeft <= 0) this.gesture = null;
    const gait: Gait | Gesture = speed < 0.15 ? (this.gesture ?? 'idle') : speed < 2.6 ? 'walk' : 'run';
    for (const g of ['idle', 'walk', 'run', 'interact', 'wave'] as (Gait | Gesture)[]) {
      this.weights[g] = dt > 0 ? damp(this.weights[g], g === gait ? 1 : 0, 10, dt) : g === gait ? 1 : 0;
      this.actions[g].setEffectiveWeight(this.weights[g]);
    }
    this.actions.walk.timeScale = THREE.MathUtils.clamp(speed / WALK_CLIP, 0.5, 1.8);
    this.actions.run.timeScale = THREE.MathUtils.clamp(speed / RUN_CLIP, 0.6, 1.6);
    this.mixer.update(dt);
    this.root.position.set(x, floorY, z);
    this.root.rotation.y = heading;
    if (this.reachAt) this.aimArm(this.reachAt);
  }

  /** Swing the upper arm so the forearm points at `target` (after the animation has posed it). */
  private aimArm(target: THREE.Vector3): void {
    const arm = this.arms[this.reachSide];
    if (!arm) return;
    this.root.updateMatrixWorld(true);
    const parent = arm.upper.parent!;
    const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
    // Direction to the target, in the parent's space.
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const to = target.clone().applyMatrix4(inv).sub(shoulder.clone().applyMatrix4(inv)).normalize();
    // The arm's own length axis is where its child (the forearm) sits.
    const along = arm.lower.position.clone().normalize();
    arm.upper.quaternion.setFromUnitVectors(along, to);
    arm.lower.quaternion.identity();
    arm.upper.updateMatrixWorld(true);
  }
}
