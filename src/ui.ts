import { DAYS, dayAt } from './days';
import { STEP_LABEL, drinkEmoji, drinkName, drinkPrice, optionsFor, specString, stepsFor, type DrinkSpec, type Step } from './drinks';
import { CAL_END, CAL_START, DAY_END, EXECS, isBoss, PAYROLL, PRODUCTS, RESTAURANTS, RIDE_COST, RULES, TABLE_TIMES, fmt } from './data';
import {
  answerCall, buyProduct, choose, chooseCall, continueGame, day, declineCall, declineEvent, findEvent, issuesFor,
  minStart, newGame, nextDay, hasApp, isNewApp, myMeeting, stepOut, meterEffects, runwayDays, cardFrozen, stressPace, activeExecs, toggleSavedDrink, newEndless, continueEndless, rideStale, rideUnneeded, bookTable, slotTaken, bookings, earliestDelivery, toggleAddon, canAddons, addonCost, travelOf, autoPlace, nudgeStart, canBump, canResize, canWrap, bumpEvent, bumpPenaltyFor, resizeEvent, wrapUpNow, openApp, orderDrink, placeEvent, retryDay, select, startDay, startPrep, togglePause,
  toggleSpeed, unschedule,
} from './engine';
import { avatarEl } from './avatars';
import { coffeeOf, metPeople, statusOf } from './people';
import { MAX_SHORTCUTS, addShortcut, removeShortcut, runShortcut, shortcutLabel } from './shortcuts';
import { saveCalPrefs } from './state';
import { METER_LABEL, S, dirty, fmtEffect, fmtMoney, isGood, readSave, setRenderer } from './state';
import type { AppId, CalEvent, ExecId, InboxApp, Meter, RideAction } from './types';

// ───────────────────────────── tiny DOM helper ─────────────────────────────
type Child = Node | string | number | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

const APPS: { id: AppId; name: string; icon: string; color: string; desc: string }[] = [
  { id: 'calendar', name: 'Calendar', icon: '📅', color: '#ff5b5b', desc: 'Where the chaos lives.' },
  { id: 'huddle', name: 'Huddle', icon: '💬', color: '#7b5cff', desc: 'Work chat. Tone is everything.' },
  { id: 'notes', name: 'Notes', icon: '📝', color: '#f5c518', desc: 'Rules, to-dos and what everyone drinks.' },
  { id: 'pulse', name: 'Pulse', icon: '💓', color: '#e5484d', desc: 'Your HR file: you, the team, the company, your job.' },
  { id: 'brew', name: 'Brew', icon: '☕', color: '#a86b3c', desc: 'Coffee, now or scheduled.' },
  { id: 'mail', name: 'Mail', icon: '✉️', color: '#3d8bff', desc: 'Formal requests and Reply-All traps.' },
  { id: 'messages', name: 'Messages', icon: '💚', color: '#2fc463', desc: 'Your actual life. Remember that?' },
  { id: 'bundl', name: 'Bundl', icon: '📦', color: '#ff9f1c', desc: 'Gifts and supplies, delivered.' },
  { id: 'card', name: 'Card', icon: '💳', color: '#1f2a44', desc: 'The company card. Watch the runway.' },
  { id: 'ryde', name: 'Ryde', icon: '🚕', color: '#111827', desc: 'Book cars for off-site meetings.' },
  { id: 'presto', name: 'Presto', icon: '⚡', color: '#5b5bd6', desc: 'One-tap shortcuts. Prep now, react later.' },
  { id: 'tably', name: 'Tably', icon: '🍽️', color: '#e8505b', desc: 'Restaurant reservations. Good luck at 7pm.' },
];

const PX = 1.25; // pixels per minute on the calendar
const split = window.matchMedia('(min-width: 820px)');
split.addEventListener('change', () => dirty());

// ───────────────────────────── skeleton ─────────────────────────────
let refs: {
  device: HTMLElement; status: HTMLElement; meters: HTMLElement; main: HTMLElement; dock: HTMLElement;
  banners: HTMLElement; toasts: HTMLElement; overlay: HTMLElement;
};

export function mountUI(root: HTMLElement) {
  const device = h('div', { class: 'device' });
  refs = {
    device,
    status: h('div', { class: 'statusbar' }),
    meters: h('div', { class: 'meters' }),
    main: h('div', { class: 'main' }),
    dock: h('nav', { class: 'dock' }),
    banners: h('div', { class: 'banners' }),
    toasts: h('div', { class: 'toasts' }),
    overlay: h('div', { class: 'overlay' }),
  };
  device.append(refs.status, refs.meters, refs.main, refs.dock, refs.banners, refs.toasts, refs.overlay);
  root.append(device);
  setRenderer(render);
  setInterval(() => {
    const now = performance.now();
    if (S.banners.some((b) => now - b.born > (b.ttl ?? 4500)) || S.toasts.some((t) => now - t.born > 1800)) dirty();
  }, 400);
  render();
}

function keepScroll(container: HTMLElement, build: () => void) {
  const saved = new Map<string, number>();
  const savedX = new Map<string, number>();
  container.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => { saved.set(el.dataset.keep!, el.scrollTop); savedX.set(el.dataset.keep!, el.scrollLeft); });
  build();
  container.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => {
    const k = el.dataset.keep!;
    if (el.dataset.stick === 'bottom') {
      const prev = stickCounts.get(k);
      const count = Number(el.dataset.count);
      if (prev === undefined || count > prev) {
        el.scrollTop = el.scrollHeight;
        stickCounts.set(k, count);
        return;
      }
    }
    if (savedX.get(k)) el.scrollLeft = savedX.get(k)!;
    if (saved.has(k)) el.scrollTop = saved.get(k)!;
    else if (el.dataset.initial) el.scrollTop = Number(el.dataset.initial);
  });
}
const stickCounts = new Map<string, number>();

/** Tablet layout: both panes, the app full screen, or the calendar alone (app closed). */
let layout: 'split' | 'app' | 'cal' = 'split';

function winCtrls(isSplit: boolean) {
  return h('div', { class: 'win-ctrls' },
    isSplit && h('button', { class: 'win-btn', title: layout === 'app' ? 'Exit full screen' : 'Full screen', onclick: () => { layout = layout === 'app' ? 'split' : 'app'; dirty(); } }, layout === 'app' ? '⤡' : '⤢'),
    h('button', { class: 'win-btn', title: 'Close', onclick: () => { if (isSplit) layout = 'cal'; else openApp('calendar'); dirty(); } }, '✕'),
  );
}

function render() {
  const isSplit = split.matches;
  refs.device.classList.toggle('is-split', isSplit);
  refs.device.classList.toggle('is-day', S.phase === 'day');

  refs.status.replaceChildren(renderStatus());
  refs.device.classList.toggle('tense', S.phase === 'day' && S.meters.stress >= 60 && S.meters.stress < 80);
  refs.device.classList.toggle('frazzled', S.phase === 'day' && S.meters.stress >= 80);

  keepScroll(refs.main, () => {
    const panes: HTMLElement[] = [];
    if (isSplit) {
      if (S.app === 'calendar' || !hasApp(S.app)) S.app = hasApp('mail') ? 'mail' : 'huddle';
      if (layout !== 'app') panes.push(h('section', { class: 'pane pane-cal' }, renderCalendar()));
      if (layout !== 'cal') panes.push(h('section', { class: 'pane pane-app has-win' }, renderApp(S.app), winCtrls(true)));
    } else {
      panes.push(S.app === 'calendar'
        ? h('section', { class: 'pane pane-app' }, renderCalendar())
        : h('section', { class: 'pane pane-app has-win' }, renderApp(S.app), winCtrls(false)));
    }
    refs.main.replaceChildren(...panes);
  });

  if (scrollTarget !== null) {
    const sc = refs.main.querySelector<HTMLElement>('.cal-scroll');
    const ev = findEvent(S.selected);
    const target = ev?.start ?? scrollTarget;
    if (sc) sc.scrollTo({ top: Math.max(0, (target - CAL_START - 30) * PX), behavior: 'smooth' });
    scrollTarget = null;
  }

  refs.dock.replaceChildren(...renderDock(isSplit));

  const now = performance.now();
  S.banners = S.banners.filter((b) => now - b.born < (b.ttl ?? 4500));
  S.toasts = S.toasts.filter((t) => now - t.born < 1800);
  refs.banners.replaceChildren(
    ...[...S.banners.filter((b) => b.action).slice(-1), ...S.banners.filter((b) => !b.action).slice(S.banners.some((b) => b.action) ? -1 : -2)].map((b) =>
      h('div', { class: `banner ${b.action ? 'has-action' : ''}`, role: 'button', style: `animation-delay:${b.born - now}ms`, onclick: () => openApp(b.app) },
        h('span', { class: 'banner-icon', style: `background:${appOf(b.app).color}` }, appOf(b.app).icon),
        h('span', { class: 'banner-text' }, h('b', {}, b.title), h('span', {}, b.body)),
        b.action && h('button', { class: 'banner-act', onclick: (ev: Event) => { ev.stopPropagation(); S.banners = S.banners.filter((x) => x !== b); b.action!.run(); dirty(); } }, b.action.label),
      ),
    ),
  );
  refs.toasts.replaceChildren(...S.toasts.slice(-4).map((t) => h('div', { class: `toast ${t.good ? 'good' : 'bad'}`, style: `animation-delay:${t.born - now}ms` }, t.text)));

  keepScroll(refs.overlay, () => {
    const ov = renderOverlay();
    const key = ov ? `${S.phase}|${ov.className}` : '';
    if (key !== overlayKey) {
      overlayKey = key;
      overlayBorn = now;
    }
    if (ov) {
      ov.style.animationDelay = `${overlayBorn - now}ms`;
      ov.querySelectorAll<HTMLElement>('.sheet').forEach((el) => (el.style.animationDelay = `${overlayBorn - now}ms`));
    }
    refs.overlay.classList.toggle('show', !!ov);
    refs.overlay.replaceChildren(...(ov ? [ov] : []));
  });
}

const appOf = (id: AppId) => APPS.find((a) => a.id === id)!;
let overlayKey = '';
let overlayBorn = 0;

// ───────────────────────────── status + meters ─────────────────────────────
function dayAtLabel(i: number) {
  const d = dayAt(i);
  return `${d.weekday}${d.weekend ? ' 🌴' : ''}`;
}

function dayLabel(short = false) {
  const d = day();
  const n = S.dayIndex + 1;
  if (S.dayIndex >= DAYS.length) return short ? `${d.weekday} · Day ${n}` : `${d.weekday} · Endless · Day ${n}`;
  return short ? `${d.weekday} · ${n}/${DAYS.length}` : `${d.weekday} · Day ${n} of ${DAYS.length}`;
}

