/**
 * The barangay itself: renderer, scene, terrain, buildings, water, weather,
 * sensor pole, residents and sound. Shared by the simulator (main.ts) and the
 * story game (game/main.ts); each page adds its own controls and HUD on top.
 */
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { AudioEngine } from './alerts/audio';
import { HALL, levelToY } from './config';
import { DebrisField } from './debris/debris';
import { DuckArmada } from './debris/ducks';
import { createSirenButton } from './player/props';
import { Grass } from './scene/grass';
import { createInfrastructure } from './scene/infrastructure';
import { HALL_PLAN, HOUSES, type HousePlan, roomCeiling, toLocal } from './scene/layout';
import { PostFX } from './scene/postfx';
import { Rain } from './scene/rain';
import { Residents } from './scene/residents';
import { Sky } from './scene/sky';
import { StreetLights } from './scene/streetlights';
import { Surroundings } from './scene/surroundings';
import { createTerrain } from './scene/terrain';
import { createVillage } from './scene/village';
import { Esp32Node } from './sensor/esp32';
import { createStaffGauge } from './sensor/gauge';
import { Monitor } from './sensor/monitor';
import { PacketFlow } from './sensor/packets';
import { SmartPole } from './sensor/pole';
import { updateSim } from './sim';
import { type Reading, bus, state } from './state';
import { clamp, smoothstep } from './util';
import { Water } from './water/water';

export class World {
  readonly mobile = window.innerWidth < 768;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1500);
  readonly postfx: PostFX;
  readonly sky: Sky;
  readonly pole = new SmartPole();
  readonly monitor = new Monitor();
  readonly packets: PacketFlow;
  readonly ducks = new DuckArmada();
  readonly residents = new Residents();
  readonly gauge = createStaffGauge();
  readonly sirenButton = createSirenButton();
  readonly esp32 = new Esp32Node();
  readonly audio = new AudioEngine();
  /** Camera is inside a building: no rain streaks, and the room lamp is on. */
  indoors = false;
  /** Called once per published sensor packet (about every second). */
  onPacket: ((r: Reading) => void) | null = null;

  private readonly village = createVillage();
  private readonly grass = new Grass();
  private readonly surroundings = new Surroundings();
  private readonly streetLights = new StreetLights();
  readonly water: Water;
  private readonly rain = new Rain();
  private readonly debris = new DebrisField();
  private readonly clock = new THREE.Clock();
  private packetTimer = 0;
  /** One warm lamp that lights whichever room the camera is in (a light per house would cost too much). */
  private readonly roomLight = new THREE.PointLight(0xffe2b8, 0, 12, 2);

  constructor(app: HTMLElement, labels: HTMLDivElement) {
    const renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 1.25 : 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    app.prepend(renderer.domElement);
    this.renderer = renderer;

    this.labelRenderer = new CSS2DRenderer({ element: labels });
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.postfx = new PostFX(renderer, this.scene, this.camera);

    const terrain = createTerrain();
    this.sky = new Sky(this.scene, renderer, this.mobile ? 1024 : 2048);
    this.water = new Water(terrain.heightTexture);
    this.pole.addBeacon(new THREE.Vector3(HALL.x - 4, HALL_PLAN.floorY + HALL_PLAN.h + HALL_PLAN.roofH + 0.05, HALL.z));
    this.packets = new PacketFlow(this.pole.antennaTip, this.monitor.history);
    this.scene.add(
      terrain.mesh,
      this.surroundings.group,
      createInfrastructure(),
      this.village.group,
      this.grass.mesh,
      this.streetLights.group,
      this.water.mesh,
      this.rain.mesh,
      this.pole.group,
      this.packets.group,
      this.debris.group,
      this.ducks.group,
      this.residents.group,
      this.gauge.group,
      this.sirenButton.group,
      this.roomLight,
    );

    bus.on('reading', (r) => this.esp32.sense(r));
    bus.on('lightning', ({ distance }) => this.audio.thunder(distance / 340));
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
      this.postfx.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get levelY(): number {
    return levelToY(state.level);
  }

  /**
   * Compile every shader before the first frame, in the background where the
   * browser can (KHR_parallel_shader_compile), then draw one frame to upload the
   * geometry and textures. Without this the first frame freezes the page for a
   * couple of seconds while the GPU driver compiles ~40 programs one by one.
   */
  async warmUp(): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // older browsers: the first frame compiles them instead
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Runs the frame loop; `frame` is called after the world has advanced and before rendering. */
  start(frame: (dt: number, t: number) => void): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      this.update(dt, t);
      frame(dt, t);
      if (state.toggles.hq) this.postfx.render(this.sky.night);
      else this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    });
  }

  /** The building whose inside the camera is in, if any. */
  private roomAt(pos: THREE.Vector3): HousePlan | null {
    for (const p of [...HOUSES, HALL_PLAN]) {
      const [lx, lz] = toLocal(p, pos.x, pos.z);
      if (Math.abs(lx) < p.w / 2 && Math.abs(lz) < p.d / 2 && pos.y > p.floorY && pos.y < roomCeiling(p)) return p;
    }
    return null;
  }

  private update(dt: number, t: number): void {
    const room = this.roomAt(this.camera.position);
    this.indoors = !!room;
    if (room) this.roomLight.position.set(room.x, roomCeiling(room) - 0.35, room.z);
    this.roomLight.intensity = room ? (room.type === 'hall' ? 30 : 9) : 0;

    const dtSim = updateSim(dt);
    this.monitor.update(dtSim);
    const levelY = this.levelY;
    const rainNorm = state.rainfall / 100;
    const { sky, camera } = this;

    sky.update(dt, state.rainfall, camera);
    this.village.update(sky.night);
    const mud = clamp(smoothstep(1.2, 3.2, state.level) * 0.8 + rainNorm * 0.4, 0, 1);
    this.water.update(dt, levelY, mud, 0.8 + rainNorm * 1.6, state.toggles.rain ? rainNorm : 0, sky);
    this.surroundings.update(levelY, mud);
    this.grass.update(dt, state.rainfall);
    // Photocells switch the lamps on at dusk and under heavy storm cloud.
    this.streetLights.update(dt, Math.max(sky.night, sky.storm * 0.75), camera);
    this.rain.update(dt, state.rainfall, state.toggles.rain && !this.indoors, camera, sky.light);
    this.debris.update(dt, state.level, levelY, state.rainfall, state.toggles.debris, this.water.time, this.water.chop);
    this.ducks.update(dt, levelY, this.water.time, this.water.chop);
    this.residents.update(dt, levelY, state.status);
    this.pole.update(dt, t, levelY, state.status, state.toggles.xray);

    this.packetTimer -= dt;
    if (state.reading && this.packetTimer <= 0) {
      this.esp32.publish(state.reading);
      this.packets.emit(state.reading);
      this.onPacket?.(state.reading);
      this.packetTimer = 1;
    }
    this.packets.update(dt, state.toggles.xray);
    this.esp32.update(dt, dtSim, 1 - sky.night);
    this.sirenButton.setOn(state.sirenManual, t);
    this.audio.update(state.rainfall, state.status === 'EVACUATE' || state.sirenManual);
  }
}
