/**
 * Barangay operations dashboard: a plain, phone-friendly control screen for
 * the barangay captain / BDRRM duty officer. Shows the current flood status,
 * trend and time-to-threshold, a level chart, sensor-node health, an
 * evacuation-center headcount and an event log; lets the operator sound the
 * siren, broadcast an advisory, copy it for SMS/Facebook, acknowledge alarms
 * and export readings.
 *
 * Data comes either from the 3D simulator running in another tab of this
 * browser (BroadcastChannel) or straight from a real sensor node over
 * WebSocket / MQTT-over-WebSocket.
 *
 * `?embed=phone|laptop&channel=…&lang=…` is how the story game shows this
 * page on the captain's phone and the hall laptop: simulator feed only,
 * nothing saved between sessions.
 */
import '../theme.css';
import './dashboard.css';
import { renderTemplate } from '../alerts/templates';
import { SENSOR_HEIGHT, THRESHOLDS, statusCss } from '../config';
import { DeviceLink, type LinkMode, parseDistanceCm, parseJson } from '../net/link';
import { CHANNEL, type DashboardMessage, type ForecastSummary, type Point, type SimMessage } from '../net/protocol';
import type { Telemetry } from '../sensor/esp32';
import { classifyStatus, riseRate } from '../sensor/status';
import { type Lang, STATUSES, type Source, type Status } from '../state';
import { drawLevelChart } from './chart';

const SOURCE_NAMES: Record<Source, string> = { rain: 'rainfall model', manual: 'manual slider', remote: 'live ESP32' };

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

type Feed = 'sim' | 'device';
interface Settings {
  source: Feed;
  proto: LinkMode;
  url: string;
  topic: string;
  lang: Lang;
  families: number;
  persons: number;
  capacity: number;
}
interface LogEntry {
  at: number;
  text: string;
  status?: Status;
}

const params = new URLSearchParams(location.search);
const embed = params.get('embed');
if (embed) document.documentElement.classList.add('embed', `embed-${embed}`);
// Named so the simulator's Dashboard button switches to this tab instead of opening another.
else if (!params.get('channel')) window.name = 'bantay-baha-dashboard';

const SETTINGS_KEY = 'bantay-baha-dashboard';
const LOG_KEY = 'bantay-baha-dashboard-log';
const DAY_MS = 86400000;
/** No message for this long = sensor/simulator considered offline. */
const STALE_MS = 15000;

function load<T>(key: string, fallback: T): T {
  if (embed) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown): void {
  if (embed) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode); keep working in memory
  }
}

const settings: Settings = load(SETTINGS_KEY, {
  source: 'sim' as Feed,
  proto: 'mqtt' as LinkMode,
  url: 'ws://localhost:9001',
  topic: 'bantaybaha/sensor/01',
  lang: (params.get('lang') ?? 'tl') as Lang,
  families: 0,
  persons: 0,
  capacity: 150,
});
const saveSettings = () => persist(SETTINGS_KEY, settings);
const log: LogEntry[] = load<{ entries: LogEntry[] }>(LOG_KEY, { entries: [] }).entries;

// ---- Live state -------------------------------------------------------------
const points: Point[] = [];
let telemetry: Partial<Telemetry> = {};
let evac: { inside: number; total: number } | null = null;
let rainfall: number | null = null;
let forecast: ForecastSummary | null = null;
/** What drives the simulated water level (rain model, manual slider or a live node). */
let simSource: Source | null = null;
let siren = false;
let status: Status = 'NORMAL';
let lastMessage = 0;
let offline = false;
let rangeMs = 600000;
let msgEdited = false;
let alarmFor: Status | null = null;

const channel = new BroadcastChannel(params.get('channel') ?? CHANNEL);
const send = (m: DashboardMessage) => channel.postMessage(m);
const link = new DeviceLink(
  (text) => ingestDevice(text),
  (text, ok) => {
    setConn(text, ok);
    $('d-connect').textContent = ok || text.startsWith('Connecting') ? 'Disconnect' : 'Connect';
  },
);

