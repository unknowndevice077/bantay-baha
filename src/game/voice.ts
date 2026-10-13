/**
 * NPC voice-over. Lines recorded ahead of time with an open-weight
 * text-to-speech model (tools/voices, Chatterbox, MIT) are played from
 * public/voices; each recording was made with the emotion the script asks for.
 * Radio calls go through a band-limited, slightly crunchy "handheld radio"
 * filter. Any line without a recording falls back to the browser's speech
 * synthesis, with a per-character pitch and pace.
 */
import type { Lang } from '../state';

export type Gender = 'male' | 'female';

export interface VoiceStyle {
  gender: Gender;
  pitch: number;
  rate: number;
  /** Which of the matching installed voices (so two men don't share one voice when a second exists). */
  variant?: number;
  /** Heard over a handheld radio. */
  radio?: boolean;
}

interface Manifest {
  /** "speaker|text" → file under voices/ */
  lines: Record<string, string>;
}

const FEMALE = /female|woman|zira|samantha|susan|hazel|aria|jenny|blessica|libby|sonia|natasha|karen|moira|tessa|fiona/i;
const MALE = /male|man|david|mark|daniel|george|guy|ryan|angelo|james|alex|fred|thomas/i;

export const lineKey = (speaker: string, text: string): string => `${speaker}|${text}`;

export class Voice {
  enabled = false;
  private voices: SpeechSynthesisVoice[] = [];
  private readonly synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  private manifest: Manifest = { lines: {} };
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private playing: AudioBufferSourceNode | null = null;
  private out: GainNode | null = null;
  private volume = 1;

  constructor() {
    fetch('voices/manifest.json')
      .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<Manifest>) : null))
      .then((m) => {
        if (m) this.manifest = m;
      })
      .catch(() => undefined);
    if (!this.synth) return;
    const load = () => (this.voices = this.synth!.getVoices());
    load();
    this.synth.addEventListener('voiceschanged', load);
  }

  /** Call from a click: audio can only start after a user gesture. */
  enable(): void {
    this.enabled = true;
    this.ctx ??= new AudioContext();
    if (!this.out) {
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(this.ctx.destination);
    }
    void this.ctx.resume();
  }

  /** Voices off: lines show as subtitles for reading time instead. */
  disable(): void {
    this.enabled = false;
    this.stop();
  }

  /** 0..1, for recordings and browser speech alike. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
  }

  /** Is there a recording for this line? */
  has(speaker: string, text: string): boolean {
    return lineKey(speaker, text) in this.manifest.lines;
  }

  /**
   * Speak a line as `speaker`: the recording if there is one, else browser speech.
   * `done` fires when it finishes (or straight away when voices are off).
   */
  speak(speaker: string, text: string, style: VoiceStyle, lang: Lang | 'en', done: () => void): void {
    if (!this.enabled) return done();
    const file = this.manifest.lines[lineKey(speaker, text)];
    if (file && this.ctx) {
      void this.buffer(file).then((buf) => (buf ? this.play(buf, !!style.radio, done) : this.synthesize(text, style, lang, done)));
      return;
    }
    this.synthesize(text, style, lang, done);
  }

  stop(): void {
    this.synth?.cancel();
    try {
      this.playing?.stop();
    } catch {
      // already finished
    }
    this.playing = null;
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      p = fetch(`voices/${file}`)
        .then((r) => r.arrayBuffer())
        .then((data) => this.ctx!.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(file, p);
    }
    return p;
  }

  private play(buffer: AudioBuffer, radio: boolean, done: () => void): void {
    const ctx = this.ctx!;
    this.stop();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    let out: AudioNode = src;
    if (radio) {
      // Handheld radio: 400 Hz–3 kHz band, a little clipping, a touch louder.
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      const crunch = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
      crunch.curve = curve;
      out.connect(hp).connect(lp).connect(crunch);
      out = crunch;
    }
    const gain = ctx.createGain();
    gain.gain.value = radio ? 0.8 : 1;
    out.connect(gain).connect(this.out ?? ctx.destination);
    src.onended = () => {
      if (this.playing === src) this.playing = null;
      done();
    };
    this.playing = src;
    src.start();
  }

  /** Best installed voice for the language and gender; Filipino first for Tagalog, then Philippine English, then any English. */
  private pick(lang: Lang | 'en', gender: Gender, variant: number): SpeechSynthesisVoice | null {
    const by = (prefix: string) => this.voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
    const pools = lang === 'tl' ? [by('fil'), by('tl'), by('en-ph'), by('en')] : [by('en-ph'), by('en')];
    for (const pool of pools) {
      if (!pool.length) continue;
      const wanted = pool.filter((v) => (gender === 'female' ? FEMALE.test(v.name) : MALE.test(v.name) && !FEMALE.test(v.name)));
      return wanted.length ? wanted[variant % wanted.length] : pool[variant % pool.length];
    }
    return this.voices[0] ?? null;
  }

  private synthesize(text: string, style: VoiceStyle, lang: Lang | 'en', done: () => void): void {
    if (!this.synth) return done();
    const u = new SpeechSynthesisUtterance(text);
    const voice = this.pick(lang, style.gender, style.variant ?? 0);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    // Without a matching gendered voice, pitch alone carries the difference.
    const genderFallback = voice && (style.gender === 'female' ? FEMALE : MALE).test(voice.name) ? 0 : style.gender === 'female' ? 0.25 : -0.2;
    u.pitch = Math.min(2, Math.max(0, style.pitch + genderFallback));
    u.rate = style.rate;
    u.volume = this.volume;
    u.onend = () => done();
    u.onerror = () => done();
    this.synth.speak(u);
  }
}
