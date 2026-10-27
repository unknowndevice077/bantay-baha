/** The "Simulate network down" switch and the captain's-phone SMS log. */
import { toast } from '../hud/hud';
import { type Status, bus, state } from '../state';
import { link, smsText } from './offline';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export function initOffline(): void {
  const box = $<HTMLInputElement>('i-offline');
  const sms = $('sms');
  const list = $('sms-log');

  const send = (status: Status): void => {
    const r = state.reading;
    const li = document.createElement('li');
    li.textContent = smsText(status, (r?.level ?? state.level) * 100, r?.rate ?? 0);
    list.prepend(li);
    while (list.children.length > 4) list.lastElementChild?.remove();
    sms.hidden = false;
  };

  box.addEventListener('change', () => {
    link.down = box.checked;
    if (link.down) {
      toast('Network down: nothing reaches the hall. The pole still flashes and texts.');
      if (state.status !== 'NORMAL') send(state.status);
    } else {
      toast('Network back: readings reach the dashboard again.');
      sms.hidden = true;
      list.replaceChildren();
    }
  });

  // Every change of level is texted while the link is down.
  bus.on('status', ({ to }) => {
    if (link.down) send(to);
  });
  bus.on('reset', () => {
    list.replaceChildren();
    sms.hidden = true;
  });
}
