/**
 * Shared world and hydrology constants. Units are metres and seconds.
 * "Level" always means water stage above the river-bed gauge datum (BED_Y),
 * which is what the HUD shows in centimetres.
 */
import type { Status } from './state';

export const WORLD_SIZE = 200;
/** World y of the gauge datum (level 0 m). */
export const BED_Y = -2.2;
/** Height of the ultrasonic transducer face above the datum. distance = SENSOR_HEIGHT - level. */
export const SENSOR_HEIGHT = 7.0;
export const SENSOR_Y = BED_Y + SENSOR_HEIGHT;

export const LEVEL = { min: 0.3, base: 0.9, max: 5.5 };
/** Stage thresholds in metres (bank top ≈ 2.8 m, main road ≈ 3.15 m, first floors ≈ 3.8 m). */
export const THRESHOLDS = { advisory: 2.0, warning: 2.8, evacuate: 3.3 };
/** A rise this fast (cm per 10 min) bumps the status one step up. */
export const RATE_ESCALATE_CM = 30;
/** Simulated seconds per real second at 1x speed. */
export const SIM_RATE = 10;

export const STATUS_COLORS: Record<Status, number> = {
  NORMAL: 0x3f9a52,
  ADVISORY: 0xe2b203,
  WARNING: 0xe3740f,
  EVACUATE: 0xd23a2f,
};
export const statusCss = (s: Status): string => `#${STATUS_COLORS[s].toString(16).padStart(6, '0')}`;

// Layout anchors (x runs along the river, which flows toward +x; the village is at +z).
export const ROAD_Z = 20;
export const LANES_Z = [ROAD_Z, 34, 50];
export const EVAC_LANE_X = 0;
export const HALL = { x: 0, z: 62, w: 14, d: 9, h: 4.2 };
export const COURT = { x: 24, z: 62, w: 28, d: 15 };
export const DASHBOARD = { x: -12, z: 54 };
export const CANAL = { x: -22, halfW: 1.5, zEnd: 52, depth: 1.3 };
export const BRIDGE_X = 20;
export const POLE_X = 4;

/** Centre-line of the meandering river. */
export const riverZ = (x: number): number => 3 * Math.sin(x * 0.035);
export const levelToY = (level: number): number => BED_Y + level;
