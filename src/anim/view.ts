import { hexToPx, neighbors } from '../core/hex';
import type { Ev } from '../core/events';
import { DEFS, type GameState, type Kind, type Unit } from '../core/state';
import { sfx } from '../audio/audio';
import { PAL } from '../render/palette';
import { sprite, wispHot } from '../render/sprites';
import { Fx, pixelEllipse, pixelLine } from './fx';

export const FOOT = 4;

interface Tween {
  x0: number; y0: number; x1: number; y1: number;
  t: number; dur: number; arc: number; ease: 'lin' | 'out' | 'inout';
}

export interface VUnit {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  z: number;
  hp: number;
  maxHp: number;
  face: number;
  flash: number;
  alpha: number;
  tween: Tween | null;
  lean: { dx: number; dy: number; t: number; dur: number } | null;
  appear: number;
  fall: number; // > 0 while falling into the void
  sink: number; // > 0 while drowning
  stun: boolean;
  hot: boolean;
  fuse: number;
  phase: number;
  removed: boolean;
}

export interface Effect {
  kind: 'ring' | 'slash' | 'streak' | 'bolt' | 'arrow' | 'dark' | 'roots' | 'flamehex' | 'flash' | 'claw' | 'throw';
  x: number; y: number; x2: number; y2: number;
  t: number; max: number; delay: number;
  color: number;
  pts?: { x: number; y: number }[];
}

const BLOOD: Partial<Record<Kind, number[]>> = {
  player: [8, 7, 26], wilk: [8, 7, 21], bies: [9, 8, 10], dzik: [8, 7, 5], utopiec: [12, 13, 14], ognik: [18, 19, 17],
  licho: [27, 28, 8], kosciotrup: [20, 19, 21], strzyga: [8, 26, 24], upior: [18, 22, 23], leszy: [12, 4, 13],
  jaga: [28, 8, 21], kosciej: [27, 28, 20], bomb: [9, 10, 24], egg: [2, 3, 11],
};

const COMBO_NAMES = ['', '', 'PODWÓJNE!', 'POTRÓJNE!', 'POCZWÓRNE!', 'RZEŹ!', 'POGROM!', 'APOKALIPSA!'];

export class View {
  units = new Map<number, VUnit>();
  bones = new Set<number>();
  fire = new Map<number, number>();
  fx = new Fx();
  effects: Effect[] = [];
  queue: Ev[] = [];
  wait = 0;
  hitstop = 0;
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  flashScreen = 0;
  flashColor = 19;
  slowmo = 0;
  time = 0;
  playerHp = 3;
  comboKills = 0;
  banner: { text: string; sub: string; t: number; max: number; color: number } | null = null;
  onClear: (() => void) | null = null;

  reset(s: GameState): void {
    this.units.clear();
    this.effects = [];
    this.queue = [];
    this.wait = 0;
    this.fx = new Fx();
    for (const u of s.units) this.addUnit(u, false);
    this.bones = new Set(s.bones.map((b) => b.pos));
    this.fire = new Map();
    for (const [k, t] of s.tiles) if (t.fire > 0) this.fire.set(k, t.fire);
    this.playerHp = s.units.find((u) => u.kind === 'player')?.hp ?? 0;
  }

  addUnit(u: Unit, animate: boolean): VUnit {
    const p = hexToPx(u.pos);
    const v: VUnit = {
      id: u.id, kind: u.kind, x: p.x, y: p.y, z: 0, hp: u.hp, maxHp: u.maxHp, face: u.face,
      flash: 0, alpha: 1, tween: null, lean: null, appear: animate ? 0 : 1, fall: 0, sink: 0,
      stun: u.stun > 0, hot: u.intent?.k === 'explode', fuse: u.timer, phase: Math.random() * 10, removed: false,
    };
    this.units.set(u.id, v);
    return v;
  }

