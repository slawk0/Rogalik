import { dist, disk, hexToPx, key, neighbors, ringKeys } from './hex';
import { Rng } from './rng';
import { DEFS, type GameState, type Hero, type Kind, type RunStats, type Tile, type TileType, type Unit } from './state';

export const R = 4;
export const CENTER = key(0, 0);

export interface Biome {
  name: string;
  short: string;
  boss: Kind;
}

export const BIOMES: Biome[] = [
  { name: 'Mroczny Las', short: 'Las', boss: 'leszy' },
  { name: 'Bagna', short: 'Bagna', boss: 'jaga' },
  { name: 'Nawia', short: 'Nawia', boss: 'kosciej' },
];

export const LEVELS_PER_BIOME = 5;

export function biomeOf(depth: number): number {
  return Math.min(2, Math.floor(depth / LEVELS_PER_BIOME));
}
export function isBossDepth(depth: number): boolean {
  return depth % LEVELS_PER_BIOME === LEVELS_PER_BIOME - 1;
}

/** New enemy types introduced at a given depth (always spawned there). */
export const INTRO: Record<number, Kind[]> = {
  0: ['wilk'], 1: ['bies'], 2: ['dzik'],
  5: ['utopiec'], 6: ['ognik'], 7: ['licho'],
  10: ['kosciotrup'], 11: ['upior'], 12: ['strzyga'],
};

const COST: Partial<Record<Kind, number>> = {
  wilk: 1, bies: 2, dzik: 2, utopiec: 2, ognik: 1.5, licho: 2, kosciotrup: 2, strzyga: 3, upior: 2,
};

const POOLS: [Kind, number][][] = [
  [['wilk', 5], ['bies', 2], ['dzik', 2]],
  [['utopiec', 3], ['ognik', 3], ['licho', 2], ['wilk', 1.5], ['bies', 1], ['dzik', 1]],
  [['kosciotrup', 3], ['upior', 3], ['strzyga', 2.5], ['ognik', 1], ['licho', 1.5], ['bies', 1.5], ['utopiec', 1]],
];

const RANGED: Kind[] = ['bies', 'licho', 'upior'];

function firstDepthOf(kind: Kind): number {
  for (const [d, ks] of Object.entries(INTRO)) if (ks.includes(kind)) return Number(d);
  return 0;
}

// Enemy budget per normal level, by biome and level index.
const BUDGET = [
  [3.5, 5, 7, 8.5],
  [7.5, 9, 10.5, 12],
  [11, 12.5, 14, 15.5],
];

export function budgetFor(depth: number): number {
  return BUDGET[biomeOf(depth)][depth % LEVELS_PER_BIOME] ?? 8;
}

interface Layout {
  tiles: Map<number, Tile>;
  start: number;
  stairs: number;
}

function blob(rng: Rng, tiles: Map<number, Tile>, protectedSet: Set<number>, size: number, t: TileType): void {
  const floors = [...tiles.entries()].filter(([k, x]) => x.t === 'floor' && !protectedSet.has(k)).map(([k]) => k);
  if (!floors.length) return;
  const cells = [rng.pick(floors)];
  for (let i = 1; i < size; i++) {
    const options = cells.flatMap((c) => neighbors(c)).filter(
      (n) => tiles.get(n)?.t === 'floor' && !protectedSet.has(n) && !cells.includes(n),
    );
    if (!options.length) break;
    cells.push(rng.pick(options));
  }
  for (const c of cells) tiles.get(c)!.t = t;
}

