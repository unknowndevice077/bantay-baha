/** On-screen parts of the story game: subtitles, objective list, chapter cards, fades and the after-action report. */
import { type Line, NAMES, VOICES } from './script';
import type { Voice } from './voice';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * Lines play one after another. Voiced lines stay up until the voice finishes;
 * the rest long enough to read. Enter or a click skips ahead.
 */
export class Subtitles {
  private readonly queue: Line[] = [];
  private left = 0;
  /** Increments per line so a late "voice finished" can't cut the next line short. */
  private line = 0;
  private readonly box = $('subtitle');

  constructor(private readonly voice: Voice) {
    const skip = () => {
      this.left = 0;
      voice.stop();
    };
    this.box.addEventListener('click', skip);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') skip();
    });
  }

  play(lines: Line[]): void {
    this.queue.push(...lines);
  }

  /** A line is showing or waiting. */
  get busy(): boolean {
    return this.left > 0 || this.queue.length > 0;
  }

  update(dt: number): void {
    this.left -= dt;
    if (this.left > 0) return;
    const next = this.queue.shift();
    this.box.hidden = !next;
    if (!next) return;
    const [who, text] = next;
    $('sub-who').textContent = NAMES[who];
    $('sub-who').hidden = who === 'narrator';
    $('sub-text').textContent = text;
    this.box.classList.toggle('narration', who === 'narrator');
    const reading = Math.max(2.8, text.split(' ').length * 0.32);
    const style = VOICES[who];
    if (!style || !this.voice.enabled) {
      this.left = reading;
      return;
    }
    // Hold until the voice ends (with a ceiling in case the engine never reports back).
    const id = ++this.line;
    this.left = reading + 8;
    this.voice.speak(who, text, style, 'en', () => {
      if (id === this.line) this.left = Math.min(this.left, 0.35);
    });
  }
}

export interface ObjectiveView {
  text: string;
  done: boolean;
  late: boolean;
  /** The current task's how-to line. */
  how?: string;
  /** "N earlier tasks done". */
  summary?: boolean;
}

export function renderObjectives(chapter: string, title: string, items: ObjectiveView[]): void {
  $('obj-chapter').textContent = chapter;
  $('obj-title').textContent = title;
  $('obj-list').replaceChildren(
    ...items.map((o) => {
      const li = document.createElement('li');
      li.textContent = o.text;
      if (o.summary) li.className = 'done summary';
      else if (o.done) li.className = 'done';
      else if (o.late) li.className = 'late';
      if (o.how) {
        li.classList.add('current');
        const how = document.createElement('small');
        how.textContent = o.how;
        li.append(how);
      }
      return li;
    }),
  );
}

let cardTimer: ReturnType<typeof setTimeout> | undefined;
/** Full-width chapter title that fades in and out. */
export function chapterCard(kicker: string, title: string, seconds = 4): void {
  const card = $('chapter');
  $('ch-kicker').textContent = kicker;
  $('ch-title').textContent = title;
  card.classList.remove('show');
  void card.offsetWidth;
  card.classList.add('show');
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => card.classList.remove('show'), seconds * 1000);
}

/** Fade to black, run `mid` while the screen is dark, then fade back. */
export function fadeThrough(mid: () => void, holdMs = 900): void {
  const fade = $('fade');
  fade.classList.add('on');
  setTimeout(() => {
    mid();
    setTimeout(() => fade.classList.remove('on'), holdMs);
  }, 700);
}

export interface ReportRow {
  label: string;
  value: string;
  good: boolean;
}

export function showReport(verdict: string, summary: string, rows: ReportRow[]): void {
  $('rp-verdict').textContent = verdict;
  $('rp-summary').textContent = summary;
  $('rp-rows').replaceChildren(
    ...rows.flatMap((r) => {
      const dt = document.createElement('dt');
      dt.textContent = r.label;
      const dd = document.createElement('dd');
      dd.textContent = r.value;
      dd.className = r.good ? 'good' : 'bad';
      return [dt, dd];
    }),
  );
  $('report').hidden = false;
}
