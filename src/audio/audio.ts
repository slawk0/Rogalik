// Tiny WebAudio synth: every sound is generated, no files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
export let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

const SETTINGS_KEY = 'nawia.audio.v1';
try {
  muted = localStorage.getItem(SETTINGS_KEY) === 'muted';
} catch {
  /* ignore */
}

export function audioCtx(): AudioContext | null {
  return ctx;
}

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
  try {
    localStorage.setItem(SETTINGS_KEY, muted ? 'muted' : 'on');
  } catch {
    /* ignore */
  }
  return muted;
}

interface Tone {
  wave?: OscillatorType | 'noise';
  f0?: number;
  f1?: number;
  dur?: number;
  vol?: number;
  attack?: number;
  delay?: number;
  filter?: number;
  filterEnd?: number;
  q?: number;
  bus?: 'sfx' | 'music';
}

export function tone(t: Tone): void {
  if (!ctx || !sfxBus || !musicBus) return;
  const now = ctx.currentTime + (t.delay ?? 0);
  const dur = t.dur ?? 0.1;
  const vol = t.vol ?? 0.3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + (t.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let src: AudioScheduledSourceNode;
  if (t.wave === 'noise') {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.playbackRate.value = (t.f0 ?? 1000) / 1000;
    src = n;
  } else {
    const o = ctx.createOscillator();
    o.type = t.wave ?? 'square';
    o.frequency.setValueAtTime(t.f0 ?? 440, now);
    if (t.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, t.f1), now + dur);
    src = o;
  }
  let node: AudioNode = src;
  if (t.filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(t.filter, now);
    if (t.filterEnd) f.frequency.exponentialRampToValueAtTime(t.filterEnd, now + dur);
    f.Q.value = t.q ?? 1;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(t.bus === 'music' ? musicBus : sfxBus);
  src.start(now);
  src.stop(now + dur + 0.05);
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const sfx = {
  step() {
    tone({ wave: 'noise', f0: 600, dur: 0.06, vol: 0.12, filter: 1200 });
    tone({ wave: 'triangle', f0: rnd(150, 180), f1: 90, dur: 0.06, vol: 0.12 });
  },
  hop() {
    tone({ wave: 'square', f0: 220, f1: 440, dur: 0.08, vol: 0.06, filter: 2000 });
  },
  slash(pitch = 1) {
    tone({ wave: 'noise', f0: 2500, dur: 0.12, vol: 0.35, filter: 6000 * pitch, filterEnd: 900 });
    tone({ wave: 'sawtooth', f0: 900 * pitch, f1: 300, dur: 0.09, vol: 0.08, filter: 3000 });
  },
  lunge() {
    tone({ wave: 'noise', f0: 1800, dur: 0.18, vol: 0.4, filter: 7000, filterEnd: 500 });
    tone({ wave: 'square', f0: 140, f1: 50, dur: 0.18, vol: 0.25, filter: 1500 });
  },
  shove() {
    tone({ wave: 'noise', f0: 500, dur: 0.18, vol: 0.3, filter: 1400, filterEnd: 200 });
    tone({ wave: 'triangle', f0: 120, f1: 60, dur: 0.15, vol: 0.3 });
  },
  hit(combo = 0) {
    tone({ wave: 'square', f0: 180 + combo * 40, f1: 60, dur: 0.12, vol: 0.3, filter: 2400 });
    tone({ wave: 'noise', f0: 900, dur: 0.08, vol: 0.25, filter: 3000 });
  },
  bump() {
    tone({ wave: 'triangle', f0: 90, f1: 40, dur: 0.2, vol: 0.45 });
    tone({ wave: 'noise', f0: 300, dur: 0.15, vol: 0.3, filter: 800 });
  },
  hurt() {
    tone({ wave: 'sawtooth', f0: 300, f1: 70, dur: 0.35, vol: 0.35, filter: 1800 });
    tone({ wave: 'noise', f0: 700, dur: 0.25, vol: 0.3, filter: 2000 });
  },
  die(combo = 1) {
    const base = 330 * Math.pow(1.122, Math.min(combo - 1, 8));
    tone({ wave: 'square', f0: base, dur: 0.07, vol: 0.12, filter: 3000 });
    tone({ wave: 'square', f0: base * 1.5, dur: 0.1, vol: 0.1, delay: 0.06, filter: 3000 });
    tone({ wave: 'noise', f0: 1200, dur: 0.2, vol: 0.2, filter: 2500, filterEnd: 300 });
  },
  splash() {
    tone({ wave: 'noise', f0: 1500, dur: 0.4, vol: 0.35, filter: 2500, filterEnd: 300 });
    tone({ wave: 'sine', f0: 600, f1: 200, dur: 0.25, vol: 0.15 });
    tone({ wave: 'sine', f0: 900, f1: 400, dur: 0.1, vol: 0.08, delay: 0.15 });
  },
  fall() {
    tone({ wave: 'triangle', f0: 600, f1: 60, dur: 0.6, vol: 0.2 });
  },
  burn() {
    tone({ wave: 'noise', f0: 900, dur: 0.5, vol: 0.3, filter: 3000, filterEnd: 600 });
  },
  boom() {
    tone({ wave: 'noise', f0: 400, dur: 0.6, vol: 0.6, filter: 1600, filterEnd: 100 });
    tone({ wave: 'sine', f0: 90, f1: 30, dur: 0.5, vol: 0.5 });
  },
  bolt() {
    tone({ wave: 'sawtooth', f0: 1600, f1: 200, dur: 0.15, vol: 0.15, filter: 5000 });
    tone({ wave: 'noise', f0: 3000, dur: 0.2, vol: 0.25, filter: 8000, filterEnd: 1000 });
  },
  fire() {
    tone({ wave: 'noise', f0: 600, dur: 0.35, vol: 0.3, filter: 1800, filterEnd: 400 });
    tone({ wave: 'sawtooth', f0: 110, f1: 70, dur: 0.3, vol: 0.12, filter: 600 });
  },
  arrow() {
    tone({ wave: 'noise', f0: 4000, dur: 0.12, vol: 0.2, filter: 9000, filterEnd: 2000 });
    tone({ wave: 'sine', f0: 1200, f1: 700, dur: 0.1, vol: 0.06 });
  },
  dark() {
    tone({ wave: 'sawtooth', f0: 70, f1: 140, dur: 0.4, vol: 0.2, filter: 900 });
    tone({ wave: 'sine', f0: 440, f1: 220, dur: 0.4, vol: 0.08 });
  },
  roots() {
    tone({ wave: 'noise', f0: 250, dur: 0.35, vol: 0.4, filter: 900, filterEnd: 200 });
    tone({ wave: 'square', f0: 70, f1: 50, dur: 0.3, vol: 0.15, filter: 400 });
  },
  intent() {
    tone({ wave: 'square', f0: 880, dur: 0.05, vol: 0.06, filter: 4000 });
    tone({ wave: 'square', f0: 660, dur: 0.06, vol: 0.06, delay: 0.05, filter: 4000 });
  },
  leap() {
    tone({ wave: 'square', f0: 200, f1: 700, dur: 0.22, vol: 0.12, filter: 2500 });
  },
  land() {
    tone({ wave: 'sine', f0: 120, f1: 40, dur: 0.3, vol: 0.55 });
    tone({ wave: 'noise', f0: 500, dur: 0.3, vol: 0.4, filter: 1500, filterEnd: 150 });
  },
  block() {
    tone({ wave: 'square', f0: 1300, dur: 0.05, vol: 0.12 });
    tone({ wave: 'triangle', f0: 2000, f1: 1500, dur: 0.3, vol: 0.12, delay: 0.03 });
  },
  heal() {
    [523, 659, 784].forEach((f, i) => tone({ wave: 'triangle', f0: f, dur: 0.18, vol: 0.12, delay: i * 0.07 }));
  },
  spawn() {
    tone({ wave: 'sawtooth', f0: 80, f1: 300, dur: 0.25, vol: 0.12, filter: 1200 });
  },
  crush() {
    tone({ wave: 'noise', f0: 1800, dur: 0.12, vol: 0.25, filter: 4000 });
    tone({ wave: 'square', f0: 300, f1: 120, dur: 0.08, vol: 0.08 });
  },
  combo(n: number) {
    const notes = [523, 587, 659, 784, 880, 1047, 1175, 1319];
    for (let i = 0; i < Math.min(n, 6); i++) {
      tone({ wave: 'square', f0: notes[Math.min(i + n - 2, notes.length - 1)], dur: 0.12, vol: 0.08, delay: i * 0.05, filter: 5000 });
    }
  },
  clear() {
    [392, 494, 587, 784].forEach((f, i) => tone({ wave: 'square', f0: f, dur: 0.35, vol: 0.09, delay: i * 0.09, filter: 3500 }));
    tone({ wave: 'triangle', f0: 196, dur: 0.8, vol: 0.2, delay: 0.1 });
  },
  select() {
    tone({ wave: 'square', f0: 660, dur: 0.05, vol: 0.08, filter: 4000 });
  },
  confirm() {
    tone({ wave: 'square', f0: 523, dur: 0.06, vol: 0.1, filter: 4000 });
    tone({ wave: 'square', f0: 784, dur: 0.12, vol: 0.1, delay: 0.06, filter: 4000 });
  },
  gift() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ wave: 'triangle', f0: f, dur: 0.4, vol: 0.12, delay: i * 0.06 }));
    tone({ wave: 'noise', f0: 5000, dur: 0.6, vol: 0.08, filter: 9000, filterEnd: 3000 });
  },
  denied() {
    tone({ wave: 'square', f0: 150, dur: 0.08, vol: 0.08, filter: 1200 });
  },
  descend() {
    tone({ wave: 'triangle', f0: 400, f1: 80, dur: 0.7, vol: 0.2 });
    tone({ wave: 'noise', f0: 600, dur: 0.7, vol: 0.12, filter: 1200, filterEnd: 200 });
  },
  egg() {
    tone({ wave: 'noise', f0: 2500, dur: 0.6, vol: 0.5, filter: 6000, filterEnd: 400 });
    [784, 622, 523, 392].forEach((f, i) => tone({ wave: 'square', f0: f, dur: 0.25, vol: 0.1, delay: 0.1 + i * 0.1, filter: 3000 }));
  },
  death() {
    [392, 330, 262, 196].forEach((f, i) => tone({ wave: 'square', f0: f, dur: 0.4, vol: 0.12, delay: i * 0.18, filter: 1800 }));
    tone({ wave: 'sine', f0: 100, f1: 30, dur: 1.2, vol: 0.4 });
  },
  immortal() {
    tone({ wave: 'sawtooth', f0: 220, f1: 110, dur: 0.3, vol: 0.12, filter: 1500 });
    tone({ wave: 'sine', f0: 1760, dur: 0.2, vol: 0.05 });
  },
  roar() {
    tone({ wave: 'sawtooth', f0: 90, f1: 60, dur: 0.7, vol: 0.3, filter: 700, q: 6 });
    tone({ wave: 'noise', f0: 300, dur: 0.6, vol: 0.25, filter: 900 });
  },
};
