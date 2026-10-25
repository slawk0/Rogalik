import { dirTo, dist, disk, hexToPx, isAdjacent, step } from '../core/hex';
import type { Ev } from '../core/events';
import { GODS, giftById, offerGifts, takeGift } from '../core/gifts';
import { BIOMES, INTRO, LEVELS_PER_BIOME, biomeOf, isBossDepth } from '../core/levelgen';
import { type Action, canLeapTo, enemies, leapMax, leapRange } from '../core/rules';
import { Rng } from '../core/rng';
import { type Run, loadBest, newRun, nextLevel, saveBest } from '../core/run';
import { DEFS, type GameState, type Kind, player, unitAt } from '../core/state';
import { type Preview, preview, runTurn, telegraphHexes } from '../core/turn';
import { initAudio, isMuted, sfx, toggleMute } from '../audio/audio';
import { FOOT, View } from '../anim/view';
import { pixelLine } from '../anim/fx';
import { backgroundCanvas, drawAmbient } from '../render/background';
import { BoardRenderer, drawHex, hexShape, pickHex } from '../render/board';
import { drawText, measure, wrap } from '../render/font';
import { drawHelp } from '../render/help';
import { PAL } from '../render/palette';
import { giftIcon, sprite } from '../render/sprites';
import { bar, dissolve, panel } from '../render/ui';
import type { App, Scene } from './types';

type Mode = 'play' | 'anim' | 'gift' | 'fadeout' | 'fadein' | 'dead' | 'won';

const KEY_DIRS: Record<string, number> = { KeyW: 0, KeyE: 1, KeyD: 2, KeyS: 3, KeyA: 4, KeyQ: 5 };

const TELE_COLOR: Record<string, number> = {
  line: 9, charge: 8, bomb: 10, roots: 8, sweep: 26, explode: 10, fly: 8,
};

const HINTS: Record<number, string[]> = {
  0: [
    'Ruch: kliknij sąsiednie pole albo Q W E / A S D.',
    'Przejdź obok wilka, żeby go ciąć. Wejdź na niego, żeby go pchnąć.',
  ],
  1: [
    'Krok prosto na wroga stojącego 2 pola dalej to WYPAD: 2 obrażenia.',
    'Bies szykuje ogień w linii. Zejdź z czerwonych pól albo wepchnij tam wroga.',
  ],
  2: [
    'PPM lub F: SKOK. Lądowanie odpycha wszystkich sąsiadów.',
    'Najedź na pole: czaszka = wróg zginie, czerwone ! = tam oberwiesz.',
  ],
};

export class GameScene implements Scene {
  run: Run;
  state: GameState;
  view = new View();
  board = new BoardRenderer();
  mode: Mode = 'fadein';
  fade = 1;
  hover = -1;
  mx = -100;
  my = -100;
  leapMode = false;
  showHelp = false;
  paused = false;
  previews = new Map<string, Preview>();
  offer: string[] = [];
  giftHover = -1;
  giftDelay = 0;
  overlayT = 0;
  intro: Kind[] = [];
  introT = 0;
  seen = new Set<Kind>();
  levelT = 0;
  ox = 0;
  oy = 0;
  w = 480;
  h = 300;
  bestBefore = loadBest();
  newBest = false;
  giftRects: { x: number; y: number; w: number; h: number }[] = [];

  constructor(private app: App, seed: number, daily: boolean) {
    this.run = newRun(seed, daily);
    this.state = this.run.state;
    this.enterLevel();
  }

  // ------------------------------------------------------------ flow

  private enterLevel(): void {
    this.state = this.run.state;
    const biome = biomeOf(this.state.depth);
    this.board.build(this.state, biome);
    this.view.reset(this.state);
    this.previews.clear();
    this.mode = 'fadein';
    this.fade = 1;
    this.levelT = 0;
    this.leapMode = false;
    const kinds = [...new Set(this.state.units.filter((u) => u.kind !== 'player').map((u) => u.kind))];
    this.intro = (INTRO[this.state.depth] ?? []).filter((k) => !this.seen.has(k));
    if (isBossDepth(this.state.depth)) this.intro = [BIOMES[biome].boss];
    if (this.state.depth === 14) this.intro.push('egg');
    for (const k of kinds) this.seen.add(k);
    this.introT = 0;
    const idx = this.state.depth % LEVELS_PER_BIOME;
    const sub = isBossDepth(this.state.depth) ? 'Boss' : `Poziom ${idx + 1}/${LEVELS_PER_BIOME - 1}`;
    this.view.banner = { text: BIOMES[biome].name.toUpperCase(), sub, t: 0, max: 2.4, color: 11 };
    this.app.setMusic(biome);
  }

