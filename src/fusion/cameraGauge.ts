/**
 * A second, independent level estimate: a small camera on the village bank
 * watching the staff gauge, as some LGUs install beside their sensors.
 *
 * With every sensor reading it renders the gauge and the creek into a tiny 24×256 image,
 * from its own point of view, lit only by its own infrared lamp (so it works
 * the same day and night). It then finds the waterline in the pixels: rows of
 * painted board have bright white background, rows below the surface are
 * darkened by the water. The waterline row is projected back onto the board
 * to give a level. No scene state is read except the picture itself.
 */
import * as THREE from 'three';
import { BED_Y, LEVEL } from '../config';
import { groundHeight } from '../scene/terrain';

const W = 24;
const H = 256;
/** Camera layer only this camera, the board, the water and its lamp share. */
const LAYER = 7;
/** Rows whose white-pixel share drops below this are no longer clear board. */
const WHITE_SHARE = 0.25;
/** Linear luminance a white board pixel must exceed under the lamp. */
const WHITE_LUMA = 0.45;
const BOARD_TOP_M = 6;
/** Waves slap the board, so report the median of this many frames (as real gauge cameras do). */
const MEDIAN_OF = 3;
/** Water shallower than this at the gauge's foot can't be read (m). Measured in this scene. */
const MIN_DEPTH = 0.35;

export interface CameraReading {
  /**
   * m above datum, or null when the waterline can't be found (lens blocked, glare).
   * When `low`, the water is below what the camera can read (the foot of the gauge,
   * or water too shallow there to darken the board) and this is that limit: an upper bound.
   */
  level: number | null;
  low: boolean;
  /** 0..1: how cleanly the board above the waterline was seen. */
  confidence: number;
  /** Row of the detected waterline in the image (0 = top), for drawing. */
  row: number | null;
}

