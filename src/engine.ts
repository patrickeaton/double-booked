import { DAYS, dayAt } from './days';
import { drinkEmoji, drinkMatch, drinkName, drinkPrice } from './drinks';
import { CAL_START, DAY_END, DAY_START, EXECS, PAYROLL, PREP_TIME, PRODUCTS, RESTAURANTS, RIDE_COST, RULES, fmt } from './data';
import {
  S, START_METERS, addStrike, applyEffects, banner, dirty, fmtMoney, readSave, uid, writeSave, clearSave,
} from './state';
import { offerShortcut } from './shortcuts';
import { generateAdhoc } from './adhoc';
import { ticketsFor } from './tickets';
import type { AppId, CalEvent, Effects, ExecId, Message, MsgDef, Script } from './types';

export const day = () => dayAt(S.dayIndex);

// ── What the meters actually do ──
export const runwayDays = () => Math.max(0, Math.floor(S.meters.runway / PAYROLL));
export const cardFrozen = () => runwayDays() < 5;
export const lowMorale = () => S.meters.morale < 35;
export const highMorale = () => S.meters.morale >= 70;
/** Stress makes the day run faster and messages expire sooner. */
export const stressPace = () => (S.meters.stress >= 80 ? 1.3 : S.meters.stress >= 60 ? 1.15 : 1);

export interface MeterEffect { text: string; good: boolean }
/** Only what's actually affecting you right now (nothing about systems you haven't met yet). */
export function meterEffects(): Record<'standing' | 'runway' | 'morale' | 'stress', MeterEffect[]> {
  const m = S.meters;
  const kendallHere = S.dayIndex >= 7;
  const adviceHere = S.dayIndex >= 2;
  const trust = 0.25 + (m.standing - 40) / 100;
  const trustLine: MeterEffect =
    trust >= 0.65 ? { text: 'Margo trusts you. She usually takes your advice.', good: true }
    : trust >= 0.45 ? { text: 'Margo is starting to trust you. Sometimes she listens.', good: true }
    : trust >= 0.25 ? { text: "Margo isn't sure about you. She mostly goes with her gut.", good: false }
    : { text: "Margo doesn't trust you. She ignores your advice.", good: false };
  const standing: MeterEffect[] = [];
  if (adviceHere) standing.push(trustLine);
  if (m.standing < 25) standing.push({ text: 'One bad day from being fired.', good: false });
  else if (m.standing >= 60) standing.push({ text: 'On track to pass probation.', good: true });
  else if (m.standing < 40) standing.push({ text: "If your review were today, you'd be let go.", good: false });

  const runway: MeterEffect[] = [{ text: `${runwayDays()} days of payroll left.`, good: runwayDays() >= 8 }];
  if (cardFrozen()) runway.push({ text: '🧊 Company card frozen: spending comes out of your pocket.', good: false });

  const morale: MeterEffect[] = [];
  if (lowMorale()) {
    morale.push({ text: 'Meetings are dragging on 10 min longer.', good: false });
    if (kendallHere) morale.push({ text: 'Kendall is getting bolder.', good: false });
  } else if (highMorale()) {
    const used = S.flags.includes(`covered-${S.dayIndex}`);
    morale.push({ text: used ? 'A teammate already covered for you today.' : 'A teammate will cover the next meeting you miss today.', good: true });
    if (kendallHere) morale.push({ text: 'Kendall is on their best behaviour.', good: true });
  }

  const stress: MeterEffect[] = [];
  if (stressPace() > 1) stress.push({ text: `Frazzled: the day is running ${Math.round((stressPace() - 1) * 100)}% faster.`, good: false });
  if (m.stress >= 80) stress.push({ text: 'Messages are expiring sooner.', good: false });
  return { standing, runway, morale, stress };
}
/** Today's calendars, minus anyone who has left (e.g. Dana after the board vote). */
export const activeExecs = (): ExecId[] => day().execs.filter((x) => !S.flags.includes(`gone-${x}`));
export const unlockedApps = (): AppId[] => DAYS.slice(0, S.dayIndex + 1).flatMap((d) => d.apps);
export const hasApp = (a: AppId) => unlockedApps().includes(a);
export const isNewApp = (a: AppId) => S.dayIndex > 0 && day().apps.includes(a);
export const findEvent = (id: string | null) => S.events.find((e) => e.id === id);
/** Your own personal events (lunch, the flat, Mum): skipping them costs stress, never standing. */
export const isMyLife = (e: CalEvent) => e.kind === 'personal' && e.attendees.length === 1 && e.attendees[0] === 'me';
function lifeOnly(e: CalEvent, fx: Effects): Effects {
  if (!isMyLife(e)) return fx;
  const hurt = Object.entries(fx).reduce((n, [k, v]) => n + (k === 'stress' ? Math.max(0, v as number) : Math.max(0, -(v as number))), 0);
  return { stress: Math.max(3, Math.round(hurt)) };
}
const end = (e: CalEvent) => (e.start ?? 0) + e.duration;
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
const shares = (a: CalEvent, b: CalEvent) => a.attendees.some((x) => b.attendees.includes(x));
const active = (e: CalEvent) => e.status === 'scheduled' || e.status === 'running';
/** Focus time and work blocks don't make anyone "busy": meetings can land on top of them (and interrupt). */
const blocks = (e: CalEvent) => e.kind !== 'focus' && e.kind !== 'work';
/** Meeting rules only apply to meetings. */
const ruled = (e: CalEvent) => !e.fixed && e.kind !== 'work';
export const travelOf = (e: CalEvent) => (e.travel && !e.remote ? e.travel : 0);
/** Where it happens: at the office, on video, or somewhere else (with travel). */
export const whereOf = (e: CalEvent): 'office' | 'virtual' | 'offsite' => (e.remote ? 'virtual' : e.travel ? 'offsite' : 'office');
export const atOffice = (e: CalEvent) => whereOf(e) === 'office';
export const placeLabel = (e: CalEvent) => (e.remote ? '💻 Video call' : e.travel ? `📍 ${e.place ?? 'Off-site'}` : '🏢 Sproutly office');
/** Prep has to be done by this minute: the meeting start if they're in a Ryde (they prep on the way), or before they leave if they drive. */
const prepBy = (e: CalEvent) => (e.withRide && travelOf(e) ? (e.start ?? 0) : (e.start ?? 0) - travelOf(e));
/** Buffers: protected time either side. Travel fills them automatically; you can make them bigger. */
export const padBefore = (e: CalEvent) => Math.max(travelOf(e), e.bufferBefore ?? 0);
export const padAfter = (e: CalEvent) => Math.max(travelOf(e), e.bufferAfter ?? 0);
const padStart = (e: CalEvent) => (e.start ?? 0) - padBefore(e);
const padEnd = (e: CalEvent) => end(e) + padAfter(e);
export const canBuffer = (e: CalEvent) => e.kind !== 'focus' && e.kind !== 'work' && (e.status === 'pending' || e.status === 'scheduled') && !e.departed;
export function setBuffer(id: string, side: 'before' | 'after', delta: number) {
  const e = findEvent(id);
  if (!e || !canBuffer(e)) return;
  const key = side === 'before' ? 'bufferBefore' : 'bufferAfter';
  const cur = side === 'before' ? padBefore(e) : padAfter(e);
  e[key] = Math.max(travelOf(e), Math.min(120, cur + delta));
  dirty();
}
const occStart = (e: CalEvent) => (e.start ?? 0) - travelOf(e);
const occEnd = (e: CalEvent) => end(e) + travelOf(e);
export const COFFEE_ADDON = 6; // per attendee
export const CATERING_COST = 90;

/** Is this exec tied up right now by `o` (in it, or travelling to/from it)? */
function occupying(o: CalEvent, now: number): boolean {
  if (!blocks(o) || o.start === null) return false;
  if (o.status === 'running') return true;
  if (o.status === 'scheduled' && o.departed) return true;
  if (o.status === 'done' && travelOf(o) && now < occEnd(o)) return true;
  return false;
}

// ───────────────────────────── game flow ─────────────────────────────

export function newGame() {
  clearSave();
  S.meters = { ...START_METERS };
  S.strikes = 0;
  S.strikeNotes = [];
  S.flags = [];
  S.ledger = [];
  S.incoming = [];
  S.carry = [];
  S.future = {};
  S.past = {};
  S.tickets = [];
  S.messages = [];
  S.kendall = { helped: 0, sabotaged: 0 };
  S.shortcuts = [];
  S.seed = Math.floor(Math.random() * 1e9);
  S.endless = false;
  S.savedDrinks = [];
  setupDay(0);
}

export function continueGame() {
  const save = readSave();
  if (!save) return newGame();
  S.meters = { ...save.meters };
  S.strikes = save.strikes;
  S.strikeNotes = [...save.strikeNotes];
  S.flags = [...save.flags];
  S.ledger = [];
  S.incoming = save.incoming ?? [];
  S.shortcuts = (save.shortcuts ?? []).filter((s) => (s.kind as string) !== 'rides');
  S.seed = save.seed ?? 1;
  S.endless = save.endless ?? false;
  S.savedDrinks = save.savedDrinks ?? [];
  S.messages = save.messages ?? [];
  S.kendall = save.kendall ?? { helped: 0, sabotaged: 0 };
  S.future = save.future ?? {};
  S.past = save.past ?? {};
  S.tickets = save.tickets ?? [];
  S.carry = [];
  setupDay(save.dayIndex);
}

