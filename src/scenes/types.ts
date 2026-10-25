import type { Input } from '../input';
import type { Screen } from '../render/screen';

export interface Scene {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  onMouseMove?(x: number, y: number): void;
  onMouseDown?(x: number, y: number, button: number): void;
  onTap?(x: number, y: number): void;
  onLongPress?(x: number, y: number): void;
  onRelease?(): void;
  onKey?(code: string, e: KeyboardEvent): void;
  onKeyUp?(code: string): void;
}

export interface App {
  screen: Screen;
  input: Input;
  toTitle(): void;
  startRun(seed: number, daily: boolean): void;
  setMusic(track: number): void;
}
