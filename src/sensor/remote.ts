/**
 * Live input from a real ESP32, over either a plain WebSocket (JSON / number
 * messages) or MQTT-over-WebSocket. The MQTT side is a minimal 3.1.1 client
 * (CONNECT, SUBSCRIBE QoS 0, PUBLISH receive, PINGREQ) so no dependency is needed.
 *
 * Accepted payloads: `412` (distance in cm), `{"distance_cm":412}`,
 * `{"distance_m":4.12}` or `{"level_cm":288}`. Optional telemetry fields
 * (`rssi`, `batt_v`, `temp_c`, `heap_kb`, `solar_w`, `uptime_s`) feed the telemetry view.
 */
import { SENSOR_HEIGHT } from '../config';
import { applyRemoteDistance } from '../sim';
import { bus, state } from '../state';

export type RemoteMode = 'ws' | 'mqtt';

export function parsePayload(text: string): number | null {
  const n = Number(text);
  if (text.trim() !== '' && Number.isFinite(n)) return n;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (typeof j.distance_cm === 'number') return j.distance_cm;
    if (typeof j.distance_m === 'number') return j.distance_m * 100;
    if (typeof j.level_cm === 'number') return SENSOR_HEIGHT * 100 - j.level_cm;
  } catch {
    // not JSON — ignored below
  }
  return null;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const mqttString = (s: string): number[] => {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
};
const remainingLength = (n: number): number[] => {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    out.push(byte);
  } while (n > 0);
  return out;
};
const packet = (header: number, body: number[]): Uint8Array => new Uint8Array([header, ...remainingLength(body.length), ...body]);

export class RemoteSensor {
  private ws: WebSocket | null = null;
  private buf = new Uint8Array(0);
  private ping: ReturnType<typeof setInterval> | undefined;
  private topic = '';

  constructor(private readonly onStatus: (text: string, ok: boolean) => void) {}

  get connected(): boolean {
    return this.ws !== null;
  }

  connect(url: string, mode: RemoteMode, topic: string): void {
    this.disconnect();
    this.topic = topic;
    this.onStatus('Connecting…', false);
    let ws: WebSocket;
    try {
      ws = mode === 'mqtt' ? new WebSocket(url, ['mqtt']) : new WebSocket(url);
    } catch (e) {
      this.onStatus(`Bad URL: ${(e as Error).message}`, false);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (mode === 'mqtt') {
        const clientId = `bantaybaha-${Math.random().toString(16).slice(2, 8)}`;
        ws.send(packet(0x10, [...mqttString('MQTT'), 4, 0x02, 0, 60, ...mqttString(clientId)]));
      } else {
        this.onStatus('Connected (WebSocket) — waiting for data', true);
      }
    };
    ws.onmessage = (ev) => {
      if (mode === 'ws') this.handle(typeof ev.data === 'string' ? ev.data : dec.decode(ev.data as ArrayBuffer));
      else this.feed(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onerror = () => this.onStatus('Connection error', false);
    ws.onclose = () => {
      if (this.ws === ws) this.disconnect('Disconnected');
    };
  }

  disconnect(message = 'Not connected'): void {
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    this.buf = new Uint8Array(0);
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    if (state.source === 'remote') state.source = 'rain';
    this.onStatus(message, false);
  }

  private handle(text: string): void {
    const cm = parsePayload(text);
    if (cm === null) return;
    applyRemoteDistance(cm);
    if (text.trim().startsWith('{')) bus.emit('remote', JSON.parse(text) as Record<string, unknown>);
    this.onStatus(`Live: distance ${cm.toFixed(0)} cm`, true);
  }

  /** Reassembles MQTT packets that may be split across or packed into WebSocket frames. */
  private feed(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    for (;;) {
      if (this.buf.length < 2) return;
      let len = 0;
      let mult = 1;
      let i = 1;
      for (;;) {
        if (i >= this.buf.length) return;
        const b = this.buf[i++];
        len += (b & 127) * mult;
        mult *= 128;
        if ((b & 128) === 0) break;
      }
      if (this.buf.length < i + len) return;
      this.onPacket(this.buf[0], this.buf.subarray(i, i + len));
      this.buf = this.buf.slice(i + len);
    }
  }

  private onPacket(header: number, body: Uint8Array): void {
    const type = header >> 4;
    if (type === 2) {
      // CONNACK
      if (body[1] !== 0) {
        this.disconnect(`Broker refused connection (code ${body[1]})`);
        return;
      }
      this.ws?.send(packet(0x82, [0, 1, ...mqttString(this.topic), 0]));
      this.ping = setInterval(() => this.ws?.send(new Uint8Array([0xc0, 0])), 30000);
      this.onStatus(`Connected (MQTT) — subscribed to ${this.topic}`, true);
    } else if (type === 3) {
      // PUBLISH
      const qos = (header >> 1) & 3;
      const topicLen = (body[0] << 8) | body[1];
      const payloadStart = 2 + topicLen + (qos > 0 ? 2 : 0);
      this.handle(dec.decode(body.subarray(payloadStart)));
    }
  }
}
