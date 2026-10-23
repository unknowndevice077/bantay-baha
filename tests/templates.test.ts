import { describe, expect, it } from 'vitest';
import { LANG_NAMES, renderTemplate, residentLine } from '../src/alerts/templates';
import { STATUSES, type Lang } from '../src/state';

const langs = Object.keys(LANG_NAMES) as Lang[];

describe('renderTemplate', () => {
  it('has an advisory in every language, at every status, in both voices, with no placeholder left over', () => {
    for (const lang of langs)
      for (const status of STATUSES)
        for (const lola of [false, true]) {
          const text = renderTemplate(lang, status, lola, { levelCm: 250, rateCm: 12 });
          expect(text.length).toBeGreaterThan(10);
          expect(text).not.toMatch(/[{}]/);
        }
  });

  it('puts the numbers in', () => {
    const text = renderTemplate('en', 'ADVISORY', false, { levelCm: 215.4, rateCm: 18 });
    expect(text).toContain('215 cm');
    expect(text).toContain('+18 cm');
  });

  it('calls the trend rising, falling or steady', () => {
    const word = (rateCm: number) => renderTemplate('en', 'NORMAL', false, { levelCm: 100, rateCm });
    expect(word(10)).toContain('rising');
    expect(word(-10)).toContain('falling');
    expect(word(0)).toContain('steady');
  });

  it('keeps the evacuation order clear', () => {
    expect(renderTemplate('tl', 'EVACUATE', false, { levelCm: 340, rateCm: 5 })).toContain('LUMIKAS NA');
  });
});

describe('residentLine', () => {
  it('says something different once the family is sheltered', () => {
    for (const lang of langs) expect(residentLine(lang, 'EVACUATE', true)).not.toBe(residentLine(lang, 'EVACUATE', false));
  });
});
