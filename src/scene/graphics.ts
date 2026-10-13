/**
 * Graphics quality for the simulator and the story game. Most of the cost is on the GPU: the
 * resolution, the shadow pass (the whole scene drawn a second time) and the
 * high-quality effects (ambient occlusion and bloom). Four presets, plus Auto:
 * it starts in the middle and steps down whenever the game runs below about
 * 45 frames a second, until it doesn't. Remembered per browser.
 */
import { state } from '../state';
import type { World } from '../world';

/** Where the page shows the setting: one or more <select>s, and an element for "Running at …". */
export interface GraphicsUi {
  selects: string[];
  status: string;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const KEY = 'bantay-baha-graphics';

export type GraphicsMode = 'auto' | 'fast' | 'balanced' | 'high' | 'ultra';

interface Level {
  name: string;
  /** Render resolution as a share of the screen's (capped by the screen's own pixel ratio). */
  pixelRatio: number;
  /** Redraw shadows every n frames; 0 = no shadows. */
  shadowEvery: number;
  /** Ambient occlusion and bloom. */
  effects: boolean;
}

const LEVELS: Level[] = [
  { name: 'Fast', pixelRatio: 0.75, shadowEvery: 0, effects: false },
  { name: 'Balanced', pixelRatio: 1, shadowEvery: 3, effects: false },
  { name: 'High', pixelRatio: 1.25, shadowEvery: 1, effects: false },
  { name: 'Ultra', pixelRatio: 1.75, shadowEvery: 1, effects: true },
];
const PRESET: Record<Exclude<GraphicsMode, 'auto'>, number> = { fast: 0, balanced: 1, high: 2, ultra: 3 };
/** Auto starts here (no heavy effects) and only ever steps down. */
const AUTO_START = 2;
/** Average frame time (ms) over a window above which Auto steps down. */
const SLOW_MS = 22;
const WINDOW_MS = 2000;

export class Graphics {
  private mode: GraphicsMode;
  private level = AUTO_START;
  private frame = 0;
  private shadowsOn = true;
  // Auto's measuring window.
  private last = 0;
  private sum = 0;
  private count = 0;
  private windowStart = 0;
  /** Skip the first window after a change: shaders recompile and the first frames stutter. */
  private settle = true;

  constructor(
    private readonly world: World,
    private readonly ui: GraphicsUi,
  ) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // storage blocked
    }
    this.mode = saved && (saved === 'auto' || saved in PRESET) ? (saved as GraphicsMode) : 'auto';
    world.renderer.shadowMap.autoUpdate = false;
    for (const id of ui.selects) {
      const select = $<HTMLSelectElement>(id);
      select.value = this.mode;
      select.addEventListener('change', () => this.setMode(select.value as GraphicsMode));
    }
    this.apply(this.mode === 'auto' ? AUTO_START : PRESET[this.mode]);
  }

  setMode(mode: GraphicsMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // storage blocked: lasts for this visit
    }
    for (const id of this.ui.selects) $<HTMLSelectElement>(id).value = mode;
    this.apply(mode === 'auto' ? AUTO_START : PRESET[mode]);
  }

  private apply(level: number): void {
    this.level = level;
    const l = LEVELS[level];
    const { renderer, postfx, sky } = this.world;
    const pr = Math.min(window.devicePixelRatio || 1, l.pixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    postfx.setPixelRatio(pr);
    state.toggles.hq = l.effects;
    const shadows = l.shadowEvery > 0;
    if (shadows !== this.shadowsOn) {
      this.shadowsOn = shadows;
      sky.setShadows(shadows);
    }
    renderer.shadowMap.needsUpdate = true;
    this.settle = true;
    this.sum = this.count = 0;
    this.windowStart = performance.now();
    $(this.ui.status).textContent = this.mode === 'auto' ? `Running at ${l.name}` : '';
  }

  /** Every frame, before rendering. */
  update(): void {
    const l = LEVELS[this.level];
    this.frame++;
    if (l.shadowEvery > 0 && this.frame % l.shadowEvery === 0) this.world.renderer.shadowMap.needsUpdate = true;

    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    if (this.mode !== 'auto' || this.level === 0) return;
    // Ignore hidden tabs and hitches (alt-tab, a slow first load).
    if (document.hidden || dt > 250) return;
    this.sum += dt;
    this.count++;
    if (now - this.windowStart < WINDOW_MS) return;
    const avg = this.sum / this.count;
    this.sum = this.count = 0;
    this.windowStart = now;
    if (this.settle) {
      this.settle = false;
      return;
    }
    if (avg > SLOW_MS) this.apply(this.level - 1);
  }
}