  /** Snaps visuals to the logical state (after an animation sequence). */
  sync(s: GameState): void {
    const alive = new Set<number>();
    for (const u of s.units) {
      alive.add(u.id);
      let v = this.units.get(u.id);
      if (!v || v.removed) v = this.addUnit(u, false);
      const p = hexToPx(u.pos);
      if (!v.tween) {
        v.x = p.x;
        v.y = p.y;
      }
      v.hp = u.hp;
      v.maxHp = u.maxHp;
      v.face = u.face;
      v.stun = u.stun > 0;
      v.hot = u.intent?.k === 'explode';
      v.fuse = u.timer;
    }
    for (const [id, v] of this.units) if (!alive.has(id) && !v.removed && v.fall <= 0 && v.sink <= 0) this.units.delete(id);
    this.bones = new Set(s.bones.map((b) => b.pos));
    this.fire = new Map();
    for (const [k, t] of s.tiles) if (t.fire > 0) this.fire.set(k, t.fire);
    this.playerHp = s.units.find((u) => u.kind === 'player')?.hp ?? 0;
  }

  get busy(): boolean {
    if (this.queue.length > 0 || this.wait > 0) return true;
    for (const v of this.units.values()) if (v.tween || v.lean) return true;
    return false;
  }

  play(events: Ev[]): void {
    this.queue.push(...events);
    this.comboKills = 0;
  }

  kick(power: number): void {
    this.shake = Math.max(this.shake, power);
  }

  private tweenTo(v: VUnit, k: number, dur: number, arc: number, ease: Tween['ease']): void {
    const p = hexToPx(k);
    v.tween = { x0: v.x, y0: v.y, x1: p.x, y1: p.y, t: 0, dur, arc, ease };
  }

  private leanAt(v: VUnit, k: number, amount = 4, dur = 0.14): void {
    const p = hexToPx(k);
    const dx = p.x - v.x;
    const dy = p.y - v.y;
    const d = Math.hypot(dx, dy) || 1;
    v.lean = { dx: (dx / d) * amount, dy: (dy / d) * amount, t: 0, dur };
    if (dx > 0) v.face = 1;
    else if (dx < 0) v.face = -1;
  }

  private effect(e: Partial<Effect> & { kind: Effect['kind']; x: number; y: number }): void {
    this.effects.push({ x2: e.x, y2: e.y, t: 0, max: 0.25, delay: 0, color: 19, ...e });
  }

  private shatter(v: VUnit, power = 1): void {
    const sp = v.kind === 'ognik' && v.hot ? wispHot() : sprite(v.kind);
    const flip = v.face < 0;
    const left = v.x - Math.floor(sp.w / 2);
    for (const px of sp.pixels) {
      const lx = flip ? sp.w - 1 - px.x : px.x;
      const zz = sp.h - px.y + v.z + FOOT;
      const wx = left + lx;
      const dxc = wx - v.x;
      this.fx.add({
        x: wx,
        y: v.y + FOOT + (Math.random() - 0.5) * 4,
        z: zz,
        vx: dxc * 4 * power + (Math.random() - 0.5) * 70 * power,
        vy: (Math.random() - 0.5) * 50 * power,
        vz: (40 + Math.random() * 90) * power,
        max: 1.2 + Math.random() * 1.6,
        color: px.c,
        grav: 260,
        bounce: 0.4,
      });
    }
  }

