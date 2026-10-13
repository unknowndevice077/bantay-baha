/** Wires the collapsible side panel and camera bar to the simulation. */
import { type AlertService, ollamaConfig } from '../alerts/alertService';
import type { AudioEngine } from '../alerts/audio';
import type { CameraRig, Preset } from '../scene/cameraRig';
import type { RemoteMode, RemoteSensor } from '../sensor/remote';
import { STORM_DURATION, resetSim } from '../sim';
import { type Lang, type ToggleKey, bus, setToggle, state } from '../state';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const SOURCE_CHIP = { rain: 'Rain model', manual: 'Manual', remote: 'ESP32 live' } as const;

export interface PanelDeps {
  audio: AudioEngine;
  alerts: AlertService;
  remote: RemoteSensor;
  rig: CameraRig;
}

export class Panel {
  private readonly rain = $<HTMLInputElement>('i-rain');
  private readonly level = $<HTMLInputElement>('i-level');
  private readonly stormBtn = $<HTMLButtonElement>('b-storm');
  private readonly time = $<HTMLInputElement>('i-time');
  private dragging: HTMLInputElement | null = null;

  constructor(private readonly deps: PanelDeps) {
    const panel = $('panel');
    if (window.innerWidth < 768) panel.classList.remove('open');
    $('panel-toggle').addEventListener('click', () => panel.classList.toggle('open'));

    for (const input of [this.rain, this.level]) {
      input.addEventListener('pointerdown', () => (this.dragging = input));
      input.addEventListener('change', () => (this.dragging = null));
    }
    this.rain.addEventListener('input', () => {
      state.rainfall = Number(this.rain.value);
      state.stormPlaying = false;
      if (state.source !== 'remote') state.source = 'rain';
    });
    this.level.addEventListener('input', () => {
      if (deps.remote.connected) deps.remote.disconnect();
      state.source = 'manual';
      state.stormPlaying = false;
      state.targetLevel = Number(this.level.value);
    });

    this.stormBtn.addEventListener('click', () => {
      if (state.stormPlaying) {
        state.stormPlaying = false;
        return;
      }
      if (state.stormTime >= STORM_DURATION) state.stormTime = 0;
      if (deps.remote.connected) deps.remote.disconnect();
      state.source = 'rain';
      state.stormPlaying = true;
    });
    const speed = $<HTMLInputElement>('i-speed');
    speed.addEventListener('input', () => (state.speed = Number(speed.value)));
    $('b-reset').addEventListener('click', () => resetSim());

    document.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((box) => {
      box.checked = state.toggles[box.dataset.toggle as ToggleKey];
      box.addEventListener('change', () => setToggle(box.dataset.toggle as ToggleKey, box.checked));
    });
    bus.on('toggle', ({ key, value }) => {
      if (key === 'sound') deps.audio.setEnabled(value);
      // Keep checkboxes in sync when something else (e.g. clicking the enclosure) flips a toggle.
      const box = document.querySelector<HTMLInputElement>(`[data-toggle="${key}"]`);
      if (box) box.checked = value;
    });

    const lang = $<HTMLSelectElement>('i-lang');
    lang.addEventListener('change', () => {
      state.lang = lang.value as Lang;
      deps.alerts.refresh();
    });

    document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) =>
      b.addEventListener('click', () => deps.rig.goTo(b.dataset.cam as Preset | 'cinematic')),
    );

    this.initTime();
    this.initRemote();
    this.initOllama();
  }

  /** Time-of-day slider, quick presets and the cycle lock. */
  private initTime(): void {
    this.time.addEventListener('pointerdown', () => (this.dragging = this.time));
    this.time.addEventListener('change', () => (this.dragging = null));
    this.time.addEventListener('input', () => (state.timeOfDay = Number(this.time.value)));
    document.querySelectorAll<HTMLButtonElement>('[data-time]').forEach((b) =>
      b.addEventListener('click', () => (state.timeOfDay = Number(b.dataset.time))),
    );
    const lock = $<HTMLInputElement>('i-time-lock');
    lock.checked = state.timeLocked;
    lock.addEventListener('change', () => (state.timeLocked = lock.checked));
  }

  private initRemote(): void {
    const { remote } = this.deps;
    const btn = $<HTMLButtonElement>('b-remote');
    btn.addEventListener('click', () => {
      if (remote.connected) remote.disconnect();
      else remote.connect($<HTMLInputElement>('i-ws-url').value.trim(), $<HTMLSelectElement>('i-ws-mode').value as RemoteMode, $<HTMLInputElement>('i-ws-topic').value.trim());
    });
  }

  /** Called by RemoteSensor whenever its connection status changes. */
  static remoteStatus(text: string, ok: boolean): void {
    const el = $('ws-status');
    el.textContent = text;
    el.classList.toggle('ok', ok);
    $('b-remote').textContent = ok || text.startsWith('Connecting') ? 'Disconnect' : 'Connect';
  }

  private initOllama(): void {
    const enabled = $<HTMLInputElement>('i-ollama');
    const url = $<HTMLInputElement>('i-ollama-url');
    const model = $<HTMLInputElement>('i-ollama-model');
    url.value = ollamaConfig.url;
    model.value = ollamaConfig.model;
    const apply = () => {
      Object.assign(ollamaConfig, { enabled: enabled.checked, url: url.value.trim(), model: model.value.trim() });
      this.deps.alerts.refresh();
    };
    enabled.addEventListener('change', apply);
    url.addEventListener('change', apply);
    model.addEventListener('change', apply);
  }

  /** Keeps sliders and storm readouts in sync with the simulation. */
  update(): void {
    if (this.dragging !== this.rain) this.rain.value = String(Math.round(state.rainfall));
    if (this.dragging !== this.level) this.level.value = state.level.toFixed(2);
    $('o-rain').textContent = `${Math.round(state.rainfall)} mm/hr`;
    $('o-level').textContent = `${state.level.toFixed(2)} m`;
    $('o-speed').textContent = `${state.speed}x`;
    if (this.dragging !== this.time) this.time.value = state.timeOfDay.toFixed(3);
    const minutes = Math.floor(state.timeOfDay * 24 * 60);
    $('o-time').textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}${state.timeLocked ? ' held' : ''}`;
    $('src-chip').textContent = SOURCE_CHIP[state.source];
    this.stormBtn.textContent = state.stormPlaying ? 'Pause storm' : state.stormTime > 0 && state.stormTime < STORM_DURATION ? 'Resume storm' : 'Play storm';
    $('storm-bar').style.width = `${(state.stormTime / STORM_DURATION) * 100}%`;
    $('storm-time').textContent = `T+${Math.floor(state.stormTime / 60)} min / ${STORM_DURATION / 60} min`;
  }
}
