import type { Ticket } from './tickets';
import type { AppId, CalEvent, CallState, Effects, ExecId, LogEntry, Message, Meter, Order, Script, Shortcut, Task } from './types';

export type Phase = 'title' | 'memo' | 'prep' | 'day' | 'review' | 'over' | 'end';

export interface BannerAction { label: string; run: () => void }
export interface Banner { id: number; app: AppId; title: string; body: string; born: number; action?: BannerAction; ttl?: number; /** Tapping it opens this message. */ msgId?: string }
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
  /** Meetings pushed from yesterday, landing in today's tray. */
  incoming: CalEvent[];
  /** Meetings pushed today, landing tomorrow. */
  carry: CalEvent[];
  /** Trellis tickets (they last across days). */
  tickets: Ticket[];
  /** Meetings you've booked on later days (by absolute day index). */
  future: Record<number, CalEvent[]>;
  /** What earlier days' calendars ended up looking like (read-only). */
  past: Record<number, CalEvent[]>;
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
  /** Pauses you've taken today (the first is free; the rest get more stressful). */
  pauses: number;
  speed: number;
  banners: Banner[];
  /** Presto shortcuts (kept between days). */
  shortcuts: Shortcut[];
  /** Seeds the ad-hoc pool, so a retried day plays the same. */
  seed: number;
  /** Drinks saved in Brew for one-tap reorders (kept between days). */
  savedDrinks: string[];
  /** Past Day 14: generated days, no ending. */
  endless: boolean;
  /** Kendall's track record (for the review and the ending). */
  kendall: { helped: number; sabotaged: number };
  /** Calendar layout: column order and hidden calendars. */
  calPrefs: { order: ExecId[]; hidden: ExecId[] };
  toasts: Toast[];
  sheet: Sheet | null;
  review: Review | null;
  overReason: string | null;
  seq: number;
}

export const START_METERS: Record<Meter, number> = { standing: 60, runway: 30000, morale: 60, stress: 20 };

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
  incoming: [],
  carry: [],
  future: {},
  past: {},
  tickets: [],
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
  pauses: 0,
  speed: 1,
  banners: [],
  shortcuts: [],
  seed: 1,
  savedDrinks: [],
  endless: false,
  kendall: { helped: 0, sabotaged: 0 },
  calPrefs: readCalPrefs(),
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

export function banner(app: AppId, title: string, body: string, action?: BannerAction, ttl?: number) {
  S.banners.push({ id: uid(), app, title, body, born: performance.now(), action, ttl });
  while (S.banners.filter((b) => !b.action).length > 3) S.banners.splice(S.banners.findIndex((b) => !b.action), 1);
  while (S.banners.filter((b) => b.action).length > 2) S.banners.splice(S.banners.findIndex((b) => b.action), 1);
  dirty();
}

export function addStrike(note: string) {
  S.strikes++;
  S.strikeNotes.push(note);
  banner('calendar', '📅 Margo invited you: "Quick chat? 🙂"', note);
}

// ───────────── calendar layout (a display preference, saved on every change) ─────────────
function readCalPrefs(): { order: ExecId[]; hidden: ExecId[] } {
  try {
    const raw = localStorage.getItem('double-booked-calendars');
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage may be unavailable */
  }
  return { order: [], hidden: [] };
}
export function saveCalPrefs() {
  try {
    localStorage.setItem('double-booked-calendars', JSON.stringify(S.calPrefs));
  } catch {
    /* storage may be unavailable */
  }
}

// ───────────── save / load ─────────────
const KEY = 'double-booked-save-v1';
export interface Save { dayIndex: number; meters: Record<Meter, number>; strikes: number; strikeNotes: string[]; flags: string[]; incoming?: CalEvent[]; shortcuts?: Shortcut[]; seed?: number; endless?: boolean; savedDrinks?: string[]; messages?: Message[]; kendall?: { helped: number; sabotaged: number }; future?: Record<number, CalEvent[]>; past?: Record<number, CalEvent[]>; tickets?: Ticket[] }

export function writeSave() {
  try {
    const s: Save = { dayIndex: S.dayIndex, meters: { ...S.meters }, strikes: S.strikes, strikeNotes: [...S.strikeNotes], flags: [...S.flags], incoming: S.incoming, shortcuts: S.shortcuts, seed: S.seed, endless: S.endless, savedDrinks: S.savedDrinks, messages: S.messages, kendall: S.kendall, future: S.future, past: S.past, tickets: S.tickets };
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
