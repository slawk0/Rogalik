import { dist, disk } from './hex';
import { type Action, canLeapTo, enemies } from './rules';
import { preview } from './turn';
import { DEFS, type GameState, player } from './state';

/** Greedy one-turn lookahead player. Used for balance simulations and the title screen demo. */
export function botAction(s: GameState, noise = 0, rnd: () => number = Math.random): Action {
  const p = player(s);
  const acts: Action[] = [{ t: 'wait' }];
  for (let d = 0; d < 6; d++) acts.push({ t: 'move', dir: d });
  if (s.hero.leapCd === 0) for (const k of disk(p.pos, 3)) if (canLeapTo(s, k)) acts.push({ t: 'leap', to: k });
  const foes = enemies(s);
  let best: Action = { t: 'wait' };
  let bestV = -Infinity;
  for (const a of acts) {
    const pv = preview(s, a);
    if (!pv.valid) continue;
    let v = 0;
    if (pv.lethal) v -= 10000;
    v -= pv.playerDamage * 120;
    v += pv.kills.size * 40;
    for (const [id, dmg] of pv.hits) {
      const u = s.units.find((x) => x.id === id);
      v += dmg * (u && DEFS[u.kind].boss ? 40 : u && u.kind === 'egg' ? 30 : 8);
    }
    if (pv.clears) v += 300;
    if (a.t === 'leap') v -= 15;
    if (a.t === 'wait') v -= 2;
    if (pv.hits.size === 0 && pv.moved.size > 0) v -= 4; // pointless shoves
    if (s.turn > 40) v -= 0; 
    // Approach enemies a bit, or the stairs when hurt / when the level drags on.
    let to = p.pos;
    if (a.t === 'move') to = pv.moved.size || pv.hits.size ? p.pos : stepPos(p.pos, a.dir);
    if (a.t === 'leap') to = a.to;
    if (foes.length) {
      const nd = Math.min(...foes.map((f) => dist(f.pos, to)));
      v -= nd * 1.5;
      const boss = foes.find((f) => DEFS[f.kind].boss);
      const egg = s.units.find((u) => u.kind === 'egg');
      const target = egg ?? boss;
      if (target) {
        const d = dist(target.pos, to);
        v -= d * 3;
        if (boss && d === 2 && boss.intent?.k === 'sweep') v += 12;
      }
    }
    if (s.stairs >= 0 && (s.turn > 60 || p.hp === 1)) v -= dist(s.stairs, to) * (s.turn > 60 ? 6 : 3);
    if (pv.descends) v += s.turn > 60 || p.hp === 1 ? 200 : -50;
    v += rnd() * noise;
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return best;
}

import { step } from './hex';
function stepPos(k: number, d: number): number {
  return step(k, d);
}