/** "Now" on the feed's clock: the simulator runs its own (faster) clock; a live node uses real time. */
function clockNow(): number {
  const p = points[points.length - 1];
  return settings.source === 'sim' && p ? p.at + (performance.now() - lastMessage) : Date.now();
}

// ---- Event log ----------------------------------------------------------------
function logEvent(text: string, at = clockNow(), s?: Status): void {
  log.unshift({ at, text, status: s });
  log.length = Math.min(log.length, 200);
  persist(LOG_KEY, { entries: log });
  renderLog();
}

function renderLog(): void {
  $('d-log').replaceChildren(
    ...log.slice(0, 60).map((e) => {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.textContent = new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      li.append(time, document.createTextNode(e.text));
      if (e.status) li.style.borderLeftColor = statusCss(e.status);
      return li;
    }),
  );
}

// ---- Ingest -------------------------------------------------------------------
function addPoint(p: Point): void {
  const last = points[points.length - 1];
  if (last && p.at <= last.at) return;
  points.push(p);
  while (points.length && points[0].at < p.at - DAY_MS) points.shift();
  if (p.status !== status) {
    const from = status;
    status = p.status;
    logEvent(`Status ${from} → ${p.status} at ${(p.level * 100).toFixed(0)} cm`, p.at, p.status);
    if (STATUSES.indexOf(p.status) > STATUSES.indexOf(from)) raiseAlarm(p.status);
  }
  lastMessage = performance.now();
  if (offline) {
    offline = false;
    logEvent('Sensor data resumed');
  }
}

// The channel also carries other dashboards' commands (phone + laptop in the game); only simulator messages matter here.
channel.onmessage = (e: MessageEvent<SimMessage | DashboardMessage>) => {
  if (settings.source !== 'sim') return;
  const m = e.data;
  if (m.type === 'history') {
    if (points.length === 0 && m.points.length) {
      points.push(...m.points);
      status = m.points[m.points.length - 1].status;
    }
  } else if (m.type === 'live') {
    addPoint(m.point);
    telemetry = m.telemetry;
    evac = m.evac;
    rainfall = m.rainfall;
    forecast = m.forecast ?? null;
    simSource = m.source;
    siren = m.siren;
  }
  render();
};

/** A real node's payload: compute level, rise rate and status the same way the firmware/simulator does. */
function ingestDevice(text: string): void {
  const cm = parseDistanceCm(text);
  if (cm === null) return;
  const at = Date.now();
  const level = SENSOR_HEIGHT - cm / 100;
  const samples = points.map((p) => ({ t: p.at / 1000, level: p.level }));
  const rate = riseRate(samples, at / 1000, level);
  addPoint({ at, level, distance: cm / 100, rate, status: classifyStatus(level, rate, status) });
  const j = parseJson(text) ?? {};
  const num = (k: string) => (typeof j[k] === 'number' ? (j[k] as number) : undefined);
  telemetry = {
    ...telemetry,
    distanceCm: cm,
    levelCm: level * 100,
    rssi: num('rssi') ?? telemetry.rssi,
    batteryV: num('batt_v') ?? telemetry.batteryV,
    tempC: num('temp_c') ?? telemetry.tempC,
    heapKb: num('heap_kb') ?? telemetry.heapKb,
    solarW: num('solar_w') ?? telemetry.solarW,
    uptimeS: num('uptime_s') ?? telemetry.uptimeS,
    seq: num('seq') ?? (telemetry.seq ?? 0) + 1,
  };
  render();
}

// ---- Alarm (audible + notification) -------------------------------------------
let audio: AudioContext | null = null;
let beepTimer: ReturnType<typeof setInterval> | undefined;
document.addEventListener('pointerdown', () => {
  audio ??= new AudioContext();
  void audio.resume();
});

function beep(): void {
  // The hall laptop stays quiet; the alarm rings on the phone.
  if (embed === 'laptop' || !audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.setValueAtTime(660, t + 0.15);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.32);
}

