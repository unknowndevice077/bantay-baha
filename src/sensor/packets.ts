/**
 * MQTT data flow visual: each reading leaves the pole's antenna as a glowing
 * packet, hops to the gateway on the barangay hall roof, then to the outdoor
 * dashboard screen, which redraws when the packet lands.
 */
import * as THREE from 'three';
import type { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { DASHBOARD, HALL, STATUS_COLORS, statusCss } from '../config';
import type { Reading } from '../state';
import { canvasTexture, glowTexture } from '../util';
import { HALL_PLAN } from '../scene/layout';
import { groundHeight } from '../scene/terrain';
import { label, tag } from './pole';

const LEG_SPLIT = 0.62;
const TRAVEL_S = 1.8;
const POOL = 12;

interface Packet {
  sprite: THREE.Sprite;
  t: number;
  reading: Reading | null;
}


export class PacketFlow {
  readonly group = new THREE.Group();
  private readonly legA: THREE.QuadraticBezierCurve3;
  private readonly legB: THREE.QuadraticBezierCurve3;
  private readonly packets: Packet[] = [];
  private readonly paths: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>[] = [];
  private readonly labels: CSS2DObject[] = [];
  private readonly gatewayLed = new THREE.MeshBasicMaterial({ color: 0x1e3a2a });
  private gwFlash = 0;
  private readonly screen: THREE.CanvasTexture;

  constructor(from: THREE.Vector3, private readonly history: Reading[]) {
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2 });

    // Gateway on the hall roof ridge.
    const gateway = new THREE.Vector3(HALL.x + 4, HALL_PLAN.floorY + HALL_PLAN.h + HALL_PLAN.roofH + 0.2, HALL.z);
    const gw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.25), mat(0xf3f4f6));
    gw.position.copy(gateway);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), this.gatewayLed);
    led.position.set(0.15, 0.08, -0.13);
    gw.add(led);
    for (const x of [-0.18, 0.18]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.9, 6), mat(0x222222));
      ant.position.set(x, 0.6, 0);
      gw.add(ant);
    }
    const gwLabel = label('Gateway · MQTT broker (topic bantaybaha/sensor/01)', 'gateway');
    tag('gateway', gw);
    gwLabel.position.set(0, 1.3, 0);
    gw.add(gwLabel);

    // Outdoor dashboard billboard facing the river (north).
    const gy = groundHeight(DASHBOARD.x, DASHBOARD.z);
    const dash = new THREE.Group();
    dash.position.set(DASHBOARD.x, gy, DASHBOARD.z);
    dash.rotation.y = Math.PI;
    for (const x of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.4, 8), mat(0x4b5563));
      post.position.set(x, 1.7, -0.1);
      dash.add(post);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.8, 0.2), mat(0x111827));
    frame.position.set(0, 3.4, 0);
    frame.castShadow = true;
    this.screen = canvasTexture(512, 292, () => undefined);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), new THREE.MeshBasicMaterial({ map: this.screen, toneMapped: false }));
    screen.position.set(0, 3.4, 0.11);
    const dashLabel = label('Barangay dashboard (MQTT subscriber)', 'dashboard');
    tag('dashboard', dash);
    dashLabel.position.set(0, 5.2, 0);
    dash.add(frame, screen, dashLabel);
    this.labels.push(gwLabel, dashLabel);
    this.group.add(gw, dash);

    const dashTop = new THREE.Vector3(DASHBOARD.x, gy + 4.9, DASHBOARD.z);
    const mid = (a: THREE.Vector3, b: THREE.Vector3, lift: number) => a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0));
    this.legA = new THREE.QuadraticBezierCurve3(from.clone(), mid(from, gateway, 14), gateway.clone().add(new THREE.Vector3(0, 0.3, 0)));
    this.legB = new THREE.QuadraticBezierCurve3(gateway.clone().add(new THREE.Vector3(0, 0.3, 0)), mid(gateway, dashTop, 5), dashTop);

    for (const curve of [this.legA, this.legB]) {
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60));
      const path = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x7dd3fc, dashSize: 0.6, gapSize: 0.4, transparent: true }));
      path.computeLineDistances();
      path.visible = false;
      this.paths.push(path);
      this.group.add(path);
    }

    const glow = glowTexture();
    for (let i = 0; i < POOL; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color: 0x7dd3fc, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      );
      sprite.visible = false;
      sprite.userData.noAO = true;
      this.packets.push({ sprite, t: -1, reading: null });
      this.group.add(sprite);
    }
    this.drawScreen(null);
  }

  /** Publish one reading (one packet travels the whole route). */
  emit(reading: Reading): void {
    const p = this.packets.find((k) => k.t < 0);
    if (!p) return;
    p.t = 0;
    p.reading = reading;
    p.sprite.material.color.set(STATUS_COLORS[reading.status]).lerp(new THREE.Color(0x7dd3fc), 0.5);
    p.sprite.visible = true;
  }

  update(dt: number, xray: boolean): void {
    for (const p of this.packets) {
      if (p.t < 0) continue;
      const before = p.t;
      p.t += dt / TRAVEL_S;
      if (before < LEG_SPLIT && p.t >= LEG_SPLIT) this.gwFlash = 1;
      if (p.t >= 1) {
        p.t = -1;
        p.sprite.visible = false;
        this.drawScreen(p.reading);
        continue;
      }
      const pos = p.t < LEG_SPLIT ? this.legA.getPoint(p.t / LEG_SPLIT) : this.legB.getPoint((p.t - LEG_SPLIT) / (1 - LEG_SPLIT));
      p.sprite.position.copy(pos);
      p.sprite.scale.setScalar(0.9 + Math.sin(p.t * 40) * 0.15);
    }
    this.gwFlash = Math.max(0, this.gwFlash - dt * 3);
    this.gatewayLed.color.setRGB(0.12 + this.gwFlash * 0.4, 0.23 + this.gwFlash * 0.77, 0.16 + this.gwFlash * 0.3);
    for (const path of this.paths) {
      path.visible = xray;
      path.material.opacity = 0.8;
    }
    for (const l of this.labels) l.visible = xray;
  }

  private drawScreen(r: Reading | null): void {
    const canvas = this.screen.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('BANTAY BAHA · Sensor 01', 16, 32);
    if (r) {
      ctx.fillStyle = statusCss(r.status);
      ctx.fillRect(W - 190, 12, 176, 32);
      ctx.fillStyle = '#0b1220';
      ctx.textAlign = 'center';
      ctx.fillText(r.status, W - 102, 36);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText(`${(r.level * 100).toFixed(0)} cm`, 16, 108);
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`Rise ${r.rate >= 0 ? '+' : ''}${r.rate.toFixed(0)} cm/10 min   ·   distance ${(r.distance * 100).toFixed(0)} cm`, 16, 142);

      // Sparkline of the last 10 minutes.
      const pts = this.history.filter((h) => h.t >= r.t - 600);
      const lo = Math.min(...pts.map((h) => h.level)) - 0.1;
      const hi = Math.max(...pts.map((h) => h.level)) + 0.1;
      ctx.strokeStyle = statusCss(r.status);
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach((h, i) => {
        const x = 16 + ((h.t - (r.t - 600)) / 600) * (W - 32);
        const y = H - 20 - ((h.level - lo) / (hi - lo)) * 100;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText('Waiting for sensor data…', 16, 110);
    }
    this.screen.needsUpdate = true;
  }
}
