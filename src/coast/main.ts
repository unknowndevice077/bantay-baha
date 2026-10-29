/**
 * Coastal mode: a seaside barangay, a pier-mounted sea-level station, and a typhoon coming in.
 * Its own map, with the creek simulator's look and controls (HUD, panel, camera bar, free camera).
 */
import '../theme.css';
import '../style.css';
import './coast.css';
import * as THREE from 'three';
import { STATUS_COLORS, WORLD_SIZE } from '../config';
import { CameraRig, type Preset } from '../scene/cameraRig';
import { gableRoof, palmCrown } from '../scene/geo';
import { loadPeople, MODELS, PersonRig } from '../scene/person';
import { Rain } from '../scene/rain';
import { Sky } from '../scene/sky';
import { barkSurface, corrugatedSurface, groundSurface, palmLeafTexture, plasterSurface, thatchSurface } from '../scene/textures';
import { type Lang, type Status, state } from '../state';
import { Water } from '../water/water';
import { COAST, coastStatus, filtered, forecast, HOUR, nextHighTide, surgeShape, tide, type Storm } from './model';
import { coastAdvisory } from './templates';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

await loadPeople();

// ---- world shape (x along the shore, sea at -z, land and the hill at +z, y = metres above MSL)
const WALL_Z = 9;
const HOUSE_ROWS = [18, 27];
const HILL = { z: 82, y: 9 };

function landY(z: number): number {
  if (z < -15) return -5;
  if (z < WALL_Z - 1) return -5 + ((z + 15) / (WALL_Z + 14)) * 5.6;
  if (z < 44) return 1.0;
  if (z < 70) return 1.0 + ((z - 44) / 26) ** 1.4 * (HILL.y - 1);
  return HILL.y;
}
const groundAt = (x: number, z: number) => landY(z) + (z > 44 ? Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.8 : 0);

// ---- renderer and scene, set up like the creek's
const app = $('app');
const mobile = innerWidth < 768;
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1500);
const sky = new Sky(scene, renderer, mobile ? 1024 : 2048);
state.timeLocked = true;
const rain = new Rain();
scene.add(rain.mesh);

const mat = (color: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
};

// ---- ground: sea floor, beach, the flat behind the wall, the hill
{
  const g = new THREE.PlaneGeometry(240, 240, 120, 120);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 40);
  const pos = g.attributes.position;
  const colors: number[] = [];
  const sand = new THREE.Color(0xd8c39a);
  const grass = new THREE.Color(0x5f8a3e);
  const deep = new THREE.Color(0x6b6250);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setY(i, groundAt(pos.getX(i), z));
    const c = z < -6 ? deep : z < WALL_Z ? sand : grass;
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const soil = groundSurface();
  const ground = new THREE.Mesh(
    g,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: soil.map, normalMap: soil.normalMap, roughness: 0.95 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
}

// seawall and a coastal road behind it
box(240, COAST.seawall + 1, 1.6, mat(0x9a9890), 0, (COAST.seawall - 1) / 2, WALL_Z);
box(240, 0.1, 5, mat(0x3c3f44), 0, 1.06, 13);

