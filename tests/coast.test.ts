import { describe, expect, it } from 'vitest';
import { COAST, coastStatus, filtered, forecast, HOUR, nextHighTide, surge, tide, type Storm } from '../src/coast/model';
import { coastAdvisory } from '../src/coast/templates';
import { STATUSES, type Lang } from '../src/state';

const storm = (signal: number, landfallH = 40): Storm => ({ signal, landfall: landfallH * HOUR });

describe('coastal model', () => {
  it('tide stays within a normal range', () => {
    for (let t = 0; t < 72 * HOUR; t += 600) expect(Math.abs(tide(t))).toBeLessThan(1.2);
  });

  it('surge peaks at landfall and is gone a day later', () => {
    const s = storm(4);
    expect(surge(s.landfall, s)).toBeCloseTo(2.6, 5);
    expect(surge(s.landfall + 24 * HOUR, s)).toBeLessThan(0.01);
  });

  it('finds a high tide within the next 13 hours', () => {
    const h = nextHighTide(0);
    expect(h.at).toBeGreaterThan(0);
    expect(h.at).toBeLessThan(13.5 * HOUR);
    expect(h.height).toBeGreaterThan(tide(h.at - HOUR));
  });

  it('the filter takes most of the waves out', () => {
    const s = storm(5);
    let maxDiff = 0;
    for (let t = s.landfall - HOUR; t < s.landfall + HOUR; t += 120)
      maxDiff = Math.max(maxDiff, Math.abs(filtered(t, s) - tide(t) - surge(t, s)));
    expect(maxDiff).toBeLessThan(0.3);
  });
});

describe('coastal alerts', () => {
  it('stays NORMAL with no storm in range', () => {
    const s = storm(3, 100);
    const f = forecast(0, s);
    expect(f.outlook).toBe(false);
    expect(coastStatus(0, f, filtered(0, s))).toBe('NORMAL');
  });

  it('a strong typhoon escalates hours before landfall, not at it', () => {
    const s = storm(5);
    const firstAt = (want: string) => {
      for (let t = 0; t < s.landfall; t += 900) if (coastStatus(t, forecast(t, s), filtered(t, s)) === want) return t;
      return Infinity;
    };
    expect(s.landfall - firstAt('WARNING')).toBeGreaterThan(5 * HOUR);
    expect(s.landfall - firstAt('EVACUATE')).toBeGreaterThan(2 * HOUR);
  });

  it('a weak storm never reaches EVACUATE', () => {
    const s = storm(1);
    for (let t = 0; t < s.landfall + 12 * HOUR; t += 900) expect(coastStatus(t, forecast(t, s), filtered(t, s))).not.toBe('EVACUATE');
  });

  it('forecast peak is above the seawall for a signal 4 storm', () => {
    const s = storm(4);
    expect(forecast(s.landfall - 10 * HOUR, s).peak.level).toBeGreaterThan(COAST.seawall);
  });

  it('every advisory renders in every language with no placeholder left', () => {
    for (const lang of ['en', 'tl', 'ceb', 'war'] as Lang[])
      for (const st of STATUSES) {
        for (const eta of [5, 0]) {
          const text = coastAdvisory(lang, st, { level: 1.2, surge: 0.8, peak: 2.6, eta });
          expect(text).not.toMatch(/[{}]/);
        }
      }
  });
});
