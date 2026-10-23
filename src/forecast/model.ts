/**
 * Forecast features and model inference, mirroring tools/forecast/features.py
 * and the model exported by tools/forecast/train.py (public/forecast/model.json).
 * The JSON carries reference inputs/outputs; loadModel() re-runs them and
 * refuses a model whose answers don't match, rather than show wrong numbers.
 */

/** Base level the catchment drains toward (LEVEL.base in config.ts), m. */
const BASE_LEVEL = 0.9;

export const FEATURES = [
  'level_m',
  'excess_m',
  'd5_m',
  'd10_m',
  'd20_m',
  'd30_m',
  'rain_mmhr',
  'rain10_mmhr',
  'rain30_mmhr',
  'rain_trend_mmhr',
];

/** One sample of the forecaster's own history: simulated time (s), level (m), rainfall (mm/hr). */
export interface Sample {
  t: number;
  level: number;
  rain: number;
}

/** Level `minutes` ago (nearest sample at or before; the earliest one stands in before history starts). */
function levelAgo(h: Sample[], minutes: number): number {
  const t = h[h.length - 1].t - minutes * 60;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i].level;
  return h[0].level;
}

function rainAgo(h: Sample[], minutes: number): number {
  const t = h[h.length - 1].t - minutes * 60;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i].rain;
  return h[0].rain;
}

/** Mean rainfall over the last `minutes`. */
function rainMean(h: Sample[], minutes: number): number {
  const from = h[h.length - 1].t - minutes * 60;
  let sum = 0;
  let n = 0;
  for (let i = h.length - 1; i >= 0 && h[i].t > from; i--) {
    sum += h[i].rain;
    n++;
  }
  return n ? sum / n : h[h.length - 1].rain;
}

export function featuresOf(h: Sample[]): number[] {
  const now = h[h.length - 1];
  const l0 = now.level;
  return [
    l0,
    l0 - BASE_LEVEL,
    l0 - levelAgo(h, 5),
    l0 - levelAgo(h, 10),
    l0 - levelAgo(h, 20),
    l0 - levelAgo(h, 30),
    now.rain,
    rainMean(h, 10),
    rainMean(h, 30),
    now.rain - rainAgo(h, 10),
  ];
}

interface Tree {
  f: number[];
  t: number[];
  l: number[];
  r: number[];
  v: number[];
}

interface ModelFile {
  version: number;
  features: string[];
  horizonsMin: number[];
  validationMaeM: number[];
  model:
    | { type: 'ridge'; mean: number[]; scale: number[]; coef: number[][]; intercept: number[] }
    | { type: 'gbr'; horizons: { init: number; lr: number; trees: Tree[] }[] };
  check: { x: number[][]; y: number[][] };
}

export interface Model {
  horizonsMin: number[];
  /** Typical error per horizon on validation storms (m), drawn as the band around the forecast line. */
  maeM: number[];
  /** Predicted level change (m) at each horizon. */
  predict(x: number[]): number[];
}

function predictor(file: ModelFile): (x: number[]) => number[] {
  const m = file.model;
  if (m.type === 'ridge') {
    return (x) => m.coef.map((row, k) => m.intercept[k] + row.reduce((s, c, i) => s + c * ((x[i] - m.mean[i]) / m.scale[i]), 0));
  }
  return (x) =>
    m.horizons.map((h) => {
      let acc = h.init;
      for (const tree of h.trees) {
        let node = 0;
        while (tree.l[node] !== -1) node = x[tree.f[node]] <= tree.t[node] ? tree.l[node] : tree.r[node];
        acc += h.lr * tree.v[node];
      }
      return acc;
    });
}

/** Fetch and verify the exported model. Throws with a readable reason if it can't be used. */
export async function loadModel(url = 'forecast/model.json'): Promise<Model> {
  const res = await fetch(url);
  // A missing file comes back as the HTML page from some servers, so check the type too.
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json'))
    throw new Error('model file missing (run tools/forecast/train.py)');
  const file = (await res.json()) as ModelFile;
  if (file.features.join() !== FEATURES.join()) throw new Error('model was trained on different features');
  const predict = predictor(file);
  file.check.x.forEach((x, i) => {
    const got = predict(x);
    if (got.some((v, k) => Math.abs(v - file.check.y[i][k]) > 1e-3)) throw new Error('model output does not match its reference values');
  });
  return { horizonsMin: file.horizonsMin, maeM: file.validationMaeM, predict };
}
