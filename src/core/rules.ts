import { DIRS, dist, isAdjacent, neighbors, step } from './hex';
import type { Cause, Ev } from './events';
import { DEFS, type GameState, type Unit, hasGift, isEnemy, player, unitAt } from './state';

export interface Ctx {
  s: GameState;
  ev: Ev[];
}

export type Action =
  | { t: 'move'; dir: number }
  | { t: 'leap'; to: number }
  | { t: 'wait' };

// Colors used in text events (palette indices, see render/palette.ts).
export const C_RED = 8;
export const C_GOLD = 10;
export const C_CYAN = 18;
export const C_WHITE = 19;
export const C_GREEN = 12;
export const C_PURPLE = 28;

export function emit(c: Ctx, e: Ev): void {
  c.ev.push(e);
}

export function tileType(s: GameState, k: number) {
  return s.tiles.get(k)?.t;
}

/** Floor-like tiles a walking unit can stand on. */
export function isGround(s: GameState, k: number): boolean {
  const t = tileType(s, k);
  return t === 'floor' || t === 'stairs';
}

export function enemies(s: GameState): Unit[] {
  return s.units.filter((u) => u.hp > 0 && isEnemy(u));
}

export function findUnit(s: GameState, id: number): Unit | undefined {
  return s.units.find((u) => u.id === id && u.hp > 0);
}

export function faceToward(u: Unit, k: number): void {
  const dx = Math.floor(k / 128) - Math.floor(u.pos / 128);
  if (dx > 0) u.face = 1;
  else if (dx < 0) u.face = -1;
}

export function leapRange(s: GameState): number {
  return 2 + (hasGift(s, 'lekkie') ? 1 : 0);
}
export function leapMax(s: GameState): number {
  return 5 - (hasGift(s, 'lekkie') ? 1 : 0);
}

function removeUnit(s: GameState, u: Unit): void {
  u.hp = 0;
  const i = s.units.indexOf(u);
  if (i >= 0) s.units.splice(i, 1);
}

export function heal(c: Ctx, amount: number): void {
  const p = player(c.s);
  const before = p.hp;
  p.hp = Math.min(c.s.hero.maxHp, p.hp + amount);
  if (p.hp > before) emit(c, { t: 'heal', id: p.id, amount: p.hp - before, hp: p.hp });
}

export function damage(c: Ctx, u: Unit, amount: number, by: Unit | null, cause: Cause = 'hit'): void {
  if (u.hp <= 0 || amount <= 0) return;
  const s = c.s;
  if (u.kind === 'bomb') {
    explode(c, u.pos, u);
    return;
  }
  if (u.kind === 'player') {
    if (hasGift(s, 'hart') && !s.hero.shieldUsed) {
      s.hero.shieldUsed = true;
      emit(c, { t: 'block', id: u.id });
      return;
    }
    u.hp -= amount;
    s.stats.damageTaken += amount;
    emit(c, { t: 'hit', id: u.id, dmg: amount, hp: Math.max(0, u.hp), by: by ? by.id : -1 });
    if (u.hp <= 0) {
      if (hasGift(s, 'odrodzenie') && !s.hero.reviveUsed) {
        s.hero.reviveUsed = true;
        u.hp = 1;
        emit(c, { t: 'heal', id: u.id, amount: 1, hp: 1 });
        emit(c, { t: 'text', at: u.pos, text: 'ODRODZENIE!', color: C_PURPLE });
        return;
      }
      u.hp = 0;
      s.outcome = 'dead';
      s.killedBy = by ? DEFS[by.kind].name : cause === 'burn' ? 'Ogień' : 'Klątwa';
      emit(c, { t: 'die', id: u.id, cause, pos: u.pos, kind: u.kind });
    }
    return;
  }
  if (u.kind === 'kosciej' && !s.eggBroken) {
    const nhp = Math.max(1, u.hp - amount);
    if (nhp === u.hp) {
      emit(c, { t: 'immortal', id: u.id });
      return;
    }
    u.hp = nhp;
    emit(c, { t: 'hit', id: u.id, dmg: amount, hp: u.hp, by: by ? by.id : -1 });
    if (u.hp === 1) emit(c, { t: 'immortal', id: u.id });
    return;
  }
  u.hp -= amount;
  emit(c, { t: 'hit', id: u.id, dmg: amount, hp: Math.max(0, u.hp), by: by ? by.id : -1 });
  if (u.hp <= 0) kill(c, u, cause);
}