/** Earlier days stay in Mail / Messages / Huddle as read, settled history (newest 120 kept). */
const HISTORY = 120;
function archiveMessages(beforeDay: number) {
  S.messages = S.messages
    .filter((m) => (m.day ?? 0) < beforeDay)
    .slice(-HISTORY)
    .map((m) => ({
      ...m,
      id: m.id.startsWith('h') ? m.id : `h${m.day ?? 0}-${m.id}`,
      read: true,
      chosen: m.choices && m.chosen === undefined ? -1 : m.chosen,
      expires: undefined,
    }));
}

export function setupDay(i: number) {
  S.dayIndex = i;
  archiveMessages(i);
  writeSave();
  const d = day();
  S.phase = 'memo';
  S.now = PREP_TIME;
  S.startMeters = { ...S.meters };
  S.events = d.events.map((e) => {
    const start = e.start ?? e.proposed ?? null;
    return { ...e, start, baseDuration: e.duration, status: start === null ? 'pending' : 'scheduled' };
  });
  S.events.push(...S.incoming.map((e) => ({ ...e })));
  S.events.push(...(S.future[i] ?? []).map((e) => ({ ...e, status: 'scheduled' as const, fresh: false })));
  delete S.future[i];
  if (hasApp('trellis') && !d.weekend) {
    const fresh = ticketsFor(i, S.seed, d.execs.filter((x) => x !== 'team' && !S.flags.includes(`gone-${x}`)), S.tickets.map((t) => t.title), S.tickets.some((t) => t.day < i) ? 2 : 3)
      .filter((t) => !S.tickets.some((o) => o.id === t.id))
      .map((t) => (!S.endless && i < DAYS.length ? { ...t, dueDay: Math.min(t.dueDay, DAYS.length - 1) } : t));
    S.tickets.push(...fresh);
  }
  S.carry = [];
  S.tasks = [];
  S.orders = [];
  S.log = [];
  S.call = null;
  S.queue = [...d.script, ...generateAdhoc(i, { ...d, execs: d.execs.filter((x) => !S.flags.includes(`gone-${x}`)) }, S.seed + i * 7919, hasApp, S.meters.morale)].map((s) => ({ ...s })).sort((a, b) => a.at - b.at);
  bookings.length = 0;
  S.selected = null;
  S.openMail = null;
  S.sheet = null;
  S.review = null;
  S.overReason = null;
  S.banners = [];
  S.toasts = [];
  S.paused = false;
  addMessage({ app: hasApp('mail') ? 'mail' : 'huddle', ...d.memo }, true);
  S.app = 'calendar';
  dirty();
}

export function startPrep() {
  if (day().weekend) return startDay();
  S.phase = 'prep';
  dirty();
}

export function startDay() {
  S.phase = 'day';
  S.now = DAY_START;
  S.selected = null;
  for (const e of S.events) if (e.status === 'scheduled' && e.start === DAY_START) startEvent(e);
  startClock();
  dirty();
}

// ───────────────────────────── clock ─────────────────────────────

const MS_PER_MIN = 333; // 9am–6pm in ~3 real minutes (weekends run twice as fast)
let acc = 0;
let last = 0;
let running = false;

function startClock() {
  if (running) return;
  running = true;
  last = performance.now();
  acc = 0;
  const id = setInterval(() => {
    if (!loop(performance.now())) clearInterval(id);
  }, 50);
}

function loop(ts: number): boolean {
  if (S.phase !== 'day') {
    running = false;
    return false;
  }
  const dt = Math.min(ts - last, 1000);
  last = ts;
  if (!S.paused) {
    acc += dt * S.speed;
    const perMin = (day().weekend ? MS_PER_MIN / 2 : MS_PER_MIN) / stressPace();
    while (acc >= perMin && S.phase === 'day') {
      acc -= perMin;
      advance();
    }
  }
  return true;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.phase === 'day') {
    S.paused = true;
    dirty();
  }
});

export function togglePause() {
  S.paused = !S.paused;
  dirty();
}

export function toggleSpeed() {
  S.speed = S.speed === 1 ? 2 : 1;
  dirty();
}

function advance() {
  S.now++;
  const now = S.now;

  // scripts
  while (S.queue.length && S.queue[0].at <= now) fire(S.queue.shift()!);

  // deliveries
  for (const o of S.orders) if (!o.arrived && o.arriveAt <= now) deliver(o);

  // events: ends first so back-to-back meetings are fine
  for (const e of S.events) {
    if (e.status === 'running' && end(e) <= now) finishEvent(e);
  }
  for (const e of S.events) {
    if (e.status === 'scheduled' && e.start !== null && !e.departed && travelOf(e) && occStart(e) <= now && e.start > now) depart(e);
  }
  for (const e of S.events) {
    if (e.withRide && e.remote && e.travel && e.start !== null && ['scheduled', 'running'].includes(e.status) && now >= e.start - e.travel) {
      e.withRide = false;
      charge(`Ryde · no-show fee (${e.title})`, RIDE_COST);
      applyEffects({ stress: 4 }, `A Ryde driver waited outside for ${e.title}. It was remote. You were charged anyway.`);
      banner('ryde', '🚕 Driver waiting…', `Nobody came out. ${e.title} is remote. $${RIDE_COST} no-show fee.`);
    }
  }
  for (const e of [...S.events].sort((a, b) => Number(!!b.force) - Number(!!a.force))) {
    if (e.status === 'scheduled' && e.start !== null && e.start <= now) startEvent(e);
  }

  // requests that never got booked
  for (const e of S.events) {
    if (e.status === 'pending' && e.deadline !== undefined && now >= e.deadline) {
      e.status = 'missed';
      applyEffects(lifeOnly(e, e.missPenalty ?? { standing: -5 }), `Never booked: ${e.title}`);
      banner('calendar', '⏰ Deadline passed', `${e.title} never got booked.`);
      if (S.selected === e.id) S.selected = null;
    }
  }

  // calls
  if (S.call && S.call.status === 'ringing' && now >= S.call.ringUntil) {
    const c = S.call;
    S.call = null;
    applyEffects(c.missed, c.missedLog ?? `Missed a call from ${c.from}.`);
    addMessage({ app: 'messages', from: `Voicemail · ${c.from}`, body: c.lines.join(' ') });
  }

  // messages that expired
  for (const m of S.messages) {
    if (m.choices && m.chosen === undefined && m.expires !== undefined && now >= m.expires) {
      m.chosen = -1;
      applyEffects(m.timeoutEffects ?? { stress: 3 }, m.timeoutLog ?? `Ignored ${m.from}.`);
    }
  }

  // tasks
  for (const task of S.tasks) {
    if (task.status === 'open' && now >= task.deadline) {
      task.status = 'failed';
      applyEffects(task.fail, `Failed: ${task.text}`);
      banner('notes', '❌ Task failed', task.text);
    }
  }

  // stress from the unread pile
  const unread = S.messages.filter((m) => !m.read).length + S.messages.filter((m) => m.choices && m.chosen === undefined).length;
  if (unread) S.meters.stress = Math.min(100, S.meters.stress + unread * 0.008);
  if (day().weekend) S.meters.stress = Math.max(0, S.meters.stress - 0.03);

  if (checkGameOver()) return;
  if (now >= DAY_END) endDay();
  dirty();
}

function condOk(c?: Script['when']) {
  if (!c) return true;
  if (c.if && !c.if.every((f) => S.flags.includes(f))) return false;
  if (c.unless && c.unless.some((f) => S.flags.includes(f))) return false;
  if (c.meter) {
    const v = S.meters[c.meter.m];
    if (c.meter.min !== undefined && v < c.meter.min) return false;
    if (c.meter.max !== undefined && v > c.meter.max) return false;
  }
  return true;
}

