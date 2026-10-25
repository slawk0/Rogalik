// Endesga 32 palette.
export const PAL = [
  '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
  '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
  '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
  '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
];

export const C = {
  rust: 0, orangeBrown: 1, cream: 2, tan: 3, brown: 4, darkBrown: 5, darkestBrown: 6, darkRed: 7,
  red: 8, orange: 9, gold: 10, yellow: 11, green: 12, midGreen: 13, darkGreen: 14, deepTeal: 15,
  blue: 16, lightBlue: 17, cyan: 18, white: 19, lightGray: 20, gray: 21, slate: 22, darkSlate: 23,
  navy: 24, black: 25, hot: 26, purple: 27, pink: 28, salmon: 29, skin: 30, skinDark: 31,
} as const;

/** Sprite letters -> palette index. */
export const CHARMAP: Record<string, number> = {
  k: 25, K: 24, n: 23, G: 22, g: 21, W: 20, w: 19,
  r: 8, R: 7, h: 26, o: 9, y: 10, Y: 11,
  l: 12, e: 13, E: 14, t: 15, B: 16, b: 17, c: 18,
  p: 27, P: 28, i: 29, s: 30, S: 31,
  u: 2, U: 3, d: 4, D: 5, x: 6, q: 0, Q: 1,
};

export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(i: number, a: number): string {
  const [r, g, b] = hexToRgb(PAL[i]);
  return `rgba(${r},${g},${b},${a})`;
}
