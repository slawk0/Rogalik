import { PAL } from './palette';

const ARROW = [
  'k.........',
  'kk........',
  'kwk.......',
  'kwwk......',
  'kwwwk.....',
  'kwwwwk....',
  'kwwwwwk...',
  'kwwwwwwk..',
  'kwwwwkkkk.',
  'kwkwwk....',
  'kk.kwwk...',
  '....kwk...',
  '.....kk...',
];

export function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, tint = 19): void {
  for (let r = 0; r < ARROW.length; r++) {
    for (let c = 0; c < ARROW[r].length; c++) {
      const ch = ARROW[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 'k' ? PAL[25] : PAL[tint];
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}
