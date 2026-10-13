/** Bantay Baha story game: one flood night as the barangay captain. */
import '../theme.css';
import './game.css';
import { HALL } from '../config';
import { SimBridge } from '../net/simBridge';
import { Interactions } from '../player/interactions';
import { Player } from '../player/player';
import { loadPeople } from '../scene/person';
import { type Lang, state } from '../state';
import { World } from '../world';
import { Devices } from './devices';
import { STORY_START_HOUR } from './script';
import { PauseMenu } from './pause';
import { Sfx } from './sfx';
import { SoundSettings } from './sound';
import { Story } from './story';
import { Voice } from './voice';

const CHANNEL = 'bantay-baha-story';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

await loadPeople();
const world = new World($('app'), $<HTMLDivElement>('labels'));
const { camera, residents } = world;
// Hard hat and reflective vest: the captain on duty during a storm.
const player = new Player(camera, world.renderer.domElement, { model: 'worker', skin: 0x93613f, hair: 0x15110f });
world.scene.add(player.rig.root);
const devices = new Devices(CHANNEL, () => state.lang);
const voice = new Voice();
const story = new Story(world, player, devices, voice);
const sfx = new Sfx();
const sound = new SoundSettings(world.audio, sfx, voice);
story.onBeat = (beat) => (beat === 'done' ? sfx.chime() : sfx.chapter());
devices.onNotify = () => sfx.notify();
const interactions = new Interactions(player, story.interactables(), camera);
interactions.onUse = () => sfx.use();
devices.onOpen = () => story.onDeviceOpen();
// The mouse belongs to the phone or laptop while one is up, and to looking around again after.
devices.onToggle = (open) => {
  sfx.phone(open);
  player.lookEnabled = !open;
  if (open) player.release();
  else player.lock();
};
story.stage();

let bridge: SimBridge | null = null;
world.onPacket = (r) => bridge?.publish(r);

$('t-start').addEventListener('click', () => {
  state.lang = $<HTMLSelectElement>('t-lang').value as Lang;
  sound.start();
  // Dashboard timestamps follow the story clock: 18:20 today at the moment the night begins.
  const start = new Date();
  start.setHours(Math.floor(STORY_START_HOUR), Math.round((STORY_START_HOUR % 1) * 60), 0, 0);
  bridge = new SimBridge(
    world.esp32,
    { evacStats: () => residents.evacStats(), broadcast: (text) => story.onBroadcast(text), forecast: () => story.forecastSummary() },
    CHANNEL,
    start.getTime() - state.simTime * 1000,
  );
  // The creek has been rising all afternoon: give the dashboard, monitor and forecast that history.
  const afternoon = story.history();
  bridge.seed(afternoon);
  $('title').hidden = true;
  document.body.classList.add('playing');
  devices.enabled = true;
  story.begin(afternoon);
  // This click is the gesture the browser needs: capture the mouse straight away.
  player.lock();
});
$('rp-again').addEventListener('click', () => location.reload());
// Characters and world are built; the night can start.
$<HTMLButtonElement>('t-start').disabled = false;
$('t-start').textContent = 'Begin';

// Slow aerial orbit behind the title screen, and around the hall at dawn.
let orbit = 0;
function orbitCamera(dt: number): void {
  orbit += dt * 0.035;
  const around = story.ended ? { x: HALL.x, z: HALL.z - 8, r: 34, y: 16 } : { x: -10, z: 25, r: 85, y: 38 };
  camera.position.set(around.x + Math.sin(orbit) * around.r, around.y, around.z + Math.cos(orbit) * around.r);
  camera.lookAt(around.x, 0, around.z);
}

const menu = new PauseMenu(
  () => story.running && !devices.open,
  () => {
    player.lookEnabled = false;
    player.release();
  },
  () => {
    player.lookEnabled = true;
    player.lock();
  },
);

/** For the click of the siren switch, whoever flips it (the hall switch or a dashboard). */
let sirenWas = state.sirenManual;

world.start((dt, t) => {
  // Paused: the water and the clock stand still (speed 0) and so do the story and the captain.
  if (!menu.paused) {
    story.update(dt, t);
    player.update(dt, world.levelY);
  }
  interactions.update();
  if (!player.active) orbitCamera(dt);
  if (player.active && !menu.paused) sfx.update(dt, player, world.levelY, world.indoors);
  world.audio.setMuffled(player.active && world.indoors);
  if (state.sirenManual !== sirenWas) {
    sirenWas = state.sirenManual;
    sfx.clunk();
  }
  $('clock-label').textContent = story.clock();
});
