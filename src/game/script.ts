/**
 * The story's fixed data: how the flood develops over the night (water level
 * and rainfall against real seconds since the story began), who is who, and
 * every line of dialogue with the emotion it is delivered with.
 */
import type { VoiceStyle } from './voice';

/** Story clock: the night starts at 18:20 and the simulator clock runs 10x, so 1 real second = 10 story seconds. */
export const STORY_START_HOUR = 18 + 20 / 60;

/**
 * [real s, level m, rain mm/hr]. Negative times are the afternoon before the
 * story starts: it is fed to the sensor history and the forecast model so the
 * creek has already been rising steadily when the captain arrives.
 *
 * The level rises about 22 cm per (story) 10 minutes, just under the 30 cm
 * flash-flood escalation, so each alert level arrives in turn (ADVISORY ≈ 0:20,
 * WARNING ≈ 4:00, EVACUATE ≈ 6:10), and crests near 4.1 m. Rainfall is what the
 * catchment model (src/sim.ts) needs to produce that rise, so the forecast
 * model sees a storm that makes physical sense.
 */
const TIMELINE: [number, number, number][] = [
  [-180, 1.26, 19],
  [0, 1.92, 37],
  [245, 2.82, 62],
  [380, 3.36, 78],
  [520, 4.05, 100],
  [640, 4.15, 90],
  [780, 3.85, 55],
];
/** Real seconds of afternoon history before the story begins. */
export const HISTORY_S = -TIMELINE[0][0];
/** Real seconds after which the night is over, wherever the captain is. */
export const STORY_END_S = 780;

export function storyAt(t: number): { level: number; rain: number } {
  const k = TIMELINE;
  if (t <= k[0][0]) return { level: k[0][1], rain: k[0][2] };
  if (t >= k[k.length - 1][0]) return { level: k[k.length - 1][1], rain: k[k.length - 1][2] };
  let i = 1;
  while (k[i][0] < t) i++;
  const [t0, l0, r0] = k[i - 1];
  const [t1, l1, r1] = k[i];
  const f = (t - t0) / (t1 - t0);
  return { level: l0 + (l1 - l0) * f, rain: r0 + (r1 - r0) * f };
}

/** Resident indices (one resident per house in layout order). */
export const LOLA = 15;
export const BEN = 20;
/** Aling Nena's boy (a child in the second row of houses), who wanders off to watch the canal. */
export const TOTO = 9;
/** These do not leave on the siren alone: the captain has to go to them. */
export const HOLDOUTS = [LOLA, BEN, TOTO];

export const NAMES = {
  you: 'You',
  lito: 'Kagawad Lito',
  radio: 'Kagawad Lito (radio)',
  jun: 'Tanod Jun (radio)',
  bulletin: 'Radio bulletin',
  lola: 'Lola Cora',
  ben: 'Mang Ben',
  toto: 'Toto',
  nena: 'Aling Nena',
  narrator: '',
} as const;
export type Speaker = keyof typeof NAMES;

/** How a line is delivered: drives the recorded voices' intensity and pace (tools/voices). */
export type Emotion = 'calm' | 'warm' | 'concerned' | 'urgent' | 'alarmed' | 'stubborn' | 'scared' | 'relieved' | 'tired' | 'excited';
export type Line = [Speaker, string, Emotion?];

/**
 * Fallback voices (browser speech) for anyone without a recorded line. The captain and the
 * narrator stay silent, as subtitles only. Radio speakers are played through a radio filter.
 */
export const VOICES: Partial<Record<Speaker, VoiceStyle>> = {
  lito: { gender: 'male', pitch: 0.95, rate: 1.05 },
  radio: { gender: 'male', pitch: 0.95, rate: 1.12, radio: true },
  jun: { gender: 'male', pitch: 1.1, rate: 1.15, variant: 1, radio: true },
  bulletin: { gender: 'male', pitch: 0.9, rate: 1, variant: 2, radio: true },
  lola: { gender: 'female', pitch: 1.3, rate: 0.8 },
  ben: { gender: 'male', pitch: 0.7, rate: 0.92, variant: 1 },
  toto: { gender: 'female', pitch: 1.7, rate: 1.15 },
  nena: { gender: 'female', pitch: 1.05, rate: 1.05, variant: 1 },
};

