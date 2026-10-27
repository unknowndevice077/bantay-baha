import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyStatus } from '../src/sensor/status';
import type { Status } from '../src/state';

// The firmware's C++ port is checked against these same cases by firmware/test/logic_test.cpp.
const { cases } = JSON.parse(readFileSync('firmware/test-vectors.json', 'utf8')) as {
  cases: { level: number; rate: number; current: Status; expect: Status }[];
};

describe('firmware test vectors', () => {
  it('cover every status and the edges of every threshold', () => {
    expect(cases.length).toBeGreaterThan(300);
    expect(new Set(cases.map((c) => c.expect)).size).toBe(4);
    expect(new Set(cases.map((c) => c.current)).size).toBe(4);
  });

  it('still match the alert rules in src/sensor/status.ts', () => {
    // If this fails, the rules changed: regenerate firmware/test-vectors.json and firmware/test/vectors.inc,
    // then update bantay_logic.h to match.
    for (const c of cases) expect(classifyStatus(c.level, c.rate, c.current), JSON.stringify(c)).toBe(c.expect);
  });
});