function renderStatus() {
  const time = S.phase === 'prep' || S.phase === 'memo' ? fmt(S.now) : S.phase === 'day' ? fmt(S.now) : '—';
  const label = S.phase === 'prep' ? '' : S.phase === 'day' ? (S.paused ? 'Paused' : day().weekend ? 'Weekend 🌴' : 'Workday') : '';
  return h('div', { class: 'status-inner' },
    h('span', { class: 'status-left' }, label),
    h('span', { class: 'status-center' }, h('b', {}, `${dateFor(S.dayIndex)} · ${time}`), h('small', {}, S.dayIndex < DAYS.length ? `Day ${S.dayIndex + 1} of ${DAYS.length}` : `Endless · Day ${S.dayIndex + 1}`)),
    h('span', { class: 'status-right' },
      S.phase === 'prep' && (() => {
        const n = S.events.filter((e) => e.status === 'pending').length;
        return h('button', { class: 'start-btn', onclick: startDay, title: n ? `${n} requests still unbooked` : 'Start the day' }, 'Start day', n > 0 && h('span', { class: 'start-count' }, n), ' →');
      })(),
      S.phase === 'day' && h('button', { class: 'chip-btn', onclick: toggleSpeed, title: 'Speed' }, `${S.speed}×`),
      S.phase === 'day' && h('button', { class: 'chip-btn', onclick: togglePause, title: 'Pause' }, S.paused ? '▶' : '⏸'),
    ),
  );
}

const METER_ICON: Record<Meter, string> = { standing: '⭐', runway: '💸', morale: '🤝', stress: '😰' };

/** The game starts on Wednesday 4 March. */
const dateFor = (i: number) => new Date(2026, 2, 4 + i).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const dangerCount = () => {
  const m = S.meters;
  return [m.standing <= 25, runwayDays() < 5, m.morale <= 25, m.stress >= 75].filter(Boolean).length + (S.strikes >= 2 ? 1 : 0);
};

let pulseTab: 'you' | 'team' = 'you';
let openPerson: string | null = null;

function renderTeam() {
  const people = metPeople();
  const work = people.filter((p) => !p.personal);
  const life = people.filter((p) => p.personal);
  const row = (p: (typeof people)[number]) => {
    const open = openPerson === p.key;
    const st = statusOf(p);
    return h('div', { class: `person ${open ? 'open' : ''}` },
      h('button', { class: 'person-row', onclick: () => { openPerson = open ? null : p.key; dirty(); } },
        face(p.key, 44),
        h('span', { class: 'person-text' }, h('b', {}, p.name), h('small', { class: 'muted' }, p.role), st && h('small', { class: 'person-status' }, st)),
        h('span', { class: 'muted' }, open ? '▾' : '▸'),
      ),
      open && h('div', { class: 'person-more' },
        h('p', {}, p.bio),
        coffeeOf(p) && h('div', { class: 'small' }, '☕ ', coffeeOf(p)),
        ...p.facts.map((x) => h('div', { class: 'small' }, '• ', x)),
      ),
    );
  };
  return [
    h('h4', {}, 'Work'), ...work.map(row),
    life.length > 0 && h('h4', {}, 'Your people'), ...life.map(row),
  ];
}

function renderPulse() {
  const tabs = h('div', { class: 'seg pulse-tabs' },
    h('button', { class: `seg-btn ${pulseTab === 'you' ? 'on' : ''}`, onclick: () => { pulseTab = 'you'; dirty(); } }, '📊 You'),
    h('button', { class: `seg-btn ${pulseTab === 'team' ? 'on' : ''}`, onclick: () => { pulseTab = 'team'; dirty(); } }, `👥 Team · ${metPeople().length}`),
  );
  if (pulseTab === 'team') {
    return h('div', { class: 'app pulse' },
      head('Pulse', 'Everyone you\'ve met'),
      h('div', { class: 'scroll', 'data-keep': 'pulse-team' }, tabs, ...renderTeam()),
    );
  }
  const fx = meterEffects();
  const m = S.meters;
  const delta = (k: Meter) => Math.round(m[k] - S.startMeters[k]);
  const card = (k: Meter, value: string, pct: number, danger: boolean, blurb: string) => {
    const d = delta(k);
    return h('div', { class: `pulse-card ${danger ? 'danger' : ''}`, style: `--c:${PULSE_COLOR[k]}` },
      h('div', { class: 'pulse-top' },
        h('span', { class: 'pulse-icon' }, METER_ICON[k]),
        h('div', { class: 'pulse-name' }, h('b', {}, METER_LABEL[k]), h('small', { class: 'muted' }, blurb)),
        h('div', { class: 'pulse-val' }, h('b', {}, value), d !== 0 && h('small', { class: isGood(k, d) ? 'pos' : 'neg' }, `${d > 0 ? '+' : ''}${k === 'runway' ? fmtMoney(d) : d} today`)),
      ),
      h('div', { class: 'meter-bar' }, h('span', { style: `width:${Math.max(0, Math.min(100, pct))}%` })),
      ...(fx[k as keyof typeof fx].length ? fx[k as keyof typeof fx] : [{ text: 'No effect right now.', good: true }]).map((e) => h('div', { class: `pulse-fx ${e.good ? '' : 'bad'}` }, e.good ? '• ' : '⚠️ ', e.text)),
    );
  };
  return h('div', { class: 'app pulse' },
    head('Pulse', 'Your HR file (Bev can see this)'),
    h('div', { class: 'scroll', 'data-keep': 'pulse' },
      tabs,
      h('div', { class: 'pulse-strikes' },
        h('b', {}, 'Strikes'), h('div', { class: 'strikes big' }, ...[0, 1, 2].map((i) => h('span', { class: i < S.strikes ? 'on' : '' }, '✕'))),
        h('small', { class: 'muted' }, 'Three and you are out.'),
        ...S.strikeNotes.map((n) => h('div', { class: 'small neg' }, '📅 ', n)),
      ),
      card('standing', String(Math.round(m.standing)), m.standing, m.standing <= 25, 'Your job. Margo\'s trust.'),
      card('runway', `${runwayDays()} days`, (runwayDays() / 15) * 100, cardFrozen(), `The company. ${fmtMoney(m.runway)} in the bank.`),
      card('morale', String(Math.round(m.morale)), m.morale, m.morale <= 25, 'The team. Will they help you?'),
      card('stress', String(Math.round(m.stress)), m.stress, m.stress >= 75, stressPace() > 1 ? 'You. Frazzled.' : 'You.'),
    ),
  );
}

const PULSE_COLOR: Record<Meter, string> = { standing: '#f5b700', runway: '#3d8bff', morale: '#2fc463', stress: '#e5484d' };

function renderMeters() {
  const items = (['standing', 'runway', 'morale', 'stress'] as Meter[]).map((m) => {
    const v = S.meters[m];
    const pct = m === 'runway' ? Math.max(0, Math.min(100, (v / 50000) * 100)) : v;
    const danger = m === 'stress' ? v >= 75 : m === 'runway' ? v < 10000 : v <= 25;
    return h('div', { class: `meter m-${m} ${danger ? 'danger' : ''}`, title: METER_LABEL[m] },
      h('span', { class: 'meter-icon' }, METER_ICON[m]),
      h('span', { class: 'meter-body' },
        h('span', { class: 'meter-top' }, h('span', { class: 'meter-name' }, METER_LABEL[m]), h('b', {}, m === 'runway' ? fmtMoney(v) : Math.round(v))),
        h('span', { class: 'meter-bar' }, h('span', { style: `width:${pct}%` })),
      ),
    );
  });
  const strikes = h('div', { class: 'strikes', title: 'Strikes: 3 and you are out' },
    ...[0, 1, 2].map((i) => h('span', { class: i < S.strikes ? 'on' : '' }, '✕')));
  return [...items, strikes];
}

// ───────────────────────────── dock ─────────────────────────────
function badgeFor(app: AppId): number {
  if (app === 'calendar') return S.events.filter((e) => e.status === 'pending').length;
  if (app === 'mail' || app === 'huddle' || app === 'messages')
    return S.messages.filter((m) => m.app === app && (!m.read || (m.choices && m.chosen === undefined))).length;
  if (app === 'notes') return S.tasks.filter((t) => t.status === 'open').length;
  if (app === 'pulse') return dangerCount();
  return 0;
}

function renderDock(isSplit: boolean) {
  return APPS.filter((a) => hasApp(a.id) && !(isSplit && a.id === 'calendar')).map((a) => {
    const n = badgeFor(a.id);
    return h('button', { class: `dock-app ${S.app === a.id ? 'active' : ''}`, onclick: () => { if (layout === 'cal') layout = 'split'; openApp(a.id); } },
      h('span', { class: 'app-icon', style: `background:${a.color}` }, a.icon,
        n > 0 ? h('span', { class: 'badge' }, n) : isNewApp(a.id) ? h('span', { class: 'badge new' }, 'NEW') : null),
      h('span', { class: 'app-name' }, a.name),
    );
  });
}