export class CameraGauge {
  readonly camera: THREE.PerspectiveCamera;
  /** Small prop on the bank so the camera exists in the world. */
  readonly prop = new THREE.Group();
  latest: CameraReading = { level: null, low: false, confidence: 0, row: null };
  /** Set by the fault injector: something covers the lens. */
  blocked = false;
  private readonly target = new THREE.WebGLRenderTarget(W, H);
  private readonly pixels = new Uint8Array(W * H * 4);
  private readonly boardZ: number;
  private readonly cols: [number, number];
  private readonly rowHeight: number[] = [];
  /**
   * Lowest level the camera can read (m above datum): a little above the gauge's foot, because
   * the last few centimetres of water at the bank are too shallow and clear to darken the board.
   */
  private readonly floor: number;
  private readonly recent: number[] = [];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    board: THREE.Object3D,
    water: THREE.Object3D,
  ) {
    const box = new THREE.Box3().setFromObject(board);
    const centre = box.getCenter(new THREE.Vector3());
    this.boardZ = box.max.z;
    this.floor = groundHeight(centre.x, this.boardZ) - BED_Y + MIN_DEPTH;
    // Mounted above the worst flood, 5 m back on the bank, looking down at the whole board.
    const at = new THREE.Vector3(centre.x, BED_Y + LEVEL.max + 1.5, this.boardZ + 5);
    const look = new THREE.Vector3(centre.x, BED_Y + 3, this.boardZ);
    this.camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 30);
    this.camera.position.copy(at);
    this.camera.lookAt(look);
    this.camera.layers.set(LAYER);
    this.camera.updateMatrixWorld();
    board.traverse((o) => o.layers.enable(LAYER));
    water.layers.enable(LAYER);
    const lamp = new THREE.PointLight(0xffffff, 90, 16, 1.5);
    lamp.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
    lamp.layers.set(LAYER);
    scene.add(lamp);

    // Board edges in the image (columns) and the height each image row looks at on the board.
    const toCol = (x: number) => Math.round(((new THREE.Vector3(x, centre.y, this.boardZ).project(this.camera).x + 1) / 2) * W);
    this.cols = [Math.max(0, toCol(box.min.x) + 1), Math.min(W, toCol(box.max.x) - 1)];
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.boardZ);
    const hit = new THREE.Vector3();
    for (let r = 0; r < H; r++) {
      ray.setFromCamera(new THREE.Vector2(0, 1 - ((r + 0.5) / H) * 2), this.camera);
      this.rowHeight.push(ray.ray.intersectPlane(plane, hit) ? hit.y : NaN);
    }

    // The camera housing on a short post on the bank.
    const metal = new THREE.MeshStandardMaterial({ color: 0x4a525a, metalness: 0.5, roughness: 0.5 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, at.y - BED_Y, 8), metal);
    post.position.set(at.x, (at.y + BED_Y) / 2 - 0.15, at.z + 0.15);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.4 }));
    housing.position.copy(at);
    housing.lookAt(look);
    this.prop.add(post, housing);
  }

  /** Grab a frame and look for the waterline. */
  capture(): CameraReading {
    if (this.blocked) {
      this.latest = { level: null, low: false, confidence: 0, row: null };
      return this.latest;
    }
    const { renderer } = this;
    const prevTarget = renderer.getRenderTarget();
    const prevShadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // the main view's shadow map is fine as it is
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.readRenderTargetPixels(this.target, 0, 0, W, H, this.pixels);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevShadows;
    const frame = this.detect();
    if (frame.level === null || frame.low) this.recent.length = 0;
    else {
      this.recent.push(frame.level);
      if (this.recent.length > MEDIAN_OF) this.recent.shift();
      frame.level = [...this.recent].sort((a, b) => a - b)[Math.floor(this.recent.length / 2)];
    }
    this.latest = frame;
    return this.latest;
  }

  /** White-pixel share across the board columns of image row r (0 = top). */
  private whiteShare(r: number): number {
    const y = H - 1 - r; // readPixels rows run bottom-up
    let white = 0;
    for (let c = this.cols[0]; c < this.cols[1]; c++) {
      const i = (y * W + c) * 4;
      const luma = (0.2126 * this.pixels[i] + 0.7152 * this.pixels[i + 1] + 0.0722 * this.pixels[i + 2]) / 255;
      if (luma > WHITE_LUMA) white++;
    }
    return white / Math.max(1, this.cols[1] - this.cols[0]);
  }

  private detect(): CameraReading {
    // Scan down from the top of the board; the waterline is where white board stops for good
    // (three dull rows in a row, so a painted numeral doesn't count).
    const top = this.rowHeight.findIndex((h) => h <= BED_Y + BOARD_TOP_M - 0.05);
    let seen = 0;
    let dull = 0;
    let sum = 0;
    for (let r = Math.max(0, top); r < H; r++) {
      const share = this.whiteShare(r);
      if (share >= WHITE_SHARE) {
        dull = 0;
        seen++;
        sum += share;
        continue;
      }
      if (++dull < 3) continue;
      const row = r - 2;
      if (seen < 3) return { level: null, low: false, confidence: 0, row: null };
      const level = this.rowHeight[row] - BED_Y;
      const confidence = Math.min(1, sum / seen / 0.6);
      // Below what the camera can read: say so, as an upper bound, rather than guess.
      if (level <= this.floor) return { level: this.floor, low: true, confidence, row };
      return { level, low: false, confidence, row };
    }
    return { level: null, low: false, confidence: 0, row: null };
  }

  /** The last frame, scaled into a canvas, with the waterline marked. */
  draw(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    for (let r = 0; r < H; r++) {
      const src = (H - 1 - r) * W * 4;
      img.data.set(this.pixels.subarray(src, src + W * 4), r * W * 4);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    if (this.blocked) {
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const row = this.latest.row;
    if (row !== null) {
      const y = ((row + 0.5) / H) * canvas.height;
      ctx.strokeStyle = '#ffc83d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }
}
