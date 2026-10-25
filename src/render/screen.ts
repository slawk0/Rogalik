export const MIN_W = 480;
export const MIN_H = 300;

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
  onResize: (() => void) | null = null;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    this.dctx = display.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.ctx = this.buf.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const pw = Math.floor(window.innerWidth * this.dpr);
    const ph = Math.floor(window.innerHeight * this.dpr);
    this.scale = Math.max(1, Math.floor(Math.min(pw / MIN_W, ph / MIN_H)));
    this.w = Math.ceil(pw / this.scale);
    this.h = Math.ceil(ph / this.scale);
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
