import { hexToPx, insideHex, kq, kr, neighbors, step } from '../core/hex';
import type { GameState, TileType } from '../core/state';
import { PAL, hexToRgb } from './palette';
import { makeCanvas, sprite, type Sprite } from './sprites';

export const DEPTH = 6;

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Hex mask: 28x24 box, center at (14, 12).
const MASK: boolean[][] = [];
for (let y = 0; y < 24; y++) {
  MASK.push([]);
  for (let x = 0; x < 28; x++) MASK[y].push(insideHex(x + 0.5 - 14, y + 0.5 - 12));
}
const inMask = (x: number, y: number) => y >= 0 && y < 24 && x >= 0 && x < 28 && MASK[y][x];
const BOTTOM: number[] = [];
for (let x = 0; x < 28; x++) {
  let b = -1;
  for (let y = 0; y < 24; y++) if (MASK[y][x]) b = y;
  BOTTOM.push(b);
}

interface TileStyle {
  top: number[]; // base, dark, light
  edgeHi: number;
  edgeLo: number;
  side: number[]; // upper, lower, accent
  wall: string[];
  pool: number[]; // water / lava colors: deep, mid, light
  bank: number;
}

export const STYLES: TileStyle[] = [
  { top: [13, 14, 12], edgeHi: 12, edgeLo: 14, side: [4, 5, 6], wall: ['tree', 'tree', 'tree', 'rock'], pool: [16, 17, 18], bank: 6 },
  { top: [14, 15, 13], edgeHi: 13, edgeLo: 15, side: [5, 6, 15], wall: ['stump', 'rock', 'stump'], pool: [24, 16, 17], bank: 6 },
  { top: [23, 24, 22], edgeHi: 22, edgeLo: 24, side: [24, 25, 27], wall: ['grave', 'grave', 'rock'], pool: [16, 17, 18], bank: 25 },
];

