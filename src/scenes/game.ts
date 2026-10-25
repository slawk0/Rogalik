import { dirTo, disk, hexToPx, isAdjacent, step } from '../core/hex';
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
import { NARROW } from '../render/screen';
import type { Sprite } from '../render/sprites';
import { fullscreenAvailable, toggleFullscreen } from '../fullscreen';
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

const TOUCH_HINTS: Record<number, string[]> = {
  0: [
    'Dotknij pola obok bohatera, żeby się ruszyć.',
    'Przejdź obok wilka, żeby go ciąć. Wejdź na niego, żeby go pchnąć.',
  ],
  1: [
    'Krok prosto na wroga stojącego 2 pola dalej to WYPAD: 2 obrażenia.',
    'Przytrzymaj palec na polu, żeby zobaczyć skutki ruchu bez ruszania się.',
  ],
  2: [
    'Przycisk SKOK, potem pole: lądowanie odpycha wszystkich sąsiadów.',
    'Ruch, po którym oberwiesz, wymaga drugiego dotknięcia.',
  ],
};

interface Btn {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  /** Clickable areas, rebuilt every frame while drawing. */
  btns: Btn[] = [];
  narrow = false;
  /** Touch: hex picked by the last tap (waits for a confirming tap when risky). */
  selected = -1;
  /** Touch: hex under a held finger. */
  pressK = -1;
  /** Gift whose description is shown (tap on its icon). */
  giftInfo = -1;

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
    if (this.mode !== 'play' || this.paused || this.showHelp || this.introModal()) return;
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
    this.selected = -1;
    this.giftInfo = -1;
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

  private get touch(): boolean {
    return this.app.input.touch;
  }

  /** Hex the player is looking at: mouse hover, or the touched / held hex. */
  private focus(): number {
    if (!this.touch) return this.hover;
    return this.pressK >= 0 ? this.pressK : this.selected;
  }

  private hexAt(x: number, y: number): number {
    return pickHex(this.state, x - this.ox + 0.5, y - this.oy + 0.5);
  }

  private btnAt(x: number, y: number): string | null {
    for (let i = this.btns.length - 1; i >= 0; i--) {
      const b = this.btns[i];
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b.id;
    }
    return null;
  }

  private newRun(): void {
    this.app.startRun((Math.random() * 2 ** 31) | 0, false);
  }

  onMouseMove(x: number, y: number): void {
    this.mx = x;
    this.my = y;
    this.hover = this.hexAt(x, y);
    if (this.mode === 'gift') {
      const prev = this.giftHover;
      this.giftHover = this.giftRects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      if (this.giftHover >= 0 && this.giftHover !== prev) sfx.select();
    }
  }

  /** Buttons and overlays shared by mouse and touch. Returns true when the press was used. */
  private pressUi(x: number, y: number): boolean {
    if (this.showHelp) {
      this.showHelp = false;
      return true;
    }
    if (this.introModal() && !this.paused) {
      if (this.introT > 0.3) this.introT = 1000;
      return true;
    }
    const id = this.btnAt(x, y);
    if (this.paused) {
      if (id === 'help') this.showHelp = true;
      else if (id === 'sound') toggleMute();
      else if (id === 'fullscreen') toggleFullscreen();
      else if (id === 'title') this.app.toTitle();
      else this.paused = false;
      if (id) sfx.select();
      return true;
    }
    if (this.mode === 'gift') {
      const i = this.giftRects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      this.pickGift(i);
      return true;
    }
    if (this.mode === 'dead' || this.mode === 'won') {
      if (this.overlayT > 1) {
        if (id === 'again') this.newRun();
        else if (id === 'title') this.app.toTitle();
      }
      return true;
    }
    if (id === 'menu') {
      this.paused = true;
      sfx.select();
      return true;
    }
    if (id === 'intro') {
      this.introT = 1000;
      return true;
    }
    if (id?.startsWith('gift:')) {
      const i = Number(id.slice(5));
      this.giftInfo = this.giftInfo === i ? -1 : i;
      sfx.select();
      return true;
    }
    if (this.mode !== 'play') return id !== null;
    if (id === 'leap') {
      this.toggleLeap();
      return true;
    }
    if (id === 'wait') {
      this.tryAct({ t: 'wait' }, player(this.state).pos);
      return true;
    }
    return false;
  }

