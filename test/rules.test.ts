import { describe, expect, it } from 'vitest';
import { runTurn, preview } from '../src/core/turn';
import { player } from '../src/core/state';
import { add, at, board } from './helpers';

// Directions: 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW.

describe('cięcie', () => {
  it('rani wroga sąsiadującego przed i po ruchu', () => {
    const s = board();
    add(s, 'player', 0, 0);
    add(s, 'wilk', 1, -1); // NE of player
    add(s, 'wilk', 3, 3); // far away so level is not cleared
    const r = runTurn(s, { t: 'move', dir: 0 })!; // move N to (0,-1); (1,-1) is SE of it -> adjacent
    expect(r.state.units.find((u) => u.kind === 'wilk' && u.pos === at(1, -1))).toBeUndefined();
    expect(r.state.stats.kills).toBe(1);
  });
});

describe('wypad', () => {
  it('ruch w stronę wroga 2 pola dalej zadaje 2 obrażenia', () => {
    const s = board();
    add(s, 'player', 0, 2);
    add(s, 'dzik', 0, 0);
    add(s, 'wilk', 4, -4);
    const r = runTurn(s, { t: 'move', dir: 0 })!;
    expect(r.state.units.some((u) => u.kind === 'dzik')).toBe(false);
  });
});

describe('pchnięcie', () => {
  it('wróg wepchnięty do wody tonie', () => {
    const s = board({ '0,-2': 'water' });
    add(s, 'player', 0, 0);
    add(s, 'dzik', 0, -1);
    add(s, 'wilk', 4, 0);
    const r = runTurn(s, { t: 'move', dir: 0 })!;
    expect(r.state.units.some((u) => u.kind === 'dzik')).toBe(false);
    expect(r.events.some((e) => e.t === 'die' && e.cause === 'drown')).toBe(true);
    expect(player(r.state).pos).toBe(at(0, 0));
  });

  it('zderzenie z innym wrogiem rani obu', () => {
    const s = board();
    add(s, 'player', 0, 0);
    const a = add(s, 'dzik', 0, -1);
    const b = add(s, 'dzik', 0, -2);
    add(s, 'wilk', 4, 0);
    const r = runTurn(s, { t: 'move', dir: 0 })!;
    const hits = r.events.filter((e) => e.t === 'hit' && (e.id === a.id || e.id === b.id));
    expect(hits.length).toBe(2);
  });

  it('zderzenie ze ścianą rani', () => {
    const s = board({ '0,-2': 'wall' });
    add(s, 'player', 0, 0);
    const a = add(s, 'wilk', 0, -1);
    add(s, 'wilk', 4, 0);
    const r = runTurn(s, { t: 'move', dir: 0 })!;
    expect(r.state.units.some((u) => u.id === a.id)).toBe(false);
  });

  it('spychanie poza krawędź wyspy zrzuca, ale latacz zostaje', () => {
    const s = board();
    add(s, 'player', 0, 3);
    add(s, 'wilk', 0, 4);
    add(s, 'wilk', -4, 0);
    const r = runTurn(s, { t: 'move', dir: 3 })!;
    expect(r.events.some((e) => e.t === 'die' && e.cause === 'fall')).toBe(true);

    const s2 = board();
    add(s2, 'player', 0, 3);
    const st = add(s2, 'strzyga', 0, 4);
    add(s2, 'wilk', -4, 0);
    const r2 = runTurn(s2, { t: 'move', dir: 3 })!;
    expect(r2.state.units.find((u) => u.id === st.id)?.hp).toBe(2);
  });

  it('ciężki boss nie przesuwa się, tylko dostaje 1', () => {
    const s = board();
    add(s, 'player', 0, 0);
    const b = add(s, 'leszy', 0, -1);
    const r = runTurn(s, { t: 'move', dir: 0 })!;
    const lb = r.state.units.find((u) => u.id === b.id)!;
    expect(lb.hp).toBe(7);
  });
});

