import { neighbors } from './hex';
import type { Ev } from './events';
import { actEnemy, chargePath, spawn } from './ai';
import { type Action, type Ctx, C_GOLD, damage, emit, enemies, explode, playerAct } from './rules';
import { DEFS, type GameState, cloneState, player, unitAt } from './state';

export const FINAL_DEPTH = 14;

export interface TurnResult {
  state: GameState;
  events: Ev[];
}

function clearLevel(c: Ctx): void {
  const s = c.s;
  for (const b of s.bones) emit(c, { t: 'crush', at: b.pos });
  s.bones = [];
  for (const u of s.units.slice()) {
    if (u.kind === 'bomb') {
      s.units.splice(s.units.indexOf(u), 1);
      emit(c, { t: 'die', id: u.id, cause: 'banish', pos: u.pos, kind: u.kind });
    }
  }
  s.stats.levelsCleared++;
  s.stats.score += 50;
  s.outcome = s.depth >= FINAL_DEPTH ? 'won' : 'cleared';
  emit(c, { t: 'clear' });
}

const dead = (s: GameState): boolean => s.outcome === 'dead';

function levelEmpty(s: GameState): boolean {
  return enemies(s).length === 0;
}

function endOfRound(c: Ctx): void {
  const s = c.s;
  // Fire burns whoever stands in it, then dies down.
  for (const [k, t] of s.tiles) {
    if (t.fire <= 0) continue;
    const u = unitAt(s, k);
    if (u && !DEFS[u.kind].flying) damage(c, u, 1, null, 'burn');
    if (dead(s)) return;
    t.fire--;
  }
  // Bomb fuses.
  for (const u of s.units.slice()) {
    if (u.kind !== 'bomb' || u.hp <= 0) continue;
    u.timer--;
    if (u.timer <= 0) explode(c, u.pos, u);
    else emit(c, { t: 'fuse', id: u.id, timer: u.timer });
    if (dead(s)) return;
  }
  // Bones re-form.
  for (const b of s.bones.slice()) {
    b.timer--;
    if (b.timer <= 0 && !unitAt(s, b.pos)) {
      s.bones.splice(s.bones.indexOf(b), 1);
      emit(c, { t: 'crush', at: b.pos });
      spawn(c, 'kosciotrup', b.pos);
      emit(c, { t: 'text', at: b.pos, text: 'POWSTAJE!', color: C_GOLD });
    }
  }
  if (s.hero.leapCd > 0) s.hero.leapCd--;
}

export function runTurn(prev: GameState, action: Action): TurnResult | null {
  if (prev.outcome) return null;
  const c: Ctx = { s: cloneState(prev), ev: [] };
  const s = c.s;
  s.roundKills = 0;
  emit(c, { t: 'phase', p: 'player' });
  if (!playerAct(c, action)) return null;
  s.turn++;
  s.stats.turns++;
  const finish = (): TurnResult => ({ state: s, events: c.ev });
  if (dead(s)) return finish();
  if (levelEmpty(s)) {
    clearLevel(c);
    return finish();
  }
  if (s.tiles.get(player(s).pos)?.t === 'stairs') {
    s.outcome = 'descended';
    return finish();
  }
  emit(c, { t: 'phase', p: 'enemy' });
  const order = s.units.filter((u) => u.kind !== 'player').map((u) => u.id);
  for (const id of order) {
    const u = s.units.find((x) => x.id === id && x.hp > 0);
    if (!u) continue;
    actEnemy(c, u);
    if (dead(s)) return finish();
    if (levelEmpty(s)) break;
  }
  if (!levelEmpty(s)) {
    emit(c, { t: 'phase', p: 'end' });
    endOfRound(c);
    if (dead(s)) return finish();
  }
  if (levelEmpty(s)) clearLevel(c);
  return finish();
}

export interface Preview {
  valid: boolean;
  playerDamage: number;
  lethal: boolean;
  /** Units hit during the player's own action. */
  hits: Map<number, number>;
  kills: Set<number>;
  /** Final positions of units that moved during the player's action. */
  moved: Map<number, number>;
  clears: boolean;
  descends: boolean;
}

export function preview(s: GameState, action: Action): Preview {
  const r = runTurn(s, action);
  const pv: Preview = {
    valid: !!r, playerDamage: 0, lethal: false, hits: new Map(), kills: new Set(), moved: new Map(),
    clears: false, descends: false,
  };
  if (!r) return pv;
  const pid = player(s).id;
  let phase = 'player';
  for (const e of r.events) {
    if (e.t === 'phase') phase = e.p;
    else if (e.t === 'hit' && e.id === pid) pv.playerDamage += e.dmg;
    else if (phase === 'player' && e.t === 'hit') pv.hits.set(e.id, (pv.hits.get(e.id) ?? 0) + e.dmg);
    else if (phase === 'player' && e.t === 'die' && e.id !== pid) pv.kills.add(e.id);
    else if (phase === 'player' && e.t === 'move' && e.id !== pid) pv.moved.set(e.id, e.to);
  }
  pv.lethal = r.state.outcome === 'dead';
  pv.clears = r.state.outcome === 'cleared' || r.state.outcome === 'won';
  pv.descends = r.state.outcome === 'descended';
  return pv;
}

/** Hexes currently marked by enemy wind-ups (for telegraph drawing). */
export function telegraphHexes(s: GameState): { k: number; style: string }[] {
  const out: { k: number; style: string }[] = [];
  for (const u of s.units) {
    if (u.kind === 'bomb') {
      out.push({ k: u.pos, style: 'bomb' });
      for (const n of neighbors(u.pos)) out.push({ k: n, style: 'bomb' });
    }
    if (!u.intent) continue;
    if (u.intent.k === 'explode') {
      for (const n of neighbors(u.pos)) out.push({ k: n, style: 'bomb' });
    } else if (u.intent.k === 'sweep') {
      for (const n of neighbors(u.pos)) out.push({ k: n, style: 'sweep' });
    } else if (u.intent.k === 'charge' || u.intent.k === 'fly') {
      const cp = chargePath(s, u, u.intent.dir);
      for (const k of cp.path) out.push({ k, style: 'charge' });
      if (cp.hit !== undefined) out.push({ k: cp.hit, style: 'charge' });
    } else {
      for (const k of u.intent.hexes) out.push({ k, style: u.intent.k });
    }
  }
  return out;
}