  onMouseDown(x: number, y: number, button: number): void {
    initAudio();
    this.onMouseMove(x, y);
    if (this.pressUi(x, y)) return;
    if (this.mode !== 'play') return;
    this.giftInfo = -1;
    const a = this.actionFor(this.hover, button === 2 || this.leapMode);
    if (a) this.act(a);
    else if (button === 2 && this.state.hero.leapCd > 0) sfx.denied();
    else if (this.hover >= 0 && this.leapMode) sfx.denied();
  }

  /**
   * Touch: a safe action runs on the first tap. An action that would hurt the
   * hero only selects the hex; a second tap on the same hex confirms it.
   */
  private tryAct(a: Action, k: number): void {
    if (!this.touch) {
      this.act(a);
      return;
    }
    const pv = this.previewFor(a);
    if (!pv.valid) {
      sfx.denied();
      this.selected = k;
      return;
    }
    const risky = pv.lethal || pv.playerDamage > 0;
    if (risky && this.selected !== k) {
      this.selected = k;
      sfx.intent();
      return;
    }
    this.act(a);
  }

  onTap(x: number, y: number): void {
    this.mx = x;
    this.my = y;
    if (this.mode === 'gift') this.onMouseMove(x, y);
    if (this.pressUi(x, y)) return;
    if (this.mode !== 'play') return;
    this.giftInfo = -1;
    const k = this.hexAt(x, y);
    const a = this.actionFor(k, this.leapMode);
    if (!a) {
      // Not an action: just show what is there.
      if (this.leapMode && k >= 0 && this.state.tiles.has(k)) sfx.denied();
      this.selected = this.selected === k ? -1 : k;
      return;
    }
    this.tryAct(a, k);
  }

  onLongPress(x: number, y: number): void {
    if (this.mode !== 'play' || this.paused || this.showHelp || this.introModal()) return;
    const k = this.hexAt(x, y);
    if (k !== this.pressK) {
      this.pressK = k;
      if (k >= 0) sfx.select();
    }
  }

  onRelease(): void {
    this.pressK = -1;
  }

  private toggleLeap(): void {
    if (this.state.hero.leapCd > 0) {
      sfx.denied();
      this.view.fx.text(hexToPx(player(this.state).pos).x, hexToPx(player(this.state).pos).y - 24, `Skok za ${this.state.hero.leapCd}`, 21, false, 0.8);
      return;
    }
    this.leapMode = !this.leapMode;
    this.selected = -1;
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
      if (this.overlayT > 1 && (code === 'KeyR' || code === 'Enter' || code === 'Space')) this.newRun();
      if (code === 'KeyT') this.app.toTitle();
      return;
    }
    if (this.mode !== 'play') return;
    if (this.introModal()) {
      this.introT = 1000;
      return;
    }
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

  /** Height reserved at the bottom of a narrow (portrait) screen. */
  private bottomReserve(): number {
    const rows = Math.ceil(this.state.hero.gifts.length / this.giftsPerRow());
    return 30 + rows * 14 + 34;
  }

  private giftsPerRow(): number {
    return this.narrow ? Math.max(1, Math.floor((this.w - 8) / 14)) : 8;
  }

  private topReserve(): number {
    const boss = this.state.units.some((u) => DEFS[u.kind].boss);
    return this.narrow ? (boss ? 50 : 38) : 0;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.narrow = w < NARROW;
    this.btns = [];
    this.ox = Math.floor(w / 2);
    if (this.narrow) {
      const top = this.topReserve();
      const bottom = h - this.bottomReserve();
      this.oy = Math.round((top + bottom + 14) / 2);
    } else this.oy = Math.floor(h / 2) + 10;
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
    if (this.introModal() && !this.paused && !this.showHelp) this.drawIntroModal(ctx, w, h);
    else this.drawBanner(ctx, w, h);
    if (this.mode === 'gift') this.drawGifts(ctx, w, h);
    if (this.mode === 'dead' || this.mode === 'won') this.drawEnd(ctx, w, h);
    if (this.paused) this.drawPause(ctx, w, h);
    if (this.showHelp) drawHelp(ctx, w, h, this.view.time, this.touch);
    dissolve(ctx, w, h, Math.max(0, Math.min(1, this.fade)));
  }

