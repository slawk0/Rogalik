import { hexToPx, key } from '../core/hex';
import { drawText, wrap } from './font';
import { pixelEllipse, pixelLine } from '../anim/fx';
import { PAL } from './palette';
import { hexShape } from './board';
import { sprite } from './sprites';
import { panel } from './ui';

interface Diagram {
  title: string;
  text: string;
  hexes: [number, number, number][]; // q, r, color
  units: [string, number, number, number?][]; // sprite, q, r, alpha
  arrows: [number, number, number, number, number][]; // from q,r -> to q,r, color
  marks: [number, number, string][];
}

const DIAGRAMS: Diagram[] = [
  {
    title: 'CIĘCIE',
    text: 'Ruch obok wroga (sąsiad przed i po ruchu) zadaje 1 obrażenie.',
    hexes: [[0, 0, 13], [1, -1, 13], [1, 0, 13], [0, -1, 13], [2, -1, 13]],
    units: [['player', 0, 0], ['wilk', 1, 0]],
    arrows: [[0, 0, 1, -1, 19]],
    marks: [[1, 0, 'slash']],
  },
  {
    title: 'WYPAD',
    text: 'Krok prosto w stronę wroga stojącego 2 pola dalej: 2 obrażenia.',
    hexes: [[0, 1, 13], [0, 0, 13], [0, -1, 13], [1, 0, 13], [-1, 0, 13]],
    units: [['player', 0, 1], ['dzik', 0, -1]],
    arrows: [[0, 1, 0, 0, 19]],
    marks: [[0, -1, 'hit2']],
  },
  {
    title: 'PCHNIĘCIE',
    text: 'Wejdź na wroga, a odleci o pole. Ściana lub inny wróg: 1 obrażenie. Woda i przepaść: śmierć.',
    hexes: [[-1, 0, 13], [0, 0, 13], [1, -1, 16], [0, -1, 13], [1, 0, 13]],
    units: [['player', -1, 0], ['wilk', 0, 0]],
    arrows: [[0, 0, 1, -1, 8]],
    marks: [[1, -1, 'skull']],
  },
  {
    title: 'SKOK  (PPM lub F)',
    text: 'Skok o 2 pola, także nad przeszkodami. Lądowanie odpycha wszystkich sąsiadów. Odnowienie: 5 tur.',
    hexes: [[0, 0, 13], [0, -1, 13], [-1, 0, 13], [1, -1, 13], [-1, 1, 13], [0, 1, 13], [1, 0, 13], [2, 0, 13]],
    units: [['player', 2, 0, 0.35], ['player', 0, 0], ['wilk', 0, -1], ['wilk', -1, 0]],
    arrows: [[2, 0, 0, 0, 11]],
    marks: [[0, 0, 'ring']],
  },
];

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string): void {
  pixelLine(ctx, x0, y0, x1, y1, col, 2);
  const a = Math.atan2(y1 - y0, x1 - x0);
  for (const s of [-0.6, 0.6]) {
    pixelLine(ctx, x1, y1, x1 - Math.cos(a + s) * 6, y1 - Math.sin(a + s) * 6, col, 2);
  }
}

