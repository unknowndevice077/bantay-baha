/** Global simulation state plus a tiny typed event bus that modules use to talk to each other. */
import { LEVEL } from './config';

export type Status = 'NORMAL' | 'ADVISORY' | 'WARNING' | 'EVACUATE';
export const STATUSES: Status[] = ['NORMAL', 'ADVISORY', 'WARNING', 'EVACUATE'];
export type Lang = 'en' | 'tl' | 'ceb' | 'war';
/** What drives the water level: the rainfall/runoff model, the manual slider, or a live ESP32. */
export type Source = 'rain' | 'manual' | 'remote';
export type ToggleKey = 'debris' | 'rain' | 'xray' | 'lola' | 'sound' | 'hq';

export interface Reading {
  /** Simulation time (s). */
  t: number;
  /** Ultrasonic distance from transducer to water surface (m). */
  distance: number;
  /** Level derived from distance (m above datum). */
  level: number;
  /** Rise rate in cm per 10 minutes. */
  rate: number;
  status: Status;
}

interface Events {
  reading: Reading;
  status: { from: Status; to: Status };
  toggle: { key: ToggleKey; value: boolean };
  lightning: { distance: number };
  /** Raw JSON object received from a live ESP32 (extra telemetry fields). */
  remote: Record<string, unknown>;
  reset: undefined;
}

type Handler<T> = (payload: T) => void;

class Bus<E> {
  private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};
  on<K extends keyof E>(key: K, handler: Handler<E[K]>): void {
    (this.handlers[key] ??= []).push(handler);
  }
  emit<K extends keyof E>(key: K, payload: E[K]): void {
    this.handlers[key]?.forEach((h) => h(payload));
  }
}

export const bus = new Bus<Events>();

export const state = {
  /** THE water level (m above datum). Everything visual reads from this one value. */
  level: LEVEL.base,
  targetLevel: LEVEL.base,
  /** mm/hr */
  rainfall: 0,
  source: 'rain' as Source,
  stormPlaying: false,
  stormTime: 0,
  speed: 1,
  simTime: 0,
  status: 'NORMAL' as Status,
  reading: null as Reading | null,
  /** `hq` = ambient occlusion + bloom; off by default on phones. */
  toggles: { debris: true, rain: true, xray: false, lola: false, sound: false, hq: window.innerWidth >= 768 } as Record<ToggleKey, boolean>,
  lang: 'en' as Lang,
  /** 0..1 fraction of the day (0.5 = noon). Starts mid-afternoon so a demo reaches sunset early. */
  timeOfDay: 0.6,
  /** When true the day/night cycle stops at the chosen time. */
  timeLocked: false,
  /** Siren switched on by hand (hall button or the operations dashboard), regardless of status. */
  sirenManual: false,
};

export function setToggle(key: ToggleKey, value: boolean): void {
  state.toggles[key] = value;
  bus.emit('toggle', { key, value });
}
