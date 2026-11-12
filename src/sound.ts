// Alert sounds, synthesised with Web Audio so there are no files to load.
// Every app gets its own little signature, so you can tell Mail from Huddle without looking.
import type { AppId } from './types';

const KEY = 'double-booked-sound';
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export const soundOn = () => on;
export function toggleSound() {
  on = !on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  if (on) { unlock(); play('calendar'); }
}

/** Browsers (iOS especially) only allow audio after a tap, so wake the context on the first one. */
function unlock() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });

type Wave = OscillatorType;
/** One note: a quick attack and an exponential fade, optionally sliding in pitch. */
function tone(at: number, freq: number, dur: number, wave: Wave = 'sine', vol = 0.6, slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A soft filtered noise burst: knocks, paper, whooshes. */
function noise(at: number, dur: number, freq: number, vol = 0.5, q = 1) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + at;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

/** A bell-ish note: the fundamental plus a quiet, slightly inharmonic overtone. */
const bell = (at: number, f: number, dur = 0.6, vol = 0.45) => { tone(at, f, dur, 'sine', vol); tone(at, f * 2.76, dur * 0.4, 'sine', vol * 0.18); };

const SOUNDS: Partial<Record<AppId | 'ring' | 'request' | 'bad', () => void>> = {
  // Calendar: a calm three-note chime, rising
  calendar: () => { bell(0, 659); bell(0.09, 784); bell(0.18, 988, 0.8); },
  // A new request: two quick bright notes
  request: () => { bell(0, 880, 0.35); bell(0.08, 1175, 0.5); },
  // Mail: paper whoosh, then a single low ding
  mail: () => { noise(0, 0.18, 2400, 0.25, 0.7); bell(0.12, 587, 0.7, 0.4); },
  // Huddle: a woody knock-knock
  huddle: () => { tone(0, 220, 0.09, 'triangle', 0.7, 140); noise(0, 0.05, 900, 0.3, 3); tone(0.13, 247, 0.09, 'triangle', 0.7, 150); noise(0.13, 0.05, 900, 0.3, 3); },
  // Messages: a rounded upward bloop
  messages: () => { tone(0, 520, 0.16, 'sine', 0.5, 900); tone(0.1, 1040, 0.22, 'sine', 0.3); },
  // Notes: two pencil taps
  notes: () => { noise(0, 0.03, 4200, 0.5, 4); noise(0.08, 0.03, 3600, 0.4, 4); },
  // Brew: a little bubbling pour
  brew: () => { [0, 0.05, 0.1, 0.16].forEach((at, i) => tone(at, 400 + i * 140, 0.07, 'sine', 0.35, 700 + i * 160)); },
  // Bundl: a parcel thud and a cheerful pip
  bundl: () => { tone(0, 110, 0.15, 'sine', 0.7, 60); bell(0.1, 1318, 0.3, 0.3); },
  // Card: the payment terminal double beep
  card: () => { tone(0, 1568, 0.09, 'square', 0.12); tone(0.12, 1568, 0.09, 'square', 0.12); },
  // Ryde: a polite toot-toot
  ryde: () => { tone(0, 392, 0.14, 'sawtooth', 0.12); tone(0, 494, 0.14, 'sawtooth', 0.1); tone(0.18, 392, 0.2, 'sawtooth', 0.12); tone(0.18, 494, 0.2, 'sawtooth', 0.1); },
  // Tably: glass clink
  tably: () => { tone(0, 2093, 0.5, 'sine', 0.25); tone(0, 3140, 0.3, 'sine', 0.12); tone(0.07, 2349, 0.45, 'sine', 0.18); },
  // Presto: a tiny fanfare
  presto: () => { [523, 659, 784, 1047].forEach((f, i) => tone(i * 0.06, f, 0.18, 'triangle', 0.3)); },
  // Pulse: a heartbeat
  pulse: () => { tone(0, 90, 0.12, 'sine', 0.8, 60); tone(0.16, 80, 0.14, 'sine', 0.6, 55); },
  // Trellis: wooden blocks stacking
  trellis: () => { [0, 0.07, 0.14].forEach((at, i) => { tone(at, 600 + i * 150, 0.06, 'triangle', 0.45); noise(at, 0.03, 1800, 0.15, 5); }); },
  // Something went wrong: a short sour drop
  bad: () => { tone(0, 330, 0.25, 'triangle', 0.4, 220); tone(0.02, 311, 0.25, 'triangle', 0.25, 208); },
  // Incoming call: a two-tone trill
  ring: () => { for (let i = 0; i < 6; i++) { tone(i * 0.07, i % 2 ? 1046 : 880, 0.07, 'sine', 0.3); } },
};

let last = 0;
const lastBy: Record<string, number> = {};
/** Play an app's alert. Bursts are thinned out, so a flood of banners doesn't turn into noise. */
export function play(kind: AppId | 'ring' | 'request' | 'bad') {
  if (!on || document.hidden) return;
  unlock();
  if (!ctx || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - last < 150 || now - (lastBy[kind] ?? 0) < 700) return;
  last = now;
  lastBy[kind] = now;
  (SOUNDS[kind] ?? SOUNDS.calendar)!();
}
