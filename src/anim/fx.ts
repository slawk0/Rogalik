import { PAL } from '../render/palette';

export interface Particle {
  x: number;
  y: number; // ground position
  z: number; // height above ground
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  bounce: number;
  drag: number;
  /** Stays on the ground after landing instead of sliding. */
  settle: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: number;
  t: number;
  max: number;
  big: boolean;
}

export class Fx {
  parts: Particle[] = [];
  texts: FloatText[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): void {
    this.parts.push({
      z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0.6, color: PAL[19], size: 1, grav: 220, bounce: 0.35, drag: 0.9, settle: true,
      ...p,
    });
  }

  burst(x: number, y: number, z: number, n: number, colors: number[], speed = 50, up = 60, life = 0.7, size = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.add({
        x, y, z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.55,
        vz: up * (0.4 + Math.random() * 0.8),
        max: life * (0.6 + Math.random() * 0.6),
        color: PAL[colors[Math.floor(Math.random() * colors.length)]],
        size,
      });
    }
  }

  /** Rising particles that ignore gravity (flames, souls, sparks). */
  rise(x: number, y: number, z: number, n: number, colors: number[], spread = 6, speed = 30, life = 0.6): void {
    for (let i = 0; i < n; i++) {
      this.add({
        x: x + (Math.random() - 0.5) * spread * 2,
        y: y + (Math.random() - 0.5) * spread,
        z: z + Math.random() * 4,
        vx: (Math.random() - 0.5) * 8,
        vy: 0,
        vz: speed * (0.5 + Math.random()),
        grav: -10,
        bounce: 0,
        drag: 0.98,
        max: life * (0.5 + Math.random() * 0.8),
        color: PAL[colors[Math.floor(Math.random() * colors.length)]],
        settle: false,
      });
    }
  }

  text(x: number, y: number, text: string, color: number, big = false, max = 0.9): void {
    this.texts.push({ x, y, text, color, t: 0, max, big });
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.life += dt;
      p.vz -= p.grav * dt;
      p.z += p.vz * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.pow(p.drag, dt * 60);
      p.vx *= k;
      p.vy *= k;
      if (p.z < 0 && p.grav > 0) {
        p.z = 0;
        if (Math.abs(p.vz) > 25) {
          p.vz = -p.vz * p.bounce;
          p.vx *= 0.6;
          p.vy *= 0.6;
        } else {
          p.vz = 0;
          if (p.settle) {
            p.vx *= 0.5;
            p.vy *= 0.5;
          }
        }
      }
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.max);
  }

  drawParts(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const p of this.parts) {
      const fade = 1 - p.life / p.max;
      if (fade < 0.25 && Math.floor(p.life * 30) % 2 === 0) continue; // blink out
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y - p.z), p.size, p.size);
    }
  }
}

/** Plots a pixel ellipse outline. */
export function pixelEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, thick = 1): void {
  ctx.fillStyle = color;
  const n = Math.max(12, Math.ceil(rx * 4));
  let lx = NaN;
  let ly = NaN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    if (x === lx && y === ly) continue;
    lx = x;
    ly = y;
    ctx.fillRect(x, y, thick, thick);
  }
}

/** Pixel line (Bresenham). */
export function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, size = 1): void {
  ctx.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 2000; i++) {
    ctx.fillRect(x0, y0, size, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