function fire(s: Script) {
  if (!condOk(s.when)) return;
  switch (s.type) {
    case 'msg':
      addMessage(s.msg);
      break;
    case 'request': {
      S.events.push({ ...s.event, baseDuration: s.event.duration, status: 'pending', fresh: true });
      if (s.event.dueDay !== undefined && !S.endless && S.dayIndex < DAYS.length) S.events[S.events.length - 1].dueDay = Math.min(s.event.dueDay, DAYS.length - 1);
      if (s.msg) addMessage(s.msg);
      banner('calendar', '📥 New request', s.event.title);
      if (s.event.travel) offerShortcut({ kind: 'ride' });
      break;
    }
    case 'insert': {
      const ev: CalEvent = { ...s.event, baseDuration: s.event.duration, status: 'scheduled', fresh: true };
      S.events.push(ev);
      if (s.msg) addMessage(s.msg);
      else banner('calendar', '📅 Calendar changed', ev.title);
      if (ev.travel) offerShortcut({ kind: 'ride', eventId: ev.id });
      break;
    }
    case 'move': {
      const ev = findEvent(s.id);
      if (ev && ev.status === 'scheduled') {
        ev.start = s.start;
        if (s.duration) ev.duration = s.duration;
      }
      if (s.msg) addMessage(s.msg);
      break;
    }
    case 'kendall':
      kendallAct(s.mode);
      break;
    case 'nudge': {
      const ev = findEvent(s.id);
      if (ev && ev.status === 'scheduled' && ev.start !== null && !ev.departed) {
        ev.start = Math.max(DAY_START, Math.min(DAY_END - ev.duration, ev.start + s.by));
        ev.fresh = true;
        banner('calendar', '📅 Meeting moved', `${ev.title} → ${fmt(ev.start)}`);
        if (s.msg) addMessage(s.msg);
      }
      break;
    }
    case 'change': {
      const ev = findEvent(s.id);
      if (ev && (ev.status === 'scheduled' || ev.status === 'pending') && !ev.departed) {
        if (s.place !== undefined) ev.place = s.place;
        if (s.travel !== undefined) ev.travel = s.travel;
        if (s.remote !== undefined) {
          ev.remote = s.remote;
          if (s.remote && !ev.remoteOk) ev.remoteOk = 'fine';
        }
        if (s.mustBeInPerson) {
          ev.remote = false;
          ev.remoteOk = undefined;
        }
        ev.fresh = true;
        if (!atOffice(ev)) { ev.withCoffee = false; ev.withCatering = false; }
        const what = s.remote ? 'now remote 💻' : s.remote === false || s.mustBeInPerson ? `now in person 🚗 (${ev.travel}m each way)` : `moved to ${ev.place}`;
        banner('calendar', '📍 Meeting changed', `${ev.title}: ${what}`);
        if (ev.travel) offerShortcut({ kind: 'ride', eventId: ev.id });
      }
      if (s.msg) addMessage(s.msg);
      break;
    }
    case 'task':
      S.tasks.push({ ...s.task, status: 'open' });
      if (s.msg) addMessage(s.msg);
      else banner('notes', '📝 New task', s.task.text);
      if (s.task.kind === 'coffee' && s.task.exec) offerShortcut({ kind: 'coffee', exec: s.task.exec, taskId: s.task.id });
      if (s.task.kind === 'gift') offerShortcut({ kind: 'gift', taskId: s.task.id });
      break;
    case 'call':
      if (S.call) {
        S.queue.push({ ...s, at: S.now + 5 });
        S.queue.sort((a, b) => a.at - b.at);
      } else {
        S.call = { ...s.call, status: 'ringing', ringUntil: S.now + (day().weekend ? 20 : 10) };
      }
      break;
    case 'reveal':
      if (!S.flags.includes(s.flag)) S.flags.push(s.flag);
      break;
    case 'effects':
      applyEffects(s.effects, s.log);
      if (s.msg) addMessage(s.msg);
      break;
  }
}

// ───────────────────────────── events ─────────────────────────────

const execNames = (ids: ExecId[]) => ids.map((i) => EXECS[i].short).join(' & ');

function startEvent(e: CalEvent) {
  if (e.kind === 'focus' || e.kind === 'work') {
    e.status = 'running';
    return;
  }
  const now = S.now;
  for (const x of skippedFrom(e)) {
    const team = e.fixed || e.attendees.includes('team');
    applyEffects(team ? { morale: -2 } : { standing: -2 }, team ? `${EXECS[x].short} skipped ${e.title}. People noticed.` : `${EXECS[x].short} wasn't in ${e.title}. The others noticed.`);
  }
  if (!e.force && !e.departed) {
    const clash = S.events.find((o) => o !== e && shares(o, e) && occupying(o, now));
    if (clash) {
      const where = clash.status === 'running' ? `stuck in ${clash.title}` : `still travelling (${clash.title})`;
      missEvent(e, `Missed: ${e.title}. ${execNames(clash.attendees.filter((a) => e.attendees.includes(a)))} ${where}.`);
      return;
    }
  }
  e.status = 'running';
  chargeAddons(e);
  if (e.catering === 'wanted' && atOffice(e) && !e.withCatering) applyEffects({ standing: -4 }, `No catering at ${e.title}. Awkward.`);
  if (e.withRide && travelOf(e) && !e.prep && !rideStale(e)) applyEffects({ standing: 1 }, `${execNames(e.attendees)} read the brief in the Ryde. Walked into ${e.title} ready.`);
  if (e.catering && e.withCatering) applyEffects(e.catering === 'wanted' ? { standing: 3 } : { morale: 3 }, `Catering at ${e.title} was a hit.`);
  if (e.withCoffee && !e.coffee) applyEffects({ morale: 1 }, `Coffee at ${e.title}. Nice touch.`, true);
  if (S.selected === e.id) S.selected = null;

  for (const id of day().rules) {
    const r = RULES[id];
    if (ruled(e) && r.check(e)) applyEffects(r.penalty, `Broke a rule (${r.short}): ${e.title}`);
  }
  if (e.window && e.start !== null && (e.start < e.window[0] || e.start > e.window[1])) {
    applyEffects({ standing: -4 }, `Wrong time for ${e.title}`);
  }
  if (e.prep) {
    const busy = S.events.some(
      (o) => o !== e && blocks(o) && shares(o, e) && ['running', 'done'].includes(o.status) && o.start !== null && overlaps(occStart(o), occEnd(o), prepBy(e) - e.prep!, prepBy(e)),
    );
    if (busy) {
      applyEffects({ standing: -6 }, `Walked into ${e.title} unprepared.`);
      banner('calendar', '📋 No prep time', `${execNames(e.attendees)} walked into ${e.title} cold.`);
    }
  }
  if (e.coffee && e.withCoffee) {
    const who = e.attendees[0];
    if (S.flags.includes(`drink-${who}`)) applyEffects({ standing: 2 }, `Perfect coffee waiting at ${e.title}.`);
    else applyEffects({ standing: -4 }, `${EXECS[who].short} got the house latte at ${e.title}. You should learn their order.`);
  } else if (e.coffee) {
    const who = e.attendees[0];
    const got = S.orders.filter((o) => o.app === 'brew' && o.to === who && o.arrived && o.arriveAt >= now - 90).pop();
    if (!got) applyEffects({ standing: -3 }, `No coffee before ${e.title}.`);
    else {
      const m = drinkMatch(got.item, EXECS[who].drink);
      if (m === 'perfect') applyEffects({ standing: 2 }, `Perfect coffee before ${e.title}.`);
      else if (m === 'close') applyEffects({}, `Close-enough coffee before ${e.title}. ${EXECS[who].short} noticed.`);
      else applyEffects({ standing: -4 }, `Wrong coffee before ${e.title}. ${EXECS[who].short} stares at it.`);
    }
  }
  e.planned = e.duration;
  if (lowMorale() && e.kind !== 'personal' && !e.fixed && e.attendees.some((a) => a !== 'me')) {
    e.overrun = (e.overrun ?? 0) + 10;
  }
  if (e.overrun) {
    e.duration = Math.max(10, e.duration + e.overrun);
    e.overranBy = e.overrun;
    if (e.overrun > 0) banner('calendar', '⏳ Running long', `${e.title} will run ${e.overrun} min over.`);
    else banner('calendar', '🎉 Wrapping early', `${e.title} will finish ${-e.overrun} min early.`);
  }
}

function finishEvent(e: CalEvent) {
  e.status = 'done';
  if (e.kind === 'work') return finishWork(e);
  if (e.kind === 'focus') {
    // Did anything actually cut into the block?
    const broke = S.events.some((o) => o !== e && blocks(o) && shares(o, e) && (o.status === 'done' || o.status === 'running') && o.start !== null && overlaps(o.start, end(o), e.start!, end(e)));
    if (!broke) applyEffects({ standing: 2, morale: 2 }, `${execNames(e.attendees)}'s ${e.title.replace(/ 🔒$/, '').toLowerCase()} went uninterrupted. Something shipped.`);
    return;
  }
  const booked = e.planned ?? e.duration;
  const ok = e.minOk ?? e.baseDuration ?? booked;
  const remoteMeh = e.remote && e.remoteOk === 'meh';
  if (booked >= ok) {
    if (!e.reward) return;
    if (remoteMeh) {
      const half: Effects = Object.fromEntries(Object.entries(e.reward).map(([k, v]) => [k, (v as number) > 0 ? Math.round((v as number) / 2) : v]));
      applyEffects(half, `${e.title} went OK over video. Would've landed better in person.`);
    } else applyEffects(e.reward, `${e.title} went well${e.remote ? ' (remote)' : ''}.`);
    if (e.flagOnDone && !S.flags.includes(e.flagOnDone)) S.flags.push(e.flagOnDone);
    return;
  }
  // Cut short: some of the upside, a slice of the downside. Always better than missing it.
  const r = Math.min(1, (ok - booked) / ok);
  const fx: Effects = {};
  for (const [k, v] of Object.entries(e.reward ?? {}) as [keyof Effects, number][]) if (v > 0) fx[k] = Math.round(v * (1 - r));
  for (const [k, v] of Object.entries(lifeOnly(e, e.missPenalty ?? { standing: -5 })) as [keyof Effects, number][]) {
    fx[k] = (fx[k] ?? 0) + Math.round(v * Math.min(0.5, r));
  }
  applyEffects(fx, `${e.title} got cut short (${booked} of ${ok} min).`);
}

