/**
 * All sound is synthesized with WebAudio (no audio files): rolling siren,
 * rain ambience, thunder and rubber-duck quacks. Silent until the user enables sound.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sirenGain!: GainNode;
  private rainGain!: GainNode;
  private noise!: AudioBuffer;
  private burstUntil = 0;
  private enabled = false;
  private volume = 1;
  private rainTone!: BiquadFilterNode;
  private muffled = false;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && !this.ctx) this.init();
    if (!this.ctx) return;
    if (on) void this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.8 * this.volume : 0, this.ctx.currentTime, 0.1);
  }

  /** Overall loudness, 0..1 (the story game's volume slider). */
  setVolume(volume: number): void {
    this.volume = volume;
    this.setEnabled(this.enabled);
  }

  /** Under a roof: the rain becomes a duller drumming. */
  setMuffled(on: boolean): void {
    if (!this.ctx || on === this.muffled) return;
    this.muffled = on;
    this.rainTone.frequency.setTargetAtTime(on ? 900 : 3500, this.ctx.currentTime, 0.2);
  }

  private init(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Rain: looped noise through a band of filters.
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainTone = lp;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.master);
    rain.start();

    // Siren: sawtooth whose pitch is swept by a slow LFO (classic wail).
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 850;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 320;
    lfo.connect(lfoDepth).connect(osc.frequency);
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    osc.connect(tone).connect(this.sirenGain).connect(this.master);
    osc.start();
    lfo.start();
  }

  /** @param rain mm/hr @param evacuate keep the siren wailing */
  update(rain: number, evacuate: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime((rain / 100) * 0.35, now, 0.5);
    this.sirenGain.gain.setTargetAtTime(evacuate || now < this.burstUntil ? 0.1 : 0, now, 0.15);
  }

  /** Short siren burst (Lola mode delivers every scolding with one). */
  sirenBurst(seconds: number): void {
    if (this.ctx && this.enabled) this.burstUntil = this.ctx.currentTime + seconds;
  }

  thunder(delay: number): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1.2, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.5);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 3.6);
  }

  quack(delay = 0): void {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.18);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}
