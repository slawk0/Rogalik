import { PAL } from './palette';
import { makeCanvas } from './sprites';

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Vertical gradient through palette stops with ordered dithering. */
function gradient(ctx: CanvasRenderingContext2D, w: number, h: number, stops: number[]): void {
  const n = stops.length - 1;
  for (let y = 0; y < h; y++) {
    const t = (y / h) * n;
    const i = Math.min(n - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < w; x++) {
      const c = f * 16 > BAYER[y % 4][x % 4] ? stops[i + 1] : stops[i];
      ctx.fillStyle = PAL[c];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function pines(ctx: CanvasRenderingContext2D, w: number, base: number, color: number, scale: number, seed: number): void {
  ctx.fillStyle = PAL[color];
  let x = -10;
  let i = 0;
  while (x < w + 10) {
    const hgt = Math.round((22 + hash(seed, i) * 26) * scale);
    const half = Math.round((6 + hash(seed + 1, i) * 4) * scale);
    for (let y = 0; y < hgt; y++) {
      const wy = Math.round((y / hgt) * half) + (y % 4 === 3 ? 1 : 0);
      ctx.fillRect(x - wy, base - hgt + y, wy * 2 + 1, 1);
    }
    ctx.fillRect(x - Math.round(half * 1.2), base, Math.round(half * 2.4), 400);
    x += Math.round((7 + hash(seed + 2, i) * 10) * scale);
    i++;
  }
}

function spires(ctx: CanvasRenderingContext2D, w: number, base: number, color: number, seed: number): void {
  ctx.fillStyle = PAL[color];
  let x = 0;
  let i = 0;
  while (x < w) {
    const hgt = 20 + Math.round(hash(seed, i) * 60);
    const wid = 6 + Math.round(hash(seed + 3, i) * 10);
    for (let y = 0; y < hgt; y++) {
      const ww = Math.max(1, Math.round((y / hgt) * wid));
      ctx.fillRect(x - ww, base - hgt + y, ww * 2, 1);
    }
    ctx.fillRect(x - wid - 4, base, wid * 2 + 8, 400);
    x += 14 + Math.round(hash(seed + 5, i) * 30);
    i++;
  }
}

const cache = new Map<string, HTMLCanvasElement>();

export function backgroundCanvas(w: number, h: number, biome: number): HTMLCanvasElement {
  const key = `${w}x${h}:${biome}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  if (biome === 0) {
    gradient(ctx, w, h, [25, 24, 24, 15, 15]);
    for (let i = 0; i < w * h * 0.0015; i++) {
      ctx.fillStyle = PAL[hash(i, 1) < 0.2 ? 11 : 20];
      ctx.fillRect(Math.floor(hash(i, 2) * w), Math.floor(hash(i, 3) * h * 0.5), 1, 1);
    }
    pines(ctx, w, Math.round(h * 0.62), 24, 1.6, 11);
    pines(ctx, w, Math.round(h * 0.78), 15, 1.2, 23);
    pines(ctx, w, Math.round(h * 0.95), 25, 1.0, 37);
  } else if (biome === 1) {
    gradient(ctx, w, h, [25, 24, 23, 22, 15]);
    // Moon with halo.
    const mx = Math.round(w * 0.78);
    const my = Math.round(h * 0.2);
    for (let r = 26; r >= 0; r--) {
      const col = r > 18 ? 23 : r > 12 ? 22 : r > 11 ? 21 : r > 9 ? 20 : 19;
      if (r > 12 && (r % 2 === 1)) continue;
      ctx.fillStyle = PAL[col];
      for (let a = 0; a < Math.PI * 2; a += 0.5 / Math.max(r, 1)) ctx.fillRect(Math.round(mx + Math.cos(a) * r), Math.round(my + Math.sin(a) * r), 1, 1);
    }
    ctx.fillStyle = PAL[20];
    ctx.fillRect(mx - 3, my - 2, 2, 2);
    ctx.fillRect(mx + 2, my + 3, 3, 2);
    // Dead trees & reeds.
    ctx.fillStyle = PAL[24];
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(hash(i, 7) * w);
      const base = Math.round(h * (0.7 + hash(i, 8) * 0.2));
      const hgt = 30 + Math.floor(hash(i, 9) * 40);
      ctx.fillRect(x, base - hgt, 2, hgt);
      ctx.fillRect(x - 6, base - hgt + 10, 7, 1);
      ctx.fillRect(x + 2, base - hgt + 18, 6, 1);
      ctx.fillRect(x - 6, base - hgt + 8, 1, 2);
      ctx.fillRect(x + 7, base - hgt + 15, 1, 3);
    }
    gradientBand(ctx, w, Math.round(h * 0.8), h, 15);
  } else {
    gradient(ctx, w, h, [25, 25, 27, 24, 25]);
    for (let i = 0; i < w * h * 0.001; i++) {
      ctx.fillStyle = PAL[hash(i, 4) < 0.5 ? 28 : 18];
      ctx.fillRect(Math.floor(hash(i, 5) * w), Math.floor(hash(i, 6) * h), 1, 1);
    }
    spires(ctx, w, Math.round(h * 0.7), 24, 3);
    spires(ctx, w, Math.round(h * 0.9), 25, 9);
  }
  if (cache.size > 12) cache.clear();
  cache.set(key, c);
  return c;
}

function gradientBand(ctx: CanvasRenderingContext2D, w: number, y0: number, y1: number, col: number): void {
  for (let y = y0; y < y1; y++) {
    const f = (y - y0) / (y1 - y0);
    for (let x = 0; x < w; x++) {
      if (f * 16 > BAYER[y % 4][x % 4]) {
        ctx.fillStyle = PAL[col];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** Animated ambient layer: fireflies, fog, souls. */
export function drawAmbient(ctx: CanvasRenderingContext2D, w: number, h: number, biome: number, time: number): void {
  if (biome === 0) {
    for (let i = 0; i < 24; i++) {
      const x = (hash(i, 11) * w + Math.sin(time * 0.3 + i) * 30 + time * 4 * (hash(i, 12) - 0.5)) % w;
      const y = h * 0.3 + hash(i, 13) * h * 0.65 + Math.sin(time * 0.7 + i * 2) * 10;
      const on = Math.sin(time * 2 + i * 3.1) > 0.2;
      if (!on) continue;
      ctx.fillStyle = PAL[hash(i, 14) < 0.5 ? 11 : 12];
      ctx.fillRect(Math.round((x + w) % w), Math.round(y), 1, 1);
    }
  } else if (biome === 1) {
    ctx.fillStyle = 'rgba(192,203,220,0.06)';
    for (let i = 0; i < 6; i++) {
      const y = Math.round(h * (0.35 + i * 0.11) + Math.sin(time * 0.4 + i) * 4);
      const off = ((time * (6 + i * 2)) % (w + 200)) - 200;
      for (let j = 0; j < 4; j++) ctx.fillRect(Math.round(off + j * (w / 3) - (i % 2) * 90) % (w + 200) - 100, y, 160, 6 + (i % 3) * 3);
    }
    for (let i = 0; i < 10; i++) {
      const on = Math.sin(time * 1.5 + i * 2.3) > 0.6;
      if (!on) continue;
      ctx.fillStyle = PAL[18];
      ctx.fillRect(Math.floor(hash(i, 31) * w), Math.floor(h * 0.5 + hash(i, 32) * h * 0.45), 1, 1);
    }
  } else {
    for (let i = 0; i < 30; i++) {
      const speed = 6 + hash(i, 21) * 10;
      const y = h - ((time * speed + hash(i, 22) * h) % (h + 20));
      const x = hash(i, 23) * w + Math.sin(time + i) * 6;
      ctx.fillStyle = PAL[hash(i, 24) < 0.6 ? 18 : 28];
      ctx.fillRect(Math.round(x), Math.round(y), 1, hash(i, 25) < 0.3 ? 2 : 1);
    }
  }
}