// ───────────────────────────── resizing, wrapping up, bumping ─────────────────────────────

export const canResize = (e: CalEvent) => !e.departed && !e.fixed && e.kind !== 'focus' && (e.status === 'pending' || e.status === 'scheduled');
export const canWrap = (e: CalEvent) => !e.fixed && e.kind !== 'focus' && e.status === 'running';
export const canBump = (e: CalEvent) =>
  !e.departed && !e.fixed && !e.noBump && e.kind !== 'personal' && (e.status === 'pending' || e.status === 'scheduled') && (S.endless || S.dayIndex + 1 < DAYS.length);

export function resizeEvent(id: string, delta: number) {
  const e = findEvent(id);
  if (!e || !canResize(e)) return;
  const max = e.start !== null ? DAY_END - e.start : 180;
  e.duration = Math.max(15, Math.min(max, e.duration + delta));
  dirty();
}

/** The meeting you're in right now (anything running on your own calendar). While it runs, your calendar is locked. */
export const myMeeting = () => S.events.find((e) => e.status === 'running' && e.attendees.includes('me'));

/** Leave the meeting you're in. Shared meetings carry on without you; your own end early. */
export function stepOut() {
  const e = myMeeting();
  if (!e || e.start === null) return;
  if (e.attendees.length > 1) {
    e.attendees = e.attendees.filter((a) => a !== 'me');
    applyEffects({ standing: e.fixed ? -4 : -2 }, `Stepped out of ${e.title} early.`);
    banner('calendar', '🚪 Stepped out', `${e.title} carries on without you.`);
    dirty();
    return;
  }
  if (canWrap(e)) return wrapUpNow(e.id);
  e.duration = Math.max(5, S.now - e.start);
  finishEvent(e);
  dirty();
}

export function wrapUpNow(id: string) {
  const e = findEvent(id);
  if (!e || !canWrap(e) || e.start === null) return;
  const elapsed = Math.max(5, S.now - e.start);
  e.planned = Math.min(e.planned ?? elapsed, elapsed);
  e.duration = elapsed;
  S.selected = null;
  finishEvent(e);
  banner('calendar', '✂️ Wrapped up', `${e.title} ended at ${fmt(S.now)}.`);
}

export function bumpPenaltyFor(e: CalEvent): Effects {
  const base: Effects = e.bumpPenalty ?? Object.fromEntries(Object.entries(lifeOnly(e, e.declinePenalty ?? { standing: -3 })).map(([k, v]) => [k, Math.round((v as number) / 2)]));
  const mult = 1 + (e.bumps ?? 0); // pushing the same thing twice annoys people more
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v as number) * mult]));
}

export function bumpEvent(id: string) {
  const e = findEvent(id);
  if (!e || !canBump(e)) return;
  const fx = bumpPenaltyFor(e);
  e.status = 'bumped';
  S.selected = null;
  const bumps = (e.bumps ?? 0) + 1;
  S.carry.push({
    ...e,
    id: `${e.id}+`,
    start: null,
    proposed: undefined,
    deadline: undefined,
    window: undefined,
    duration: e.baseDuration ?? e.duration,
    status: 'pending',
    fresh: true,
    departed: false,
    bumps,
    note: `Pushed from yesterday${bumps > 1 ? ` (${bumps}×)` : ''}. ${(e.note ?? '').replace(/^Pushed from yesterday[^.]*\. /, '')}`.trim(),
  });
  if (Object.values(fx).some((v) => v)) applyEffects(fx, `Pushed to tomorrow: ${e.title}`);
  else {
    S.log.push({ at: S.now, text: `Pushed to tomorrow: ${e.title} (nobody minded)`, effects: {} });
    banner('calendar', '📆 Pushed to tomorrow', `${e.title}. Nobody minded.`);
  }
  dirty();
}

function missEvent(e: CalEvent, text: string) {
  const covered = `covered-${S.dayIndex}`;
  if (highMorale() && !e.strikeOnMiss && !e.attendees.includes('me') && !S.flags.includes(covered)) {
    S.flags.push(covered);
    e.status = 'done';
    if (S.selected === e.id) S.selected = null;
    const who = ['Wren', 'Priya', 'Ana', 'Sam'][S.dayIndex % 4];
    applyEffects(halveFx(e.reward ?? {}), `${who} covered "${e.title}" for you. (High morale pays.)`);
    banner('calendar', `🙌 ${who} covered it`, `${e.title}: handled. You owe ${who} a coffee.`);
    return;
  }
  e.status = 'missed';
  if (S.selected === e.id) S.selected = null;
  applyEffects({ ...(lifeOnly(e, e.missPenalty ?? { standing: -5 })), stress: ((e.missPenalty?.stress ?? 0) + 3) }, text);
  if (e.strikeOnMiss) addStrike(`You missed ${e.title}.`);
  if (canReschedule(e)) {
    const due = nextWorkday(S.dayIndex + 1);
    S.events.push({
      ...e,
      id: `${e.id}~`,
      start: null, proposed: undefined, deadline: undefined, window: undefined,
      duration: e.baseDuration ?? e.duration, overranBy: undefined, planned: undefined,
      status: 'pending', fresh: true, departed: false, withRide: false, rideTo: undefined, editedBy: undefined,
      strikeOnMiss: false, rescheduled: true, dueDay: due,
      reward: halveFx(e.reward ?? {}),
      note: `Missed on ${dayDate(S.dayIndex)}. Needs a new time by ${dayDate(due)}.`,
    });
    banner('calendar', '💥 Missed: back in requests', `${e.title} needs rebooking by ${dayDate(due)}.`);
  } else banner('calendar', '💥 Missed meeting', text);
}

/** Real meetings with other people get rebooked once. Lunches, focus time, personal stuff and solo blocks just vanish. */
function canReschedule(e: CalEvent) {
  if (e.kind === 'work' || e.rescheduled || e.fixed || e.force || e.kind === 'focus' || e.kind === 'personal') return false;
  if (e.attendees.length === 1 && e.attendees[0] === 'me') return false;
  if (e.attendees.includes('team')) return false;
  return !/lunch|focus|gym|haircut|break|standup|dentist/i.test(e.title);
}

// ───────────────────────────── other days ─────────────────────────────

/** Day 0 is Wednesday 4 March 2026. 0 = Sunday … 6 = Saturday. */
export const dowOf = (i: number) => (3 + i) % 7;
export const isWeekendDay = (i: number) => dowOf(i) === 0 || dowOf(i) === 6;
export const dayDate = (i: number) => new Date(2026, 2, 4 + i).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export function nextWorkday(i: number) {
  while (isWeekendDay(i)) i++;
  return i;
}
/** Furthest day you can see/book ahead. */
export const lastViewDay = () => (S.endless || S.dayIndex >= DAYS.length ? S.dayIndex + 7 : Math.min(S.dayIndex + 7, DAYS.length - 1));

export function findFuture(id: string | null): { e: CalEvent; day: number } | null {
  if (!id) return null;
  for (const [k, list] of Object.entries(S.future)) {
    const e = list.find((x) => x.id === id);
    if (e) return { e, day: +k };
  }
  return null;
}

/** Take a booked-ahead meeting off its day and put it back in today's requests. */
export function unbookFuture(id: string) {
  const f = findFuture(id);
  if (!f) return;
  S.future[f.day] = S.future[f.day].filter((x) => x !== f.e);
  S.events.push({ ...f.e, start: null, status: 'pending', fresh: false });
  S.selected = null;
  dirty();
}

/** Book (or move) a meeting onto a later day. Returns false if it can't go there. */
function placeAhead(id: string, start: number, onDay: number, keepSelected: boolean) {
  const today = findEvent(id);
  const ahead = today ? null : findFuture(id);
  const e = today ?? ahead?.e;
  if (!e || e.fixed || e.departed || (e.status !== 'pending' && e.status !== 'scheduled')) return;
  if (e.dueDay === undefined) {
    banner('calendar', '📅 Needs to be today', `${e.title} can't wait. Book it today, or 📆 push it.`);
    return;
  }
  if (onDay > e.dueDay) {
    banner('calendar', '⏰ Too late', `${e.title} is due by ${dayDate(e.dueDay)}.`);
    return;
  }
  if (isWeekendDay(onDay) && e.kind !== 'personal') {
    banner('calendar', '🌴 That\'s the weekend', 'Bev has a policy. Pick a weekday.');
    return;
  }
  let s = Math.round(start / 15) * 15;
  s = Math.max(DAY_START, Math.min(DAY_END - e.duration, s));
  if (today) S.events = S.events.filter((x) => x !== e);
  else if (ahead) S.future[ahead.day] = S.future[ahead.day].filter((x) => x !== e);
  (S.future[onDay] ??= []).push({ ...e, start: s, status: 'scheduled', fresh: false, deadline: undefined, window: undefined });
  if (!keepSelected) S.selected = null;
  banner('calendar', '📆 Booked ahead', `${e.title}: ${dayDate(onDay)}, ${fmt(s)}.`);
  dirty();
}

