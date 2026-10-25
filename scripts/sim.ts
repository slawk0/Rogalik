import { botAction } from '../src/core/bot';
import { offerGifts, takeGift } from '../src/core/gifts';
import { isBossDepth } from '../src/core/levelgen';
import { Rng } from '../src/core/rng';
import { newRun, nextLevel } from '../src/core/run';
import { runTurn } from '../src/core/turn';

const runs = Number(process.argv[2] ?? 200);
let wins = 0;
const deaths: Record<string, number> = {};
const depthReached: number[] = new Array(16).fill(0);
const turnsPerDepth: number[] = new Array(15).fill(0);
const dmgPerDepth: number[] = new Array(15).fill(0);
const visits: number[] = new Array(15).fill(0);
let clears = 0;
let descends = 0;
let stuck = 0;
const stuckAt: Record<number, number> = {};
let totalTurns = 0;
const t0 = Date.now();
for (let i = 0; i < runs; i++) {
  const run = newRun(1000 + i);
  const rng = new Rng(77 + i);
  for (;;) {
    let s = run.state;
    const dmgBefore = s.stats.damageTaken;
    let guard = 0;
    while (!s.outcome && guard++ < 250) {
      const r = runTurn(s, botAction(s, 3, () => rng.next()));
      if (!r) throw new Error('bot chose invalid action');
      s = r.state;
    }
    run.state = s;
    dmgPerDepth[s.depth] += s.stats.damageTaken - dmgBefore;
    turnsPerDepth[s.depth] += s.turn;
    visits[s.depth]++;
    totalTurns += s.turn;
    if (!s.outcome) { stuck++; stuckAt[s.depth] = (stuckAt[s.depth] ?? 0) + 1; break; }
    if (s.outcome === 'dead') {
      deaths[`${s.depth}:${s.killedBy}`] = (deaths[`${s.depth}:${s.killedBy}`] ?? 0) + 1;
      depthReached[s.depth]++;
      break;
    }
    if (s.outcome === 'won') { wins++; depthReached[15]++; break; }
    if (s.outcome === 'cleared') {
      clears++;
      const offer = offerGifts(s, rng);
      if (offer.length) takeGift({ s, ev: [] }, offer[rng.int(offer.length)]);
    } else descends++;
    nextLevel(run, isBossDepth(s.depth));
  }
}
console.log(`runs ${runs}, wins ${wins} (${((wins / runs) * 100).toFixed(1)}%), stuck ${stuck}, clears ${clears}, descends ${descends}, ${(Date.now() - t0)}ms`);
console.log('deaths by depth:', depthReached.map((n, d) => `${d}:${n}`).join(' '));
console.log('avg turns per depth:', turnsPerDepth.map((t, d) => `${d}:${visits[d] ? (t / visits[d]).toFixed(0) : '-'}`).join(' '));
console.log('avg dmg per depth:', dmgPerDepth.map((t, d) => `${d}:${visits[d] ? (t / visits[d]).toFixed(2) : '-'}`).join(' '));
console.log('avg turns per run:', (totalTurns / runs).toFixed(0));
const top = Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('top killers:', top.map(([k, n]) => `${k}=${n}`).join(', '));
console.log('stuck at:', JSON.stringify(stuckAt));
