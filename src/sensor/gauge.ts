/**
 * Staff gauge: the painted measuring board planted in the creek next to the
 * sensor, zeroed at the same datum. Used to verify the ultrasonic reading by eye.
 */
import * as THREE from 'three';
import { BED_Y, POLE_X, riverZ } from '../config';
import { canvasTexture } from '../util';
import { groundHeight } from '../scene/terrain';
import { tag } from './pole';

const HEIGHT_M = 6;

export function createStaffGauge(): { group: THREE.Group; position: THREE.Vector3 } {
  const x = POLE_X + 3;
  const z = riverZ(x) + 8.5;
  const tex = canvasTexture(96, 1536, (ctx) => {
    const pxPerCm = 1536 / (HEIGHT_M * 100);
    ctx.fillStyle = '#f8f8f2';
    ctx.fillRect(0, 0, 96, 1536);
    for (let cm = 0; cm < HEIGHT_M * 100; cm += 10) {
      // Classic "E" pattern: 5 cm bars alternating sides, red for odd metres, black for even.
      const y = 1536 - (cm + 5) * pxPerCm;
      ctx.fillStyle = Math.floor(cm / 100) % 2 ? '#c81e1e' : '#111';
      ctx.fillRect((cm / 10) % 2 ? 48 : 6, y, 42, 5 * pxPerCm);
      if (cm % 100 === 0 && cm > 0) {
        ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText(String(cm / 100), 56, 1536 - cm * pxPerCm + 12);
      }
    }
  });
  const group = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, HEIGHT_M, 0.03), [
    new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    new THREE.MeshStandardMaterial({ color: 0xdddddd }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0xdddddd }),
  ]);
  // The painted (+z) face looks toward the village bank, where people read it.
  board.position.set(x, BED_Y + HEIGHT_M / 2, z);
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, HEIGHT_M + 0.6, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x5b6168, metalness: 0.5, roughness: 0.5 }),
  );
  post.position.set(x, BED_Y + HEIGHT_M / 2 + 0.1, z - 0.07);
  board.castShadow = post.castShadow = true;
  tag('gauge', board, post);
  group.add(board, post);
  return { group, position: new THREE.Vector3(x, groundHeight(x, z), z) };
}
