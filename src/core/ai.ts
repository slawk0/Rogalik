import { dist, disk, isAdjacent, lineDir, neighbors, step } from './hex';
import {
  type Ctx, C_GOLD, damage, emit, enemies, explode, faceToward, isGround, moveUnit, tileType,
} from './rules';
import { DEFS, type GameState, type Unit, player, unitAt } from './state';

/** Can unit u stand on hex k (ignores other units)? */
export function passable(s: GameState, u: Unit, k: number): boolean {
  const t = tileType(s, k);
  if (t === undefined || t === 'wall') return false;
  const def = DEFS[u.kind];
  if (def.flying) return true;
  if (t === 'water') return !!def.swim;
  if (t === 'abyss' || t === 'lava') return false;
  return true;
}

function free(s: GameState, u: Unit, k: number): boolean {
  return passable(s, u, k) && !unitAt(s, k);
}

/** BFS distances from a set of goal hexes, walking over tiles passable for u (ignoring units). */
export function distField(s: GameState, u: Unit, goals: number[], blockUnits = true): Map<number, number> {
  if (blockUnits) {
    const f = distField(s, u, goals, false);
    // Route around other units when a path exists; otherwise fall back to the plain field.
    const blocked = new Set<number>();
    for (const o of s.units) if (o !== u && o.hp > 0 && !goals.includes(o.pos)) blocked.add(o.pos);
    const g = bfs(s, u, goals, blocked);
    for (const n of neighbors(u.pos)) if (g.has(n)) return g;
    return f;
  }
  return bfs(s, u, goals, new Set());
}

function bfs(s: GameState, u: Unit, goals: number[], blocked: Set<number>): Map<number, number> {
  const d = new Map<number, number>();
  const q: number[] = [];
  for (const g of goals) {
    if (!d.has(g)) {
      d.set(g, 0);
      q.push(g);
    }
  }
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    const dk = d.get(k)!;
    for (const n of neighbors(k)) {
      if (d.has(n) || !passable(s, u, n) || blocked.has(n)) continue;
      d.set(n, dk + 1);
      q.push(n);
    }
  }
  return d;
}

/** Takes one step that lowers the value of field f. Avoids fire. Returns true if moved. */
function stepDown(c: Ctx, u: Unit, f: Map<number, number>, style: 'step' | 'fly' = 'step'): boolean {
  const s = c.s;
  const here = f.get(u.pos) ?? 999;
  let best = -1;
  let bestV = here;
  const rot = (u.id + s.turn) % 6;
  for (let i = 0; i < 6; i++) {
    const n = step(u.pos, (i + rot) % 6);
    if (!free(s, u, n)) continue;
    let v = f.get(n);
    if (v === undefined) continue;
    if ((s.tiles.get(n)?.fire ?? 0) > 0) v += 0.6;
    if (v < bestV) {
      bestV = v;
      best = n;
    }
  }
  if (best < 0) return false;
  moveUnit(c, u, best, style);
  return true;
}

function stepAway(c: Ctx, u: Unit, from: number): boolean {
  const s = c.s;
  let best = -1;
  let bestV = dist(u.pos, from);
  for (const n of neighbors(u.pos)) {
    if (!free(s, u, n) || !isGround(s, n) && !DEFS[u.kind].flying) continue;
    if ((s.tiles.get(n)?.fire ?? 0) > 0) continue;
    const v = dist(n, from);
    if (v > bestV) {
      bestV = v;
      best = n;
    }
  }
  if (best < 0) return false;
  moveUnit(c, u, best, DEFS[u.kind].flying ? 'fly' : 'step');
  return true;
}

/** Hexes along dir from k (exclusive) until a wall / board edge, at most len. */
export function rayHexes(s: GameState, k: number, dir: number, len: number): number[] {
  const out: number[] = [];
  let cur = k;
  for (let i = 0; i < len; i++) {
    cur = step(cur, dir);
    const t = tileType(s, cur);
    if (t === undefined || t === 'wall') break;
    out.push(cur);
  }
  return out;
}

