import type { Screen } from './render/screen';

export interface InputHandler {
  onMouseMove?(x: number, y: number): void;
  onMouseDown?(x: number, y: number, button: number): void;
  /** Finger tapped (pressed and released without moving or holding). */
  onTap?(x: number, y: number): void;
  /** Finger held still for a moment; called again while it slides. */
  onLongPress?(x: number, y: number): void;
  /** Finger lifted after a long press. */
  onRelease?(): void;
  /** Any pointer released (used to unlock audio on iOS). */
  onPointerUp?(): void;
  onKey?(code: string, e: KeyboardEvent): void;
  onKeyUp?(code: string): void;
}

const LONG_PRESS_MS = 350;
const MOVE_SLOP_CSS = 12;

interface Press {
  id: number;
  cx: number;
  cy: number;
  x: number;
  y: number;
  moved: boolean;
  long: boolean;
}

export class Input {
  mx = -100;
  my = -100;
  inside = false;
  /** The last input came from a finger (or pen), not a mouse. */
  touch = false;
  handler: InputHandler | null = null;
  readonly held = new Set<string>();
  private press: Press | null = null;
  private timer = 0;

  constructor(screen: Screen) {
    const c = screen.display;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => {
      const p = screen.toInternal(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        this.touch = false;
        this.mx = p.x;
        this.my = p.y;
        this.inside = true;
        this.handler?.onMouseMove?.(p.x, p.y);
        return;
      }
      const pr = this.press;
      if (!pr || pr.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - pr.cx, e.clientY - pr.cy) > MOVE_SLOP_CSS) pr.moved = true;
      if (pr.long) {
        // Sliding the finger moves the preview around.
        pr.x = p.x;
        pr.y = p.y;
        this.handler?.onLongPress?.(p.x, p.y);
      } else if (pr.moved) window.clearTimeout(this.timer);
    });
    document.addEventListener('mouseleave', () => {
      this.inside = false;
    });
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = screen.toInternal(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        this.touch = false;
        this.inside = true;
        this.mx = p.x;
        this.my = p.y;
        this.handler?.onMouseDown?.(p.x, p.y, e.button);
        return;
      }
      this.touch = true;
      this.inside = false;
      this.press = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: p.x, y: p.y, moved: false, long: false };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* not supported */
      }
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const pr = this.press;
        if (!pr || pr.moved) return;
        pr.long = true;
        this.handler?.onLongPress?.(pr.x, pr.y);
      }, LONG_PRESS_MS);
    });
    const finish = (e: PointerEvent, cancelled: boolean) => {
      this.handler?.onPointerUp?.();
      const pr = this.press;
      if (!pr || pr.id !== e.pointerId) return;
      window.clearTimeout(this.timer);
      this.press = null;
      if (pr.long) this.handler?.onRelease?.();
      else if (!pr.moved && !cancelled) this.handler?.onTap?.(pr.x, pr.y);
    };
    window.addEventListener('pointerup', (e) => finish(e, false));
    window.addEventListener('pointercancel', (e) => finish(e, true));
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.touch = false;
      this.held.add(e.code);
      if (e.repeat) return;
      this.handler?.onKey?.(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.handler?.onKeyUp?.(e.code);
    });
    window.addEventListener('blur', () => this.held.clear());
  }
}