  /** Draws a pixel button and registers its hit area. */
  private button(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, label: string,
    o: { color?: number; accent?: number; sub?: string; icon?: Sprite; dim?: boolean } = {}): void {
    x = Math.round(x);
    y = Math.round(y);
    this.btns.push({ id, x, y, w, h });
    const hot = !this.touch && this.mx >= x && this.mx < x + w && this.my >= y && this.my < y + h;
    panel(ctx, x, y, w, h, o.accent ?? (hot ? 20 : 22), 0.85);
    ctx.globalAlpha = o.dim ? 0.45 : 1;
    let tx = x + w / 2;
    if (o.icon) {
      ctx.drawImage(o.icon.frames[0], x + 4, Math.round(y + h / 2 - o.icon.h / 2));
      tx = x + 4 + o.icon.w + (w - 8 - o.icon.w) / 2;
    }
    if (o.sub) {
      drawText(ctx, label, tx, y + h / 2 - 9, o.color ?? 19, { align: 'center' });
      drawText(ctx, o.sub, tx, y + h / 2 + 1, 21, { align: 'center' });
    } else drawText(ctx, label, tx, y + Math.round(h / 2) - 4, o.color ?? 19, { align: 'center' });
    ctx.globalAlpha = 1;
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
    // Hovered / selected hex.
    const f = this.focus();
    if (f >= 0 && s.tiles.has(f)) {
      const a = this.actionFor(f, this.leapMode);
      const pv = a ? this.previewFor(a) : null;
      const ok = !!pv && pv.valid;
      if (this.touch && f === this.selected && pv && ok && (pv.lethal || pv.playerDamage > 0)) {
        // Waiting for a confirming tap.
        const blink = Math.floor(t * 6) % 2 === 0;
        drawHex(ctx, f, ox, oy, hexShape(blink ? 8 : 19, 'line'));
        drawHex(ctx, f, ox, oy, hexShape(8, 'fill', 0.3));
      } else drawHex(ctx, f, ox, oy, hexShape(ok ? 19 : 21, 'line', ok ? 0.9 : 0.35));
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
    return this.actionFor(this.focus(), this.leapMode || this.app.input.held.has('ShiftLeft'));
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
    const dest = a.t === 'leap' ? a.to : a.t === 'move' && !unitAt(this.state, this.focus()) ? this.focus() : player(this.state).pos;
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
    const f = this.focus();
    const u = f >= 0 ? unitAt(s, f) : undefined;
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
        const risky = pv.lethal || pv.playerDamage > 0;
        if (pv.lethal) lines.push({ text: 'Ten ruch Cię zabije!', color: 8 });
        else if (pv.playerDamage) lines.push({ text: `Otrzymasz ${pv.playerDamage} obrażenie${pv.playerDamage > 1 ? 'a' : ''}.`, color: 8 });
        if (this.touch && risky && f === this.selected && this.pressK < 0) {
          lines.push({ text: 'Dotknij jeszcze raz, żeby potwierdzić.', color: 19 });
        }
        if (parts.length) lines.unshift({ text: parts.join(' · '), color: 20 });
      }
    }
    if (u && u.kind !== 'player') {
      lines.push({ text: `${DEFS[u.kind].name}: ${DEFS[u.kind].desc}`, color: 21 });
    } else if (f === s.stairs && s.stairs >= 0) {
      lines.push({ text: 'Zejście: prowadzi głębiej. Bez oczyszczenia planszy nie dostaniesz daru.', color: 21 });
    } else if (this.leapMode) {
      lines.push({ text: this.touch ? 'Dotknij pola skoku. SKOK jeszcze raz anuluje.' : 'Wybierz pole skoku (kliknij albo kierunek). Esc anuluje.', color: 18 });
    } else if (!lines.length) {
      const hs = (this.touch ? TOUCH_HINTS : HINTS)[s.depth];
      if (hs) lines.push({ text: hs[Math.floor(this.levelT / 6) % hs.length], color: 11 });
    }
    return lines.slice(0, 3);
  }

  private drawHearts(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const s = this.state;
    const t = this.view.time;
    const hp = this.mode === 'anim' ? this.view.playerHp : player(s).hp;
    for (let i = 0; i < s.hero.maxHp; i++) {
      const full = i < hp;
      const shake = !full ? 0 : hp === 1 ? Math.round(Math.sin(t * 20)) : 0;
      ctx.drawImage(sprite(full ? 'heart' : 'heartEmpty').frames[0], x + i * 10, y + shake);
    }
    let hx = x + 2 + s.hero.maxHp * 10;
    if (s.hero.gifts.includes('hart') && !s.hero.shieldUsed) {
      ctx.drawImage(sprite('shield').frames[0], hx, y);
      hx += 11;
    }
    if (s.hero.gifts.includes('odrodzenie') && !s.hero.reviveUsed) ctx.drawImage(giftIcon('odrodzenie').frames[0], hx, y - 1);
  }

  private drawPips(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
    const s = this.state;
    const pipW = 15 * 6;
    for (let d = 0; d < 15; d++) {
      const x = Math.round(cx - pipW / 2 + d * 6 + Math.floor(d / 5) * 2);
      const boss = isBossDepth(d);
      ctx.fillStyle = PAL[25];
      ctx.fillRect(x - 1, y - 1, boss ? 6 : 5, 5);
      ctx.fillStyle = PAL[d < s.depth ? 13 : d === s.depth ? 11 : boss ? 7 : 23];
      ctx.fillRect(x, y, boss ? 4 : 3, 3);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const s = this.state;
    const narrow = this.narrow;
    const biome = biomeOf(s.depth);
    const idx = s.depth % LEVELS_PER_BIOME;
    const label = `${BIOMES[biome].name.toUpperCase()}  ${isBossDepth(s.depth) ? '· BOSS' : `${idx + 1}/${LEVELS_PER_BIOME - 1}`}`;
    // Menu button (top-right corner).
    this.button(ctx, 'menu', w - 22, 3, 19, 15, '≡');
    let bossY: number;
    if (narrow) {
      this.drawHearts(ctx, 4, 6);
      drawText(ctx, `${s.stats.score}`, w - 26, 6, 18, { align: 'right' });
      drawText(ctx, label, w / 2, 21, 10, { align: 'center' });
      this.drawPips(ctx, w / 2, 32);
      bossY = 39;
    } else {
      this.drawHearts(ctx, 6, 6);
      drawText(ctx, label, w / 2, 6, 10, { align: 'center' });
      this.drawPips(ctx, w / 2, 18);
      drawText(ctx, `DUSZE ${s.stats.score}`, w - 28, 6, 18, { align: 'right' });
      drawText(ctx, `Tura ${s.turn}`, w - 28, 17, 22, { align: 'right' });
      if (isMuted()) drawText(ctx, 'wyciszone (M)', w - 6, 28, 22, { align: 'right' });
      bossY = 27;
    }
    // Boss bar.
    const boss = enemies(s).find((u) => DEFS[u.kind].boss) ?? s.units.find((u) => DEFS[u.kind].boss);
    if (boss) {
      const v = this.view.units.get(boss.id);
      const bw = Math.min(200, w - (narrow ? 16 : 140));
      const frac = (v ? v.hp : boss.hp) / boss.maxHp;
      const immortal = boss.kind === 'kosciej' && !s.eggBroken;
      const name = DEFS[boss.kind].name.toUpperCase();
      const full = name + (immortal ? ' · rozbij jajo, by go zranić' : '');
      const blabel = narrow && measure(full) > w - 8 ? (immortal ? `${name} · rozbij jajo!` : name) : full;
      drawText(ctx, blabel, w / 2, bossY, immortal ? 28 : 8, { align: 'center' });
      bar(ctx, Math.round(w / 2 - bw / 2), bossY + 11, bw, 3, frac, immortal ? 28 : 8);
    }
    // Action buttons: leap + wait.
    const ready = s.hero.leapCd === 0;
    const by = h - (narrow ? 28 : 32);
    const bh = narrow ? 25 : 27;
    const lw = narrow ? 76 : 62;
    const leapSub = ready ? (this.touch ? (this.leapMode ? 'wybierz pole' : 'gotowy') : 'PPM / F') : `za ${s.hero.leapCd}`;
    this.button(ctx, 'leap', 4, by, lw, bh, 'SKOK', {
      sub: leapSub, icon: sprite('leap'), dim: !ready, accent: this.leapMode ? 18 : undefined,
      color: this.leapMode ? 18 : 19,
    });
    if (!ready) bar(ctx, 8, by + bh - 4, lw - 8, 1, 1 - s.hero.leapCd / leapMax(s), 18);
    this.button(ctx, 'wait', 4 + lw + 4, by, narrow ? 58 : 50, bh, 'CZEKAJ', { sub: this.touch ? undefined : 'spacja' });
    // Gifts.
    const gifts = s.hero.gifts;
    const per = this.giftsPerRow();
    let hoverGift = -1;
    gifts.forEach((g, i) => {
      const row = Math.floor(i / per);
      const col = i % per;
      const inRow = Math.min(per, gifts.length - row * per);
      let x: number;
      let y: number;
      if (narrow) {
        x = Math.round(w / 2 - (inRow * 14) / 2 + col * 14);
        y = by - 15 - row * 14;
      } else {
        x = w - 6 - inRow * 14 + col * 14;
        y = h - 20 - row * 14;
      }
      this.btns.push({ id: `gift:${i}`, x: x - 1, y: y - 1, w: 14, h: 14 });
      if (i === this.giftInfo) {
        ctx.fillStyle = PAL[22];
        ctx.fillRect(x - 1, y - 1, 13, 13);
      }
      ctx.drawImage(giftIcon(g).frames[0], x, y);
      if (!this.touch && this.mx >= x && this.mx < x + 13 && this.my >= y && this.my < y + 13) hoverGift = i;
    });
    if (gifts.length && !narrow) drawText(ctx, 'DARY', w - 6, h - 32 - (Math.ceil(gifts.length / per) - 1) * 14, 22, { align: 'right' });
    // Info lines.
    let lines = this.infoLine();
    const gi = hoverGift >= 0 ? hoverGift : this.giftInfo;
    if (gi >= 0 && gi < gifts.length) {
      const g = giftById(gifts[gi]);
      lines = [{ text: `${g.name} (${GODS[g.god].name})`, color: GODS[g.god].color }, { text: g.desc, color: 20 }];
    }
    const maxW = narrow ? w - 10 : Math.max(180, w - 270);
    const wrapped: { text: string; color: number }[] = [];
    for (const l of lines) for (const part of wrap(l.text, maxW)) wrapped.push({ text: part, color: l.color });
    const giftRows = Math.ceil(gifts.length / per);
    const baseY = narrow ? by - 14 - giftRows * 14 : h - 10;
    // New enemy introduction cards (top-left; on a narrow screen a modal, see drawIntroModal).
    const introOn = !narrow && this.intro.length > 0 && this.introT < 9 && this.mode !== 'gift' && this.mode !== 'dead' && this.mode !== 'won';
    const shown = wrapped.slice(0, narrow ? 3 : 4);
    shown.forEach((l, i) => {
      drawText(ctx, l.text, w / 2, baseY - (shown.length - 1 - i) * 10, l.color, { align: 'center' });
    });
    if (introOn) {
      const a = Math.min(1, this.introT * 3, (9 - this.introT) * 2);
      ctx.globalAlpha = a;
      const y0 = 54;
      const y1 = this.drawIntroCards(ctx, 6, y0, 150);
      this.btns.push({ id: 'intro', x: 6, y: y0, w: 150, h: y1 - y0 });
      ctx.globalAlpha = 1;
    }
  }

  /** Narrow screens: new enemies are introduced in a modal at level start. */
  private introModal(): boolean {
    return this.narrow && this.intro.length > 0 && this.introT < 1000 && (this.mode === 'play' || this.mode === 'fadein');
  }

  private drawIntroCards(ctx: CanvasRenderingContext2D, x0: number, y: number, cw: number): number {
    const t = this.view.time;
    for (const k of this.intro) {
      const lines2 = wrap(DEFS[k].desc, cw - 38);
      const ph = 26 + lines2.length * 10;
      panel(ctx, x0, y, cw, ph, DEFS[k].boss ? 7 : 22, 0.92);
      const sp = sprite(k);
      const sc = sp.w > 24 ? 0.5 : 1;
      ctx.drawImage(sp.frames[Math.floor(t * 2) % 2], x0 + 6, y + 6 + Math.max(0, 16 - sp.h * sc), sp.w * sc, sp.h * sc);
      drawText(ctx, DEFS[k].boss ? 'BOSS' : 'NOWY WRÓG', x0 + 28, y + 5, DEFS[k].boss ? 8 : 22);
      drawText(ctx, DEFS[k].name, x0 + 28, y + 15, 11);
      lines2.forEach((l, i) => drawText(ctx, l, x0 + 28, y + 26 + i * 10, 20));
      y += ph + 4;
    }
    return y;
  }

  private drawIntroModal(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const a = Math.min(1, this.introT * 4);
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = PAL[25];
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = a;
    const cw = w - 16;
    const heights = this.intro.map((k) => 26 + wrap(DEFS[k].desc, cw - 38).length * 10 + 4);
    const total = heights.reduce((x, y) => x + y, 0);
    const y0 = Math.round(h / 2 - total / 2);
    const y1 = this.drawIntroCards(ctx, 8, y0, cw);
    if (Math.floor(this.view.time * 2) % 2 === 0) drawText(ctx, 'Dotknij, żeby grać', w / 2, y1 + 8, 19, { align: 'center' });
    ctx.globalAlpha = 1;
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
    const scale = measure(b.text) * 2 <= w - 12 ? 2 : 1;
    drawText(ctx, b.text, w / 2, y + (scale === 1 ? 4 : 0), b.color, { align: 'center', scale });
    if (b.sub) drawText(ctx, b.sub, w / 2, y + 20, 20, { align: 'center' });
    ctx.globalAlpha = 1;
  }

  private drawGifts(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const a = Math.min(1, this.overlayT * 3);
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = PAL[25];
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = a;
    const title = 'BOGOWIE PATRZĄ NA CIEBIE';
    const tScale = measure(title) * 2 <= w - 12 ? 2 : 1;
    const hint = this.touch ? 'Dotknij daru, który wybierasz' : 'Wybierz dar (kliknij albo 1, 2, 3)';
    this.giftRects = [];
    if (this.narrow) {
      // Stacked cards: icon on the left, text on the right.
      const cw = w - 16;
      const cards = this.offer.map((id) => {
        const g = giftById(id);
        const dl = wrap(g.desc, cw - 40);
        return { id, g, dl, ch: 30 + dl.length * 10 };
      });
      const gap = 6;
      const total = cards.reduce((acc, c) => acc + c.ch + gap, -gap);
      let y = Math.max(44, Math.floor(h / 2 - total / 2) + 10);
      drawText(ctx, title, w / 2, y - 34, 11, { align: 'center', scale: tScale });
      drawText(ctx, hint, w / 2, y - 18, 21, { align: 'center' });
      cards.forEach(({ id, g, dl, ch }, i) => {
        const god = GODS[g.god];
        const hov = i === this.giftHover;
        const x = 8 + Math.round((1 - Math.min(1, this.overlayT * 3 - i * 0.3)) * 40);
        this.giftRects.push({ x: 8, y, w: cw, h: ch });
        panel(ctx, x, y, cw, ch, hov ? god.color : 23, 0.95);
        const icon = giftIcon(id);
        ctx.drawImage(icon.frames[0], x + 6, y + 6, icon.w * 2, icon.h * 2);
        drawText(ctx, god.name.toUpperCase(), x + 34, y + 5, god.color);
        drawText(ctx, g.name, x + 34, y + 15, 19);
        dl.forEach((l, j) => drawText(ctx, l, x + 34, y + 27 + j * 10, 20));
        y += ch + gap;
      });
      ctx.globalAlpha = 1;
      return;
    }
    drawText(ctx, title, w / 2, h / 2 - 82, 11, { align: 'center', scale: tScale });
    drawText(ctx, hint, w / 2, h / 2 - 60, 21, { align: 'center' });
    const cw = Math.min(140, Math.floor((w - 40) / 3));
    let ch = 0;
    for (const id of this.offer) {
      const g = giftById(id);
      ch = Math.max(ch, 54 + wrap(g.name, cw - 10).length * 10 + wrap(g.desc, cw - 12).length * 10);
    }
    const gap = 8;
    const x0 = Math.floor(w / 2 - (cw * 3 + gap * 2) / 2);
    const y0 = Math.floor(h / 2 - 44);
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
      if (!this.touch) drawText(ctx, String(i + 1), x + 6, y + 5, 22);
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
    const fitScale = (text: string, max: number) => {
      for (let sc = max; sc > 1; sc--) if (measure(text) * sc <= w - 12) return sc;
      return 1;
    };
    const center = (text: string, y: number, color: number) => {
      const ls = wrap(text, w - 16);
      ls.forEach((l, i) => drawText(ctx, l, w / 2, y + i * 10, color, { align: 'center' }));
      return ls.length * 10;
    };
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
      const title = 'SŁOŃCE WRACA NA NIEBO';
      drawText(ctx, title, w / 2, cy - 82, 11, { align: 'center', scale: fitScale(title, 2) });
      center('Kościej pokonany. Wiosna wraca do świata żywych.', cy - 62, 20);
    } else {
      drawText(ctx, 'POLEGŁEŚ', w / 2, cy - 82, 8, { align: 'center', scale: fitScale('POLEGŁEŚ', 3) });
      const where = `${BIOMES[biomeOf(s.depth)].name}, ${isBossDepth(s.depth) ? 'walka z bossem' : `poziom ${(s.depth % LEVELS_PER_BIOME) + 1}`}`;
      center(`${where}. Zabił Cię: ${s.killedBy || '?'}`, cy - 56, 20);
    }
    const st = s.stats;
    const rows: [string, string][] = [
      ['Dusze', String(st.score)],
      ['Zabici wrogowie', String(st.kills)],
      ['Najlepsza seria', String(st.bestCombo)],
      ['Oczyszczone plansze', String(st.levelsCleared)],
      ['Tury', String(st.turns)],
    ];
    const pw = Math.min(200, w - 16);
    panel(ctx, w / 2 - pw / 2, cy - 38, pw, rows.length * 12 + 12, won ? 10 : 7, 0.9);
    rows.forEach(([k, v], i) => {
      drawText(ctx, k, w / 2 - pw / 2 + 10, cy - 31 + i * 12, 21);
      drawText(ctx, v, w / 2 + pw / 2 - 10, cy - 31 + i * 12, i === 0 ? 11 : 19, { align: 'right' });
    });
    let y = cy - 31 + rows.length * 12 + 14;
    if (s.hero.gifts.length) {
      const per = Math.max(1, Math.floor((w - 16) / 14));
      s.hero.gifts.forEach((g, i) => {
        const row = Math.floor(i / per);
        const inRow = Math.min(per, s.hero.gifts.length - row * per);
        ctx.drawImage(giftIcon(g).frames[0], Math.round(w / 2 - (inRow * 14) / 2 + (i % per) * 14), y + row * 14);
      });
      y += Math.ceil(s.hero.gifts.length / per) * 14 + 4;
    }
    if (this.newBest) drawText(ctx, 'NOWY REKORD!', w / 2, y, 11, { align: 'center' });
    else drawText(ctx, `Rekord: ${this.bestBefore.score}`, w / 2, y, 22, { align: 'center' });
    y += 14;
    const ready = this.overlayT > 1;
    const bw = Math.min(100, Math.floor((w - 24) / 2));
    ctx.globalAlpha = a * (ready ? 1 : 0.4);
    this.button(ctx, 'again', w / 2 - bw - 4, y, bw, 22, 'NOWA WYPRAWA', { color: 11 });
    this.button(ctx, 'title', w / 2 + 4, y, bw, 22, 'MENU');
    ctx.globalAlpha = a;
    if (!this.touch && ready) drawText(ctx, 'R: nowa wyprawa   ·   T: menu', w / 2, y + 28, 22, { align: 'center' });
    ctx.globalAlpha = 1;
  }

  private drawPause(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = 'rgba(24,20,37,0.8)';
    ctx.fillRect(0, 0, w, h);
    const items: [string, string][] = [
      ['resume', 'Wróć do gry'],
      ['help', 'Jak grać'],
      ['sound', `Dźwięk: ${isMuted() ? 'wyłączony' : 'włączony'}`],
    ];
    if (fullscreenAvailable()) items.push(['fullscreen', document.fullscreenElement ? 'Zamknij pełny ekran' : 'Pełny ekran']);
    items.push(['title', 'Menu główne']);
    const bw = Math.min(170, w - 24);
    const bh = 22;
    const gap = 6;
    const total = items.length * (bh + gap) - gap;
    let y = Math.round(h / 2 - total / 2 + 8);
    drawText(ctx, 'PAUZA', w / 2, y - 30, 11, { align: 'center', scale: 2 });
    for (const [id, label] of items) {
      this.button(ctx, id, w / 2 - bw / 2, y, bw, bh, label, { color: id === 'resume' ? 11 : 19 });
      y += bh + gap;
    }
    if (this.run.daily) drawText(ctx, 'Wyprawa dnia', w / 2, y + 4, 18, { align: 'center' });
    if (!this.touch) drawText(ctx, 'Esc: wróć · H: pomoc · M: dźwięk · T: menu', w / 2, h - 14, 22, { align: 'center' });
  }
}
