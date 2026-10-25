import { describe, expect, it } from 'vitest';
import { dist, neighbors } from '../src/core/hex';
import { freshCarry, genLevel, isBossDepth } from '../src/core/levelgen';
import { botAction } from '../src/core/bot';
import { Rng } from '../src/core/rng';
import { newRun, nextLevel } from '../src/core/run';
import { offerGifts, takeGift } from '../src/core/gifts';
import { runTurn } from '../src/core/turn';
import { isEnemy } from '../src/core/state';

function reachable(s: ReturnType<typeof genLevel>, from: number): Set<number> {
  const seen = new Set([from]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    for (const n of neighbors(q[i])) {
      const t = s.tiles.get(n)?.t;
      if (!seen.has(n) && (t === 'floor' || t === 'stairs')) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return seen;
}

describe('generator plansz', () => {
  it('1000 ziaren: wszystkie pola osiągalne, wrogowie z dala od startu', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const depth = seed % 15;
      const s = genLevel(depth, freshCarry(), seed * 7919);
      const p = s.units[0];
      const reach = reachable(s, p.pos);
      for (const [k, t] of s.tiles) if (t.t === 'floor' || t.t === 'stairs') expect(reach.has(k)).toBe(true);
      if (!isBossDepth(depth)) expect(s.tiles.get(s.stairs)?.t).toBe('stairs');
      const foes = s.units.filter(isEnemy);
      expect(foes.length).toBeGreaterThan(0);
      for (const u of foes) expect(dist(u.pos, p.pos)).toBeGreaterThanOrEqual(2);
      const occupied = new Set(s.units.map((u) => u.pos));
      expect(occupied.size).toBe(s.units.length);
    }
  });

  it('bot rozgrywa całe wyprawy bez błędów i zawieszeń', () => {
    for (let i = 0; i < 6; i++) {
      const run = newRun(500 + i);
      const rng = new Rng(i + 1);
      for (let lvl = 0; lvl < 15; lvl++) {
        let s = run.state;
        let guard = 0;
        while (!s.outcome && guard++ < 300) {
          const r = runTurn(s, botAction(s, 3, () => rng.next()));
          expect(r).not.toBeNull();
          s = r!.state;
        }
        run.state = s;
        if (!s.outcome || s.outcome === 'dead' || s.outcome === 'won') break;
        if (s.outcome === 'cleared') {
          const o = offerGifts(s, rng);
          if (o.length) takeGift({ s, ev: [] }, o[0]);
        }
        nextLevel(run, isBossDepth(s.depth));
      }
    }
  });
});
