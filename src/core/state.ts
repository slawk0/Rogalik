export type TileType = 'floor' | 'wall' | 'water' | 'abyss' | 'lava' | 'stairs';

export interface Tile {
  t: TileType;
  /** Visual variant seed. */
  v: number;
  /** Turns of fire left on this tile (0 = none). */
  fire: number;
}

export type Kind =
  | 'player'
  | 'wilk' | 'bies' | 'dzik'
  | 'utopiec' | 'ognik' | 'licho'
  | 'kosciotrup' | 'strzyga' | 'upior'
  | 'leszy' | 'jaga' | 'kosciej'
  | 'bomb' | 'egg';

export type IntentKind = 'line' | 'charge' | 'explode' | 'roots' | 'sweep' | 'fly';

export interface Intent {
  k: IntentKind;
  /** Fixed target hexes (line, roots, sweep, explode). */
  hexes: number[];
  /** Direction for charge / fly. */
  dir: number;
}

export interface Unit {
  id: number;
  kind: Kind;
  pos: number;
  hp: number;
  maxHp: number;
  intent: Intent | null;
  stun: number;
  /** Generic timer: bomb fuse, licho cooldown, boss pattern counter. */
  timer: number;
  /** Facing for sprites: -1 left, 1 right. */
  face: number;
}

export interface Bones {
  pos: number;
  timer: number;
}

export interface Hero {
  maxHp: number;
  leapCd: number;
  gifts: string[];
  shieldUsed: boolean;
  reviveUsed: boolean;
  killsTowardHeal: number;
}

export interface RunStats {
  kills: number;
  turns: number;
  bestCombo: number;
  damageTaken: number;
  levelsCleared: number;
  score: number;
}

export type Outcome = null | 'dead' | 'cleared' | 'descended' | 'won';

export interface GameState {
  tiles: Map<number, Tile>;
  units: Unit[];
  bones: Bones[];
  hero: Hero;
  stats: RunStats;
  depth: number;
  turn: number;
  nextId: number;
  rng: number;
  stairs: number;
  eggBroken: boolean;
  outcome: Outcome;
  killedBy: string;
  /** Kills during the current round (for combos). */
  roundKills: number;
}

export interface UnitDef {
  name: string;
  hp: number;
  flying?: boolean;
  swim?: boolean;
  heavy?: boolean;
  object?: boolean;
  boss?: boolean;
  speed?: number;
  desc: string;
}

export const DEFS: Record<Kind, UnitDef> = {
  player: { name: 'Góral', hp: 3, desc: 'To Ty.' },
  wilk: { name: 'Wilk', hp: 1, desc: 'Gryzie, gdy stoisz obok.' },
  bies: { name: 'Bies', hp: 1, desc: 'Z linii prostej szykuje ogień. Za turę pali całą oznaczoną linię.' },
  dzik: { name: 'Dzik', hp: 2, desc: 'Z linii prostej szarżuje aż do przeszkody. Po uderzeniu w ścianę jest ogłuszony.' },
  utopiec: { name: 'Utopiec', hp: 3, swim: true, desc: 'Gryzie z bliska. Pływa i nie tonie.' },
  ognik: { name: 'Błędny ognik', hp: 1, flying: true, speed: 2, desc: 'Leci o 2. Obok Ciebie zapala się i za turę wybucha. Możesz go odepchnąć.' },
  licho: { name: 'Licho', hp: 1, desc: 'Rzuca bomby-klątwy. Bomby wybuchają po turze i da się je pchać.' },
  kosciotrup: { name: 'Kościotrup', hp: 2, desc: 'Gryzie z bliska. Kości składają się po 3 turach, chyba że na nie wejdziesz.' },
  strzyga: { name: 'Strzyga', hp: 3, flying: true, speed: 2, desc: 'Lata o 2 pola. Gdy doleci do Ciebie, od razu gryzie.' },
  upior: { name: 'Upiór', hp: 1, desc: 'Strzela w linii prostej z 2 do 6 pól. Nie strzela z bliska.' },
  leszy: { name: 'Leszy', hp: 8, heavy: true, boss: true, desc: 'Pan lasu. Przyzywa wilki, wypuszcza korzenie i znika między drzewami.' },
  jaga: { name: 'Baba Jaga', hp: 10, heavy: true, flying: true, boss: true, desc: 'Lata w moździerzu, szarżuje w linii i rzuca kotły bomb.' },
  kosciej: { name: 'Kościej', hp: 10, heavy: true, boss: true, desc: 'Nieśmiertelny, dopóki jego jajo jest całe. Rozbij je!' },
  bomb: { name: 'Bomba-klątwa', hp: 1, object: true, desc: 'Wybucha na końcu tury, gdy licznik spadnie do zera. Wybuch rani wszystkich obok.' },
  egg: { name: 'Jajo Kościeja', hp: 3, heavy: true, object: true, desc: 'W nim ukryta jest śmierć Kościeja. Rozbij je trzema ciosami.' },
};

export function isEnemy(u: Unit): boolean {
  return u.kind !== 'player' && !DEFS[u.kind].object;
}

export function cloneState(s: GameState): GameState {
  const tiles = new Map<number, Tile>();
  for (const [k, t] of s.tiles) tiles.set(k, { ...t });
  return {
    ...s,
    tiles,
    units: s.units.map((u) => ({ ...u, intent: u.intent ? { ...u.intent, hexes: u.intent.hexes.slice() } : null })),
    bones: s.bones.map((b) => ({ ...b })),
    hero: { ...s.hero, gifts: s.hero.gifts.slice() },
    stats: { ...s.stats },
  };
}

export function player(s: GameState): Unit {
  return s.units[0].kind === 'player' ? s.units[0] : s.units.find((u) => u.kind === 'player')!;
}

export function unitAt(s: GameState, k: number): Unit | undefined {
  for (const u of s.units) if (u.pos === k && u.hp > 0) return u;
  return undefined;
}

export function hasGift(s: GameState, id: string): boolean {
  return s.hero.gifts.includes(id);
}

export function giftCount(s: GameState, id: string): number {
  let n = 0;
  for (const g of s.hero.gifts) if (g === id) n++;
  return n;
}
