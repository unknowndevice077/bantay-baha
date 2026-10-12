/** 10-minute water-level line chart drawn on a 2D canvas (with threshold lines). */
import { THRESHOLDS, statusCss } from '../config';
import type { Reading } from '../state';

const WINDOW_S = 600;
const PAD = { l: 34, r: 8, t: 8, b: 16 };

export function drawChart(canvas: HTMLCanvasElement, history: Reading[], now: number): void {
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

  const pts = history.filter((r) => r.t >= now - WINDOW_S);
  const peak = Math.max(400, ...pts.map((r) => r.level * 100));
  const maxCm = Math.ceil((peak + 20) / 100) * 100;
  const x = (t: number) => PAD.l + ((t - (now - WINDOW_S)) / WINDOW_S) * (w - PAD.l - PAD.r);
  const y = (cm: number) => h - PAD.b - (cm / maxCm) * (h - PAD.t - PAD.b);

  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth = 1;
  const step = maxCm > 500 ? 200 : 100;
  for (let cm = 0; cm <= maxCm; cm += step) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(cm));
    ctx.lineTo(w - PAD.r, y(cm));
    ctx.stroke();
    ctx.fillText(String(cm), 4, y(cm) + 3);
  }
  ctx.fillText('−10 min', PAD.l, h - 3);
  ctx.textAlign = 'right';
  ctx.fillText('now', w - PAD.r, h - 3);
  ctx.textAlign = 'left';

  ctx.setLineDash([4, 4]);
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
  grad.addColorStop(0, 'rgba(56,189,248,0.45)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.beginPath();
  pts.forEach((r, i) => (i ? ctx.lineTo(x(r.t), y(r.level * 100)) : ctx.moveTo(x(r.t), y(r.level * 100))));
  ctx.lineTo(x(pts[pts.length - 1].t), y(0));
  ctx.lineTo(x(pts[0].t), y(0));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  pts.forEach((r, i) => (i ? ctx.lineTo(x(r.t), y(r.level * 100)) : ctx.moveTo(x(r.t), y(r.level * 100))));
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 2;
  ctx.stroke();
}