/** Clear straight shot from a to b: no walls and (optionally) no units between them. */
export function clearShot(s: GameState, a: number, b: number, unitsBlock: boolean): boolean {
  const d = lineDir(a, b);
  if (d < 0) return false;
  const n = dist(a, b);
  let cur = a;
  for (let i = 1; i < n; i++) {
    cur = step(cur, d);
    const t = tileType(s, cur);
    if (t === undefined || t === 'wall') return false;
    if (unitsBlock && unitAt(s, cur)) return false;
  }
  return true;
}

/** Hexes a charge from k along dir passes, plus the hex where it stops (blocker). */
export function chargePath(s: GameState, u: Unit, dir: number, max = 8): { path: number[]; stop: 'wall' | 'unit' | 'fall' | 'end'; hit?: number } {
  const path: number[] = [];
  let cur = u.pos;
  for (let i = 0; i < max; i++) {
    const next = step(cur, dir);
    const t = tileType(s, next);
    if (t === undefined) {
      if (DEFS[u.kind].flying) return { path, stop: 'wall' };
      path.push(next);
      return { path, stop: 'fall' };
    }
    if (t === 'wall') return { path, stop: 'wall' };
    const o = unitAt(s, next);
    if (o) return { path, stop: 'unit', hit: next };
    path.push(next);
    if (!DEFS[u.kind].flying && (t === 'water' || t === 'abyss' || t === 'lava')) return { path, stop: 'fall' };
    cur = next;
  }
  return { path, stop: 'end' };
}

function freeGroundNear(s: GameState, center: number, count: number, avoid: number[] = []): number[] {
  const out: number[] = [];
  for (let r = 1; r <= 4 && out.length < count; r++) {
    for (const k of disk(center, r)) {
      if (out.length >= count) break;
      if (dist(k, center) !== r) continue;
      if (!isGround(s, k) || unitAt(s, k) || out.includes(k) || avoid.includes(k)) continue;
      if (s.tiles.get(k)!.t === 'stairs') continue;
      out.push(k);
    }
  }
  return out;
}

export function spawn(c: Ctx, kind: Unit['kind'], pos: number, timer = 0): Unit {
  const s = c.s;
  const u: Unit = {
    id: s.nextId++, kind, pos, hp: DEFS[kind].hp, maxHp: DEFS[kind].hp,
    intent: null, stun: 0, timer, face: -1,
  };
  s.units.push(u);
  emit(c, { t: 'spawn', unit: { ...u } });
  return u;
}

function bite(c: Ctx, u: Unit, target: Unit): void {
  faceToward(u, target.pos);
  emit(c, { t: 'strike', id: u.id, at: target.pos, style: 'bite' });
  damage(c, target, 1, u);
}

function melee(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  if (isAdjacent(u.pos, p.pos)) {
    bite(c, u, p);
    return;
  }
  const speed = DEFS[u.kind].speed ?? 1;
  const f = distField(s, u, [p.pos]);
  for (let i = 0; i < speed; i++) {
    if (isAdjacent(u.pos, p.pos)) break;
    if (!stepDown(c, u, f, DEFS[u.kind].flying ? 'fly' : 'step')) break;
    if (u.hp <= 0) return;
  }
}

/** Moves toward a hex aligned with the player at a distance in [lo, hi]. */
function reposition(c: Ctx, u: Unit, lo: number, hi: number, unitsBlock: boolean, steps = 1): void {
  const s = c.s;
  const p = player(s);
  const goals: number[] = [];
  for (const k of s.tiles.keys()) {
    if (!passable(s, u, k)) continue;
    const d = dist(k, p.pos);
    if (d < lo || d > hi) continue;
    if (lineDir(k, p.pos) < 0) continue;
    if (!clearShot(s, k, p.pos, unitsBlock)) continue;
    goals.push(k);
  }
  if (goals.length === 0) {
    if (dist(u.pos, p.pos) < lo) stepAway(c, u, p.pos);
    else stepDown(c, u, distField(s, u, [p.pos]));
    return;
  }
  const f = distField(s, u, goals);
  for (let i = 0; i < steps; i++) {
    if ((f.get(u.pos) ?? 99) === 0) break;
    if (!stepDown(c, u, f, DEFS[u.kind].flying ? 'fly' : 'step')) {
      if (dist(u.pos, p.pos) < lo) stepAway(c, u, p.pos);
      break;
    }
  }
}