// ---- houses on short stilts (floor at COAST.homes), with the creek's plaster, thatch and tin
const plaster = plasterSurface();
const thatch = thatchSurface();
const tin = corrugatedSurface();
const bark = barkSurface();
const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, map: bark.map, roughness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: 0x2a3640, roughness: 0.3 });
const walls = [0xe4d8bf, 0xbfd6c9, 0xe8c9a0, 0xd0c2dd].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, map: plaster.map, normalMap: plaster.normalMap, roughness: 0.9 }),
);
const roofs = [
  new THREE.MeshStandardMaterial({ color: 0xb59a6a, map: thatch.map, normalMap: thatch.normalMap, roughness: 1 }),
  new THREE.MeshStandardMaterial({ color: 0x9aa3a8, map: tin.map, normalMap: tin.normalMap, roughness: 0.5, metalness: 0.4 }),
];
const roofGeo = gableRoof();
const homes: THREE.Vector3[] = [];
for (const z of HOUSE_ROWS)
  for (let x = -66; x <= 66; x += 14) {
    if (Math.abs(x + 30) < 6 && z === HOUSE_ROWS[0]) continue; // leave room for the pier path
    const hx = x + (z === HOUSE_ROWS[1] ? 7 : 0);
    const k = Math.abs(Math.round(hx / 7));
    const floor = COAST.homes;
    for (const [dx, dz] of [
      [-2.3, -1.8],
      [2.3, -1.8],
      [-2.3, 1.8],
      [2.3, 1.8],
    ])
      box(0.25, floor - 1, 0.25, wood, hx + dx, (floor + 1) / 2, z + dz);
    box(5.4, 0.2, 4.4, wood, hx, floor, z);
    box(5, 2.4, 4, walls[k % 4], hx, floor + 1.3, z);
    box(1, 1.9, 0.08, wood, hx, floor + 1.05, z - 2.02); // door
    box(1.2, 0.8, 0.06, glass, hx - 1.6, floor + 1.6, z - 2.02);
    const roof = new THREE.Mesh(roofGeo, roofs[k % 2]);
    roof.scale.set(6, 1.6, 5.2);
    roof.position.set(hx, floor + 2.5, z);
    roof.castShadow = roof.receiveShadow = true;
    scene.add(roof);
    homes.push(new THREE.Vector3(hx, floor, z));
  }

// ---- coconut palms (the creek's crowns and bark) that lean with the wind
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7458, map: bark.map, normalMap: bark.normalMap, roughness: 0.9 });
const crownMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  map: palmLeafTexture(),
  alphaTest: 0.45,
  side: THREE.DoubleSide,
  roughness: 0.7,
});
const crownGeo = palmCrown();
const palms: THREE.Group[] = [];
for (const [x, z, h] of [
  [-58, 5, 8],
  [-50, 6, 9],
  [-12, 5, 7.5],
  [-4, 6.5, 9.5],
  [10, 6, 8],
  [38, 5, 9],
  [46, 6.2, 7.5],
  [58, 7, 8.5],
  [-40, 36, 9],
  [22, 38, 8],
  [50, 34, 10],
  [-60, 40, 8],
]) {
  const p = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 10), trunkMat);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.y = h;
  crown.rotation.y = x;
  crown.castShadow = true;
  p.add(trunk, crown);
  p.position.set(x, landY(z) - 0.2, z);
  scene.add(p);
  palms.push(p);
}

// ---- pier with the sensor at the end
const PIER = { x: -30, from: WALL_Z, to: -26, y: COAST.homes + 0.6 };
box(3, 0.25, PIER.from - PIER.to, wood, PIER.x, PIER.y, (PIER.from + PIER.to) / 2);
for (let z = PIER.to + 1; z < PIER.from; z += 4) {
  box(0.3, PIER.y + 5, 0.3, wood, PIER.x - 1.3, (PIER.y - 5) / 2, z);
  box(0.3, PIER.y + 5, 0.3, wood, PIER.x + 1.3, (PIER.y - 5) / 2, z);
}
const poleY = PIER.y + 3;
box(0.18, 3.2, 0.18, mat(0xb0b6bd, 0.4), PIER.x, PIER.y + 1.6, PIER.to + 0.6);
box(0.12, 0.12, 2.2, mat(0xb0b6bd, 0.4), PIER.x, poleY, PIER.to - 0.4);
box(0.6, 0.5, 0.6, mat(0xe9eef3, 0.5), PIER.x, poleY - 0.2, PIER.to - 1.4);
box(0.8, 0.05, 0.6, mat(0x1d3d6b, 0.3), PIER.x, poleY + 0.4, PIER.to + 0.6); // solar panel
// stilling well: a pipe down into the water that calms the waves inside it
const well = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 10), mat(0xdfe4ea, 0.5));
well.position.set(PIER.x, poleY - 4.8, PIER.to - 1.4);
scene.add(well);
const led = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: STATUS_COLORS.NORMAL }));
led.position.set(PIER.x + 0.35, poleY - 0.1, PIER.to - 1.1);
scene.add(led);

