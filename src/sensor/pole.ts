/**
 * The smart pole: ultrasonic transducer on an arm over the creek (with its
 * visible beam), ESP32 enclosure, solar panel, antenna, status LED and a
 * warning beacon. X-ray mode explodes the enclosure to show what's inside.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { POLE_X, SENSOR_Y, STATUS_COLORS, riverZ } from '../config';
import { type Status, state } from '../state';
import type { ComponentId } from './components';
import { canvasTexture, damp, smoothstep } from '../util';
import { groundHeight } from '../scene/terrain';

const LED_HZ: Record<Status, number> = { NORMAL: 0.5, ADVISORY: 1, WARNING: 2, EVACUATE: 4 };

const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

/** X-ray label; clicking it opens the component in the inspector. */
export function label(text: string, component?: ComponentId): CSS2DObject {
  const el = document.createElement('div');
  el.className = 'xlabel';
  el.textContent = text;
  if (component) {
    el.dataset.component = component;
    el.classList.add('clickable');
  }
  const obj = new CSS2DObject(el);
  obj.visible = false;
  return obj;
}

/** Marks objects as clickable parts for the inspector. */
export function tag(id: ComponentId, ...objects: THREE.Object3D[]): void {
  for (const o of objects) o.userData.component = id;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** A part inside the enclosure that slides out to `out` in X-ray mode. */
interface Part {
  obj: THREE.Object3D;
  home: THREE.Vector3;
  out: THREE.Vector3;
}

/** A wire between two parts, rebuilt while the enclosure animates. */
interface Wire {
  a: THREE.Object3D;
  pa: THREE.Vector3;
  b: THREE.Object3D;
  pb: THREE.Vector3;
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
}

export class SmartPole {
  readonly group = new THREE.Group();
  /** World position of the transducer face. */
  readonly tip: THREE.Vector3;
  readonly antennaTip = new THREE.Vector3();
  readonly enclosureCenter = new THREE.Vector3();
  private readonly enclosure = new THREE.Group();
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly hitRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly ledMat = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.NORMAL });
  private readonly ledLight = new THREE.PointLight(STATUS_COLORS.NORMAL, 0, 6);
  private readonly beaconMat = std(0x7a4a10, { emissive: 0xff8800, emissiveIntensity: 0, transparent: true, opacity: 0.9 });
  private readonly beaconLights: THREE.PointLight[] = [];
  private readonly shellMats: THREE.MeshStandardMaterial[] = [];
  /** Materials of the internal parts; they self-illuminate in X-ray so they read at night. */
  private readonly partMats: THREE.MeshStandardMaterial[] = [];
  private readonly cableMat = std(0x111111);
  private readonly parts: Part[] = [];
  private readonly wires: Wire[] = [];
  private readonly labels: CSS2DObject[] = [];
  private readonly distLabel: CSS2DObject;
  private explode = 0;
  private builtExplode = -1;

  constructor() {
    const rz = riverZ(POLE_X);
    const baseZ = rz + 10.5;
    const g = groundHeight(POLE_X, baseZ);
    const topY = SENSOR_Y + 1.3;
    this.tip = new THREE.Vector3(POLE_X, SENSOR_Y, rz + 5);
    const steel = std(0x9aa3ab, { metalness: 0.6, roughness: 0.45 });
    const G = this.group;

    // Footing, mast, arm, brace, drop to the transducer.
    const footing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 12), std(0xa8a49a));
    footing.position.set(POLE_X, g + 0.1, baseZ);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, topY - g, 10), steel);
    mast.position.set(POLE_X, (topY + g) / 2, baseZ);
    const armLen = baseZ - this.tip.z + 0.1;
    const arm = box(0.08, 0.08, armLen, steel, POLE_X, SENSOR_Y + 0.35, (baseZ + this.tip.z) / 2 - 0.05);
    const braceA = new THREE.Vector3(POLE_X, SENSOR_Y - 0.8, baseZ);
    const braceB = new THREE.Vector3(POLE_X, SENSOR_Y + 0.35, baseZ - 1.8);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, braceA.distanceTo(braceB), 6), steel);
    brace.position.copy(braceA).add(braceB).multiplyScalar(0.5);
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), braceB.clone().sub(braceA).normalize());
    const drop = box(0.05, 0.25, 0.05, steel, POLE_X, SENSOR_Y + 0.22, this.tip.z);
    const transducer = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 16), std(0x151515));
    transducer.position.set(POLE_X, SENSOR_Y + 0.06, this.tip.z);
    for (const m of [footing, mast, arm, brace, drop, transducer]) m.castShadow = true;
    G.add(footing, mast, arm, brace, drop, transducer);
    tag('mast', footing, mast, arm, brace, drop);
    tag('transducer', transducer);

    const tLabel = label('JSN-SR04T waterproof ultrasonic transducer', 'transducer');
    tLabel.position.set(POLE_X, SENSOR_Y + 0.6, this.tip.z);
    this.distLabel = label('');
    G.add(tLabel, this.distLabel);
    this.labels.push(tLabel);

    // Translucent beam cone pointing at the water + a ring where it lands.
    const beamGeo = new THREE.CylinderGeometry(0.01, 0.26, 1, 32, 1, true);
    beamGeo.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x7fe3ff) } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            float y = 1.0 - vUv.y;
            float ring = pow(max(0.0, sin((y * 6.0 - uTime * 3.0) * 3.14159)), 12.0);
            gl_FragColor = vec4(uColor, (0.08 + ring * 0.35) * (1.0 - y * 0.4));
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.beam.position.copy(this.tip);
    const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.hitRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    G.add(this.beam, this.hitRing);
    tag('beam', this.beam);
    this.beam.userData.noAO = this.hitRing.userData.noAO = true;

    this.buildEnclosure(g, baseZ);
    this.buildTop(topY, baseZ, steel);

    // Signal cable from the enclosure up the mast and out along the arm.
    const cableCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(POLE_X - 0.15, g + 1.97, baseZ - 0.2),
        new THREE.Vector3(POLE_X - 0.13, g + 1.7, baseZ - 0.12),
        new THREE.Vector3(POLE_X - 0.13, SENSOR_Y + 0.25, baseZ - 0.12),
        new THREE.Vector3(POLE_X + 0.06, SENSOR_Y + 0.42, baseZ - 0.4),
        new THREE.Vector3(POLE_X + 0.06, SENSOR_Y + 0.42, this.tip.z + 0.3),
        new THREE.Vector3(POLE_X, SENSOR_Y + 0.14, this.tip.z),
      ],
      false,
      'catmullrom',
      0.2,
    );
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 80, 0.018, 6), this.cableMat);
    tag('wiring', cable);
    G.add(cable);

    G.updateMatrixWorld(true);
    this.enclosure.localToWorld(this.antennaTip.set(0.17, 0.78, -0.04));
    this.enclosureCenter.copy(this.enclosure.position);
  }

  private buildEnclosure(g: number, baseZ: number): void {
    const E = this.enclosure;
    E.position.set(POLE_X, g + 2.3, baseZ - 0.35);
    E.rotation.y = Math.PI; // front (local +z) faces the river
    this.group.add(E);

    const shellMat = std(0xc9cdd1, { roughness: 0.7, transparent: true });
    const lidMat = std(0xd5d8db, { roughness: 0.6, transparent: true });
    this.shellMats.push(shellMat, lidMat);
    const shell = box(0.5, 0.62, 0.2, shellMat);
    shell.castShadow = true;
    const lid = box(0.52, 0.64, 0.03, lidMat, 0, 0, 0.115);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), this.ledMat);
    led.position.set(0.18, 0.24, 0.02);
    lid.add(led);
    this.ledLight.position.set(0.18, 0.24, 0.2);
    E.add(shell, lid, this.ledLight);
    this.parts.push({ obj: lid, home: lid.position.clone(), out: new THREE.Vector3(0, 0, 0.75) });
    tag('enclosure', shell, lid);
    tag('led', led);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.45, 6), std(0x1b1b1b));
    antenna.position.set(0.17, 0.53, -0.04);
    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), std(0x1b1b1b));
    antTip.position.set(0.17, 0.77, -0.04);
    E.add(antenna, antTip);
    tag('antenna', antenna, antTip);

    const pcb = (color: number) => std(color, { roughness: 0.5 });
    const metal = std(0xb8bec6, { metalness: 0.8, roughness: 0.3 });

    // ESP32 dev board.
    const esp = new THREE.Group();
    esp.add(
      box(0.15, 0.27, 0.012, pcb(0x1f2937)),
      box(0.11, 0.13, 0.016, metal, 0, 0.05, 0.012),
      box(0.012, 0.24, 0.02, std(0x111111), -0.068, 0, 0.014),
      box(0.012, 0.24, 0.02, std(0x111111), 0.068, 0, 0.014),
      box(0.03, 0.02, 0.015, metal, 0, -0.13, 0.012),
    );
    // JSN-SR04T driver board.
    const drv = new THREE.Group();
    drv.add(
      box(0.2, 0.13, 0.012, pcb(0x0f7a3a)),
      box(0.04, 0.04, 0.01, std(0x111111), -0.05, 0.02, 0.01),
      box(0.03, 0.012, 0.012, metal, 0.03, 0.03, 0.01),
      box(0.05, 0.03, 0.03, std(0xf2f2f2), 0.07, -0.04, 0.015),
    );
    // 2×18650 battery pack.
    const bat = new THREE.Group();
    bat.add(box(0.2, 0.09, 0.04, std(0x161616)));
    for (const y of [-0.022, 0.022]) {
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.18, 14), std(0x2563eb, { roughness: 0.35 }));
      cell.rotation.z = Math.PI / 2;
      cell.position.set(0, y, 0.012);
      bat.add(cell);
    }

    const add = (
      id: ComponentId,
      obj: THREE.Object3D,
      home: [number, number, number],
      out: [number, number, number],
      text: string,
      lp: [number, number, number],
    ) => {
      obj.position.set(...home);
      tag(id, obj);
      E.add(obj);
      this.parts.push({ obj, home: new THREE.Vector3(...home), out: new THREE.Vector3(...out) });
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh) this.partMats.push(o.material as THREE.MeshStandardMaterial);
      });
      const l = label(text, id);
      l.position.set(...lp);
      obj.add(l);
      this.labels.push(l);
    };
    add('esp32', esp, [-0.11, 0.06, 0], [-0.34, 0.2, 0.45], 'ESP32-WROOM-32 · MQTT over Wi-Fi', [0, 0.19, 0]);
    add('driver', drv, [0.11, 0.14, 0], [0.34, 0.26, 0.45], 'JSN-SR04T driver board', [0, 0.12, 0]);
    add('battery', bat, [0, -0.18, 0], [0, -0.42, 0.42], '2× 18650 Li-ion · solar charged', [0, -0.1, 0]);

    const wire = (a: THREE.Object3D, pa: [number, number, number], b: THREE.Object3D, pb: [number, number, number], color: number) => {
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(), std(color, { roughness: 0.4 }));
      tag('wiring', mesh);
      E.add(mesh);
      this.wires.push({ a, pa: new THREE.Vector3(...pa), b, pb: new THREE.Vector3(...pb), mesh });
    };
    wire(bat, [0.08, 0.03, 0.02], esp, [0.05, -0.12, 0.01], 0xdc2626); // VIN
    wire(bat, [-0.08, 0.03, 0.02], esp, [-0.05, -0.12, 0.01], 0x222222); // GND
    wire(esp, [0.06, 0.08, 0.02], drv, [-0.08, 0.0, 0.01], 0xeab308); // TRIG
    wire(esp, [0.06, 0.04, 0.02], drv, [-0.08, -0.03, 0.01], 0x16a34a); // ECHO
    wire(bat, [0.09, 0.0, 0.02], drv, [0.06, -0.05, 0.01], 0xdc2626); // 5V
    wire(drv, [0.07, -0.05, 0.03], shell, [0.15, -0.3, 0.0], 0xf97316); // to transducer cable gland

    const wLabel = label('Wiring: VIN · GND · TRIG · ECHO · transducer', 'wiring');
    wLabel.position.set(0, -0.05, 0.35);
    E.add(wLabel);
    this.labels.push(wLabel);
  }

  private buildTop(topY: number, baseZ: number, steel: THREE.Material): void {
    // Solar panel tilted toward the south-facing sky.
    const cells = canvasTexture(256, 176, (ctx) => {
      ctx.fillStyle = '#0d1f3c';
      ctx.fillRect(0, 0, 256, 176);
      ctx.strokeStyle = '#7f95b8';
      ctx.lineWidth = 2;
      for (let x = 0; x <= 256; x += 32) ctx.strokeRect(x, 0, 0, 176);
      for (let y = 0; y <= 176; y += 29) ctx.strokeRect(0, y, 256, 0);
    });
    const frame = std(0xb8bec6, { metalness: 0.7 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.035, 0.68), [
      frame,
      frame,
      new THREE.MeshStandardMaterial({ map: cells, roughness: 0.25, metalness: 0.3 }),
      frame,
      frame,
      frame,
    ]);
    panel.position.set(POLE_X, topY - 0.15, baseZ + 0.3);
    panel.rotation.x = 0.3;
    panel.castShadow = true;
    const bracket = box(0.05, 0.25, 0.05, steel, POLE_X, topY - 0.3, baseZ + 0.18);

    // Warning beacon on the mast top.
    const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 12), std(0x222222));
    beaconBase.position.set(POLE_X, topY + 0.04, baseZ);
    this.group.add(panel, bracket, beaconBase);
    tag('solar', panel, bracket);
    tag('beacon', beaconBase);
    this.addBeacon(new THREE.Vector3(POLE_X, topY + 0.08, baseZ));
  }

  /** Adds a flashing warning beacon (the pole has one; main adds another on the barangay hall). */
  addBeacon(at: THREE.Vector3): void {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.beaconMat);
    dome.position.copy(at);
    tag('beacon', dome);
    const light = new THREE.PointLight(0xff8800, 0, 30);
    light.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
    this.beaconLights.push(light);
    this.group.add(dome, light);
  }

  update(dt: number, time: number, waterY: number, status: Status, xray: boolean): void {
    // Beam: from the transducer straight down to the water surface.
    const d = Math.max(0.05, this.tip.y - waterY);
    this.beam.scale.set(d, d, d);
    this.beam.material.uniforms.uTime.value = time;
    const pulse = (time * 0.8) % 1;
    const r = 0.26 * d * (0.4 + 0.6 * pulse);
    this.hitRing.scale.set(r, 1, r);
    this.hitRing.position.set(this.tip.x, waterY + 0.03, this.tip.z);
    this.hitRing.material.opacity = 0.6 * (1 - pulse);

    // Status LED: heartbeat when normal, faster blinking as risk rises.
    const on = status === 'NORMAL' ? time % 2 < 0.15 : Math.sin(time * LED_HZ[status] * Math.PI * 2) > 0;
    this.ledMat.color.set(STATUS_COLORS[status]).multiplyScalar(on ? 1 : 0.15);
    this.ledLight.color.set(STATUS_COLORS[status]);
    this.ledLight.intensity = on ? 1.5 : 0;

    // Beacon: amber at WARNING, red and faster at EVACUATE.
    const active = status === 'WARNING' || status === 'EVACUATE' || state.sirenManual;
    const flash = active && Math.sin(time * Math.PI * 2 * (status === 'EVACUATE' ? 3 : 1.5)) > 0 ? 1 : 0;
    const beaconColor = status === 'EVACUATE' ? 0xff2020 : 0xff8800;
    this.beaconMat.emissive.set(beaconColor);
    this.beaconMat.emissiveIntensity = flash * 4;
    for (const l of this.beaconLights) {
      l.color.set(beaconColor);
      l.intensity = flash * 60;
    }

    this.updateXray(dt, xray, d);
  }

  private updateXray(dt: number, xray: boolean, distance: number): void {
    this.explode = damp(this.explode, xray ? 1 : 0, 4, dt);
    const e = smoothstep(0, 1, this.explode);
    this.enclosure.scale.setScalar(1 + 0.7 * e);
    for (const p of this.parts) p.obj.position.lerpVectors(p.home, p.out, e);
    for (const m of this.shellMats) {
      m.opacity = 1 - 0.85 * e;
      m.depthWrite = e < 0.5;
    }
    for (const m of this.partMats) m.emissive.copy(m.color).multiplyScalar(0.6 * e);
    this.cableMat.color.set(e > 0.5 ? 0xf97316 : 0x111111);
    this.cableMat.emissive.set(e > 0.5 ? 0x7c2d12 : 0x000000);
    const showLabels = e > 0.6;
    for (const l of this.labels) l.visible = showLabels;
    this.distLabel.visible = showLabels;
    if (showLabels) {
      this.distLabel.element.textContent = `distance d = ${(distance * 100).toFixed(0)} cm`;
      this.distLabel.position.set(this.tip.x + 0.4, this.tip.y - distance / 2, this.tip.z);
    }

    if (Math.abs(e - this.builtExplode) > 1e-3) {
      this.builtExplode = e;
      for (const w of this.wires) {
        const a = w.a.position.clone().add(w.pa);
        const b = w.b.position.clone().add(w.pb);
        const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.06 + e * 0.15));
        w.mesh.geometry.dispose();
        w.mesh.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.006, 5);
      }
    }
  }
}
