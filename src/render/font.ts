import { PAL } from './palette';

// 5x7 bitmap font with Polish letters. Rows 0-6 are the body, 7-8 descenders.
// Accents of capitals are drawn at rows -2..-1 (above the text box).
const G: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|####.|#...#|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|####.|#....|#....|#....|#####',
  F: '#####|#....|####.|#....|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  H: '#...#|#...#|#####|#...#|#...#|#...#|#...#',
  I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|....#|....#|....#|#...#|#...#|.###.',
  K: '#...#|#..#.|###..|#..#.|#...#|#...#|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
  N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#..#.|#...#|#...#',
  S: '.####|#....|.###.|....#|....#|#...#|.###.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|.#.#.|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  Ł: '.#...|.#...|.#.#.|.##..|##...|.#...|.####',
  a: '.....|.....|.###.|....#|.####|#...#|.####',
  b: '#....|#....|####.|#...#|#...#|#...#|####.',
  c: '....|....|.###|#...|#...|#...|.###',
  d: '....#|....#|.####|#...#|#...#|#...#|.####',
  e: '.....|.....|.###.|#...#|#####|#....|.###.',
  f: '..##|.#..|####|.#..|.#..|.#..|.#..',
  g: '.....|.....|.####|#...#|#...#|.####|....#|.###.',
  h: '#....|#....|####.|#...#|#...#|#...#|#...#',
  i: '#|.|#|#|#|#|#',
  j: '..#|...|..#|..#|..#|..#|..#|#.#|.#.',
  k: '#...|#...|#..#|#.#.|##..|#.#.|#..#',
  l: '#.|#.|#.|#.|#.|#.|.#',
  ł: '.#..|.#..|.#.#|.##.|##..|.#..|..##',
  m: '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#',
  n: '.....|.....|####.|#...#|#...#|#...#|#...#',
  o: '.....|.....|.###.|#...#|#...#|#...#|.###.',
  p: '.....|.....|####.|#...#|#...#|####.|#....|#....',
  q: '.....|.....|.####|#...#|#...#|.####|....#|....#',
  r: '....|....|#.##|##..|#...|#...|#...',
  s: '.....|.....|.####|#....|.###.|....#|####.',
  t: '.#..|.#..|####|.#..|.#..|.#..|..##',
  u: '.....|.....|#...#|#...#|#...#|#...#|.####',
  v: '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
  x: '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  y: '.....|.....|#...#|#...#|#...#|.####|....#|.###.',
  z: '.....|.....|#####|...#.|..#..|.#...|#####',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '.#.|##.|.#.|.#.|.#.|.#.|###',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '.###.|#....|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|....#|.###.',
  '.': '.|.|.|.|.|.|#',
  ',': '..|..|..|..|..|.#|.#|#.',
  '!': '#|#|#|#|#|.|#',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  ':': '.|.|#|.|.|#|.',
  ';': '..|..|.#|..|..|.#|.#|#.',
  '-': '....|....|....|####|....|....|....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '=': '....|....|####|....|####|....|....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.',
  '%': '##..#|##..#|...#.|..#..|.#...|#..##|#..##',
  "'": '#|#|.|.|.|.|.',
  '"': '#.#|#.#|...|...|...|...|...',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
  '<': '...#|..#.|.#..|#...|.#..|..#.|...#',
  '·': '.|.|.|#|.|.|.',
  '[': '##|#.|#.|#.|#.|#.|##',
  ']': '##|.#|.#|.#|.#|.#|##',
  '#': '.#.#.|#####|.#.#.|.#.#.|.#.#.|#####|.#.#.',
  '♥': '.....|.#.#.|#####|#####|.###.|..#..|.....',
  '→': '.....|...#.|....#|#####|....#|...#.|.....',
  '≡': '.....|#####|.....|#####|.....|#####|.....',
  '×': '.....|#...#|.#.#.|..#..|.#.#.|#...#|.....',
  '↑': '..#..|.###.|#.#.#|..#..|..#..|..#..|..#..',
};

