/** Level-vs-time chart for the operations dashboard (10 min … 24 h windows, threshold bands). */
import { THRESHOLDS, statusCss } from '../config';
import type { Point } from '../net/protocol';

const PAD = { l: 44, r: 12, t: 12, b: 26 };

const timeLabel = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** @param now right edge of the window (latest point time; the simulator's clock can run fast) */
export function drawLevelChart(canvas: HTMLCanvasElement, points: Point[], rangeMs: number, now: number): void {
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

  const t0 = now - rangeMs;
  const pts = points.filter((p) => p.at >= t0);
  const peak = Math.max(400, ...pts.map((p) => p.level * 100));
  const maxCm = Math.ceil((peak + 30) / 100) * 100;
  const x = (t: number) => PAD.l + ((t - t0) / rangeMs) * (w - PAD.l - PAD.r);
  const y = (cm: number) => h - PAD.b - (cm / maxCm) * (h - PAD.t - PAD.b);

  // Status bands behind the data.
  const bands: [number, number, Parameters<typeof statusCss>[0]][] = [
    [THRESHOLDS.advisory * 100, THRESHOLDS.warning * 100, 'ADVISORY'],
    [THRESHOLDS.warning * 100, THRESHOLDS.evacuate * 100, 'WARNING'],
    [THRESHOLDS.evacuate * 100, maxCm, 'EVACUATE'],
  ];
  for (const [lo, hi, s] of bands) {
    ctx.fillStyle = statusCss(s);
    ctx.globalAlpha = 0.1;
    ctx.fillRect(PAD.l, y(hi), w - PAD.l - PAD.r, y(lo) - y(hi));
    ctx.globalAlpha = 0.8;
    ctx.fillRect(PAD.l, y(lo), w - PAD.l - PAD.r, 1);
  }
  ctx.globalAlpha = 1;

  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = '#566576';
  ctx.strokeStyle = 'rgba(15,34,56,0.08)';
  const step = maxCm > 600 ? 200 : 100;
  for (let cm = 0; cm <= maxCm; cm += step) {
    ctx.beginPath();
    ctx.moveTo(PAD.l, y(cm));
    ctx.lineTo(w - PAD.r, y(cm));
    ctx.stroke();
    ctx.fillText(`${cm}`, 6, y(cm) + 4);
  }
  for (let i = 0; i <= 4; i++) {
    const t = t0 + (rangeMs * i) / 4;
    ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
    ctx.fillText(timeLabel(t), x(t), h - 8);
  }
  ctx.textAlign = 'left';

  if (pts.length < 2) {
    ctx.fillText('Waiting for data', PAD.l + 10, PAD.t + 20);
    return;
  }
  const grad = ctx.createLinearGradient(0, PAD.t, 0, h - PAD.b);
  grad.addColorStop(0, 'rgba(15,34,56,0.12)');
  grad.addColorStop(1, 'rgba(15,34,56,0)');
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(x(p.at), y(p.level * 100)) : ctx.moveTo(x(p.at), y(p.level * 100))));
  ctx.lineTo(x(pts[pts.length - 1].at), y(0));
  ctx.lineTo(x(pts[0].at), y(0));
  ctx.fillStyle = grad;
  ctx.fill();
  // Line segments coloured by the status at each sample.
  ctx.lineWidth = 2;
  for (let i = 1; i < pts.length; i++) {
    ctx.strokeStyle = statusCss(pts[i].status);
    ctx.beginPath();
    ctx.moveTo(x(pts[i - 1].at), y(pts[i - 1].level * 100));
    ctx.lineTo(x(pts[i].at), y(pts[i].level * 100));
    ctx.stroke();
  }
}