function raiseAlarm(s: Status): void {
  alarmFor = s;
  clearInterval(beepTimer);
  beep();
  beepTimer = setInterval(beep, 1200);
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`Bantay Baha: ${s}`, { body: `Water level ${(points[points.length - 1]?.level * 100).toFixed(0)} cm. Open the dashboard.`, tag: 'bantay-baha' });
  }
}

function acknowledge(): void {
  if (!alarmFor) return;
  logEvent(`Operator acknowledged the ${alarmFor} alarm`, clockNow(), alarmFor);
  alarmFor = null;
  clearInterval(beepTimer);
  render();
}

// ---- Rendering ----------------------------------------------------------------
function setConn(text: string, ok: boolean): void {
  const conn = $('d-conn');
  conn.textContent = text;
  conn.className = `conn ${ok ? 'ok' : 'warn'}`;
}

/** Plain-language time until the next threshold (or until dropping below the current one). */
function etaText(levelCm: number, rate: number): string {
  const limits: [Status, number][] = [
    ['ADVISORY', THRESHOLDS.advisory * 100],
    ['WARNING', THRESHOLDS.warning * 100],
    ['EVACUATE', THRESHOLDS.evacuate * 100],
  ];
  const fmt = (min: number) => (min < 1 ? 'under a minute' : min < 90 ? `~${Math.round(min)} min` : `~${(min / 60).toFixed(1)} h`);
  if (rate > 2) {
    const next = limits.find(([, cm]) => cm > levelCm);
    return next ? `${next[0]} level (${next[1]} cm) in ${fmt(((next[1] - levelCm) / rate) * 10)}` : 'Above all alert levels and still rising';
  }
  if (rate < -2) {
    const below = [...limits].reverse().find(([, cm]) => cm <= levelCm);
    return below ? `Back below ${below[0]} (${below[1]} cm) in ${fmt(((levelCm - below[1]) / -rate) * 10)}` : 'Receding, within normal range';
  }
  return 'Level holding steady';
}

/** Horizontal 0–500 cm scale with the alert bands and a marker at the current level. */
const SCALE_MAX = 500;
function renderScale(levelCm: number | null): void {
  const pct = (cm: number) => `${Math.min(100, (cm / SCALE_MAX) * 100).toFixed(2)}%`;
  const edges: [Status, number, number][] = [
    ['NORMAL', 0, THRESHOLDS.advisory * 100],
    ['ADVISORY', THRESHOLDS.advisory * 100, THRESHOLDS.warning * 100],
    ['WARNING', THRESHOLDS.warning * 100, THRESHOLDS.evacuate * 100],
    ['EVACUATE', THRESHOLDS.evacuate * 100, SCALE_MAX],
  ];
  const bands = edges.map(([s, lo, hi]) => `<span style="left:${pct(lo)};width:${pct(hi - lo)};background:${statusCss(s)}"></span>`).join('');
  const ticks = edges.slice(1).map(([s, lo]) => `<small style="left:${pct(lo)}" title="${s}">${lo}</small>`).join('');
  const marker = levelCm === null ? '' : `<i style="left:${pct(levelCm)}"></i>`;
  $('d-scale').innerHTML = `<div class="scale-track">${bands}${marker}</div><div class="scale-ticks">${ticks}</div>`;
}

function tile(label: string, value: string, warn = false): HTMLElement {
  const d = document.createElement('div');
  d.className = `tile${warn ? ' warn' : ''}`;
  d.innerHTML = `<span></span><b></b>`;
  d.children[0].textContent = label;
  d.children[1].textContent = value;
  return d;
}

