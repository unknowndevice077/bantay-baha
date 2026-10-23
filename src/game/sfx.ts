/**
 * Story-game sound effects, synthesized with WebAudio like the rest of the
 * project's sound (no audio files): footsteps that change with what you walk
 * on, splashes, landing, phone and prompt blips, objective chimes, the siren
 * switch, and the ambience of the creek at night (rushing water that grows
 * with the flood and with how close you are, frogs and crickets that go quiet
 * as the rain gets heavy).
 */
import { riverZ } from '../config';
import type { Player } from '../player/player';
import { state } from '../state';

export type Surface = 'ground' | 'floor' | 'water';

/** Metres between footsteps, walking and running. */
const STRIDE = { walk: 0.78, run: 1.15 };
/** Horizontal speed above which a step counts as running (m/s). */
const RUN_SPEED = 4;

export class Sfx {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private creek!: GainNode;
  private creekTone!: BiquadFilterNode;
  private volume = 1;
  private on = true;
  private paused = false;

  // Footstep tracking.
  private readonly last = { x: 0, z: 0, set: false };
  private travelled = 0;
  private airborne = 0;
  private wasGrounded = true;
  private strokeIn = 0;
  // Night chorus.
  private nextFrog = 2;
  private nextCricket = 1;

  /** Call from a click: audio can only start after a user gesture. */
  enable(): void {
    if (!this.ctx) this.init();
    if (!this.paused) void this.ctx!.resume();
    this.apply();
  }

  /** Freeze the effects and ambience where they are (the pause menu), and carry on from there. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  /** Effects and ambience on or off, and their share of the master volume (0..1). */
  set(on: boolean, volume: number): void {
    this.on = on;
    this.volume = volume;
    this.apply();
  }

  private apply(): void {
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(this.on ? this.volume : 0, this.ctx.currentTime, 0.08);
  }

  private init(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // The creek: looped noise, low and rumbling; opens up as the water rises.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.creekTone = ctx.createBiquadFilter();
    this.creekTone.type = 'lowpass';
    this.creekTone.frequency.value = 500;
    this.creek = ctx.createGain();
    this.creek.gain.value = 0;
    src.connect(this.creekTone).connect(this.creek).connect(this.out);
    src.start();
  }

  // ---- One-shots ---------------------------------------------------------------

  /** A burst of filtered noise: the building block of most effects here. */
  private burst(
    at: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    peak: number,
    attack: number,
    decay: number,
    sweepTo?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    src.connect(f).connect(g).connect(this.out);
    src.start(at, Math.random() * 1.5);
    src.stop(at + attack + decay + 0.05);
  }

  private tone(at: number, type: OscillatorType, from: number, to: number, peak: number, attack: number, decay: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    osc.connect(g).connect(this.out);
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
  }

  private get ready(): boolean {
    return !!this.ctx && this.on;
  }

  private get now(): number {
    return this.ctx!.currentTime;
  }

  step(surface: Surface, run: boolean): void {
    if (!this.ready) return;
    const t = this.now;
    const v = run ? 1.3 : 1;
    const r = 0.85 + Math.random() * 0.3;
    if (surface === 'water') {
      this.burst(t, 'bandpass', 700 * r, 1.2, 0.22 * v, 0.02, 0.22, 1900 * r);
      this.burst(t + 0.03, 'lowpass', 300, 0.7, 0.12 * v, 0.01, 0.18);
    } else if (surface === 'floor') {
      // Hollow knock on planks or tiles, a little heel click.
      this.tone(t, 'sine', 150 * r, 95, 0.22 * v, 0.004, 0.09);
      this.burst(t, 'bandpass', 2400 * r, 2, 0.05 * v, 0.002, 0.04);
    } else {
      // Wet road and dirt: a soft thud and a gritty scuff.
      this.tone(t, 'sine', 90 * r, 60, 0.16 * v, 0.004, 0.07);
      this.burst(t, 'bandpass', 1300 * r, 0.9, 0.09 * v, 0.006, 0.09);
    }
  }

  land(surface: Surface): void {
    if (!this.ready) return;
    const t = this.now;
    if (surface === 'water') return this.splash(0.4);
    this.tone(t, 'sine', 110, 55, 0.35, 0.004, 0.14);
    this.burst(t, 'lowpass', 900, 0.8, 0.12, 0.004, 0.12);
  }

  splash(strength = 0.25): void {
    if (!this.ready) return;
    const t = this.now;
    this.burst(t, 'bandpass', 500, 0.9, strength, 0.03, 0.45, 2200);
    this.burst(t + 0.05, 'highpass', 3000, 0.5, strength * 0.3, 0.02, 0.3);
  }

  /** Using something (the E prompt). */
  use(): void {
    if (!this.ready) return;
    this.tone(this.now, 'sine', 1150, 1150, 0.08, 0.003, 0.05);
  }

  phone(open: boolean): void {
    if (!this.ready) return;
    const t = this.now;
    const [a, b] = open ? [660, 990] : [880, 590];
    this.tone(t, 'sine', a, a, 0.07, 0.004, 0.06);
    this.tone(t + 0.07, 'sine', b, b, 0.07, 0.004, 0.09);
  }

