/**
 * Offline fallback. If the hall's Wi-Fi or the gateway dies, the pole still
 * works out the alert level itself, flashes its beacon, and texts the captain
 * through a GSM module (SIM800L, a prepaid SIM, a few pesos a month). This is
 * the simulator's version of that: a switch that cuts the link, and the SMS.
 */
import type { Status } from '../state';

/** Set by the "Simulate network down" switch. */
export const link = { down: false };

const ACTION: Record<Status, string> = {
  NORMAL: 'Water is falling. Stay alert.',
  ADVISORY: 'Prepare go-bags.',
  WARNING: 'Low-lying homes go to the Barangay Hall now.',
  EVACUATE: 'EVERYONE to the Barangay Hall now!',
};

/** One text, plain ASCII so it fits a single 160-character GSM-7 message. */
export function smsText(status: Status, levelCm: number, rateCm: number): string {
  const rate = `${rateCm >= 0 ? '+' : ''}${Math.round(rateCm)}`;
  return `BANTAY BAHA bb-01 ${status}: ${Math.round(levelCm)}cm, ${rate}cm/10min. ${ACTION[status]}`;
}
