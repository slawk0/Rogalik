import { Input } from './input';
import { Screen } from './render/screen';
import { drawCursor } from './render/cursor';
import { GameScene } from './scenes/game';
import { TitleScene } from './scenes/title';
import type { App, Scene } from './scenes/types';
import { playMusic } from './audio/music';
import { initAudio } from './audio/audio';
import { botAction } from './core/bot';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const screen = new Screen(canvas);
const input = new Input(screen);

let scene: Scene;

const app: App = {
  screen,
  input,
  toTitle() {
    setScene(new TitleScene(app));
    playMusic(4);
  },
  startRun(seed: number, daily: boolean) {
    setScene(new GameScene(app, seed, daily));
  },
  setMusic(track: number) {
    playMusic(track);
  },
};

function setScene(s: Scene): void {
  scene = s;
  input.handler = {
    onMouseMove: (x, y) => scene.onMouseMove?.(x, y),
    onMouseDown: (x, y, b) => {
      initAudio();
      scene.onMouseDown?.(x, y, b);
    },
    onKey: (c, e) => scene.onKey?.(c, e),
    onKeyUp: (c) => scene.onKeyUp?.(c),
  };
}

setScene(new TitleScene(app));

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  scene.update(dt);
  const ctx = screen.ctx;
  ctx.imageSmoothingEnabled = false;
  scene.draw(ctx, screen.w, screen.h);
  if (input.inside) drawCursor(ctx, input.mx, input.my);
  screen.present();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug hooks for automated screenshots.
(window as unknown as Record<string, unknown>).__nawia = {
  app,
  get scene() { return scene; },
  /** Client (CSS px) coordinates of a hex center in the current game scene. */
  hexClient(k: number) {
    const g = scene as unknown as { ox: number; oy: number };
    const q = Math.floor(k / 128) - 32;
    const r = (k % 128) - 32;
    const x = g.ox + q * 22;
    const y = g.oy + r * 24 + q * 12;
    return { x: ((x + 0.5) * screen.scale) / screen.dpr, y: ((y + 0.5) * screen.scale) / screen.dpr };
  },
  bot() {
    const g = scene as unknown as { state: Parameters<typeof botAction>[0]; act(a: unknown): void; mode: string; pickGift(i: number): void };
    if (g.mode === 'play') g.act(botAction(g.state, 2));
    else if (g.mode === 'gift') g.pickGift(Math.floor(Math.random() * 3));
    return g.mode;
  },
};