  private act(a: Action): void {
    if (this.mode !== 'play' || this.paused || this.showHelp) return;
    initAudio();
    const r = runTurn(this.state, a);
    if (!r) {
      sfx.denied();
      return;
    }
    this.state = r.state;
    this.run.state = r.state;
    this.previews.clear();
    this.leapMode = false;
    this.view.play(r.events);
    this.mode = 'anim';
  }

  private turnEnded(): void {
    this.view.sync(this.state);
    const o = this.state.outcome;
    if (!o) {
      this.mode = 'play';
      return;
    }
    if (o === 'dead') {
      this.mode = 'dead';
      this.overlayT = 0;
      this.recordBest(false);
      this.app.setMusic(-1);
      return;
    }
    if (o === 'won') {
      this.mode = 'won';
      this.overlayT = 0;
      this.recordBest(true);
      this.app.setMusic(3);
      return;
    }
    if (o === 'cleared') {
      const rng = new Rng(this.state.rng ^ (this.state.depth * 7919));
      this.offer = offerGifts(this.state, rng);
      this.giftDelay = 0.35;
      this.view.banner = null;
      this.mode = this.offer.length ? 'gift' : 'fadeout';
      this.giftHover = -1;
      this.overlayT = 0;
      if (this.mode === 'fadeout') this.fade = 0;
      return;
    }
    // descended: the hero sinks into the pit before the screen fades.
    sfx.descend();
    const pv = this.view.units.get(player(this.state).id);
    if (pv) pv.sink = 0.001;
    this.mode = 'fadeout';
    this.fade = -0.5;
  }

  private recordBest(won: boolean): void {
    const b = loadBest();
    const s = this.state.stats;
    this.newBest = s.score > b.score;
    saveBest({ score: Math.max(b.score, s.score), depth: Math.max(b.depth, this.state.depth + 1), wins: b.wins + (won ? 1 : 0) });
  }

  private pickGift(i: number): void {
    if (this.mode !== 'gift' || this.giftDelay > 0 || i < 0 || i >= this.offer.length) return;
    const id = this.offer[i];
    const ev: Ev[] = [];
    takeGift({ s: this.state, ev }, id);
    this.view.play(ev);
    this.view.fx.text(hexToPx(player(this.state).pos).x, hexToPx(player(this.state).pos).y - 30, giftById(id).name, GODS[giftById(id).god].color, true, 1.4);
    sfx.gift();
    this.mode = 'fadeout';
    this.fade = -0.6; // short pause before the screen fades
  }

  // ------------------------------------------------------------ input

  private actionFor(k: number, leap: boolean): Action | null {
    const p = player(this.state);
    if (k < 0) return null;
    if (leap) return canLeapTo(this.state, k) ? { t: 'leap', to: k } : null;
    if (k === p.pos) return { t: 'wait' };
    if (isAdjacent(k, p.pos)) return { t: 'move', dir: dirTo(p.pos, k) };
    return null;
  }

  private previewFor(a: Action): Preview {
    const key = a.t === 'move' ? `m${a.dir}` : a.t === 'leap' ? `l${a.to}` : 'w';
    let pv = this.previews.get(key);
    if (!pv) {
      pv = preview(this.state, a);
      this.previews.set(key, pv);
    }
    return pv;
  }

  onMouseMove(x: number, y: number): void {
    this.mx = x;
    this.my = y;
    this.hover = pickHex(this.state, x - this.ox + 0.5, y - this.oy + 0.5);
    if (this.mode === 'gift') {
      const prev = this.giftHover;
      this.giftHover = this.giftRects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      if (this.giftHover >= 0 && this.giftHover !== prev) sfx.select();
    }
  }

  onMouseDown(x: number, y: number, button: number): void {
    initAudio();
    this.onMouseMove(x, y);
    if (this.showHelp) {
      this.showHelp = false;
      return;
    }
    if (this.paused) {
      this.paused = false;
      return;
    }
    if (this.mode === 'gift') {
      this.pickGift(this.giftHover);
      return;
    }
    if (this.mode === 'dead' || this.mode === 'won') {
      if (this.overlayT > 1) this.app.startRun((Math.random() * 2 ** 31) | 0, false);
      return;
    }
    if (this.mode !== 'play') return;
    // HUD: leap button.
    if (x < 70 && y > this.h - 34 && y < this.h - 4) {
      this.toggleLeap();
      return;
    }
    const a = this.actionFor(this.hover, button === 2 || this.leapMode);
    if (a) this.act(a);
    else if (button === 2 && this.state.hero.leapCd > 0) sfx.denied();
    else if (this.hover >= 0 && this.leapMode) sfx.denied();
  }

  private toggleLeap(): void {
    if (this.state.hero.leapCd > 0) {
      sfx.denied();
      this.view.fx.text(hexToPx(player(this.state).pos).x, hexToPx(player(this.state).pos).y - 24, `Skok za ${this.state.hero.leapCd}`, 21, false, 0.8);
      return;
    }
    this.leapMode = !this.leapMode;
    sfx.select();
  }

