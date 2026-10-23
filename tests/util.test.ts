import { describe, expect, it } from 'vitest';
import { clamp, damp, lerp, mulberry32, smoothstep } from '../src/util';

describe('util', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('smoothstep rises, and falls when the edges are swapped', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(smoothstep(0, 1, -3)).toBe(0);
    expect(smoothstep(1, 0, 0.9)).toBeLessThan(0.1);
  });

  it('damp lands on the same value however the time is sliced', () => {
    const once = damp(0, 1, 4, 1);
    let step = 0;
    for (let i = 0; i < 10; i++) step = damp(step, 1, 4, 0.1);
    expect(step).toBeCloseTo(once, 6);
  });

  it('mulberry32 gives the same barangay every time', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const run = Array.from({ length: 5 }, () => a());
    expect(run).toEqual(Array.from({ length: 5 }, () => b()));
    expect(run.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
