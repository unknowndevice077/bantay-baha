/** HUD forecast badge ("WARNING in ~25 min", +30 / +60 min levels) and the chart hook. */
import type { Hud } from '../hud/hud';
import { onPlus, plus } from '../plus/flags';
import { STATUSES } from '../state';
import { type Forecaster, statusOf } from './forecaster';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

export class ForecastView {
  private timer = 0;

  constructor(
    private readonly forecaster: Forecaster,
    hud: Hud,
  ) {
    hud.forecast = () => {
      const f = plus.forecast ? this.forecaster.latest : null;
      return f ? { history: [...this.forecaster.samples], path: f.path } : null;
    };
    onPlus((flag) => flag === 'forecast' && this.render());
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    this.render();
  }

  private render(): void {
    const badge = $('fc-badge');
    const f = this.forecaster.latest;
    $('fc-note').textContent = plus.forecast ? (f ? '' : this.forecaster.note) : '';
    badge.hidden = !plus.forecast || !f;
    if (!f || !plus.forecast) return;
    // Colour by the worst level expected within the hour.
    const target = f.status.reduce((a, s) => (STATUSES.indexOf(s) > STATUSES.indexOf(a) ? s : a), statusOf(f.path[0].level));
    badge.className = `fc s-${target}`;
    $('fc-eta').textContent = f.text;
    $('fc-detail').textContent = f.path
      .slice(1)
      .map((p, k) => `+${Math.round((p.t - f.path[0].t) / 60)} min ${Math.round(p.level * 100)} cm ${f.status[k]}`)
      .join(' · ');
  }
}
