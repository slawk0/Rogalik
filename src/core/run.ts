import { type Carry, freshCarry, genLevel } from './levelgen';
import { type GameState, player } from './state';
import { hashSeed } from './rng';

export interface Run {
  seed: number;
  daily: boolean;
  state: GameState;
}

export function levelSeed(runSeed: number, depth: number): number {
  return hashSeed(`${runSeed}:${depth}`);
}

export function newRun(seed: number, daily = false): Run {
  return { seed, daily, state: genLevel(0, freshCarry(), levelSeed(seed, 0)) };
}

export function carryFrom(s: GameState): Carry {
  return { hero: { ...s.hero, gifts: s.hero.gifts.slice() }, stats: { ...s.stats }, hp: player(s).hp, nextId: s.nextId };
}

/** Moves to the next depth. After a boss the hero recovers 2 hearts. */
export function nextLevel(run: Run, afterBoss: boolean): void {
  const s = run.state;
  const carry = carryFrom(s);
  if (afterBoss) carry.hp += 2;
  carry.hp = Math.min(carry.hp, carry.hero.maxHp);
  run.state = genLevel(s.depth + 1, carry, levelSeed(run.seed, s.depth + 1));
}

export function dailySeed(d = new Date()): number {
  return hashSeed(`nawia-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
}

export interface Best {
  score: number;
  depth: number;
  wins: number;
}

const BEST_KEY = 'nawia.best.v1';

export function loadBest(): Best {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw) return { score: 0, depth: 0, wins: 0, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { score: 0, depth: 0, wins: 0 };
}

export function saveBest(b: Best): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable */
  }
}