export function kill(c: Ctx, u: Unit, cause: Cause): void {
  const s = c.s;
  const pos = u.pos;
  removeUnit(s, u);
  emit(c, { t: 'die', id: u.id, cause, pos, kind: u.kind });
  if (u.kind === 'egg') {
    s.eggBroken = true;
    emit(c, { t: 'eggbreak', at: pos });
    emit(c, { t: 'text', at: pos, text: 'KOŚCIEJ JEST ŚMIERTELNY!', color: C_GOLD });
    return;
  }
  if (!isEnemy(u)) return;
  s.stats.kills++;
  s.roundKills++;
  s.stats.score += 10 * s.roundKills;
  if (s.roundKills > s.stats.bestCombo) s.stats.bestCombo = s.roundKills;
  if (s.roundKills >= 2) emit(c, { t: 'combo', n: s.roundKills, at: pos });
  if (hasGift(s, 'szal') && s.hero.leapCd > 0) s.hero.leapCd--;
  if (hasGift(s, 'zniwiarz')) {
    s.hero.killsTowardHeal++;
    if (s.hero.killsTowardHeal >= 8) {
      s.hero.killsTowardHeal = 0;
      heal(c, 1);
    }
  }
  if (u.kind === 'kosciotrup' && (cause === 'hit' || cause === 'explode')) {
    s.bones.push({ pos, timer: 3 });
    emit(c, { t: 'bones', at: pos });
  }
  if (DEFS[u.kind].boss) {
    s.stats.score += 300;
    for (const e of enemies(s)) {
      removeUnit(s, e);
      emit(c, { t: 'die', id: e.id, cause: 'banish', pos: e.pos, kind: e.kind });
    }
    return;
  }
  if (hasGift(s, 'lancuch')) {
    let best: Unit | null = null;
    let bd = 99;
    for (const e of enemies(s)) {
      const d = dist(e.pos, pos);
      if (d <= 2 && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) {
      emit(c, { t: 'beam', from: pos, hexes: [best.pos], style: 'bolt' });
      damage(c, best, 1, player(s));
    }
  }
}

/** Applies terrain to a unit that just entered a hex. Returns false if it died. */
export function applyTerrain(c: Ctx, u: Unit): boolean {
  const s = c.s;
  const t = tileType(s, u.pos);
  const def = DEFS[u.kind];
  if (t === undefined || t === 'abyss') {
    if (!def.flying) {
      if (u.kind === 'player') {
        u.hp = 1;
        damage(c, u, 99, null, 'fall');
      } else kill(c, u, 'fall');
      return false;
    }
  } else if (t === 'water') {
    if (!def.flying && !def.swim) {
      if (u.kind === 'player') damage(c, u, 99, null, 'drown');
      else kill(c, u, 'drown');
      return false;
    }
  } else if (t === 'lava') {
    if (!def.flying) {
      if (u.kind === 'player') damage(c, u, 99, null, 'burn');
      else kill(c, u, 'burn');
      return false;
    }
  }
  return true;
}

export function moveUnit(c: Ctx, u: Unit, to: number, style: 'step' | 'fly' | 'charge' | 'push' | 'teleport' | 'leap'): boolean {
  const from = u.pos;
  if (style !== 'push') faceToward(u, to);
  u.pos = to;
  emit(c, { t: 'move', id: u.id, from, to, style });
  return applyTerrain(c, u);
}

/** Knocks a unit back along dir. Collisions deal 1 damage, hazards kill. */
export function push(c: Ctx, u: Unit, dir: number, power: number, by: Unit | null): void {
  const s = c.s;
  if (u.hp <= 0) return;
  if (DEFS[u.kind].heavy) {
    emit(c, { t: 'bump', id: u.id, at: step(u.pos, dir), dir });
    damage(c, u, 1, by);
    return;
  }
  for (let i = 0; i < power; i++) {
    const next = step(u.pos, dir);
    const t = tileType(s, next);
    if (t === undefined && DEFS[u.kind].flying) {
      emit(c, { t: 'bump', id: u.id, at: next, dir });
      damage(c, u, 1, by);
      return;
    }
    if (t === 'wall') {
      emit(c, { t: 'bump', id: u.id, at: next, dir });
      damage(c, u, 1, by);
      return;
    }
    const other = t === undefined ? undefined : unitAt(s, next);
    if (other) {
      emit(c, { t: 'bump', id: u.id, at: next, dir });
      damage(c, u, 1, by);
      damage(c, other, 1, by);
      if (hasGift(s, 'domino') && other.hp > 0 && other.kind !== 'player' && !DEFS[other.kind].heavy) {
        push(c, other, dir, 1, by);
      }
      return;
    }
    if (!moveUnit(c, u, next, 'push')) return;
  }
}

export function explode(c: Ctx, center: number, source: Unit | null): void {
  const s = c.s;
  if (source) {
    removeUnit(s, source);
    emit(c, { t: 'die', id: source.id, cause: 'explode', pos: source.pos, kind: source.kind });
  }
  emit(c, { t: 'boom', at: center });
  for (const k of neighbors(center)) {
    const u = unitAt(s, k);
    if (u) damage(c, u, 1, source, 'explode');
  }
}

function attackable(u: Unit | undefined): u is Unit {
  return !!u && u.hp > 0 && u.kind !== 'player' && u.kind !== 'bomb';
}

function crushBones(c: Ctx, k: number): void {
  const i = c.s.bones.findIndex((b) => b.pos === k);
  if (i >= 0) {
    c.s.bones.splice(i, 1);
    emit(c, { t: 'crush', at: k });
  }
}

export function canLeapTo(s: GameState, to: number): boolean {
  const p = player(s);
  if (s.hero.leapCd > 0) return false;
  const d = dist(p.pos, to);
  if (d < 1 || d > leapRange(s)) return false;
  if (!isGround(s, to)) return false;
  return !unitAt(s, to);
}

export function slashDamage(s: GameState): number {
  return 1 + (hasGift(s, 'zar') ? 1 : 0) + (hasGift(s, 'pakt') ? 1 : 0);
}
export function lungeDamage(s: GameState): number {
  return 2 + (hasGift(s, 'pakt') ? 1 : 0);
}

/** Resolves the player's action. Returns false when the action is not allowed. */
export function playerAct(c: Ctx, a: Action): boolean {
  const s = c.s;
  const p = player(s);
  if (a.t === 'wait') {
    emit(c, { t: 'text', at: p.pos, text: '...', color: 21 });
    return true;
  }
  if (a.t === 'move') {
    const from = p.pos;
    const to = step(from, a.dir);
    const t = tileType(s, to);
    if (t === undefined) return false;
    const occ = unitAt(s, to);
    if (occ) {
      // Shove.
      faceToward(p, to);
      emit(c, { t: 'strike', id: p.id, at: to, style: 'shove' });
      const power = hasGift(s, 'wicher') ? 2 : 1;
      const sides = hasGift(s, 'huragan') ? [unitAt(s, step(from, a.dir - 1)), unitAt(s, step(from, a.dir + 1))] : [];
      push(c, occ, a.dir, power, p);
      for (const side of sides) if (side && side.hp > 0) push(c, side, a.dir, 1, p);
      return true;
    }
    if (t !== 'floor' && t !== 'stairs') return false;
    const sideA = step(from, a.dir - 1);
    const sideB = step(from, a.dir + 1);
    const beforeAdj = neighbors(from)
      .map((k) => unitAt(s, k))
      .filter(attackable);
    moveUnit(c, p, to, 'step');
    crushBones(c, to);
    const slashed: Unit[] = [];
    for (const k of [sideA, sideB]) {
      const u = unitAt(s, k);
      if (attackable(u)) slashed.push(u);
    }
    const lungeT = unitAt(s, step(to, a.dir));
    const lungeTarget = attackable(lungeT) ? lungeT : null;
    const shadow: Unit[] = [];
    if (hasGift(s, 'cien')) {
      for (const u of beforeAdj) {
        if (u.hp > 0 && !isAdjacent(u.pos, to) && u !== lungeTarget) shadow.push(u);
      }
    }
    for (const u of slashed) {
      emit(c, { t: 'strike', id: p.id, at: u.pos, style: 'slash' });
      damage(c, u, slashDamage(s), p);
    }
    for (const u of shadow) {
      if (u.hp <= 0) continue;
      emit(c, { t: 'strike', id: p.id, at: u.pos, style: 'slash' });
      damage(c, u, 1, p);
    }
    if (lungeTarget && lungeTarget.hp > 0) {
      emit(c, { t: 'strike', id: p.id, at: lungeTarget.pos, style: 'lunge' });
      const behindK = step(lungeTarget.pos, a.dir);
      damage(c, lungeTarget, lungeDamage(s), p);
      if (hasGift(s, 'gromwypad')) {
        const behind = unitAt(s, behindK);
        if (attackable(behind)) {
          emit(c, { t: 'beam', from: to, hexes: [behindK], style: 'bolt' });
          damage(c, behind, 1, p);
        }
      }
    }
    return true;
  }
  // Leap.
  if (!canLeapTo(s, a.to)) return false;
  moveUnit(c, p, a.to, 'leap');
  crushBones(c, a.to);
  s.hero.leapCd = leapMax(s);
  emit(c, { t: 'shockwave', at: p.pos });
  const around: { u: Unit; d: number }[] = [];
  for (let d = 0; d < 6; d++) {
    const u = unitAt(s, step(p.pos, d));
    if (u) around.push({ u, d });
  }
  if (hasGift(s, 'reka')) {
    emit(c, { t: 'beam', from: p.pos, hexes: around.map((x) => x.u.pos), style: 'bolt' });
    for (const { u } of around) if (u.kind !== 'bomb') damage(c, u, 1, p);
  }
  for (const { u, d } of around) if (u.hp > 0) push(c, u, d, 1, p);
  if (hasGift(s, 'ognskok')) {
    const hexes: number[] = [];
    for (const k of neighbors(p.pos)) {
      const tile = s.tiles.get(k);
      if (tile && (tile.t === 'floor' || tile.t === 'stairs')) {
        tile.fire = 2;
        hexes.push(k);
      }
    }
    emit(c, { t: 'ignite', hexes });
  }
  return true;
}

export const DIR_NAMES = DIRS.map((_, i) => i);
