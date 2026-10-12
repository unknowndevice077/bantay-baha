/** Procedural geometry builders (no external assets). All results carry vertex colours. */
import * as THREE from 'three';
import { colorize, merge, mulberry32 } from '../util';

/** Unit gable roof: ridge along local X at y = 1, eaves at y = 0, 1×1 footprint. */
export function gableRoof(): THREE.BufferGeometry {
  // prettier-ignore
  const v = [
    -0.5, 0, 0.5,   0.5, 0, 0.5,   0.5, 1, 0,
    -0.5, 0, 0.5,   0.5, 1, 0,    -0.5, 1, 0,
     0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0,
     0.5, 0, -0.5, -0.5, 1, 0,     0.5, 1, 0,
     0.5, 0, 0.5,   0.5, 0, -0.5,  0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5,  -0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** A palm-type leaf lying along +X from the origin; `droop` bends the tip down, `lift` arcs it up first. */
export function leaf(length: number, width: number, droop: number, lift: number, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(length, width, 8, 2);
  g.translate(length / 2, 0, 0);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / length;
    const z = p.getZ(i) * (1 - 0.7 * t);
    p.setXYZ(i, p.getX(i), lift * t - droop * t * t + Math.abs(z) * 0.35, z);
  }
  g.computeVertexNormals();
  return colorize(g, color);
}

export function palmCrown(): THREE.BufferGeometry {
  const rnd = mulberry32(11);
  const parts: THREE.BufferGeometry[] = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    const shade = new THREE.Color(0x3f6b22).lerp(new THREE.Color(0x9c9a3c), rnd() * 0.35);
    const l = leaf(3.6 + rnd() * 0.8, 0.9, 1.4 + rnd() * 0.8, 0.6, shade);
    l.rotateY((i / n) * Math.PI * 2 + rnd() * 0.25);
    parts.push(l);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const nut = new THREE.SphereGeometry(0.16, 7, 5);
    nut.translate(Math.cos(a) * 0.22, -0.25, Math.sin(a) * 0.22);
    parts.push(colorize(nut, 0x6b4a1f));
  }
  return merge(parts);
}

export function bananaCrown(): THREE.BufferGeometry {
  const rnd = mulberry32(5);
  const parts: THREE.BufferGeometry[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const shade = new THREE.Color(0x5c9a2e).lerp(new THREE.Color(0x8fae3c), rnd() * 0.4);
    const l = leaf(2.6, 0.95, 1.6, 1.9, shade);
    l.rotateY((i / n) * Math.PI * 2 + rnd() * 0.4);
    parts.push(l);
  }
  return merge(parts);
}

// ---- Debris ----------------------------------------------------------------

export function logGeo(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.17, 0.22, 3, 8);
  g.rotateZ(Math.PI / 2);
  return colorize(g, 0x5a4128);
}

export function bottleGeo(): THREE.BufferGeometry {
  const body = colorize(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 8), 0x9fd3e6);
  const neck = colorize(new THREE.CylinderGeometry(0.02, 0.04, 0.06, 8), 0x9fd3e6);
  neck.translate(0, 0.15, 0);
  const cap = colorize(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 8), 0x2a6fd6);
  cap.translate(0, 0.195, 0);
  const g = merge([body, neck, cap]);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function frondGeo(): THREE.BufferGeometry {
  const l = leaf(2.6, 0.7, 0.2, 0.05, 0x7a6a35);
  const rib = colorize(new THREE.CylinderGeometry(0.03, 0.05, 2.6, 5), 0x5b4a2a);
  rib.rotateZ(Math.PI / 2);
  rib.translate(1.3, 0, 0);
  const g = merge([l, rib]);
  g.translate(-1.3, 0, 0);
  return g;
}

export function tireGeo(): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(0.34, 0.13, 8, 18);
  g.rotateX(Math.PI / 2);
  return colorize(g, 0x1d1d1d);
}

export function sackGeo(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(0.8, 0.32, 0.5, 4, 2, 3);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 0.4;
    const z = p.getZ(i) / 0.25;
    p.setY(i, p.getY(i) * (1 - x * x * 0.4) * (1 - z * z * 0.3));
  }
  g.computeVertexNormals();
  return colorize(g, 0xcdbb8e);
}

/** The ubiquitous monobloc plastic chair. */
export function chairGeo(): THREE.BufferGeometry {
  const c = 0xe9e4da;
  const seat = colorize(new THREE.BoxGeometry(0.45, 0.05, 0.45), c);
  seat.translate(0, 0.42, 0);
  const back = colorize(new THREE.BoxGeometry(0.45, 0.45, 0.05), c);
  back.translate(0, 0.67, -0.21);
  const parts = [seat, back];
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const leg = colorize(new THREE.BoxGeometry(0.05, 0.42, 0.05), c);
    leg.translate(x, 0.21, z);
    parts.push(leg);
  }
  const g = merge(parts);
  g.translate(0, -0.3, 0);
  return g;
}

/** Small outrigger boat (bangka/sampan) drifting empty. */
export function bangkaGeo(): THREE.BufferGeometry {
  const hull = new THREE.BoxGeometry(4.2, 0.5, 0.9, 14, 2, 2);
  const p = hull.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const t = x / 2.1;
    let z = p.getZ(i) * (1 - t ** 4 * 0.9);
    if (y < 0) z *= 0.55;
    p.setXYZ(i, x, y + t * t * 0.3, z);
  }
  hull.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [colorize(hull, 0x7b4b2a)];
  for (const side of [-1, 1]) {
    const outrigger = colorize(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6), 0xc9b27a);
    outrigger.rotateZ(Math.PI / 2);
    outrigger.translate(0, -0.05, side * 1.7);
    parts.push(outrigger);
  }
  for (const x of [-0.9, 0.9]) {
    const beam = colorize(new THREE.BoxGeometry(0.08, 0.08, 3.5), 0xc9b27a);
    beam.translate(x, 0.3, 0);
    parts.push(beam);
  }
  const seat = colorize(new THREE.BoxGeometry(0.3, 0.05, 0.8), 0x9a6b40);
  seat.translate(0, 0.18, 0);
  parts.push(seat);
  return merge(parts);
}

export function rubberDuckGeo(): THREE.BufferGeometry {
  const yellow = 0xffd21f;
  const body = colorize(new THREE.SphereGeometry(0.5, 16, 12), yellow);
  body.scale(1.3, 0.75, 1);
  body.translate(0, 0.3, 0);
  const head = colorize(new THREE.SphereGeometry(0.3, 14, 10), yellow);
  head.translate(0.45, 0.85, 0);
  const beak = colorize(new THREE.ConeGeometry(0.12, 0.3, 10), 0xff7a1a);
  beak.rotateZ(-Math.PI / 2);
  beak.translate(0.82, 0.8, 0);
  const tail = colorize(new THREE.ConeGeometry(0.15, 0.35, 8), yellow);
  tail.rotateZ(0.9);
  tail.translate(-0.65, 0.5, 0);
  const parts = [body, head, beak, tail];
  for (const side of [-1, 1]) {
    const eye = colorize(new THREE.SphereGeometry(0.05, 6, 5), 0x111111);
    eye.translate(0.68, 0.95, side * 0.15);
    parts.push(eye);
  }
  return merge(parts);
}
