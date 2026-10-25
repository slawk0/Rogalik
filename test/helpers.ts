import { disk, key } from '../src/core/hex';
import { DEFS, type GameState, type Kind, type TileType, type Unit } from '../src/core/state';

export function board(overrides: Record<string, TileType> = {}, radius = 4): GameState {
  const tiles = new Map();
  for (const k of disk(key(0, 0), radius)) tiles.set(k, { t: 'floor', v: 0, fire: 0 });
  for (const [qr, t] of Object.entries(overrides)) {
    const [q, r] = qr.split(',').map(Number);
    if (t === ('none' as TileType)) tiles.delete(key(q, r));
    else tiles.set(key(q, r), { t, v: 0, fire: 0 });
  }
  return {
    tiles,
    units: [],
    bones: [],
    hero: { maxHp: 3, leapCd: 0, gifts: [], shieldUsed: false, reviveUsed: false, killsTowardHeal: 0 },
    stats: { kills: 0, turns: 0, bestCombo: 0, damageTaken: 0, levelsCleared: 0, score: 0 },
    depth: 1, turn: 0, nextId: 1, rng: 1, stairs: -1, eggBroken: false, outcome: null, killedBy: '', roundKills: 0,
  };
}

export function add(s: GameState, kind: Kind, q: number, r: number, extra: Partial<Unit> = {}): Unit {
  const u: Unit = {
    id: kind === 'player' ? 0 : s.nextId++, kind, pos: key(q, r), hp: kind === 'player' ? 3 : DEFS[kind].hp,
    maxHp: DEFS[kind].hp, intent: null, stun: 0, timer: 0, face: 1, ...extra,
  };
  if (kind === 'player') s.units.unshift(u);
  else s.units.push(u);
  return u;
}

export const at = (q: number, r: number) => key(q, r);
