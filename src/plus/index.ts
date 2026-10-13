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
import type { World } from '../world';
import { type PlusFlag, plus, setPlus } from './flags';

export interface PlusHooks {
  hud: Hud;
  world: World;
}

/** Wire the panel switches and start the add-ons; returns the per-frame update. */
export function installPlus({ hud, world }: PlusHooks): (dt: number) => void {
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
  start('forecast', () => new ForecastView(new Forecaster(), hud));
  start('fusion', () => new FusionView(world, world.monitor));
  return (dt) => {
    for (const p of parts) p.update(dt);
  };
}