function fireLine(c: Ctx, u: Unit, hexes: number[], style: 'fire' | 'dark'): void {
  emit(c, { t: 'strike', id: u.id, at: hexes[0] ?? u.pos, style: 'cast' });
  emit(c, { t: 'beam', from: u.pos, hexes, style });
  for (const k of hexes) {
    const t = unitAt(c.s, k);
    if (t && t !== u) damage(c, t, 1, u, style === 'fire' ? 'burn' : 'hit');
  }
}

function lineIntent(c: Ctx, u: Unit, range: number): boolean {
  const s = c.s;
  const p = player(s);
  const d = lineDir(u.pos, p.pos);
  if (d < 0 || dist(u.pos, p.pos) > range) return false;
  const hexes = rayHexes(s, u.pos, d, range);
  if (!hexes.includes(p.pos)) return false;
  faceToward(u, p.pos);
  u.intent = { k: 'line', hexes, dir: d };
  emit(c, { t: 'intent', id: u.id });
  return true;
}

function doCharge(c: Ctx, u: Unit, dir: number, flying: boolean): void {
  const s = c.s;
  u.intent = null;
  for (let i = 0; i < 8; i++) {
    const next = step(u.pos, dir);
    const t = tileType(s, next);
    if (t === undefined && flying) break;
    if (t === 'wall' || (t === undefined && flying)) {
      emit(c, { t: 'bump', id: u.id, at: next, dir });
      if (!flying) {
        u.stun = 1;
        emit(c, { t: 'stun', id: u.id });
      }
      return;
    }
    const o = t === undefined ? undefined : unitAt(s, next);
    if (o) {
      emit(c, { t: 'strike', id: u.id, at: next, style: 'bite' });
      damage(c, o, 1, u);
      return;
    }
    if (!moveUnit(c, u, next, flying ? 'fly' : 'charge')) return;
  }
}

function bomber(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  if (u.timer > 0) u.timer--;
  const d = dist(u.pos, p.pos);
  if (u.timer === 0 && d >= 2 && d <= 4) {
    // Throw a bomb next to the player, on the side closest to the licho.
    let best = -1;
    let bd = 99;
    for (const n of neighbors(p.pos)) {
      if (!isGround(s, n) || unitAt(s, n)) continue;
      const nd = dist(n, u.pos);
      if (nd < bd) {
        bd = nd;
        best = n;
      }
    }
    if (best >= 0) {
      faceToward(u, best);
      emit(c, { t: 'strike', id: u.id, at: best, style: 'throw' });
      spawn(c, 'bomb', best, 2);
      u.timer = 3;
      return;
    }
  }
  if (d < 3) stepAway(c, u, p.pos);
  else if (d > 4) stepDown(c, u, distField(s, u, [p.pos]));
}

function wisp(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  if (u.intent && u.intent.k === 'explode') {
    explode(c, u.pos, u);
    return;
  }
  const f = distField(s, u, [p.pos]);
  for (let i = 0; i < 2; i++) {
    if (isAdjacent(u.pos, p.pos)) break;
    if (!stepDown(c, u, f, 'fly')) break;
  }
  if (isAdjacent(u.pos, p.pos)) {
    u.intent = { k: 'explode', hexes: [], dir: 0 };
    emit(c, { t: 'intent', id: u.id });
  }
}

function archer(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  const d = dist(u.pos, p.pos);
  if (d >= 2 && d <= 5 && lineDir(u.pos, p.pos) >= 0 && clearShot(s, u.pos, p.pos, true)) {
    faceToward(u, p.pos);
    emit(c, { t: 'strike', id: u.id, at: p.pos, style: 'cast' });
    const path: number[] = [];
    let cur = u.pos;
    for (let i = 0; i < d; i++) {
      cur = step(cur, lineDir(u.pos, p.pos));
      path.push(cur);
    }
    emit(c, { t: 'beam', from: u.pos, hexes: path, style: 'arrow' });
    damage(c, p, 1, u);
    return;
  }
  if (d === 1) {
    stepAway(c, u, p.pos);
    return;
  }
  reposition(c, u, 2, 5, true);
}

