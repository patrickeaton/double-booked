import type { AppId, CalEvent, CallState, Effects, LogEntry, Message, Meter, Order, Script, Task } from './types';

export type Phase = 'title' | 'memo' | 'prep' | 'day' | 'review' | 'over' | 'end';

export interface Banner { id: number; app: AppId; title: string; body: string; born: number }
export interface Toast { id: number; text: string; good: boolean; born: number }
export interface Sheet { productId: string; to: string | null; pay: 'company' | 'me' }

export interface Review {
  deltas: Record<Meter, number>;
  highlights: LogEntry[];
  notes: string[];
  newStrikes: string[];
  bossNote: string;
}

export interface GameState {
  phase: Phase;
  dayIndex: number;
  now: number;
  meters: Record<Meter, number>;
  startMeters: Record<Meter, number>;
  strikes: number;
  strikeNotes: string[];
  flags: string[];
  events: CalEvent[];
  messages: Message[];
  call: CallState | null;
  tasks: Task[];
  orders: Order[];
  ledger: { at: number; label: string; amount: number }[];
  log: LogEntry[];
  queue: Script[];
  app: AppId;
  openMail: string | null;
  selected: string | null;
  paused: boolean;
  speed: number;
  battery: number;
  deadUntil: number | null;
  lowBatteryWarned: boolean;
  banners: Banner[];
  toasts: Toast[];
  sheet: Sheet | null;
  review: Review | null;
  overReason: string | null;
  seq: number;
}

export const START_METERS: Record<Meter, number> = { standing: 60, runway: 40000, morale: 60, stress: 20 };

export const S: GameState = {
  phase: 'title',
  dayIndex: 0,
  now: 0,
  meters: { ...START_METERS },
  startMeters: { ...START_METERS },
  strikes: 0,
  strikeNotes: [],
  flags: [],
  events: [],
  messages: [],
  call: null,
  tasks: [],
  orders: [],
  ledger: [],
  log: [],
  queue: [],
  app: 'calendar',
  openMail: null,
  selected: null,
  paused: false,
  speed: 1,
  battery: 100,
  deadUntil: null,
  lowBatteryWarned: false,
  banners: [],
  toasts: [],
  sheet: null,
  review: null,
  overReason: null,
  seq: 1,
};

export const uid = () => S.seq++;

// ───────────── render scheduling (ui registers the real renderer) ─────────────
let renderer: () => void = () => {};
let queued = false;
export function setRenderer(fn: () => void) {
  renderer = fn;
}
export function dirty() {
  if (queued) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    renderer();
  }, 0);
}

// ───────────── meters ─────────────
export const METER_LABEL: Record<Meter, string> = { standing: 'Standing', runway: 'Runway', morale: 'Morale', stress: 'Stress' };

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return a >= 1000 ? `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `${sign}$${Math.round(a)}`;
}

export function fmtEffect(m: Meter, v: number): string {
  if (m === 'runway') return `${v > 0 ? '+' : ''}${fmtMoney(v)}`;
  return `${v > 0 ? '+' : ''}${Math.round(v)} ${METER_LABEL[m]}`;
}

/** Stress going UP is bad; everything else going down is bad. */
export const isGood = (m: Meter, v: number) => (m === 'stress' ? v < 0 : v > 0);

export function applyEffects(eff: Effects | undefined, text: string, quiet = false) {
  if (!eff) return;
  for (const [k, v] of Object.entries(eff) as [Meter, number][]) {
    if (!v) continue;
    S.meters[k] += v;
    if (k !== 'runway') S.meters[k] = Math.max(0, Math.min(100, S.meters[k]));
    if (!quiet) S.toasts.push({ id: uid(), text: fmtEffect(k, v), good: isGood(k, v), born: performance.now() });
  }
  if (Object.values(eff).some((v) => v)) S.log.push({ at: S.now, text, effects: eff });
  dirty();
}

export function banner(app: AppId, title: string, body: string) {
  S.banners.push({ id: uid(), app, title, body, born: performance.now() });
  if (S.banners.length > 3) S.banners.shift();
  dirty();
}

export function addStrike(note: string) {
  S.strikes++;
  S.strikeNotes.push(note);
  banner('calendar', '📅 Margo invited you: "Quick chat? 🙂"', note);
}

// ───────────── save / load ─────────────
const KEY = 'double-booked-save-v1';
export interface Save { dayIndex: number; meters: Record<Meter, number>; strikes: number; strikeNotes: string[]; flags: string[] }

export function writeSave() {
  try {
    const s: Save = { dayIndex: S.dayIndex, meters: { ...S.meters }, strikes: S.strikes, strikeNotes: [...S.strikeNotes], flags: [...S.flags] };
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable */
  }
}

export function readSave(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Save) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