// ───────────────────────────── calendar ─────────────────────────────
function renderCalendar() {
  const d = day();
  const execs = visibleExecs();
  const pending = S.events.filter((e) => e.status === 'pending');
  const sel = findEvent(S.selected);

  const hiddenN = activeExecs().length - execs.length;
  const header = h('header', { class: 'app-head' },
    h('h2', { class: 'cal-title' }, 'Calendar',
      activeExecs().length > 1 && h('button', { class: 'cal-manage', onclick: () => { calSheet = true; dirty(); } }, '☰ Calendars', hiddenN > 0 && h('span', { class: 'start-count', title: `${hiddenN} hidden` }, `−${hiddenN}`))),
    S.phase === 'prep'
      ? h('span', { class: 'muted' }, 'Plan before 9am')
      : h('span', { class: 'muted' }, S.phase === 'day' ? (d.weekend ? '🌴 Weekend. Technically.' : `${fmt(S.now)} · ends ${fmt(DAY_END)}`) : ''),
  );

  const tray = h('div', { class: 'tray' },
    h('div', { class: 'tray-head' }, `Requests`, h('span', { class: 'count' }, pending.length),
      h('span', { class: 'muted hint' }, pending.length ? split.matches ? 'Drag onto the calendar, or tap then tap a time' : 'Swipe for more · tap or drag down to book' : 'All booked 🎉')),
    h('div', { class: 'tray-cards' }, ...pending.map(renderCard)),
  );

  const selBar = sel ? renderSelection(sel) : null;

  const heads = h('div', { class: 'cal-heads' },
    h('div', { class: 'gutter' }),
    ...execs.map((x) => h('div', { class: 'cal-head', style: `--c:${EXECS[x].color}` }, x === 'team' ? h('span', { class: 'avatar' }, EXECS[x].emoji) : face(x, 28), h('span', {}, h('b', {}, EXECS[x].short), h('small', {}, EXECS[x].title)))),
  );

  const height = (CAL_END - CAL_START) * PX;
  const gutter = h('div', { class: 'gutter' });
  for (let m = CAL_START; m <= CAL_END; m += 30) {
    if (m % 60 === 0) gutter.append(h('span', { class: 'hour', style: `top:${(m - CAL_START) * PX}px` }, fmt(m).replace(':00', '')));
  }

  const cols = execs.map((x) => {
    const col = h('div', { class: 'cal-col', 'data-exec': x, style: `height:${height}px; --c:${EXECS[x].color}` });
    col.append(h('div', { class: 'off-hours', style: `top:0;height:${(t9() - CAL_START) * PX}px` }));
    col.append(h('div', { class: 'off-hours', style: `top:${(DAY_END - CAL_START) * PX}px;height:${(CAL_END - DAY_END) * PX}px` }));
    if (S.phase === 'day') {
      col.append(h('div', { class: 'past', style: `top:0;height:${(S.now - CAL_START) * PX}px` }));
    }
    const shown = S.events.filter((e) => e.start !== null && e.attendees.includes(x) && e.status !== 'declined');
    const lanes = layoutLanes(shown.filter((e) => e.kind !== 'focus'));
    for (const e of shown) {
      const pieces = [renderBlock(e)];
      const tr = travelOf(e);
      if (tr && e.status !== 'missed') {
        pieces.push(h('div', { class: 'travel', style: `top:${(e.start! - tr - CAL_START) * PX}px;height:${tr * PX}px;--c:${EXECS[e.attendees[0]].color}` }, '🚗'));
        pieces.push(h('div', { class: 'travel', style: `top:${(e.start! + e.duration - CAL_START) * PX}px;height:${tr * PX}px;--c:${EXECS[e.attendees[0]].color}` }, '🚗'));
      }
      const l = lanes.get(e);
      for (const el of pieces) {
        if (l && l.of > 1) {
          el.style.left = `calc(${(l.lane / l.of) * 100}% + 2px)`;
          el.style.right = 'auto';
          el.style.width = `calc(${100 / l.of}% - 4px)`;
        }
        col.append(el);
      }
    }
    if (S.phase === 'day') col.append(h('div', { class: 'now-line', style: `top:${(S.now - CAL_START) * PX}px` }));
    col.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.evt') || !S.selected || Date.now() < suppressUntil) return;
      placeEvent(S.selected, minuteAt(col, (ev as MouseEvent).clientY));
    });
    return col;
  });

  const initial = S.phase === 'day' ? Math.max(0, (S.now - CAL_START - 45) * PX) : 0;
  const scroller = h('div', { class: 'cal-scroll', 'data-keep': 'cal', 'data-initial': initial },
    h('div', { class: 'cal-inner', style: `--n:${execs.length}` },
      heads,
      h('div', { class: 'cal-grid', style: `height:${height}px` }, gutter, ...cols)));

  const busy = S.phase === 'day' ? myMeeting() : undefined;
  if (busy) {
    if (S.selected) S.selected = null;
    const lock = h('div', { class: 'lockbar' },
      h('span', {}, '🔒 ', h('b', {}, `You're in "${busy.title}"`), h('small', {}, ` until ${fmt(busy.start! + busy.duration)}. Calendar locked.`)),
      h('button', { class: 'btn', onclick: stepOut }, busy.attendees.length > 1 ? 'Step out' : 'Wrap up'),
    );
    return h('div', { class: 'app cal locked' }, header, lock, tray, scroller);
  }
  return h('div', { class: `app cal ${sel ? 'placing' : ''}` }, header, tray, selBar, scroller);
}

const t9 = () => 9 * 60;

function renderCard(e: CalEvent) {
  const card = h('div', { class: `req ${S.selected === e.id ? 'selected' : ''} ${e.fresh ? 'fresh' : ''}`, style: `--c:${EXECS[e.attendees[0]].color}` },
    h('div', { class: 'req-top' },
      h('b', {}, e.title),
      h('span', { class: 'dur' }, `${e.duration}m`),
    ),
    h('div', { class: 'req-who' }, ...e.attendees.map((a) => h('span', { class: 'who', style: `--c:${EXECS[a].color}` }, EXECS[a].short))),
    h('div', { class: 'req-tags' }, ...issuesFor(e).map((i) => h('span', { class: `tag ${i.bad ? 'bad' : ''}` }, `${i.icon} ${i.text}`))),
  );
  makeDraggable(card, e.id, false);
  return card;
}

/** Side-by-side lanes for overlapping events, so clashes are visible instead of stacked. */
function layoutLanes(evts: CalEvent[]) {
  const out = new Map<CalEvent, { lane: number; of: number }>();
  const sorted = [...evts].sort((a, b) => a.start! - travelOf(a) - (b.start! - travelOf(b)) || b.duration - a.duration);
  let cluster: CalEvent[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const e of cluster) out.get(e)!.of = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const e of sorted) {
    const s0 = e.start! - travelOf(e);
    const s1 = e.start! + e.duration + travelOf(e);
    if (s0 >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s0);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s1);
    } else laneEnds[lane] = s1;
    out.set(e, { lane, of: 1 });
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, s1);
  }
  flush();
  return out;
}

function renderBlock(e: CalEvent) {
  const start = e.start!;
  const issues = issuesFor(e);
  const bad = issues.some((i) => i.bad && i.icon !== '☕');
  const movable = !e.fixed && e.status === 'scheduled';
  const small = e.duration * PX < 34;
  const cls = ['evt', `st-${e.status}`, `k-${e.kind ?? 'meeting'}`, bad ? 'has-issue' : '', S.selected === e.id ? 'selected' : '', movable ? 'movable' : '', small ? 'small' : '', e.attendees.length > 1 ? 'multi' : '', e.fresh ? 'fresh' : ''].join(' ');
  const el = h('div', { class: cls, style: `top:${(start - CAL_START) * PX}px;height:${Math.max(16, e.duration * PX - 2)}px;--c:${EXECS[e.attendees[0]].color}` },
    e.editedBy && e.status === 'scheduled' && h('span', { class: 'edited-mark', title: `Edited by ${e.editedBy}` }, '✏️'),
    h('div', { class: 'evt-title' }, e.status === 'missed' ? '💥 ' : e.status === 'done' ? '✓ ' : '', e.kind === 'personal' && e.attendees.includes('me') ? '🏠 ' : '', e.title),
    !small && h('div', { class: 'evt-time' }, `${fmt(start)}–${fmt(start + e.duration)}`, e.overranBy ? ` (+${e.overranBy}m)` : ''),
    !small && h('div', { class: 'evt-issues' },
      [...(e.status === 'scheduled' ? issues.filter((i) => i.bad).map((i) => i.icon) : []),
        e.remote ? '💻' : '', e.withCoffee ? '☕' : '', e.withCatering ? '🍱' : ''].filter(Boolean).join(' ')),
  );
  if (movable) makeDraggable(el, e.id, true);
  else el.addEventListener('click', () => select(e.id));
  return el;
}

function renderSelection(e: CalEvent) {
  const issues = issuesFor(e);
  const canAct = e.status === 'pending' || (e.status === 'scheduled' && !e.fixed);
  const ok = e.minOk ?? e.baseDuration ?? e.duration;
  const bumpFx = canBump(e) ? bumpPenaltyFor(e) : null;
  const bumpCost = bumpFx && Object.entries(bumpFx).filter(([, v]) => v).map(([m, v]) => `${METER_ICON[m as Meter]}${m === 'runway' ? fmtMoney(v as number) : v}`).join(' ');
  return h('div', { class: 'selbar' },
    h('div', { class: 'selbar-top' },
      h('b', {}, e.title),
      h('span', { class: 'muted small nowrap' },
        e.attendees.map((a) => EXECS[a].short).join(' & '),
        e.start !== null ? ` · ${fmt(e.start)}` : '',
        e.status !== 'scheduled' && e.status !== 'pending' ? ` · ${e.status}` : ''),
    ),
    e.note && h('div', { class: 'small note' }, e.note),
    issues.length > 0 && h('div', { class: 'req-tags' }, ...issues.map((i) => h('span', { class: `tag ${i.bad ? 'bad' : ''}` }, `${i.icon} ${i.text}`))),
    canAct && h('div', { class: 'stepper' },
      h('span', { class: 'small muted lbl' }, 'Start'),
      e.start !== null && h('button', { class: 'btn', onclick: () => { nudgeStart(e.id, -15); scrollToEvent(e); } }, '−15'),
      e.start !== null && h('b', { class: 'len' }, fmt(e.start).replace(/(am|pm)$/, '')),
      e.start !== null && h('button', { class: 'btn', onclick: () => { nudgeStart(e.id, 15); scrollToEvent(e); } }, '+15'),
      h('button', { class: `btn ${e.start === null ? 'best primary-y' : ''}`, onclick: () => { autoPlace(e.id); scrollToEvent(e); } }, e.start === null ? '📍 Book best slot' : '📍 Best'),
    ),
    canResize(e) && h('div', { class: 'stepper' },
      h('span', { class: 'small muted lbl' }, 'Length'),
      h('button', { class: 'btn', onclick: () => resizeEvent(e.id, -15), disabled: e.duration <= 15 }, '−15'),
      h('b', { class: `len ${e.duration < ok ? 'short' : ''}` }, `${e.duration}m`),
      h('button', { class: 'btn', onclick: () => resizeEvent(e.id, 15) }, '+15'),
      h('span', { class: 'small muted' }, e.duration < ok ? `cut short: partial credit` : ok < (e.baseDuration ?? e.duration) ? `fine down to ${ok}m` : ''),
    ),
    canWrap(e) && h('div', { class: 'stepper' },
      h('span', { class: 'small muted' }, `Running since ${fmt(e.start!)} · ${S.now - e.start!} of ${e.planned ?? e.duration}m${(e.planned ?? 0) < ok ? '' : ''}`),
    ),
    canAddons(e) && h('div', { class: 'addons' },
      h('button', { class: `chip ${e.withCoffee ? 'on' : ''}`, onclick: () => toggleAddon(e.id, 'coffee') },
        `☕ Coffee $${addonCost(e).coffee}`,
        e.coffee && h('small', {}, S.flags.includes(`drink-${e.attendees[0]}`) ? ' · their usual' : ' · house latte?')),
      e.catering && h('button', { class: `chip ${e.withCatering ? 'on' : ''}`, onclick: () => toggleAddon(e.id, 'catering') }, `🍱 Catering $${addonCost(e).catering}`),
      e.travel && hasApp('ryde') && (!e.remote || e.withRide) && h('button', { class: `chip ${rideStale(e) || rideUnneeded(e) ? 'warn' : e.withRide ? 'on' : ''}`, onclick: () => toggleAddon(e.id, 'ride') },
        rideUnneeded(e) ? '🚕 Cancel ride (remote now)' : rideStale(e) ? `🚕 Fix ride → ${e.place}` : `🚕 Ride $${RIDE_COST * 2}`),
      e.remoteOk && h('button', { class: `chip ${e.remote ? 'on' : ''}`, onclick: () => toggleAddon(e.id, 'remote') },
        e.remote ? '💻 Remote' : `🚗 In person · ${e.travel}m each way`,
        e.remote && e.remoteOk === 'meh' ? h('small', {}, ' · less impact') : null),
    ),
    h('div', { class: 'selbar-actions' },
      e.status === 'pending' ? h('span', { class: 'small hint-strong' }, 'or tap a time 👇') : h('span', { class: 'spacer' }),
      canWrap(e) && h('button', { class: 'btn danger', onclick: () => wrapUpNow(e.id) }, '✂️ Wrap up now'),
      e.status === 'scheduled' && !e.fixed && h('button', { class: 'btn', onclick: () => unschedule(e.id) }, 'Unbook'),
      bumpFx && h('button', { class: 'btn', onclick: () => bumpEvent(e.id), title: 'Push to tomorrow' }, '📆 Tmrw', h('small', { class: 'cost' }, bumpCost || 'free')),
      canAct && h('button', { class: 'btn danger', onclick: () => declineEvent(e.id) }, 'Decline'),
      h('button', { class: 'btn icon', onclick: () => select(null), 'aria-label': 'Cancel' }, '✕'),
    ),
  );
}