  onKey(code: string): void {
    initAudio();
    if (code === 'KeyM') {
      toggleMute();
      return;
    }
    if (code === 'KeyH' || code === 'F1') {
      this.showHelp = !this.showHelp;
      return;
    }
    if (this.showHelp) {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') this.showHelp = false;
      return;
    }
    if (code === 'Escape') {
      if (this.leapMode) this.leapMode = false;
      else if (this.mode === 'play' || this.mode === 'anim') this.paused = !this.paused;
      return;
    }
    if (this.paused) {
      if (code === 'KeyT') this.app.toTitle();
      else this.paused = false;
      return;
    }
    if (this.mode === 'gift') {
      if (code === 'Digit1' || code === 'Numpad1') this.pickGift(0);
      if (code === 'Digit2' || code === 'Numpad2') this.pickGift(1);
      if (code === 'Digit3' || code === 'Numpad3') this.pickGift(2);
      return;
    }
    if (this.mode === 'dead' || this.mode === 'won') {
      if (this.overlayT > 1 && (code === 'KeyR' || code === 'Enter' || code === 'Space')) this.app.startRun((Math.random() * 2 ** 31) | 0, false);
      if (code === 'KeyT') this.app.toTitle();
      return;
    }
    if (this.mode !== 'play') return;
    if (code === 'KeyF' || code === 'Digit1') {
      this.toggleLeap();
      return;
    }
    if (code === 'Space' || code === 'Period') {
      this.act({ t: 'wait' });
      return;
    }
    const d = KEY_DIRS[code];
    if (d !== undefined) {
      const p = player(this.state);
      if (this.leapMode) {
        const range = leapRange(this.state);
        for (let n = range; n >= 1; n--) {
          const k = step(p.pos, d, n);
          if (canLeapTo(this.state, k)) {
            this.act({ t: 'leap', to: k });
            return;
          }
        }
        sfx.denied();
        return;
      }
      this.act({ t: 'move', dir: d });
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number): void {
    this.view.update(dt);
    this.levelT += dt;
    this.introT += dt;
    this.overlayT += dt;
    if (this.mode === 'anim' && !this.view.busy) this.turnEnded();
    if (this.mode === 'fadein') {
      this.fade -= dt * 2.5;
      if (this.fade <= 0) {
        this.fade = 0;
        this.mode = 'play';
      }
    }
    if (this.mode === 'gift' && this.giftDelay > 0) this.giftDelay -= dt;
    if (this.mode === 'fadeout') {
      if (this.view.busy) return;
      this.fade += dt * 2.2;
      if (this.fade >= 1) {
        const wasBoss = isBossDepth(this.state.depth);
        nextLevel(this.run, wasBoss);
        this.enterLevel();
      }
    }
  }

  // ------------------------------------------------------------ drawing

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.ox = Math.floor(w / 2);
    this.oy = Math.floor(h / 2) + 10;
    const biome = biomeOf(this.state.depth);
    ctx.drawImage(backgroundCanvas(w, h, biome), 0, 0);
    drawAmbient(ctx, w, h, biome, this.view.time);
    const ox = this.ox + this.view.shakeX;
    const oy = this.oy + this.view.shakeY;
    this.board.draw(ctx, ox, oy, this.view.time, this.view.fire);
    const idle = this.mode === 'play' && !this.paused && !this.showHelp;
    if (idle) this.drawGroundOverlays(ctx, ox, oy);
    // Bones.
    for (const k of this.view.bones) {
      const p = hexToPx(k);
      ctx.drawImage(sprite('bones').frames[0], Math.round(ox + p.x - 5), Math.round(oy + p.y));
    }
    // Shadows, then y-sorted walls and units.
    for (const v of this.view.units.values()) this.view.drawShadow(ctx, v, ox, oy);
    const items: { y: number; draw: () => void }[] = [];
    for (const wd of this.board.walls) {
      const p = hexToPx(wd.k);
      items.push({ y: p.y, draw: () => ctx.drawImage(wd.sp.frames[0], Math.round(ox + p.x - wd.sp.w / 2), Math.round(oy + p.y + 6 - wd.sp.h)) });
    }
    for (const v of this.view.units.values()) items.push({ y: v.y + 0.5, draw: () => this.view.drawUnit(ctx, v, ox, oy) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    this.view.fx.drawParts(ctx, ox, oy);
    this.view.drawEffects(ctx, ox, oy);
    this.drawOverheads(ctx, ox, oy, idle);
    if (idle) this.drawPreviewIcons(ctx, ox, oy);
    this.drawTexts(ctx, ox, oy);
    this.drawHud(ctx, w, h);
    if (this.view.flashScreen > 0) {
      ctx.fillStyle = PAL[this.view.flashColor];
      ctx.globalAlpha = Math.min(0.35, this.view.flashScreen * 2);
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    this.drawBanner(ctx, w, h);
    if (this.mode === 'gift') this.drawGifts(ctx, w, h);
    if (this.mode === 'dead' || this.mode === 'won') this.drawEnd(ctx, w, h);
    if (this.paused) this.drawPause(ctx, w, h);
    if (this.showHelp) drawHelp(ctx, w, h, this.view.time);
    dissolve(ctx, w, h, Math.max(0, Math.min(1, this.fade)));
  }

  private drawGroundOverlays(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const s = this.state;
    const t = this.view.time;
    const pulse = 0.45 + 0.25 * Math.sin(t * 6);
    for (const tg of telegraphHexes(s)) {
      if (!s.tiles.has(tg.k)) continue;
      const col = TELE_COLOR[tg.style] ?? 8;
      ctx.globalAlpha = pulse;
      drawHex(ctx, tg.k, ox, oy, hexShape(col, 'hatch'));
      ctx.globalAlpha = 1;
    }
    const p = player(s);
    // Leap targets.
    if (this.leapMode) {
      for (const k of disk(p.pos, leapRange(s))) {
        if (canLeapTo(s, k)) drawHex(ctx, k, ox, oy, hexShape(18, 'dots'));
      }
    }
    // Danger markers on adjacent hexes (exact one-turn simulation).
    if (!this.leapMode) {
      for (let d = 0; d < 6; d++) {
        const k = step(p.pos, d);
        if (!s.tiles.has(k)) continue;
        const pv = this.previewFor({ t: 'move', dir: d });
        if (pv.valid && pv.playerDamage > 0 && !unitAt(s, k)) {
          drawHex(ctx, k, ox, oy, hexShape(8, 'fill', 0.22));
          ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5);
          drawHex(ctx, k, ox, oy, hexShape(8, 'line'));
          ctx.globalAlpha = 1;
        }
      }
    }
    // Hover.
    if (this.hover >= 0 && s.tiles.has(this.hover)) {
      const a = this.actionFor(this.hover, this.leapMode);
      const ok = !!a && this.previewFor(a).valid;
      drawHex(ctx, this.hover, ox, oy, hexShape(ok ? 19 : 21, 'line', ok ? 0.9 : 0.35));
    }
  }

  private drawOverheads(ctx: CanvasRenderingContext2D, ox: number, oy: number, idle: boolean): void {
    const t = this.view.time;
    for (const v of this.view.units.values()) {
      if (v.fall > 0 || v.sink > 0) continue;
      const sp = sprite(v.kind);
      const flying = DEFS[v.kind].flying ? 6 : 0;
      const top = Math.round(oy + v.y + FOOT - sp.h - v.z - flying);
      const cx = Math.round(ox + v.x);
      const u = this.state.units.find((x) => x.id === v.id);
      if (v.kind !== 'player' && v.kind !== 'bomb' && v.maxHp > 1 && !DEFS[v.kind].boss) {
        const n = v.maxHp;
        const x0 = cx - n * 2;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = PAL[25];
          ctx.fillRect(x0 + i * 4 - 1, top - 5, 4, 4);
          ctx.fillStyle = PAL[i < v.hp ? 8 : 23];
          ctx.fillRect(x0 + i * 4, top - 4, 2, 2);
        }
      }
      if (v.kind === 'bomb') {
        drawText(ctx, String(Math.max(0, v.fuse)), cx, top - 9, v.fuse <= 1 ? 8 : 10, { align: 'center' });
      }
      if (idle && u?.intent && u.kind !== 'ognik') {
        const bob = Math.round(Math.sin(t * 8) * 1);
        ctx.fillStyle = PAL[25];
        ctx.fillRect(cx - 3, top - 15 + bob, 7, 9);
        ctx.fillStyle = PAL[8];
        ctx.fillRect(cx - 2, top - 14 + bob, 5, 7);
        ctx.fillStyle = PAL[19];
        ctx.fillRect(cx, top - 13 + bob, 1, 3);
        ctx.fillRect(cx, top - 9 + bob, 1, 1);
      }
      if (v.stun || (u && u.stun > 0)) {
        for (let i = 0; i < 3; i++) {
          const a = t * 4 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = PAL[11];
          ctx.fillRect(Math.round(cx + Math.cos(a) * 6), Math.round(top - 3 + Math.sin(a) * 2), 1, 1);
        }
      }
    }
  }

  private hoverAction(): Action | null {
    if (this.mode !== 'play') return null;
    return this.actionFor(this.hover, this.leapMode || this.app.input.held.has('ShiftLeft'));
  }

  private drawPreviewIcons(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const a = this.hoverAction();
    if (!a) return;
    const pv = this.previewFor(a);
    if (!pv.valid) return;
    const t = this.view.time;
    const bob = Math.round(Math.sin(t * 6));
    // Pushed units: ghost at their landing hex.
    for (const [id, to] of pv.moved) {
      const v = this.view.units.get(id);
      if (!v) continue;
      const p = hexToPx(to);
      const sp = sprite(v.kind);
      pixelLine(ctx, ox + v.x, oy + v.y, ox + p.x, oy + p.y, PAL[19]);
      ctx.globalAlpha = 0.35;
      ctx.drawImage(v.face < 0 ? sp.flipped[0] : sp.frames[0], Math.round(ox + p.x - sp.w / 2), Math.round(oy + p.y + FOOT - sp.h));
      ctx.globalAlpha = 1;
    }
    for (const [id, dmg] of pv.hits) {
      const v = this.view.units.get(id);
      if (!v || pv.kills.has(id)) continue;
      const sp = sprite(v.kind);
      const top = Math.round(oy + v.y + FOOT - sp.h);
      ctx.drawImage(sprite('sword').frames[0], Math.round(ox + v.x - 12), top - 10 + bob);
      drawText(ctx, `-${dmg}`, Math.round(ox + v.x) + 2, top - 8 + bob, 19);
    }
    for (const id of pv.kills) {
      const v = this.view.units.get(id);
      if (!v) continue;
      const sp = sprite(v.kind);
      const where = pv.moved.get(id);
      const p = where !== undefined ? hexToPx(where) : { x: v.x, y: v.y };
      const top = Math.round(oy + p.y + FOOT - sp.h);
      ctx.drawImage(sprite('skull').frames[0], Math.round(ox + p.x - 4), top - 12 + bob);
    }
    // Player outcome at destination.
    const dest = a.t === 'leap' ? a.to : a.t === 'move' && !unitAt(this.state, this.hover) ? this.hover : player(this.state).pos;
    const dp = hexToPx(dest);
    if (pv.lethal) {
      ctx.drawImage(sprite('skull').frames[0], Math.round(ox + dp.x - 4), Math.round(oy + dp.y - 34) + bob);
      drawText(ctx, 'ŚMIERĆ', Math.round(ox + dp.x), Math.round(oy + dp.y - 44) + bob, 8, { align: 'center' });
    } else if (pv.playerDamage > 0) {
      ctx.drawImage(sprite('heart').frames[0], Math.round(ox + dp.x - 12), Math.round(oy + dp.y - 36) + bob);
      drawText(ctx, `-${pv.playerDamage}`, Math.round(ox + dp.x) + 1, Math.round(oy + dp.y - 35) + bob, 8);
    }
  }

  private drawTexts(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (const ft of this.view.fx.texts) {
      const k = ft.t / ft.max;
      const rise = ft.big ? 10 * Math.min(1, ft.t * 4) : 14 * k;
      const pop = ft.big && ft.t < 0.12 ? 2 : 1;
      drawText(ctx, ft.text, Math.round(ox + ft.x), Math.round(oy + ft.y - rise), ft.color, {
        align: 'center', alpha: k > 0.7 ? (1 - k) / 0.3 : 1, scale: pop,
      });
    }
  }

  private infoLine(): { text: string; color: number }[] {
    const s = this.state;
    if (this.mode !== 'play') return [];
    const lines: { text: string; color: number }[] = [];
    const u = this.hover >= 0 ? unitAt(s, this.hover) : undefined;
    const a = this.hoverAction();
    if (a) {
      const pv = this.previewFor(a);
      if (pv.valid) {
        const parts: string[] = [];
        if (a.t === 'leap') parts.push('Skok');
        else if (a.t === 'wait') parts.push('Czekaj');
        else if (u) parts.push(`Pchnięcie: ${DEFS[u.kind].name}`);
        if (pv.kills.size) parts.push(`zabijesz: ${pv.kills.size}`);
        else if (pv.hits.size) parts.push(`trafisz: ${pv.hits.size}`);
        if (pv.clears) parts.push('plansza oczyszczona!');
        if (pv.descends) parts.push('zejście głębiej (bez daru)');
        if (pv.lethal) lines.push({ text: 'Ten ruch Cię zabije!', color: 8 });
        else if (pv.playerDamage) lines.push({ text: `Otrzymasz ${pv.playerDamage} obrażenie${pv.playerDamage > 1 ? 'a' : ''}.`, color: 8 });
        if (parts.length) lines.unshift({ text: parts.join(' · '), color: 20 });
      }
    }
    if (u && u.kind !== 'player') {
      lines.push({ text: `${DEFS[u.kind].name}: ${DEFS[u.kind].desc}`, color: 21 });
    } else if (this.hover === s.stairs && s.stairs >= 0) {
      lines.push({ text: 'Zejście: prowadzi głębiej. Bez oczyszczenia planszy nie dostaniesz daru.', color: 21 });
    } else if (this.leapMode) {
      lines.push({ text: 'Wybierz pole skoku (kliknij albo kierunek). Esc anuluje.', color: 18 });
    } else if (!lines.length && HINTS[s.depth]) {
      const hs = HINTS[s.depth];
      lines.push({ text: hs[Math.floor(this.levelT / 6) % hs.length], color: 11 });
    }
    return lines.slice(0, 2);
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const s = this.state;
    const t = this.view.time;
    // Hearts.
    const hp = this.mode === 'anim' ? this.view.playerHp : player(s).hp;
    for (let i = 0; i < s.hero.maxHp; i++) {
      const full = i < hp;
      const shake = !full ? 0 : hp === 1 ? Math.round(Math.sin(t * 20)) : 0;
      ctx.drawImage(sprite(full ? 'heart' : 'heartEmpty').frames[0], 6 + i * 10, 6 + shake);
    }
    let hx = 8 + s.hero.maxHp * 10;
    if (s.hero.gifts.includes('hart') && !s.hero.shieldUsed) {
      ctx.drawImage(sprite('shield').frames[0], hx, 6);
      hx += 11;
    }
    if (s.hero.gifts.includes('odrodzenie') && !s.hero.reviveUsed) ctx.drawImage(sprite('weles').frames[0], hx, 5);
    // Title + depth pips.
    const biome = biomeOf(s.depth);
    const idx = s.depth % LEVELS_PER_BIOME;
    const label = `${BIOMES[biome].name.toUpperCase()}  ${isBossDepth(s.depth) ? '· BOSS' : `${idx + 1}/${LEVELS_PER_BIOME - 1}`}`;
    drawText(ctx, label, w / 2, 6, 10, { align: 'center' });
    const pipW = 15 * 6;
    for (let d = 0; d < 15; d++) {
      const x = Math.round(w / 2 - pipW / 2 + d * 6 + Math.floor(d / 5) * 2);
      const boss = isBossDepth(d);
      ctx.fillStyle = PAL[25];
      ctx.fillRect(x - 1, 17, boss ? 6 : 5, 5);
      ctx.fillStyle = PAL[d < s.depth ? 13 : d === s.depth ? 11 : boss ? 7 : 23];
      ctx.fillRect(x, 18, boss ? 4 : 3, 3);
    }
    // Score.
    drawText(ctx, `DUSZE ${s.stats.score}`, w - 6, 6, 18, { align: 'right' });
    drawText(ctx, `Tura ${s.turn}`, w - 6, 17, 22, { align: 'right' });
    if (isMuted()) drawText(ctx, 'wyciszone (M)', w - 6, 28, 22, { align: 'right' });
    // Boss bar.
    const boss = enemies(s).find((u) => DEFS[u.kind].boss) ?? s.units.find((u) => DEFS[u.kind].boss);
    if (boss) {
      const v = this.view.units.get(boss.id);
      const bw = Math.min(200, w - 140);
      const frac = (v ? v.hp : boss.hp) / boss.maxHp;
      const immortal = boss.kind === 'kosciej' && !s.eggBroken;
      const label = DEFS[boss.kind].name.toUpperCase() + (immortal ? ' · rozbij jajo, by go zranić' : '');
      drawText(ctx, label, w / 2, 27, immortal ? 28 : 8, { align: 'center' });
      bar(ctx, Math.round(w / 2 - bw / 2), 38, bw, 3, frac, immortal ? 28 : 8);
    }
    // Leap.
    const ready = s.hero.leapCd === 0;
    const lx = 6;
    const ly = h - 32;
    panel(ctx, lx, ly, 62, 27, this.leapMode ? 18 : ready ? 22 : 23, 0.8);
    const icon = sprite('leap');
    ctx.globalAlpha = ready ? 1 : 0.4;
    ctx.drawImage(icon.frames[0], lx + 4, ly + 6);
    ctx.globalAlpha = 1;
    drawText(ctx, 'SKOK', lx + 20, ly + 4, ready ? (this.leapMode ? 18 : 19) : 22);
    drawText(ctx, ready ? 'PPM / F' : `za ${s.hero.leapCd}`, lx + 20, ly + 14, ready ? 21 : 22);
    if (!ready) bar(ctx, lx + 4, ly + 23, 54, 1, 1 - s.hero.leapCd / leapMax(s), 18);
    // Gifts.
    const gifts = s.hero.gifts;
    let gx = w - 6 - gifts.length * 14;
    let hoverGift = -1;
    gifts.forEach((g, i) => {
      const x = gx + i * 14;
      const y = h - 20;
      ctx.drawImage(giftIcon(g).frames[0], x, y);
      if (this.mx >= x && this.mx < x + 13 && this.my >= y && this.my < y + 13) hoverGift = i;
    });
    if (gifts.length) drawText(ctx, 'DARY', w - 6, h - 32, 22, { align: 'right' });
    // Info lines.
    const lines = this.infoLine();
    if (hoverGift >= 0) {
      const g = giftById(gifts[hoverGift]);
      lines.length = 0;
      lines.push({ text: `${g.name} (${GODS[g.god].name})`, color: GODS[g.god].color }, { text: g.desc, color: 20 });
    }
    const maxW = w - 160;
    const wrapped: { text: string; color: number }[] = [];
    for (const l of lines) for (const part of wrap(l.text, maxW)) wrapped.push({ text: part, color: l.color });
    wrapped.slice(0, 3).forEach((l, i, arr) => {
      drawText(ctx, l.text, w / 2, h - 10 - (arr.length - 1 - i) * 10, l.color, { align: 'center' });
    });
    // New enemy introduction card.
    if (this.intro.length && this.introT < 9 && this.mode !== 'gift' && this.mode !== 'dead' && this.mode !== 'won') {
      const a = Math.min(1, this.introT * 3, (9 - this.introT) * 2);
      ctx.globalAlpha = a;
      let y = 54;
      for (const k of this.intro) {
        const lines2 = wrap(DEFS[k].desc, 112);
        const ph = 26 + lines2.length * 10;
        panel(ctx, 6, y, 150, ph, DEFS[k].boss ? 7 : 22, 0.85);
        const sp = sprite(k);
        ctx.drawImage(sp.frames[Math.floor(t * 2) % 2], 12, y + 6 + Math.max(0, 16 - sp.h));
        drawText(ctx, DEFS[k].boss ? 'BOSS' : 'NOWY WRÓG', 34, y + 5, DEFS[k].boss ? 8 : 22);
        drawText(ctx, DEFS[k].name, 34, y + 15, 11);
        lines2.forEach((l, i) => drawText(ctx, l, 12 + 22, y + 26 + i * 10, 20));
        y += ph + 4;
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const b = this.view.banner;
    if (!b) return;
    const k = b.t / b.max;
    const a = Math.min(1, b.t * 5, (1 - k) * 5);
    const y = Math.round(h * 0.32);
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = PAL[25];
    ctx.fillRect(0, y - 8, w, b.sub ? 40 : 30);
    ctx.globalAlpha = a;
    const scale = 2;
    drawText(ctx, b.text, w / 2, y, b.color, { align: 'center', scale });
    if (b.sub) drawText(ctx, b.sub, w / 2, y + 20, 20, { align: 'center' });
    ctx.globalAlpha = 1;
  }

  private drawGifts(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const a = Math.min(1, this.overlayT * 3);
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = PAL[25];
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = a;
    drawText(ctx, 'BOGOWIE PATRZĄ NA CIEBIE', w / 2, h / 2 - 82, 11, { align: 'center', scale: 2 });
    drawText(ctx, 'Wybierz dar (kliknij albo 1, 2, 3)', w / 2, h / 2 - 60, 21, { align: 'center' });
    const cw = Math.min(140, Math.floor((w - 40) / 3));
    let ch = 0;
    for (const id of this.offer) {
      const g = giftById(id);
      ch = Math.max(ch, 54 + wrap(g.name, cw - 10).length * 10 + wrap(g.desc, cw - 12).length * 10);
    }
    const gap = 8;
    const x0 = Math.floor(w / 2 - (cw * 3 + gap * 2) / 2);
    const y0 = Math.floor(h / 2 - 44);
    this.giftRects = [];
    this.offer.forEach((id, i) => {
      const g = giftById(id);
      const god = GODS[g.god];
      const hov = i === this.giftHover;
      const x = x0 + i * (cw + gap);
      const y = y0 - (hov ? 3 : 0) + Math.round((1 - Math.min(1, this.overlayT * 3 - i * 0.3)) * 30);
      this.giftRects.push({ x, y: y0 - 3, w: cw, h: ch + 6 });
      panel(ctx, x, y, cw, ch, hov ? god.color : 23, 0.95);
      const icon = giftIcon(id);
      const glow = hov ? Math.round(Math.sin(this.view.time * 8) * 1) : 0;
      ctx.drawImage(icon.frames[0], Math.round(x + cw / 2 - icon.w), y + 2 + glow, icon.w * 2, icon.h * 2);
      ctx.drawImage(sprite(g.god).frames[0], x + cw - 17, y + 4);
      drawText(ctx, god.name.toUpperCase(), x + cw / 2, y + 30, god.color, { align: 'center' });
      const nameLines = wrap(g.name, cw - 10);
      nameLines.forEach((l, j) => drawText(ctx, l, x + cw / 2, y + 42 + j * 10, 19, { align: 'center' }));
      const dl = wrap(g.desc, cw - 12);
      dl.forEach((l, j) => drawText(ctx, l, x + cw / 2, y + 47 + nameLines.length * 10 + j * 10, 20, { align: 'center' }));
      drawText(ctx, String(i + 1), x + 6, y + 5, 22);
    });
    ctx.globalAlpha = 1;
  }

  private drawEnd(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const won = this.mode === 'won';
    const a = Math.min(1, this.overlayT * 1.5);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = PAL[25];
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = a;
    const s = this.state;
    const cy = Math.floor(h / 2);
    if (won) {
      const sun = sprite('sun');
      const sx = w / 2;
      const sy = cy - 112 + sun.h - 1;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + this.view.time * 0.3;
        const len = 34 + (i % 2) * 12 + Math.sin(this.view.time * 2 + i) * 4;
        if (Math.sin(ang) > 0.35) continue; // keep rays above the title
        pixelLine(ctx, sx + Math.cos(ang) * 16, sy + Math.sin(ang) * 16, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len, PAL[i % 2 ? 10 : 11]);
      }
      if (Math.random() < 0.5) this.view.fx.rise(Math.random() * w - this.ox, h - this.oy, 0, 1, [10, 11, 19], 2, 40, 2.5);
      ctx.drawImage(sun.frames[0], Math.round(w / 2 - sun.w), cy - 112, sun.w * 2, sun.h * 2);
      drawText(ctx, 'SŁOŃCE WRACA NA NIEBO', w / 2, cy - 82, 11, { align: 'center', scale: 2 });
      drawText(ctx, 'Kościej pokonany. Wiosna wraca do świata żywych.', w / 2, cy - 60, 20, { align: 'center' });
    } else {
      drawText(ctx, 'POLEGŁEŚ', w / 2, cy - 82, 8, { align: 'center', scale: 3 });
      const where = `${BIOMES[biomeOf(s.depth)].name}, ${isBossDepth(s.depth) ? 'walka z bossem' : `poziom ${(s.depth % LEVELS_PER_BIOME) + 1}`}`;
      drawText(ctx, `${where}. Zabił Cię: ${s.killedBy || '?'}`, w / 2, cy - 52, 20, { align: 'center' });
    }
    const st = s.stats;
    const rows: [string, string][] = [
      ['Dusze', String(st.score)],
      ['Zabici wrogowie', String(st.kills)],
      ['Najlepsza seria', String(st.bestCombo)],
      ['Oczyszczone plansze', String(st.levelsCleared)],
      ['Tury', String(st.turns)],
    ];
    const pw = 200;
    panel(ctx, w / 2 - pw / 2, cy - 38, pw, rows.length * 12 + 12, won ? 10 : 7, 0.9);
    rows.forEach(([k, v], i) => {
      drawText(ctx, k, w / 2 - pw / 2 + 10, cy - 31 + i * 12, 21);
      drawText(ctx, v, w / 2 + pw / 2 - 10, cy - 31 + i * 12, i === 0 ? 11 : 19, { align: 'right' });
    });
    let y = cy - 31 + rows.length * 12 + 14;
    if (s.hero.gifts.length) {
      const gw = s.hero.gifts.length * 14;
      s.hero.gifts.forEach((g, i) => ctx.drawImage(giftIcon(g).frames[0], Math.round(w / 2 - gw / 2 + i * 14), y));
      y += 18;
    }
    if (this.newBest) drawText(ctx, 'NOWY REKORD!', w / 2, y, 11, { align: 'center' });
    else drawText(ctx, `Rekord: ${this.bestBefore.score}`, w / 2, y, 22, { align: 'center' });
    if (this.overlayT > 1 && Math.floor(this.view.time * 2) % 2 === 0) {
      drawText(ctx, 'Kliknij albo R: nowa wyprawa   ·   T: menu', w / 2, y + 16, 19, { align: 'center' });
    }
    ctx.globalAlpha = 1;
  }

  private drawPause(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = 'rgba(24,20,37,0.75)';
    ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'PAUZA', w / 2, h / 2 - 30, 11, { align: 'center', scale: 2 });
    drawText(ctx, 'Dowolny klawisz: wróć   ·   T: menu główne   ·   H: pomoc', w / 2, h / 2, 20, { align: 'center' });
    drawText(ctx, `M: dźwięk (${isMuted() ? 'wyłączony' : 'włączony'})`, w / 2, h / 2 + 12, 21, { align: 'center' });
    if (this.run.daily) drawText(ctx, 'Wyprawa dnia', w / 2, h / 2 + 30, 18, { align: 'center' });
  }
}

export { measure, dist };
