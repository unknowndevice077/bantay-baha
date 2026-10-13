/**
 * Proximity prompts in the style of Roblox's ProximityPrompt: when something
 * usable is in reach, a card with the key, the object's name and the action
 * appears beside it, joined to the object by a leader line. Only things on
 * screen get a prompt; of those, the one you are looking at wins, then the
 * nearest. E (or a click on the card) uses it.
 */
import * as THREE from 'three';
import type { Player } from './player';

export interface Interactable {
  /** What it is ("Laptop", "Kagawad Lito"). */
  object: string;
  /** What E does right now ("Open dashboard", "Talk"), or null when not usable. */
  label(): string | null;
  /** Point in the world the prompt's line points at (a head, a screen). */
  anchor(): THREE.Vector3;
  /** Distance (m) from the player's feet to this thing. */
  distance(player: THREE.Vector3): number;
  range: number;
  act(): void;
}

/** Things within this angle of the view centre are preferred over closer ones off to the side. */
const LOOK_CONE = Math.cos(THREE.MathUtils.degToRad(30));
/** Card offset from the anchor, in px (up and to the right, like a callout). */
const OFFSET = { x: 70, y: -64 };

export class Interactions {
  private current: Interactable | null = null;
  private readonly card = document.getElementById('prompt')!;
  private readonly line = document.getElementById('prompt-line') as unknown as SVGSVGElement;
  private readonly forward = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly screen = new THREE.Vector3();

  /** Something was used (for the click sound). */
  onUse: (() => void) | null = null;

  constructor(
    private readonly player: Player,
    private readonly items: Interactable[],
    private readonly camera: THREE.Camera,
  ) {
    window.addEventListener('keydown', (e) => {
      if (this.player.active && e.key.toLowerCase() === 'e' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        this.use();
      }
    });
    this.card.addEventListener('click', () => this.use());
  }

  private use(): void {
    if (!this.current) return;
    this.onUse?.();
    this.current.act();
  }

  private onScreen(at: THREE.Vector3): boolean {
    this.screen.copy(at).project(this.camera);
    return this.screen.z < 1 && Math.abs(this.screen.x) < 0.95 && Math.abs(this.screen.y) < 0.95;
  }

  private pick(): Interactable | null {
    if (!this.player.active) return null;
    this.camera.getWorldDirection(this.forward);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      const d = it.distance(this.player.pos);
      if (d >= it.range || it.label() === null || !this.onScreen(it.anchor())) continue;
      const facing = this.to.copy(it.anchor()).sub(this.camera.position).normalize().dot(this.forward);
      // Looked-at things score by distance alone; others pay a penalty of a few metres.
      const score = d + (facing > LOOK_CONE ? 0 : 4 * (1 - facing));
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  update(): void {
    this.current = this.pick();
    const it = this.current;
    const label = it?.label();
    this.card.hidden = !it || !label;
    this.line.style.display = this.card.hidden ? 'none' : '';
    if (!it || !label) return;

    this.card.querySelector('small')!.textContent = it.object;
    this.card.querySelector('b')!.textContent = label;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.screen.copy(it.anchor()).project(this.camera);
    const ax = ((this.screen.x + 1) / 2) * w;
    const ay = ((1 - this.screen.y) / 2) * h;
    const cw = this.card.offsetWidth;
    // Callout to the right of the object, or to the left when it would run off screen.
    const right = ax + OFFSET.x + cw < w - 8;
    const cx = right ? ax + OFFSET.x : Math.max(8, ax - OFFSET.x - cw);
    const cy = Math.min(Math.max(ay + OFFSET.y - this.card.offsetHeight / 2, 8), h - this.card.offsetHeight - 8);
    this.card.style.transform = `translate(${cx}px, ${cy}px)`;
    const [path, dot] = [this.line.querySelector('polyline')!, this.line.querySelector('circle')!];
    // Elbow line: from the object up to the card's near edge, then across.
    const ey = cy + this.card.offsetHeight / 2;
    const edge = right ? cx : cx + cw;
    const elbow = right ? edge - 14 : edge + 14;
    path.setAttribute('points', `${ax},${ay} ${elbow},${ey} ${edge},${ey}`);
    dot.setAttribute('cx', String(ax));
    dot.setAttribute('cy', String(ay));
  }
}
