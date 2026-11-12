import { CAL_START, DAYS, DAY_END, DAY_START, DRINKS, EXECS, PAYROLL, PREP_TIME, PRODUCTS, RULES, fmt } from './data';
import {
  S, START_METERS, addStrike, applyEffects, banner, dirty, fmtMoney, readSave, uid, writeSave, clearSave,
} from './state';
import type { AppId, CalEvent, Effects, ExecId, Message, MsgDef, Script } from './types';

export const day = () => DAYS[S.dayIndex];
export const findEvent = (id: string | null) => S.events.find((e) => e.id === id);
const end = (e: CalEvent) => (e.start ?? 0) + e.duration;
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;
const shares = (a: CalEvent, b: CalEvent) => a.attendees.some((x) => b.attendees.includes(x));
const active = (e: CalEvent) => e.status === 'scheduled' || e.status === 'running';
const blocks = (e: CalEvent) => e.kind !== 'focus';

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
  S.carry = [];
  setupDay(save.dayIndex);
}

export function setupDay(i: number) {
  S.dayIndex = i;
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
  S.carry = [];
  S.messages = [];
  S.tasks = [];
  S.orders = [];
  S.log = [];
  S.call = null;
  S.queue = d.script.map((s) => ({ ...s })).sort((a, b) => a.at - b.at);
  S.selected = null;
  S.openMail = null;
  S.sheet = null;
  S.review = null;
  S.overReason = null;
  S.banners = [];
  S.toasts = [];
  S.paused = false;
  addMessage({ app: 'mail', ...d.memo }, true);
  S.app = 'calendar';
  dirty();
}