// Polish letters made from a base glyph plus an accent.
const ACCENTED: Record<string, [string, 'acute' | 'dot' | 'ogonek']> = {
  ą: ['a', 'ogonek'], ć: ['c', 'acute'], ę: ['e', 'ogonek'], ń: ['n', 'acute'], ó: ['o', 'acute'],
  ś: ['s', 'acute'], ź: ['z', 'acute'], ż: ['z', 'dot'],
  Ą: ['A', 'ogonek'], Ć: ['C', 'acute'], Ę: ['E', 'ogonek'], Ń: ['N', 'acute'], Ó: ['O', 'acute'],
  Ś: ['S', 'acute'], Ź: ['Z', 'acute'], Ż: ['Z', 'dot'],
};

interface Glyph {
  w: number;
  px: [number, number][];
}

const glyphs = new Map<string, Glyph>();

function parse(src: string): Glyph {
  const rows = src.split('|');
  const w = Math.max(...rows.map((r) => r.length));
  const px: [number, number][] = [];
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] === '#') px.push([x, y]);
  });
  return { w, px };
}

function glyph(ch: string): Glyph | null {
  const hit = glyphs.get(ch);
  if (hit) return hit;
  let g: Glyph | null = null;
  if (G[ch]) g = parse(G[ch]);
  else if (ACCENTED[ch]) {
    const [baseCh, acc] = ACCENTED[ch];
    const base = parse(G[baseCh]);
    const cap = baseCh === baseCh.toUpperCase();
    const px = base.px.slice();
    const mid = Math.floor(base.w / 2);
    if (acc === 'acute') {
      if (cap) px.push([mid + 1, -2], [mid, -1]);
      else px.push([mid + 1, 0], [mid, 1]);
    } else if (acc === 'dot') {
      px.push([mid, cap ? -2 : 0]);
    } else {
      px.push([base.w - 2, 7], [base.w - 1, 8]);
    }
    g = { w: base.w, px };
  } else if (ch === ' ') g = { w: 3, px: [] };
  else if (ch === '„' || ch === '”' || ch === '“') g = parse(G['"']);
  else if (ch === '–' || ch === '—') g = parse(G['-']);
  else if (ch === '❤') g = parse(G['♥']);
  if (g) glyphs.set(ch, g);
  return g;
}

export const LINE_H = 12;

export function measure(text: string): number {
  let w = 0;
  for (const ch of text) {
    const g = glyph(ch) ?? glyph('?')!;
    w += g.w + 1;
  }
  return Math.max(0, w - 1);
}

const textCache = new Map<string, HTMLCanvasElement>();

function renderText(text: string, color: number, shadow: number | null): HTMLCanvasElement {
  const k = `${color}|${shadow}|${text}`;
  const hit = textCache.get(k);
  if (hit) return hit;
  const w = measure(text) + 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = 13;
  const ctx = c.getContext('2d')!;
  const paint = (col: number, ox: number, oy: number) => {
    ctx.fillStyle = PAL[col];
    let x = 0;
    for (const ch of text) {
      const g = glyph(ch) ?? glyph('?')!;
      for (const [px, py] of g.px) ctx.fillRect(x + px + ox, py + 2 + oy, 1, 1);
      x += g.w + 1;
    }
  };
  if (shadow !== null) paint(shadow, 1, 1);
  paint(color, 0, 0);
  if (textCache.size > 800) textCache.clear();
  textCache.set(k, c);
  return c;
}

export interface TextOpts {
  align?: 'left' | 'center' | 'right';
  shadow?: number | null;
  scale?: number;
  alpha?: number;
}

/** Draws text with its cap line at y. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: number, o: TextOpts = {}): number {
  const scale = o.scale ?? 1;
  const c = renderText(text, color, o.shadow === undefined ? 25 : o.shadow);
  const w = measure(text) * scale;
  let dx = x;
  if (o.align === 'center') dx = x - Math.floor(w / 2);
  else if (o.align === 'right') dx = x - w;
  const prev = ctx.globalAlpha;
  if (o.alpha !== undefined) ctx.globalAlpha = prev * o.alpha;
  ctx.drawImage(c, Math.round(dx), Math.round(y - 2 * scale), c.width * scale, c.height * scale);
  ctx.globalAlpha = prev;
  return w;
}

export function wrap(text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (measure(t) > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
