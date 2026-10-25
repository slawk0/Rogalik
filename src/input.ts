import type { Screen } from './render/screen';

export interface InputHandler {
  onMouseMove?(x: number, y: number): void;
  onMouseDown?(x: number, y: number, button: number): void;
  onKey?(code: string, e: KeyboardEvent): void;
  onKeyUp?(code: string): void;
}

export class Input {
  mx = -100;
  my = -100;
  inside = false;
  handler: InputHandler | null = null;
  readonly held = new Set<string>();

  constructor(screen: Screen) {
    const c = screen.display;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      const p = screen.toInternal(e.clientX, e.clientY);
      this.mx = p.x;
      this.my = p.y;
      this.inside = true;
      this.handler?.onMouseMove?.(p.x, p.y);
    });
    document.addEventListener('mouseleave', () => {
      this.inside = false;
    });
    c.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const p = screen.toInternal(e.clientX, e.clientY);
      this.mx = p.x;
      this.my = p.y;
      this.handler?.onMouseDown?.(p.x, p.y, e.button);
    });
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
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
