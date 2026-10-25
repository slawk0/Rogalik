import { audioCtx, musicBus } from './audio';

// Notes as "D5", "F#4", "Bb3"; "." = rest, "-" = hold.
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return -1;
  let v = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  v += (Number(m[3]) + 1) * 12;
  return v;
}
const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Track {
  bpm: number;
  lead: string;
  bass: string;
  arp?: string;
  hat?: string;
  leadWave?: OscillatorType;
  leadVol?: number;
  bassVol?: number;
}

const parse = (s: string) => s.trim().split(/\s+/);

// D "góralska" scale (lydian dominant): D E F# G# A B C.
const TRACKS: Record<number, Track> = {
  0: {
    bpm: 104,
    lead: `A4 . D5 . E5 F#5 G#5 . A5 - - . G#5 F#5 E5 .
           F#5 . E5 . D5 . E5 . F#5 - - - . . . .
           A4 . C5 . D5 E5 F#5 . G#5 . A5 . G#5 . F#5 .
           E5 . D5 . C5 . D5 . D5 - - - . . . .
           A5 . . A5 G#5 . F#5 . G#5 . . G#5 F#5 . E5 .
           F#5 . E5 . D5 . C5 . D5 - - - . . . .
           . . A4 . D5 . F#5 . A5 . G#5 . F#5 . E5 .
           D5 - - - . . . . . . . . . . . .`,
    bass: `D2 . . . A2 . . . D2 . . . A2 . . .
           C3 . . . G2 . . . C3 . . . G2 . . .
           D2 . . . A2 . . . D2 . . . A2 . . .
           C3 . . . G2 . . . D2 . . . A2 . . .`,
    hat: 'x . x . x . x x x . x . x . x x',
    leadWave: 'square',
    leadVol: 0.05,
  },
  1: {
    bpm: 78,
    lead: `E5 - - . . . D#5 . E5 - - . . . . .
           B4 - - . . . A4 . G4 - - - . . . .
           E5 - - . . . F#5 . G5 - - . F#5 . E5 .
           D#5 - - - - - . . . . . . . . . .`,
    bass: `E2 - - - - - - - B1 - - - - - - -
           C2 - - - - - - - B1 - - - - - - -`,
    arp: 'E4 G4 B4 G4 E4 G4 B4 G4 C4 E4 G4 E4 B3 D#4 F#4 D#4',
    leadWave: 'triangle',
    leadVol: 0.09,
  },
  2: {
    bpm: 92,
    lead: `D5 . Eb5 . D5 . . . A4 . Bb4 . A4 . . .
           D5 . F5 . Eb5 . D5 . C5 . Bb4 . A4 - - .
           G#4 . A4 . D5 . Eb5 . F5 . Eb5 . D5 . C5 .
           D5 - - - . . . . . . . . . . . .`,
    bass: `D2 . D2 . . . D2 . Eb2 . Eb2 . . . D2 .
           D2 . D2 . . . D2 . C2 . C2 . G#1 . A1 .`,
    hat: 'x . . x . . x . x . . x . x . .',
    leadWave: 'sawtooth',
    leadVol: 0.035,
  },
  3: {
    bpm: 120,
    lead: `D5 . F#5 . A5 . D6 - - . A5 . D6 . E6 .
           F#6 - - . E6 . D6 . C6 . D6 - - - . .`,
    bass: 'D2 . A2 . D3 . A2 . C3 . G2 . D2 . A2 .',
    hat: 'x . x . x . x . x . x . x . x x',
    leadWave: 'square',
    leadVol: 0.05,
  },
  4: {
    bpm: 112,
    lead: `D5 . D5 E5 F#5 . G#5 . A5 . A5 . G#5 . F#5 .
           E5 . E5 F#5 G#5 . F#5 . E5 . D5 . C5 . . .
           D5 . D5 E5 F#5 . G#5 . A5 . B5 . A5 . G#5 .
           F#5 . E5 . D5 . C5 . D5 - - - . . . .`,
    bass: `D2 . A2 . D2 . A2 . E2 . B2 . E2 . B2 .
           D2 . A2 . D2 . A2 . C3 . G2 . D2 . A2 .`,
    hat: 'x . x x x . x x x . x x x . x x',
    leadWave: 'square',
    leadVol: 0.05,
  },
};

let current = -99;
let timer: number | null = null;
let stepIdx = 0;
let nextTime = 0;

function voice(m: number, t: number, dur: number, wave: OscillatorType, vol: number, cutoff = 2800): void {
  const ctx = audioCtx();
  if (!ctx || !musicBus || m < 0) return;
  const o = ctx.createOscillator();
  o.type = wave;
  o.frequency.value = freq(m);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  o.connect(f).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hat(t: number): void {
  const ctx = audioCtx();
  if (!ctx || !musicBus) return;
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  s.connect(f).connect(g).connect(musicBus);
  s.start(t);
}

/** Length (in steps) a note at index i holds, counting following "-" tokens. */
function holdLen(seq: string[], i: number): number {
  let n = 1;
  while (seq[(i + n) % seq.length] === '-' && n < seq.length) n++;
  return n;
}

function tick(): void {
  const ctx = audioCtx();
  const tr = TRACKS[current];
  if (!ctx || !tr) return;
  const stepDur = 60 / tr.bpm / 4;
  const lead = parse(tr.lead);
  const bass = parse(tr.bass);
  const arp = tr.arp ? parse(tr.arp) : null;
  const hats = tr.hat ? parse(tr.hat) : null;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + 0.15) {
    const i = stepIdx;
    const ln = lead[i % lead.length];
    if (ln !== '.' && ln !== '-') voice(midi(ln), nextTime, stepDur * holdLen(lead, i % lead.length) * 0.95, tr.leadWave ?? 'square', tr.leadVol ?? 0.05);
    const bn = bass[i % bass.length];
    if (bn !== '.' && bn !== '-') voice(midi(bn), nextTime, stepDur * holdLen(bass, i % bass.length) * 0.9, 'triangle', tr.bassVol ?? 0.16, 900);
    if (arp && i % 2 === 0) {
      const an = arp[(i / 2) % arp.length];
      if (an !== '.') voice(midi(an), nextTime, stepDur * 1.6, 'square', 0.018, 1600);
    }
    if (hats && hats[i % hats.length] === 'x') hat(nextTime);
    nextTime += stepDur;
    stepIdx++;
  }
}

export function playMusic(track: number): void {
  if (track === current) return;
  current = track;
  stepIdx = 0;
  const ctx = audioCtx();
  nextTime = ctx ? ctx.currentTime + 0.1 : 0;
  if (timer === null) timer = window.setInterval(tick, 40);
}
