/**
 * 10-minute water-level line chart drawn on a 2D canvas (with threshold lines).
 * With a forecast (Bantay Baha+), it shows the last 30 minutes and the next
 * hour instead, the forecast as a dashed line inside its typical-error band.
 */
import { THRESHOLDS, statusCss } from '../config';

const WINDOW_S = 600;
const FORECAST_PAST_S = 1800;
const PAD = { l: 34, r: 8, t: 8, b: 16 };

/** Forecast points: simulated time (s), level (m), typical error (m). The first is "now". */
export type ChartForecast = { t: number; level: number; err: number }[];

export function drawChart(canvas: HTMLCanvasElement, history: { t: number; level: number }[], now: number, forecast?: ChartForecast): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const past = forecast ? FORECAST_PAST_S : WINDOW_S;
  const span = forecast ? past + (forecast[forecast.length - 1].t - now) : WINDOW_S;
  const pts = history.filter((r) => r.t >= now - past);
  const peak = Math.max(400, ...pts.map((r) => r.level * 100), ...(forecast ?? []).map((p) => (p.level + p.err) * 100));
  const maxCm = Math.ceil((peak + 20) / 100) * 100;
  const x = (t: number) => PAD.l + ((t - (now - past)) / span) * (w - PAD.l - PAD.r);
  const y = (cm: number) => h - PAD.b - (cm / maxCm) * (h - PAD.t - PAD.b);

  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = '#8794a2';
  ctx.strokeStyle = 'rgba(233,238,243,0.08)';
  ctx.lineWidth = 1;
  const step = maxCm > 500 ? 200 : 100;
  for (let cm = 0; cm <= maxCm; cm += step) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(cm));
    ctx.lineTo(w - PAD.r, y(cm));
    ctx.stroke();
    ctx.fillText(String(cm), 4, y(cm) + 3);
  }
  ctx.fillText(`−${past / 60} min`, PAD.l, h - 3);
  ctx.textAlign = forecast ? 'center' : 'right';
  ctx.fillText('now', forecast ? x(now) : w - PAD.r, h - 3);
  if (forecast) {
    ctx.textAlign = 'right';
    ctx.fillText(`+${Math.round((forecast[forecast.length - 1].t - now) / 60)} min`, w - PAD.r, h - 3);
  }
  ctx.textAlign = 'left';

  ctx.setLineDash([3, 3]);
  for (const [status, m] of [['ADVISORY', THRESHOLDS.advisory], ['WARNING', THRESHOLDS.warning], ['EVACUATE', THRESHOLDS.evacuate]] as const) {
    ctx.strokeStyle = statusCss(status);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(m * 100));
    ctx.lineTo(w - PAD.r, y(m * 100));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (pts.length < 2) return;

  const grad = ctx.createLinearGradient(0, PAD.t, 0, h - PAD.b);
  grad.addColorStop(0, 'rgba(233,238,243,0.22)');
  grad.addColorStop(1, 'rgba(233,238,243,0)');
  ctx.beginPath();
  pts.forEach((r, i) => (i ? ctx.lineTo(x(r.t), y(r.level * 100)) : ctx.moveTo(x(r.t), y(r.level * 100))));
  ctx.lineTo(x(pts[pts.length - 1].t), y(0));
  ctx.lineTo(x(pts[0].t), y(0));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  pts.forEach((r, i) => (i ? ctx.lineTo(x(r.t), y(r.level * 100)) : ctx.moveTo(x(r.t), y(r.level * 100))));
  ctx.strokeStyle = '#e9eef3';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (forecast) drawForecast(ctx, forecast, x, y, now, h);
}

/** "Now" marker, the error band and the dashed forecast line. */
function drawForecast(ctx: CanvasRenderingContext2D, f: ChartForecast, x: (t: number) => number, y: (cm: number) => number, now: number, h: number): void {
  ctx.strokeStyle = 'rgba(233,238,243,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x(now), PAD.t);
  ctx.lineTo(x(now), h - PAD.b);
  ctx.stroke();
  ctx.beginPath();
  f.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y((p.level + p.err) * 100)) : ctx.moveTo(x(p.t), y((p.level + p.err) * 100))));
  [...f].reverse().forEach((p) => ctx.lineTo(x(p.t), y((p.level - p.err) * 100)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,200,61,0.14)';
  ctx.fill();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = '#ffc83d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  f.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.level * 100)) : ctx.moveTo(x(p.t), y(p.level * 100))));
  ctx.stroke();
  ctx.setLineDash([]);
}
