import { PAL } from './palette';

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = 23, alpha = 0.9): void {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = `rgba(24,20,37,${alpha})`;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = PAL[accent];
  ctx.fillRect(x + 2, y, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4);
  ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1);
  ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
}

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: number, back = 24): void {
  ctx.fillStyle = PAL[25];
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = PAL[back];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAL[color];
  ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), 1);
}

/** Pixel dissolve transition: covers the screen with progress 0..1. */
export function dissolve(ctx: CanvasRenderingContext2D, w: number, h: number, k: number): void {
  if (k <= 0) return;
  ctx.fillStyle = PAL[25];
  if (k >= 1) {
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cell = 4;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const t = B[((y / cell) % 4) * 4 + ((x / cell) % 4)] / 16;
      if (t < k) ctx.fillRect(x, y, cell, cell);
    }
  }
}