  private handle(e: Ev): number {
    switch (e.t) {
      case 'phase':
        return e.p === 'enemy' ? 0.07 : 0;
      case 'move': {
        const v = this.units.get(e.id);
        if (!v) return 0;
        const isPlayer = v.kind === 'player';
        if (e.style === 'step') {
          this.tweenTo(v, e.to, isPlayer ? 0.11 : 0.13, isPlayer ? 5 : 3, 'inout');
          if (isPlayer) sfx.step();
          const p = hexToPx(e.from);
          this.fx.burst(p.x, p.y + FOOT, 0, 3, [21, 22], 20, 10, 0.4);
          return isPlayer ? 0.09 : 0.035;
        }
        if (e.style === 'fly') {
          this.tweenTo(v, e.to, 0.13, 2, 'inout');
          return 0.04;
        }
        if (e.style === 'charge') {
          this.tweenTo(v, e.to, 0.06, 0, 'lin');
          const p = hexToPx(e.from);
          this.fx.burst(p.x, p.y + FOOT, 0, 4, [3, 4, 21], 30, 20, 0.5);
          sfx.step();
          return 0.06;
        }
        if (e.style === 'push') {
          this.tweenTo(v, e.to, 0.12, 2, 'out');
          const p = hexToPx(e.from);
          this.fx.burst(p.x, p.y + FOOT, 0, 6, [21, 22, 3], 40, 15, 0.5);
          return 0.1;
        }
        if (e.style === 'leap') {
          this.tweenTo(v, e.to, 0.28, 26, 'inout');
          sfx.leap();
          return 0.28;
        }
        if (e.style === 'teleport') {
          const p0 = hexToPx(e.from);
          this.fx.rise(p0.x, p0.y, 4, 18, [12, 13, 14, 4], 8, 30, 0.8);
          const p1 = hexToPx(e.to);
          v.x = p1.x;
          v.y = p1.y;
          v.appear = 0;
          this.fx.rise(p1.x, p1.y, 4, 18, [12, 13, 14, 4], 8, 30, 0.8);
          sfx.roots();
          return 0.25;
        }
        return 0;
      }
      case 'bump': {
        const v = this.units.get(e.id);
        if (!v) return 0;
        this.leanAt(v, e.at, 5, 0.16);
        const p = hexToPx(e.at);
        const mx = (p.x + v.x) / 2;
        const my = (p.y + v.y) / 2;
        this.fx.burst(mx, my + FOOT, 6, 10, [20, 21, 3, 4], 60, 50, 0.5);
        this.effect({ kind: 'flash', x: mx, y: my, max: 0.1, color: 19 });
        sfx.bump();
        this.kick(4);
        this.hitstop = Math.max(this.hitstop, 0.06);
        return 0.08;
      }
      case 'strike': {
        const v = this.units.get(e.id);
        if (!v) return 0;
        const p = hexToPx(e.at);
        if (e.style === 'slash') {
          this.leanAt(v, e.at, 4, 0.12);
          this.effect({ kind: 'slash', x: p.x, y: p.y, x2: v.x, y2: v.y, max: 0.16, color: 19 });
          sfx.slash(1 + this.comboKills * 0.1);
          return 0.05;
        }
        if (e.style === 'lunge') {
          this.leanAt(v, e.at, 7, 0.16);
          this.effect({ kind: 'streak', x: v.x, y: v.y, x2: p.x, y2: p.y, max: 0.16, color: 19 });
          sfx.lunge();
          this.kick(3);
          return 0.06;
        }
        if (e.style === 'shove') {
          this.leanAt(v, e.at, 6, 0.14);
          this.fx.burst(p.x, p.y + FOOT, 6, 6, [19, 20], 50, 30, 0.3);
          sfx.shove();
          this.kick(2);
          return 0.06;
        }
        if (e.style === 'bite') {
          this.leanAt(v, e.at, 6, 0.14);
          this.effect({ kind: 'claw', x: p.x, y: p.y, max: 0.2, color: 8 });
          return 0.08;
        }
        if (e.style === 'throw') {
          this.leanAt(v, e.at, 3, 0.15);
          this.effect({ kind: 'throw', x: v.x, y: v.y, x2: p.x, y2: p.y, max: 0.25, color: 24 });
          sfx.hop();
          return 0.22;
        }
        if (e.style === 'sweep') {
          this.leanAt(v, e.at, 2, 0.2);
          this.effect({ kind: 'ring', x: v.x, y: v.y, max: 0.3, color: 28 });
          sfx.slash(0.6);
          this.kick(4);
          return 0.1;
        }
        // cast
        v.flash = 0.08;
        this.fx.rise(v.x, v.y, 10, 8, [10, 11, 19], 5, 25, 0.5);
        return 0.08;
      }
      case 'hit': {
        const v = this.units.get(e.id);
        if (!v) return 0;
        v.flash = 0.12;
        v.hp = e.hp;
        const isPlayer = v.kind === 'player';
        const cols = BLOOD[v.kind] ?? [19];
        this.fx.burst(v.x, v.y + FOOT, 8, isPlayer ? 14 : 10, cols, 55, 70, 0.8);
        this.fx.burst(v.x, v.y + FOOT, 10, 4, [19, 11], 70, 50, 0.3);
        this.fx.text(v.x, v.y - 18, `-${e.dmg}`, isPlayer ? 8 : 19, isPlayer);
        if (isPlayer) {
          this.playerHp = e.hp;
          sfx.hurt();
          this.kick(6);
          this.hitstop = Math.max(this.hitstop, 0.13);
          this.flashScreen = 0.15;
          this.flashColor = 8;
        } else {
          sfx.hit(this.comboKills);
          this.kick(DEFS[v.kind].boss ? 4 : 3);
          this.hitstop = Math.max(this.hitstop, 0.075);
        }
        return 0.06;
      }
      case 'block': {
        const v = this.units.get(e.id);
        if (v) {
          v.flash = 0.1;
          this.fx.text(v.x, v.y - 18, 'BLOK!', 18, true);
          this.fx.burst(v.x, v.y, 10, 12, [18, 19, 17], 60, 40, 0.5);
        }
        sfx.block();
        this.hitstop = Math.max(this.hitstop, 0.08);
        return 0.15;
      }
      case 'immortal': {
        const v = this.units.get(e.id);
        if (v) {
          v.flash = 0.1;
          this.fx.text(v.x, v.y - 26, 'NIEŚMIERTELNY', 28, false, 1.1);
          this.fx.rise(v.x, v.y, 10, 10, [27, 28], 8, 20, 0.7);
        }
        sfx.immortal();
        return 0.12;
      }
      case 'die': {
        const v = this.units.get(e.id);
        const p = hexToPx(e.pos);
        if (e.kind !== 'bomb' && e.kind !== 'egg' && e.kind !== 'player' && e.cause !== 'banish') this.comboKills++;
        if (!v) return 0;
        if (e.cause === 'drown') {
          v.sink = 0.001;
          this.fx.burst(p.x, p.y + 2, 2, 22, [17, 18, 19, 16], 50, 110, 0.8);
          this.effect({ kind: 'ring', x: p.x, y: p.y + 2, max: 0.5, color: 18 });
          sfx.splash();
        } else if (e.cause === 'fall') {
          v.fall = 0.001;
          sfx.fall();
        } else if (e.cause === 'burn') {
          this.shatter(v, 0.6);
          v.removed = true;
          this.fx.rise(p.x, p.y, 4, 24, [9, 10, 11, 8], 7, 45, 0.9);
          sfx.burn();
        } else if (e.cause === 'explode' && e.kind === 'bomb') {
          v.removed = true;
        } else {
          this.shatter(v, e.cause === 'explode' ? 1.4 : 1);
          v.removed = true;
          if (e.kind === 'egg') sfx.egg();
          else if (e.kind !== 'player') sfx.die(this.comboKills);
        }
        if (e.kind === 'player') {
          sfx.death();
          this.slowmo = 1.2;
          this.kick(8);
          this.hitstop = 0.3;
          this.flashScreen = 0.3;
          this.flashColor = 8;
          return 0.6;
        }
        if (e.kind !== 'bomb' && e.cause !== 'banish') {
          this.fx.text(p.x, p.y - 8, `+${10 * Math.max(1, this.comboKills)}`, 10, false, 0.8);
          this.hitstop = Math.max(this.hitstop, 0.05);
          this.kick(3);
        }
        if (DEFS[e.kind].boss) {
          this.slowmo = 1.5;
          this.hitstop = 0.35;
          this.kick(10);
          this.flashScreen = 0.4;
          this.flashColor = 19;
          sfx.roar();
          sfx.boom();
          return 0.8;
        }
        return e.cause === 'banish' ? 0.02 : 0.07;
      }
      case 'beam': {
        const from = hexToPx(e.from);
        if (e.style === 'fire') {
          e.hexes.forEach((k, i) => {
            const p = hexToPx(k);
            this.effect({ kind: 'flamehex', x: p.x, y: p.y, delay: i * 0.035, max: 0.45, color: 9 });
          });
          sfx.fire();
          this.kick(3);
          return 0.18;
        }
        if (e.style === 'arrow') {
          const last = hexToPx(e.hexes[e.hexes.length - 1]);
          this.effect({ kind: 'arrow', x: from.x, y: from.y, x2: last.x, y2: last.y, max: 0.14, color: 18 });
          sfx.arrow();
          return 0.13;
        }
        if (e.style === 'bolt') {
          for (const k of e.hexes) {
            const p = hexToPx(k);
            this.effect({ kind: 'bolt', x: from.x, y: from.y, x2: p.x, y2: p.y, max: 0.22, color: 11 });
            this.fx.burst(p.x, p.y + FOOT, 10, 8, [11, 19, 18], 60, 60, 0.4);
          }
          this.flashScreen = 0.06;
          this.flashColor = 11;
          sfx.bolt();
          return 0.1;
        }
        if (e.style === 'dark') {
          e.hexes.forEach((k, i) => {
            const p = hexToPx(k);
            this.effect({ kind: 'dark', x: p.x, y: p.y, delay: i * 0.03, max: 0.4, color: 28 });
          });
          sfx.dark();
          this.kick(3);
          return 0.18;
        }
        // roots
        e.hexes.forEach((k, i) => {
          const p = hexToPx(k);
          this.effect({ kind: 'roots', x: p.x, y: p.y, delay: i * 0.03, max: 0.55, color: 4 });
        });
        sfx.roots();
        this.kick(4);
        return 0.2;
      }
      case 'boom': {
        const p = hexToPx(e.at);
        this.effect({ kind: 'ring', x: p.x, y: p.y, max: 0.35, color: 10 });
        this.effect({ kind: 'flash', x: p.x, y: p.y, max: 0.12, color: 11 });
        this.fx.burst(p.x, p.y + FOOT, 6, 34, [9, 10, 11, 8, 19], 110, 120, 0.9);
        this.fx.rise(p.x, p.y, 6, 14, [22, 23, 21], 12, 25, 1.1);
        for (const n of neighbors(e.at)) {
          const q = hexToPx(n);
          this.effect({ kind: 'flamehex', x: q.x, y: q.y, delay: 0.02, max: 0.3, color: 9 });
        }
        sfx.boom();
        this.kick(7);
        this.hitstop = Math.max(this.hitstop, 0.09);
        this.flashScreen = 0.08;
        this.flashColor = 10;
        return 0.14;
      }
      case 'intent': {
        const v = this.units.get(e.id);
        if (v) {
          v.flash = 0.06;
          if (v.kind === 'ognik') v.hot = true;
          this.fx.text(v.x, v.y - 20, '!', 8, true, 0.5);
        }
        sfx.intent();
        return 0.06;
      }
      case 'spawn': {
        const v = this.addUnit(e.unit, true);
        if (e.unit.kind === 'bomb') {
          v.appear = 1;
          return 0.03;
        }
        this.fx.rise(v.x, v.y, 2, 12, [22, 23, 27], 6, 25, 0.7);
        sfx.spawn();
        return 0.08;
      }
      case 'ignite': {
        for (const k of e.hexes) {
          this.fire.set(k, 2);
          const p = hexToPx(k);
          this.fx.rise(p.x, p.y, 2, 6, [9, 10, 11], 6, 30, 0.6);
        }
        sfx.fire();
        return 0.05;
      }
      case 'heal': {
        const v = this.units.get(e.id);
        if (v) {
          this.fx.text(v.x, v.y - 18, `+${e.amount}`, 12, true);
          this.fx.rise(v.x, v.y, 6, 14, [12, 13, 19], 6, 30, 0.8);
        }
        if (v?.kind === 'player') this.playerHp = e.hp;
        sfx.heal();
        return 0.15;
      }
      case 'bones':
        this.bones.add(e.at);
        return 0;
      case 'crush': {
        if (this.bones.has(e.at)) {
          const p = hexToPx(e.at);
          this.fx.burst(p.x, p.y + FOOT, 2, 10, [19, 20, 21], 40, 40, 0.7);
          sfx.crush();
        }
        this.bones.delete(e.at);
        return 0.03;
      }
      case 'combo': {
        const name = COMBO_NAMES[Math.min(e.n, COMBO_NAMES.length - 1)];
        const p = hexToPx(e.at);
        this.fx.text(p.x, p.y - 30, name, e.n >= 4 ? 8 : e.n === 3 ? 9 : 10, true, 1.3);
        sfx.combo(e.n);
        this.kick(3 + e.n);
        return 0.02;
      }
      case 'shockwave': {
        const p = hexToPx(e.at);
        const v = [...this.units.values()].find((u) => u.kind === 'player');
        if (v) {
          v.tween = null;
          v.x = p.x;
          v.y = p.y;
        }
        this.effect({ kind: 'ring', x: p.x, y: p.y, max: 0.3, color: 20 });
        this.fx.burst(p.x, p.y + FOOT, 0, 22, [3, 4, 21, 20], 90, 40, 0.6);
        sfx.land();
        this.kick(6);
        this.hitstop = Math.max(this.hitstop, 0.07);
        return 0.1;
      }
      case 'stun': {
        const v = this.units.get(e.id);
        if (v) {
          v.stun = true;
          this.fx.text(v.x, v.y - 20, 'OGŁUSZONY', 11, false, 0.9);
        }
        return 0.08;
      }
      case 'fuse': {
        const v = this.units.get(e.id);
        if (v) {
          v.fuse = e.timer;
          v.flash = 0.06;
        }
        sfx.intent();
        return 0.04;
      }
      case 'text': {
        const p = hexToPx(e.at);
        this.fx.text(p.x, p.y - 22, e.text, e.color, e.text.length > 4, 1.1);
        return e.text === '...' ? 0 : 0.1;
      }
      case 'eggbreak': {
        const p = hexToPx(e.at);
        this.effect({ kind: 'ring', x: p.x, y: p.y, max: 0.6, color: 11 });
        this.fx.rise(p.x, p.y, 4, 40, [11, 10, 19], 10, 50, 1.4);
        this.kick(9);
        this.hitstop = 0.25;
        this.flashScreen = 0.3;
        this.flashColor = 11;
        return 0.5;
      }
      case 'clear': {
        this.slowmo = Math.max(this.slowmo, 0.9);
        this.banner = { text: 'OCZYSZCZONE!', sub: '', t: 0, max: 1.6, color: 11 };
        sfx.clear();
        this.onClear?.();
        return 0.7;
      }
    }
    return 0;
  }