function connected(tiles: Map<number, Tile>, start: number): boolean {
  const walk = (k: number) => {
    const t = tiles.get(k)?.t;
    return t === 'floor' || t === 'stairs';
  };
  let total = 0;
  for (const [k] of tiles) if (walk(k)) total++;
  const seen = new Set([start]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) {
      if (!seen.has(n) && walk(n)) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return seen.size === total;
}

function makeLayout(rng: Rng, biome: number, boss: boolean): Layout {
  for (let attempt = 0; attempt < 200; attempt++) {
    const tiles = new Map<number, Tile>();
    for (const k of disk(CENTER, R)) tiles.set(k, { t: 'floor', v: rng.int(256), fire: 0 });
    const ring = ringKeys(CENTER, R).sort((a, b) => hexToPx(a).y - hexToPx(b).y);
    const start = rng.pick(ring.slice(-3));
    const stairs = boss ? -1 : rng.pick(ring.slice(0, 3));
    const prot = new Set<number>([start, ...neighbors(start)]);
    if (stairs >= 0) for (const k of [stairs, ...neighbors(stairs)]) prot.add(k);
    // Ragged island edge.
    for (const k of ring) if (!prot.has(k) && rng.chance(0.22)) tiles.delete(k);
    if (stairs >= 0) tiles.get(stairs)!.t = 'stairs';
    const walls = boss
      ? [9, 5, 5][biome]
      : [rng.range(5, 8), rng.range(4, 6), rng.range(3, 5)][biome];
    const interior = [...tiles.keys()].filter((k) => !prot.has(k));
    for (let i = 0; i < walls && interior.length; i++) {
      const k = interior.splice(rng.int(interior.length), 1)[0];
      tiles.get(k)!.t = 'wall';
    }
    if (biome === 0) {
      const ponds = rng.range(1, 2);
      for (let i = 0; i < ponds; i++) blob(rng, tiles, prot, rng.range(2, 3), 'water');
    } else if (biome === 1) {
      const ponds = rng.range(3, 4);
      for (let i = 0; i < ponds; i++) blob(rng, tiles, prot, rng.range(2, 4), 'water');
    } else {
      const holes = rng.range(2, 3);
      for (let i = 0; i < holes; i++) blob(rng, tiles, prot, rng.range(1, 3), 'abyss');
      const lava = rng.range(1, 2);
      for (let i = 0; i < lava; i++) blob(rng, tiles, prot, rng.range(2, 3), 'lava');
    }
    if (!connected(tiles, start)) continue;
    let floorCount = 0;
    for (const t of tiles.values()) if (t.t === 'floor') floorCount++;
    if (floorCount < 32) continue;
    return { tiles, start, stairs };
  }
  throw new Error('level generation failed');
}

export interface Carry {
  hero: Hero;
  stats: RunStats;
  hp: number;
  nextId: number;
}

export function freshCarry(): Carry {
  return {
    hero: { maxHp: 3, leapCd: 0, gifts: [], shieldUsed: false, reviveUsed: false, killsTowardHeal: 0 },
    stats: { kills: 0, turns: 0, bestCombo: 0, damageTaken: 0, levelsCleared: 0, score: 0 },
    hp: 3,
    nextId: 1,
  };
}

function mkUnit(id: number, kind: Kind, pos: number): Unit {
  return { id, kind, pos, hp: DEFS[kind].hp, maxHp: DEFS[kind].hp, intent: null, stun: 0, timer: 0, face: -1 };
}

export function genLevel(depth: number, carry: Carry, seed: number): GameState {
  const rng = new Rng(seed);
  const biome = biomeOf(depth);
  const boss = isBossDepth(depth);
  const lay = makeLayout(rng, biome, boss);
  let nextId = Math.max(1, carry.nextId);
  const units: Unit[] = [{ ...mkUnit(0, 'player', lay.start), hp: carry.hp, maxHp: carry.hero.maxHp, face: 1 }];
  const used = new Set<number>([lay.start]);
  const floor = (minDist: number) => [...lay.tiles.entries()]
    .filter(([k, t]) => t.t === 'floor' && !used.has(k) && dist(k, lay.start) >= minDist)
    .map(([k]) => k);
  const place = (kind: Kind, minDist: number, far = false): Unit | null => {
    let cands = floor(minDist);
    if (!cands.length) cands = floor(2);
    if (!cands.length) return null;
    if (far) cands.sort((a, b) => dist(b, lay.start) - dist(a, lay.start));
    const k = far ? cands[0] : rng.pick(cands);
    used.add(k);
    const u = mkUnit(nextId++, kind, k);
    units.push(u);
    return u;
  };

  if (boss) {
    const b = BIOMES[biome].boss;
    place(b, 5, true);
    if (b === 'leszy') { place('wilk', 4); place('wilk', 4); }
    if (b === 'jaga') { place('utopiec', 4); }
    if (b === 'kosciej') {
      place('kosciotrup', 4);
      place('kosciotrup', 4);
      // The egg sits away from both the boss and the start.
      const bossPos = units[1].pos;
      const cands = floor(2).filter((k) => dist(k, bossPos) >= 4).sort((a, b) => dist(b, bossPos) - dist(a, bossPos));
      const k = cands[Math.min(cands.length - 1, rng.int(3))];
      used.add(k);
      units.push(mkUnit(nextId++, 'egg', k));
    }
  } else {
    let budget = budgetFor(depth);
    const forced = INTRO[depth] ?? [];
    for (const k of forced) {
      place(k, RANGED.includes(k) ? 4 : 3);
      budget -= COST[k] ?? 1;
    }
    const pool = POOLS[biome].filter(([k]) => firstDepthOf(k) <= depth);
    let guard = 0;
    while (budget >= 1 && units.length < 12 && guard++ < 50) {
      const opts = pool.filter(([k]) => (COST[k] ?? 1) <= budget + 0.01);
      if (!opts.length) break;
      const total = opts.reduce((a, [, w]) => a + w, 0);
      let r = rng.next() * total;
      let kind = opts[0][0];
      for (const [k, w] of opts) {
        r -= w;
        if (r <= 0) { kind = k; break; }
      }
      if (!place(kind, RANGED.includes(kind) ? 4 : 3)) break;
      budget -= COST[kind] ?? 1;
    }
  }

  return {
    tiles: lay.tiles,
    units,
    bones: [],
    hero: { ...carry.hero, gifts: carry.hero.gifts.slice(), leapCd: 0, shieldUsed: false },
    stats: { ...carry.stats },
    depth,
    turn: 0,
    nextId,
    rng: rng.s,
    stairs: lay.stairs,
    eggBroken: false,
    outcome: null,
    killedBy: '',
    roundKills: 0,
  };
}
