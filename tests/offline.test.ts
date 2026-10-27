import { describe, expect, it } from 'vitest';
import { smsText } from '../src/net/offline';
import { STATUSES } from '../src/state';

describe('smsText', () => {
  it('fits one GSM-7 text: plain ASCII, 160 characters or fewer', () => {
    for (const status of STATUSES)
      for (const [level, rate] of [
        [0, 0],
        [285.4, 31.6],
        [999, -120],
      ]) {
        const text = smsText(status, level, rate);
        expect(text.length).toBeLessThanOrEqual(160);
        expect(text).toMatch(/^[\x20-\x7e]+$/);
      }
  });

  it('carries the status, level and rise', () => {
    expect(smsText('WARNING', 285.4, 31.6)).toBe(
      'BANTAY BAHA bb-01 WARNING: 285cm, +32cm/10min. Low-lying homes go to the Barangay Hall now.',
    );
  });

  it('tells everyone to go at EVACUATE', () => {
    expect(smsText('EVACUATE', 340, 5)).toContain('EVERYONE');
  });
});