export function minStart(): number {
  if (S.phase === 'day') return Math.ceil((S.now + 1) / 15) * 15;
  return DAY_START;
}

export function placeEvent(id: string, start: number, keepSelected = false, onDay = S.dayIndex) {
  if (onDay > S.dayIndex) return placeAhead(id, start, onDay, keepSelected);
  if (onDay < S.dayIndex) return;
  const back = findFuture(id);
  if (back) {
    // Pulled back from a later day onto today.
    S.future[back.day] = S.future[back.day].filter((x) => x !== back.e);
    S.events.push(back.e);
  }
  const e = findEvent(id);
  if (!e || e.fixed || e.departed) return;
  if (e.status !== 'pending' && e.status !== 'scheduled') return;
  const lo = minStart();
  const hi = DAY_END - e.duration;
  if (lo > hi) {
    banner('calendar', '🙅 Too late', 'There is no time left today for that.');
    return;
  }
  let s = Math.round(start / 15) * 15;
  s = Math.max(lo, Math.min(hi, s));
  e.start = s;
  e.status = 'scheduled';
  e.fresh = false;
  if (!keepSelected) S.selected = null;
  dirty();
}

/** Move a meeting by ±15 min steps (books it at the best slot first if it's unbooked). */
export function nudgeStart(id: string, delta: number) {
  const e = findEvent(id);
  if (!e || e.fixed) return;
  if (e.status === 'pending') return autoPlace(id);
  if (e.status !== 'scheduled' || e.start === null) return;
  placeEvent(id, e.start + delta, true);
}

/** The earliest start with the fewest problems (clashes, rule breaks, wrong window, no prep). */
export function bestSlot(e: CalEvent): number | null {
  const lo = Math.max(minStart(), Math.ceil(DAY_START / 15) * 15);
  const hi = DAY_END - e.duration;
  if (lo > hi) return null;
  const saved = { start: e.start, status: e.status };
  let best: number | null = null;
  let bestScore = Infinity;
  for (let t = lo; t <= hi; t += 15) {
    e.start = t;
    e.status = 'scheduled';
    const bad = issuesFor(e).filter((i) => i.bad && i.icon !== '☕').length;
    // nudge ties toward the requested window, then earlier
    const score = bad * 1000 + (e.window && (t < e.window[0] || t > e.window[1]) ? 500 : 0) + (t - lo) / 15;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
    if (bad === 0 && (!e.window || (t >= e.window[0] && t <= e.window[1]))) break;
  }
  e.start = saved.start;
  e.status = saved.status;
  return best;
}

export function autoPlace(id: string): number | null {
  const e = findEvent(id);
  if (!e || e.fixed || (e.status !== 'pending' && e.status !== 'scheduled')) return null;
  const t = bestSlot(e);
  if (t === null) {
    banner('calendar', '🙅 No room', 'There is no time left today for that.');
    return null;
  }
  placeEvent(id, t, true);
  return t;
}

export function unschedule(id: string) {
  const e = findEvent(id);
  if (!e || e.fixed || e.departed || e.status !== 'scheduled') return;
  e.start = null;
  e.status = 'pending';
  S.selected = null;
  dirty();
}

export function declineEvent(id: string) {
  const e = findEvent(id);
  if (!e || e.fixed || (e.status !== 'pending' && e.status !== 'scheduled')) return;
  e.status = 'declined';
  S.selected = null;
  applyEffects(lifeOnly(e, e.declinePenalty ?? { standing: -3 }), `Declined: ${e.title}`);
}

export function select(id: string | null) {
  S.selected = S.selected === id ? null : id;
  dirty();
}

export interface Issue { icon: string; text: string; bad: boolean }

export function issuesFor(e: CalEvent): Issue[] {
  const out: Issue[] = [];
  if (e.editedBy && e.status === 'scheduled') out.push({ icon: '✏️', text: `Last edited by ${e.editedBy}`, bad: false });
  if (e.start === null) {
    if (e.window) out.push({ icon: '🕒', text: `Start ${fmt(e.window[0])}–${fmt(e.window[1])}`, bad: false });
    if (e.deadline) out.push({ icon: '⏰', text: `Book before ${fmt(e.deadline)}`, bad: false });
    if (e.prep) out.push({ icon: '📋', text: `${e.prep}m prep before`, bad: false });
    if (e.coffee) out.push({ icon: '☕', text: 'Coffee first', bad: false });
    if (e.bumps) out.push({ icon: '📆', text: `Pushed ${e.bumps}×`, bad: false });
    if (e.travel) out.push({ icon: '🚗', text: `${e.travel}m travel`, bad: false });
    if (e.catering === 'wanted') out.push({ icon: '🍱', text: 'Catering', bad: false });
    if (e.minOk && e.minOk < (e.baseDuration ?? e.duration)) out.push({ icon: '✂️', text: `Can be ${e.minOk}m`, bad: false });
    for (const id of day().rules) if (RULES[id].id === 'max60' && ruled(e) && RULES[id].check(e)) out.push({ icon: '⚠️', text: RULES[id].short, bad: true });
    if (e.kind === 'work') out.push({ icon: '🎫', text: 'Not a meeting: rules don\'t apply', bad: false });
    return out;
  }
  if (e.status !== 'scheduled') return out;
  const s = e.start;
  const ok = e.minOk ?? e.baseDuration ?? e.duration;
  if (e.duration < ok) out.push({ icon: '✂️', text: `Too short (needs ${ok}m)`, bad: true });
  if (blocks(e)) {
    const clash = S.events.find((o) => o !== e && active(o) && blocks(o) && shares(o, e) && o.start !== null && overlaps(occStart(e), occEnd(e), occStart(o), occEnd(o)));
    if (clash) {
      const tight = !overlaps(s, end(e), clash.start!, end(clash));
      out.push({ icon: tight ? '🚗' : '⛔', text: tight ? `No travel time around ${clash.title}` : `Clashes with ${clash.title}`, bad: true });
    } else {
      // Not a hard clash, but it eats into a buffer (its own, or the other meeting's).
      const inBuf = S.events.find((o) => o !== e && active(o) && blocks(o) && shares(o, e) && o.start !== null && overlaps(padStart(e), padEnd(e), padStart(o), padEnd(o)));
      if (inBuf) out.push({ icon: '🧘', text: overlaps(padStart(e), padEnd(e), inBuf.start!, end(inBuf)) ? `${inBuf.title} is in its buffer` : `In ${inBuf.title}'s buffer`, bad: true });
    }
  }
  for (const id of day().rules) if (ruled(e) && RULES[id].check(e)) out.push({ icon: '⚠️', text: RULES[id].short, bad: true });
  if (e.kind === 'work') {
    const hit = S.events.find((o) => o !== e && active(o) && blocks(o) && shares(o, e) && o.start !== null && overlaps(s, end(e), occStart(o), occEnd(o)));
    out.push(hit ? { icon: '⚡', text: `${hit.title} will interrupt it`, bad: true } : { icon: '🎧', text: 'Heads-down time', bad: false });
  }
  if (e.window && (s < e.window[0] || s > e.window[1])) out.push({ icon: '🕒', text: `Should start ${fmt(e.window[0])}–${fmt(e.window[1])}`, bad: true });
  if (e.prep) {
    const busy = S.events.some((o) => o !== e && blocks(o) && shares(o, e) && (active(o) || o.status === 'done') && o.start !== null && overlaps(occStart(o), occEnd(o), prepBy(e) - e.prep!, prepBy(e)));
    if (busy) out.push({ icon: '📋', text: travelOf(e) && !e.withRide ? `No ${e.prep}m prep before they drive (a Ryde would help)` : `No ${e.prep}m prep gap`, bad: true });
  }
  if (e.coffee) {
    const who = e.attendees[0];
    const ordered = e.withCoffee || S.orders.some((o) => o.app === 'brew' && o.to === who && o.arriveAt <= s && o.arriveAt >= s - 90);
    out.push({ icon: '☕', text: ordered ? 'Coffee sorted' : 'Needs coffee', bad: !ordered });
  }
  if (e.catering === 'wanted' && atOffice(e)) out.push({ icon: '🍱', text: e.withCatering ? 'Catered' : 'Wants catering', bad: !e.withCatering });
  if (travelOf(e) && hasApp('ryde')) {
    if (rideStale(e)) out.push({ icon: '🚕', text: `Ride is going to ${e.rideTo}, not ${e.place}`, bad: true });
  }
  if (rideUnneeded(e)) out.push({ icon: '🚕', text: "Ride still booked, but it's remote now", bad: true });
  if (e.remote) out.push({ icon: '💻', text: e.remoteOk === 'meh' ? 'Remote (half the upside)' : 'Remote', bad: false });
  return out;
}

// ───────────────────────────── messages ─────────────────────────────

const APP_OF: Record<string, AppId> = { mail: 'mail', huddle: 'huddle', messages: 'messages' };

