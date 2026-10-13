/** Bantay Baha simulator: the 3D barangay with a free camera, live HUD and control panel. */
import './theme.css';
import './style.css';
import * as THREE from 'three';
import { AlertService } from './alerts/alertService';
import { ROAD_Z } from './config';
import { Hud, toast } from './hud/hud';
import { Panel } from './hud/panel';
import { TelemetryView } from './hud/telemetry';
import { initWelcome } from './hud/welcome';
import { listenKonami } from './konami';
import { SimBridge } from './net/simBridge';
import { installPlus } from './plus';
import { CameraRig } from './scene/cameraRig';
import { BRIDGE } from './scene/infrastructure';
import { loadPeople } from './scene/person';
import { baseHeight } from './scene/terrain';
import { Inspector } from './sensor/inspector';
import { RemoteSensor } from './sensor/remote';
import { World } from './world';

await loadPeople();
const world = new World(document.getElementById('app')!, document.getElementById('labels') as HTMLDivElement);
const { camera, renderer, pole, audio, esp32 } = world;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sensorTarget = pole.enclosureCenter.clone().add(v(0, 0.1, 0));
const rig = new CameraRig(camera, renderer.domElement, {
  overview: { pos: v(-58, 42, -62), target: v(0, 0, 18) },
  sensor: { pos: sensorTarget.clone().add(v(1.0, 0.7, -4.2)), target: sensorTarget },
  street: { pos: v(-14, baseHeight(-14, ROAD_Z + 1.5) + 1.7, ROAD_Z + 1.5), target: v(20, 1.5, 12) },
  bridge: { pos: v(6, 4.5, BRIDGE.zc - 13), target: v(16.5, -0.5, BRIDGE.zc) },
});

const hud = new Hud(world.monitor.history);
const alerts = new AlertService(
  (m) => hud.showAlert(m),
  () => {
    audio.sirenBurst(2.5);
    hud.scold();
  },
);
const remote = new RemoteSensor((text, ok) => Panel.remoteStatus(text, ok));
const panel = new Panel({ audio, alerts, remote, rig });
const telemetry = new TelemetryView(esp32);
const inspector = new Inspector(camera, renderer.domElement, [pole.group, world.packets.group, world.gauge.group], world.scene, esp32, rig);
const bridge = new SimBridge(esp32, {
  evacStats: () => world.residents.evacStats(),
  broadcast: (text) => {
    hud.broadcast(text);
    audio.sirenBurst(1.5);
  },
});
world.onPacket = (r) => bridge.publish(r);
const plusUpdate = installPlus({ hud, world });

initWelcome(rig);
listenKonami(() => {
  world.ducks.launch();
  for (let i = 0; i < 6; i++) audio.quack(i * 0.22);
  toast('Rubber duck armada deployed.');
});

world.start((dt) => {
  telemetry.update(dt);
  inspector.update(dt);
  hud.update(dt);
  panel.update();
  rig.update(dt);
  plusUpdate(dt);
});
