/** Konami-code surprise: a rubber duck armada in V formation sails down the river. */
import * as THREE from 'three';
import { riverZ } from '../config';
import { rubberDuckGeo } from '../scene/geo';
import { waveHeight } from '../water/water';

interface Duck {
  mesh: THREE.Mesh;
  offset: THREE.Vector2;
  phase: number;
}

const START_X = -100;
const END_X = 130;
const SPEED = 3.2;

export class DuckArmada {
  readonly group = new THREE.Group();
  private readonly geo = rubberDuckGeo();
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25 });
  private ducks: Duck[] = [];
  private fleetX = START_X;

  get active(): boolean {
    return this.ducks.length > 0;
  }

  launch(): void {
    if (this.active) return;
    this.fleetX = START_X;
    const add = (x: number, z: number, scale: number) => {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.scale.setScalar(scale);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.ducks.push({ mesh, offset: new THREE.Vector2(x, z), phase: Math.random() * 6 });
    };
    add(0, 0, 2); // flagship
    for (let i = 1; i <= 7; i++) for (const s of [-1, 1]) add(-i * 1.8, s * i * 0.8, 0.8);
    for (let i = 0; i < 10; i++) add(-16 - (i % 5) * 1.6, ((i < 5 ? -1 : 1) * (1 + (i % 5))) * 0.9, 0.7);
  }

  update(dt: number, levelY: number, waveT: number, chop: number): void {
    if (!this.active) return;
    this.fleetX += SPEED * dt;
    for (const d of this.ducks) {
      d.phase += dt;
      const x = this.fleetX + d.offset.x;
      const z = riverZ(x) + d.offset.y;
      d.mesh.position.set(x, levelY + waveHeight(x, z, waveT, chop) - 0.05 + Math.sin(d.phase * 3) * 0.03, z);
      d.mesh.rotation.set(Math.sin(d.phase * 2) * 0.06, -Math.atan(0.105 * Math.cos(x * 0.035)), Math.sin(d.phase * 2.6) * 0.08);
    }
    if (this.fleetX > END_X) {
      for (const d of this.ducks) this.group.remove(d.mesh);
      this.ducks = [];
    }
  }
}
