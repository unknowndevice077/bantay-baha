/**
 * Bantay Baha+ feature switches. Each add-on reads its flag and does nothing
 * when it is off, so the core simulator never depends on an add-on working.
 * Choices are remembered per browser (falls back to defaults if storage is blocked).
 */
export type PlusFlag = 'forecast' | 'fusion';

const KEY = 'bantay-baha-plus';
const DEFAULTS: Record<PlusFlag, boolean> = { forecast: true, fusion: true };

function load(): Record<PlusFlag, boolean> {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const plus = load();
const listeners: ((flag: PlusFlag, on: boolean) => void)[] = [];

export function setPlus(flag: PlusFlag, on: boolean): void {
  plus[flag] = on;
  try {
    localStorage.setItem(KEY, JSON.stringify(plus));
  } catch {
    // storage blocked: keep the choice for this session only
  }
  for (const l of listeners) l(flag, on);
}

export function onPlus(listener: (flag: PlusFlag, on: boolean) => void): void {
  listeners.push(listener);
}
