import { describe, expect, it } from 'vitest';
import { classifyStatus, riseRate } from '../src/sensor/status';

describe('classifyStatus', () => {
  it('follows the level thresholds', () => {
    expect(classifyStatus(1.0, 0, 'NORMAL')).toBe('NORMAL');
    expect(classifyStatus(2.0, 0, 'NORMAL')).toBe('ADVISORY');
    expect(classifyStatus(2.8, 0, 'ADVISORY')).toBe('WARNING');
    expect(classifyStatus(3.3, 0, 'WARNING')).toBe('EVACUATE');
  });

  it('holds the status a little below a threshold so it does not flicker', () => {
    expect(classifyStatus(1.95, 0, 'ADVISORY')).toBe('ADVISORY');
    expect(classifyStatus(1.9, 0, 'ADVISORY')).toBe('NORMAL');
    expect(classifyStatus(2.75, 0, 'WARNING')).toBe('WARNING');
  });

  it('goes up one step when the water rises fast', () => {
    expect(classifyStatus(1.6, 30, 'NORMAL')).toBe('ADVISORY');
    expect(classifyStatus(2.1, 30, 'NORMAL')).toBe('WARNING');
  });

  it('ignores a fast rise while the creek is still far below the alert range', () => {
    expect(classifyStatus(1.0, 50, 'NORMAL')).toBe('NORMAL');
  });

  it('does not raise a status that a fast rise already raised', () => {
    // WARNING came from the rate at 275 cm; the same rate must not push it on to EVACUATE.
    expect(classifyStatus(2.75, 35, 'WARNING')).toBe('WARNING');
  });
});

describe('riseRate', () => {
  it('is cm per 10 minutes', () => {
    expect(riseRate([{ t: 0, level: 1.0 }], 600, 1.5)).toBeCloseTo(50);
  });

  it('scales a shorter window up to 10 minutes', () => {
    expect(riseRate([{ t: 0, level: 1.0 }], 300, 1.25)).toBeCloseTo(50);
  });

  it('says nothing until there is a minute of data', () => {
    expect(riseRate([], 600, 1.5)).toBe(0);
    expect(riseRate([{ t: 560, level: 1.0 }], 600, 1.5)).toBe(0);
  });

  it('is negative when the creek falls', () => {
    expect(riseRate([{ t: 0, level: 2.0 }], 600, 1.9)).toBeCloseTo(-10);
  });
});
