/**
 * Click-to-inspect: clicking the enclosure opens it (X-ray), and every part of
 * the node and its data path can then be clicked (in 3D or via its label) to
 * show an info card with specs and live telemetry. A wire box outlines the selection.
 */
import * as THREE from 'three';
import type { CameraRig } from '../scene/cameraRig';
import { setToggle, state } from '../state';
import { COMPONENTS, type ComponentId } from './components';
import type { Esp32Node } from './esp32';

/** Parts that live inside the enclosure (selecting one opens it). */
const INSIDE: ComponentId[] = ['esp32', 'driver', 'battery', 'wiring'];
/** Large or enclosing shapes lose to anything more specific under the cursor. */
const BACKGROUND: ComponentId[] = ['enclosure', 'beam', 'mast'];
const CLICK_SLOP_PX = 6;

const $ = (id: string): HTMLElement => document.getElementById(id)!;

function componentOf(o: THREE.Object3D | null): ComponentId | null {
  for (; o; o = o.parent) if (o.userData.component) return o.userData.component as ComponentId;
  return null;
}

export class Inspector {
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly box = new THREE.Box3();
  private readonly outline: THREE.Box3Helper;
  private readonly byId = new Map<ComponentId, THREE.Object3D[]>();
  private selected: ComponentId | null = null;
  private down: { x: number; y: number } | null = null;
  private liveTimer = 0;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly dom: HTMLElement,
    private readonly roots: THREE.Object3D[],
    scene: THREE.Scene,
    private readonly node: Esp32Node,
    private readonly rig: CameraRig,
  ) {
    this.ray.params.Line = { threshold: 0.05 };
    this.outline = new THREE.Box3Helper(this.box, 0x7dd3fc);
    this.outline.visible = false;
    scene.add(this.outline);
    for (const root of roots) {
      root.traverse((o) => {
        const id = o.userData.component as ComponentId | undefined;
        if (id) this.byId.set(id, [...(this.byId.get(id) ?? []), o]);
      });
    }

    dom.addEventListener('pointerdown', (e) => (this.down = { x: e.clientX, y: e.clientY }));
    dom.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_SLOP_PX) this.select(this.pick(e));
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.down) dom.style.cursor = this.pick(e) ? 'pointer' : '';
    });
    $('labels').addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset.component as ComponentId | undefined;
      if (id) this.select(id);
    });
    $('insp-close').addEventListener('click', () => this.select(null));

    const chips = $('insp-chips');
    for (const id of Object.keys(COMPONENTS) as ComponentId[]) {
      const chip = document.createElement('button');
      chip.className = 'chip-btn';
      chip.dataset.id = id;
      chip.textContent = COMPONENTS[id].kind;
      chip.addEventListener('click', () => this.select(id));
      chips.append(chip);
    }
  }

  private pick(e: PointerEvent): ComponentId | null {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    let fallback: ComponentId | null = null;
    for (const hit of this.ray.intersectObjects(this.roots, true)) {
      if (!hit.object.visible) continue;
      const id = componentOf(hit.object);
      if (!id) continue;
      const open = state.toggles.xray;
      if (!open && id === 'enclosure') return id; // a closed box hides its contents
      if (!open && INSIDE.includes(id)) continue;
      if (!BACKGROUND.includes(id)) return id;
      // Through an open enclosure, keep looking for the part behind its faded shell.
      fallback ??= id;
    }
    return fallback;
  }

  select(id: ComponentId | null): void {
    this.selected = id;
    const card = $('inspector');
    card.hidden = !id;
    this.outline.visible = !!id;
    if (!id) return;
    $('panel').classList.remove('open'); // the card takes the controls' spot; the panel button brings them back

    if (!state.toggles.xray && (id === 'enclosure' || INSIDE.includes(id))) {
      setToggle('xray', true);
      this.rig.goTo('sensor');
    }
    const info = COMPONENTS[id];
    $('insp-kind').textContent = info.kind;
    $('insp-title').textContent = info.title;
    $('insp-about').textContent = info.about;
    $('insp-specs').replaceChildren(...info.specs.flatMap(([k, v]) => [Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v })]));
    $('insp-live-wrap').hidden = !info.live;
    document.querySelectorAll<HTMLElement>('#insp-chips .chip-btn').forEach((c) => c.classList.toggle('active', c.dataset.id === id));

    const actions = $('insp-actions');
    actions.replaceChildren();
    if (id === 'enclosure') {
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.textContent = state.toggles.xray ? 'Close enclosure' : 'Open enclosure';
      btn.addEventListener('click', () => {
        setToggle('xray', !state.toggles.xray);
        this.select('enclosure');
      });
      actions.append(btn);
    }
    this.renderLive();
  }

  private renderLive(): void {
    this.liveTimer = 0.3;
    const live = this.selected && COMPONENTS[this.selected].live;
    if (!live) return;
    $('insp-live').replaceChildren(
      ...live(this.node.t).flatMap(([k, v]) => [Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v })]),
    );
  }

  update(dt: number): void {
    if (!this.selected) return;
    // Parts move while the enclosure animates, so refit the outline every frame.
    this.box.makeEmpty();
    for (const o of this.byId.get(this.selected) ?? []) this.box.expandByObject(o);
    this.box.expandByScalar(0.03);

    this.liveTimer -= dt;
    if (this.liveTimer <= 0) this.renderLive();
  }
}
