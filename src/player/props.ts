/** Props the captain uses in the story game: the siren switch by the hall door and the office desk. */
import * as THREE from 'three';
import { HALL } from '../config';
import { walkHeight } from '../scene/walkable';
import { HALL_DOOR, HALL_PLAN } from '../scene/layout';

/** Wall-mounted manual siren switch beside the barangay hall door. */
export function createSirenButton(): { group: THREE.Group; position: THREE.Vector3; setOn(on: boolean, time: number): void } {
  const group = new THREE.Group();
  // On the front wall (faces −z), to the viewer's left of the door.
  const position = new THREE.Vector3(HALL.x + 2.4, HALL_PLAN.floorY + 1.3, HALL_DOOR.z - 0.08);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.12), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
  housing.position.copy(position);
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xc81e1e, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.35 });
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20), knobMat);
  knob.rotation.x = Math.PI / 2;
  knob.position.copy(position).add(new THREE.Vector3(0, 0.04, -0.09));
  const signTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#c81e1e';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SIRENA', 128, 43);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.1), new THREE.MeshBasicMaterial({ map: signTex }));
  sign.position.copy(position).add(new THREE.Vector3(0, -0.2, -0.065));
  sign.rotation.y = Math.PI;
  group.add(housing, knob, sign);
  return {
    group,
    position,
    setOn(on: boolean, time: number) {
      knobMat.emissiveIntensity = on ? (Math.sin(time * 12) > 0 ? 3 : 0.5) : 0;
    },
  };
}

/**
 * A stack of rolled sleeping mats in the hall, and the mats themselves laid out in rows
 * on the floor (hidden until the captain sets up the evacuation center).
 */
export function createMats(stackX: number, stackZ: number, floorY: number, area: { x: number; z: number; halfW: number; halfD: number }): { group: THREE.Group; position: THREE.Vector3; layOut(): void } {
  const group = new THREE.Group();
  const position = new THREE.Vector3(stackX, floorY, stackZ);
  const colours = [0xc8a96e, 0x9cb6c9, 0xc98f8f, 0xa9c48f];
  const stack = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 12), new THREE.MeshStandardMaterial({ color: colours[i % colours.length], roughness: 0.9 }));
    roll.rotation.z = Math.PI / 2;
    roll.position.set(stackX + (i % 2 ? 0.14 : -0.14), floorY + 0.13 + Math.floor(i / 2) * 0.24, stackZ);
    stack.add(roll);
  }
  const laid = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 0.02, 1.8), new THREE.MeshStandardMaterial({ roughness: 0.95 }), 18);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 6; col++) {
      const x = area.x - area.halfW + 0.6 + col * ((area.halfW * 2 - 1.2) / 5);
      const z = area.z - area.halfD + 0.9 + row * ((area.halfD * 2 - 1.8) / 2);
      laid.setMatrixAt(k, m.makeTranslation(x, floorY + 0.012, z));
      laid.setColorAt(k, new THREE.Color(colours[k % colours.length]));
      k++;
    }
  }
  laid.visible = false;
  laid.receiveShadow = true;
  group.add(stack, laid);
  return {
    group,
    position,
    layOut() {
      stack.visible = false;
      laid.visible = true;
    },
  };
}

/** The captain's desk with the operations laptop, at (x, z); the laptop faces whoever stands on the −z side. */
export function createOpsDesk(x: number, z: number): { group: THREE.Group; position: THREE.Vector3 } {
  const position = new THREE.Vector3(x, walkHeight(x, z), z);
  const group = new THREE.Group();
  group.position.copy(position);
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.7), new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }));
  top.position.y = 0.76;
  top.castShadow = true;
  group.add(top);
  for (const x of [-0.62, 0.62]) {
    for (const z of [-0.28, 0.28]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.74, 6), metal);
      leg.position.set(x, 0.37, z);
      group.add(leg);
    }
  }
  // Laptop: base on the table, lid open toward the user standing on the −z side.
  const shell = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.4, metalness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.018, 0.25), shell);
  base.position.set(0, 0.79, 0);
  const lid = new THREE.Group();
  lid.position.set(0, 0.8, 0.12);
  lid.rotation.x = 0.3;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.012), shell);
  back.position.y = 0.12;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.2), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc4d6e8, emissiveIntensity: 0.45 }));
  screen.position.set(0, 0.12, -0.007);
  screen.rotation.y = Math.PI;
  lid.add(back, screen);
  group.add(base, lid);
  return { group, position };
}
