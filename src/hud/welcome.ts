/**
 * First-visit guide for the simulator: what this is and the three things to do
 * with it (watch a storm here, play the story as the captain, open the
 * captain's dashboard), each one click away. The Guide button brings it back.
 *
 * Also names this window, so the dashboard's "Simulator" link returns to this
 * tab instead of opening another one.
 */
import './welcome.css';
import type { CameraRig } from '../scene/cameraRig';
import { toast } from './hud';

const SEEN_KEY = 'bantay-baha-welcome-seen';
/** Window names the simulator and dashboard use to find each other's tabs. */
export const SIM_WINDOW = 'bantay-baha-sim';
export const DASHBOARD_WINDOW = 'bantay-baha-dashboard';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage blocked: the guide just shows again next time
  }
}

/** Open (or switch to) the dashboard tab, with a note on how the two tabs work together. */
export function openDashboard(): void {
  window.open('dashboard.html', DASHBOARD_WINDOW);
  toast('The dashboard opened in another tab. It follows this simulator live, so keep this tab open too.');
}

export function initWelcome(rig: CameraRig): void {
  window.name = SIM_WINDOW;
  const box = $('welcome');
  const close = () => {
    box.hidden = true;
    markSeen();
  };
  $('w-storm').addEventListener('click', () => {
    close();
    // A quick, watchable storm: 5x speed from the overview camera.
    const speed = $<HTMLInputElement>('i-speed');
    speed.value = '5';
    speed.dispatchEvent(new Event('input'));
    if ($('b-storm').textContent?.startsWith('Play') || $('b-storm').textContent?.startsWith('Resume')) $('b-storm').click();
    rig.goTo('overview');
    toast('Storm started. Watch the level and status on the left, and the alerts at the bottom.');
  });
  $('w-dashboard').addEventListener('click', () => {
    close();
    openDashboard();
  });
  $('w-close').addEventListener('click', close);
  $('b-guide').addEventListener('click', () => (box.hidden = false));
  // The bottom-bar Dashboard link: reuse the dashboard tab and explain it.
  $('l-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    openDashboard();
  });
  box.hidden = seen();
  // The world is built: lift the loading screen.
  document.getElementById('loading')?.remove();
}
