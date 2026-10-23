/**
 * Sound settings for the story game: a master volume, mute (M or the Sound
 * button), and separate switches for the NPC voices and for effects and
 * ambience (rain, siren, thunder, footsteps, the creek). Remembered per browser.
 */
import type { AudioEngine } from '../alerts/audio';
import type { Sfx } from './sfx';
import type { Voice } from './voice';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const KEY = 'bantay-baha-sound';

interface Settings {
  muted: boolean;
  volume: number;
  voices: boolean;
  effects: boolean;
}

function load(): Settings {
  const defaults: Settings = { muted: false, volume: 0.8, voices: true, effects: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export class SoundSettings {
  private readonly s = load();
  /** Audio may only start after a click; until then settings are just remembered. */
  private started = false;

  constructor(
    private readonly world: AudioEngine,
    private readonly sfx: Sfx,
    private readonly voice: Voice,
  ) {
    const box = (id: string) => $<HTMLInputElement>(id);
    box('t-sound').checked = !this.s.muted;
    box('pm-voices').checked = this.s.voices;
    box('pm-effects').checked = this.s.effects;
    box('pm-volume').value = String(Math.round(this.s.volume * 100));

    box('t-sound').addEventListener('change', () => this.change({ muted: !box('t-sound').checked }));
    box('pm-voices').addEventListener('change', () => this.change({ voices: box('pm-voices').checked }));
    box('pm-effects').addEventListener('change', () => this.change({ effects: box('pm-effects').checked }));
    box('pm-volume').addEventListener('input', () => this.change({ volume: Number(box('pm-volume').value) / 100, muted: false }));
    box('pm-mute').addEventListener('change', () => this.change({ muted: box('pm-mute').checked }));
    $('b-sound').addEventListener('click', () => this.toggleMute());
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement))
        this.toggleMute();
    });
    this.render();
  }

  /** Call from the Begin click. */
  start(): void {
    this.started = true;
    this.apply();
  }

  toggleMute(): void {
    this.change({ muted: !this.s.muted });
  }

  private change(patch: Partial<Settings>): void {
    Object.assign(this.s, patch);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // storage blocked: the choice lasts for this visit
    }
    this.apply();
    this.render();
  }

  private apply(): void {
    if (!this.started) return;
    const { muted, volume, voices, effects } = this.s;
    // Effects: rain, siren and thunder (the shared engine) plus the game's own foley.
    this.world.setEnabled(!muted && effects);
    this.world.setVolume(volume);
    this.sfx.enable();
    this.sfx.set(!muted && effects, volume);
    if (!muted && voices) this.voice.enable();
    else this.voice.disable();
    this.voice.setVolume(volume);
  }

  private render(): void {
    const { muted, volume } = this.s;
    const silent = muted || volume === 0;
    $('b-sound').classList.toggle('off', silent);
    $('b-sound').firstChild!.textContent = silent ? 'Muted ' : 'Sound ';
    $<HTMLInputElement>('t-sound').checked = !muted;
    $<HTMLInputElement>('pm-mute').checked = muted;
    $('pm-volume-out').textContent = muted ? 'muted' : `${Math.round(volume * 100)}%`;
  }
}
