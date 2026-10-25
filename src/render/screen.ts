/** Minimum internal resolution: landscape and portrait. */
export const MIN_W = 480;
export const MIN_H = 300;
export const MIN_W_PORTRAIT = 232;
export const MIN_H_PORTRAIT = 420;

/** Layouts narrower than this use the stacked (phone portrait) variant. */
export const NARROW = 420;

/** Low-resolution buffer scaled up by an integer factor to fill the window. */
export class Screen {
  readonly display: HTMLCanvasElement;
  readonly dctx: CanvasRenderingContext2D;
  readonly buf: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = MIN_W;
  h = MIN_H;
  scale = 1;
  dpr = 1;
  portrait = false;
  onResize: (() => void) | null = null;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    this.dctx = display.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.ctx = this.buf.getContext('2d')!;
    this.resize();
    const again = () => this.resize();
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', () => setTimeout(again, 150));
    window.visualViewport?.addEventListener('resize', again);
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const pw = Math.floor(Math.min(window.innerWidth, vw) * this.dpr);
    const ph = Math.floor(Math.min(window.innerHeight, vh) * this.dpr);
    this.portrait = ph > pw;
    const mw = this.portrait ? MIN_W_PORTRAIT : MIN_W;
    const mh = this.portrait ? MIN_H_PORTRAIT : MIN_H;
    const scale = Math.max(1, Math.floor(Math.min(pw / mw, ph / mh)));
    const w = Math.ceil(pw / scale);
    const h = Math.ceil(ph / scale);
    if (w === this.w && h === this.h && scale === this.scale && this.display.width === w * scale) return;
    this.scale = scale;
    this.w = w;
    this.h = h;
    this.buf.width = this.w;
    this.buf.height = this.h;
    this.display.width = this.w * this.scale;
    this.display.height = this.h * this.scale;
    this.display.style.width = `${(this.w * this.scale) / this.dpr}px`;
    this.display.style.height = `${(this.h * this.scale) / this.dpr}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.dctx.imageSmoothingEnabled = false;
    this.onResize?.();
  }

  present(): void {
    this.dctx.imageSmoothingEnabled = false;
    this.dctx.drawImage(this.buf, 0, 0, this.w * this.scale, this.h * this.scale);
  }

  toInternal(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.display.getBoundingClientRect();
    return {
      x: Math.floor(((clientX - r.left) / r.width) * this.w),
      y: Math.floor(((clientY - r.top) / r.height) * this.h),
    };
  }
}
