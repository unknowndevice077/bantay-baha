/**
 * Alert classification shared by the simulator's monitor and the operations
 * dashboard: level thresholds with hysteresis, plus one-step escalation when
 * the water rises fast (flash-flood behaviour).
 */
import { RATE_ESCALATE_CM, THRESHOLDS } from '../config';
import { STATUSES, type Status } from '../state';

/** Level must drop this far below a threshold before the status steps down. */
const HYSTERESIS = 0.08;

/** @param level m above datum @param rate cm per 10 min @param current status before this reading */
export function classifyStatus(level: number, rate: number, current: Status): Status {
  const cur = STATUSES.indexOf(current);
  const limits = [THRESHOLDS.advisory, THRESHOLDS.warning, THRESHOLDS.evacuate];
  let idx = 0;
  limits.forEach((lim, i) => {
    if (level >= lim - (cur > i ? HYSTERESIS : 0)) idx = i + 1;
  });
  // A fast rise counts one step above what the level alone says, never more: measured from the
  // plain level (no hysteresis), so a status that was itself raised by a fast rise isn't raised again.
  const byLevel = limits.filter((lim) => level >= lim).length;
  const fast = rate >= RATE_ESCALATE_CM || (cur > byLevel && rate >= RATE_ESCALATE_CM * 0.6);
  if (fast && level >= THRESHOLDS.advisory - 0.5) idx = Math.max(idx, Math.min(3, byLevel + 1));
  return STATUSES[idx];
}

/** Rise rate in cm per 10 minutes from (time s, level m) samples, scaled up after the first minute of data. */
export function riseRate(samples: { t: number; level: number }[], t: number, level: number): number {
  const old = samples.find((h) => h.t >= t - 600);
  if (!old || t - old.t < 60) return 0;
  return ((level - old.level) * 100 * 600) / (t - old.t);
}