  update(realDt: number): void {
    this.time += realDt;
    // Screen shake decays in real time.
    this.shake = Math.max(0, this.shake - realDt * 30);
    const sh = Math.floor(this.shake);
    this.shakeX = sh > 0 ? Math.round((Math.random() * 2 - 1) * sh) : 0;
    this.shakeY = sh > 0 ? Math.round((Math.random() * 2 - 1) * sh * 0.7) : 0;
    this.flashScreen = Math.max(0, this.flashScreen - realDt);
    if (this.banner) {
      this.banner.t += realDt;
      if (this.banner.t > this.banner.max) this.banner = null;
    }
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      return;
    }
    let dt = realDt;
    if (this.slowmo > 0) {
      this.slowmo -= realDt;
      dt *= 0.35;
    }
    this.fx.update(dt);
    for (const e of this.effects) {
      if (e.delay > 0) e.delay -= dt;
      else e.t += dt;
    }
    this.effects = this.effects.filter((e) => e.t < e.max);
    for (const v of this.units.values()) {
      if (v.flash > 0) v.flash -= dt;
      if (v.appear < 1) v.appear = Math.min(1, v.appear + dt * 4);
      if (v.tween) {
        const tw = v.tween;
        tw.t += dt;
        let k = Math.min(1, tw.t / tw.dur);
        const e = tw.ease === 'out' ? 1 - (1 - k) * (1 - k) : tw.ease === 'inout' ? k * k * (3 - 2 * k) : k;
        v.x = tw.x0 + (tw.x1 - tw.x0) * e;
        v.y = tw.y0 + (tw.y1 - tw.y0) * e;
        v.z = Math.sin(k * Math.PI) * tw.arc;
        if (k >= 1) {
          v.tween = null;
          v.z = 0;
          k = 1;
        }
      }
      if (v.lean) {
        v.lean.t += dt;
        if (v.lean.t >= v.lean.dur) v.lean = null;
      }
      if (v.fall > 0) {
        v.fall += dt;
        if (v.fall > 0.9) v.removed = true;
      }
      if (v.sink > 0) {
        v.sink += dt;
        if (v.sink > 0.6) {
          if (v.kind === 'player') v.alpha = 0;
          else v.removed = true;
        }
      }
    }
    for (const [id, v] of this.units) if (v.removed) this.units.delete(id);
    // Sequencer.
    if (this.wait > 0) this.wait -= dt;
    while (this.wait <= 0 && this.queue.length) {
      this.wait += this.handle(this.queue.shift()!);
      if (this.hitstop > 0) break;
    }
    if (this.wait < 0 && !this.queue.length) this.wait = 0;
  }

  // ------------------------------------------------------------ drawing

  drawShadow(ctx: CanvasRenderingContext2D, v: VUnit, ox: number, oy: number): void {
    if (v.fall > 0 || v.sink > 0) return;
    const big = DEFS[v.kind].boss;
    const w = big ? 14 : v.kind === 'bomb' ? 5 : 8;
    const flying = DEFS[v.kind].flying && v.kind !== 'jaga' ? 0.7 : 1;
    ctx.fillStyle = 'rgba(24,20,37,0.45)';
    const x = Math.round(ox + v.x);
    const y = Math.round(oy + v.y + FOOT);
    const ww = Math.round(w * flying - v.z * 0.15);
    ctx.fillRect(x - ww, y - 1, ww * 2, 3);
    ctx.fillRect(x - ww + 2, y - 2, ww * 2 - 4, 5);
  }

  drawUnit(ctx: CanvasRenderingContext2D, v: VUnit, ox: number, oy: number): void {
    const sp = v.kind === 'ognik' && v.hot ? wispHot() : sprite(v.kind);
    const frame = Math.floor((this.time + v.phase) * 2) % 2;
    const flip = v.face < 0;
    let lx = 0;
    let ly = 0;
    if (v.lean) {
      const k = Math.sin((v.lean.t / v.lean.dur) * Math.PI);
      lx = v.lean.dx * k;
      ly = v.lean.dy * k;
    }
    let hover = 0;
    const def = DEFS[v.kind];
    if (def.flying) hover = (v.kind === 'jaga' ? 4 : 6) + Math.round(Math.sin((this.time + v.phase) * 3) * 1.5);
    let x = Math.round(ox + v.x + lx - Math.floor(sp.w / 2));
    let y = Math.round(oy + v.y + ly + FOOT - sp.h - v.z - hover);
    const prevA = ctx.globalAlpha;
    let alpha = v.alpha * v.appear;
    if (v.fall > 0) {
      y += Math.round(v.fall * v.fall * 140);
      alpha *= Math.max(0, 1 - v.fall / 0.9);
    }
    let cut = 0;
    if (v.sink > 0) cut = Math.min(sp.h - 1, Math.round((v.sink / 0.6) * sp.h));
    if (v.kind === 'bomb' && v.fuse <= 1) x += Math.round(Math.sin(this.time * 60));
    ctx.globalAlpha = prevA * alpha;
    const img = v.flash > 0 ? (flip ? sp.flashFlipped : sp.flash) : (flip ? sp.flipped : sp.frames)[frame];
    if (cut > 0) ctx.drawImage(img, 0, 0, sp.w, sp.h - cut, x, y + cut, sp.w, sp.h - cut);
    else ctx.drawImage(img, x, y);
    ctx.globalAlpha = prevA;
  }

  drawEffects(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const e of this.effects) {
      if (e.delay > 0) continue;
      const k = e.t / e.max;
      const col = PAL[e.color];
      const x = Math.round(ox + e.x);
      const y = Math.round(oy + e.y);
      switch (e.kind) {
        case 'ring': {
          const r = 4 + k * 24;
          pixelEllipse(ctx, x, y + FOOT, r, r * 0.55, col, k < 0.5 ? 2 : 1);
          break;
        }
        case 'flash': {
          ctx.fillStyle = col;
          const r = Math.round(6 * (1 - k)) + 1;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
          break;
        }
        case 'slash': {
          // Crescent around the target, sweeping across.
          const ang0 = Math.atan2(e.y - e.y2, e.x - e.x2) - 1.2;
          const n = 9;
          for (let i = 0; i < n; i++) {
            const a = ang0 + (i / n) * 2.4 * Math.min(1, k * 2.2);
            const rr = 9;
            const px = Math.round(x + Math.cos(a) * rr * 0.3);
            const py = Math.round(y - 6 + Math.sin(a) * rr);
            ctx.fillStyle = i > n - 3 ? PAL[19] : PAL[20];
            ctx.fillRect(px + Math.round(Math.cos(a) * 6), py, 2, 2);
          }
          break;
        }
        case 'streak': {
          const x2 = Math.round(ox + e.x2);
          const y2 = Math.round(oy + e.y2);
          const t0 = Math.max(0, k * 1.6 - 0.6);
          const t1 = Math.min(1, k * 1.6);
          pixelLine(ctx, x + (x2 - x) * t0, y - 6 + (y2 - y) * t0, x + (x2 - x) * t1, y - 6 + (y2 - y) * t1, PAL[19], 2);
          break;
        }
        case 'bolt': {
          if (!e.pts || Math.random() < 0.3) {
            const pts = [];
            const n = 6;
            for (let i = 0; i <= n; i++) {
              const t = i / n;
              pts.push({
                x: e.x + (e.x2 - e.x) * t + (i > 0 && i < n ? (Math.random() - 0.5) * 10 : 0),
                y: e.y - 8 + (e.y2 - e.y) * t + (i > 0 && i < n ? (Math.random() - 0.5) * 10 : 0),
              });
            }
            e.pts = pts;
          }
          for (let i = 0; i < e.pts.length - 1; i++) {
            const a = e.pts[i];
            const b = e.pts[i + 1];
            pixelLine(ctx, ox + a.x, oy + a.y, ox + b.x, oy + b.y, PAL[11], 2);
            pixelLine(ctx, ox + a.x, oy + a.y, ox + b.x, oy + b.y, PAL[19], 1);
          }
          break;
        }
        case 'arrow': {
          const x2 = ox + e.x2;
          const y2 = oy + e.y2;
          const px = x + (x2 - x) * k;
          const py = y - 8 + (y2 - y) * k;
          const tx = x + (x2 - x) * Math.max(0, k - 0.3);
          const ty = y - 8 + (y2 - y) * Math.max(0, k - 0.3);
          pixelLine(ctx, tx, ty, px, py, PAL[18], 1);
          ctx.fillStyle = PAL[19];
          ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
          break;
        }
        case 'throw': {
          const x2 = ox + e.x2;
          const y2 = oy + e.y2;
          const px = x + (x2 - x) * k;
          const py = y - 8 + (y2 - y + 8) * k - Math.sin(k * Math.PI) * 26;
          ctx.fillStyle = PAL[24];
          ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
          ctx.fillStyle = PAL[10];
          ctx.fillRect(Math.round(px), Math.round(py) - 3, 1, 1);
          break;
        }
        case 'flamehex': {
          const h = Math.round(Math.sin(k * Math.PI) * 14);
          for (let i = 0; i < 7; i++) {
            const fx = x - 8 + i * 3 + Math.round(Math.sin(this.time * 30 + i) * 1);
            const fh = Math.round(h * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + this.time * 20))));
            ctx.fillStyle = PAL[8];
            ctx.fillRect(fx, y + 4 - fh, 3, fh);
            ctx.fillStyle = PAL[9];
            ctx.fillRect(fx, y + 4 - Math.round(fh * 0.75), 2, Math.round(fh * 0.75));
            ctx.fillStyle = PAL[11];
            ctx.fillRect(fx, y + 4 - Math.round(fh * 0.35), 1, Math.round(fh * 0.35));
          }
          break;
        }
        case 'dark': {
          const r = Math.round(3 + Math.sin(k * Math.PI) * 6);
          pixelEllipse(ctx, x, y, r, r * 0.6, PAL[28], 2);
          pixelEllipse(ctx, x, y - 4, r * 0.6, r * 0.5, PAL[27], 1);
          break;
        }
        case 'roots': {
          const h = Math.round(Math.sin(Math.min(1, k * 1.5) * Math.PI * 0.5) * 12 * (1 - Math.max(0, k - 0.7) / 0.3));
          for (let i = 0; i < 5; i++) {
            const rx = x - 8 + i * 4;
            const rh = Math.max(0, h - (i % 2) * 4);
            ctx.fillStyle = PAL[5];
            ctx.fillRect(rx, y + 3 - rh, 3, rh);
            ctx.fillStyle = PAL[4];
            ctx.fillRect(rx + 1, y + 3 - rh, 1, rh);
          }
          break;
        }
        case 'claw': {
          for (let i = 0; i < 3; i++) {
            const t = Math.min(1, k * 2);
            pixelLine(ctx, x - 6 + i * 4, y - 12, x - 6 + i * 4 + 5 * t, y - 12 + 10 * t, PAL[8], 1);
          }
          break;
        }
      }
    }
  }
}
