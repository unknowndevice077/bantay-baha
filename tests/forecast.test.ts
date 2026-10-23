import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES, featuresOf, loadModel, type Sample } from '../src/forecast/model';

/** One sample a minute for `mins` minutes: the level climbs 1 cm a minute from 1.0 m, rain is steady. */
function storm(mins: number, rain = 20): Sample[] {
  return Array.from({ length: mins + 1 }, (_, m) => ({ t: m * 60, level: 1.0 + m * 0.01, rain }));
}

describe('featuresOf', () => {
  it('returns one value per named feature', () => {
    expect(featuresOf(storm(40))).toHaveLength(FEATURES.length);
  });

  it('measures level change over the last 5, 10, 20 and 30 minutes', () => {
    const f = featuresOf(storm(40));
    expect(f[0]).toBeCloseTo(1.4);
    expect(f[1]).toBeCloseTo(0.5);
    [0.05, 0.1, 0.2, 0.3].forEach((want, i) => expect(f[2 + i]).toBeCloseTo(want));
  });

  it('uses the oldest sample when there is not enough history yet', () => {
    expect(featuresOf(storm(3))[5]).toBeCloseTo(0.03);
  });

  it('knows when the rain is picking up', () => {
    const h = storm(40).map((s) => ({ ...s, rain: s.t < 2000 ? 5 : 25 }));
    expect(featuresOf(h)[9]).toBeGreaterThan(0);
  });
});

function mockModel(model: unknown, check: { x: number[][]; y: number[][] }, type = 'application/json'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': type }),
      json: async () => ({ version: 1, features: FEATURES, horizonsMin: [30, 60], validationMaeM: [0.1, 0.2], model, check }),
    })),
  );
}

const x = [0.5, 0.25, ...Array<number>(FEATURES.length - 2).fill(0)];
const unit = (i: number) => FEATURES.map((_, j) => (i === j ? 1 : 0));
const ridge = { type: 'ridge', mean: FEATURES.map(() => 0), scale: FEATURES.map(() => 1), coef: [unit(0), unit(1)], intercept: [0, 0] };

afterEach(() => vi.unstubAllGlobals());

describe('loadModel', () => {
  it('runs a ridge model and checks it against its reference values', async () => {
    mockModel(ridge, { x: [x], y: [[0.5, 0.25]] });
    const m = await loadModel();
    expect(m.horizonsMin).toEqual([30, 60]);
    expect(m.predict(x)).toEqual([0.5, 0.25]);
  });

  it('walks the trees of a boosted model', async () => {
    const tree = { f: [0, 0, 0], t: [1.0, 0, 0], l: [1, -1, -1], r: [2, -1, -1], v: [0, 0.1, 0.5] };
    const gbr = {
      type: 'gbr',
      horizons: [
        { init: 0.2, lr: 1, trees: [tree] },
        { init: 0, lr: 1, trees: [] },
      ],
    };
    const pad = (v: number) => [v, ...Array<number>(FEATURES.length - 1).fill(0)];
    mockModel(gbr, {
      x: [pad(0.5), pad(2)],
      y: [
        [0.3, 0],
        [0.7, 0],
      ],
    });
    const m = await loadModel();
    expect(m.predict(pad(0.5))[0]).toBeCloseTo(0.3);
    expect(m.predict(pad(2))[0]).toBeCloseTo(0.7);
  });

  it('refuses a model whose answers do not match its own reference values', async () => {
    mockModel(ridge, { x: [x], y: [[0.9, 0.9]] });
    await expect(loadModel()).rejects.toThrow(/reference values/);
  });

  it('refuses an HTML page served in place of the model', async () => {
    mockModel({}, { x: [], y: [] }, 'text/html');
    await expect(loadModel()).rejects.toThrow(/missing/);
  });
});
