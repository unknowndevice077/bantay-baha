/**
 * The captain's phone and the hall's operations laptop. Both run the real
 * operations dashboard (dashboard.html) in an iframe, fed by this page over a
 * BroadcastChannel, so the siren and broadcast buttons on them act on the game
 * world. Alerts also arrive as phone notifications.
 */
import type { Lang, Status } from '../state';

export type Device = 'phone' | 'laptop';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Note {
  status: Status;
  title: string;
  body: string;
  time: string;
}

export class Devices {
  /** Off until the story starts (the title screen owns the keyboard). */
  enabled = false;
  open: Device | null = null;
  /** The dashboard came on screen (phone unlocked, or laptop opened). */
  onOpen: (() => void) | null = null;
  /** A device came up (true) or was put away (false): first-person look pauses meanwhile. */
  onToggle: ((open: boolean) => void) | null = null;
  /** A notification arrived (for the buzz). */
  onNotify: (() => void) | null = null;
  private readonly frames: Partial<Record<Device, HTMLIFrameElement>> = {};
  private readonly unread: Note[] = [];
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;
  private clock = '18:20';

  constructor(
    private readonly channel: string,
    private readonly lang: () => Lang,
  ) {
    $('ph-close').addEventListener('click', () => this.close());
    $('lt-close').addEventListener('click', () => this.close());
    $('b-phone').addEventListener('click', () => this.toggle('phone'));
    $('banner').addEventListener('click', () => this.show('phone'));
    $('ph-notes').addEventListener('click', () => this.unlock());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'p') this.toggle('phone');
      else if (e.key === 'Escape' && this.open) {
        e.preventDefault(); // this Esc is spent closing the device, not opening the menu
        this.close();
      }
    });
  }

  private frame(d: Device): HTMLIFrameElement {
    let f = this.frames[d];
    if (!f) {
      f = document.createElement('iframe');
      f.title = d === 'phone' ? 'Bantay Baha app on your phone' : 'Bantay Baha operations dashboard';
      f.src = `dashboard.html?embed=${d}&channel=${encodeURIComponent(this.channel)}&lang=${this.lang()}`;
      $(d === 'phone' ? 'ph-screen' : 'lt-screen').append(f);
      this.frames[d] = f;
    }
    return f;
  }

  toggle(d: Device): void {
    if (this.open === d) this.close();
    else this.show(d);
  }

  show(d: Device): void {
    if (!this.enabled) return;
    if (this.open && this.open !== d) this.close();
    this.open = d;
    $(d).hidden = false;
    this.onToggle?.(true);
    document.body.classList.add('device-open');
    $('banner').hidden = true;
    if (d === 'phone') {
      $('ph-lock').hidden = this.unread.length === 0;
      this.renderLock();
      // Load the app behind the lock screen so it is ready (and has history) when unlocked.
      this.frame('phone');
      if (this.unread.length === 0) this.onOpen?.();
    } else {
      this.frame('laptop');
      this.onOpen?.();
    }
  }

  /** Tap a notification: open the app. */
  private unlock(): void {
    this.unread.length = 0;
    $('ph-lock').hidden = true;
    this.onOpen?.();
  }

  close(): void {
    if (!this.open) return;
    $(this.open).hidden = true;
    this.open = null;
    document.body.classList.remove('device-open');
    (document.activeElement as HTMLElement | null)?.blur();
    window.focus();
    this.onToggle?.(false);
  }

  setClock(text: string): void {
    if (text === this.clock) return;
    this.clock = text;
    $('ph-time').textContent = text;
    $('ph-lock-time').textContent = text;
  }

  /** A push notification from the Bantay Baha app. */
  notify(status: Status, title: string, body: string): void {
    const note = { status, title, body, time: this.clock };
    this.onNotify?.();
    this.unread.unshift(note);
    this.renderLock();
    if (this.open === 'phone') return;
    const banner = $('banner');
    banner.className = `banner s-${status}`;
    $('bn-title').textContent = title;
    $('bn-body').textContent = body;
    banner.hidden = false;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (banner.hidden = true), 7000);
  }

  private renderLock(): void {
    $('ph-notes').replaceChildren(
      ...this.unread.map((n) => {
        const li = document.createElement('li');
        li.className = `s-${n.status}`;
        li.innerHTML = '<header><span>Bantay Baha</span><time></time></header><b></b><p></p>';
        li.querySelector('time')!.textContent = n.time;
        li.querySelector('b')!.textContent = n.title;
        li.querySelector('p')!.textContent = n.body;
        return li;
      }),
    );
  }
}
