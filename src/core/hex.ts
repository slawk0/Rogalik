// Flat-top hex grid, axial coordinates (q, r).
// Direction order: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW.
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0],
];

export const OFF = 32;
export const STRIDE = 128;

/** Packs a hex into a single number, so it can be used as a Map key. */
export function key(q: number, r: number): number {
  return (q + OFF) * STRIDE + (r + OFF);
}
export function kq(k: number): number {
  return Math.floor(k / STRIDE) - OFF;
}
export function kr(k: number): number {
  return (k % STRIDE) - OFF;
}

export function step(k: number, dir: number, n = 1): number {
  const d = DIRS[((dir % 6) + 6) % 6];
  return key(kq(k) + d[0] * n, kr(k) + d[1] * n);
}

export function neighbors(k: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < 6; d++) out.push(step(k, d));
  return out;
}

export function dist(a: number, b: number): number {
  const dq = kq(a) - kq(b);
  const dr = kr(a) - kr(b);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function isAdjacent(a: number, b: number): boolean {
  return dist(a, b) === 1;
}

/** Direction from a to b when they lie on one straight line, otherwise -1. */
export function lineDir(a: number, b: number): number {
  const dq = kq(b) - kq(a);
  const dr = kr(b) - kr(a);
  if (dq === 0 && dr === 0) return -1;
  const n = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  if (!(dq === 0 || dr === 0 || dq === -dr)) return -1;
  const uq = dq / n;
  const ur = dr / n;
  for (let d = 0; d < 6; d++) if (DIRS[d][0] === uq && DIRS[d][1] === ur) return d;
  return -1;
}

/** Direction to an adjacent hex, or -1. */
export function dirTo(a: number, b: number): number {
  for (let d = 0; d < 6; d++) if (step(a, d) === b) return d;
  return -1;
}

export function ringKeys(center: number, radius: number): number[] {
  if (radius === 0) return [center];
  const out: number[] = [];
  let k = step(center, 4, radius); // start SW * radius
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < radius; i++) {
      out.push(k);
      k = step(k, side);
    }
  }
  return out;
}

export function disk(center: number, radius: number): number[] {
  const out: number[] = [];
  for (let r = 0; r <= radius; r++) out.push(...ringKeys(center, r));
  return out;
}

// Pixel geometry: a hex is 28x24 px, columns 22 px apart, half-row offset 12 px.
export const HEX_W = 28;
export const HEX_H = 24;
export const COL_STEP = 22;
export const ROW_STEP = 24;

/** Pixel center of a hex (relative to the board origin). */
export function hexToPx(k: number): { x: number; y: number } {
  const q = kq(k);
  const r = kr(k);
  return { x: q * COL_STEP, y: r * ROW_STEP + q * (ROW_STEP / 2) };
}

/** True when pixel offset (dx, dy) from a hex center (pixel-center coords) is inside the hex. */
export function insideHex(dx: number, dy: number): boolean {
  const ady = Math.abs(dy);
  return ady < 12 && Math.abs(dx) + ady / 2 < 14;
}