describe('wrogowie', () => {
  it('wilk gryzie z bliska, a podgląd to przewiduje', () => {
    const s = board();
    add(s, 'player', 0, 0);
    add(s, 'wilk', 2, 0);
    const pv = preview(s, { t: 'wait' });
    expect(pv.playerDamage).toBe(0); // wolf only walks up
    const r = runTurn(s, { t: 'wait' })!;
    const pv2 = preview(r.state, { t: 'wait' });
    expect(pv2.playerDamage).toBe(1);
  });

  it('ogień biesa rani też innych wrogów', () => {
    const s = board();
    add(s, 'player', 0, 3);
    const bies = add(s, 'bies', 0, -2);
    const wilk = add(s, 'wilk', 0, 0);
    // Turn 1: bies aligns and winds up (player on the same column).
    let r = runTurn(s, { t: 'wait' })!;
    expect(r.state.units.find((u) => u.id === bies.id)!.intent?.k).toBe('line');
    // Player sidesteps, fire hits whatever stays in the line.
    r = runTurn(r.state, { t: 'move', dir: 4 })!;
    const wilkHit = r.events.some((e) => e.t === 'hit' && e.id === wilk.id);
    const playerHit = r.events.some((e) => e.t === 'hit' && e.id === 0);
    expect(playerHit).toBe(false);
    expect(wilkHit || !r.state.units.some((u) => u.id === wilk.id)).toBe(true);
  });

  it('kości kościotrupa składają się po 3 turach, chyba że je zdepczesz', () => {
    const s = board();
    add(s, 'player', 0, 0);
    add(s, 'kosciotrup', 1, -1, { hp: 1 });
    add(s, 'wilk', -4, 4, { stun: 99 });
    let r = runTurn(s, { t: 'move', dir: 0 })!; // slash kills it
    expect(r.state.bones.length).toBe(1);
    r = runTurn(r.state, { t: 'move', dir: 3 })!;
    r = runTurn(r.state, { t: 'wait' })!;
    expect(r.state.units.some((u) => u.kind === 'kosciotrup')).toBe(true);
  });

  it('bomba wybucha po turze i rani sąsiadów', () => {
    const s = board();
    add(s, 'player', 0, 0);
    add(s, 'bomb', 0, -1, { timer: 1 });
    const w = add(s, 'wilk', 1, -2, { stun: 5 });
    add(s, 'wilk', -4, 4, { stun: 99 });
    const r = runTurn(s, { t: 'wait' })!;
    expect(r.events.some((e) => e.t === 'boom')).toBe(true);
    expect(r.state.units.some((u) => u.id === w.id)).toBe(false);
    expect(player(r.state).hp).toBe(2);
  });

  it('Kościej nie umiera, dopóki jajo jest całe', () => {
    const s = board();
    add(s, 'player', 0, 0);
    add(s, 'kosciej', 0, -1, { hp: 1 });
    add(s, 'egg', 3, 0);
    const r = runTurn(s, { t: 'move', dir: 0 })!;
    expect(r.state.units.find((u) => u.kind === 'kosciej')?.hp).toBe(1);
    expect(r.events.some((e) => e.t === 'immortal')).toBe(true);
  });
});

describe('skok', () => {
  it('fala odpycha sąsiadów i włącza odnowienie', () => {
    const s = board({ '2,-3': 'water' });
    add(s, 'player', 0, 1);
    const w = add(s, 'wilk', 1, -2);
    add(s, 'wilk', -4, 4, { stun: 99 });
    const r = runTurn(s, { t: 'leap', to: at(0, -1) })!; // (1,-2) is NE of (0,-1)
    expect(r.state.units.some((u) => u.id === w.id)).toBe(false);
    expect(r.state.hero.leapCd).toBeGreaterThan(0);
    expect(runTurn(r.state, { t: 'leap', to: at(0, 1) })).toBeNull();
  });
});