function render(): void {
  const p = points[points.length - 1];
  const sim = settings.source === 'sim';
  const stale = !p || performance.now() - lastMessage > STALE_MS;

  // Connection pill for the simulator feed (the device link reports its own state).
  // Which sender this tab follows: the simulator, or the story game (its own channel).
  const game = !!params.get('channel');
  if (sim) setConn(stale ? (embed ? 'No signal from the sensor' : game ? 'Story game not running' : 'Simulator not running: open it in another tab') : embed ? 'Sensor bb-01 live' : game ? 'Story game feed live' : 'Simulator feed live', !stale);
  if (p && stale && !offline) {
    offline = true;
    logEvent('No data from the sensor for 15 s: check node power and Wi-Fi');
  }

  // Hero.
  const hero = $('d-hero');
  hero.className = `card hero${p ? ` s-${status}` : ''}${stale && p ? ' stale' : ''}`;
  if (p) hero.style.setProperty('--status', statusCss(status));
  $('d-status').textContent = p ? status : 'No data';
  $('d-level').textContent = p ? (p.level * 100).toFixed(0) : '--';
  $('d-trend').textContent = p ? `${p.rate > 2 ? 'Rising' : p.rate < -2 ? 'Falling' : 'Steady'}, ${p.rate >= 0 ? '+' : ''}${p.rate.toFixed(0)} cm per 10 min` : '--';
  $('d-eta').textContent = p ? etaText(p.level * 100, p.rate) : embed ? 'Waiting for the sensor.' : '--';
  $('d-updated').textContent = p ? `Updated ${Math.max(0, Math.round((performance.now() - lastMessage) / 1000))} s ago` : 'No data yet';
  $('d-extra').textContent = [p ? `Distance to water ${(p.distance * 100).toFixed(0)} cm` : '', rainfall !== null && sim ? `Rainfall ${rainfall.toFixed(0)} mm/hr` : '', simSource && sim && !embed ? `Sim water source: ${SOURCE_NAMES[simSource]}` : '']
    .filter(Boolean)
    .join(' · ') || '--';
  // AI forecast line, when the feed carries one (the story game's sensor does).
  const showFc = !!forecast && sim && !stale;
  $('d-fc-label').hidden = !showFc;
  $('d-forecast').hidden = !showFc;
  if (forecast && showFc) $('d-forecast').textContent = `${forecast.text} · +30 min ${Math.round(forecast.at30 * 100)} cm · +60 min ${Math.round(forecast.at60 * 100)} cm`;
  // Nothing to show yet: say why, and offer the one click that fixes it.
  const empty = !p && !embed;
  $('d-empty').hidden = !empty;
  if (empty) {
    $('d-empty-text').textContent = sim
      ? 'This dashboard shows the live sensor of the 3D simulator. Open the simulator in another tab of this browser and leave both tabs open: readings appear here within a few seconds.'
      : 'Enter your broker or sensor address under Live device connection above, then press Connect.';
    $('d-empty-go').hidden = !sim;
  }
  renderScale(p ? p.level * 100 : null);
  document.title = alarmFor ? `${alarmFor} alarm · Bantay Baha` : `${p ? status + ' · ' : ''}Bantay Baha Operations`;

  // Alarm banner.
  $('d-alarm').hidden = !alarmFor;
  if (alarmFor) $('d-alarm-text').textContent = `Status rose to ${alarmFor}`;

  // Captain's controls.
  const sirenBtn = $<HTMLButtonElement>('d-siren');
  sirenBtn.textContent = siren ? 'Stop siren' : 'Sound siren';
  sirenBtn.classList.toggle('on', siren);
  sirenBtn.disabled = !sim;
  $<HTMLButtonElement>('d-broadcast').disabled = !sim;
  $('d-siren-note').textContent = embed
    ? 'Sounds the barangay siren. Broadcast plays your advisory on the hall loudspeaker.'
    : sim
    ? 'Controls the siren and public-address screens in the simulator.'
    : 'Siren and PA control need a command topic on your broker; copy the advisory for SMS / Facebook instead.';
  if (p) {
    const auto = renderTemplate(settings.lang, status, false, { levelCm: p.level * 100, rateCm: p.rate });
    if (!msgEdited) $<HTMLTextAreaElement>('d-msg').value = auto;
  }

  // Evacuation center.
  $('d-evac-auto').textContent = evac && sim ? `${embed ? 'Registered at the hall' : 'Simulator'}: ${evac.inside} of ${evac.total} residents inside the evacuation center` : '';
  $('d-families').textContent = String(settings.families);
  $('d-persons').textContent = String(settings.persons);
  const pct = (settings.persons / Math.max(1, settings.capacity)) * 100;
  const bar = $('d-capbar');
  bar.style.width = `${Math.min(100, pct)}%`;
  bar.style.background = pct >= 100 ? 'var(--EVACUATE)' : pct >= 80 ? 'var(--WARNING)' : 'var(--NORMAL)';
  $('d-captext').textContent = `${settings.persons} / ${settings.capacity} persons (${pct.toFixed(0)}% of capacity)${pct >= 100 ? ': FULL, open an overflow site' : ''}`;

  // Node health.
  const t = telemetry;
  const battPct = t.batteryPct ?? (t.batteryV !== undefined ? Math.max(0, Math.min(100, ((t.batteryV - 3.3) / 0.9) * 100)) : undefined);
  const dash = '--';
  $('d-node').textContent = sim ? 'bb-01 (simulated)' : 'live node';
  $('d-health').replaceChildren(
    tile('Battery', t.batteryV !== undefined ? `${t.batteryV.toFixed(2)} V${battPct !== undefined ? ` · ${battPct.toFixed(0)}%` : ''}` : dash, battPct !== undefined && battPct < 30),
    tile('Solar input', t.solarW !== undefined ? `${t.solarW.toFixed(2)} W` : dash),
    tile('Wi-Fi signal', t.rssi !== undefined ? `${t.rssi.toFixed(0)} dBm` : dash, t.rssi !== undefined && t.rssi < -80),
    tile('Enclosure temp', t.tempC !== undefined ? `${t.tempC.toFixed(1)} °C` : dash, t.tempC !== undefined && t.tempC > 55),
    tile('Uptime', t.uptimeS !== undefined ? `${(t.uptimeS / 3600).toFixed(1)} h` : dash),
    tile('Free memory', t.heapKb !== undefined ? `${t.heapKb.toFixed(0)} KB` : dash),
    tile('Packets', t.seq !== undefined ? `#${t.seq}` : dash),
    tile('Last data', p ? `${Math.round((performance.now() - lastMessage) / 1000)} s ago` : dash, stale && !!p),
  );
  const warnings: string[] = [];
  if (p && stale) warnings.push('No recent data: visit the node, check power and Wi-Fi.');
  if (battPct !== undefined && battPct < 30) warnings.push('Battery low: check the solar panel for dirt or shading.');
  if (t.rssi !== undefined && t.rssi < -80) warnings.push('Weak Wi-Fi signal: readings may drop out.');
  if (t.tempC !== undefined && t.tempC > 55) warnings.push('Enclosure overheating: add shade or ventilation.');
  $('d-warnings').replaceChildren(
    ...(warnings.length ? warnings : ['All node checks OK']).map((w) => Object.assign(document.createElement('li'), { textContent: w, className: warnings.length ? 'bad' : 'good' })),
  );

  drawLevelChart($<HTMLCanvasElement>('d-chart'), points, rangeMs, p?.at ?? Date.now());
}

