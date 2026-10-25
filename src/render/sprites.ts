import { ART, BREATH } from './art';
import { CHARMAP, PAL } from './palette';

export interface Sprite {
  w: number;
  h: number;
  /** Two idle frames, outlined. */
  frames: HTMLCanvasElement[];
  /** Same frames, mirrored. */
  flipped: HTMLCanvasElement[];
  /** White silhouette (for hit flash). */
  flash: HTMLCanvasElement;
  flashFlipped: HTMLCanvasElement;
  /** Opaque pixels of frame 0 (outline excluded) for the shatter effect. */
  pixels: { x: number; y: number; c: string }[];
}

const cache = new Map<string, Sprite>();

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function grid(rows: string[]): (number | -1)[][] {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const out: (number | -1)[] = [];
    for (let x = 0; x < w; x++) {
      const ch = r[x] ?? '.';
      out.push(ch === '.' || ch === ' ' ? -1 : CHARMAP[ch] ?? -1);
    }
    return out;
  });
}

function render(g: (number | -1)[][], outline: number | null, mode: 'color' | 'white' | 'black'): HTMLCanvasElement {
  const h = g.length;
  const w = g[0].length;
  const pad = outline === null ? 0 : 1;
  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const ctx = c.getContext('2d')!;
  const at = (x: number, y: number) => (y >= 0 && y < h && x >= 0 && x < w ? g[y][x] : -1);
  if (outline !== null) {
    ctx.fillStyle = mode === 'white' ? '#ffffff' : PAL[outline];
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (at(x, y) >= 0) continue;
        if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) {
          ctx.fillRect(x + pad, y + pad, 1, 1);
        }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[y][x];
      if (v < 0) continue;
      ctx.fillStyle = mode === 'white' ? '#ffffff' : mode === 'black' ? PAL[25] : PAL[v];
      ctx.fillRect(x + pad, y + pad, 1, 1);
    }
  }
  return c;
}

function flip(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

function breathe(g: (number | -1)[][], split: number): (number | -1)[][] {
  // Rows above `split` move up by one pixel; the last of them is duplicated.
  return [...g.slice(0, split), g[split - 1], ...g.slice(split)].map((r) => r.slice());
}

function withTopRow(g: (number | -1)[][]): (number | -1)[][] {
  return [new Array(g[0].length).fill(-1), ...g];
}

export function recolor(rows: string[], map: Record<string, string>): string[] {
  return rows.map((r) => r.split('').map((ch) => map[ch] ?? ch).join(''));
}

export function spriteFrom(name: string, rows: string[], opts: { outline?: number | null; split?: number } = {}): Sprite {
  const hit = cache.get(name);
  if (hit) return hit;
  const outline = opts.outline === undefined ? 25 : opts.outline;
  const g = grid(rows);
  const split = opts.split ?? BREATH[name];
  const g0 = split ? withTopRow(g) : g;
  const f0 = render(g0, outline, 'color');
  const f1 = split ? render(breathe(g, split), outline, 'color') : f0;
  const flash = render(g0, outline, 'white');
  const pixels: Sprite['pixels'] = [];
  for (let y = 0; y < g0.length; y++) {
    for (let x = 0; x < g0[0].length; x++) {
      const v = g0[y][x];
      if (v >= 0) pixels.push({ x: x + (outline === null ? 0 : 1), y: y + (outline === null ? 0 : 1), c: PAL[v] });
    }
  }
  const s: Sprite = {
    w: f0.width, h: f0.height, frames: [f0, f1], flipped: [flip(f0), flip(f1)], flash, flashFlipped: flip(flash), pixels,
  };
  cache.set(name, s);
  return s;
}

export function sprite(name: string): Sprite {
  const hit = cache.get(name);
  if (hit) return hit;
  const rows = ART[name];
  if (!rows) throw new Error(`no sprite ${name}`);
  return spriteFrom(name, rows);
}

/** Hot (primed) will-o-wisp. */
export function wispHot(): Sprite {
  return spriteFrom('ognikHot', recolor(ART.ognik, { c: 'o', b: 'y', w: 'Y' }), { split: 0 });
}