  /** A notification: two buzzes of the phone's motor and a ping. */
  notify(): void {
    if (!this.ready) return;
    const t = this.now;
    for (const at of [0, 0.22]) this.tone(t + at, 'square', 150, 150, 0.035, 0.01, 0.14);
    this.tone(t + 0.48, 'sine', 1320, 1320, 0.08, 0.005, 0.35);
  }

  /** An objective done. */
  chime(): void {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 784, 784, 0.07, 0.01, 0.4);
    this.tone(t + 0.12, 'sine', 1175, 1175, 0.07, 0.01, 0.6);
  }

  /** A new part of the night: a low swell under the chapter card. */
  chapter(): void {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'sine', 55, 52, 0.25, 0.8, 2.2);
    this.burst(t, 'lowpass', 220, 0.7, 0.12, 0.9, 2);
  }

  /** The big switch by the hall door. */
  clunk(): void {
    if (!this.ready) return;
    const t = this.now;
    this.tone(t, 'square', 75, 50, 0.12, 0.003, 0.08);
    this.burst(t, 'lowpass', 600, 1, 0.2, 0.002, 0.1);
  }

  // ---- Per frame -----------------------------------------------------------------

  /**
   * Footsteps from how far the captain actually moved, and the ambience around them.
   * @param waterY world height of the water surface @param indoors under a roof
   */
  update(dt: number, player: Player, waterY: number, indoors: boolean): void {
    if (!this.ctx || dt <= 0) return;
    const { pos } = player;
    const depth = waterY - pos.y;
    const surface: Surface = depth > 0.04 ? 'water' : indoors ? 'floor' : 'ground';

    const moved = this.last.set ? Math.hypot(pos.x - this.last.x, pos.z - this.last.z) : 0;
    Object.assign(this.last, { x: pos.x, z: pos.z, set: true });
    // A teleport (fade to the hall stairs) is not a stride.
    const speed = moved > 2 ? 0 : moved / dt;
    if (player.swimming) {
      this.travelled = 0;
      this.strokeIn -= speed > 0.3 ? dt : 0;
      if (this.strokeIn <= 0) {
        this.strokeIn = 0.9;
        if (speed > 0.3) this.splash(0.18);
      }
    } else if (player.grounded && speed > 0.2) {
      const run = speed > RUN_SPEED;
      this.travelled += moved;
      if (this.travelled >= (run ? STRIDE.run : STRIDE.walk)) {
        this.travelled = 0;
        this.step(surface, run);
      }
    }
    if (!player.grounded && !player.swimming) this.airborne += dt;
    if (player.grounded && !this.wasGrounded && this.airborne > 0.25) this.land(surface);
    if (player.grounded) this.airborne = 0;
    this.wasGrounded = player.grounded;

    this.ambience(dt, pos.x, pos.z, indoors);
  }

  private ambience(dt: number, x: number, z: number, indoors: boolean): void {
    const t = this.now;
    // Creek: louder near the bank and as it fills; muffled indoors.
    const near = Math.max(0, 1 - Math.abs(z - riverZ(x)) / 55);
    const fill = Math.min(1, Math.max(0, (state.level - 0.9) / 3.2));
    this.creek.gain.setTargetAtTime((0.04 + 0.32 * fill) * (0.25 + 0.75 * near ** 1.5) * (indoors ? 0.45 : 1), t, 0.6);
    this.creekTone.frequency.setTargetAtTime((indoors ? 280 : 380) + 700 * fill, t, 0.6);

    // Night chorus: frogs by the water, crickets in the grass; both thin out in a downpour.
    const hour = state.timeOfDay * 24;
    const night = hour > 18.3 || hour < 5.5;
    const calm = Math.max(0, 1 - state.rainfall / 85);
    if (!night || calm <= 0.05) return;
    const quiet = indoors ? 0.35 : 1;
    this.nextFrog -= dt;
    if (this.nextFrog <= 0) {
      this.nextFrog = 0.6 + Math.random() * (4 / calm);
      this.frog(0.05 * calm * quiet * (0.5 + near));
    }
    this.nextCricket -= dt;
    if (this.nextCricket <= 0) {
      this.nextCricket = 0.4 + Math.random() * (2.5 / calm);
      this.cricket(0.012 * calm * quiet);
    }
  }

  /** A kokak: a few quick pulses of a low, nasal buzz. */
  private frog(peak: number): void {
    const t = this.now;
    const base = 140 + Math.random() * 90;
    const pulses = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pulses; i++) {
      const at = t + i * 0.09;
      const ctx = this.ctx!;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.linearRampToValueAtTime(base * 0.85, at + 0.06);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = base * 4;
      f.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
      osc.connect(f).connect(g).connect(this.out);
      osc.start(at);
      osc.stop(at + 0.08);
    }
  }

  private cricket(peak: number): void {
    const t = this.now;
    const pitch = 4300 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.055, 'sine', pitch, pitch, peak, 0.004, 0.035);
  }
}