// ---- Wiring ---------------------------------------------------------------------
function applySource(): void {
  $<HTMLSelectElement>('d-source').value = settings.source;
  $('d-device').hidden = settings.source !== 'device';
  points.length = 0;
  telemetry = {};
  evac = null;
  rainfall = null;
  forecast = null;
  simSource = null;
  lastMessage = 0;
  offline = false;
  if (settings.source === 'sim') {
    link.disconnect();
    send({ type: 'hello' });
  } else {
    setConn('Not connected', false);
  }
  render();
}

$<HTMLSelectElement>('d-source').addEventListener('change', (e) => {
  settings.source = (e.target as HTMLSelectElement).value as Feed;
  saveSettings();
  logEvent(`Data source switched to ${settings.source === 'sim' ? 'simulator' : 'live device'}`);
  applySource();
});

const proto = $<HTMLSelectElement>('d-proto');
const url = $<HTMLInputElement>('d-url');
const topic = $<HTMLInputElement>('d-topic');
proto.value = settings.proto;
url.value = settings.url;
topic.value = settings.topic;
$('d-connect').addEventListener('click', () => {
  if (link.connected) {
    link.disconnect();
    return;
  }
  Object.assign(settings, { proto: proto.value as LinkMode, url: url.value.trim(), topic: topic.value.trim() });
  saveSettings();
  link.connect(settings.url, settings.proto, settings.topic);
});

