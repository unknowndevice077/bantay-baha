/** Bantay Baha — bootstraps the renderer, builds the barangay and runs the frame loop. */
import './style.css';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { AlertService } from './alerts/alertService';
import { AudioEngine } from './alerts/audio';
import { HALL, ROAD_Z, levelToY } from './config';
import { DebrisField } from './debris/debris';
import { DuckArmada } from './debris/ducks';
import { Hud, toast } from './hud/hud';
import { Panel } from './hud/panel';
import { TelemetryView } from './hud/telemetry';
import { listenKonami } from './konami';
import { CameraRig } from './scene/cameraRig';
import { BRIDGE, createInfrastructure } from './scene/infrastructure';
import { HALL_PLAN } from './scene/layout';
import { Rain } from './scene/rain';
import { Residents } from './scene/residents';
import { Sky } from './scene/sky';
import { baseHeight, createTerrain } from './scene/terrain';
import { createVillage } from './scene/village';
import { Esp32Node } from './sensor/esp32';
import { Inspector } from './sensor/inspector';
import { Monitor } from './sensor/monitor';
import { PacketFlow } from './sensor/packets';
import { SmartPole } from './sensor/pole';
import { RemoteSensor } from './sensor/remote';
import { updateSim } from './sim';
import { bus, state } from './state';
import { clamp, smoothstep } from './util';
import { Water } from './water/water';

const mobile = window.innerWidth < 768;
const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') as HTMLDivElement });
labelRenderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1500);

// --- World -------------------------------------------------------------------
const terrain = createTerrain();
const village = createVillage();
const sky = new Sky(scene, mobile ? 1024 : 2048);
const water = new Water(terrain.heightTexture);
const rain = new Rain();
const pole = new SmartPole();
pole.addBeacon(new THREE.Vector3(HALL.x - 4, HALL_PLAN.floorY + HALL_PLAN.h + HALL_PLAN.roofH + 0.05, HALL.z));
const monitor = new Monitor();
const packets = new PacketFlow(pole.antennaTip, monitor.history);
const debris = new DebrisField();
const ducks = new DuckArmada();
const residents = new Residents();
scene.add(terrain.mesh, createInfrastructure(), village.group, water.mesh, rain.mesh, pole.group, packets.group, debris.group, ducks.group, residents.group);

// --- Camera ------------------------------------------------------------------
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sensorTarget = pole.enclosureCenter.clone().add(v(0, 0.1, 0));
const rig = new CameraRig(camera, renderer.domElement, {
  overview: { pos: v(-58, 42, -62), target: v(0, 0, 18) },
  sensor: { pos: sensorTarget.clone().add(v(1.0, 0.7, -4.2)), target: sensorTarget },
  street: { pos: v(-14, baseHeight(-14, ROAD_Z + 1.5) + 1.7, ROAD_Z + 1.5), target: v(20, 1.5, 12) },
  bridge: { pos: v(6, 4.5, BRIDGE.zc - 13), target: v(16.5, -0.5, BRIDGE.zc) },
});

// --- Systems -----------------------------------------------------------------
const audio = new AudioEngine();
const hud = new Hud(monitor.history);
const alerts = new AlertService(
  (m) => hud.showAlert(m),
  () => {
    audio.sirenBurst(2.5);
    hud.scold();
  },
);
const remote = new RemoteSensor((text, ok) => Panel.remoteStatus(text, ok));
const panel = new Panel({ audio, alerts, remote, rig });
const esp32 = new Esp32Node();
const telemetry = new TelemetryView(esp32);
const inspector = new Inspector(camera, renderer.domElement, [pole.group, packets.group], scene, esp32, rig);
bus.on('reading', (r) => esp32.sense(r));
toast('Tip: click the box on the sensor pole to open it and explore the parts.');

bus.on('lightning', ({ distance }) => audio.thunder(distance / 340));
listenKonami(() => {
  ducks.launch();
  for (let i = 0; i < 6; i++) audio.quack(i * 0.22);
  toast('🦆 Rubber Duck Armada deployed! Quack quack.');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Frame loop --------------------------------------------------------------
const clock = new THREE.Clock();
let packetTimer = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const dtSim = updateSim(dt);
  monitor.update(dtSim);
  const levelY = levelToY(state.level);
  const rainNorm = state.rainfall / 100;

  sky.update(dt, state.rainfall, camera);
  village.update(sky.night);
  const mud = clamp(smoothstep(1.2, 3.2, state.level) * 0.8 + rainNorm * 0.4, 0, 1);
  water.update(dt, levelY, mud, 0.8 + rainNorm * 1.6, sky);
  rain.update(dt, state.rainfall, state.toggles.rain, camera, sky.light);
  debris.update(dt, state.level, levelY, state.rainfall, state.toggles.debris, water.time, water.chop);
  ducks.update(dt, levelY, water.time, water.chop);
  residents.update(dt, levelY, state.status);
  pole.update(dt, t, levelY, state.status, state.toggles.xray);

  packetTimer -= dt;
  if (state.reading && packetTimer <= 0) {
    esp32.publish(state.reading);
    packets.emit(state.reading);
    packetTimer = 1;
  }
  packets.update(dt, state.toggles.xray);
  esp32.update(dt, dtSim, 1 - sky.night);
  telemetry.update(dt);
  inspector.update(dt);

  audio.update(state.rainfall, state.status === 'EVACUATE');
  hud.update(dt);
  panel.update();
  rig.update(dt);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
