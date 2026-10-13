/**
 * The in-game menu: pauses the night (story clock, water, NPC dialogue) and
 * offers the way out: resume, restart, back to the simulator, or the
 * dashboard following this game in another tab. Opens from the Menu button,
 * Esc, or when the browser releases the captured mouse (Esc while looking around).
 */
import { state } from '../state';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class PauseMenu {
  paused = false;
  /** Story speed to restore on resume. */
  private speed = 1;

  /**
   * @param canPause false on the title screen, the ending and while the phone or laptop is up
   * @param onPause / onResume hand the mouse back and forth
   */
  constructor(
    private readonly canPause: () => boolean,
    private readonly onPause: () => void,
    private readonly onResume: () => void,
  ) {
    $('b-menu').addEventListener('click', () => this.toggle());
    $('pm-resume').addEventListener('click', () => this.resume());
    $('pm-restart').addEventListener('click', () => location.reload());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && (this.paused || this.canPause())) this.toggle();
    });
    // Esc while looking around releases the mouse first; treat that as "pause", as most first-person games do.
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && !this.paused && this.canPause()) this.pause();
    });
  }

  toggle(): void {
    if (this.paused) this.resume();
    else if (this.canPause()) this.pause();
  }

  private pause(): void {
    this.paused = true;
    this.speed = state.speed;
    state.speed = 0;
    $('pause').hidden = false;
    this.onPause();
  }

  private resume(): void {
    this.paused = false;
    state.speed = this.speed;
    $('pause').hidden = true;
    this.onResume();
  }
}