// ---------------------------------------------------------------- bosses

function leszy(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  u.timer++;
  if (u.intent && u.intent.k === 'roots') {
    emit(c, { t: 'strike', id: u.id, at: p.pos, style: 'cast' });
    emit(c, { t: 'beam', from: u.pos, hexes: u.intent.hexes, style: 'roots' });
    for (const k of u.intent.hexes) {
      const t = unitAt(s, k);
      if (t && t !== u) damage(c, t, 1, u);
    }
    u.intent = null;
    return;
  }
  if (u.timer % 5 === 0 && enemies(s).length < 5) {
    emit(c, { t: 'strike', id: u.id, at: u.pos, style: 'cast' });
    emit(c, { t: 'text', at: u.pos, text: 'AUUUU!', color: C_GOLD });
    for (const k of freeGroundNear(s, u.pos, 2, neighbors(p.pos))) spawn(c, 'wilk', k);
    return;
  }
  if (u.timer % 2 === 0) {
    const dirs = u.timer % 4 === 0 ? [0, 2, 4] : [1, 3, 5];
    const hexes = [p.pos, ...dirs.map((d) => step(p.pos, d))].filter((k) => {
      const t = tileType(s, k);
      return t !== undefined && t !== 'wall';
    });
    u.intent = { k: 'roots', hexes, dir: 0 };
    faceToward(u, p.pos);
    emit(c, { t: 'intent', id: u.id });
    return;
  }
  if (u.timer % 7 === 3 || isAdjacent(u.pos, p.pos)) {
    // Vanish and reappear next to a tree far from the player.
    let best = -1;
    let bd = -1;
    for (const [k, t] of s.tiles) {
      if (t.t !== 'floor' || unitAt(s, k)) continue;
      if (!neighbors(k).some((n) => tileType(s, n) === 'wall')) continue;
      const d = dist(k, p.pos);
      if (d > bd && d <= 6) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      moveUnit(c, u, best, 'teleport');
      return;
    }
  }
  if (dist(u.pos, p.pos) > 3) stepDown(c, u, distField(s, u, [p.pos]));
}

function jaga(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  u.timer++;
  if (u.intent && u.intent.k === 'fly') {
    doCharge(c, u, u.intent.dir, true);
    return;
  }
  if (u.timer % 4 === 0) {
    const spots = neighbors(p.pos).filter((k) => isGround(s, k) && !unitAt(s, k) && tileType(s, k) !== 'stairs');
    const rot = s.turn % 6;
    const chosen: number[] = [];
    for (let i = 0; i < spots.length && chosen.length < 3; i++) chosen.push(spots[(i * 2 + rot) % spots.length]);
    const uniq = [...new Set(chosen)];
    if (uniq.length > 0) {
      emit(c, { t: 'strike', id: u.id, at: p.pos, style: 'throw' });
      emit(c, { t: 'text', at: u.pos, text: 'KOCIOŁ!', color: C_GOLD });
      for (const k of uniq) spawn(c, 'bomb', k, 2);
      return;
    }
  }
  if (u.timer % 6 === 3 && enemies(s).length < 5) {
    emit(c, { t: 'strike', id: u.id, at: u.pos, style: 'cast' });
    for (const k of freeGroundNear(s, u.pos, 2, neighbors(p.pos))) spawn(c, 'ognik', k);
    return;
  }
  const d = lineDir(u.pos, p.pos);
  const dd = dist(u.pos, p.pos);
  if (d >= 0 && dd >= 2 && dd <= 6 && clearShot(s, u.pos, p.pos, false)) {
    u.intent = { k: 'fly', hexes: [], dir: d };
    faceToward(u, p.pos);
    emit(c, { t: 'intent', id: u.id });
    return;
  }
  // Fly up to 3 hexes toward a spot aligned with the player.
  const goals: number[] = [];
  for (const k of s.tiles.keys()) {
    const kd = dist(k, p.pos);
    if (kd < 2 || kd > 4 || lineDir(k, p.pos) < 0 || !passable(s, u, k)) continue;
    if (!clearShot(s, k, p.pos, false)) continue;
    goals.push(k);
  }
  const f = distField(s, u, goals.length ? goals : [p.pos]);
  for (let i = 0; i < 3; i++) {
    if ((f.get(u.pos) ?? 99) === 0) break;
    if (!stepDown(c, u, f, 'fly')) break;
  }
}