export function addMessage(def: MsgDef, quiet = false): Message {
  if (!hasApp(def.app)) def = { ...def, app: 'huddle' }; // apps you don't have yet fall back to chat
  const m: Message = { ...def, id: `m${uid()}`, at: S.now, read: false, day: S.dayIndex };
  if (def.choices && def.expiresIn) m.expires = S.now + Math.round(def.expiresIn * (S.meters.stress >= 80 ? 0.7 : 1));
  S.messages.push(m);
  if (!quiet && S.app !== APP_OF[def.app]) {
    banner(APP_OF[def.app], def.from, def.subject ?? def.body);
  }
  dirty();
  return m;
}

export function choose(msgId: string, idx: number) {
  const m = S.messages.find((x) => x.id === msgId);
  if (!m || !m.choices || m.chosen !== undefined) return;
  m.chosen = idx;
  m.read = true;
  let outcome = idx;
  if (m.advice && idx !== m.advice.gut) {
    // Margo listens more when she trusts you.
    const p = Math.max(0.15, Math.min(0.85, 0.25 + (S.meters.standing - 40) / 100));
    if (Math.random() > p) outcome = m.advice.gut;
  }
  m.outcome = outcome;
  const c = m.choices[outcome];
  if (c.flag && !S.flags.includes(c.flag)) S.flags.push(c.flag);
  if (m.advice) {
    const took = outcome === idx;
    if (took && idx !== m.advice.gut && !S.flags.includes('advice-taken')) S.flags.push('advice-taken');
    applyEffects(c.effects, took ? `Margo took your advice: ${c.label}` : `Margo ignored you and went with: ${c.label}`);
    const replies = took
      ? idx === m.advice.gut ? ['RIGHT?? great minds 🧠', 'knew you\'d get it 🙌'] : ['ok. you\'re right. doing it 🫡', 'fine. FINE. good call 😤']
      : ['hmm. love that. going with my gut though 💅', 'noted!! doing the other thing 🙃', 'you make a good point. ignoring it ✨'];
    addMessage({ app: m.app, from: 'Margo', body: replies[Math.floor(Math.random() * replies.length)] }, true);
  } else applyEffects(c.effects, c.log ?? `${m.from}: "${c.label}"`);
  queueThen(c.then);
}

// ───────────────────────────── Kendall, the backup EA ─────────────────────────────
const KENDALL = 'Kendall (backup EA)';
const rand = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** The automatic email you get when someone else edits a calendar you manage. */
function calNotice(e: CalEvent, change: string, was?: string) {
  if (!hasApp('mail')) return;
  addMessage({
    app: 'mail', from: 'Sproutly Calendar', subject: `Updated: ${e.title}`,
    body: `${KENDALL} made a change to ${execNames(e.attendees)}'s calendar.\n\n${change}${was ? `\nWas: ${was}` : ''}\n\nYou're receiving this because you manage this calendar.`,
  });
}
const span = (e: CalEvent) => (e.start === null ? 'unbooked' : `${fmt(e.start)}–${fmt(e.start + e.duration)}`);

const SNIPES = [
  (w: string, t: string) => `fixed a little something on ${w}'s calendar ("${t}") 🙂 happens to the best of us!`,
  (w: string, t: string) => `per my last calendar edit… ${w}'s "${t}" is sorted. no need to check it 😊`,
  (w: string, t: string) => `just tidied ${w}'s afternoon ✨ "${t}" was bothering me. not judging!!`,
  (w: string, t: string) => `don't worry about "${t}", I handled it. like last time 🙃`,
  (w: string, t: string) => `quick heads up: I made a small change to "${t}" for ${w}. you looked swamped (again) 💕`,
];
const HELP_SNIPES = [
  (t: string) => `booked "${t}" for you! it was just sitting there 😊`,
  (t: string) => `took care of "${t}" 🙂 no need to thank me (but you can)`,
  (t: string) => `"${t}" was unbooked so I just… did it. hope that's ok!! 🌸`,
];

function kendallAct(mode: 'help' | 'sabotage') {
  const now = S.now;
  const touchable = (e: CalEvent) => e.status === 'scheduled' && e.start !== null && e.start > now + 30 && !e.fixed && !e.departed && e.kind !== 'focus' && !e.attendees.includes('me');
  const say = (body: string) => addMessage({ app: 'huddle', from: KENDALL, body });

  if (mode === 'help') {
    const pend = S.events.find((e) => e.status === 'pending' && !e.fixed && !e.attendees.includes('me'));
    if (pend) {
      const wasSel = S.selected;
      const t = bestSlot(pend);
      if (t !== null) {
        placeEvent(pend.id, t, true);
        S.selected = wasSel === pend.id ? null : wasSel;
        pend.editedBy = 'Kendall';
        S.kendall.helped++;
        calNotice(pend, `Booked: ${pend.title}, ${fmt(t)}–${fmt(t + pend.duration)}`);
        return say(`${rand(HELP_SNIPES)(pend.title)} (${fmt(t)})`);
      }
    }
    if (hasApp('ryde')) {
      const r = S.events.find((e) => touchable(e) && travelOf(e) > 0 && !e.withRide);
      if (r) {
        toggleAddon(r.id, 'ride');
        r.editedBy = 'Kendall';
        S.kendall.helped++;
        calNotice(r, `Ride added for ${r.title} (to ${r.place}).`);
        return say(`saw ${execNames(r.attendees)} had no car for "${r.title}" so I booked a Ryde 🚕`);
      }
    }
    const task = S.tasks.find((x) => x.status === 'open' && x.kind === 'coffee' && x.exec);
    if (task) {
      orderDrink(EXECS[task.exec!].drink, task.exec!, null);
      S.kendall.helped++;
      return say(`sent ${EXECS[task.exec!].short} their usual ☕ you looked busy!`);
    }
    return say('anything I can take off your plate? 🙂 genuinely here to help');
  }

  // Sabotage: quietly make you look bad.
  const pool = S.events.filter(touchable);
  if (!pool.length) return;
  const e = rand(pool);
  const was = span(e);
  const others = S.events.filter((o) => o !== e && o.status === 'scheduled' && o.start !== null && o.start > now + 15 && o.attendees.some((a) => e.attendees.includes(a)));
  const options: (() => string | null)[] = [
    () => {
      const o = others.length ? rand(others) : null;
      if (!o) return null;
      e.start = o.start;
      calNotice(e, `Moved: ${e.title}, now ${span(e)}`, was);
      return `moved "${e.title}"`;
    },
    () => {
      if (!e.withRide) return null;
      e.withRide = false;
      e.rideTo = undefined;
      calNotice(e, `Ride removed for ${e.title}.`);
      return `cancelled the ride for "${e.title}"`;
    },
    () => {
      const min = e.minOk ?? e.duration;
      if (e.duration <= 15) return null;
      e.duration = Math.max(15, min - 15);
      calNotice(e, `Shortened: ${e.title}, now ${span(e)}`, was);
      return `trimmed "${e.title}"`;
    },
  ];
  for (const f of options.sort(() => Math.random() - 0.5)) {
    const what = f();
    if (!what) continue;
    e.editedBy = 'Kendall';
    e.fresh = true;
    S.kendall.sabotaged++;
    if (!S.flags.includes('kendall-sabotaged')) S.flags.push('kendall-sabotaged');
    if (Math.random() < 0.6) say(rand(SNIPES)(execNames(e.attendees), e.title));
    if (Math.random() < 0.5) {
      S.queue.push({
        at: now + 12, type: 'msg',
        msg: {
          app: 'huddle', from: 'Wren', body: `psst. saw Kendall in ${execNames(e.attendees)}'s calendar just now. "${e.title}" looks… different 👀`, expiresIn: 40,
          timeoutEffects: {}, timeoutLog: 'Ignored the Kendall tip.',
          choices: [
            { label: 'Tell Bev', effects: { standing: 2, stress: 2 }, flag: 'kendall-reported', log: 'Reported Kendall to Bev. Bev opened her folder.' },
            { label: 'Confront Kendall', effects: { stress: 4 }, flag: 'kendall-confronted', log: 'Kendall: "omg I was just trying to help?? 🥺"' },
            { label: 'Let it go', effects: { stress: 2 } },
          ],
        },
      });
      S.queue.sort((a, b) => a.at - b.at);
    }
    return;
  }
}

function queueThen(then?: Script[]) {
  if (!then) return;
  for (const s of then) S.queue.push({ ...s, at: s.after !== undefined ? S.now + s.after : Math.max(s.at, S.now + 1) });
  S.queue.sort((a, b) => a.at - b.at);
}

export function answerCall() {
  if (S.call) S.call.status = 'active';
  dirty();
}

export function declineCall() {
  const c = S.call;
  if (!c) return;
  S.call = null;
  applyEffects(c.missed, c.missedLog ?? `Declined a call from ${c.from}.`);
}

export function chooseCall(idx: number) {
  const c = S.call;
  if (!c) return;
  S.call = null;
  const ch = c.choices[idx];
  if (ch.flag && !S.flags.includes(ch.flag)) S.flags.push(ch.flag);
  applyEffects(ch.effects, ch.log ?? `Call with ${c.from}: "${ch.label}"`);
  queueThen(ch.then);
}

// ───────────────────────────── travel + add-ons ─────────────────────────────

