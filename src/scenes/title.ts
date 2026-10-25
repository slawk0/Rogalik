import { disk, hexToPx, key } from '../core/hex';
import { freshCarry, genLevel } from '../core/levelgen';
import { dailySeed, loadBest } from '../core/run';
import type { GameState } from '../core/state';
import { initAudio, isMuted, sfx, toggleMute } from '../audio/audio';
import { backgroundCanvas, drawAmbient } from '../render/background';
import { BoardRenderer } from '../render/board';
import { drawText } from '../render/font';
import { drawHelp } from '../render/help';
import { PAL } from '../render/palette';
import { sprite } from '../render/sprites';
import { dissolve } from '../render/ui';
import type { App, Scene } from './types';

export class TitleScene implements Scene {
  time = 0;
  sel = 0;
  help = false;
  board = new BoardRenderer();
  mini: GameState;
  items: { label: () => string; y: number; act: () => void }[] = [];
  fade = 1;
  leaving: (() => void) | null = null;
  w = 480;
  h = 300;

  constructor(private app: App) {
    const s = genLevel(0, freshCarry(), 12345);
    const keep = new Set(disk(key(0, 0), 1));
    for (const k of [...s.tiles.keys()]) if (!keep.has(k)) s.tiles.delete(k);
    for (const k of keep) s.tiles.set(k, { t: 'floor', v: k % 7, fire: 0 });
    s.tiles.set(key(1, -1), { t: 'wall', v: 1, fire: 0 });
    s.stairs = -1;
    this.mini = s;
    this.board.build(s, 0);
    this.items = [
      { label: () => 'Nowa wyprawa', y: 0, act: () => this.go(() => this.app.startRun((Math.random() * 2 ** 31) | 0, false)) },
      { label: () => 'Wyprawa dnia', y: 0, act: () => this.go(() => this.app.startRun(dailySeed(), true)) },
      { label: () => 'Jak grać', y: 0, act: () => { this.help = true; } },
      { label: () => `Dźwięk: ${isMuted() ? 'wyłączony' : 'włączony'}`, y: 0, act: () => { toggleMute(); } },
    ];
  }

  private go(f: () => void): void {
    sfx.confirm();
    this.leaving = f;
    this.fade = 0;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.leaving) {
      this.fade += dt * 3;
      if (this.fade >= 1) {
        const f = this.leaving;
        this.leaving = null;
        f();
      }
    } else if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 2);
  }

  private itemAt(x: number, y: number): number {
    return this.items.findIndex((it) => y >= it.y - 3 && y < it.y + 10 && Math.abs(x - this.w / 2) < 70);
  }

  onMouseMove(x: number, y: number): void {
    const i = this.itemAt(x, y);
    if (i >= 0 && i !== this.sel) {
      this.sel = i;
      sfx.select();
    }
  }

  onMouseDown(x: number, y: number): void {
    initAudio();
    this.app.setMusic(4);
    if (this.help) {
      this.help = false;
      return;
    }
    const i = this.itemAt(x, y);
    if (i >= 0) this.items[i].act();
  }

  onKey(code: string): void {
    initAudio();
    this.app.setMusic(4);
    if (this.help) {
      this.help = false;
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      this.sel = (this.sel + 1) % this.items.length;
      sfx.select();
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.sel = (this.sel + this.items.length - 1) % this.items.length;
      sfx.select();
    } else if (code === 'Enter' || code === 'Space') this.items[this.sel].act();
    else if (code === 'KeyM') toggleMute();
    else if (code === 'KeyH') this.help = true;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.w = w;
    this.h = h;
    const t = this.time;
    ctx.drawImage(backgroundCanvas(w, h, 0), 0, 0);
    drawAmbient(ctx, w, h, 0, t);
    // Floating mini island with the hero.
    const ox = Math.floor(w / 2);
    const oy = Math.floor(h * 0.47) + Math.round(Math.sin(t * 1.2) * 2);
    this.board.draw(ctx, ox, oy, t, new Map());
    const draw = (name: string, q: number, r: number, flip: boolean) => {
      const p = hexToPx(key(q, r));
      const sp = sprite(name);
      ctx.fillStyle = 'rgba(24,20,37,0.45)';
      ctx.fillRect(Math.round(ox + p.x - 6), Math.round(oy + p.y + 3), 12, 3);
      ctx.drawImage((flip ? sp.flipped : sp.frames)[(Math.floor(t * 2) + q + 2) % 2], Math.round(ox + p.x - sp.w / 2), Math.round(oy + p.y + 4 - sp.h));
    };
    for (const wd of this.board.walls) {
      const p = hexToPx(wd.k);
      ctx.drawImage(wd.sp.frames[0], Math.round(ox + p.x - wd.sp.w / 2), Math.round(oy + p.y + 6 - wd.sp.h));
    }
    draw('wilk', -1, 0, false);
    draw('player', 0, 0, false);
    draw('bies', 1, 0, true);
    // Title.
    const ty = Math.max(14, Math.floor(h * 0.1));
    const wob = Math.round(Math.sin(t * 2) * 1);
    drawText(ctx, 'NAWIA', w / 2 + 2, ty + 2 + wob, 27, { align: 'center', scale: 6, shadow: null });
    drawText(ctx, 'NAWIA', w / 2, ty + wob, 11, { align: 'center', scale: 6, shadow: 25 });
    drawText(ctx, 'zejście w zaświaty', w / 2, ty + 48, 20, { align: 'center' });
    // Menu.
    const my = Math.floor(h * 0.64);
    this.items.forEach((it, i) => {
      it.y = my + i * 14;
      const on = i === this.sel;
      if (on) {
        const bx = Math.round(Math.sin(t * 8) * 1);
        ctx.drawImage(sprite('sword').frames[0], Math.round(w / 2 - 70 + bx), it.y - 2);
      }
      drawText(ctx, it.label(), w / 2, it.y, on ? 11 : 20, { align: 'center' });
    });
    const best = loadBest();
    const foot = `Rekord: ${best.score} dusz${best.wins ? ` · zwycięstwa: ${best.wins}` : ''}`;
    drawText(ctx, foot, w / 2, h - 26, 22, { align: 'center' });
    drawText(ctx, 'Mysz albo Q W E / A S D · PPM skok · H pomoc · M dźwięk', w / 2, h - 14, 23, { align: 'center' });
    if (this.help) drawHelp(ctx, w, h, t);
    ctx.fillStyle = PAL[25];
    dissolve(ctx, w, h, this.fade);
  }
}