// ---- school on the hill (evacuation center) and the path up
box(16, 4, 7, walls[0], 0, HILL.y + 2, HILL.z);
box(16.6, 0.4, 7.6, mat(0x8f3b2e), 0, HILL.y + 4.2, HILL.z);
box(0.12, 6, 0.12, mat(0xdddddd), 10, HILL.y + 3, HILL.z - 4);
box(1.4, 0.8, 0.05, mat(0x2f54d8), 10.7, HILL.y + 5.6, HILL.z - 4);
const pathPts: THREE.Vector3[] = [];
for (let z = 13; z <= HILL.z - 4; z += 1.5) {
  const x = Math.sin(z * 0.05) * 6 - 4;
  pathPts.push(new THREE.Vector3(x, groundAt(x, z) + 0.05, z));
  if (z > 30) box(1.6, 0.06, 1.4, mat(0xb39b78), x, groundAt(x, z) + 0.04, z);
}

// ---- residents (the creek's animated people) who walk up the hill once the call is made
const SKINS = [0x8d5a3b, 0xa86f4c, 0xc58c63, 0x6e4630];
const people = homes.slice(0, 14).map((h, i) => {
  const rig = new PersonRig({ model: MODELS[i % MODELS.length], skin: SKINS[i % 4], hair: 0x1b1714, scale: i % 5 === 4 ? 0.7 : 1 });
  scene.add(rig.root);
  const home = h
    .clone()
    .setY(1.0)
    .add(new THREE.Vector3(0, 0, -3.5));
  return { rig, home, delay: i * 0.035, progress: 0, last: home.clone() };
});

// ---- water: the creek's water shader. It reads the ground height to fade out at the shore.
const HEIGHT_RES = 256;
const heights = new Uint16Array(HEIGHT_RES * HEIGHT_RES);
for (let j = 0; j < HEIGHT_RES; j++)
  for (let i = 0; i < HEIGHT_RES; i++) {
    const z = ((j + 0.5) / HEIGHT_RES - 0.5) * WORLD_SIZE;
    heights[j * HEIGHT_RES + i] = THREE.DataUtils.toHalfFloat(landY(z));
  }
const heightTexture = new THREE.DataTexture(heights, HEIGHT_RES, HEIGHT_RES, THREE.RedFormat, THREE.HalfFloatType);
heightTexture.magFilter = heightTexture.minFilter = THREE.LinearFilter;
heightTexture.needsUpdate = true;
// one plane for the sea (it stops at the wall) and one for the water that comes over it
const sea = new Water(heightTexture);
sea.mesh.scale.set(1.4, 1, (WALL_Z + 100) / WORLD_SIZE);
sea.mesh.position.z = (WALL_Z - 100) / 2;
scene.add(sea.mesh);
const inland = new Water(heightTexture);
inland.mesh.scale.set(1.4, 1, 36 / WORLD_SIZE);
inland.mesh.position.z = WALL_Z + 18;
inland.mesh.visible = false;
scene.add(inland.mesh);
let inlandY = -10;

// ---- the creek's free camera (drag to look, WASD), on this map's ground
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const rig = new CameraRig(
  camera,
  renderer.domElement,
  {
    overview: { pos: v(-70, 45, -75), target: v(0, 2, 20) },
    sensor: { pos: v(-25, PIER.y + 3, PIER.to - 7), target: v(PIER.x, poleY - 0.5, PIER.to - 1.4) },
    street: { pos: v(42, 14, -22), target: v(-5, 1, 20) },
    bridge: { pos: v(-34, 24, 112), target: v(-4, 2, 30) },
  },
  {
    ground: groundAt,
    // out at sea → along the shore → over the pier → between the houses → up to the school
    fly: [
      [-100, 30, -70],
      [-60, 8, -30],
      [-32, 6, -30],
      [-20, 5, -6],
      [0, 6, 4],
      [30, 5, 14],
      [10, 5, 22],
      [-6, 6, 40],
      [-4, 14, 64],
      [8, 20, 92],
      [-40, 40, 60],
    ],
  },
);

