/**
 * Procedural textures, generated on canvases at startup (no image assets):
 * tileable detail/colour maps, normal maps derived from height fields, and
 * alpha-cut foliage. Colour maps are near-white so instance/vertex colours tint them.
 */
import * as THREE from 'three';
import { mulberry32 } from '../util';

/** Memoize a builder: textures are generated once and shared. */
const once = <T>(build: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= build());
};

export interface Surface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

/** Tileable value-noise fBm in [0, 1]. */
function fbm(size: number, cells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  const rnd = mulberry32(seed);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o;
    const grid = Float32Array.from({ length: c * c }, () => rnd());
    const at = (i: number, j: number) => grid[((j + c) % c) * c + ((i + c) % c)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * c;
        const gy = (y / size) * c;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
        const bot = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
        out[y * size + x] += (top + (bot - top) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function toTexture(canvas: HTMLCanvasElement, color: boolean, repeat: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  return tex;
}

function canvas(size: number, w = size): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = size;
  return [c, c.getContext('2d')!];
}

/** Grayscale colour map: brightness = lo..hi across the height field. */
function grayMap(h: Float32Array, size: number, lo: number, hi: number, repeat: [number, number]): THREE.CanvasTexture {
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < h.length; i++) {
    const v = Math.round((lo + (hi - lo) * h[i]) * 255);
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, true, repeat);
}

/** Tangent-space normal map from a wrapping height field. */
function normalMap(h: Float32Array, size: number, strength: number, repeat: [number, number]): THREE.CanvasTexture {
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      img.data.set([((-dx / len) * 0.5 + 0.5) * 255, ((dy / len) * 0.5 + 0.5) * 255, (1 / len) * 255, 255], (y * size + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, false, repeat);
}

function surface(h: Float32Array, size: number, lo: number, hi: number, strength: number, repeat: [number, number]): Surface {
  return { map: grayMap(h, size, lo, hi, repeat), normalMap: normalMap(h, size, strength, repeat) };
}

/** Soil + grass grain for the terrain (multiplied by its vertex colours). */
export const groundSurface = once((): Surface => {
  const h = fbm(256, 8, 5, 3);
  return surface(h, 256, 0.72, 1.12, 6, [60, 60]);
});

/** Cement plaster for walls: fine grain with a few soft blotches. */
export const plasterSurface = once((): Surface => {
  const h = fbm(256, 4, 6, 7);
  return surface(h, 256, 0.82, 1.0, 3, [1, 1]);
});

/** Bare concrete (bridge, canal, pads). */
export const concreteSurface = once((): Surface => {
  const h = fbm(256, 16, 4, 11);
  return surface(h, 256, 0.8, 1.05, 4, [4, 4]);
});

export const asphaltNormal = once((): THREE.Texture => {
  return normalMap(fbm(256, 32, 3, 13), 256, 3, [1, 1]);
});

/** Corrugated GI sheet: ridges run down the slope, plus faint rust streaks in the colour map. */
export const corrugatedSurface = once((): Surface => {
  const size = 256;
  const h = new Float32Array(size * size);
  const streaks = fbm(size, 4, 3, 17);
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      h[i] = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * 48);
      // Rust runs in streaks down the slope: sample one noise row so it varies across, not along.
      const rust = Math.max(0, streaks[x] - 0.55) * 1.6;
      img.data.set([255 - rust * 40, 255 - rust * 80, 255 - rust * 110, 255], i * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c, true, [1, 1]), normalMap: normalMap(h, size, 9, [1, 1]) };
});

/** Nipa/cogon thatch: dense strands running down the slope. */
export const thatchSurface = once((): Surface => {
  const size = 256;
  const rnd = mulberry32(23);
  const h = new Float32Array(size * size);
  for (let x = 0; x < size; x++) {
    const phase = rnd() * size;
    const k = 0.4 + rnd() * 0.6;
    for (let y = 0; y < size; y++) h[y * size + x] = k * (0.6 + 0.4 * Math.sin((y + phase) * 0.2));
  }
  return surface(h, size, 0.7, 1.05, 5, [3, 2]);
});

/** Palm bark: leaf-scar rings around the trunk. */
export const barkSurface = once((): Surface => {
  const size = 128;
  const n = fbm(size, 8, 3, 29);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ring = Math.abs(Math.sin((y / size) * Math.PI * 6));
      h[y * size + x] = ring * 0.7 + n[y * size + x] * 0.3;
    }
  }
  return surface(h, size, 0.65, 1.05, 6, [1, 6]);
});

/**
 * Pinnate palm frond: a midrib with many narrow leaflets (alpha-cut). u runs
 * from the base (0) to the tip (1); v runs across the leaf with the rib at 0.5.
 */
export const palmLeafTexture = once((): THREE.CanvasTexture => {
  const W = 512;
  const H = 128;
  const [c, ctx] = canvas(H, W);
  const rnd = mulberry32(31);
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const u = 0.04 + (i / 46) * 0.92;
    const len = (H / 2) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.85 + rnd() * 0.15);
    for (const side of [-1, 1]) {
      const shade = 200 + Math.round(rnd() * 55);
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.lineWidth = 4 + rnd() * 2;
      ctx.beginPath();
      ctx.moveTo(u * W, H / 2);
      ctx.lineTo(u * W + len * 0.55, H / 2 + side * len);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgb(225,205,160)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  return toTexture(c, true, [1, 1]);
});

/** Broad banana leaf with a pale midrib, parallel veins and a few wind tears. */
export const bananaLeafTexture = once((): THREE.CanvasTexture => {
  const W = 512;
  const H = 192;
  const [c, ctx] = canvas(H, W);
  const rnd = mulberry32(37);
  ctx.fillStyle = 'rgb(235,235,235)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, W / 2 - 4, H / 2 - 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,150,150,0.5)';
  ctx.lineWidth = 1.5;
  for (let x = 10; x < W; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, H / 2);
    ctx.lineTo(x + 30, 6);
    ctx.moveTo(x, H / 2);
    ctx.lineTo(x + 30, H - 6);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const x = 60 + rnd() * (W - 120);
    const top = rnd() < 0.5;
    ctx.fillRect(x, top ? 0 : H / 2 + 12, 3, H / 2 - 12);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgb(250,245,215)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  return toTexture(c, true, [1, 1]);
});

/** Grass clump: tapered blades fanning out from the bottom edge. */
export const grassTexture = once((): THREE.CanvasTexture => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rnd = mulberry32(41);
  for (let i = 0; i < 26; i++) {
    const x = S * (0.15 + rnd() * 0.7);
    const lean = (rnd() - 0.5) * 50;
    const h = S * (0.5 + rnd() * 0.5);
    const g = 170 + Math.round(rnd() * 85);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.beginPath();
    ctx.moveTo(x - 3, S);
    ctx.quadraticCurveTo(x + lean * 0.3, S - h * 0.6, x + lean, S - h);
    ctx.quadraticCurveTo(x + lean * 0.3 + 2, S - h * 0.6, x + 3, S);
    ctx.fill();
  }
  return toTexture(c, true, [1, 1]);
});

/** Radial falloff used for street-light pools on the ground. */
export const glowPoolTexture = once((): THREE.CanvasTexture => {
  const S = 128;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, true, [1, 1]);
});