function depart(e: CalEvent) {
  const now = S.now;
  const clash = S.events.find((o) => o !== e && shares(o, e) && occupying(o, now));
  if (clash && !e.force) {
    missEvent(e, `Missed: ${e.title}. ${execNames(e.attendees)} couldn't leave ${clash.title} in time to travel.`);
    return;
  }
  e.departed = true;
  if (rideStale(e)) {
    applyEffects({ standing: -5, stress: 6 }, `The Ryde took ${execNames(e.attendees)} to ${e.rideTo}. The meeting was at ${e.place}. Arrived late and furious.`);
    banner('ryde', '🚕 Wrong address!', `${execNames(e.attendees)} got dropped at ${e.rideTo}.`);
  }
  banner('calendar', '🚗 Heading out', `${execNames(e.attendees)} leaving for ${e.title}${e.place ? ` at ${e.place}` : ''}.`);
}

/** A ride was booked, but the venue changed afterwards. */
export const rideStale = (e: CalEvent) => !!e.withRide && !e.remote && !!e.travel && e.rideTo !== e.place;
/** A ride is still booked for a meeting that went remote. */
export const rideUnneeded = (e: CalEvent) => !!e.withRide && !!e.remote;

export const addonCost = (e: CalEvent) => ({ coffee: COFFEE_ADDON * e.attendees.length, catering: CATERING_COST });

function chargeAddons(e: CalEvent) {
  const c = addonCost(e);
  if (e.withCoffee && atOffice(e)) {
    charge(`Brew · coffee for ${e.title}`, c.coffee);
  }
  if (e.withRide && travelOf(e)) {
    charge(`Ryde · ${e.title}`, RIDE_COST * 2);
  }
  if (e.withCatering && atOffice(e)) {
    charge(`Catering · ${e.title}`, c.catering);
  }
}

const editable = (e: CalEvent) => !e.fixed && e.kind !== 'focus' && e.kind !== 'personal' && (e.status === 'pending' || e.status === 'scheduled');
export const canAddons = (e: CalEvent) => editable(e) && e.kind !== 'work';

// ───────────────────────────── Trellis tickets ─────────────────────────────

/** The work block booked for a ticket, today or ahead. */
export function ticketBlock(id: string): { e: CalEvent; day: number } | null {
  const e = S.events.find((x) => x.ticket === id && (x.status === 'pending' || x.status === 'scheduled' || x.status === 'running'));
  if (e) return { e, day: S.dayIndex };
  for (const [k, list] of Object.entries(S.future)) {
    const f = list.find((x) => x.ticket === id);
    if (f) return { e: f, day: +k };
  }
  return null;
}

/** Turn a ticket into a work-block request in the calendar tray. */
export function scheduleTicket(id: string) {
  const t = S.tickets.find((x) => x.id === id);
  if (!t || t.status !== 'open') return;
  const have = ticketBlock(id);
  if (!have) {
    const dur = Math.max(30, Math.ceil(t.left / 15) * 15);
    S.events.push({
      id: `${t.id}-w${S.seq++}`, title: `🎫 ${t.title}`, attendees: [t.who], start: null, duration: dur, baseDuration: dur,
      kind: 'work', ticket: t.id, dueDay: t.dueDay, status: 'pending', fresh: true, noBump: true,
      reward: {}, missPenalty: {}, declinePenalty: {},
      note: `Heads-down time for ${EXECS[t.who].short}. Not a meeting, so meeting rules don't apply. Anything booked on top of it interrupts it. Due ${dayDate(t.dueDay)}.`,
    });
  }
  S.selected = have && have.day !== S.dayIndex ? null : (have?.e.id ?? S.events[S.events.length - 1].id);
  S.app = 'calendar';
  dirty();
}

/** A work block ended: only the uninterrupted minutes count (and every interruption costs 15 more to get back into it). */
function finishWork(e: CalEvent) {
  const t = S.tickets.find((x) => x.id === e.ticket);
  if (!t || t.status !== 'open' || e.start === null) return;
  const hits = S.events.filter((o) => o !== e && blocks(o) && shares(o, e) && (o.status === 'done' || o.status === 'running') && o.start !== null && overlaps(occStart(o), occEnd(o), e.start!, end(e)));
  let lost = 0;
  for (const o of hits) lost += Math.min(end(e), occEnd(o)) - Math.max(e.start, occStart(o)) + 15;
  const worked = Math.max(0, e.duration - lost);
  t.left = Math.max(0, t.left - worked);
  if (t.left === 0) {
    t.status = 'done';
    applyEffects(t.reward, `Done: ${t.title} (${EXECS[t.who].short})`);
    banner('trellis', '✅ Ticket done', `${EXECS[t.who].short}: ${t.title}`);
  } else {
    applyEffects(hits.length ? { stress: 2 } : {}, hits.length ? `${e.title} got interrupted. ${t.left}m still to go.` : `${e.title}: ${t.left}m still to go.`);
    banner('trellis', hits.length ? '⚡ Work interrupted' : '🎫 Not finished', `${t.title}: ${t.left}m left. Book more time.`);
  }
}

/** People you took off the invite. */
export const skippedFrom = (e: CalEvent): ExecId[] => (e.invited ?? []).filter((x) => !e.attendees.includes(x));
/** Who can be taken off (or put back): anyone but the company calendar, while it hasn't started. */
export const canEditAttendees = (e: CalEvent) =>
  (e.status === 'scheduled' || e.status === 'pending') && !e.departed && (e.invited ?? e.attendees).filter((x) => x !== 'team').length > 1;

export function toggleAttendee(id: string, x: ExecId) {
  const e = findEvent(id);
  if (!e || !canEditAttendees(e) || x === 'team') return;
  e.invited ??= [...e.attendees];
  if (e.attendees.includes(x)) {
    if (e.attendees.filter((a) => a !== 'team').length <= 1) return; // someone has to go
    e.attendees = e.attendees.filter((a) => a !== x);
  } else if (e.invited.includes(x)) {
    e.attendees = e.invited.filter((a) => a === x || e.attendees.includes(a));
  }
  dirty();
}

export function toggleAddon(id: string, which: 'coffee' | 'catering' | 'remote' | 'ride') {
  const e = findEvent(id);
  if (!e || !editable(e)) return;
  if (which === 'coffee' && atOffice(e)) e.withCoffee = !e.withCoffee;
  if (which === 'catering' && atOffice(e)) e.withCatering = !e.withCatering;
  if (which === 'remote' && e.remoteOk && !e.departed) {
    e.remote = !e.remote;
    if (!atOffice(e)) { e.withCoffee = false; e.withCatering = false; }
  }
  if (which === 'ride' && e.travel && hasApp('ryde')) {
    if (rideStale(e)) e.rideTo = e.place; // re-point it at the new address
    else {
      e.withRide = !e.withRide;
      e.rideTo = e.withRide ? e.place : undefined;
    }
  }
  dirty();
}

// ───────────────────────────── shopping ─────────────────────────────

const spend = (label: string, amount: number) => {
  S.ledger.unshift({ at: S.now, label, amount: -amount });
};

/** Company spend. Under 5 days of runway, Finance freezes the card and it comes out of your pocket (stress). */
function charge(label: string, amount: number) {
  if (cardFrozen()) {
    S.ledger.unshift({ at: S.now, label: `${label} (your card — company card frozen)`, amount: 0 });
    applyEffects({ stress: Math.max(1, Math.round(amount / 15)) }, `Company card frozen. Paid $${amount} yourself: ${label}.`, true);
    banner('card', '🧊 Card frozen', `Paid $${amount} yourself. Finance says "soon".`);
    return;
  }
  S.meters.runway -= amount;
  spend(label, amount);
}

export const earliestDelivery = () => (S.phase === 'day' ? S.now + 15 : DAY_START);

export function orderDrink(spec: string, to: string, deliverAt?: number | null) {
  const name = drinkName(spec);
  const price = drinkPrice(spec);
  const at = Math.max(earliestDelivery(), deliverAt ?? 0);
  S.orders.push({ id: `o${uid()}`, app: 'brew', item: spec, label: name, to, price, arriveAt: at, arrived: false, paidBy: to === 'me' ? 'me' : 'company' });
  if (to !== 'me') {
    charge(`Brew · ${name}`, price);
  }
  const who = to === 'me' ? 'you' : EXECS[to as ExecId].short;
  banner('brew', `${drinkEmoji(spec)} Order placed`, `${name} for ${who}. Arrives ${fmt(at)}.`);
}

export function toggleSavedDrink(spec: string) {
  S.savedDrinks = S.savedDrinks.includes(spec) ? S.savedDrinks.filter((x) => x !== spec) : [...S.savedDrinks, spec];
  dirty();
}

