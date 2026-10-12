/** "ESP32 telemetry" tab of the HUD: live device vitals plus a scrolling log of published MQTT payloads. */
import { statusCss } from '../config';
import { MQTT_TOPIC, type Esp32Node } from '../sensor/esp32';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const hms = new Date((s % 86400) * 1000).toISOString().slice(11, 19);
  return `${d}d ${hms}`;
}

export class TelemetryView {
  private timer = 0;
  private lastSeq = -1;

  constructor(private readonly node: Esp32Node) {
    $('t-topic').textContent = MQTT_TOPIC;
    document.querySelectorAll<HTMLButtonElement>('#hud .tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('#hud .tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll<HTMLElement>('#hud .tab-pane').forEach((p) => (p.hidden = p.dataset.pane !== tab.dataset.tab));
        window.dispatchEvent(new Event('resize')); // let the chart re-measure when shown again
      }),
    );
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const t = this.node.t;
    $('t-mode').textContent = t.live ? 'ESP32 LIVE' : 'SIMULATED';
    $('t-mode').classList.toggle('ok', t.live);
    $('t-uptime').textContent = uptime(t.uptimeS);
    $('t-rssi').textContent = `${t.rssi.toFixed(0)} dBm`;
    const bars = t.rssi > -55 ? 4 : t.rssi > -65 ? 3 : t.rssi > -75 ? 2 : 1;
    $('t-bars').querySelectorAll('i').forEach((b, i) => b.classList.toggle('on', i < bars));
    $('t-batt').textContent = `${t.batteryV.toFixed(2)} V · ${t.batteryPct.toFixed(0)}%`;
    const bar = $('t-batt-bar');
    bar.style.width = `${t.batteryPct}%`;
    bar.style.background = t.batteryPct > 40 ? 'var(--NORMAL)' : t.batteryPct > 20 ? 'var(--ADVISORY)' : 'var(--EVACUATE)';
    $('t-solar').textContent = `${t.solarW.toFixed(2)} W / ${t.netW >= 0 ? '+' : ''}${t.netW.toFixed(2)} W`;
    $('t-temp').textContent = `${t.tempC.toFixed(1)} °C`;
    $('t-heap').textContent = `${t.heapKb.toFixed(0)} KB`;
    $('t-echo').textContent = `${t.echoUs.toFixed(0)} µs`;
    $('t-dist').textContent = `${t.distanceCm.toFixed(1)} cm`;
    $('t-seq').textContent = `#${t.seq}`;

    if (t.seq !== this.lastSeq) {
      this.lastSeq = t.seq;
      const log = $('t-log');
      log.replaceChildren(
        ...this.node.log.slice(0, 5).map((m) => {
          const li = document.createElement('li');
          li.textContent = m.payload;
          li.style.borderLeftColor = statusCss(m.status);
          return li;
        }),
      );
    }
  }
}