export function drawHelp(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  ctx.fillStyle = PAL[25];
  ctx.fillRect(0, 0, w, h);
  const cols = 2;
  const pw = Math.min(300, Math.floor((w - 24) / cols));
  const tipsH = h >= 330 ? 46 : 14;
  const ph = Math.min(130, Math.floor((h - 30 - tipsH) / 2) - 4);
  const gx = Math.floor((w - pw * cols - 8) / 2);
  const gy = Math.max(22, Math.floor((h - ph * 2 - 8 - tipsH) / 2) + 6);
  drawText(ctx, 'JAK GRAĆ', w / 2, gy - 15, 11, { align: 'center' });
  DIAGRAMS.forEach((d, i) => {
    const x = gx + (i % cols) * (pw + 8);
    const y = gy + Math.floor(i / cols) * (ph + 8);
    panel(ctx, x, y, pw, ph, 22);
    const dw = 104;
    drawText(ctx, d.title, x + dw + 4, y + 8, 10);
    const lines = wrap(d.text, pw - dw - 12);
    lines.forEach((l, j) => drawText(ctx, l, x + dw + 4, y + 24 + j * 10, 20));
    // Center the diagram in the left part of the panel.
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const [q, r] of d.hexes) {
      const p = hexToPx(key(q, r));
      minX = Math.min(minX, p.x - 14); maxX = Math.max(maxX, p.x + 14);
      minY = Math.min(minY, p.y - 12); maxY = Math.max(maxY, p.y + 12);
    }
    const ox = Math.round(x + 4 + dw / 2 - (minX + maxX) / 2);
    const oy = Math.round(y + ph / 2 - (minY + maxY) / 2 + 5);
    for (const [q, r, c] of d.hexes) {
      const p = hexToPx(key(q, r));
      ctx.drawImage(hexShape(c, 'fill'), Math.round(ox + p.x - 14), Math.round(oy + p.y - 12));
      ctx.drawImage(hexShape(25, 'line', 0.35), Math.round(ox + p.x - 14), Math.round(oy + p.y - 12));
    }
    for (const [name, q, r, a] of d.units) {
      const p = hexToPx(key(q, r));
      const sp = sprite(name);
      ctx.globalAlpha = a ?? 1;
      const flip = name !== 'player';
      ctx.drawImage((flip ? sp.flipped : sp.frames)[Math.floor(time * 2) % 2], Math.round(ox + p.x - sp.w / 2), Math.round(oy + p.y + 4 - sp.h));
      ctx.globalAlpha = 1;
    }
    for (const [q0, r0, q1, r1, c] of d.arrows) {
      const a = hexToPx(key(q0, r0));
      const b = hexToPx(key(q1, r1));
      const k = (Math.sin(time * 3) + 1) / 2;
      arrow(ctx, ox + a.x, oy + a.y - 2, ox + a.x + (b.x - a.x) * (0.6 + 0.3 * k), oy + a.y - 2 + (b.y - a.y) * (0.6 + 0.3 * k), PAL[c]);
    }
    for (const [q, r, m] of d.marks) {
      const p = hexToPx(key(q, r));
      const mx = Math.round(ox + p.x);
      const my = Math.round(oy + p.y);
      const blink = Math.floor(time * 3) % 2 === 0;
      if (m === 'skull') ctx.drawImage(sprite('skull').frames[0], mx - 4, my - 6);
      if (m === 'slash' && blink) ctx.drawImage(sprite('sword').frames[0], mx - 4, my - 26);
      if (m === 'hit2') drawText(ctx, '-2', mx + 10, my - 18, 8);
      if (m === 'ring') pixelEllipse(ctx, mx, my + 4, 10 + (time * 20) % 12, (10 + (time * 20) % 12) * 0.55, PAL[20]);
    }
  });
  if (tipsH > 14) {
    const by = gy + ph * 2 + 16;
    const tips = [
      'Ruch: kliknij sąsiednie pole albo Q W E / A S D. Spacja albo klik na siebie: czekaj.',
      'Najedź na pole, żeby zobaczyć skutki ruchu: czaszka = wróg zginie, czerwone pole = tam oberwiesz.',
      'Oczyść planszę, a bogowie dadzą Ci dar. Schody pozwalają uciec wcześniej, ale bez daru.',
    ];
    tips.forEach((t, i) => drawText(ctx, t, w / 2, by + i * 11, i === 1 ? 11 : 20, { align: 'center' }));
  } else {
    drawText(ctx, 'Czaszka nad wrogiem = zginie · czerwone pole = tam oberwiesz', w / 2, h - 12, 11, { align: 'center' });
  }
}