function hash(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface WallDecor {
  k: number;
  sp: Sprite;
}

export class BoardRenderer {
  canvas: HTMLCanvasElement = makeCanvas(1, 1);
  /** Board-relative position of canvas (0,0). */
  bx = 0;
  by = 0;
  walls: WallDecor[] = [];
  biome = 0;
  pools: { k: number; t: TileType; v: number }[] = [];
  stairs = -1;

  build(s: GameState, biome: number): void {
    this.biome = biome;
    const st = STYLES[biome];
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const k of s.tiles.keys()) {
      const p = hexToPx(k);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    this.bx = minX - 14 - 2;
    this.by = minY - 12 - 2;
    const W = maxX - minX + 28 + 4;
    const H = maxY - minY + 24 + DEPTH + 6;
    this.canvas = makeCanvas(W, H);
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const rgb = PAL.map(hexToRgb);
    const put = (x: number, y: number, c: number, a = 255) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      img.data[i] = rgb[c][0];
      img.data[i + 1] = rgb[c][1];
      img.data[i + 2] = rgb[c][2];
      img.data[i + 3] = a;
    };
    const order = [...s.tiles.entries()].sort((a, b) => hexToPx(a[0]).y - hexToPx(b[0]).y || hexToPx(a[0]).x - hexToPx(b[0]).x);
    this.walls = [];
    this.pools = [];
    this.stairs = s.stairs;
    for (const [k, t] of order) {
      if (t.t === 'abyss') continue;
      const p = hexToPx(k);
      const x0 = p.x - 14 - this.bx;
      const y0 = p.y - 12 - this.by;
      const sunk = t.t === 'water' || t.t === 'lava';
      // Side faces (covered later by tiles in front).
      if (!sunk) {
        for (let x = 0; x < 28; x++) {
          const b = BOTTOM[x];
          if (b < 0) continue;
          for (let d = 1; d <= DEPTH; d++) {
            const n = hash(k, x, d);
            let c = d <= 2 ? st.side[0] : st.side[1];
            if (n < 0.12) c = st.side[2];
            if (d === DEPTH && n < 0.5) continue;
            put(x0 + x, y0 + b + d, c);
          }
        }
      }
      // Top surface.
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 28; x++) {
          if (!MASK[y][x]) continue;
          if (sunk) {
            put(x0 + x, y0 + y, y < 4 ? st.bank : t.t === 'lava' ? 7 : st.pool[0]);
            continue;
          }
          const n = hash(k * 7 + t.v, x, y);
          let c = st.top[0];
          const n2 = hash(k * 13 + t.v, x >> 1, y >> 1);
          if (n < 0.07 || (n2 < 0.12 && n < 0.5)) c = st.top[1];
          else if (n > 0.97) c = st.top[2];
          const up = !inMask(x, y - 1);
          const left = !inMask(x - 1, y);
          const down = !inMask(x, y + 1);
          const right = !inMask(x + 1, y);
          if (down || (right && y > 11)) c = st.edgeLo;
          else if (up || (left && y < 12)) c = st.edgeHi;
          put(x0 + x, y0 + y, c);
        }
      }
      if (sunk) {
        this.pools.push({ k, t: t.t, v: t.v });
        continue;
      }
      // Floor decorations.
      const r = hash(k, t.v, 99);
      const dx = x0 + 8 + Math.floor(hash(k, 1, 2) * 12);
      const dy = y0 + 7 + Math.floor(hash(k, 3, 4) * 9);
      if (biome === 0) {
        if (r < 0.55) {
          put(dx, dy, 12); put(dx, dy - 1, 12); put(dx + 2, dy, 12); put(dx + 1, dy - 2, 12); put(dx + 2, dy - 1, 13);
        }
        if (r > 0.8) put(dx + 5, dy + 3, [11, 29, 19][Math.floor(r * 30) % 3]);
        if (r > 0.9) put(dx - 4, dy + 1, 11);
      } else if (biome === 1) {
        if (r < 0.4) { put(dx, dy, 13); put(dx, dy - 1, 13); put(dx, dy - 2, 13); put(dx, dy - 3, 4); put(dx + 2, dy, 13); put(dx + 2, dy - 1, 13); }
        else if (r < 0.6) { put(dx, dy, 15); put(dx + 1, dy, 15); put(dx + 2, dy, 15); put(dx + 1, dy + 1, 15); }
        if (r > 0.85) put(dx + 4, dy + 2, 28);
      } else {
        if (r < 0.45) { put(dx, dy, 25); put(dx + 1, dy + 1, 25); put(dx + 2, dy + 1, 25); put(dx + 3, dy + 2, 25); }
        else if (r < 0.6) { put(dx, dy, 20); put(dx + 1, dy, 20); put(dx + 2, dy, 20); put(dx + 1, dy - 1, 20); }
        if (r > 0.82) { put(dx + 4, dy, 27); put(dx + 5, dy, 28); }
      }
      if (t.t === 'wall') {
        const names = st.wall;
        this.walls.push({ k, sp: sprite(names[Math.floor(hash(k, t.v, 5) * names.length)]) });
      }
      if (t.t === 'stairs') {
        // A dark pit with steps leading down.
        for (let y = 5; y < 20; y++) {
          for (let x = 5; x < 23; x++) {
            const ex = (x + 0.5 - 14) / 8.5;
            const ey = (y + 0.5 - 12.5) / 6.5;
            if (ex * ex + ey * ey > 1) continue;
            const depth = y - 6;
            put(x0 + x, y0 + y, depth < 3 ? 22 : depth < 6 ? 23 : depth < 9 ? 24 : 25);
          }
        }
        for (let i = 0; i < 4; i++) for (let x = 9 + i; x < 19 - i; x++) put(x0 + x, y0 + 9 + i * 2, 21);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Static board plus animated pools, fire and stairs glow. */
  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number, time: number, fire: Map<number, number>): void {
    ctx.drawImage(this.canvas, Math.round(ox + this.bx), Math.round(oy + this.by));
    const st = STYLES[this.biome];
    for (const pl of this.pools) {
      const p = hexToPx(pl.k);
      const x0 = Math.round(ox + p.x - 14);
      const y0 = Math.round(oy + p.y - 12);
      const lava = pl.t === 'lava';
      // Shimmer lines.
      for (let i = 0; i < 5; i++) {
        const ph = (time * (lava ? 0.6 : 0.9) + hash(pl.k, i, 1) * 10) % 1;
        const lx = 4 + Math.floor(hash(pl.k, i, 2) * 18);
        const ly = 6 + Math.floor(hash(pl.k, i, 3) * 15);
        if (!inMask(lx, ly) || !inMask(lx + 3, ly)) continue;
        const len = Math.round(Math.sin(ph * Math.PI) * 4);
        ctx.fillStyle = PAL[lava ? (ph < 0.5 ? 9 : 10) : ph < 0.5 ? st.pool[1] : st.pool[2]];
        ctx.fillRect(x0 + lx, y0 + ly, len, 1);
      }
      if (lava) {
        const b = (time * 1.3 + hash(pl.k, 9, 9) * 3) % 1;
        if (b < 0.25) {
          ctx.fillStyle = PAL[11];
          const bx = 8 + Math.floor(hash(pl.k, Math.floor(time * 1.3), 4) * 12);
          ctx.fillRect(x0 + bx, y0 + 12 - Math.round(b * 8), 2, 2);
        }
      }
    }
    // Fire on tiles.
    for (const [k, n] of fire) {
      if (n <= 0) continue;
      const p = hexToPx(k);
      const x0 = Math.round(ox + p.x);
      const y0 = Math.round(oy + p.y);
      for (let i = 0; i < 5; i++) {
        const fx = x0 - 7 + i * 3;
        const fh = 4 + Math.round(Math.abs(Math.sin(time * 9 + i * 1.9 + k)) * 6);
        ctx.fillStyle = PAL[8];
        ctx.fillRect(fx, y0 + 3 - fh, 2, fh);
        ctx.fillStyle = PAL[9];
        ctx.fillRect(fx, y0 + 3 - Math.round(fh * 0.7), 2, Math.round(fh * 0.7));
        ctx.fillStyle = PAL[11];
        ctx.fillRect(fx, y0 + 3 - Math.round(fh * 0.3), 1, Math.round(fh * 0.3));
      }
    }
    if (this.stairs >= 0) {
      const p = hexToPx(this.stairs);
      const x0 = Math.round(ox + p.x);
      const y0 = Math.round(oy + p.y);
      // Soft dithered light shaft rising from the pit.
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      for (let y = 0; y < 40; y++) {
        const fade = 1 - y / 40;
        const half = Math.round(6 - y * 0.06);
        for (let x = -half; x <= half; x++) {
          const edge = 1 - Math.abs(x) / (half + 1);
          const v = fade * edge * (0.55 + 0.3 * pulse);
          if (v * 16 > BAYER4[(y0 - y) & 3][(x0 + x) & 3] + 4) {
            ctx.fillStyle = v > 0.55 ? PAL[11] : PAL[10];
            ctx.fillRect(x0 + x, y0 + 2 - y, 1, 1);
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        const ph = (time * 0.6 + i / 4) % 1;
        ctx.fillStyle = PAL[19];
        ctx.fillRect(x0 - 4 + i * 3, Math.round(y0 - ph * 36), 1, 1);
      }
    }
  }
}

/** Cached hex-shaped fills/outlines for overlays. */
const hexCache = new Map<string, HTMLCanvasElement>();
export function hexShape(color: number, mode: 'fill' | 'line' | 'hatch' | 'dots', alpha = 1): HTMLCanvasElement {
  const key = `${color}|${mode}|${alpha}`;
  const hit = hexCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(28, 24);
  const ctx = c.getContext('2d')!;
  const [r, g, b] = hexToRgb(PAL[color]);
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 28; x++) {
      if (!MASK[y][x]) continue;
      const edge = !inMask(x - 1, y) || !inMask(x + 1, y) || !inMask(x, y - 1) || !inMask(x, y + 1);
      const inner = !inMask(x - 2, y) || !inMask(x + 2, y) || !inMask(x, y - 2) || !inMask(x, y + 2);
      if (mode === 'fill' || (mode === 'line' && edge) || (mode === 'hatch' && (edge || (x + y) % 4 === 0))
        || (mode === 'dots' && (inner && !edge ? false : edge ? (x + y) % 3 === 0 : false))) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  hexCache.set(key, c);
  return c;
}

export function drawHex(ctx: CanvasRenderingContext2D, k: number, ox: number, oy: number, img: HTMLCanvasElement, dy = 0): void {
  const p = hexToPx(k);
  ctx.drawImage(img, Math.round(ox + p.x - 14), Math.round(oy + p.y - 12 + dy));
}

/** Which board hex contains board-relative point (x, y)? */
export function pickHex(s: GameState, x: number, y: number): number {
  for (const k of s.tiles.keys()) {
    const p = hexToPx(k);
    if (insideHex(x - p.x, y - p.y)) return k;
  }
  // Also allow picking empty hexes (off-board) for completeness.
  const q = Math.round(x / 22);
  for (let dq = -1; dq <= 1; dq++) {
    for (let dr = -2; dr <= 2; dr++) {
      const qq = q + dq;
      const rr = Math.round((y - qq * 12) / 24) + dr;
      const k = (qq + 32) * 128 + (rr + 32);
      const p = hexToPx(k);
      if (insideHex(x - p.x, y - p.y)) return k;
    }
  }
  return -1;
}

export { kq, kr, neighbors, step };