$('d-siren').addEventListener('click', () => {
  siren = !siren;
  send({ type: 'siren', on: siren });
  logEvent(siren ? 'Operator sounded the siren' : 'Operator stopped the siren', clockNow(), siren ? 'EVACUATE' : undefined);
  render();
});

const lang = $<HTMLSelectElement>('d-lang');
lang.value = settings.lang;
lang.addEventListener('change', () => {
  settings.lang = lang.value as Lang;
  saveSettings();
  msgEdited = false;
  render();
});
const msg = $<HTMLTextAreaElement>('d-msg');
msg.addEventListener('input', () => (msgEdited = true));
$('d-auto').addEventListener('click', () => {
  msgEdited = false;
  render();
});
$('d-broadcast').addEventListener('click', () => {
  const text = msg.value.trim();
  if (!text) return;
  send({ type: 'broadcast', text });
  logEvent(`Broadcast sent: "${text}"`);
});
$('d-copy').addEventListener('click', async () => {
  const btn = $('d-copy');
  try {
    await navigator.clipboard.writeText(`[Barangay advisory] ${msg.value.trim()}`);
    btn.textContent = 'Copied';
  } catch {
    msg.select();
    btn.textContent = 'Select + copy manually';
  }
  setTimeout(() => (btn.textContent = 'Copy for SMS'), 2000);
});
$('d-ack').addEventListener('click', acknowledge);
$('d-notify').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  const res = await Notification.requestPermission();
  $('d-notify').textContent = res === 'granted' ? 'Desktop notifications are on' : 'Notifications are blocked in this browser';
});

document.querySelectorAll<HTMLButtonElement>('[data-count]').forEach((b) =>
  b.addEventListener('click', () => {
    const key = b.dataset.count as 'families' | 'persons';
    settings[key] = Math.max(0, settings[key] + Number(b.dataset.delta));
    saveSettings();
    render();
  }),
);
const capacity = $<HTMLInputElement>('d-capacity');
capacity.value = String(settings.capacity);
capacity.addEventListener('change', () => {
  settings.capacity = Math.max(1, Number(capacity.value) || 1);
  saveSettings();
  render();
});

document.querySelectorAll<HTMLButtonElement>('#d-ranges button').forEach((b) =>
  b.addEventListener('click', () => {
    rangeMs = Number(b.dataset.range);
    document.querySelectorAll('#d-ranges button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  }),
);

$('d-export').addEventListener('click', () => {
  const rows = ['time_iso,level_cm,distance_cm,rate_cm_per_10min,status', ...points.map((p) => `${new Date(p.at).toISOString()},${(p.level * 100).toFixed(1)},${(p.distance * 100).toFixed(1)},${p.rate.toFixed(1)},${p.status}`)];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
  a.download = `bantay-baha-readings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('d-clear').addEventListener('click', () => {
  log.length = 0;
  persist(LOG_KEY, { entries: log });
  renderLog();
});

setInterval(() => {
  const simClock = settings.source === 'sim' && points.length > 0 && !embed;
  $('d-clock').textContent = `${simClock ? 'Sim time ' : ''}${new Date(clockNow()).toLocaleTimeString([], { hour12: false })}`;
  render();
}, 1000);
window.addEventListener('resize', render);
renderLog();
applySource();
