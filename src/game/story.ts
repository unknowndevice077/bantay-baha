/**
 * Runs the night: drives the flood along the story timeline, runs the
 * forecast model on the live sensor feed, moves the story from act to act as
 * the sensor raises each alert level, hands out objectives, voices the cast,
 * rescues the captain from the current, and writes the after-action report.
 */
import * as THREE from 'three';
import { HALL, SENSOR_HEIGHT, THRESHOLDS } from '../config';
import { type Forecast, Forecaster } from '../forecast/forecaster';
import type { Sample } from '../forecast/model';
import type { ForecastSummary } from '../net/protocol';
import type { Interactable } from '../player/interactions';
import type { Player } from '../player/player';
import { createMats, createOpsDesk } from '../player/props';
import { ASSEMBLY, HALL_DOOR, HALL_INSIDE, HALL_PLAN, HALL_STAIRS } from '../scene/layout';
import { PersonRig } from '../scene/person';
import { walkHeight } from '../scene/walkable';
import { classifyStatus, riseRate } from '../sensor/status';
import { type Reading, STATUSES, type Status, bus, state } from '../state';
import type { World } from '../world';
import { Beacon } from './beacon';
import type { Devices } from './devices';
import { BEN, HISTORY_S, HOLDOUTS, LINES, LOLA, type Line, STORY_END_S, STORY_START_HOUR, TOTO, storyAt } from './script';
import { type ObjectiveView, type ReportRow, Subtitles, chapterCard, fadeThrough, renderObjectives, showReport } from './ui';
import type { Voice } from './voice';

type ObjectiveId = 'forecast' | 'advisory' | 'gauge' | 'mats' | 'siren' | 'ben' | 'lola' | 'toto' | 'all' | 'return' | 'report';

interface Objective {
  id: ObjectiveId;
  /** The act it belongs to; still open after that act ends = late. */
  act: number;
  text: () => string;
  /** What to do, in plain steps; shown under the current objective. */
  how: () => string;
  target: () => THREE.Vector3 | null;
  label: string;
  shown: boolean;
  done: boolean;
}

/** How to do each task, for players who don't know the game yet. */
const HOW: Record<ObjectiveId, string> = {
  forecast: 'Walk to the laptop on your office desk (follow the marker) and press E.',
  advisory: 'Open the dashboard: P for your phone, or E at the laptop. Press "Broadcast to PA and screens" or "Send SMS blast".',
  mats: 'The rolled-up mats are in the corner of the hall. Walk up to them and press E.',
  gauge: 'Follow the marker down to the creek bank and press E at the painted gauge board.',
  siren: 'Press E at the red switch by the hall door, or "Sound siren" on the dashboard.',
  toto: 'Follow the marker to the canal by the main road and press E to talk to him.',
  ben: 'Cross the bridge, follow the marker to Mang Ben and press E.',
  lola: 'Follow the marker to her house by the river and press E. She will follow you.',
  all: 'Residents walk to the hall on their own once the siren sounds. Press E on anyone still outside.',
  return: 'Go back inside the evacuation center.',
  report: 'Find Kagawad Lito at the registration table inside the hall and press E.',
};

const CHAPTERS: [string, string][] = [
  ['Prologue', 'Signal No. 2'],
  ['Part one', 'Advisory'],
  ['Part two', 'Over the bank'],
  ['Part three', 'Evacuate'],
  ['Epilogue', 'The morning after'],
];

/** The captain's desk in the hall office (back-left corner, laptop facing the room). */
const OFFICE = { x: HALL.x - 4.5, z: HALL.z + 3.3 };
/** Rolled sleeping mats waiting in the back-right corner of the hall. */
const MAT_STACK = { x: HALL.x + 5, z: HALL.z + 3.2 };
/** Where Toto stands watching the canal, beside the main road. */
const TOTO_SPOT = { x: -20.1, z: 25.6 };

/** Swimming this long in fast water and the current takes you (s). */
const SWEPT_AFTER = 6;
/** How much faster the night runs while the captain has nothing left to do but wait for the water. */
const FAST_FORWARD = 6;

