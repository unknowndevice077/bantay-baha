/** Live HUD (level, rise rate, distance, status badge, chart), alert box, evacuation banner and toasts. */
import type { AlertMessage } from '../alerts/alertService';
import { LANG_NAMES } from '../alerts/templates';
import { type Reading, type Status, bus, state } from '../state';
import { type ChartForecast, drawChart } from './chart';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const SOURCE_TEXT = { rain: 'Rainfall model', manual: 'Manual slider', remote: 'Live ESP32', replay: 'Replayed recording' } as const;
const ALERT_TITLE: Record<Status, string> = {
  NORMAL: 'Status update',
  ADVISORY: 'Flood advisory',
  WARNING: 'Flood warning',
  EVACUATE: 'Evacuation order',
};

export class Hud {
  private readonly level = $('m-level');
  private readonly rate = $('m-rate');
  private readonly dist = $('m-dist');
  private readonly badge = $('badge');
  private readonly source = $('m-source');
  private readonly chart = $<HTMLCanvasElement>('chart');
  private readonly alert = $('alert');
  private readonly banner = $('evac-banner');
  private chartDirty = true;
  private chartTimer = 0;
  /** Bantay Baha+: supplies a longer history and the forecast path when forecasting is on. */
  forecast: (() => { history: { t: number; level: number }[]; path: ChartForecast } | null) | null = null;
  /** A captain's broadcast holds the alert box until this time (ms). */
  private broadcastUntil = 0;

  constructor(private readonly history: Reading[]) {
    bus.on('reading', (r) => this.onReading(r));
    window.addEventListener('resize', () => (this.chartDirty = true));
  }

  private onReading(r: Reading): void {
    this.level.textContent = (r.level * 100).toFixed(0);
    this.rate.textContent = `${r.rate >= 0 ? '+' : ''}${r.rate.toFixed(0)}`;
    this.dist.textContent = (r.distance * 100).toFixed(0);
    this.badge.textContent = r.status;
    this.badge.className = `badge s-${r.status}`;
    this.banner.hidden = r.status !== 'EVACUATE' && r.status !== 'WARNING';
    this.banner.className = r.status === 'WARNING' ? 'preemptive' : '';
    this.banner.textContent =
      r.status === 'WARNING'
        ? 'Preemptive evacuation · residents to the barangay hall'
        : 'Evacuate · proceed to the barangay hall evacuation center';
    this.source.textContent = `Source: ${SOURCE_TEXT[state.source]} · sensor 7.00 m above gauge datum`;
    this.chartDirty = true;
  }

  showAlert(m: AlertMessage): void {
    if (performance.now() < this.broadcastUntil) return;
    this.alert.className = `alert surface s-${m.status}${m.lola ? ' lola' : ''}`;
    $('alert-title').textContent = m.lola ? `Lola says (${LANG_NAMES[m.lang]})` : `${ALERT_TITLE[m.status]} · ${LANG_NAMES[m.lang]}`;
    const src = {
      template: 'template',
      ollama: 'via Ollama',
      'ollama-pending': 'asking Ollama',
      'template-fallback': 'Ollama unreachable, template used',
    };
    $('alert-src').textContent = src[m.source];
    $('alert-text').textContent = m.text;
  }

  /** A message from the barangay captain's dashboard takes over the alert box for 30 s. */
  broadcast(text: string): void {
    this.broadcastUntil = performance.now() + 30000;
    this.alert.className = 'alert surface s-WARNING broadcast';
    $('alert-title').textContent = 'Message from the barangay captain';
    $('alert-src').textContent = 'via dashboard';
    $('alert-text').textContent = text;
    this.scold();
    toast('New broadcast from the barangay dashboard');
  }

  /** Lola mode: give the alert box a scolding shake. */
  scold(): void {
    this.alert.classList.remove('shake');
    void this.alert.offsetWidth;
    this.alert.classList.add('shake');
  }

  update(dt: number): void {
    this.chartTimer -= dt;
    if (this.chartDirty && this.chartTimer <= 0) {
      const f = this.forecast?.();
      drawChart(this.chart, f?.history ?? this.history, state.reading?.t ?? state.simTime, f?.path);
      this.chartDirty = false;
      this.chartTimer = 0.2;
    }
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}
