import { describe, expect, it } from 'vitest';
import { Recorder, durationOf, parseRecording, sampleAt, sampleRecording } from '../src/replay/recording';

const pts = [
  { t: 0, level: 1.0, rain: 0 },
  { t: 100, level: 2.0, rain: 50 },
];

describe('sampleAt', () => {
  it('interpolates between points', () => {
    expect(sampleAt(pts, 50)).toEqual({ level: 1.5, rain: 25 });
  });

  it('holds the first and last point outside the recording', () => {
    expect(sampleAt(pts, -10).level).toBe(1.0);
    expect(sampleAt(pts, 500)).toEqual({ level: 2.0, rain: 50 });
  });
});

describe('parseRecording', () => {
  const good = JSON.stringify({ version: 1, title: 'Night', recordedAt: '', points: pts });

  it('reads a good file', () => {
    const r = parseRecording(good);
    expect(r.title).toBe('Night');
    expect(durationOf(r)).toBe(100);
  });

  it('says what is wrong with a bad one', () => {
    expect(() => parseRecording('nope')).toThrow(/JSON/);
    expect(() => parseRecording('{"version":2,"points":[]}')).toThrow(/version 1/);
    expect(() => parseRecording(JSON.stringify({ version: 1, points: [pts[0]] }))).toThrow(/two points/);
    expect(() => parseRecording(JSON.stringify({ version: 1, points: [pts[1], pts[0]] }))).toThrow(/order/);
    expect(() => parseRecording(JSON.stringify({ version: 1, points: [pts[0], { t: 5, level: 'x', rain: 0 }] }))).toThrow(
      /missing numbers/,
    );
  });

  it('keeps levels inside what the simulator can show', () => {
    const r = parseRecording(JSON.stringify({ version: 1, points: [{ t: 0, level: 99, rain: -5 }, pts[1]] }));
    expect(r.points[0]).toEqual({ t: 0, level: 5.5, rain: 0 });
  });
});

describe('Recorder', () => {
  it('records one point every 30 seconds, starting from zero', () => {
    const r = new Recorder();
    r.start();
    for (let t = 1000; t <= 1100; t += 5) r.add(t, 1 + (t - 1000) / 100, 10);
    const rec = r.stop('x');
    expect(rec?.points.map((p) => p.t)).toEqual([0, 30, 60, 90]);
  });

  it('ignores readings while not recording, and will not keep a recording that is too short', () => {
    const r = new Recorder();
    r.add(0, 1, 0);
    expect(r.length).toBe(0);
    r.start();
    r.add(0, 1, 0);
    expect(r.stop('x')).toBeNull();
  });
});

describe('sampleRecording', () => {
  it('is the typhoon: calm start, a flood peak, then falling', () => {
    const s = sampleRecording();
    const levels = s.points.map((p) => p.level);
    const peak = Math.max(...levels);
    expect(levels[0]).toBeCloseTo(0.9);
    expect(peak).toBeGreaterThan(3.3);
    expect(levels[levels.length - 1]).toBeLessThan(peak - 1);
    expect(durationOf(s)).toBe(90 * 60);
  });
});
