/** What a person standing at (x, z) walks on: bridge deck, hall stairs/pad, court pad, canal culverts, house floors and steps, or the ground. */
import { COURT, HALL } from '../config';
import { clamp } from '../util';
import { BRIDGE, culvertTop, deckTop, pavedTop } from './infrastructure';
import { COURT_PAD, HALL_PAD, HALL_STAIRS, HOUSES, frontSteps, roomFloor, stepTop, toLocal } from './layout';
import { groundHeight } from './terrain';

/** Inside a home, on a nipa house's raised porch, or on its front steps; null elsewhere. */
function houseHeight(x: number, z: number): number | null {
  for (const p of HOUSES) {
    if (Math.abs(x - p.x) > p.w / 2 + 4 || Math.abs(z - p.z) > p.d / 2 + 4) continue;
    const [lx, lz] = toLocal(p, x, z);
    const floor = roomFloor(p);
    if (Math.abs(lx) < p.w / 2 && Math.abs(lz) < p.d / 2) return floor;
    if (p.type === 'nipa' && Math.abs(lx) < p.w / 2 + 0.3 && lz > -p.d / 2 - 0.3 && lz < p.d / 2 + 0.9) return floor;
    const steps = frontSteps(p);
    if (Math.abs(lx) < steps.halfW && lz >= steps.start && lz < steps.start + steps.length) {
      // Concrete steps tread by tread; the nipa house's bamboo stairs as a slope.
      if (steps.count) return stepTop(p, steps, lz);
      const t = (lz - steps.start) / steps.length;
      return floor + (groundHeight(x, z) - floor) * t;
    }
  }
  return null;
}

export function walkHeight(x: number, z: number): number {
  if (Math.abs(x - BRIDGE.x) < BRIDGE.width / 2 && Math.abs(z - BRIDGE.zc) < BRIDGE.half) return deckTop(z);
  if (Math.abs(x - HALL.x) < (HALL.w + 4) / 2 && z >= HALL_STAIRS.z1 && z <= HALL.z + (HALL.d + 4) / 2) return HALL_PAD.top;
  if (Math.abs(x - HALL_STAIRS.x) < HALL_STAIRS.width / 2 && z > HALL_STAIRS.z0 && z < HALL_STAIRS.z1) {
    const t = clamp((z - HALL_STAIRS.z0) / (HALL_STAIRS.z1 - HALL_STAIRS.z0), 0, 1);
    const g = groundHeight(x, z);
    return g + (HALL_PAD.top - g) * t;
  }
  if (Math.abs(x - COURT.x) < (COURT.w + 1) / 2 && Math.abs(z - COURT.z) < (COURT.d + 1) / 2) return COURT_PAD.top;
  return culvertTop(x, z) ?? houseHeight(x, z) ?? pavedTop(x, z) ?? groundHeight(x, z);
}
