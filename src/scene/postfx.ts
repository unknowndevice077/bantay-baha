/**
 * "High quality" render path: multisampled HDR render → ground-truth ambient
 * occlusion (contact shadows in corners, under eaves, around stilts and steps)
 * → bloom (lit windows, street lamps, beacons, LEDs at night) → tone mapping.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Base-class method that @types/three doesn't declare. */
type WithVisibility = { overrideVisibility(this: GTAOPass): void };

/**
 * GTAO that also skips objects tagged `userData.noAO`: the AO pre-pass renders
 * every mesh with a plain normal material, so transparent water, alpha-cut
 * leaves, GPU rain and the sky dome would otherwise appear as solid shapes.
 */
class SelectiveGTAOPass extends GTAOPass {
  overrideVisibility(): void {
    (GTAOPass.prototype as unknown as WithVisibility).overrideVisibility.call(this);
    this.scene.traverse((o) => {
      if (o.userData.noAO) o.visible = false;
    });
  }
}

export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    const ao = new SelectiveGTAOPass(scene, camera, w, h);
    ao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    ao.blendIntensity = 0.9;
    this.composer.addPass(ao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.4, 0.5, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setPixelRatio(pr: number): void {
    this.composer.setPixelRatio(pr);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  /** @param night 0..1 — bloom is stronger after dark when the lamps matter. */
  render(night: number): void {
    this.bloom.strength = 0.15 + night * 0.55;
    this.composer.render();
  }
}