export function buyProduct(productId: string, to: string, pay: 'company' | 'me') {
  const p = PRODUCTS.find((x) => x.id === productId)!;
  const arrive = (S.phase === 'day' ? S.now : DAY_START) + 60;
  S.orders.push({ id: `o${uid()}`, app: 'bundl', item: p.id, label: p.name, to, price: p.price, arriveAt: arrive, arrived: false, paidBy: pay });
  S.sheet = null;

  if (pay === 'company') {
    charge(`Bundl · ${p.name}`, p.price);
  }

  const task = S.tasks.find((x) => x.status === 'open' && x.kind === 'gift' && x.recipient === to);
  if (task) {
    task.status = 'done';
    if (task.personal && pay === 'company' && !S.flags.includes('embezzle')) S.flags.push('embezzle');
    if (task.personal && pay === 'me') applyEffects({ stress: 3 }, 'Paid for the gift yourself. Rent is due.', true);
    const budget = task.budget ?? 50;
    if (p.tier === 'cheap') {
      applyEffects(task.personal ? { stress: 6 } : { standing: -4 }, task.personal ? `${to} got a branded mug. For their birthday.` : `${to} got a $${p.price} mug. Margo is mortified.`);
    } else if (p.price > budget * 1.6) {
      applyEffects(task.personal ? { stress: -15 } : { standing: -2 }, task.personal ? `${to} LOVED the gift.` : `Finance wants to know who approved a $${p.price} ${p.name.toLowerCase()}.`);
    } else {
      applyEffects(task.reward, `Gift sent: ${p.name} → ${to}`);
    }
  }
  banner('bundl', '📦 Order placed', `${p.name} → ${to === 'me' ? 'you' : to}`);
}

const halveFx = (e: Effects): Effects => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, Math.round((v as number) / 2)]));
const halve = (e: Effects): Effects => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, Math.round((v as number) / 2)]));

function deliver(o: (typeof S.orders)[number]) {
  o.arrived = true;
  if (o.app === 'brew') {
    if (o.to === 'me') {
      applyEffects({ stress: -5 }, 'Caffeine. Sweet, sweet caffeine.');
      return;
    }
    const exec = o.to as ExecId;
    banner('brew', '☕ Delivered', `${o.label} → ${EXECS[exec].short}`);
    const task = S.tasks.find((x) => x.status === 'open' && x.kind === 'coffee' && x.exec === exec);
    if (task) {
      const m = drinkMatch(o.item, EXECS[exec].drink);
      task.status = m === 'wrong' ? 'failed' : 'done';
      if (m === 'perfect') applyEffects(task.reward, `${EXECS[exec].short} got their coffee. Exactly right.`);
      else if (m === 'close') applyEffects(halve(task.reward), `${EXECS[exec].short} got a coffee that was… close. "${o.label}?"`);
      else applyEffects({ morale: -2, standing: -1 }, `${EXECS[exec].short} got the wrong coffee (${o.label}). They are holding it at arm's length.`);
    }
  }
}

export interface Booking { restaurant: string; time: number; party: number }
export const bookings: Booking[] = [];

export function slotTaken(restId: string, time: number) {
  const r = RESTAURANTS.find((x) => x.id === restId)!;
  return r.full.includes(time) || bookings.some((b) => b.restaurant === restId && b.time === time);
}

export function bookTable(restId: string, time: number, party: number) {
  const r = RESTAURANTS.find((x) => x.id === restId)!;
  if (slotTaken(restId, time)) return;
  bookings.push({ restaurant: restId, time, party });
  const task = S.tasks.find(
    (x) => x.status === 'open' && x.kind === 'reservation' && x.party === party && (!x.place || x.place === restId) && x.window && time >= x.window[0] && time <= x.window[1],
  );
  if (task) {
    task.status = 'done';
    applyEffects(task.reward, `Booked ${r.name} for ${party} at ${fmt(time)}.`);
    if (!task.personal && r.vibe) {
      if (r.deposit) spend(`Tably · ${r.name} deposit`, r.deposit);
      applyEffects(r.vibe, r.vibeLog ?? r.name);
    }
  } else {
    S.log.push({ at: S.now, text: `Booked ${r.name} for ${party} at ${fmt(time)} (nobody asked for that).`, effects: {} });
  }
  banner('tably', '🍽️ Table booked', `${r.name} · ${party} people · ${fmt(time)}`);
}

// ───────────────────────────── end of day ─────────────────────────────

function checkGameOver(): boolean {
  const m = S.meters;
  let reason: string | null = null;
  if (S.strikes >= 3) reason = 'strikes';
  else if (m.standing <= 0) reason = 'fired';
  else if (m.runway <= 0) reason = 'folded';
  else if (m.morale <= 0) reason = 'mutiny';
  else if (m.stress >= 100) reason = 'burnout';
  if (!reason) return false;
  S.overReason = reason;
  S.phase = 'over';
  S.call = null;
  dirty();
  return true;
}

export function endDay() {
  S.call = null;
  for (const t of S.tickets) {
    if (t.status !== 'open' || t.dueDay > S.dayIndex) continue;
    t.status = 'late';
    applyEffects(t.late, `Late: ${t.title} (${EXECS[t.who].short})`, true);
  }
  for (const e of S.events) {
    if (e.status !== 'pending') continue;
    if (e.dueDay !== undefined && e.dueDay > S.dayIndex) {
      // Not due yet: it waits in tomorrow's tray.
      S.carry.push({ ...e, fresh: false });
      e.status = 'bumped';
      continue;
    }
    e.status = 'missed';
    applyEffects(lifeOnly(e, e.missPenalty ?? { standing: -5 }), e.dueDay !== undefined ? `Missed the deadline: ${e.title}` : `Never booked: ${e.title}`, true);
  }
  // Keep a read-only copy of today's calendar (the last week of them).
  S.past[S.dayIndex] = S.events.filter((e) => e.start !== null && e.status !== 'declined' && e.status !== 'bumped' && e.status !== 'pending').map((e) => ({ ...e, fresh: false }));
  for (const k of Object.keys(S.past)) if (+k < S.dayIndex - 7) delete S.past[+k];
  for (const task of S.tasks) if (task.status === 'open') {
    task.status = 'failed';
    applyEffects(task.fail, `Failed: ${task.text}`, true);
  }
  for (const m of S.messages) if (m.choices && m.chosen === undefined) {
    m.chosen = -1;
    applyEffects(m.timeoutEffects ?? { stress: 3 }, m.timeoutLog ?? `Ignored ${m.from}.`, true);
  }

  const deltas = {
    standing: S.meters.standing - S.startMeters.standing,
    runway: S.meters.runway - S.startMeters.runway,
    morale: S.meters.morale - S.startMeters.morale,
    stress: S.meters.stress - S.startMeters.stress,
  };
  const notes: string[] = [];
  const newStrikes: string[] = [];

  for (const r of day().reckonings ?? []) {
    if (!S.flags.includes(r.flag) || (r.unless && S.flags.includes(r.unless))) continue;
    notes.push(r.text);
    applyEffects(r.effects, r.text, true);
    if (r.strike) newStrikes.push(r.text);
  }
  if (S.meters.standing - S.startMeters.standing <= -15) newStrikes.push('Your standing dropped 15+ points today.');
  for (const n of newStrikes) {
    S.strikes++;
    S.strikeNotes.push(n);
  }

  if (S.carry.length) notes.push(`Pushed to tomorrow: ${S.carry.map((e) => e.title).join(', ')}.`);
  if (!day().weekend) {
    S.meters.runway -= PAYROLL;
    S.ledger.unshift({ at: DAY_END, label: 'Payroll', amount: -PAYROLL });
    notes.push(`Payroll went out: ${fmtMoney(PAYROLL)}.`);
  }

  const highlights = [...S.log]
    .sort((a, b) => weight(b.effects) - weight(a.effects))
    .slice(0, 6)
    .sort((a, b) => a.at - b.at);

  const ds = deltas.standing;
  const bossNote =
    newStrikes.length ? 'Quick chat tomorrow? 🙂' :
    ds >= 12 ? 'honestly? killing it. don\'t let it go to your head 🌱' :
    ds >= 0 ? 'solid day! a few bumps. we move 🚀' :
    ds >= -8 ? 'hmm. today was a lot. let\'s regroup tmrw' :
    'we need to talk about today.';

  S.review = { deltas, highlights, notes, newStrikes, bossNote };
  S.selected = null;
  if (!checkGameOver()) S.phase = 'review';
  dirty();
}

const weight = (e: Effects) =>
  Math.abs(e.standing ?? 0) + Math.abs(e.morale ?? 0) + Math.abs(e.stress ?? 0) + Math.abs(e.runway ?? 0) / 1000;

export function nextDay() {
  S.meters.stress = Math.max(0, S.meters.stress - 20);
  S.incoming = S.carry;
  S.carry = [];
  if (S.dayIndex + 1 >= DAYS.length && !S.endless) {
    S.phase = 'end';
    writeSave();
    dirty();
    return;
  }
  setupDay(S.dayIndex + 1);
}

/** Straight into endless mode from the title screen: every app, no story. */
export function newEndless() {
  newGame();
  S.endless = true;
  S.messages = [];
  setupDay(DAYS.length);
}

/** After the final review: keep going. */
export function continueEndless() {
  S.endless = true;
  setupDay(S.dayIndex + 1);
}

export function retryDay() {
  continueGame();
}

export function openApp(app: AppId) {
  if (!hasApp(app)) return;
  S.app = app;
  if (app !== 'mail') S.openMail = null;
  S.banners = S.banners.filter((b) => b.app !== app);
  dirty();
}

export { CAL_START };