function minuteAt(col: HTMLElement, clientY: number) {
  const r = col.getBoundingClientRect();
  return CAL_START + (clientY - r.top) / PX;
}

let suppressUntil = 0;
let scrollTarget: number | null = null;

function scrollToEvent(e: CalEvent) {
  if (e.start !== null) scrollTarget = e.start;
}

function makeDraggable(el: HTMLElement, id: string, isBlock: boolean) {
  el.addEventListener('click', () => {
    if (Date.now() >= suppressUntil) select(id);
  });
  el.addEventListener('pointerdown', (down: PointerEvent) => {
    if (down.button !== 0) return;
    const sx = down.clientX;
    const sy = down.clientY;
    const r = el.getBoundingClientRect();
    const offY = isBlock ? down.clientY - r.top : 0;
    const ev = findEvent(id)!;
    let ghost: HTMLElement | null = null;

    const move = (m: PointerEvent) => {
      if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) > 7 && (isBlock || split.matches || Math.abs(m.clientY - sy) > Math.abs(m.clientX - sx))) {
        ghost = h('div', { class: 'drag-ghost', style: `--c:${EXECS[ev.attendees[0]].color};height:${Math.max(18, ev.duration * PX)}px` }, h('b', {}, ev.title), h('span', { class: 'ghost-time' }));
        document.body.append(ghost);
        document.body.classList.add('dragging');
      }
      if (!ghost) return;
      m.preventDefault();
      const colW = (document.querySelector('.cal-col') as HTMLElement | null)?.offsetWidth ?? 160;
      ghost.style.width = `${colW - 6}px`;
      ghost.style.transform = `translate(${m.clientX - colW / 2}px, ${m.clientY - offY}px)`;
      const col = colAt(m.clientX, m.clientY);
      document.querySelectorAll('.cal-col.hover').forEach((c) => c.classList.remove('hover'));
      const tl = ghost.querySelector('.ghost-time') as HTMLElement;
      if (col) {
        col.classList.add('hover');
        const s = Math.max(minStart(), Math.round(minuteAt(col, m.clientY - offY) / 15) * 15);
        tl.textContent = `→ ${fmt(s)}`;
      } else tl.textContent = '';
      const sc = document.querySelector('.cal-scroll') as HTMLElement | null;
      if (sc) {
        const sr = sc.getBoundingClientRect();
        if (m.clientY < sr.top + 40 && m.clientY > sr.top - 80) sc.scrollTop -= 10;
        else if (m.clientY > sr.bottom - 40) sc.scrollTop += 10;
      }
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging');
      document.querySelectorAll('.cal-col.hover').forEach((c) => c.classList.remove('hover'));
      const moved = Math.hypot(u.clientX - sx, u.clientY - sy) > 7 && (isBlock || split.matches || Math.abs(u.clientY - sy) > Math.abs(u.clientX - sx));
      if (ghost || moved) {
        ghost?.remove();
        suppressUntil = Date.now() + 250;
        const col = colAt(u.clientX, u.clientY);
        if (col && u.type === 'pointerup') placeEvent(id, minuteAt(col, u.clientY - offY));
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function colAt(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  return el?.closest('.cal-col') ?? null;
}

// ───────────────────────────── other apps ─────────────────────────────
function renderApp(app: AppId): HTMLElement {
  switch (app) {
    case 'calendar': return renderCalendar();
    case 'mail': return renderMail();
    case 'huddle': return renderFeed('huddle', 'Huddle', 'Work chat');
    case 'messages': return renderFeed('messages', 'Messages', 'Personal');
    case 'brew': return renderBrew();
    case 'bundl': return renderBundl();
    case 'card': return renderCard$();
    case 'notes': return renderNotes();
    case 'pulse': return renderPulse();
    case 'presto': return renderPresto();
    case 'ryde': return renderRyde();
    case 'tably': return renderTably();
  }
}

const head = (title: string, sub?: Child, right?: Child) =>
  h('header', { class: 'app-head' }, h('h2', {}, title, sub && h('small', {}, sub)), right);

/** A cartoon face if we know them, otherwise the old initial-in-a-circle. */
function face(name: string, size = 30, cls = ''): HTMLElement {
  return avatarEl(name, size, cls) ?? h('span', { class: 'avatar-dot', style: `background:${avatarColor(name)};width:${size}px;height:${size}px` }, name.replace(/^Voicemail · /, '')[0]);
}

const avatarColor = (name: string) => {
  if (name.startsWith('Margo')) return EXECS.margo.color;
  if (name.startsWith('Theo')) return EXECS.theo.color;
  let n = 0;
  for (const ch of name) n = (n * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${n} 55% 55%)`;
};

function choiceButtons(m: (typeof S.messages)[number]) {
  if (!m.choices) return null;
  if (m.chosen !== undefined) {
    if (m.chosen === -1) return h('div', { class: 'reply' }, h('i', { class: 'muted' }, 'No reply. (Too late.)'));
    if (m.advice && m.outcome !== undefined) {
      return h('div', { class: 'reply' }, `You advised: ${m.choices[m.chosen].label}`,
        h('div', { class: `small ${m.outcome === m.chosen ? 'pos' : 'neg'}` }, m.outcome === m.chosen ? '✓ She listened.' : `✗ She went with: ${m.choices[m.outcome].label}`));
    }
    return h('div', { class: 'reply' }, `You: ${m.choices[m.chosen].label}`);
  }
  const left = m.expires !== undefined && S.phase === 'day' ? Math.max(0, m.expires - S.now) : null;
  return h('div', { class: 'choices' },
    m.advice && h('div', { class: 'small muted' }, '🤔 Margo wants your advice. She may not take it.'),
    left !== null && h('div', { class: 'expires' }, `⏳ needs an answer in ${left} min`),
    ...m.choices.map((c, i) => h('button', { class: 'btn choice', onclick: () => choose(m.id, i) }, c.label)),
  );
}

/** "9:40am" for today, "Tue" for earlier days. */
const msgTime = (m: { at: number; day?: number }) => ((m.day ?? S.dayIndex) === S.dayIndex ? fmt(m.at) : dayAt(m.day!).weekday);
const dayName = (i: number) => (i === S.dayIndex ? 'Today' : i === S.dayIndex - 1 ? `Yesterday · ${dayAt(i).weekday}` : `${dayAt(i).weekday} · Day ${i + 1}`);

/** Full-screen tablet layout: inbox apps show the list and the open item side by side. */
const isWide = () => split.matches && layout === 'app';

type Msg = (typeof S.messages)[number];

function mailRow(m: Msg) {
  return h('button', { class: `mail-row ${m.read ? '' : 'unread'} ${S.openMail === m.id ? 'sel' : ''}`, onclick: () => { S.openMail = m.id; dirty(); } },
    face(m.from),
    h('span', { class: 'mail-row-text' },
      h('span', { class: 'mail-row-top' }, h('b', {}, m.from), h('span', { class: 'muted small' }, msgTime(m))),
      h('span', { class: 'mail-subj' }, m.choices && m.chosen === undefined ? '⚡ ' : '', m.subject ?? ''),
      h('span', { class: 'muted small clamp' }, m.body),
    ),
  );
}

function mailBody(open: Msg) {
  open.read = true;
  return h('div', { class: 'scroll', 'data-keep': `mail-${open.id}` },
    h('article', { class: 'mail-open' },
      h('div', { class: 'mail-from' }, face(open.from, 36), h('div', {}, h('b', {}, open.from), h('div', { class: 'muted small' }, msgTime(open)))),
      h('h3', {}, open.subject ?? '(no subject)'),
      h('div', { class: 'mail-body' }, open.body),
      choiceButtons(open),
    ),
  );
}

const backHead = (label: string, title: string, unread: number, onBack: () => void) =>
  h('header', { class: 'app-head back-head' },
    h('button', { class: 'back-btn', onclick: onBack }, `‹ ${label}`, unread > 0 && h('span', { class: 'back-count' }, unread)),
    h('h2', {}, title),
    h('span', {}),
  );

function renderMail() {
  const mails = S.messages.filter((m) => m.app === 'mail').slice().reverse();
  const open = S.messages.find((m) => m.id === S.openMail && m.app === 'mail');
  const list = () => [
    mails.length === 0 ? h('p', { class: 'empty' }, 'Inbox zero. Enjoy it while it lasts.') : null,
    ...mails.map(mailRow),
  ];
  if (isWide()) {
    const detail = open ? mailBody(open) : h('p', { class: 'empty' }, 'Pick an email.');
    return h('div', { class: 'app mail' },
      head('Mail', `${mails.filter((m) => !m.read).length} unread`),
      h('div', { class: 'two-pane' },
        h('div', { class: 'tp-list scroll', 'data-keep': 'mail' }, ...list()),
        h('div', { class: 'tp-detail' }, detail),
      ),
    );
  }
  if (open) {
    const body = mailBody(open);
    return h('div', { class: 'app mail' },
      backHead('Inbox', 'Mail', mails.filter((m) => !m.read).length, () => { S.openMail = null; dirty(); }),
      body,
    );
  }
  return h('div', { class: 'app mail' },
    head('Mail', `${mails.filter((m) => !m.read).length} unread`),
    h('div', { class: 'scroll', 'data-keep': 'mail' }, ...list()),
  );
}

// ── Chat apps (Messages, Huddle): conversations grouped by person ──
/** "Bev (People Ops)", "Voicemail · Mum" and "Gerald Pemberton" thread as Bev, Mum and Gerald. */
const threadKey = (from: string) => from.replace(/^Voicemail · /, '').split(/[\s(]/)[0];
const openThread: Partial<Record<InboxApp, string | null>> = {};

function threadsFor(app: InboxApp) {
  const map = new Map<string, Msg[]>();
  S.messages.forEach((m) => {
    if (m.app !== app) return;
    const k = threadKey(m.from);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(m);
  });
  return [...map.entries()]
    .map(([key, ms]) => ({ key, ms, last: ms[ms.length - 1] }))
    .sort((x, y) => S.messages.indexOf(y.last) - S.messages.indexOf(x.last));
}

function threadRow(app: InboxApp, t: ReturnType<typeof threadsFor>[number], selected: boolean) {
  const unread = t.ms.filter((m) => !m.read).length;
  const pending = t.ms.some((m) => m.choices && m.chosen === undefined);
  const name = t.last.from.replace(/^Voicemail · /, '');
  return h('button', { class: `mail-row thread-row ${unread ? 'unread' : ''} ${selected ? 'sel' : ''}`, onclick: () => { openThread[app] = t.key; dirty(); } },
    face(name, 38),
    h('span', { class: 'mail-row-text' },
      h('span', { class: 'mail-row-top' }, h('b', {}, name), h('span', { class: 'muted small' }, msgTime(t.last))),
      h('span', { class: 'muted small clamp' }, pending ? '⚡ ' : '', t.last.body),
    ),
    unread > 0 && h('span', { class: 'back-count' }, unread),
  );
}

function threadBody(app: InboxApp, msgs: Msg[]) {
  msgs.forEach((m) => (m.read = true));
  return h('div', { class: 'scroll', 'data-keep': `thread-${app}-${threadKey(msgs[0].from)}`, 'data-stick': 'bottom', 'data-count': msgs.length },
    ...msgs.flatMap((m, i) => [
      (i === 0 || (msgs[i - 1].day ?? 0) !== (m.day ?? 0)) ? h('div', { class: 'day-sep' }, dayName(m.day ?? 0)) : null,
      h('div', { class: 'bubble-row' },
        face(m.from),
        h('div', { class: 'bubble-wrap' },
          h('div', { class: 'bubble-meta' }, h('b', {}, m.from), h('span', { class: 'muted small' }, fmt(m.at))),
          h('div', { class: 'bubble' }, m.body),
          choiceButtons(m),
        ),
      ),
    ]),
  );
}

function renderFeed(app: InboxApp, title: string, sub: string) {
  const threads = threadsFor(app);
  let key = openThread[app] ?? null;
  if (key && !threads.some((t) => t.key === key)) key = openThread[app] = null;
  const empty = h('p', { class: 'empty' }, app === 'messages' ? "No texts yet. Your friends think you're busy." : 'Quiet… too quiet.');

  if (isWide()) {
    if (!key && threads[0]) key = threads[0].key;
    const t = threads.find((x) => x.key === key);
    return h('div', { class: `app feed feed-${app}` },
      head(title, sub),
      h('div', { class: 'two-pane' },
        h('div', { class: 'tp-list scroll', 'data-keep': `list-${app}` }, threads.length ? null : empty, ...threads.map((x) => threadRow(app, x, x.key === key))),
        h('div', { class: 'tp-detail' }, t ? threadBody(app, t.ms) : null),
      ),
    );
  }
  const t = key ? threads.find((x) => x.key === key) : undefined;
  if (t) {
    const body = threadBody(app, t.ms);
    const others = threads.filter((x) => x !== t).reduce((n, x) => n + x.ms.filter((m) => !m.read).length, 0);
    return h('div', { class: `app feed feed-${app}` },
      backHead(title, t.last.from.replace(/^Voicemail · /, ''), others, () => { openThread[app] = null; dirty(); }),
      body,
    );
  }
  return h('div', { class: `app feed feed-${app}` },
    head(title, sub),
    h('div', { class: 'scroll', 'data-keep': `list-${app}` }, threads.length ? null : empty, ...threads.map((x) => threadRow(app, x, false))),
  );
}


// Drink builder state: what's been picked so far, and which step is showing.
let bSpec: Partial<DrinkSpec> = {};
let bStep: Step | 'done' = 'base';

function pickOpt(step: Step, id: string) {
  bSpec = { ...bSpec, [step]: id };
  if (step === 'base') {
    // A new base resets the details: the options differ between drinks.
    bSpec = { base: id };
  }
  const steps = stepsFor(bSpec.base!);
  const next = steps.find((st) => bSpec[st] === undefined);
  bStep = next ?? 'done';
  dirty();
}

function builtSpec(): string | null {
  if (!bSpec.base) return null;
  const steps = stepsFor(bSpec.base);
  if (steps.some((st) => bSpec[st] === undefined)) return null;
  return specString({ base: bSpec.base, milk: bSpec.milk ?? 'none', temp: bSpec.temp ?? 'hot', shots: bSpec.shots ?? 'single', sweet: bSpec.sweet ?? 'none' });
}

function renderBuilder() {
  const steps = stepsFor(bSpec.base ?? 'latte');
  const done = builtSpec();
  const crumb = (st: Step) => {
    const v = bSpec[st];
    const o = v ? optionsFor(st, bSpec.base ?? 'latte').find((x) => x.id === v) : null;
    return h('button', { class: `crumb ${bStep === st ? 'on' : ''} ${v ? 'set' : ''}`, disabled: !v && bStep !== st, onclick: () => { bStep = st; dirty(); } },
      h('small', {}, STEP_LABEL[st]), h('span', {}, o ? `${o.emoji ?? ''} ${o.name}` : '—'));
  };
  const QUESTION: Record<Step, string> = { base: 'What are we making?', milk: 'Milk?', temp: 'How hot?', shots: 'How many shots?', sweet: 'Anything sweet?' };
  return h('div', { class: 'builder' },
    h('div', { class: 'crumbs' }, ...(bSpec.base ? steps : (['base'] as Step[])).map(crumb)),
    bStep !== 'done'
      ? h('div', {},
          h('div', { class: 'builder-q' }, QUESTION[bStep]),
          h('div', { class: 'opt-grid' }, ...optionsFor(bStep, bSpec.base ?? 'latte').map((o) =>
            h('button', { class: `opt ${bSpec[bStep as Step] === o.id ? 'on' : ''}`, onclick: () => pickOpt(bStep as Step, o.id) },
              h('span', { class: 'opt-emoji' }, o.emoji ?? ''), h('b', {}, o.name),
              o.price ? h('span', { class: 'muted small' }, `${bStep === 'base' ? '' : '+'}$${o.price}`) : null))))
      : done && h('div', { class: 'built' },
          h('div', { class: 'built-name' }, h('span', { class: 'opt-emoji' }, drinkEmoji(done)), h('b', {}, drinkName(done))),
          h('div', { class: 'built-actions' },
            h('button', { class: 'btn primary', onclick: () => orderDrink(done, brewFor, brewAt) }, `Order · $${drinkPrice(done)}`),
            h('button', { class: `btn ${S.savedDrinks.includes(done) ? 'saved' : ''}`, onclick: () => toggleSavedDrink(done) }, S.savedDrinks.includes(done) ? '★ Saved' : '☆ Save'),
            h('button', { class: 'btn ghost', onclick: () => { bSpec = {}; bStep = 'base'; dirty(); } }, 'New drink'),
          ),
        ),
  );
}

let brewFor: string = 'margo';
let brewAt: number | null = null; // null = ASAP

function renderBrew() {
  const execs = activeExecs().filter(isBoss);
  if (brewFor !== 'me' && !execs.includes(brewFor as ExecId)) brewFor = execs[0];
  const known = (x: ExecId) => S.flags.includes(`drink-${x}`);
  const orders = S.orders.filter((o) => o.app === 'brew').slice().reverse();
  return h('div', { class: 'app brew' },
    head('Brew', 'Coffee, delivered in 15 min'),
    h('div', { class: 'scroll', 'data-keep': 'brew' },
      h('div', { class: 'seg' },
        ...[...execs, 'me'].map((x) => h('button', { class: `seg-btn ${brewFor === x ? 'on' : ''}`, onclick: () => { brewFor = x; dirty(); } },
          x === 'me' ? '🙋 Me' : `${EXECS[x as ExecId].emoji} ${EXECS[x as ExecId].short}`)),
      ),
      brewFor !== 'me' && h('p', { class: 'muted small hintline' }, known(brewFor as ExecId) ? `📝 Notes say: ${drinkName(EXECS[brewFor as ExecId].drink)}` : "📝 You don't know their order yet. Listen for clues… or guess."),
      (() => {
        const min = earliestDelivery();
        if (brewAt !== null && brewAt < min) brewAt = null;
        const step = (d: number) => {
          const base = brewAt ?? Math.ceil(min / 15) * 15;
          const next = base + d;
          brewAt = next <= min ? null : Math.min(next, DAY_END - 15);
          dirty();
        };
        return h('div', { class: 'deliver' },
          h('span', { class: 'small muted' }, 'Deliver'),
          h('button', { class: 'btn', onclick: () => step(-15), disabled: brewAt === null }, '−15'),
          h('b', {}, brewAt === null ? `ASAP (${fmt(min)})` : fmt(brewAt)),
          h('button', { class: 'btn', onclick: () => step(15) }, '+15'),
        );
      })(),
      S.savedDrinks.length > 0 && h('h4', {}, '★ Saved orders'),
      ...S.savedDrinks.map((sp) => h('div', { class: 'saved-drink' },
        h('span', { class: 'opt-emoji' }, drinkEmoji(sp)),
        h('span', { class: 'saved-name' }, drinkName(sp)),
        h('button', { class: 'btn primary', onclick: () => orderDrink(sp, brewFor, brewAt) }, `Order $${drinkPrice(sp)}`),
        h('button', { class: 'btn', title: 'Remove', onclick: () => toggleSavedDrink(sp) }, '✕'),
      )),
      h('h4', {}, 'Build a drink'),
      renderBuilder(),
      orders.length > 0 && h('h4', {}, 'Orders'),
      ...orders.map((o) => h('div', { class: 'order-row' },
        h('span', {}, `${drinkEmoji(o.item)} ${o.label}`),
        h('span', { class: 'muted small' }, `→ ${o.to === 'me' ? 'you' : EXECS[o.to as ExecId].short} · ${o.arrived ? 'delivered' : `arrives ${fmt(o.arriveAt)}`}`))),
    ),
  );
}

function renderBundl() {
  const orders = S.orders.filter((o) => o.app === 'bundl').slice().reverse();
  return h('div', { class: 'app bundl' },
    head('Bundl', 'Everything. Delivered. Eventually.'),
    h('div', { class: 'scroll', 'data-keep': 'bundl' },
      h('div', { class: 'search' }, '🔍 Search Bundl'),
      h('div', { class: 'product-grid' },
        ...PRODUCTS.map((p) => h('button', { class: 'product', onclick: () => { S.sheet = { productId: p.id, to: null, pay: 'company' }; dirty(); } },
          h('span', { class: 'product-emoji' }, p.emoji),
          h('b', {}, p.name),
          h('span', { class: 'muted small' }, p.desc),
          h('span', { class: 'price' }, `$${p.price}`)))),
      orders.length > 0 && h('h4', {}, 'Your orders'),
      ...orders.map((o) => h('div', { class: 'order-row' },
        h('span', {}, `${PRODUCTS.find((p) => p.id === o.item)?.emoji} ${o.label}`),
        h('span', { class: 'muted small' }, `→ ${o.to === 'me' ? 'you' : o.to} · ${o.arrived ? 'delivered' : `arrives ${fmt(o.arriveAt)}`}`))),
    ),
  );
}

function renderCard$() {
  const v = S.meters.runway;
  const days = Math.max(0, Math.floor(v / PAYROLL));
  return h('div', { class: 'app cardapp' },
    head('Card', 'Sproutly company card'),
    h('div', { class: 'scroll', 'data-keep': 'card' },
      h('div', { class: 'credit-card' },
        h('div', { class: 'cc-top' }, h('span', {}, 'SPROUTLY'), h('span', {}, '🌱')),
        h('div', { class: 'cc-bal' }, fmtMoney(v)),
        h('div', { class: 'cc-sub' }, `≈ ${days} days of payroll left`),
        h('div', { class: 'cc-num' }, '•••• •••• •••• 4040'),
      ),
      h('h4', {}, 'Recent'),
      S.ledger.length === 0 ? h('p', { class: 'empty' }, 'No spending yet. Finance is suspicious.') : null,
      ...S.ledger.slice(0, 30).map((l) => h('div', { class: 'order-row' }, h('span', {}, l.label), h('b', { class: l.amount < 0 ? 'neg' : 'pos' }, fmtMoney(l.amount)))),
    ),
  );
}

function renderNotes() {
  const d = day();
  return h('div', { class: 'app notes' },
    head('Notes', 'Your survival guide'),
    h('div', { class: 'scroll', 'data-keep': 'notes' },
      h('h4', {}, 'To-do'),
      S.tasks.length === 0 ? h('p', { class: 'muted small' }, 'Nothing yet. Enjoy it.') : null,
      ...S.tasks.map((t) => h('div', { class: `task ${t.status}` }, h('span', {}, t.status === 'done' ? '✅' : t.status === 'failed' ? '❌' : '⬜'), h('span', {}, t.text, h('small', { class: 'muted' }, ` · by ${fmt(t.deadline)}`)))),
      h('h4', {}, "Today's rules"),
      ...d.rules.map((r) => h('div', { class: 'rule' }, '📌 ', RULES[r].text)),
      h('h4', {}, 'Dossier'),
      ...activeExecs().filter(isBoss).map((x) => {
        const e = EXECS[x];
        return h('div', { class: 'dossier', style: `--c:${e.color}` },
          h('div', { class: 'dossier-head' }, face(x, 32), h('div', {}, h('b', {}, e.name), h('div', { class: 'muted small' }, e.title))),
          h('div', { class: 'small' }, '☕ ', S.flags.includes(`drink-${x}`) ? drinkName(e.drink) : '??? (listen for clues)'),
          ...e.quirks.map((q) => h('div', { class: 'small' }, '• ', q)),
        );
      }),
    ),
  );
}

function renderRyde() {
  const trips = S.events.filter((e) => e.travel && e.start !== null && ['scheduled', 'running', 'done'].includes(e.status) && (!e.remote || e.withRide)).sort((a, b) => a.start! - b.start!);
  return h('div', { class: 'app ryde' },
    head('Ryde', 'Cars for off-site meetings'),
    h('div', { class: 'scroll', 'data-keep': 'ryde' },
      h('div', { class: 'ryde-map' }, '🗺️ 🚕 · · · · 📍'),
      trips.length === 0 ? h('p', { class: 'empty' }, 'No off-site meetings booked today.') : null,
      ...trips.map((e) => h('div', { class: 'order-row' },
        h('span', {}, h('b', {}, e.title), h('div', { class: 'small muted' }, `${e.place ?? 'Off-site'} · leave ${fmt(e.start! - (e.travel ?? 0))}${e.remote ? ' · remote now' : ''}${rideStale(e) ? ` · ⚠️ ride booked to ${e.rideTo}` : ''}`)),
        rideUnneeded(e) && e.status === 'scheduled' ? h('button', { class: 'btn warn', onclick: () => toggleAddon(e.id, 'ride') }, 'Cancel (remote now)')
          : e.remote ? h('span', { class: 'small muted' }, '💻 no ride needed')
          : rideStale(e) && e.status === 'scheduled' && !e.departed ? h('button', { class: 'btn warn', onclick: () => toggleAddon(e.id, 'ride') }, 'Update address')
          : e.departed || e.status !== 'scheduled' ? h('span', { class: 'small muted' }, e.withRide ? '✓ rode' : 'took a cab')
          : h('button', { class: `btn ${e.withRide ? '' : 'primary'}`, onclick: () => toggleAddon(e.id, 'ride') }, e.withRide ? '✓ Booked' : `Book $${RIDE_COST * 2}`)))),
  );
}

let tablyParty = 4;

function renderTably() {
  const open = S.tasks.filter((x) => x.kind === 'reservation');
  return h('div', { class: 'app tably' },
    head('Tably', 'Tonight'),
    h('div', { class: 'scroll', 'data-keep': 'tably' },
      ...open.map((x) => h('div', { class: `task ${x.status}` }, h('span', {}, x.status === 'done' ? '✅' : x.status === 'failed' ? '❌' : '⬜'), h('span', {}, x.text))),
      h('div', { class: 'seg' }, ...[2, 4, 6].map((n) => h('button', { class: `seg-btn ${tablyParty === n ? 'on' : ''}`, onclick: () => { tablyParty = n; dirty(); } }, `👥 ${n}`))),
      ...RESTAURANTS.map((r) => h('div', { class: 'resto' },
        h('div', { class: 'resto-head' }, h('span', { class: 'product-emoji' }, r.emoji), h('div', {}, h('b', {}, r.name), h('div', { class: 'small muted' }, r.blurb))),
        h('div', { class: 'slots' }, ...TABLE_TIMES.map((tm) => {
          const mine = bookings.some((b) => b.restaurant === r.id && b.time === tm);
          const taken = slotTaken(r.id, tm);
          return h('button', { class: `slot ${mine ? 'mine' : taken ? 'taken' : ''}`, disabled: taken, onclick: () => bookTable(r.id, tm, tablyParty) }, mine ? `✓ ${fmt(tm)}` : fmt(tm));
        })),
      )),
    ),
  );
}

let pfKind: 'coffee' | 'gift' | 'ride' = 'coffee';
let pfRide: RideAction = 'book';
let pfTo: ExecId = 'theo';
let pfDrink = '';
let pfProduct = '';
let pfPay: 'company' | 'me' = 'company';

function renderPresto() {
  const full = S.shortcuts.length >= MAX_SHORTCUTS;
  const kinds = (['coffee', 'gift', 'ride'] as const).filter((k) => k === 'coffee' || (k === 'gift' ? hasApp('bundl') : hasApp('ryde')));
  if (!kinds.includes(pfKind)) pfKind = 'coffee';
  const gifts = PRODUCTS;
  if (!pfProduct) pfProduct = gifts[0].id;
  const draft = pfKind === 'coffee' ? { kind: 'coffee' as const, drink: pfDrink, to: pfTo } : pfKind === 'gift' ? { kind: 'gift' as const, product: pfProduct, pay: pfPay } : { kind: 'ride' as const, action: pfRide, to: pfTo };
  const dupe = S.shortcuts.some((s) => shortcutLabel(s) === shortcutLabel(draft));
  return h('div', { class: 'app presto' },
    head('Presto', `Shortcuts · ${S.shortcuts.length}/${MAX_SHORTCUTS} slots`),
    h('div', { class: 'scroll', 'data-keep': 'presto' },
      S.shortcuts.length === 0 ? h('p', { class: 'empty' }, 'No shortcuts yet. Set some up now, and when a request lands you\'ll get a one-tap ⚡ button.') : null,
      ...S.shortcuts.map((sc) => h('div', { class: 'shortcut' },
        h('span', { class: 'sc-label' }, shortcutLabel(sc)),
        h('button', { class: 'btn primary', onclick: () => runShortcut(sc) }, '▶ Run'),
        h('button', { class: 'btn', onclick: () => removeShortcut(sc.id!) }, '✕'),
      )),
      h('h4', {}, 'New shortcut'),
      h('div', { class: 'seg' }, ...kinds.map((k) => h('button', { class: `seg-btn ${pfKind === k ? 'on' : ''}`, onclick: () => { pfKind = k; dirty(); } }, k === 'coffee' ? '☕ Coffee' : k === 'gift' ? '📦 Gift' : '🚕 Ride'))),
      pfKind === 'coffee' && h('div', { class: 'sc-build' },
        h('div', { class: 'seg' }, ...(Object.keys(EXECS) as ExecId[]).filter((x) => isBoss(x) && (DAYS.slice(0, S.dayIndex + 1).some((d) => d.execs.includes(x)) || S.endless)).map((x) =>
          h('button', { class: `seg-btn ${pfTo === x ? 'on' : ''}`, onclick: () => { pfTo = x; dirty(); } }, `${EXECS[x].emoji} ${EXECS[x].short}`))),
        (() => {
          const usual = S.flags.includes(`drink-${pfTo}`) ? EXECS[pfTo].drink : null;
          const choices = [...new Set([...(usual ? [usual] : []), ...S.savedDrinks])];
          if (pfDrink && !choices.includes(pfDrink)) pfDrink = '';
          return choices.length
            ? h('div', { class: 'slots' }, ...choices.map((sp) => h('button', { class: `slot ${pfDrink === sp ? 'mine' : ''}`, onclick: () => { pfDrink = sp; dirty(); } }, `${drinkEmoji(sp)} ${drinkName(sp)}${sp === usual ? ' (their usual)' : ''}`)))
            : h('p', { class: 'muted small' }, '☆ Save a drink in Brew first, then make it a shortcut here.');
        })(),
        h('p', { class: 'muted small' }, S.flags.includes(`drink-${pfTo}`) ? `📝 Notes say ${EXECS[pfTo].short} drinks: ${drinkName(EXECS[pfTo].drink)}` : `📝 You don't know ${EXECS[pfTo].short}'s order yet.`),
      ),
      pfKind === 'gift' && h('div', { class: 'sc-build' },
        h('div', { class: 'slots' }, ...gifts.map((p) => h('button', { class: `slot ${pfProduct === p.id ? 'mine' : ''}`, onclick: () => { pfProduct = p.id; dirty(); } }, `${p.emoji} ${p.name} $${p.price}`))),
        h('div', { class: 'seg' }, ...(['company', 'me'] as const).map((p) => h('button', { class: `seg-btn ${pfPay === p ? 'on' : ''}`, onclick: () => { pfPay = p; dirty(); } }, p === 'company' ? '💳 Company card' : '🙋 My card'))),
        h('p', { class: 'muted small' }, 'Sends to whoever is waiting on a gift.'),
      ),
      pfKind === 'ride' && h('div', { class: 'sc-build' },
        h('div', { class: 'seg' }, ...(Object.keys(EXECS) as ExecId[]).filter((x) => isBoss(x) && (DAYS.slice(0, S.dayIndex + 1).some((d) => d.execs.includes(x)) || S.endless)).map((x) =>
          h('button', { class: `seg-btn ${pfTo === x ? 'on' : ''}`, onclick: () => { pfTo = x; dirty(); } }, `${EXECS[x].emoji} ${EXECS[x].short}`))),
        h('div', { class: 'seg' }, ...(['book', 'reroute', 'cancel'] as RideAction[]).map((a) =>
          h('button', { class: `seg-btn ${pfRide === a ? 'on' : ''}`, onclick: () => { pfRide = a; dirty(); } }, a === 'book' ? '🚕 Book' : a === 'reroute' ? '🔁 Re-route' : '✖️ Cancel'))),
        h('p', { class: 'muted small' }, pfRide === 'book' ? 'Books one ride for their next trip that needs one.' : pfRide === 'reroute' ? 'Points one ride at a meeting\'s new address.' : 'Cancels one ride for a meeting that went remote.'),
      ),
      h('button', { class: 'btn primary wide', disabled: full || dupe || (pfKind === 'coffee' && !pfDrink), onclick: () => addShortcut(draft) }, full ? 'All slots used' : dupe ? 'Already saved' : pfKind === 'coffee' && !pfDrink ? 'Pick a drink' : `Save: ${shortcutLabel(draft)}`),
    ),
  );
}

// ───────────────────────────── overlays ─────────────────────────────
function renderOverlay(): HTMLElement | null {
  if (S.phase === 'title') return renderTitle();
  if (S.phase === 'memo') return renderMemo();
  if (S.phase === 'review') return renderReview();
  if (S.phase === 'over') return renderOver();
  if (S.phase === 'end') return renderEnd();
  if (S.call) return renderCall();
  if (calSheet) return renderCalSheet();
  if (S.sheet) return renderSheet();
  return null;
}

function renderTitle() {
  const save = readSave();
  return h('div', { class: 'card-screen title-screen' },
    h('div', { class: 'logo' }, '📅'),
    h('h1', {}, 'Double Booked'),
    h('p', { class: 'tagline' }, `${DAYS.length} days of probation. Weekends included. Zero right answers.`),
    h('div', { class: 'stack' },
      save && save.dayIndex > 0 && h('button', { class: 'btn primary big', onclick: continueGame }, `Continue · ${save.endless ? 'Endless ' : ''}Day ${save.dayIndex + 1}`),
      h('button', { class: `btn ${save && save.dayIndex > 0 ? '' : 'primary'} big`, onclick: newGame }, 'New game'),
      h('button', { class: 'btn big', onclick: newEndless }, '♾️ Endless mode'),
    ),
    h('p', { class: 'muted small' }, 'Endless: every app, no story, a new random day forever.'),
  );
}

function renderMemo() {
  const d = day();
  return h('div', { class: 'card-screen memo framed' },
    h('div', { class: 'cs-head' },
      h('div', { class: 'eyebrow' }, dayLabel()),
      h('h1', {}, d.title),
      h('p', { class: 'tagline' }, d.subtitle),
    ),
    h('div', { class: 'cs-body', 'data-keep': 'memo' },
    h('div', { class: 'memo-mail' },
      h('div', { class: 'muted small' }, `From: ${d.memo.from}`),
      h('b', {}, d.memo.subject),
      h('p', {}, d.memo.body),
    ),
    d.apps.length > 0 && h('div', { class: 'new-apps' },
      h('h4', {}, S.dayIndex === 0 ? 'Your apps' : '📲 New apps unlocked'),
      ...APPS.filter((a) => d.apps.includes(a.id)).map((a) =>
        h('div', { class: 'new-app' }, h('span', { class: 'app-icon sm', style: `background:${a.color}` }, a.icon), h('div', {}, h('b', {}, a.name), h('div', { class: 'small muted' }, a.desc))))),
    (() => {
      const prev = S.dayIndex > 0 ? dayAt(S.dayIndex - 1).execs : [];
      const fresh = d.execs.filter((x) => !prev.includes(x));
      return fresh.length > 0 && h('div', { class: 'new-apps' },
        h('h4', {}, S.dayIndex === 0 ? 'Your calendars' : '📅 New calendar to manage'),
        ...fresh.map((x) => h('div', { class: 'new-app' }, x === 'team' ? h('span', { class: 'avatar', style: `--c:${EXECS[x].color}` }, EXECS[x].emoji) : face(x, 36),
          h('div', {}, h('b', {}, `${EXECS[x].name} · ${EXECS[x].title}`), h('div', { class: 'small muted' }, EXECS[x].quirks[0])))));
    })(),
    d.rules.length > 0 && h('div', { class: 'rules' }, h('h4', {}, "Today's rules"), ...d.rules.map((r) => h('div', { class: 'rule' }, '📌 ', RULES[r].text))),
    ),
    h('div', { class: 'cs-foot' },
      h('button', { class: 'btn primary big', onclick: startPrep }, d.weekend ? 'Start the weekend 🌴' : "Let's go →"),
    ),
  );
}

function renderReview() {
  const r = S.review!;
  const row = (m: Meter) => {
    const v = r.deltas[m];
    return h('div', { class: 'delta-row' }, h('span', {}, METER_ICON[m], ' ', METER_LABEL[m]),
      h('b', { class: v === 0 ? '' : isGood(m, v) ? 'pos' : 'neg' }, v === 0 ? '—' : fmtEffect(m, v).replace(` ${METER_LABEL[m]}`, '')));
  };
  const last = S.dayIndex + 1 >= DAYS.length && !S.endless;
  const wk = day().weekend;
  return h('div', { class: 'card-screen review framed' },
    h('div', { class: 'cs-head' },
      h('div', { class: 'eyebrow' }, `End of ${dayLabel()}`),
      h('h1', {}, wk ? (day().weekday === 'Sat' ? 'Saturday, done.' : 'Sunday night. Rested-ish.') : '6:00pm. You survived.'),
    ),
    h('div', { class: 'cs-body', 'data-keep': 'review' },
    h('div', { class: 'boss-note' }, face('margo', 36), h('div', {}, h('b', {}, 'Margo'), h('div', {}, r.bossNote))),
    h('div', { class: 'deltas' }, ...(['standing', 'runway', 'morale', 'stress'] as Meter[]).map(row)),
    r.highlights.length > 0 && h('h4', {}, 'Highlights'),
    ...r.highlights.map((l) => h('div', { class: 'highlight' }, h('span', { class: 'muted small' }, fmt(l.at)), h('span', {}, l.text),
      h('span', { class: 'fx' }, ...(Object.entries(l.effects) as [Meter, number][]).filter(([, v]) => v).map(([m, v]) => h('span', { class: isGood(m, v) ? 'pos' : 'neg' }, fmtEffect(m, v)))))),
    ...r.notes.map((n) => h('p', { class: 'small note' }, '🌙 ', n)),
    ...r.newStrikes.map((n) => h('div', { class: 'strike-note' }, '📅 "Quick chat? 🙂" — strike! ', n)),
    h('div', { class: 'strikes big' }, ...[0, 1, 2].map((i) => h('span', { class: i < S.strikes ? 'on' : '' }, '✕'))),
    ),
    h('div', { class: 'cs-foot' },
      h('button', { class: 'btn primary big', onclick: nextDay }, last ? 'The verdict →' : `Sleep. ${dayAtLabel(S.dayIndex + 1)} →`),
    ),
  );
}

const OVER: Record<string, [string, string, string]> = {
  strikes: ['📅', 'Three strikes.', 'Margo booked a 15-minute "Quick chat 🙂" with HR on the line. You know what this is.'],
  fired: ['📦', "You're fired.", "Margo says it's \"not a culture fit\". Your desk plant is coming with you."],
  folded: ['🪦', 'Sproutly folded.', 'The money ran out. The plants will never be heard again. You still have to update LinkedIn.'],
  mutiny: ['🔥', 'Team mutiny.', 'Nobody will help you anymore. Wren changed the Huddle channel name to #we-need-to-talk-about-the-ea.'],
  burnout: ['🫠', 'Burnout.', 'You quietly closed the laptop, walked into the sea, and opened a sandwich shop. Honestly? Good for you.'],
};

function renderOver() {
  const [icon, title, body] = OVER[S.overReason ?? 'fired'];
  return h('div', { class: 'card-screen over' },
    h('div', { class: 'logo' }, icon),
    h('h1', {}, title),
    h('p', {}, body),
    h('p', { class: 'muted small' }, S.endless ? `You lasted until Day ${S.dayIndex + 1}.` : `${dayLabel()}.`),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary big', onclick: retryDay }, `Retry Day ${S.dayIndex + 1}`),
      h('button', { class: 'btn big', onclick: newGame }, 'Start over'),
    ),
  );
}

function epilogue(): string[] {
  const f = (x: string) => S.flags.includes(x);
  const out: string[] = [];
  out.push(f('funded') ? '💸 Kestrel invested. Sproutly lives to talk to plants another year.' : '🥀 Kestrel passed. Sproutly is "exploring options". Sam was restructured.');
  out.push(f('margo-ousted') ? '🌱 Margo is "Chief Visionary Officer" now. She has a new title and no calendar. She calls you anyway.' : f('honest-gerald') ? '🌱 Margo stayed, with a COO. She pretends to hate it.' : '🌱 Margo is still CEO. She has no idea how close it was.');
  out.push(f('theo-leaves') ? '🛠️ Theo works at Leafly now. He still sends you a black coffee every Friday.' : '🛠️ Theo stayed. His focus block is still sacred. You are the only one allowed near it.');
  if (f('missed-birthday')) out.push(f('apologized') ? '❤️ Jules forgave the birthday. Mostly. It comes up.' : "💔 Jules hasn't really forgiven the birthday.");
  else if (f('went-birthday')) out.push("❤️ Jules still talks about the birthday at Lucca's.");
  if (f('wren-quits')) out.push('🎨 Wren left to make logos for a kombucha brand. Margo is their first customer.');
  if (f('lied-to-sam') && !f('funded')) out.push('😬 Sam found out you knew. Sam has unfollowed you on everything.');
  if (f('leafly-you')) out.push('📞 Leafly still calls you. Every quarter. Like clockwork.');
  out.push(f('gone-dana') ? '📋 Dana left the day of the vote. Her agendas are still in the shared drive. Unread.' : f('honest-gerald') ? '📋 Dana is permanent COO. She and Margo book separate rooms.' : '📋 Dana is still "interim". Nobody knows what that means anymore.');
  if (f('kendall-reported') && f('kendall-sabotaged')) out.push('🗂️ Kendall works on "special projects" now. The printer is very well organised.');
  else if (f('kendall-sabotaged')) out.push('🗂️ Kendall is still your "backup". Watch the calendar.');
  out.push(f('got-flat') ? '🏠 You and Jules got the flat. It has a bath. You have used it twice.' : f('signed-flat') ? '🏠 You missed the lease signing. Someone else has the flat with the bath.' : '🏠 You and Jules are still flat-hunting. Ollie has moved into a van.');
  if (!f('called-mum')) out.push("📞 You call Mum every Thursday now. You've only missed one.");
  return out;
}

function renderEnd() {
  const m = S.meters;
  const fired = m.standing < 40;
  const [icon, title, body] =
    m.standing >= 60 ? ['🎉', "You're hired. Permanently.", 'Margo signed the form with a glitter pen. Bev cried a little. You get a desk plant that talks.']
    : !fired ? ['😅', 'Probation… extended.', "Another 14 days. Bev is very sorry. Margo says you're \"almost there\", which is what she says about the product."]
    : ['📦', "We're letting you go. Nicely.", "Margo says it's not you, it's the calendar. It's a bit you. Your desk plant is coming with you."];
  return h('div', { class: 'card-screen end framed' },
    h('div', { class: 'cs-head' },
      h('div', { class: 'eyebrow' }, 'Probation review'),
      h('div', { class: 'logo' }, icon),
      h('h1', {}, title),
    ),
    h('div', { class: 'cs-body', 'data-keep': 'end' },
    h('p', {}, body),
    h('h4', {}, 'What happened next'),
    ...epilogue().map((e) => h('p', { class: 'small note' }, e)),
    h('div', { class: 'deltas' },
      h('div', { class: 'delta-row' }, h('span', {}, '⭐ Standing'), h('b', {}, Math.round(m.standing))),
      h('div', { class: 'delta-row' }, h('span', {}, '💸 Runway'), h('b', {}, fmtMoney(m.runway))),
      h('div', { class: 'delta-row' }, h('span', {}, '🤝 Morale'), h('b', {}, Math.round(m.morale))),
      h('div', { class: 'delta-row' }, h('span', {}, '😰 Stress'), h('b', {}, Math.round(m.stress))),
      h('div', { class: 'delta-row' }, h('span', {}, '✕ Strikes'), h('b', {}, `${S.strikes}/3`)),
    ),
    ),
    h('div', { class: 'cs-foot stack' },
      !fired && h('button', { class: 'btn primary big', onclick: continueEndless }, '♾️ Keep going (endless)'),
      h('button', { class: `btn ${fired ? 'primary' : ''} big`, onclick: newGame }, 'Play again'),
    ),
  );
}

function renderCall() {
  const c = S.call!;
  if (c.status === 'ringing') {
    return h('div', { class: 'call ringing' },
      face(c.from, 96, 'call-face') ?? h('div', { class: 'call-avatar' }, c.from[0]),
      h('h2', {}, c.from),
      h('p', { class: 'muted' }, `Incoming call… (${Math.max(0, c.ringUntil - S.now)} min)`),
      h('div', { class: 'call-btns' },
        h('button', { class: 'round decline', onclick: declineCall }, '✕'),
        h('button', { class: 'round answer', onclick: answerCall }, '✆'),
      ),
    );
  }
  return h('div', { class: 'call active' },
    face(c.from, 64, 'call-face') ?? h('div', { class: 'call-avatar small' }, c.from[0]),
    h('h3', {}, c.from),
    h('div', { class: 'call-lines' }, ...c.lines.map((l) => h('p', {}, l))),
    h('div', { class: 'stack' }, ...c.choices.map((ch, i) => h('button', { class: 'btn choice', onclick: () => chooseCall(i) }, ch.label))),
  );
}

let calSheet = false;

/** Calendars in your chosen order, minus hidden ones. */
function visibleExecs(): ExecId[] {
  const active = activeExecs();
  const order = [...S.calPrefs.order.filter((x) => active.includes(x)), ...active.filter((x) => !S.calPrefs.order.includes(x))];
  const shown = order.filter((x) => !S.calPrefs.hidden.includes(x));
  return shown.length ? shown : order.slice(0, 1);
}

function renderCalSheet() {
  const active = activeExecs();
  const order = [...S.calPrefs.order.filter((x) => active.includes(x)), ...active.filter((x) => !S.calPrefs.order.includes(x))];
  const move = (i: number, d: number) => {
    const o = [...order];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    S.calPrefs.order = o;
    saveCalPrefs();
    dirty();
  };
  const toggle = (x: ExecId) => {
    const hid = S.calPrefs.hidden;
    S.calPrefs.hidden = hid.includes(x) ? hid.filter((y) => y !== x) : [...hid, x];
    saveCalPrefs();
    dirty();
  };
  const close = () => { calSheet = false; dirty(); };
  return h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-grab' }),
      h('h3', {}, 'Calendars'),
      h('p', { class: 'muted small' }, 'Show, hide and reorder. Hidden calendars still happen. You just can\'t see them.'),
      ...order.map((x, i) => {
        const hidden = S.calPrefs.hidden.includes(x);
        return h('div', { class: `cal-pref ${hidden ? 'off' : ''}` },
          x === 'team' ? h('span', { class: 'avatar', style: `--c:${EXECS[x].color}` }, EXECS[x].emoji) : face(x, 32),
          h('span', { class: 'cal-pref-name' }, h('b', {}, EXECS[x].short), h('small', { class: 'muted' }, EXECS[x].title)),
          h('button', { class: 'btn', disabled: i === 0, onclick: () => move(i, -1), title: 'Move up' }, '↑'),
          h('button', { class: 'btn', disabled: i === order.length - 1, onclick: () => move(i, 1), title: 'Move down' }, '↓'),
          h('button', { class: `btn ${hidden ? '' : 'primary'}`, onclick: () => toggle(x) }, hidden ? 'Show' : 'Shown'),
        );
      }),
      h('div', { class: 'stack' }, h('button', { class: 'btn primary big', onclick: close }, 'Done')),
    ),
  );
}

function renderSheet() {
  const sh = S.sheet!;
  const p = PRODUCTS.find((x) => x.id === sh.productId)!;
  const gifts = S.tasks.filter((t) => t.status === 'open' && t.kind === 'gift' && t.recipient);
  const recipients = [...gifts.map((t) => t.recipient!), 'me'];
  const personal = sh.to === 'me' || gifts.some((t) => t.recipient === sh.to && t.personal);
  if (!personal && sh.pay === 'me') sh.pay = 'company';
  return h('div', { class: 'sheet-wrap', onclick: (e: Event) => { if (e.target === e.currentTarget) { S.sheet = null; dirty(); } } },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-grab' }),
      h('div', { class: 'sheet-product' }, h('span', { class: 'product-emoji' }, p.emoji), h('div', {}, h('b', {}, p.name), h('div', { class: 'price' }, `$${p.price}`))),
      h('h4', {}, 'Send to'),
      h('div', { class: 'seg wrap' }, ...recipients.map((r) => h('button', { class: `seg-btn ${sh.to === r ? 'on' : ''}`, onclick: () => { sh.to = r; dirty(); } }, r === 'me' ? '🙋 Me' : `🎁 ${r}`))),
      personal && h('h4', {}, 'Pay with'),
      personal && h('div', { class: 'seg' },
        h('button', { class: `seg-btn ${sh.pay === 'company' ? 'on' : ''}`, onclick: () => { sh.pay = 'company'; dirty(); } }, '💳 Company card'),
        h('button', { class: `seg-btn ${sh.pay === 'me' ? 'on' : ''}`, onclick: () => { sh.pay = 'me'; dirty(); } }, '👛 My own card'),
      ),
      personal && sh.pay === 'company' && sh.to !== 'me' && h('p', { class: 'small warn' }, "🤫 Nobody checks these… right?"),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary big', disabled: !sh.to, onclick: () => sh.to && buyProduct(p.id, sh.to, sh.pay) }, sh.to ? `Buy · $${p.price}` : 'Choose a recipient'),
        h('button', { class: 'btn ghost', onclick: () => { S.sheet = null; dirty(); } }, 'Cancel'),
      ),
    ),
  );
}
