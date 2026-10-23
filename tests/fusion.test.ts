import { describe, expect, it } from 'vitest';
import { FaultInjector } from '../src/fusion/faults';
import { Fusion, type FusionResult } from '../src/fusion/fusion';

const cam = (level: number | null, low = false) => ({ level, low });

/** One reading a second for `secs`, with a millimetre of jitter so the ultrasonic doesn't look frozen. */
function run(f: Fusion, secs: number, u: number, c: number | null, low = false): FusionResult {
  let r!: FusionResult;
  for (let t = 0; t <= secs; t++) r = f.update(t, u + (t % 2) * 0.001, cam(c, low));
  return r;
}

describe('Fusion', () => {
  it('trusts the ultrasonic when both sensors agree', () => {
    const r = run(new Fusion(), 5, 2.0, 2.04);
    expect(r.source).toBe('fused');
    expect(r.fault).toBeNull();
    expect(r.level).toBeCloseTo(2.0, 2);
  });

  it('spots a frozen ultrasonic and follows the camera', () => {
    const f = new Fusion();
    let r!: FusionResult;
    for (let t = 0; t < 8; t++) r = f.update(t, 2.0, cam(2.5));
    expect(r.source).toBe('camera');
    expect(r.fault).toMatch(/frozen/);
    expect(r.level).toBe(2.5);
  });

  it('spots erratic echoes', () => {
    const f = new Fusion();
    f.update(0, 2.0, cam(2.0));
    f.update(1, 3.0, cam(2.0));
    const r = f.update(2, 2.0, cam(2.0));
    expect(r.source).toBe('camera');
    expect(r.fault).toMatch(/erratic/);
  });

  it('fails safe when the sensors disagree for no known reason', () => {
    const high = run(new Fusion(), 30, 2.0, 2.6);
    expect(high.fault).toMatch(/disagree/);
    expect(high.level).toBe(2.6);
    const low = run(new Fusion(), 30, 3.0, 2.4);
    expect(low.fault).toMatch(/disagree/);
    expect(low.source).toBe('ultrasonic');
    expect(low.level).toBeCloseTo(3.0, 2);
  });

  it('waits out the disagreement window before raising a fault', () => {
    expect(run(new Fusion(), 20, 2.0, 2.6).fault).toBeNull();
  });

  it('counts a low-water camera reading as agreement', () => {
    const r = run(new Fusion(), 40, 1.0, 1.5, true);
    expect(r.fault).toBeNull();
    expect(r.source).toBe('ultrasonic');
  });

  it('carries on with the ultrasonic when the camera sees nothing', () => {
    const r = run(new Fusion(), 5, 2.0, null);
    expect(r.source).toBe('ultrasonic');
    expect(r.fault).toBe('Gauge camera unavailable');
  });

  it('forgets its history on reset', () => {
    const f = new Fusion();
    run(f, 30, 2.0, 2.6);
    f.reset();
    expect(f.update(31, 2.0, cam(2.6)).fault).toBeNull();
  });
});

describe('FaultInjector', () => {
  it('passes the true distance through when nothing is broken', () => {
    expect(new FaultInjector().ultrasonic(4.2, 100)).toBe(4.2);
  });

  it('sticks on the distance it had when the fault began', () => {
    const f = new FaultInjector();
    f.start('stuck', 0, 4.2);
    expect(f.ultrasonic(3.0, 60)).toBe(4.2);
    f.stop();
    expect(f.ultrasonic(3.0, 60)).toBe(3.0);
  });

  it('drifts 5 cm per simulated minute', () => {
    const f = new FaultInjector();
    f.start('drift', 100, 4.0);
    expect(f.ultrasonic(4.0, 220)).toBeCloseTo(4.1);
  });

  it('only ever spikes toward a nearer, too-early echo', () => {
    const inj = new FaultInjector();
    inj.start('spikes', 0, 4.0);
    for (let i = 0; i < 200; i++) expect(inj.ultrasonic(4.0, i)).toBeLessThanOrEqual(4.0);
  });
});