// ---- simulation state
const START_CLOCK = 6 * HOUR; // the run starts at 06:00 on day 1
const SPEEDS = [900, 1800, 3600];
const SPEED_LABEL = ['1 h / 4 s', '1 h / 2 s', '1 h / 1 s'];
let t = 0;
let playing = true;
let rate = SPEEDS[1];
let lang: Lang = 'en';
let rainOn = true;
let storm: Storm = makeStorm(4, true);
let status: Status = 'NORMAL';
let evacuateAt: number | null = null;

function makeStorm(signal: number, worstCase: boolean): Storm {
  // landfall about 40 h in, nudged onto a high tide (worst case) or a low tide
  const high = nextHighTide(34 * HOUR);
  return { signal, landfall: worstCase ? high.at : high.at + 6.2 * HOUR };
}

function restart() {
  t = 0;
  evacuateAt = null;
  storm = makeStorm(+$<HTMLInputElement>('i-signal').value, $<HTMLInputElement>('i-align').checked);
  for (const p of people) p.progress = 0;
  status = 'NORMAL';
}

const clock = (s: number) => {
  const abs = START_CLOCK + s;
  const day = Math.floor(abs / (24 * HOUR)) + 1;
  const h = Math.floor((abs % (24 * HOUR)) / HOUR);
  const m = Math.floor((abs % HOUR) / 60);
  return `Day ${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const hhmm = (s: number) => clock(s).slice(-5);

// ---- controls (same markup and classes as the creek simulator's panel)
$('panel-toggle').addEventListener('click', () => $('panel').classList.toggle('open'));
$('b-storm').onclick = () => {
  playing = !playing;
  $('b-storm').textContent = playing ? 'Pause' : 'Play storm';
};
$('b-reset').onclick = restart;
$<HTMLInputElement>('i-speed').oninput = (e) => {
  const i = +(e.target as HTMLInputElement).value - 1;
  rate = SPEEDS[i];
  $('o-speed').textContent = SPEED_LABEL[i];
};
$<HTMLInputElement>('i-signal').oninput = (e) => {
  const v = +(e.target as HTMLInputElement).value;
  $('o-signal').textContent = 'Signal ' + v;
  storm = { ...storm, signal: v };
};
$<HTMLInputElement>('i-align').onchange = () => {
  const keep = storm.landfall - t;
  storm = makeStorm(storm.signal, $<HTMLInputElement>('i-align').checked);
  if (keep < storm.landfall - t - 7 * HOUR) storm.landfall = t + keep; // don't jump the clock around mid-run
};
$<HTMLInputElement>('i-rain').onchange = (e) => (rainOn = (e.target as HTMLInputElement).checked);
$<HTMLSelectElement>('i-lang').onchange = (e) => (lang = (e.target as HTMLSelectElement).value as Lang);
document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) =>
  b.addEventListener('click', () => {
    rig.goTo(b.dataset.cam as Preset | 'cinematic');
    document.querySelectorAll('[data-cam]').forEach((x) => x.classList.toggle('active', x === b));
  }),
);

// ---- HUD + chart
const chart = $<HTMLCanvasElement>('chart');
const cx = chart.getContext('2d')!;
let lastHud = 0;

function drawChart(f: ReturnType<typeof forecast>) {
  chart.width = chart.clientWidth * devicePixelRatio;
  chart.height = chart.clientHeight * devicePixelRatio;
  cx.scale(devicePixelRatio, devicePixelRatio);
  const W = chart.clientWidth;
  const H = chart.clientHeight;
  const t0 = t - 12 * HOUR;
  const t1 = t + 24 * HOUR;
  const X = (s: number) => ((s - t0) / (t1 - t0)) * W;
  const Y = (m: number) => H - ((m + 1.5) / 6) * H;
  cx.font = '10px IBM Plex Mono, monospace';

  for (const [m, label, c] of [
    [COAST.seawall, 'seawall', '#e3740f'],
    [COAST.homes, 'house floors', '#d23a2f'],
  ] as const) {
    cx.strokeStyle = c;
    cx.setLineDash([2, 3]);
    cx.beginPath();
    cx.moveTo(0, Y(m));
    cx.lineTo(W, Y(m));
    cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle = c;
    cx.fillText(label, 4, Y(m) - 3);
  }

  cx.strokeStyle = '#6aa9e9';
  cx.setLineDash([4, 3]);
  cx.beginPath();
  for (let s = t0; s <= t1; s += 900) (s === t0 ? cx.moveTo : cx.lineTo).call(cx, X(s), Y(tide(s)));
  cx.stroke();
  cx.setLineDash([]);

  cx.strokeStyle = '#e9eef3';
  cx.lineWidth = 1.8;
  cx.beginPath();
  for (let s = Math.max(0, t0), first = true; s <= t; s += 900, first = false)
    (first ? cx.moveTo : cx.lineTo).call(cx, X(s), Y(filtered(s, storm)));
  cx.stroke();

  if (f.outlook) {
    cx.strokeStyle = '#ffc83d';
    cx.beginPath();
    f.points.forEach((p, i) => (i ? cx.lineTo : cx.moveTo).call(cx, X(p.t), Y(p.level)));
    cx.stroke();
    cx.fillStyle = '#ffc83d';
    cx.beginPath();
    cx.arc(X(f.peak.t), Y(f.peak.level), 3, 0, Math.PI * 2);
    cx.fill();
  }
  cx.lineWidth = 1;

  cx.strokeStyle = 'rgba(233,238,243,0.4)';
  cx.beginPath();
  cx.moveTo(X(t), 0);
  cx.lineTo(X(t), H);
  cx.stroke();
  cx.fillStyle = '#8794a2';
  if (storm.landfall > t0 && storm.landfall < t1) cx.fillText('landfall', X(storm.landfall) - 20, 11);
  cx.fillText('-12h', 2, H - 3);
  cx.fillText('now', X(t) + 3, H - 3);
  cx.fillText('+24h', W - 30, H - 3);
}

function updateHud(measured: number) {
  const f = forecast(t, storm);
  status = coastStatus(t, f, measured);
  // a WARNING already means "move while it's safe", so people start walking then
  if ((status === 'WARNING' || status === 'EVACUATE') && evacuateAt === null) evacuateAt = t;

  const badge = $('badge');
  badge.textContent = status;
  badge.className = 'badge s-' + status;
  $('m-level').textContent = measured.toFixed(2);
  $('m-surge').textContent = (f.surgeNow >= 0 ? '+' : '') + f.surgeNow.toFixed(2);
  const ht = nextHighTide(t);
  $('m-high').textContent = hhmm(ht.at);
  $('m-high-h').textContent = ht.height.toFixed(2) + ' m tide';

  const toLandfall = (storm.landfall - t) / HOUR;
  $('src-chip').textContent = toLandfall > 0 ? `in ${toLandfall.toFixed(0)} h` : `${(-toLandfall).toFixed(0)} h ago`;
  $('storm-time').textContent = clock(t);
  $('storm-bar').style.width = Math.min(100, (t / (storm.landfall + 20 * HOUR)) * 100) + '%';

  const eta = (f.peak.t - t) / HOUR;
  $('fc-eta').textContent = f.outlook ? `Peak ${f.peak.level.toFixed(1)} m at ${hhmm(f.peak.t)}` : 'No surge outlook yet';
  $('fc-detail').textContent = !f.outlook
    ? 'PAGASA issues one about 36 h before landfall.'
    : ` · ${eta > 0.5 ? `in ${eta.toFixed(0)} h, ` : ''}${f.peak.level >= COAST.seawall ? 'above the seawall' : 'below the seawall'}`;

  const alert = $('alert');
  alert.className = 'alert surface s-' + status;
  $('alert-title').textContent = status === 'NORMAL' ? 'Status update' : status;
  $('alert-text').textContent = coastAdvisory(lang, status, {
    level: measured,
    surge: f.surgeNow,
    peak: f.peak.level,
    eta: t > storm.landfall ? 0 : eta,
  });
  led.material.color.setHex(STATUS_COLORS[status]);
  drawChart(f);
}

// ---- loop
let prev = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  if (playing) t += dt * rate;
  if (t > storm.landfall + 20 * HOUR) restart();

  const measured = filtered(t, storm);
  const stormy = Math.min(1, surgeShape(t, storm.landfall) ** 0.35 * (storm.signal / 5) * 1.3);
  const rainMm = Math.max(0, stormy - 0.1) * 90;

  // the creek sky follows the sim clock; heavy rain darkens it
  state.timeOfDay = ((START_CLOCK + t) % (24 * HOUR)) / (24 * HOUR);
  sky.update(dt, rainMm, camera);
  rain.update(dt, rainMm, rainOn, camera, sky.light);

  const light = {
    sunDir: sky.sunDir,
    sunColor: sky.sunColor,
    horizon: sky.horizon,
    zenith: sky.zenith,
    light: sky.light,
    flash: sky.flash,
  };
  sea.update(dt, measured, 0.15 + stormy * 0.45, 1 + stormy * 3.5, rainOn ? rainMm / 100 : 0, light);

  // over the wall: the flat behind it fills toward the sea level
  const over = measured - COAST.seawall;
  const goal = over > 0 ? Math.min(measured, 1.0 + over * 1.6 + 0.2) : -10;
  inlandY = inlandY < 0 && goal > 0 ? 0.95 : THREE.MathUtils.lerp(inlandY, goal, Math.min(1, dt * 1.5));
  inland.mesh.visible = inlandY > 0.96;
  inland.update(dt, inlandY, 1, 0.6 + stormy, rainOn ? rainMm / 100 : 0, light);

  const clockS = now / 1000;
  for (const [i, p] of palms.entries()) p.rotation.z = -stormy * 0.3 + Math.sin(clockS * (1 + stormy * 3) + i) * 0.03 * (1 + stormy * 4);

  for (const p of people) {
    if (evacuateAt !== null) p.progress = Math.min(1, Math.max(0, (t - evacuateAt) / (2.5 * HOUR) - p.delay));
    const k = p.progress * (pathPts.length - 1);
    const a = pathPts[Math.floor(k)];
    const b = pathPts[Math.min(pathPts.length - 1, Math.floor(k) + 1)];
    const pos = p.progress < 0.08 ? p.home.clone().lerp(pathPts[0], p.progress / 0.08) : a.clone().lerp(b, k % 1);
    pos.x += ((p.delay * 40) % 2.4) - 1.2;
    const step = pos.distanceTo(p.last);
    const speed = dt > 0 ? Math.min(4, step / dt) : 0;
    const heading = step > 0.001 ? Math.atan2(pos.x - p.last.x, pos.z - p.last.z) : p.rig.root.rotation.y;
    p.rig.pose(dt, speed, pos.x, pos.y, pos.z, heading);
    p.last.copy(pos);
  }

  rig.update(dt);
  if (now - lastHud > 200) {
    lastHud = now;
    updateHud(measured);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

try {
  await renderer.compileAsync(scene, camera);
} catch {
  // older browsers compile on the first frame instead
}
document.getElementById('loading')?.remove();
requestAnimationFrame(frame);
