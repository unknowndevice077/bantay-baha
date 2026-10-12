/**
 * Barangay site plan: house list, public buildings and an obstacle map used to
 * keep trees off roads/buildings. Everything is deterministic.
 */
import { BRIDGE_X, CANAL, COURT, DASHBOARD, EVAC_LANE_X, HALL, POLE_X, ROAD_Z, riverZ } from '../config';
import { mulberry32 } from '../util';
import { groundHeight } from './terrain';

export type HouseType = 'concrete' | 'twoStorey' | 'nipa' | 'hall';

export interface HousePlan {
  type: HouseType;
  x: number;
  z: number;
  /** Footprint along x / z (rotation is only ever 0 or π). */
  w: number;
  d: number;
  /** Wall height above floor. */
  h: number;
  /** Local +z is the front (door side). */
  rot: number;
  floorY: number;
  /** Bottom of the walls (buried slightly on slopes). */
  baseY: number;
  stilt: number;
  roofH: number;
  wall: number;
  roof: number;
}

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const obstacles: Rect[] = [];
const block = (x: number, z: number, w: number, d: number): void => {
  obstacles.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
};

/** [min, max] ground height over a rectangular footprint. */
export function footprintRange(x: number, z: number, w: number, d: number): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const h = groundHeight(x - w / 2 + (w * i) / 4, z - d / 2 + (d * j) / 4);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return [lo, hi];
}

/** True when (x, z) is clear of buildings, roads, lanes, the canal and the river channel. */
export function isOpenGround(x: number, z: number, clearance: number): boolean {
  if (Math.abs(z - riverZ(x)) < 11) return false;
  return !obstacles.some((r) => x > r.x0 - clearance && x < r.x1 + clearance && z > r.z0 - clearance && z < r.z1 + clearance);
}

// Roads, lanes and public spaces.
block(0, ROAD_Z, 200, 7);
block(0, 34, 200, 3);
block(0, 50, 200, 3);
block(EVAC_LANE_X, 37, 3.5, 34);
block(BRIDGE_X, -55, 7, 90);
block(CANAL.x, 30, 5, 50);
block(POLE_X, riverZ(POLE_X) + 10, 4, 6);
block(HALL.x, HALL.z, HALL.w + 4, HALL.d + 4);
block(COURT.x, COURT.z, COURT.w + 2, COURT.d + 2);
block(DASHBOARD.x, DASHBOARD.z, 6, 3);

const rnd = mulberry32(1987);
const pick = <T>(items: T[]): T => items[Math.floor(rnd() * items.length)];
const WALLS = [0xd9e8d0, 0xf2d4b7, 0xcfe0ee, 0xf3ecd2, 0xf0c9cf, 0xf5e6a8, 0xe0e0e0];
const ROOFS = [0x3d6e9e, 0xa4442e, 0x4c7a4a, 0x8a8f94, 0xb85c2c];

function plan(type: HouseType, x: number, z: number, rot: number): HousePlan {
  const nipa = type === 'nipa';
  const two = type === 'twoStorey';
  const w = nipa ? 5 + rnd() : two ? 7 + rnd() : 6 + rnd() * 1.2;
  const d = nipa ? 4.5 : two ? 6 : 5 + rnd();
  const [gMin, gMax] = footprintRange(x, z, w, d);
  const stilt = nipa ? 1.6 : 0;
  const floorY = gMax + (nipa ? stilt : 0.25);
  block(x, z, w + 3, d + 3);
  return {
    type,
    x,
    z,
    w,
    d,
    h: nipa ? 2.4 : two ? 5.6 : 2.9 + rnd() * 0.3,
    rot,
    floorY,
    baseY: nipa ? floorY : gMin - 0.3,
    stilt,
    roofH: nipa ? 1.8 : 1.2,
    wall: nipa ? 0xb59a64 : pick(WALLS),
    roof: nipa ? 0x8c7448 : pick(ROOFS),
  };
}

const ROW1 = [-70, -55, -38, -12, 10, 34, 50, 68];
const ROW2: [number, HouseType][] = [
  [-64, 'twoStorey'],
  [-46, 'concrete'],
  [-30, 'twoStorey'],
  [-10, 'concrete'],
  [12, 'concrete'],
  [40, 'twoStorey'],
  [60, 'concrete'],
];

/** 23 homes: concrete rows facing the road and lanes, nipa stilt houses on both banks, a few 2-storey. */
export const HOUSES: HousePlan[] = [
  ...ROW1.map((x) => plan('concrete', x, 28, Math.PI)),
  ...ROW2.map(([x, t]) => plan(t, x, 42, Math.PI)),
  ...[-80, -62, -45].map((x) => plan('nipa', x, riverZ(x) + 14.5, 0)),
  ...[45, 60, 75].map((x) => plan('nipa', x, riverZ(x) - 14.5, Math.PI)),
  plan('twoStorey', -40, 56, Math.PI),
  plan('twoStorey', 46, 57, Math.PI),
];

const [hallMin, hallMax] = footprintRange(HALL.x, HALL.z, HALL.w + 4, HALL.d + 4);
export const HALL_PAD = { top: hallMax + 0.15, bottom: hallMin - 0.3 };
export const HALL_PLAN: HousePlan = {
  type: 'hall',
  x: HALL.x,
  z: HALL.z,
  w: HALL.w,
  d: HALL.d,
  h: HALL.h,
  rot: Math.PI,
  floorY: HALL_PAD.top,
  baseY: HALL_PAD.top,
  stilt: 0,
  roofH: 1.6,
  wall: 0xf1ead8,
  roof: 0x2f5d8c,
};

const [courtMin, courtMax] = footprintRange(COURT.x, COURT.z, COURT.w, COURT.d);
export const COURT_PAD = { top: courtMax + 0.1, bottom: courtMin - 0.2 };

/** Entrance stairs climbing from the lane up onto the hall's raised pad. */
const padFront = HALL.z - (HALL.d + 4) / 2;
export const HALL_STAIRS = { x: HALL.x, width: 4, z0: padFront - 2.4, z1: padFront };
/** The hall's front door (local +z of the hall faces world −z). */
export const HALL_DOOR = { x: HALL.x, z: HALL.z - HALL.d / 2 };
/** Floor area inside the hall where evacuees wait. */
export const HALL_INSIDE = { x: HALL.x, z: HALL.z + 0.4, halfW: HALL.w / 2 - 1.4, halfD: HALL.d / 2 - 1.6 };
/** Where evacuees queue at the foot of the stairs before going in. */
export const ASSEMBLY = { x: HALL.x, z: HALL_STAIRS.z0 - 1 };
