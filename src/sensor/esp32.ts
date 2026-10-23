/**
 * Device-side telemetry of the ESP32 node "bb-01": power budget (solar → 18650
 * pack → load), Wi-Fi signal, enclosure temperature, heap, raw ultrasonic echo
 * time and the MQTT payloads it publishes. Simulated from the scene (daylight,
 * rain, water level); when a live ESP32 sends these fields, its values win.
 */
import { type Reading, type Status, bus, state } from '../state';
import { clamp, damp } from '../util';

export const DEVICE_ID = 'bb-01';
export const MQTT_TOPIC = 'bantaybaha/sensor/01';
const PACK_WH = 2 * 3.7 * 3.0; // 2× 3000 mAh 18650 in parallel
const LOAD_W = 0.42; // ESP32 Wi-Fi bursts + sensor, averaged
const PANEL_W = 5;
/** Speed of sound in air at temperature T (°C), m/s. */
const soundSpeed = (t: number) => 331.3 + 0.606 * t;

export interface Telemetry {
  uptimeS: number;
  seq: number;
  rssi: number;
  batteryV: number;
  batteryPct: number;
  solarW: number;
  netW: number;
  tempC: number;
  heapKb: number;
  echoUs: number;
  distanceCm: number;
  levelCm: number;
  rateCm: number;
  status: Status;
  live: boolean;
}

export interface PublishedMessage {
  topic: string;
  payload: string;
  status: Status;
}

/** Fields a real ESP32 may include in its payload to override the simulation. */
const REMOTE_FIELDS = {
  rssi: 'rssi',
  batt_v: 'batteryV',
  temp_c: 'tempC',
  heap_kb: 'heapKb',
  solar_w: 'solarW',
  uptime_s: 'uptimeS',
} as const;

export class Esp32Node {
  readonly t: Telemetry = {
    uptimeS: 2 * 86400 + 4 * 3600 + 13 * 60,
    seq: 0,
    rssi: -61,
    batteryV: 3.98,
    batteryPct: 82,
    solarW: 0,
    netW: 0,
    tempC: 29,
    heapKb: 182,
    echoUs: 0,
    distanceCm: 0,
    levelCm: 0,
    rateCm: 0,
    status: 'NORMAL',
    live: false,
  };
  readonly log: PublishedMessage[] = [];
  private remote: Partial<Record<keyof Telemetry, number>> = {};
  private remoteAt = -Infinity;

  constructor() {
    bus.on('remote', (payload) => {
      for (const [key, field] of Object.entries(REMOTE_FIELDS)) {
        const v = payload[key];
        if (typeof v === 'number') this.remote[field] = v;
      }
      this.remoteAt = performance.now();
    });
  }

  /** @param day 0..1 daylight @param dtSim simulated seconds elapsed */
  update(dt: number, dtSim: number, day: number): void {
    const t = this.t;
    const storm = clamp(state.rainfall / 100, 0, 1);
    t.live = state.source === 'remote' && performance.now() - this.remoteAt < 15000;
    t.uptimeS += dtSim;

    // Power budget integrated over simulated time.
    t.solarW = damp(t.solarW, PANEL_W * day * (1 - storm * 0.85) * (0.9 + Math.random() * 0.1), 2, dt);
    t.netW = t.solarW * 0.8 - LOAD_W;
    t.batteryPct = clamp(t.batteryPct + ((t.netW * dtSim) / 3600 / PACK_WH) * 100, 3, 100);
    t.batteryV = 3.3 + (t.batteryPct / 100) * 0.9 + (t.netW > 0 ? 0.05 : 0);

    // Heavy rain attenuates 2.4 GHz a little; the enclosure warms in the sun.
    t.rssi = damp(t.rssi, -58 - storm * 12 + (Math.random() - 0.5) * 4, 1.5, dt);
    t.tempC = damp(t.tempC, 26 + day * 9 * (1 - storm * 0.6), 0.05, dt);
    t.heapKb = damp(t.heapKb, 178 + Math.random() * 8, 0.5, dt);

    if (t.live) {
      for (const [field, v] of Object.entries(this.remote)) (t as unknown as Record<string, number>)[field] = v;
    }
  }

  /** A fresh sensor reading: compute the raw echo time the firmware actually measures. */
  sense(r: Reading): void {
    const t = this.t;
    t.distanceCm = r.distance * 100;
    t.levelCm = r.level * 100;
    t.rateCm = r.rate;
    t.status = r.status;
    t.echoUs = ((2 * r.distance) / soundSpeed(t.tempC)) * 1e6;
  }

  /** Publish one MQTT message (one visible packet in the scene). */
  publish(r: Reading): PublishedMessage {
    this.sense(r);
    const t = this.t;
    t.seq++;
    const payload = JSON.stringify({
      id: DEVICE_ID,
      seq: t.seq,
      distance_cm: +t.distanceCm.toFixed(1),
      level_cm: +t.levelCm.toFixed(1),
      rate_cm10: +t.rateCm.toFixed(1),
      status: r.status,
      batt_v: +t.batteryV.toFixed(2),
      rssi: Math.round(t.rssi),
      temp_c: +t.tempC.toFixed(1),
    });
    const msg = { topic: MQTT_TOPIC, payload, status: r.status };
    this.log.unshift(msg);
    this.log.length = Math.min(this.log.length, 8);
    return msg;
  }
}