function kosciej(c: Ctx, u: Unit): void {
  const s = c.s;
  const p = player(s);
  u.timer++;
  if (u.intent && u.intent.k === 'sweep') {
    emit(c, { t: 'strike', id: u.id, at: u.pos, style: 'sweep' });
    for (const k of neighbors(u.pos)) {
      const t = unitAt(s, k);
      if (t) damage(c, t, 1, u);
    }
    u.intent = null;
    return;
  }
  if (u.intent && u.intent.k === 'line') {
    fireLine(c, u, u.intent.hexes, 'dark');
    u.intent = null;
    return;
  }
  if (isAdjacent(u.pos, p.pos)) {
    u.intent = { k: 'sweep', hexes: neighbors(u.pos), dir: 0 };
    emit(c, { t: 'intent', id: u.id });
    return;
  }
  const skeletons = s.units.filter((e) => e.kind === 'kosciotrup').length + s.bones.length;
  if (u.timer % 5 === 0 && skeletons < 3) {
    emit(c, { t: 'strike', id: u.id, at: u.pos, style: 'cast' });
    emit(c, { t: 'text', at: u.pos, text: 'POWSTAŃCIE!', color: C_GOLD });
    for (const k of freeGroundNear(s, u.pos, 2, neighbors(p.pos))) spawn(c, 'kosciotrup', k);
    return;
  }
  if (u.timer % 2 === 1 && lineIntent(c, u, 5)) return;
  stepDown(c, u, distField(s, u, [p.pos]));
  if (!s.eggBroken) return;
  // Enraged: moves twice once mortal.
  if (!isAdjacent(u.pos, p.pos)) stepDown(c, u, distField(s, u, [p.pos]));
}

export function actEnemy(c: Ctx, u: Unit): void {
  if (u.hp <= 0 || u.kind === 'bomb' || u.kind === 'egg' || u.kind === 'player') return;
  if (u.stun > 0) {
    u.stun--;
    return;
  }
  switch (u.kind) {
    case 'wilk':
    case 'utopiec':
    case 'kosciotrup':
    case 'strzyga':
      melee(c, u);
      return;
    case 'bies':
      if (u.intent) {
        fireLine(c, u, u.intent.hexes, 'fire');
        u.intent = null;
        return;
      }
      if (lineIntent(c, u, 5)) return;
      reposition(c, u, 2, 4, false);
      return;
    case 'dzik': {
      if (u.intent) {
        doCharge(c, u, u.intent.dir, false);
        return;
      }
      const p = player(c.s);
      const d = lineDir(u.pos, p.pos);
      if (d >= 0 && dist(u.pos, p.pos) <= 6 && clearShot(c.s, u.pos, p.pos, true)) {
        u.intent = { k: 'charge', hexes: [], dir: d };
        faceToward(u, p.pos);
        emit(c, { t: 'intent', id: u.id });
        return;
      }
      stepDown(c, u, distField(c.s, u, [p.pos]));
      return;
    }
    case 'ognik':
      wisp(c, u);
      return;
    case 'licho':
      bomber(c, u);
      return;
    case 'upior':
      archer(c, u);
      return;
    case 'leszy':
      leszy(c, u);
      return;
    case 'jaga':
      jaga(c, u);
      return;
    case 'kosciej':
      kosciej(c, u);
      return;
  }
}