const ground = (x: number, z: number) => new THREE.Vector3(x, walkHeight(x, z), z);
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Story {
  /** Real seconds since the night began. */
  private t = 0;
  running = false;
  ended = false;
  private act = 0;
  /** Story speed: 1, or up to FAST_FORWARD while every task so far is done and the water is what we are waiting for. */
  private pace = 1;
  /** Story beats worth a sound: an objective done, a new part of the night. */
  onBeat: ((beat: 'done' | 'chapter') => void) | null = null;
  private simStart = 0;
  private readonly subs: Subtitles;
  private readonly beacon = new Beacon();
  private readonly desk = createOpsDesk(OFFICE.x, OFFICE.z);
  private readonly mats = createMats(MAT_STACK.x, MAT_STACK.z, HALL_PLAN.floorY, HALL_INSIDE);
  private readonly lito = new PersonRig({ model: 'casual-man', skin: 0x9a6544, hair: 0x1a1410, scale: 1.02 });
  private readonly litoPos: THREE.Vector3;
  private readonly forecaster = new Forecaster();
  private readonly objectives: Objective[];
  private readonly timers: { at: number; fn: () => void }[] = [];
  /** Story-clock times (s since the night began) of each milestone. */
  private readonly reached: Partial<Record<Status, number>> = {};
  /** When the forecast first expected each level within the hour. */
  private readonly forecastAt: Partial<Record<Status, number>> = {};
  private advisoryAt: number | null = null;
  private sirenAt: number | null = null;
  private gaugeDiff: number | null = null;
  private readonly leftAt: (number | null)[];
  private escorting = false;
  /** Which way the captain is facing (xz), for walking hand in hand. */
  private readonly playerFwd = new THREE.Vector3(0, 0, -1);
  private readonly lastPlayerPos = new THREE.Vector3();
  /** The captain's own hand and sleeve, seen at the bottom right while holding Lola's hand. */
  private readonly handView = new THREE.Group();
  /** Story time of the last "slow down" / "hold my hand" line, so they don't repeat every step. */
  private handLineAt = -1e9;
  /** Aling Nena, waiting at the hall stairs for her son. */
  private readonly nena = new PersonRig({ model: 'woman-casual', skin: 0xa06b47, hair: 0x15110f, scale: 0.97 });
  private readonly nenaPos = ground(ASSEMBLY.x + 2.2, ASSEMBLY.z - 0.6);
  private nenaRoute: THREE.Vector3[] = [];
  private nenaShown = false;
  private reunited = false;
  private benReadySaid = false;
  private totoSent = false;
  private selfEvac = false;
  private allInSaid = false;
  private reporting = false;
  private swim = 0;
  private rescues = 0;
  private peak = 0;
  private lastObjectives = '';

  constructor(
    private readonly world: World,
    private readonly player: Player,
    private readonly devices: Devices,
    private readonly voice: Voice,
  ) {
    this.subs = new Subtitles(voice);
    const { residents } = world;
    this.leftAt = Array.from({ length: residents.count }, () => null);
    residents.auto = false;
    residents.setPace(LOLA, 0.65);
    residents.restyle(LOLA, { model: 'woman-dress', skin: 0x8a5a3c, hair: 0xc9c6c0, scale: 0.9 });
    residents.restyle(BEN, { model: 'farmer', skin: 0x7a4b2f, hair: 0x1f1712 });
    this.litoPos = ground(OFFICE.x + 1.5, OFFICE.z - 0.9);
    this.lito.pose(0, 0, this.litoPos.x, this.litoPos.y, this.litoPos.z, Math.PI);
    world.scene.add(this.beacon.group, this.desk.group, this.mats.group, this.lito.root, this.nena.root, this.handView);
    this.nena.root.visible = false;
    this.buildHandView();
    residents.onHand = (i, holding) => {
      if (i !== LOLA || this.subs.busy || this.storyTime() - this.handLineAt < 80) return;
      this.handLineAt = this.storyTime();
      this.say(holding ? LINES.lolaHold : LINES.lolaSlow);
    };
    // Evacuees stop at the registration table; once Lito is there (part three), he logs each one.
    residents.onCheckIn = () => {
      if (this.act >= 3) this.lito.play('interact', 1.2);
    };
    // PAGASA's rainfall outlook for the next hours feeds the forecast (1 story minute = 6 real seconds).
    this.forecaster.outlook = (minutes) => storyAt(this.t + minutes * 6).rain;

    const hallInside = ground(HALL_INSIDE.x, HALL_INSIDE.z);
    const o = (
      id: ObjectiveId,
      act: number,
      text: () => string,
      target: () => THREE.Vector3 | null = () => null,
      label = '',
    ): Objective => ({ id, act, text, how: () => HOW[id], target, label, shown: false, done: false });
    const deskSpot = ground(OFFICE.x, OFFICE.z - 1);
    this.objectives = [
      o(
        'forecast',
        1,
        () => 'Check the Bantay Baha forecast on the laptop',
        () => deskSpot,
        'Laptop',
      ),
      o('advisory', 1, () => 'Send an early advisory from the dashboard'),
      o(
        'mats',
        1,
        () => 'Lay out the sleeping mats in the evacuation center',
        () => ground(MAT_STACK.x, MAT_STACK.z - 1),
        'Sleeping mats',
      ),
      o(
        'gauge',
        1,
        () => 'Check the sensor against the staff gauge at the creek',
        () => world.gauge.position,
        'Staff gauge',
      ),
      o(
        'siren',
        2,
        () => 'Sound the siren',
        () => world.sirenButton.position.clone().setY(walkHeight(world.sirenButton.position.x, world.sirenButton.position.z - 0.6)),
        'Siren switch',
      ),
      o(
        'toto',
        2,
        () => (this.totoSent ? 'Toto is running to the hall' : 'Find Toto, last seen watching the canal by the main road'),
        () => (this.totoSent ? null : residents.position(TOTO)),
        'Toto',
      ),
      o(
        'ben',
        2,
        () => "Convince Mang Ben's family across the creek to leave",
        () => residents.position(BEN),
        'Mang Ben',
      ),
      o(
        'lola',
        2,
        () =>
          this.escorting
            ? 'Lead Lola Cora to the hall. Stay close, she walks slowly'
            : 'Walk Lola Cora from her riverside house to the hall',
        () => (this.escorting ? hallInside : residents.position(LOLA)),
        'Lola Cora',
      ),
      o('all', 3, () => {
        const { inside, total } = residents.evacStats();
        return `Get everyone into the evacuation center (${inside}/${total})`;
      }),
      o(
        'return',
        3,
        () => 'Return to the evacuation center',
        () => hallInside,
        'Evacuation center',
      ),
      o(
        'report',
        3,
        () => 'Report the headcount to the MDRRMO with Kagawad Lito',
        () => this.litoPos,
        'Kagawad Lito',
      ),
    ];

    this.obj('lola').how = () =>
      this.escorting ? 'Walk to the hall at her pace; she follows you. Wait for her if she falls behind.' : HOW.lola;
    this.obj('toto').how = () => (this.totoSent ? 'He is on his way. Carry on with the others.' : HOW.toto);
    bus.on('status', ({ to }) => this.onStatus(to));
  }

  /** The forecast for the dashboard feed (phone and laptop), if there is one yet. */
  forecastSummary(): ForecastSummary | null {
    const f = this.forecaster.latest;
    return f ? { text: f.text, at30: f.path[1].level, at60: f.path[2].level } : null;
  }

  /** Things the captain can use with E. */
  interactables(): Interactable[] {
    const { world, player } = this;
    const { residents } = world;
    const nearestResident = (p: THREE.Vector3) => residents.nearest(p.x, p.z, 2.2, (j) => HOLDOUTS.includes(j));
    return [
      {
        object: 'Laptop',
        label: () => 'Open dashboard',
        anchor: () => this.desk.position.clone().add(new THREE.Vector3(0, 0.95, 0.1)),
        distance: (p) => flat(p, this.desk.position),
        range: 1.8,
        act: () => this.devices.show('laptop'),
      },
      {
        object: 'Kagawad Lito',
        label: () => (this.reporting ? null : this.obj('all').done && this.obj('return').done ? 'Report the headcount' : 'Talk'),
        anchor: () => this.litoPos.clone().setY(this.litoPos.y + 1.6),
        distance: (p) => flat(p, this.litoPos),
        range: 2,
        act: () => this.talkLito(),
      },
      {
        object: 'Sleeping mats',
        label: () => (this.obj('mats').done ? null : 'Lay them out'),
        anchor: () => this.mats.position.clone().setY(this.mats.position.y + 0.6),
        distance: (p) => flat(p, this.mats.position),
        range: 2,
        act: () => this.layMats(),
      },
      {
        object: 'Staff gauge',
        label: () => 'Read',
        anchor: () => world.gauge.position.clone().setY(world.levelY + 0.4),
        distance: (p) => flat(p, world.gauge.position),
        range: 3.5,
        act: () => this.readGauge(),
      },
      {
        object: 'Siren switch',
        label: () => (state.sirenManual ? 'Switch off' : 'Sound siren'),
        anchor: () => world.sirenButton.position,
        distance: (p) => flat(p, world.sirenButton.position),
        range: 2.5,
        act: () => (state.sirenManual = !state.sirenManual),
      },
      {
        object: 'Mang Ben',
        label: () => (residents.leaving(BEN) ? null : 'Talk'),
        anchor: () => residents.position(BEN).setY(residents.position(BEN).y + 1.55),
        distance: (p) => flat(p, residents.position(BEN)),
        range: 2.5,
        act: () => this.talkBen(),
      },
      {
        object: 'Lola Cora',
        label: () => (residents.leaving(LOLA) ? null : 'Talk'),
        anchor: () => residents.position(LOLA).setY(residents.position(LOLA).y + 1.4),
        distance: (p) => flat(p, residents.position(LOLA)),
        range: 2.5,
        act: () => this.talkLola(),
      },
      {
        object: 'Toto',
        label: () => (residents.leaving(TOTO) || this.act < 2 ? null : 'Talk'),
        anchor: () => residents.position(TOTO).setY(residents.position(TOTO).y + 1.1),
        distance: (p) => flat(p, residents.position(TOTO)),
        range: 2.5,
        act: () => this.talkToto(),
      },
      {
        object: 'Aling Nena',
        label: () => (this.nenaShown && !this.reunited ? 'Talk' : null),
        anchor: () => this.nenaPos.clone().setY(this.nenaPos.y + 1.55),
        distance: (p) => flat(p, this.nenaPos),
        range: 2.5,
        act: () => {
          this.nena.play('wave', 1.6);
          this.say(this.totoSent ? LINES.nenaFound : LINES.nenaWaiting);
        },
      },
      {
        object: 'Resident',
        label: () => 'Talk',
        anchor: () => {
          const at = residents.position(Math.max(0, nearestResident(player.pos)));
          return at.setY(at.y + 1.5);
        },
        distance: (p) => {
          const i = nearestResident(p);
          return i < 0 ? Infinity : flat(p, residents.position(i));
        },
        range: 2.2,
        act: () => {
          const i = nearestResident(player.pos);
          const line = residents.talk(i, player.pos.x, player.pos.z);
          const { gender, child } = residents.voiceOf(i);
          // Recorded in English for the three resident voices; other languages use browser speech.
          const speaker = child ? 'resident-child' : `resident-${gender}`;
          this.voice.speak(
            speaker,
            line,
            { gender, pitch: child ? 1.6 : gender === 'female' ? 1.1 : 0.9, rate: 1, variant: i },
            state.lang,
            () => undefined,
          );
        },
      },
    ];
  }

  // ---- Setup -------------------------------------------------------------------

  /** Dusk before the story starts: the scene the title screen sits on. */
  stage(): void {
    const { level, rain } = storyAt(0);
    Object.assign(state, { source: 'manual', stormPlaying: false, speed: 1, timeLocked: true, level, targetLevel: level, rainfall: rain });
    state.timeOfDay = STORY_START_HOUR / 24;
  }

  /**
   * The afternoon's sensor readings (every 5 story seconds), with the rise rate and
   * status the monitor would have computed. Fed to the monitor, the forecast and the
   * dashboard so the steady rise is already on the record when the captain arrives.
   */
  history(): Reading[] {
    const out: Reading[] = [];
    let status: Status = 'NORMAL';
    for (let t = -HISTORY_S; t < 0; t += 0.5) {
      const { level } = storyAt(t);
      const simT = state.simTime + t * 10;
      const rate = riseRate(out, simT, level);
      status = classifyStatus(level, rate, status);
      out.push({ t: simT, distance: SENSOR_HEIGHT - level, level, rate, status });
    }
    return out;
  }

  begin(afternoon: Reading[]): void {
    const { monitor } = this.world;
    monitor.history.splice(0, monitor.history.length, ...afternoon.slice(-130));
    this.forecaster.prime(afternoon.map((r): Sample => ({ t: r.t, level: r.level, rain: storyAt((r.t - state.simTime) / 10).rain })));
    // At the desk with the laptop behind you, looking out over the hall toward the door.
    this.player.enter(OFFICE.x, OFFICE.z - 1.1, Math.PI - 0.5);
    this.running = true;
    this.simStart = state.simTime;
    this.enterAct(0);
  }

  // ---- Flow --------------------------------------------------------------------

  private say(lines: Line[]): void {
    this.subs.play(lines);
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.t + seconds, fn });
  }

  private obj(id: ObjectiveId): Objective {
    return this.objectives.find((x) => x.id === id)!;
  }

  private reveal(...ids: ObjectiveId[]): void {
    for (const id of ids) this.obj(id).shown = true;
  }

  private complete(id: ObjectiveId): void {
    const o = this.obj(id);
    if (!o.done) this.onBeat?.('done');
    o.shown = true;
    o.done = true;
  }

  /** Start act n. A status that jumps two levels still hands out the skipped act's objectives. */
  private enterAct(n: number): void {
    this.act = n;
    const [kicker, title] = CHAPTERS[n];
    chapterCard(kicker, title);
    this.onBeat?.('chapter');
    this.reveal('forecast');
    if (n >= 1) this.reveal('advisory', 'mats', 'gauge');
    if (n >= 2) this.reveal('siren', 'toto', 'ben', 'lola');
    if (n >= 3) this.reveal('all', 'return', 'report');
    if (n === 0) this.say(LINES.intro);
    if (n === 1) this.say(LINES.advisory);
    if (n === 2) {
      this.say(this.sirenAt === null ? LINES.warning : LINES.warning.filter((l) => !l[1].startsWith('Sound the siren')));
      this.world.residents.placeAt(TOTO, TOTO_SPOT.x, TOTO_SPOT.z);
      this.after(14, () => this.say(LINES.totoMissing));
      // Toto's mother waits at the foot of the hall stairs, watching the road.
      this.nena.root.visible = true;
      this.nenaShown = true;
    }
    if (n === 3) {
      this.say(LINES.evacuate);
      // Lito moves to the registration table just inside the door.
      const spot = ground(HALL_INSIDE.x + 2.2, HALL_INSIDE.z - HALL_INSIDE.halfD + 0.4);
      this.litoPos.copy(spot);
      this.lito.pose(0, 0, spot.x, spot.y, spot.z, Math.PI);
    }
  }

  private onStatus(to: Status): void {
    if (!this.running) return;
    this.reached[to] ??= this.storyTime();
    const r = state.reading;
    const cm = ((r?.level ?? state.level) * 100).toFixed(0);
    const rate = `${(r?.rate ?? 0) >= 0 ? '+' : ''}${(r?.rate ?? 0).toFixed(0)}`;
    const body: Record<Status, string> = {
      NORMAL: `Creek at ${cm} cm. Back in the normal range.`,
      ADVISORY: `Creek at ${cm} cm, ${rate} cm per 10 min. Prepare for possible evacuation.`,
      WARNING: `Creek at ${cm} cm, over the bank. Preemptive evacuation recommended.`,
      EVACUATE: `Creek at ${cm} cm. The main road is flooding. Evacuate now.`,
    };
    this.devices.notify(to, `${to} · ${cm} cm`, body[to]);
    const n = STATUSES.indexOf(to);
    if (n > this.act && n <= 3) this.enterAct(n);
  }

  /** Called when the dashboard (phone or laptop) broadcasts an advisory. */
  onBroadcast(text: string, via: 'pa' | 'sms' = 'pa'): void {
    if (!this.running) return;
    const short = text.length > 140 ? `${text.slice(0, 137)}...` : text;
    if (via === 'sms') {
      this.say([['narrator', `SMS blast sent to 214 registered numbers in the barangay: "${short}"`]]);
    } else {
      this.world.audio.sirenBurst(1.2);
      this.say([['narrator', `Hall loudspeaker: "${short}"`]]);
    }
    if (this.advisoryAt !== null) return;
    this.advisoryAt = this.storyTime();
    // People heard it: households go in and pack their go-bags (the holdouts don't listen).
    this.world.residents.pack((i) => !HOLDOUTS.includes(i), 'home', 25);
    this.reveal('advisory', 'mats', 'gauge');
    this.complete('advisory');
    if (this.act < 2) this.say(LINES.advisorySent);
  }

  /** Phone or laptop dashboard opened: that's where the forecast is. */
  onDeviceOpen(): void {
    if (!this.running || this.obj('forecast').done) return;
    const f = this.forecaster.latest;
    if (!f) return this.say(LINES.forecastLate);
    this.complete('forecast');
    this.reveal('advisory');
    this.say(LINES.forecastSeen(f.text));
  }

  private talkLito(): void {
    if (this.obj('all').done && this.obj('return').done) {
      // The night ends once Lito has finished the call (see update).
      this.reporting = true;
      this.say(LINES.report);
      return;
    }
    this.say(LINES.litoHint);
  }

  private layMats(): void {
    this.mats.layOut();
    this.complete('mats');
    this.say(LINES.matsDone);
  }

  private readGauge(): void {
    // By eye you can resolve the 5 cm bars; compare with what the ESP32 reports.
    const eye = Math.round((state.level * 100) / 5) * 5;
    const sensor = Math.round((state.reading?.level ?? state.level) * 100);
    this.gaugeDiff = Math.abs(eye - sensor);
    this.say(LINES.gaugeOk(eye, sensor));
    this.complete('gauge');
  }

  private talkBen(): void {
    const { residents } = this.world;
    residents.face(BEN, this.player.pos.x, this.player.pos.z);
    if (this.act < 2) return this.say(LINES.benEarly);
    if (this.obj('ben').done) return this.say(LINES.benPacking);
    this.say(LINES.ben);
    this.complete('ben');
    // He goes back in for the family's bags, then they leave together.
    this.after(6, () => residents.pack((i) => i === BEN, 'evac', 0));
  }

  private talkLola(): void {
    const { residents } = this.world;
    residents.face(LOLA, this.player.pos.x, this.player.pos.z);
    if (this.act < 2) return this.say(LINES.lolaEarly);
    this.say(LINES.lola);
    this.escorting = true;
    // She picks up her little bag, then takes the captain's hand.
    residents.gesture(LOLA, 'interact', 1.8);
    residents.carry(LOLA, true);
    this.handLineAt = this.storyTime();
    // Start beside the captain as they stand facing her; it turns with the way they walk.
    this.world.camera.getWorldDirection(this.playerFwd).setY(0).normalize();
    this.after(1.8, () => residents.follow(LOLA, this.player.pos, this.playerFwd));
  }

  private talkToto(): void {
    const { residents } = this.world;
    residents.face(TOTO, this.player.pos.x, this.player.pos.z);
    residents.gesture(TOTO, 'wave', 1.5);
    this.say(LINES.toto);
    this.totoSent = true;
    this.after(7, () => residents.evacuate((i) => i === TOTO));
  }

  /**
   * Aling Nena waits at the foot of the hall stairs, turning to look down the evacuation lane.
   * When Toto runs up, they hug, she thanks the captain, and they go in together.
   */
  private updateNena(dt: number): void {
    if (!this.nenaShown) return;
    const { residents } = this.world;
    const toto = residents.position(TOTO);
    let speed = 0;
    let heading = Math.PI; // down the lane, toward the road
    if (!this.reunited && this.totoSent && flat(toto, this.nenaPos) < 2.4) {
      this.reunited = true;
      residents.pause(TOTO, 3.2);
      residents.gesture(TOTO, 'interact', 3.2);
      this.nena.play('interact', 3.2);
      this.complete('toto');
      this.say(LINES.totoSafe);
      this.after(3.2, () => {
        this.nenaRoute = [
          ground(HALL_STAIRS.x - 0.6, HALL_STAIRS.z0 + 0.2),
          ground(HALL_STAIRS.x - 0.6, HALL_STAIRS.z1 + 0.4),
          ground(HALL_DOOR.x - 0.6, HALL_DOOR.z + 0.6),
          ground(HALL_INSIDE.x - 3, HALL_INSIDE.z + 1),
        ];
      });
    }
    if (this.reunited && !this.nenaRoute.length && !residents.leaving(TOTO))
      heading = Math.atan2(toto.x - this.nenaPos.x, toto.z - this.nenaPos.z);
    else if (!this.reunited && flat(this.player.pos, this.nenaPos) < 6)
      heading = Math.atan2(this.player.pos.x - this.nenaPos.x, this.player.pos.z - this.nenaPos.z);
    else if (this.reunited) heading = Math.atan2(toto.x - this.nenaPos.x, toto.z - this.nenaPos.z);
    const next = this.nenaRoute[0];
    if (next) {
      const d = flat(next, this.nenaPos);
      if (d < 0.3) this.nenaRoute.shift();
      else {
        speed = 1.4;
        const k = Math.min(1, (speed * dt) / d);
        this.nenaPos.x += (next.x - this.nenaPos.x) * k;
        this.nenaPos.z += (next.z - this.nenaPos.z) * k;
        heading = Math.atan2(next.x - this.nenaPos.x, next.z - this.nenaPos.z);
      }
    }
    this.nenaPos.y = walkHeight(this.nenaPos.x, this.nenaPos.z);
    this.nena.pose(dt, speed, this.nenaPos.x, this.nenaPos.y, this.nenaPos.z, heading);
  }

  /** A forearm in the captain's reflective-vest sleeve, reaching right to hold Lola's hand. */
  private buildHandView(): void {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.34, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.8 }),
    );
    sleeve.rotation.z = Math.PI / 2 - 0.35;
    sleeve.position.set(0.12, 0, 0);
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x93613f, roughness: 0.7 }),
    );
    hand.position.set(0.3, -0.07, 0);
    const arm = new THREE.Group();
    arm.add(sleeve, hand);
    // Lower right of the view, a little forward of the camera.
    arm.position.set(0.2, -0.24, -0.55);
    arm.rotation.set(0, -0.6, -0.15);
    this.handView.add(arm);
    this.handView.visible = false;
  }

  /** Story seconds since the night began (0 on the title screen). */
  private storyTime(): number {
    return this.running || this.ended ? state.simTime - this.simStart : 0;
  }

  /** hh:mm on the story clock. */
  clock(): string {
    return this.hhmm(this.storyTime());
  }

  private hhmm(storySeconds: number): string {
    const s = STORY_START_HOUR * 3600 + storySeconds;
    return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
  }

  // ---- Frame -------------------------------------------------------------------

  update(dt: number, time: number): void {
    this.subs.update(dt);
    if (!this.running) return;
    // Caught up before the next alert level? Let the night run faster instead of making the player wait.
    const waiting =
      this.act < 3 && !this.reporting && !this.subs.busy && this.timers.length === 0 && this.objectives.every((o) => !o.shown || o.done);
    // Ease in over a couple of seconds; drop back quickly once there is something to do again.
    this.pace += ((waiting ? FAST_FORWARD : 1) - this.pace) * Math.min(1, dt * (waiting ? 1.5 : 6));
    if (!waiting && this.pace < 1.05) this.pace = 1;
    state.speed = this.pace;
    document.getElementById('obj-wait')!.hidden = !waiting;
    this.t += dt * this.pace;
    const { residents } = this.world;
    const { level, rain } = storyAt(this.t);
    state.targetLevel = level;
    state.rainfall = rain;
    state.timeOfDay = ((STORY_START_HOUR * 3600 + this.storyTime()) / 86400) % 1;
    this.devices.setClock(this.clock());
    this.peak = Math.max(this.peak, state.level);

    for (const timer of this.timers.filter((x) => x.at <= this.t)) {
      this.timers.splice(this.timers.indexOf(timer), 1);
      timer.fn();
    }
    this.watchForecast(this.forecaster.latest);

    // Name tags only when close enough to recognise someone (CSS labels would show through walls).
    const tag = (i: number, name: string) => residents.setTag(i, flat(this.player.pos, residents.position(i)) < 20 ? name : null);
    tag(LOLA, 'Lola Cora');
    tag(BEN, 'Mang Ben');
    if (this.act >= 2) tag(TOTO, 'Toto');

    // Kagawad Lito turns to face the captain when they come near (and keeps animating: he logs evacuees in part three).
    const litoFacing =
      flat(this.player.pos, this.litoPos) < 6
        ? Math.atan2(this.player.pos.x - this.litoPos.x, this.player.pos.z - this.litoPos.z)
        : this.act >= 3
          ? -Math.PI / 2
          : Math.PI;
    this.lito.pose(dt, 0, this.litoPos.x, this.litoPos.y, this.litoPos.z, litoFacing);

    // The way the captain is walking (not looking), so Lola stays put at their side when they turn to look at her.
    const cam = this.world.camera;
    const step = new THREE.Vector3(this.player.pos.x - this.lastPlayerPos.x, 0, this.player.pos.z - this.lastPlayerPos.z);
    if (step.length() > 0.02 && step.length() < 2) this.playerFwd.lerp(step.normalize(), 0.25).normalize();
    this.lastPlayerPos.copy(this.player.pos);
    this.handView.visible = residents.holdingHand(LOLA);
    if (this.handView.visible) {
      this.handView.position.copy(cam.position);
      this.handView.quaternion.copy(cam.quaternion);
    }

    this.updateNena(dt);
    // Mang Ben comes back out with the family's bags.
    if (!this.benReadySaid && this.obj('ben').done && residents.leaving(BEN) && flat(this.player.pos, residents.position(BEN)) < 25) {
      this.benReadySaid = true;
      this.say(LINES.benReady);
    }

    // The siren, from the hall switch or either dashboard, sends everyone but the holdouts.
    if (state.sirenManual && this.sirenAt === null) {
      this.sirenAt = this.storyTime();
      this.complete('siren');
      residents.evacuate((i) => !HOLDOUTS.includes(i));
      if (this.act >= 2) this.say(LINES.sirenOn);
    }
    // No siren well into the EVACUATE order: people go by themselves, late.
    const evacAt = this.reached.EVACUATE;
    if (!this.selfEvac && this.sirenAt === null && evacAt !== undefined && this.storyTime() - evacAt > 200) {
      this.selfEvac = true;
      residents.evacuate((i) => !HOLDOUTS.includes(i));
      this.say(LINES.lateSelfEvac);
    }

    for (let i = 0; i < residents.count; i++) if (this.leftAt[i] === null && residents.leaving(i)) this.leftAt[i] = this.storyTime();
    if (this.escorting && residents.sheltered(LOLA)) {
      this.escorting = false;
      this.complete('lola');
      this.say(LINES.lolaSafe);
    }
    // Fallback if Toto somehow reaches the hall without passing his mother.
    if (this.totoSent && !this.obj('toto').done && residents.sheltered(TOTO)) {
      this.complete('toto');
      if (!this.reunited) this.say(LINES.totoSafe);
    }
    const { inside, total } = residents.evacStats();
    if (inside === total) {
      this.complete('all');
      if (!this.allInSaid) {
        this.allInSaid = true;
        this.say(LINES.allIn);
      }
    }
    const inHall = Math.abs(this.player.pos.x - HALL.x) < HALL.w / 2 - 0.3 && Math.abs(this.player.pos.z - HALL.z) < HALL.d / 2 - 0.3;
    // Back inside once everyone else is: being in the hall earlier (before going out for someone) doesn't count.
    if (inHall && this.act >= 3 && this.obj('all').done) this.complete('return');

    this.checkCurrent(dt);
    this.renderObjectives();
    const focus = this.objectives.find((o) => o.shown && !o.done && o.target() !== null);
    this.beacon.update(focus?.target() ?? null, focus?.label ?? '', this.player.pos, time);

    if (this.reporting && !this.subs.busy) {
      this.complete('report');
      this.finish();
    } else if (this.t >= STORY_END_S && !this.reporting) this.finish();
  }

  /** The first time the forecast expects WARNING (then EVACUATE) within the hour: tell the captain. */
  private watchForecast(f: Forecast | null): void {
    if (!f) return;
    for (const level of ['WARNING', 'EVACUATE'] as const) {
      if (this.forecastAt[level] !== undefined || this.reached[level] !== undefined || !f.status.includes(level)) continue;
      this.forecastAt[level] = this.storyTime();
      const minutes = f.eta?.status === level ? Math.max(5, Math.round(f.eta.minutes / 5) * 5) : 60;
      this.devices.notify(level, `Forecast · ${level} expected`, f.text);
      if (level === 'WARNING' && this.obj('forecast').done) this.say(LINES.forecastWarns(minutes));
    }
  }

  /** Swimming too long in fast floodwater: the tanods fish you out at the hall stairs. */
  private checkCurrent(dt: number): void {
    this.swim = this.player.swimming && state.level > THRESHOLDS.warning ? this.swim + dt : 0;
    if (this.swim < SWEPT_AFTER) return;
    this.swim = -10;
    this.rescues++;
    fadeThrough(() => {
      this.player.enter(HALL_STAIRS.x + 2.5, HALL_STAIRS.z0 - 1.5, 0);
      this.say(LINES.rescued);
    });
  }

  private renderObjectives(): void {
    const current = this.objectives.find((o) => o.shown && !o.done);
    // Finished tasks from earlier parts fold into one line, so the list stays short.
    const earlier = this.objectives.filter((o) => o.shown && o.done && o.act < this.act).length;
    const items: ObjectiveView[] = this.objectives
      .filter((o) => o.shown && !(o.done && o.act < this.act))
      .map((o) => ({ text: o.text(), done: o.done, late: !o.done && this.act > o.act, how: o === current ? o.how() : undefined }));
    if (earlier)
      items.unshift({ text: `${earlier} earlier ${earlier === 1 ? 'task' : 'tasks'} done`, done: true, late: false, summary: true });
    // Point at the right buttons on the phone and laptop dashboards.
    this.devices.coach(current?.id === 'advisory' ? ['d-broadcast', 'd-copy'] : current?.id === 'siren' ? ['d-siren'] : []);
    const key = JSON.stringify(items) + this.act;
    if (key === this.lastObjectives) return;
    this.lastObjectives = key;
    const [kicker, title] = CHAPTERS[this.act];
    renderObjectives(kicker, title, items);
  }

  // ---- Ending ------------------------------------------------------------------

  private finish(): void {
    if (this.ended) return;
    this.running = false;
    this.ended = true;
    const report = this.report();
    fadeThrough(() => {
      this.act = 4;
      const [kicker, title] = CHAPTERS[4];
      chapterCard(kicker, title, 5);
      Object.assign(state, { rainfall: 0, targetLevel: 2.3, timeOfDay: 0.27, sirenManual: false });
      this.beacon.update(null, '', this.player.pos, 0);
      this.player.standAt(HALL_STAIRS.x - 1.5, HALL_STAIRS.z0 - 1, Math.PI);
      this.devices.close();
      this.devices.enabled = false;
      document.body.classList.remove('playing');
      setTimeout(() => showReport(report.verdict, report.summary, report.rows), 4500);
    }, 1500);
  }

  private report(): { verdict: string; summary: string; rows: ReportRow[] } {
    const { residents } = this.world;
    const { inside, total } = residents.evacStats();
    const evacAt = this.reached.EVACUATE ?? Infinity;
    const warnAt = this.reached.WARNING ?? Infinity;
    const early = this.leftAt.filter((at) => at !== null && at < evacAt).length;
    const when = (s: number) => this.hhmm(s);
    const lead = this.forecastAt.WARNING !== undefined && warnAt < Infinity ? Math.round((warnAt - this.forecastAt.WARNING) / 60) : null;
    const lolaSafe = residents.sheltered(LOLA);
    const benSafe = residents.sheltered(BEN);
    const totoSafe = residents.sheltered(TOTO);
    const rows: ReportRow[] = [
      { label: 'Residents in the evacuation center', value: `${inside} of ${total}`, good: inside === total },
      { label: 'Left before the EVACUATE order', value: `${early} of ${total}`, good: early >= total - 3 },
      {
        label: 'How far ahead the forecast saw WARNING coming',
        value: warnAt === Infinity ? 'The creek never reached WARNING' : lead === null ? 'It did not see it coming' : `${lead} min ahead`,
        good: lead !== null && lead >= 10,
      },
      {
        label: 'Advisory sent',
        value:
          this.advisoryAt === null
            ? 'Not sent'
            : `${when(this.advisoryAt)}${this.advisoryAt < warnAt ? ', before the WARNING' : ', after the WARNING'}`,
        good: this.advisoryAt !== null && this.advisoryAt < warnAt,
      },
      {
        label: 'Evacuation center prepared',
        value: this.obj('mats').done ? 'Mats laid out' : 'Families slept on the bare floor',
        good: this.obj('mats').done,
      },
      {
        label: 'Siren sounded',
        value:
          this.sirenAt === null
            ? 'Never'
            : `${when(this.sirenAt)}${this.sirenAt < evacAt ? ', before the EVACUATE order' : ', after the EVACUATE order'}`,
        good: this.sirenAt !== null && this.sirenAt < evacAt,
      },
      {
        label: 'Sensor checked against the gauge',
        value: this.gaugeDiff === null ? 'No' : `Yes, ${this.gaugeDiff} cm apart`,
        good: this.gaugeDiff !== null,
      },
      { label: 'Toto', value: totoSafe ? 'Back with Aling Nena' : 'Found by tanods at the canal after midnight', good: totoSafe },
      {
        label: 'Lola Cora',
        value: lolaSafe ? 'Walked to the hall with you' : 'Spent the night in her attic; brought out by boat at dawn',
        good: lolaSafe,
      },
      { label: "Mang Ben's family", value: benSafe ? 'Evacuated' : 'Waited on their roof until morning', good: benSafe },
      { label: 'Headcount reported to the MDRRMO', value: this.obj('report').done ? 'Yes' : 'No', good: this.obj('report').done },
      { label: 'Residents who came with a go-bag', value: `${residents.bagCount()} of ${total}`, good: residents.bagCount() >= total - 3 },
      { label: 'Times pulled from the water', value: String(this.rescues), good: this.rescues === 0 },
      { label: 'Highest water at the sensor', value: `${Math.round(this.peak * 100)} cm`, good: true },
    ];
    const clean = rows.every((r) => r.good);
    const stranded = total - inside;
    if (clean)
      return {
        verdict: 'Everyone slept dry',
        summary: 'The forecast gave you a head start and you used all of it. The municipal DRRM office has asked how your barangay did it.',
        rows,
      };
    if (stranded === 0)
      return {
        verdict: 'Everyone safe',
        summary:
          'Nobody was left behind, though parts of the night were closer than they needed to be. The forecast gave you time; next storm, use all of it.',
        rows,
      };
    return {
      verdict: `${stranded} ${stranded === 1 ? 'resident' : 'residents'} stranded`,
      summary:
        'The sensor and the forecast gave their warnings in time. Not everyone heard them in time. Rescue boats reached the last houses at first light.',
      rows,
    };
  }
}
