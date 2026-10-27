/** The "Replay a night" panel: record the simulator, save it, load one, play it back. */
import { type Recording, Recorder, durationOf, parseRecording, sampleAt, sampleRecording } from './recording';
import { bus, state } from '../state';
import { resetSim } from '../sim';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class ReplayView {
  private readonly recorder = new Recorder();
  private recorded: Recording | null = null;
  private playing: Recording | null = null;
  private pos = 0;
  private lastSim = 0;
  private started = 0;
  private note = 'Record a storm, or play the sample.';

  constructor() {
    bus.on('reading', (r) => this.recorder.add(r.t, r.level, state.rainfall));
    $('rc-record').addEventListener('click', () => this.toggleRecord());
    $('rc-save').addEventListener('click', () => this.save());
    $('rc-sample').addEventListener('click', () => this.play(sampleRecording()));
    $('rc-play').addEventListener('click', () => this.recorded && this.play(this.recorded));
    $('rc-stop').addEventListener('click', () => this.stopPlaying('Replay stopped.'));
    $<HTMLInputElement>('rc-file').addEventListener('change', (e) => this.load(e.target as HTMLInputElement));
    this.render();
  }

  private toggleRecord(): void {
    if (this.recorder.active) {
      this.recorded = this.recorder.stop(`Night recorded ${new Date().toLocaleString()}`);
      this.note = this.recorded
        ? `Recorded ${clock(durationOf(this.recorded))}, ${this.recorded.points.length} points.`
        : 'Too short to keep. Let the water move first.';
    } else {
      this.recorder.start();
      this.started = state.simTime;
      this.note = 'Recording...';
    }
    this.render();
  }

  private save(): void {
    if (!this.recorded) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.recorded)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bantay-baha-night-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private async load(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.recorded = parseRecording(await file.text());
      this.play(this.recorded);
    } catch (e) {
      this.note = `Can't use that file: ${(e as Error).message}`;
      this.render();
    }
  }

  private play(rec: Recording): void {
    if (this.recorder.active) this.toggleRecord();
    resetSim();
    const first = rec.points[0];
    Object.assign(state, { source: 'replay', stormPlaying: false, level: first.level, targetLevel: first.level, rainfall: first.rain });
    this.playing = rec;
    this.pos = 0;
    this.lastSim = state.simTime;
    this.note = `Playing: ${rec.title}`;
    this.render();
  }

  private stopPlaying(note: string): void {
    if (!this.playing) return;
    this.playing = null;
    if (state.source === 'replay') state.source = 'rain';
    this.note = note;
    this.render();
  }

  /** Per frame. The playback position follows the simulation clock, so the Speed slider and the pause menu apply. */
  update(): void {
    const dt = state.simTime - this.lastSim;
    this.lastSim = state.simTime;
    if (this.recorder.active) $('rc-status').textContent = `Recording... ${clock(state.simTime - this.started)}`;
    const rec = this.playing;
    if (!rec) return;
    // The sliders or the storm button took over.
    if (state.source !== 'replay') {
      this.stopPlaying('Replay stopped: you took control.');
      return;
    }
    this.pos += dt;
    const s = sampleAt(rec.points, this.pos);
    state.targetLevel = s.level;
    state.rainfall = s.rain;
    if (this.pos >= durationOf(rec)) {
      this.stopPlaying('Replay finished.');
      return;
    }
    $('rc-status').textContent = `Playing ${clock(this.pos)} / ${clock(durationOf(rec))}`;
  }

  private render(): void {
    $('rc-status').textContent = this.note;
    $('rc-record').textContent = this.recorder.active ? 'Stop recording' : 'Record';
    $<HTMLButtonElement>('rc-save').disabled = !this.recorded;
    $<HTMLButtonElement>('rc-play').disabled = !this.recorded;
    $<HTMLButtonElement>('rc-stop').disabled = !this.playing;
  }
}