export function startPrep() {
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

const MS_PER_MIN = 333; // 9am–6pm in ~3 real minutes
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
    while (acc >= MS_PER_MIN && S.phase === 'day') {
      acc -= MS_PER_MIN;
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
  for (const e of [...S.events].sort((a, b) => Number(!!b.force) - Number(!!a.force))) {
    if (e.status === 'scheduled' && e.start !== null && e.start <= now) startEvent(e);
  }

  // requests that never got booked
  for (const e of S.events) {
    if (e.status === 'pending' && e.deadline !== undefined && now >= e.deadline) {
      e.status = 'missed';
      applyEffects(e.missPenalty ?? { standing: -5 }, `Never booked: ${e.title}`);
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

  if (checkGameOver()) return;
  if (now >= DAY_END) endDay();
  dirty();
}

function fire(s: Script) {
  switch (s.type) {
    case 'msg':
      addMessage(s.msg);
      break;
    case 'request': {
      S.events.push({ ...s.event, baseDuration: s.event.duration, status: 'pending', fresh: true });
      if (s.msg) addMessage(s.msg);
      banner('calendar', '📥 New request', s.event.title);
      break;
    }
    case 'insert': {
      const ev: CalEvent = { ...s.event, baseDuration: s.event.duration, status: 'scheduled', fresh: true };
      S.events.push(ev);
      if (s.msg) addMessage(s.msg);
      else banner('calendar', '📅 Calendar changed', ev.title);
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
    case 'task':
      S.tasks.push({ ...s.task, status: 'open' });
      if (s.msg) addMessage(s.msg);
      else banner('notes', '📝 New task', s.task.text);
      break;
    case 'call':
      if (S.call) {
        S.queue.push({ ...s, at: S.now + 5 });
        S.queue.sort((a, b) => a.at - b.at);
      } else {
        S.call = { ...s.call, status: 'ringing', ringUntil: S.now + 10 };
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
  if (e.kind === 'focus') {
    e.status = 'running';
    return;
  }
  const now = S.now;
  if (!e.force) {
    const clash = S.events.find((o) => o !== e && o.status === 'running' && blocks(o) && shares(o, e));
    if (clash) {
      missEvent(e, `Missed: ${e.title}. ${execNames(clash.attendees.filter((a) => e.attendees.includes(a)))} stuck in ${clash.title}.`);
      return;
    }
  }
  e.status = 'running';
  if (S.selected === e.id) S.selected = null;

  for (const id of day().rules) {
    const r = RULES[id];
    if (r.check(e)) applyEffects(r.penalty, `Broke a rule (${r.short}): ${e.title}`);
  }
  if (e.window && e.start !== null && (e.start < e.window[0] || e.start > e.window[1])) {
    applyEffects({ standing: -4 }, `Wrong time for ${e.title}`);
  }
  if (e.prep) {
    const busy = S.events.some(
      (o) => o !== e && blocks(o) && shares(o, e) && ['running', 'done'].includes(o.status) && o.start !== null && overlaps(o.start, end(o), now - e.prep!, now),
    );
    if (busy) {
      applyEffects({ standing: -6 }, `Walked into ${e.title} unprepared.`);
      banner('calendar', '📋 No prep time', `${execNames(e.attendees)} walked into ${e.title} cold.`);
    }
  }
  if (e.coffee) {
    const who = e.attendees[0];
    const got = S.orders.filter((o) => o.app === 'brew' && o.to === who && o.arrived && o.arriveAt >= now - 90).pop();
    if (!got) applyEffects({ standing: -3 }, `No coffee before ${e.title}.`);
    else if (got.item !== EXECS[who].drink) applyEffects({ standing: -4 }, `Wrong coffee before ${e.title}. ${EXECS[who].short} stares at it.`);
    else applyEffects({ standing: 2 }, `Perfect coffee before ${e.title}.`);
  }
  e.planned = e.duration;
  if (e.overrun) {
    e.duration = Math.max(10, e.duration + e.overrun);
    e.overranBy = e.overrun;
    if (e.overrun > 0) banner('calendar', '⏳ Running long', `${e.title} will run ${e.overrun} min over.`);
    else banner('calendar', '🎉 Wrapping early', `${e.title} will finish ${-e.overrun} min early.`);
  }
}

function finishEvent(e: CalEvent) {
  e.status = 'done';
  const booked = e.planned ?? e.duration;
  const ok = e.minOk ?? e.baseDuration ?? booked;
  if (booked >= ok) {
    if (e.reward) applyEffects(e.reward, `${e.title} went well.`);
    return;
  }
  // Cut short: some of the upside, a slice of the downside. Always better than missing it.
  const r = Math.min(1, (ok - booked) / ok);
  const fx: Effects = {};
  for (const [k, v] of Object.entries(e.reward ?? {}) as [keyof Effects, number][]) if (v > 0) fx[k] = Math.round(v * (1 - r));
  for (const [k, v] of Object.entries(e.missPenalty ?? { standing: -5 }) as [keyof Effects, number][]) {
    fx[k] = (fx[k] ?? 0) + Math.round(v * Math.min(0.5, r));
  }
  applyEffects(fx, `${e.title} got cut short (${booked} of ${ok} min).`);
}

// ───────────────────────────── resizing, wrapping up, bumping ─────────────────────────────

export const canResize = (e: CalEvent) => !e.fixed && e.kind !== 'focus' && (e.status === 'pending' || e.status === 'scheduled');
export const canWrap = (e: CalEvent) => !e.fixed && e.kind !== 'focus' && e.status === 'running';
export const canBump = (e: CalEvent) =>
  !e.fixed && !e.noBump && e.kind !== 'personal' && (e.status === 'pending' || e.status === 'scheduled') && S.dayIndex + 1 < DAYS.length;

export function resizeEvent(id: string, delta: number) {
  const e = findEvent(id);
  if (!e || !canResize(e)) return;
  const max = e.start !== null ? DAY_END - e.start : 180;
  e.duration = Math.max(15, Math.min(max, e.duration + delta));
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
  const base: Effects = e.bumpPenalty ?? Object.fromEntries(Object.entries(e.declinePenalty ?? { standing: -3 }).map(([k, v]) => [k, Math.round((v as number) / 2)]));
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
  e.status = 'missed';
  if (S.selected === e.id) S.selected = null;
  applyEffects({ ...(e.missPenalty ?? { standing: -5 }), stress: ((e.missPenalty?.stress ?? 0) + 3) }, text);
  banner('calendar', '💥 Missed meeting', text);
  if (e.strikeOnMiss) addStrike(`You missed ${e.title}.`);
}

export function minStart(): number {
  if (S.phase === 'day') return Math.ceil((S.now + 1) / 15) * 15;
  return DAY_START;
}

export function placeEvent(id: string, start: number, keepSelected = false) {
  const e = findEvent(id);
  if (!e || e.fixed) return;
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
  if (!e || e.fixed || e.status !== 'scheduled') return;
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
  applyEffects(e.declinePenalty ?? { standing: -3 }, `Declined: ${e.title}`);
}

export function select(id: string | null) {
  S.selected = S.selected === id ? null : id;
  dirty();
}

export interface Issue { icon: string; text: string; bad: boolean }

export function issuesFor(e: CalEvent): Issue[] {
  const out: Issue[] = [];
  if (e.start === null) {
    if (e.window) out.push({ icon: '🕒', text: `Start ${fmt(e.window[0])}–${fmt(e.window[1])}`, bad: false });
    if (e.deadline) out.push({ icon: '⏰', text: `Book before ${fmt(e.deadline)}`, bad: false });
    if (e.prep) out.push({ icon: '📋', text: `${e.prep}m prep before`, bad: false });
    if (e.coffee) out.push({ icon: '☕', text: 'Coffee first', bad: false });
    if (e.bumps) out.push({ icon: '📆', text: `Pushed ${e.bumps}×`, bad: false });
    if (e.minOk && e.minOk < (e.baseDuration ?? e.duration)) out.push({ icon: '✂️', text: `Can be ${e.minOk}m`, bad: false });
    for (const id of day().rules) if (RULES[id].id === 'max60' && RULES[id].check(e)) out.push({ icon: '⚠️', text: RULES[id].short, bad: true });
    return out;
  }
  if (e.status !== 'scheduled') return out;
  const s = e.start;
  const ok = e.minOk ?? e.baseDuration ?? e.duration;
  if (e.duration < ok) out.push({ icon: '✂️', text: `Too short (needs ${ok}m)`, bad: true });
  if (blocks(e)) {
    const clash = S.events.find((o) => o !== e && active(o) && blocks(o) && shares(o, e) && o.start !== null && overlaps(s, end(e), o.start, end(o)));
    if (clash) out.push({ icon: '⛔', text: `Clashes with ${clash.title}`, bad: true });
  }
  for (const id of day().rules) if (RULES[id].check(e)) out.push({ icon: '⚠️', text: RULES[id].short, bad: true });
  if (e.window && (s < e.window[0] || s > e.window[1])) out.push({ icon: '🕒', text: `Should start ${fmt(e.window[0])}–${fmt(e.window[1])}`, bad: true });
  if (e.prep) {
    const busy = S.events.some((o) => o !== e && blocks(o) && shares(o, e) && (active(o) || o.status === 'done') && o.start !== null && overlaps(o.start, end(o), s - e.prep!, s));
    if (busy) out.push({ icon: '📋', text: `No ${e.prep}m prep gap`, bad: true });
  }
  if (e.coffee) {
    const who = e.attendees[0];
    const ordered = S.orders.some((o) => o.app === 'brew' && o.to === who && o.arriveAt <= s && o.arriveAt >= s - 90);
    out.push({ icon: '☕', text: ordered ? 'Coffee ordered' : 'Needs coffee', bad: !ordered });
  }
  return out;
}

// ───────────────────────────── messages ─────────────────────────────

const APP_OF: Record<string, AppId> = { mail: 'mail', huddle: 'huddle', messages: 'messages' };

export function addMessage(def: MsgDef, quiet = false): Message {
  const m: Message = { ...def, id: `m${uid()}`, at: S.now, read: false };
  if (def.choices && def.expiresIn) m.expires = S.now + def.expiresIn;
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
  const c = m.choices[idx];
  if (c.flag && !S.flags.includes(c.flag)) S.flags.push(c.flag);
  applyEffects(c.effects, c.log ?? `${m.from}: "${c.label}"`);
  queueThen(c.then);
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

// ───────────────────────────── shopping ─────────────────────────────

const spend = (label: string, amount: number) => {
  S.ledger.unshift({ at: S.now, label, amount: -amount });
};

export function orderDrink(drinkId: string, to: string) {
  const d = DRINKS.find((x) => x.id === drinkId)!;
  const at = Math.max(S.now, S.phase === 'day' ? S.now : DAY_START) + 15;
  S.orders.push({ id: `o${uid()}`, app: 'brew', item: d.id, label: d.name, to, price: d.price, arriveAt: S.phase === 'day' ? at : DAY_START, arrived: false, paidBy: to === 'me' ? 'me' : 'company' });
  if (to !== 'me') {
    S.meters.runway -= d.price;
    spend(`Brew · ${d.name}`, d.price);
  }
  const who = to === 'me' ? 'you' : EXECS[to as ExecId].short;
  banner('brew', '☕ Order placed', `${d.name} for ${who}. Arrives ${fmt(S.phase === 'day' ? at : DAY_START)}.`);
}

export function buyProduct(productId: string, to: string, pay: 'company' | 'me') {
  const p = PRODUCTS.find((x) => x.id === productId)!;
  const arrive = (S.phase === 'day' ? S.now : DAY_START) + 60;
  S.orders.push({ id: `o${uid()}`, app: 'bundl', item: p.id, label: p.name, to, price: p.price, arriveAt: arrive, arrived: false, paidBy: pay });
  S.sheet = null;

  if (pay === 'company') {
    S.meters.runway -= p.price;
    spend(`Bundl · ${p.name}`, p.price);
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
      task.status = o.item === EXECS[exec].drink ? 'done' : 'failed';
      if (task.status === 'done') applyEffects(task.reward, `${EXECS[exec].short} got their coffee.`);
      else applyEffects({ morale: -2 }, `${EXECS[exec].short} got the wrong coffee.`);
    }
  }
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
  for (const e of S.events) {
    if (e.status === 'pending') {
      e.status = 'missed';
      applyEffects(e.missPenalty ?? { standing: -5 }, `Never booked: ${e.title}`, true);
    }
  }
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
    if (!S.flags.includes(r.flag)) continue;
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
  S.meters.runway -= PAYROLL;
  S.ledger.unshift({ at: DAY_END, label: 'Payroll', amount: -PAYROLL });
  notes.push(`Payroll went out: ${fmtMoney(PAYROLL)}.`);

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
  S.meters.stress = Math.max(0, S.meters.stress - 25);
  S.incoming = S.carry;
  S.carry = [];
  if (S.dayIndex + 1 >= DAYS.length) {
    S.phase = 'end';
    writeSave();
    dirty();
    return;
  }
  setupDay(S.dayIndex + 1);
}

export function retryDay() {
  continueGame();
}

export function openApp(app: AppId) {
  S.app = app;
  if (app !== 'mail') S.openMail = null;
  S.banners = S.banners.filter((b) => b.app !== app);
  dirty();
}

export { CAL_START };
