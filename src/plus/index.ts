/**
 * Bantay Baha+ add-ons for the simulator. Each one is behind a flag in the
 * "Bantay Baha+" panel section; with a flag off (or if an add-on fails to
 * start) the core simulator runs exactly as before.
 */
import './plus.css';
import { Forecaster } from '../forecast/forecaster';
import { ForecastView } from '../forecast/view';
import { FusionView } from '../fusion/view';
import type { Hud } from '../hud/hud';
import type { ForecastSummary } from '../net/protocol';
import type { World } from '../world';
import { type PlusFlag, plus, setPlus } from './flags';

export interface PlusHooks {
  hud: Hud;
  world: World;
}

export interface Plus {
  /** Per frame. */
  update(dt: number): void;
  /** The latest forecast for the dashboard, or null (forecast off, failed, or still warming up). */
  forecast(): ForecastSummary | null;
}

/** Wire the panel switches and start the add-ons. */
export function installPlus({ hud, world }: PlusHooks): Plus {
  document.querySelectorAll<HTMLInputElement>('[data-plus]').forEach((box) => {
    const flag = box.dataset.plus as PlusFlag;
    box.checked = plus[flag];
    box.addEventListener('change', () => setPlus(flag, box.checked));
  });
  // Each add-on starts on its own: one failing leaves the others (and the core) running.
  const parts: { update(dt: number): void }[] = [];
  const start = (name: string, make: () => { update(dt: number): void }) => {
    try {
      parts.push(make());
    } catch (e) {
      console.warn(`[plus] ${name} failed to start`, e);
    }
  };
  let forecaster: Forecaster | null = null;
  start('forecast', () => new ForecastView((forecaster = new Forecaster()), hud));
  start('fusion', () => new FusionView(world, world.monitor));
  return {
    update: (dt) => {
      for (const p of parts) p.update(dt);
    },
    forecast: () => {
      const f = plus.forecast ? forecaster?.latest : null;
      return f ? { text: f.text, at30: f.path[1].level, at60: f.path[2].level } : null;
    },
  };
}
