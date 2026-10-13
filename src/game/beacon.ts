/** Waypoint for the current objective: a soft light column you can see across the village, with a name and distance tag. */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const HEIGHT = 14;

export class Beacon {
  readonly group = new THREE.Group();
  private readonly column: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly tag: CSS2DObject;

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, HEIGHT, 16, 1, true).translate(0, HEIGHT / 2, 0), mat);
    this.column.userData.noAO = true;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.7, depthWrite: false }));
    this.ring.position.y = 0.05;
    this.ring.userData.noAO = true;
    const el = document.createElement('div');
    el.className = 'waypoint';
    this.tag = new CSS2DObject(el);
    this.tag.position.y = 2.6;
    this.group.add(this.column, this.ring, this.tag);
    this.group.visible = false;
  }

  /** Point at `target` (feet level) or hide with null. */
  update(target: THREE.Vector3 | null, label: string, from: THREE.Vector3, t: number): void {
    this.group.visible = !!target;
    if (!target) return;
    this.group.position.copy(target);
    const d = Math.hypot(target.x - from.x, target.z - from.z);
    // Fade the column out as you arrive so it doesn't fill the screen.
    (this.column.material as THREE.MeshBasicMaterial).opacity = Math.min(0.22, d / 60);
    this.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
    this.tag.element.textContent = d > 4 ? `${label} · ${Math.round(d)} m` : label;
  }
}
