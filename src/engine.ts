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
  setupDay(save.dayIndex);
}

export function setupDay(i: number) {
  S.dayIndex = i;
  writeSave();
  const d = day();
  S.phase = 'memo';
  S.now = PREP_TIME;
  S.startMeters = { ...S.meters };
  S.events = d.events.map((e) => ({ ...e, status: e.start === null ? 'pending' : 'scheduled' }));
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
  S.battery = d.battery;
  S.deadUntil = null;
  S.lowBatteryWarned = false;
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

const MS_PER_MIN = 520;
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
  S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 0.5 : 1;
  dirty();
}

function advance() {
  S.now++;
  const now = S.now;

  // battery
  S.battery = Math.max(0, S.battery - 0.16);
  if (S.battery <= 20 && !S.lowBatteryWarned) {
    S.lowBatteryWarned = true;
    banner('bundl', '🔋 Battery at 20%', 'Bundl sells chargers. Just saying.');
  }
  if (S.battery <= 0 && S.deadUntil === null) {
    S.deadUntil = now + 25;
    applyEffects({ stress: 10 }, 'Your phone died mid-crisis.');
  }
  if (S.deadUntil !== null && now >= S.deadUntil) {
    S.deadUntil = null;
    S.battery = 30;
    banner('calendar', '🔌 Borrowed Wren\'s charger', 'Back at 30%. Wren wants it back.');
  }

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
      S.events.push({ ...s.event, status: 'pending', fresh: true });
      if (s.msg) addMessage(s.msg);
      banner('calendar', '📥 New request', s.event.title);
      break;
    }
    case 'insert': {
      const ev: CalEvent = { ...s.event, status: 'scheduled', fresh: true };
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
  if (e.overrun) {
    e.duration += e.overrun;
    e.overranBy = e.overrun;
    banner('calendar', '⏳ Running long', `${e.title} will run ${e.overrun} min over.`);
  }
}

function finishEvent(e: CalEvent) {
  e.status = 'done';
  if (e.reward) applyEffects(e.reward, `${e.title} went well.`);
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

export function placeEvent(id: string, start: number) {
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
  S.selected = null;
  dirty();
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
    for (const id of day().rules) if (RULES[id].id === 'max60' && RULES[id].check(e)) out.push({ icon: '⚠️', text: RULES[id].short, bad: true });
    return out;
  }
  if (e.status !== 'scheduled') return out;
  const s = e.start;
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
  const arrive = (S.phase === 'day' ? S.now : DAY_START) + (p.id === 'charger' ? 15 : 60);
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
  } else if (o.item === 'charger') {
    S.battery = 100;
    S.deadUntil = null;
    S.lowBatteryWarned = false;
    banner('bundl', '🔌 Charger arrived', 'Battery back to 100%.');
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