export const LINES = {
  intro: [
    ['narrator', 'Barangay San Roque. 6:20 in the evening. Rain has been drumming on the hall roof since lunch.'],
    [
      'bulletin',
      'PAGASA has raised a red rainfall warning for the province. Torrential rain, more than thirty millimetres an hour, getting heavier over the next three hours. Serious flooding is expected in low-lying areas near rivers and creeks.',
      'calm',
    ],
    [
      'lito',
      'Kap, you hear that? Red warning. And the creek sensor has been climbing all afternoon. Slow, but it never stops.',
      'concerned',
    ],
    ['lito', 'The laptop is on. Look at what the forecast is saying.', 'concerned'],
  ] as Line[],
  forecastSeen: (text: string): Line[] => [
    ['you', `Two metres and climbing. The forecast says: ${text}.`],
    [
      'lito',
      "That is the Bantay Baha forecast, Kap. It takes PAGASA's rain outlook and how fast the creek has been rising, and looks an hour ahead.",
      'calm',
    ],
    ['lito', 'The sirens have not even gone off yet. If we move now, we move before the water does. Send an early advisory.', 'urgent'],
  ],
  forecastLate: [['lito', 'The forecast is still loading its history, Kap. Give it a moment and check again.', 'calm']] as Line[],
  forecastWarns: (minutes: number): Line[] => [
    ['lito', `Kap, the forecast now expects the WARNING level in about ${minutes} minutes.`, 'urgent'],
  ],
  advisory: [['narrator', 'Your phone buzzes. ADVISORY from the creek sensor: the water has reached 200 centimetres.']] as Line[],
  advisorySent: [
    ['lito', 'Good, that is out. People will start packing their go-bags.', 'relieved'],
    [
      'lito',
      'Two things, Kap. The mats for the evacuation center are still rolled up in the corner. And at the sari-sari store they say the sensor is broken.',
      'concerned',
    ],
    ['lito', 'Can you check it against the staff gauge down at the creek? People will believe their own eyes.', 'concerned'],
  ] as Line[],
  matsDone: [
    ['you', 'Eighteen mats down. Enough for the first families.'],
    ['lito', 'Salamat, Kap. I will set up the registration table by the door.', 'warm'],
  ] as Line[],
  gaugeOk: (eye: number, sensor: number): Line[] => [
    ['you', `The gauge reads about ${eye} centimetres. The sensor says ${sensor}. It is working.`],
  ],
  warning: [
    ['jun', 'Kap, this is Jun at the bridge! The creek is over the bank. Water is on the road by the bridge!', 'alarmed'],
    ['radio', 'Sound the siren, Kap! The switch is by the hall door, or use the dashboard.', 'urgent'],
    ['radio', 'And remember: Mang Ben across the creek never leaves, and Lola Cora lives alone by the river at the west end.', 'urgent'],
  ] as Line[],
  totoMissing: [
    [
      'jun',
      'Kap, Aling Nena is here. Her boy Toto is missing! Someone saw him by the canal near the main road, watching the water.',
      'alarmed',
    ],
  ] as Line[],
  sirenOn: [['radio', 'Siren is up! People are coming out with their bags.', 'relieved']] as Line[],
  benEarly: [['ben', 'Kap, there is no flood. I have lived here forty years. I will watch the water myself.', 'stubborn']] as Line[],
  ben: [
    ['ben', 'Kap! I told you, the water never reaches this house!', 'stubborn'],
    ['you', 'It is over the bank and still rising, Mang Ben. The forecast says it will be at your door within the hour.'],
    ['ben', '...Within the hour? Sige, sige. Get the kids, we are going. Salamat, Kap.', 'concerned'],
  ] as Line[],
  benPacking: [['ben', 'We are packing, Kap! Two minutes!', 'urgent']] as Line[],
  lolaEarly: [['lola', 'Ay, Kap. Is it bad already? Come back for me if it gets worse, ha?', 'tired']] as Line[],
  lola: [
    ['lola', "Ay, Kap... the water is at my steps. My knees... I can't run anymore.", 'scared'],
    ['you', "Take my arm, Lola. We'll walk together. Slowly."],
    ['lola', 'You have a good heart, anak. Do not let go of me.', 'scared'],
  ] as Line[],
  lolaSafe: [['lola', 'Salamat, anak. God bless you. God bless you.', 'relieved']] as Line[],
  lolaSlow: [['lola', 'Ay, anak, not so fast! My knees!', 'scared']] as Line[],
  lolaHold: [['you', 'Here, Lola. Hold my hand.']] as Line[],
  benReady: [['ben', 'Got the bags. Tara na, Kap. Lead the way.', 'concerned']] as Line[],
  nenaWaiting: [['nena', 'Kap! Have you seen my Toto? He was not at home!', 'scared']] as Line[],
  nenaFound: [['nena', 'You found him? Salamat, Kap! I will wait for him here.', 'relieved']] as Line[],
  toto: [
    ['toto', 'Kap! Look how high the water is! It is like a river now!', 'excited'],
    ['you', 'It is dangerous here, Toto. Your nanay is looking for you. Run to the hall. Now!'],
    ['toto', 'Opo, Kap! Sorry po!', 'scared'],
  ] as Line[],
  totoSafe: [['nena', 'Toto! Anak, where did you go?! Salamat, Kap. Salamat po.', 'relieved']] as Line[],
  evacuate: [
    ['jun', 'Kap, the main road is going under! It is up to my knees here!', 'alarmed'],
    ['radio', 'Kap, get everyone inside and come back to the hall. We need the headcount for the MDRRMO.', 'urgent'],
  ] as Line[],
  lateSelfEvac: [['radio', 'No siren yet, so people are leaving on their own. Some are wading. Hurry, Kap!', 'alarmed']] as Line[],
  allIn: [['radio', 'Kap, the list matches. Everyone is inside. Come in and we will call it in.', 'relieved']] as Line[],
  report: [
    ['lito', 'Twenty-three residents, all accounted for. Calling the MDRRMO now.', 'calm'],
    [
      'lito',
      'MDRRMO, this is Barangay San Roque. Everyone is in the evacuation center. Water at the sensor is over four metres and holding.',
      'calm',
    ],
    ['lito', 'Rest, Kap. You did good tonight.', 'warm'],
  ] as Line[],
  rescued: [['narrator', 'The current took your feet. Two tanods pulled you out and brought you to the hall stairs.']] as Line[],
  litoHint: [['lito', 'Check your phone, Kap. Everything the sensor sees is on the dashboard, with the forecast.', 'calm']] as Line[],
};
