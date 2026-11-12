import { DAYS, dayAt } from './days';
import { STEP_LABEL, drinkEmoji, drinkName, drinkPrice, optionsFor, specString, stepsFor, type DrinkSpec, type Step } from './drinks';
import { CAL_END, CAL_START, DAY_END, DAY_START, EXECS, isBoss, PAYROLL, PRODUCTS, RESTAURANTS, RIDE_COST, RULES, TABLE_TIMES, fmt } from './data';
import {
  answerCall, buyProduct, choose, chooseCall, continueGame, day, declineCall, declineEvent, findEvent, issuesFor,
  minStart, newGame, nextDay, hasApp, isNewApp, myMeeting, stepOut, meterEffects, runwayDays, cardFrozen, stressPace, activeExecs, toggleSavedDrink, newEndless, continueEndless, rideStale, rideUnneeded, bookTable, slotTaken, bookings, earliestDelivery, toggleAddon, canAddons, addonCost, travelOf, autoPlace, nudgeStart, canBump, canResize, canWrap, bumpEvent, bumpPenaltyFor, resizeEvent, wrapUpNow, openApp, orderDrink, placeEvent, retryDay, select, startDay, startPrep, resume, clockGlide, derivedTodos, doPromise, payInvoice, canCater,
  toggleSpeed, scheduleAllTickets, bookAllRequests, unschedule, whereOf, atOffice, placeLabel, padBefore, padAfter, canBuffer, setBuffer, scheduleTicket, ticketBlock, toggleAttendee, canEditAttendees, skippedFrom, findFuture, unbookFuture, lastViewDay, dayDate, isWeekendDay,
} from './engine';
import { avatarEl } from './avatars';
import { coffeeOf, metPeople, statusOf } from './people';
import { PRIORITY_LABEL } from './tickets';
import { play, soundOn, toggleSound } from './sound';
import { MAX_SHORTCUTS, addShortcut, removeShortcut, runShortcut, shortcutLabel } from './shortcuts';
import { saveCalPrefs, relOf, relWord, relMult, PERSONAL } from './state';
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
  { id: 'trellis', name: 'Trellis', icon: '🎫', color: '#0f9d7a', desc: 'Tickets. Book people heads-down time to do them.' },
  { id: 'tably', name: 'Tably', icon: '🍽️', color: '#e8505b', desc: 'Restaurant reservations. Good luck at 7pm.' },
];

const PX = 1.25; // pixels per minute on the calendar
const split = window.matchMedia('(min-width: 820px)');
split.addEventListener('change', () => dirty());

// ───────────────────────────── skeleton ─────────────────────────────
let refs: {
  device: HTMLElement; status: HTMLElement; meters: HTMLElement; main: HTMLElement; dock: HTMLElement;
  banners: HTMLElement; toasts: HTMLElement; overlay: HTMLElement; waiting: HTMLElement;
};

export function mountUI(root: HTMLElement) {
  // The phone trills while a call is ringing
  setInterval(() => { if (S.phase === 'day' && !S.paused && S.call?.status === 'ringing') play('ring'); }, 1600);
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
    waiting: h('div', { class: 'waiting-wrap' }),
  };
  device.append(refs.status, refs.meters, refs.main, refs.dock, refs.banners, refs.toasts, refs.waiting, refs.overlay);
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
        if (!split.matches && prev !== undefined) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
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

let lastWhere = '';

/** Play a closed sidecar's exit: keep the old element on screen for a moment, sliding away. */
function slideOut(el: HTMLElement, rect: DOMRect, isSplit: boolean) {
  el.querySelectorAll<HTMLElement>('[style*="animation"]').forEach((x) => { x.style.animationDelay = '0ms'; });
  el.classList.add('closing');
  el.style.pointerEvents = 'none';
  if (isSplit) {
    // Pin it where it was, relative to the device frame (which never gets re-rendered).
    const d = refs.device.getBoundingClientRect();
    Object.assign(el.style, { position: 'absolute', inset: 'auto', top: `${rect.top - d.top - refs.device.clientTop}px`, left: `${rect.left - d.left - refs.device.clientLeft}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: '45' });
  }
  refs.device.append(el);
  setTimeout(() => el.remove(), 240);
}

function render() {
  const isSplit = split.matches;
  refs.device.classList.toggle('is-split', isSplit);
  refs.device.classList.toggle('is-day', S.phase === 'day');

  refs.status.replaceChildren(renderStatus());
  if (!isSplit) {
    refs.device.style.setProperty('--status-h', `${refs.status.offsetHeight}px`);
    const where = `${S.app}|${S.openMail ?? ''}|${S.phase}`;
    if (where !== lastWhere) { lastWhere = where; window.scrollTo(0, 0); }
  }
  refs.device.classList.toggle('tense', S.phase === 'day' && S.meters.stress >= 60 && S.meters.stress < 80);
  refs.device.classList.toggle('frazzled', S.phase === 'day' && S.meters.stress >= 80);

  // Remember the open sidecar (if any) so it can slide out after this render removes it.
  const oldSide = refs.main.querySelector<HTMLElement>('.drawer-wrap');
  const oldRect = oldSide?.getBoundingClientRect();
  keepScroll(refs.main, () => {
    const panes: HTMLElement[] = [];
    if (isSplit) {
      if (S.app === 'calendar' || !hasApp(S.app)) S.app = hasApp('mail') ? 'mail' : 'huddle';
      // While a calendar sidecar is open, the other app steps aside.
      const calSide = layout !== 'app' && (drawerOpen || (!!S.selected && (S.selected !== lastSel || detailOpen)));
      if (layout !== 'app') panes.push(h('section', { class: 'pane pane-cal' }, renderCalendar()));
      if (layout !== 'cal' && !calSide) panes.push(h('section', { class: 'pane pane-app has-win' }, renderApp(S.app), winCtrls(true)));
    } else {
      panes.push(S.app === 'calendar'
        ? h('section', { class: 'pane pane-app' }, renderCalendar())
        : h('section', { class: 'pane pane-app has-win' }, renderApp(S.app), winCtrls(false)));
    }
    refs.main.replaceChildren(...panes);
  });
  if (oldSide && oldRect && !refs.main.querySelector('.drawer-wrap')) slideOut(oldSide, oldRect, isSplit);

  if (scrollTarget !== null) {
    const sc = refs.main.querySelector<HTMLElement>('.cal-scroll');
    const ev = findEvent(S.selected);
    const target = ev?.start ?? scrollTarget;
    if (sc && !isSplit) {
      // Page scroll: put the target just under the sticky bars.
      const top = sc.getBoundingClientRect().top + window.scrollY + (target - CAL_START - 30) * PX;
      const covered = (document.querySelector('.cal-sticky') as HTMLElement | null)?.offsetHeight ?? 0;
      window.scrollTo({ top: Math.max(0, top - refs.status.offsetHeight - covered), behavior: 'smooth' });
    } else if (sc) sc.scrollTo({ top: Math.max(0, (target - CAL_START - 30) * PX), behavior: 'smooth' });
    scrollTarget = null;
  }

  refs.dock.replaceChildren(...renderDock(isSplit));
  keepScroll(refs.waiting, () => refs.waiting.replaceChildren(...renderWaiting()));

  const now = performance.now();
  S.banners = S.banners.filter((b) => now - b.born < (b.ttl ?? 4500)
    // Already answered (here, in the thread, or in Waiting on you)? Then the notification has done its job.
    && !(b.msgId && S.messages.find((m) => m.id === b.msgId)?.chosen !== undefined)
    // The Waiting on you panel already lists every message notification.
    && !(waitingOpen && b.msgId));
  S.toasts = S.toasts.filter((t) => now - t.born < 1800);
  refs.banners.replaceChildren(
    ...[...S.banners.filter((b) => b.action).slice(-1), ...S.banners.filter((b) => !b.action).slice(S.banners.some((b) => b.action) ? -1 : -2)].map((b) =>
      {
        const m = b.msgId ? S.messages.find((x) => x.id === b.msgId) : undefined;
        const replies = m?.choices && m.chosen === undefined ? m.choices : null;
        return h('div', { class: `banner ${b.action ? 'has-action' : ''} ${replies ? 'has-replies' : ''}`, role: 'button', style: `animation-delay:${b.born - now}ms`,
          onclick: () => { S.banners = S.banners.filter((x) => x !== b); if (m) openMessage(m.id); else openApp(b.app); } },
          h('span', { class: 'banner-icon', style: `background:${appOf(b.app).color}` }, appOf(b.app).icon),
          h('span', { class: 'banner-text' }, h('b', {}, b.title), h('span', {}, b.body)),
          b.action && h('button', { class: 'banner-act', onclick: (ev: Event) => { ev.stopPropagation(); S.banners = S.banners.filter((x) => x !== b); b.action!.run(); dirty(); } }, b.action.label),
          replies && h('div', { class: 'banner-replies' },
            ...replies.map((c, i) => h('button', { class: 'banner-reply', onclick: (ev: Event) => { ev.stopPropagation(); S.banners = S.banners.filter((x) => x !== b); choose(m!.id, i); } }, c.label))),
        );
      }),
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
  const label = S.phase === 'prep' ? '' : S.phase === 'day' ? (S.paused ? 'Paused while you were away' : day().weekend ? 'Weekend 🌴' : 'Workday') : '';
  return h('div', { class: 'status-inner' },
    h('span', { class: 'status-left' }, label),
    h('span', { class: 'status-center' }, h('b', {}, `${dateFor(S.dayIndex)} · ${time}`), h('small', {}, S.dayIndex < DAYS.length ? `Day ${S.dayIndex + 1} of ${DAYS.length}` : `Endless · Day ${S.dayIndex + 1}`)),
    h('span', { class: 'status-right' },
      S.phase === 'prep' && (() => {
        const n = S.events.filter((e) => e.status === 'pending' && !e.optional).length;
        return h('button', { class: 'start-btn', onclick: startDay, title: n ? `${n} requests still unbooked` : 'Start the day' }, day().weekend ? `Start ${day().weekday === 'Sat' ? 'Saturday' : 'Sunday'} 🌴` : 'Start day', n > 0 && h('span', { class: 'start-count' }, n), ' →');
      })(),
      waitingPill(),
      h('button', { class: 'chip-btn sound-btn', onclick: () => { toggleSound(); dirty(); }, title: soundOn() ? 'Mute alerts' : 'Turn alerts on', 'aria-label': soundOn() ? 'Mute alerts' : 'Turn alerts on' }, soundOn() ? '🔔' : '🔕'),
      S.phase === 'day' && !S.paused && h('button', { class: 'chip-btn', onclick: toggleSpeed, title: 'Speed' }, `${S.speed}×`),
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
        relChip(p.key),
        h('span', { class: 'muted' }, open ? '▾' : '▸'),
      ),
      open && h('div', { class: 'person-more' },
        h('div', { class: `rel-line r-${relClass(relOf(p.key))}` }, relLine(p.key)),
        h('p', {}, p.bio),
        coffeeOf(p) && h('div', { class: 'small' }, '☕ ', coffeeOf(p)),
        ...p.facts.map((x) => h('div', { class: 'small' }, '• ', x)),
      ),
    );
  };
  return [
    h('p', { class: 'muted small rel-tip' }, 'Every call you make lands on someone. Warm people forgive more; frosty ones remember everything.'),
    h('h4', {}, 'Work'), ...work.map(row),
    life.length > 0 && h('h4', {}, 'Your people'), ...life.map(row),
  ];
}

const relClass = (v: number) => (v >= 65 ? 'warm' : v >= 45 ? 'fine' : v >= 30 ? 'cool' : 'frosty');
const REL_EMOJI: Record<string, string> = { warm: '😊', fine: '🙂', cool: '😐', frosty: '🥶' };
function relChip(key: string) {
  const v = relOf(key);
  const c = relClass(v);
  return h('span', { class: `rel-chip r-${c}` },
    h('span', { class: 'rel-word' }, `${REL_EMOJI[c]} ${relWord(v)}`),
    h('span', { class: 'rel-bar' }, h('span', { style: `width:${v}%` })));
}
function relLine(key: string) {
  const m = relMult(key);
  const life = PERSONAL.includes(key);
  if (m < 1) return life ? 'On your side: your slip-ups stress you out less with them.' : 'Has your back: setbacks with them cost less standing.';
  if (m > 1) return life ? 'Hurt: every letdown with them hits harder.' : 'Keeping score: setbacks with them cost more standing.';
  return 'Neutral. Every decision moves this, one way or the other.';
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
  if (app === 'notes') return S.tasks.filter((t) => t.status === 'open').length + derivedTodos().length;
  if (app === 'pulse') return dangerCount();
  if (app === 'card') return S.tasks.filter((t) => t.kind === 'invoice' && t.status === 'open').length;
  if (app === 'trellis') return S.tickets.filter((t) => t.status === 'open' && !ticketBlock(t.id)).length;
  return 0;
}

/** The apps you live in. Everything else sits behind a divider (tablet) or in a More menu (phone). */
const CORE_APPS: AppId[] = ['calendar', 'mail', 'huddle', 'messages', 'notes'];
let moreOpen = false;
let moreBorn = 0;

/** Requests you haven't looked at yet make the 📥 icon (and the Calendar app) pulse. */
const seenReq = new Set<string>();
const unseenRequests = () => S.events.filter((e) => e.status === 'pending' && !seenReq.has(e.id)).length;
/** Keep an infinite pulse in phase across re-renders. */
const pulsePhase = () => `animation-delay:-${Math.round(performance.now() % 1400)}ms`;

function renderDock(isSplit: boolean) {
  const all = APPS.filter((a) => hasApp(a.id));
  const core = CORE_APPS.flatMap((id) => all.filter((a) => a.id === id));
  const extra = all.filter((a) => !CORE_APPS.includes(a.id));
  const icon = (a: (typeof APPS)[number], close = false) => {
    const n = badgeFor(a.id);
    const cal = a.id === 'calendar';
    const pulse = cal && unseenRequests() > 0;
    // Tablet: the calendar is always on screen, so its icon opens Requests (or toggles full-screen calendar).
    const onCal = () => {
      if (n > 0) { drawerOpen = true; S.selected = null; } else layout = layout === 'cal' ? 'split' : 'cal';
      dirty();
    };
    return h('button', { class: `dock-app ${(isSplit ? cal && layout === 'cal' : S.app === a.id) ? 'active' : ''}`, onclick: () => { if (close) moreOpen = false; if (isSplit && cal) return onCal(); if (!cal) { drawerOpen = false; detailOpen = false; S.selected = null; } if (layout === 'cal') layout = 'split'; openApp(a.id); } },
      h('span', { class: `app-icon ${pulse ? 'pulse' : ''}`, style: `background:${a.color};${pulse ? pulsePhase() : ''}` }, a.icon,
        n > 0 ? h('span', { class: 'badge' }, n) : isNewApp(a.id) ? h('span', { class: 'badge new' }, 'NEW') : null),
      h('span', { class: 'app-name' }, a.name),
    );
  };
  if (!extra.length) { moreOpen = false; return core.map((a) => icon(a)); }
  if (isSplit) {
    moreOpen = false;
    return [...core.map((a) => icon(a)), h('span', { class: 'dock-divider' }), ...extra.map((a) => icon(a))];
  }
  // Phone: the rest live behind More, which carries their badges.
  const n = extra.reduce((t, a) => t + badgeFor(a.id), 0);
  const fresh = extra.some((a) => isNewApp(a.id));
  const inside = extra.find((a) => a.id === S.app);
  const more = h('button', { class: `dock-app more ${inside || moreOpen ? 'active' : ''}`, onclick: () => { moreOpen = !moreOpen; moreBorn = performance.now(); dirty(); } },
    h('span', { class: 'app-icon more-icon', style: inside ? `background:${inside.color}` : '' }, inside ? inside.icon : moreOpen ? '✕' : '•••',
      n > 0 ? h('span', { class: 'badge' }, n) : fresh ? h('span', { class: 'badge new' }, 'NEW') : null),
    h('span', { class: 'app-name' }, inside ? inside.name : 'More'),
  );
  const delay = `animation-delay:${moreBorn - performance.now()}ms`;
  const menu = moreOpen && [
    h('div', { class: 'more-backdrop', style: delay, onclick: () => { moreOpen = false; dirty(); } }),
    h('div', { class: 'more-menu', style: delay }, ...extra.map((a) => icon(a, true))),
  ];
  return [...core.map((a) => icon(a)), more, ...(menu || [])];
}

// ───────────────────────────── calendar ─────────────────────────────
// ───── which day the calendar is showing ─────
let viewDay = 0;
let viewFor = -1;
/** Events for a day that isn't today: what you've booked ahead, plus what's already on the calendar that day. */
function eventsOn(i: number): CalEvent[] {
  if (i === S.dayIndex) return S.events;
  if (i < S.dayIndex) return S.past[i] ?? [];
  const known = dayAt(i).events
    .filter((e) => (e.start ?? e.proposed ?? null) !== null)
    .map((e): CalEvent => ({ ...e, id: `pv${i}-${e.id}`, start: e.start ?? e.proposed ?? null, status: 'scheduled', fixed: true }));
  return [...known, ...(S.future[i] ?? [])];
}
const shortDate = (i: number) => new Date(2026, 2, 4 + i).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

function renderDayNav() {
  const lo = Math.max(0, S.dayIndex - 7);
  const hi = lastViewDay();
  const go = (i: number) => { viewDay = Math.max(lo, Math.min(hi, i)); dirty(); };
  const label = viewDay === S.dayIndex ? 'Today' : viewDay === S.dayIndex + 1 ? 'Tomorrow' : viewDay === S.dayIndex - 1 ? 'Yesterday' : shortDate(viewDay);
  const booked = (S.future[viewDay] ?? []).length;
  return h('div', { class: `daynav ${viewDay !== S.dayIndex ? 'away' : ''}` },
    h('button', { class: 'daynav-btn', disabled: viewDay <= lo, onclick: () => go(viewDay - 1), 'aria-label': 'Previous day' }, '‹'),
    h('button', { class: 'daynav-label', onclick: () => go(S.dayIndex), title: 'Back to today' },
      label, isWeekendDay(viewDay) && ' 🌴', booked > 0 && viewDay > S.dayIndex && h('span', { class: 'start-count' }, booked)),
    h('button', { class: 'daynav-btn', disabled: viewDay >= hi, onclick: () => go(viewDay + 1), 'aria-label': 'Next day' }, '›'),
  );
}

/** Selection bar for a meeting you've booked on a later day. */
function renderAheadSelection(e: CalEvent, onDay: number) {
  return h('div', { class: 'selbar' },
    h('div', { class: 'selbar-top' }, h('b', {}, e.title),
      h('span', { class: 'muted small nowrap' }, `${e.attendees.map((a) => EXECS[a].short).join(' & ')} · ${dayDate(onDay)} · ${fmt(e.start!)}`)),
    e.dueDay !== undefined && h('div', { class: 'small note' }, `Due by ${dayDate(e.dueDay)}. Drag it to move it, or flip days and drop it there.`),
    h('div', { class: 'selbar-actions' }, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => unbookFuture(e.id) }, 'Unbook'),
      h('button', { class: 'btn icon', onclick: () => select(null), 'aria-label': 'Cancel' }, '✕')),
  );
}

function renderCalendar() {
  const d = day();
  const execs = visibleExecs();
  const pending = S.events.filter((e) => e.status === 'pending');
  if (viewFor !== S.dayIndex) { viewFor = S.dayIndex; viewDay = S.dayIndex; }
  const today = viewDay === S.dayIndex;
  const ahead = findFuture(S.selected);
  const sel = findEvent(S.selected) ?? ahead?.e ?? null;
  if (drawerOpen) for (const e of pending) seenReq.add(e.id);
  if (sel && sel.status === 'pending') seenReq.add(sel.id);
  // A newly tapped event opens its details in the sidecar (every screen size).
  if (S.selected !== lastSel) {
    lastSel = S.selected;
    detailOpen = !!S.selected;
  }
  if (!sel) detailOpen = false;

  const hiddenN = activeExecs().length - execs.length;
  const header = h('header', { class: 'app-head' },
    h('h2', { class: 'cal-title' }, 'Calendar',
      activeExecs().length > 1 && h('button', { class: 'cal-manage', onclick: () => { calSheet = true; dirty(); } }, '☰', h('span', { class: 'cm-text' }, ' Calendars'), hiddenN > 0 && h('span', { class: 'start-count', title: `${hiddenN} hidden` }, `−${hiddenN}`))),
    h('div', { class: 'cal-head-right' },
      h('button', { class: `req-icon ${pending.length ? 'has' : ''} ${unseenRequests() ? 'pulse' : ''}`, style: unseenRequests() ? pulsePhase() : '', onclick: () => { drawerOpen = true; S.selected = null; dirty(); }, title: 'Requests', 'aria-label': `Requests (${pending.length})` },
        '📥', pending.length > 0 && h('span', { class: 'badge' }, pending.length)),
      renderDayNav()),
  );
  void d;

  // Requests live in a sidecar on every screen size, opened from the 📥 icon in the header.
  const tray = null;
  const detail = sel && detailOpen
    ? h('div', { class: 'drawer-wrap' },
        h('div', { class: 'drawer-backdrop', style: sideDelay(), onclick: () => { detailOpen = false; dirty(); } }),
        h('aside', { class: 'drawer detail', style: sideDelay() },
          h('div', { class: 'drawer-head' }, h('b', {}, sel.status === 'pending' ? 'Book it' : 'Details'),
            h('button', { class: 'win-btn', onclick: () => select(null) }, '✕')),
          h('div', { class: 'drawer-cards', 'data-keep': 'detail' },
            ahead ? renderAheadSelection(sel, ahead.day) : renderDetails(sel)),
          !ahead && (() => { const a = detailActions(sel); return a && h('div', { class: 'drawer-foot' }, a); })()))
    : null;
  const drawer = drawerOpen
    ? h('div', { class: 'drawer-wrap' },
        h('div', { class: 'drawer-backdrop', style: sideDelay(), onclick: () => { drawerOpen = false; dirty(); } }),
        h('aside', { class: 'drawer', style: sideDelay() },
          h('div', { class: 'drawer-head' }, h('b', {}, day().weekend ? 'Plans & requests' : 'Requests'), h('span', { class: 'count' }, pending.length),
            h('button', { class: 'win-btn', onclick: () => { drawerOpen = false; dirty(); } }, '✕')),
          h('p', { class: 'muted small drawer-hint' }, 'Tap one to pick a time, or drag it onto the calendar.'),
          h('div', { class: 'drawer-cards', 'data-keep': 'drawer' },
            ...[...pending].sort((a, b) => (a.kind === 'work' ? 1 : 0) - (b.kind === 'work' ? 1 : 0) || (a.priority ?? 2) - (b.priority ?? 2)).map(renderCard),
            pending.length === 0 && h('div', { class: 'empty' }, 'All booked 🎉')),
          pending.length > 1 && h('div', { class: 'drawer-foot' },
            h('button', { class: 'btn primary big book-all', onclick: () => { bookAllRequests(); drawerOpen = false; dirty(); } }, `📍 Book all ${pending.length} at their best slots`))))
    : null;

  const phone = !split.matches;
  const selBar = !sel ? null
    : detailOpen ? null
    : h('div', { class: 'pickbar' },
        h('span', {}, '👆 Tap a time', today ? '' : ` on ${shortDate(viewDay)}`, ' for ', h('b', {}, sel.title)),
        h('button', { class: 'btn', onclick: () => { detailOpen = true; dirty(); } }, 'Details'),
        h('button', { class: 'btn', onclick: () => select(null) }, '✕'));

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
    if (S.phase === 'day' && today) {
      col.append(h('div', { class: 'past glide-h', style: `top:0;height:${(S.now - CAL_START) * PX}px;${glideStyle()}` }));
    }
    const shown = eventsOn(viewDay).filter((e) => e.start !== null && e.attendees.includes(x) && e.status !== 'declined' && e.status !== 'bumped');
    const lanes = layoutLanes(shown.filter((e) => e.kind !== 'focus'));
    for (const e of shown) {
      const pieces = [today ? renderBlock(e) : renderOtherBlock(e)];
      const pb = padBefore(e), pa = padAfter(e);
      if (e.status !== 'missed' && e.status !== 'pending') {
        const c = EXECS[e.attendees[0]].color;
        if (pb) { pieces[0].classList.add('has-pad-before'); pieces.push(h('div', { class: `travel pad-before ${travelOf(e) >= pb ? '' : 'buffer'}`, style: `top:${(e.start! - pb - CAL_START) * PX}px;height:${pb * PX}px;--c:${c}` })); }
        if (pa) { pieces[0].classList.add('has-pad-after'); pieces.push(h('div', { class: `travel pad-after ${travelOf(e) >= pa ? '' : 'buffer'}`, style: `top:${(e.start! + e.duration - CAL_START) * PX}px;height:${pa * PX}px;--c:${c}` })); }
      }
      const l = lanes.get(e);
      for (const el of pieces) {
        if (l && l.of > 1 && !el.classList.contains('travel')) {
          el.style.left = `calc(${(l.lane / l.of) * 100}% + 2px)`;
          el.style.right = 'auto';
          el.style.width = `calc(${100 / l.of}% - 4px)`;
        }
        col.append(el);
      }
    }
    if (S.phase === 'day' && today) col.append(h('div', { class: 'now-line glide', style: `top:${(S.now - CAL_START) * PX}px;${glideStyle()}` }));
    col.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.evt') || !S.selected || Date.now() < suppressUntil) return;
      placeEvent(S.selected, minuteAt(col, (ev as MouseEvent).clientY), false, viewDay);
    });
    return col;
  });

  const initial = S.phase === 'day' && today ? Math.max(0, (S.now - CAL_START - 45) * PX) : 0;
  const innerCls = `cal-inner ${today ? '' : viewDay < S.dayIndex ? 'other-day past-day' : 'other-day'}`;
  const scroller = h('div', { class: 'cal-scroll', 'data-keep': 'cal', 'data-initial': initial },
    h('div', { class: innerCls, style: `--n:${execs.length}` },
      phone ? null : heads,
      h('div', { class: 'cal-grid', style: `height:${height}px` }, gutter, ...cols)));
  // Phone: the whole page scrolls (so iOS can tuck its bars away). The name row sticks, and follows the sideways scroll.
  let stickyHeads: HTMLElement | null = null;
  if (phone) {
    const strip = h('div', { class: `${innerCls} heads-strip`, style: `--n:${execs.length}` }, heads);
    stickyHeads = h('div', { class: 'cal-heads-wrap' }, strip);
    const sync = () => { strip.style.transform = `translateX(${-scroller.scrollLeft}px)`; };
    scroller.addEventListener('scroll', sync, { passive: true });
    queueMicrotask(sync);
  }

  const busy = S.phase === 'day' ? myMeeting() : undefined;
  const sticky = (bar: HTMLElement | null) => (phone ? h('div', { class: 'cal-sticky' }, bar, stickyHeads) : bar);
  if (busy) {
    if (S.selected) S.selected = null;
    const lock = h('div', { class: 'lockbar' },
      h('span', {}, '🔒 ', h('b', {}, `You're in "${busy.title}"`), h('small', {}, ` until ${fmt(busy.start! + busy.duration)}. Calendar locked.`)),
      h('button', { class: 'btn', onclick: stepOut }, busy.attendees.length > 1 ? 'Step out' : 'Wrap up'),
    );
    return h('div', { class: 'app cal locked' }, header, tray, sticky(lock), scroller);
  }
  return h('div', { class: `app cal ${sel ? 'placing' : ''}` }, header, tray, sticky(selBar), scroller, drawer ?? detail);
}

const t9 = () => 9 * 60;

/** When each new item first appeared, so its arrival animation plays once (not on every redraw). */
const arrivedAt = new Map<string, number>();
function arriveDelay(e: CalEvent) {
  if (!e.fresh) return '';
  const now = performance.now();
  if (!arrivedAt.has(e.id)) arrivedAt.set(e.id, now);
  return `animation-delay:${arrivedAt.get(e.id)! - now}ms;`;
}

function renderCard(e: CalEvent) {
  const card = h('div', { class: `req ${S.selected === e.id ? 'selected' : ''} ${e.fresh ? 'fresh' : ''}`, style: `${arriveDelay(e)}--c:${EXECS[e.attendees[0]].color}` },
    h('div', { class: 'req-top' },
      h('b', {}, e.title),
      h('span', { class: 'dur' }, `${e.duration}m`),
    ),
    h('div', { class: 'req-who' }, ...e.attendees.map((a) => h('span', { class: 'who', style: `--c:${EXECS[a].color}` }, EXECS[a].short))),
    h('div', { class: 'req-tags' },
      e.dueDay !== undefined && h('span', { class: `tag due ${e.dueDay === S.dayIndex ? 'bad' : ''}` }, e.dueDay === S.dayIndex ? '⏰ Due today' : `📆 By ${shortDate(e.dueDay)}`),
      e.rescheduled && h('span', { class: 'tag bad' }, '💥 Rebook'),
      e.kind === 'work' && h('span', { class: `tag prio p${e.priority ?? 2}` }, PRIORITY_LABEL[(e.priority ?? 2) as 1 | 2 | 3]),
      ...issuesFor(e).map((i) => h('span', { class: `tag ${i.bad ? 'bad' : ''}` }, `${i.icon} ${i.text}`))),
  );
  makeDraggable(card, e.id, false);
  return card;
}

/** Side-by-side lanes for overlapping events, so clashes are visible instead of stacked. */
function layoutLanes(evts: CalEvent[]) {
  const out = new Map<CalEvent, { lane: number; of: number }>();
  const sorted = [...evts].sort((a, b) => a.start! - b.start! || b.duration - a.duration);
  let cluster: CalEvent[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const e of cluster) out.get(e)!.of = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const e of sorted) {
    const s0 = e.start!;
    const s1 = e.start! + e.duration;
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

/** "3:00–3:30pm" rather than "3:00pm–3:30pm" when both ends share am/pm. */
function span2(a: number, b: number) {
  const x = fmt(a), y = fmt(b);
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -2)}–${y}` : `${x}–${y}`;
}

function renderBlock(e: CalEvent) {
  const start = e.start!;
  const issues = issuesFor(e);
  const bad = issues.some((i) => i.bad && i.icon !== '☕');
  const movable = !e.fixed && e.status === 'scheduled';
  const small = e.duration * PX < 34;
  const cls = ['evt', e.duration * PX >= 70 ? 'tall' : '', `st-${e.status}`, `k-${e.kind ?? 'meeting'}`, bad ? 'has-issue' : '', S.selected === e.id ? 'selected' : '', movable ? 'movable' : '', small ? 'small' : '', e.attendees.length > 1 ? 'multi' : '', e.fresh ? 'fresh' : ''].join(' ');
  const el = h('div', { class: cls, style: `${arriveDelay(e)}top:${(start - CAL_START) * PX}px;height:${Math.max(16, e.duration * PX - 2)}px;--c:${EXECS[e.attendees[0]].color}` },
    e.editedBy && e.status === 'scheduled' && h('span', { class: 'edited-mark', title: `Edited by ${e.editedBy}` }, '✏️'),
    h('div', { class: 'evt-title' }, e.status === 'missed' ? '💥 ' : e.status === 'done' ? '✓ ' : '', e.kind === 'personal' && e.attendees.includes('me') ? '🏠 ' : '', e.title),
    !small && h('div', { class: 'evt-time' }, span2(start, start + e.duration), e.overranBy ? ` (+${e.overranBy}m)` : ''),
    !small && h('div', { class: 'evt-issues' },
      [...(e.status === 'scheduled' ? issues.filter((i) => i.bad).map((i) => i.icon) : []),
        e.remote ? '💻' : whereOf(e) === 'offsite' ? (e.withRide ? '🚕' : '📍') : '', e.withCoffee ? '☕' : '', e.withCatering ? '🍱' : ''].filter(Boolean).join(' ')),
  );
  if (movable) makeDraggable(el, e.id, true);
  else el.addEventListener('click', () => select(e.id));
  return el;
}

/** A block on a day that isn't today: your bookings ahead can be moved; everything else is read-only. */
function renderOtherBlock(e: CalEvent) {
  const mine = viewDay > S.dayIndex && !!findFuture(e.id);
  const small = e.duration * PX < 34;
  const st = viewDay < S.dayIndex ? e.status : 'scheduled';
  const el = h('div', {
    class: ['evt', e.duration * PX >= 70 ? 'tall' : '', `st-${st}`, `k-${e.kind ?? 'meeting'}`, mine ? 'movable ahead' : 'readonly', S.selected === e.id ? 'selected' : '', small ? 'small' : '', e.attendees.length > 1 ? 'multi' : ''].join(' '),
    style: `top:${(e.start! - CAL_START) * PX}px;height:${Math.max(16, e.duration * PX - 2)}px;--c:${EXECS[e.attendees[0]].color}`,
  },
    h('div', { class: 'evt-title' }, st === 'missed' ? '💥 ' : st === 'done' ? '✓ ' : mine ? '📆 ' : '', e.title),
    !small && h('div', { class: 'evt-time' }, span2(e.start!, e.start! + e.duration)),
  );
  if (mine) makeDraggable(el, e.id, true);
  return el;
}

/** Where it happens, the in-person/video switch, and (off-site) the ride share. */
function whereRow(e: CalEvent) {
  const can = canAddons(e);
  const off = whereOf(e) === 'offsite';
  return h('div', { class: 'where' },
    e.remoteOk && can
      ? h('div', { class: 'seg where-seg' },
          h('button', { class: `seg-btn ${e.remote ? '' : 'on'}`, onclick: () => e.remote && toggleAddon(e.id, 'remote') }, e.travel ? `📍 ${e.place ?? 'In person'}` : '🏢 Office'),
          h('button', { class: `seg-btn ${e.remote ? 'on' : ''}`, onclick: () => !e.remote && toggleAddon(e.id, 'remote') }, '💻 Video', e.remoteOk === 'meh' ? h('small', {}, ' · less impact') : null))
      : h('span', { class: 'where-lbl' }, placeLabel(e)),
    off && h('span', { class: 'where-note' }, `${e.travel}m each way`),
  );
}

/** Tap to take someone off the invite (or put them back). */
function attendeeChips(e: CalEvent) {
  const all = (e.invited ?? e.attendees).filter((x) => x !== 'team');
  const left = e.attendees.filter((x) => x !== 'team').length;
  return h('div', { class: 'who-chips' },
    e.attendees.includes('team') && h('span', { class: 'who-chip on fixed' }, '🌱 Everyone'),
    ...all.map((x) => {
      const on = e.attendees.includes(x);
      return h('button', { class: `who-chip ${on ? 'on' : 'off'}`, disabled: on && left <= 1, onclick: () => toggleAttendee(e.id, x), title: on ? `Take ${EXECS[x].short} off the invite` : `Put ${EXECS[x].short} back` },
        x === 'me' ? face('me', 20) : face(x, 20), EXECS[x].short, h('span', { class: 'who-x' }, on ? '✕' : '+'));
    }),
  );
}

/** Phone sidecar: the same controls as the bar, laid out as a readable card. */
function renderDetails(e: CalEvent) {
  const issues = issuesFor(e);
  const canAct = e.status === 'pending' || (e.status === 'scheduled' && !e.fixed);
  const ok = e.minOk ?? e.baseDuration ?? e.duration;
  const skipped = skippedFrom(e);
  const row = (label: string, ...kids: Child[]) => h('div', { class: 'd-row' }, h('span', { class: 'd-lbl' }, label), h('div', { class: 'd-ctl' }, ...kids));
  const status = e.status === 'pending' ? 'Not booked' : e.status === 'running' ? 'Happening now' : e.status === 'scheduled' ? (e.fixed ? 'Fixed' : 'Booked') : e.status[0].toUpperCase() + e.status.slice(1);
  return h('div', { class: 'details', style: `--c:${EXECS[e.attendees[0]].color}` },
    h('div', { class: 'd-head' },
      h('div', { class: 'd-title' }, e.title),
      h('div', { class: 'd-sub' },
        h('span', { class: `d-pill st-${e.status}` }, status),
        e.start !== null ? span2(e.start, e.start + e.duration) : `${e.duration} min`,
        ` · ${placeLabel(e)}`),
      e.note && h('div', { class: 'd-note' }, e.note),
      issues.length > 0 && h('div', { class: 'req-tags' }, ...issues.map((i) => h('span', { class: `tag ${i.bad ? 'bad' : ''}` }, `${i.icon} ${i.text}`))),
    ),
    h('div', { class: 'd-rows' },
      canAct && row('Starts',
        e.start !== null && h('button', { class: 'd-step', onclick: () => { nudgeStart(e.id, -15); scrollToEvent(e); } }, '−15'),
        e.start !== null && h('b', { class: 'd-val' }, fmt(e.start).slice(0, -2), h('small', {}, fmt(e.start).slice(-2))),
        e.start !== null && h('button', { class: 'd-step', onclick: () => { nudgeStart(e.id, 15); scrollToEvent(e); } }, '+15'),
        h('button', { class: `d-best ${e.start === null ? 'primary' : ''}`, onclick: () => { autoPlace(e.id); scrollToEvent(e); } }, e.start === null ? '📍 Book best slot' : '📍 Best')),
      canResize(e) && row('Length',
        h('button', { class: 'd-step', onclick: () => resizeEvent(e.id, -15), disabled: e.duration <= 15 }, '−15'),
        h('b', { class: `d-val ${e.duration < ok ? 'short' : ''}` }, `${e.duration}m`),
        h('button', { class: 'd-step', onclick: () => resizeEvent(e.id, 15) }, '+15'),
        h('span', { class: 'd-hint' }, e.duration < ok ? 'Cut short: partial credit' : ok < (e.baseDuration ?? e.duration) ? `Fine down to ${ok}m` : '')),
      canWrap(e) && row('Running', h('span', { class: 'd-hint' }, `Since ${fmt(e.start!)} · ${S.now - e.start!} of ${e.planned ?? e.duration}m`)),
      canBuffer(e) && row('Buffer',
        h('div', { class: 'buf' },
          h('span', { class: 'buf-lbl' }, 'Before'),
          h('button', { class: 'd-step', disabled: padBefore(e) <= travelOf(e), onclick: () => setBuffer(e.id, 'before', -15) }, '−'),
          h('b', { class: 'buf-val' }, padBefore(e) ? `${padBefore(e)}m` : '—'),
          h('button', { class: 'd-step', disabled: padBefore(e) >= 120, onclick: () => setBuffer(e.id, 'before', 15) }, '+')),
        h('div', { class: 'buf' },
          h('span', { class: 'buf-lbl' }, 'After'),
          h('button', { class: 'd-step', disabled: padAfter(e) <= travelOf(e), onclick: () => setBuffer(e.id, 'after', -15) }, '−'),
          h('b', { class: 'buf-val' }, padAfter(e) ? `${padAfter(e)}m` : '—'),
          h('button', { class: 'd-step', disabled: padAfter(e) >= 120, onclick: () => setBuffer(e.id, 'after', 15) }, '+')),
        h('span', { class: 'd-hint' }, travelOf(e) ? `Includes ${travelOf(e)}m travel each way.` : 'Prep time before, slack for overruns after.')),
      row('Who', canEditAttendees(e) ? attendeeChips(e) : h('div', { class: 'who-chips' }, ...e.attendees.map((x) => h('span', { class: 'who-chip on fixed' }, x === 'team' ? '🌱' : face(x, 20), EXECS[x].short)))),
      skipped.length > 0 && h('div', { class: 'd-warn' }, `Skipping costs ${e.fixed || e.attendees.includes('team') ? '🤝 morale' : '⭐ standing'} when it starts (−2 each).`),
      e.kind !== 'focus' && e.kind !== 'work' && row('Where', whereRow(e)),
      ((whereOf(e) === 'offsite' && e.kind !== 'work') || rideUnneeded(e)) && row('Ride',
        !hasApp('ryde') ? h('span', { class: 'd-hint' }, '🚗 They drive. (Ryde unlocks soon: prep on the way.)')
        : !canAddons(e) ? h('span', { class: 'd-hint' }, e.withRide ? '🚕 Ryde booked' : '🚗 Driving')
        : rideUnneeded(e) || rideStale(e) ? h('button', { class: 'chip ride warn', onclick: () => toggleAddon(e.id, 'ride') }, rideUnneeded(e) ? '🚕 Cancel ride (it\'s video now)' : `🚕 Fix ride → ${e.place}`)
        : h('div', { class: 'seg' },
            h('button', { class: `seg-btn ${e.withRide ? '' : 'on'}`, onclick: () => e.withRide && toggleAddon(e.id, 'ride') }, '🚗 Drive'),
            h('button', { class: `seg-btn ${e.withRide ? 'on' : ''}`, onclick: () => !e.withRide && toggleAddon(e.id, 'ride') }, `🚕 Ryde $${RIDE_COST * 2}`)),
        hasApp('ryde') && canAddons(e) && !rideUnneeded(e) && h('span', { class: 'd-hint' }, e.withRide ? 'They prep on the way.' : e.prep ? `Needs ${e.prep}m prep: a Ryde covers it.` : 'In a Ryde they prep on the way.')),
      canAddons(e) && atOffice(e) && e.kind !== 'work' && row('Coffee',
        h('button', { class: `chip ${e.withCoffee ? 'on' : ''}`, onclick: () => toggleAddon(e.id, 'coffee') }, e.withCoffee ? `☕ Ordered · $${addonCost(e).coffee}` : `☕ Add coffee $${addonCost(e).coffee}`),
        h('span', { class: 'd-hint' }, e.coffee ? (S.flags.includes(`drink-${e.attendees[0]}`) ? 'Their usual, waiting when they arrive.' : "You don't know their order yet: house latte.") : 'A nice touch.')),
      canAddons(e) && canCater(e) && e.kind !== 'work' && row('Catering',
        h('button', { class: `chip ${e.withCatering ? 'on' : e.catering === 'wanted' ? 'want' : ''}`, onclick: () => toggleAddon(e.id, 'catering') }, e.withCatering ? `🍱 Ordered · $${addonCost(e).catering}` : `🍱 Add catering $${addonCost(e).catering}`),
        h('span', { class: `d-hint ${e.catering === 'wanted' && !e.withCatering ? 'bad' : ''}` }, e.catering === 'wanted' ? (e.withCatering ? 'Expected, and sorted.' : 'Expected. Awkward without it.') : 'Optional: good for morale.')),
    ),
  );
}

/** The sidecar's footer: what you can do with this meeting. */
function detailActions(e: CalEvent) {
  const canAct = e.status === 'pending' || (e.status === 'scheduled' && !e.fixed);
  const bumpFx = canBump(e) ? bumpPenaltyFor(e) : null;
  const bumpCost = bumpFx && Object.entries(bumpFx).filter(([, v]) => v).map(([m, v]) => `${METER_ICON[m as Meter]}${m === 'runway' ? fmtMoney(v as number) : v}`).join(' ');
  if (!canAct && !canWrap(e)) return null;
  return h('div', { class: 'd-actions' },
    canWrap(e) && h('button', { class: 'd-act danger', onclick: () => wrapUpNow(e.id) }, '✂️ Wrap up now'),
    canAct && h('button', { class: 'd-act pick', onclick: () => { detailOpen = false; dirty(); } }, e.status === 'pending' ? '👆 Pick a time' : '👆 Move'),
    e.status === 'scheduled' && !e.fixed && h('button', { class: 'd-act', onclick: () => unschedule(e.id) }, '↩︎ Unbook'),
    bumpFx && h('button', { class: 'd-act', onclick: () => bumpEvent(e.id) }, '📆 Tomorrow', h('small', {}, bumpCost || 'free')),
    canAct && h('button', { class: 'd-act danger', onclick: () => declineEvent(e.id) }, 'Decline'),
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

let drawerOpen = false;
/** The sidecars re-render every tick; offset their slide-in so it only plays once. */
let sideKey = '';
let sideBorn = 0;
function sideDelay() {
  const key = waitingOpen ? 'wait' : drawerOpen ? 'req' : detailOpen ? `d:${S.selected}` : '';
  if (key !== sideKey) { sideKey = key; sideBorn = performance.now(); }
  return `animation-delay:${sideBorn - performance.now()}ms`;
}
let detailOpen = false;
let lastSel: string | null = null;

function makeDraggable(el: HTMLElement, id: string, isBlock: boolean) {
  el.addEventListener('click', () => {
    if (Date.now() < suppressUntil) return;
    if (drawerOpen) drawerOpen = false;
    select(id);
  });
  el.addEventListener('pointerdown', (down: PointerEvent) => {
    if (down.button !== 0) return;
    const sx = down.clientX;
    const sy = down.clientY;
    const r = el.getBoundingClientRect();
    const offY = isBlock ? down.clientY - r.top : 0;
    const ev = (findEvent(id) ?? findFuture(id)?.e)!;
    let ghost: HTMLElement | null = null;
    // In the drawer the list scrolls vertically, so a drag is a sideways pull towards the calendar.
    const inDrawer = !!el.closest('.drawer');
    const isDrag = (x: number, y: number) =>
      Math.hypot(x - sx, y - sy) > 7 &&
      (isBlock || split.matches || (inDrawer ? Math.abs(x - sx) > Math.abs(y - sy) : Math.abs(y - sy) > Math.abs(x - sx)));

    const move = (m: PointerEvent) => {
      if (!ghost && isDrag(m.clientX, m.clientY)) {
        if (inDrawer || detailOpen) {
          // Get the sidecar out of the way so the calendar is free to drop on.
          drawerOpen = false;
          detailOpen = false;
          document.querySelector('.drawer-wrap')?.remove();
        }
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
        const s = Math.max(viewDay === S.dayIndex ? minStart() : DAY_START, Math.round(minuteAt(col, m.clientY - offY) / 15) * 15);
        tl.textContent = `→ ${fmt(s)}`;
      } else tl.textContent = '';
      const sc = document.querySelector('.cal-scroll') as HTMLElement | null;
      if (sc && !split.matches) {
        const topEdge = ((document.querySelector('.cal-sticky') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 80) + 30;
        const botEdge = ((document.querySelector('.dock') as HTMLElement | null)?.getBoundingClientRect().top ?? window.innerHeight) - 40;
        if (m.clientY < topEdge) window.scrollBy(0, -10);
        else if (m.clientY > botEdge) window.scrollBy(0, 10);
        const sr = sc.getBoundingClientRect();
        if (m.clientX < sr.left + 50) sc.scrollLeft -= 8;
        else if (m.clientX > sr.right - 30) sc.scrollLeft += 8;
      } else if (sc) {
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
      const moved = isDrag(u.clientX, u.clientY);
      if (ghost || moved) {
        ghost?.remove();
        suppressUntil = Date.now() + 250;
        const col = colAt(u.clientX, u.clientY);
        if (col && u.type === 'pointerup') placeEvent(id, minuteAt(col, u.clientY - offY), false, viewDay);
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
    case 'trellis': return renderTrellis();
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
/** Jump straight to a message: its mail, or its chat thread. */
/** The now-line slides from this tick's time to the next one, so it moves smoothly instead of jumping. */
function glideStyle() {
  const g = clockGlide();
  if (!g) return 'animation:none;';
  return `--glide:${g.minutes * PX}px;--h0:${(S.now - CAL_START) * PX}px;animation-duration:${Math.round(g.ms)}ms;animation-delay:${-Math.round(Math.min(g.since, g.ms))}ms;`;
}

// ───── Waiting on you: every unanswered message in one place ─────
let waitingOpen = false;
const waitingList = () => S.messages
  .filter((m) => m.choices && m.chosen === undefined && (m.day ?? S.dayIndex) === S.dayIndex)
  .sort((a, b) => (a.expires ?? 1e9) - (b.expires ?? 1e9));

function waitingPill() {
  if (S.phase !== 'day' && S.phase !== 'prep') return null;
  const list = waitingList();
  if (!list.length) return null;
  const urgent = list.some((m) => m.expires !== undefined && m.expires - S.now <= 10);
  return h('button', { class: `waiting-pill ${urgent ? 'urgent' : ''}`, style: urgent ? pulsePhase() : '', onclick: () => { waitingOpen = !waitingOpen; dirty(); }, title: 'Waiting on your reply' },
    '💬 ', h('b', {}, list.length), h('span', { class: 'waiting-word' }, ' to answer'));
}

function renderWaiting() {
  const list = waitingList();
  if (!waitingOpen || !list.length) { waitingOpen = false; return []; }
  const close = () => { waitingOpen = false; dirty(); };
  const appIcon = (app: AppId) => h('span', { class: 'banner-icon', style: `background:${appOf(app).color}` }, appOf(app).icon);
  return [
    h('div', { class: 'waiting-backdrop', onclick: close }),
    h('aside', { class: 'waiting', style: sideDelay() },
      h('div', { class: 'drawer-head' }, h('b', {}, 'Waiting on you'), h('span', { class: 'count' }, list.length),
        h('button', { class: 'win-btn', onclick: close }, '✕')),
      h('div', { class: 'waiting-list', 'data-keep': 'waiting' },
        ...list.map((m) => {
          const left = m.expires !== undefined ? m.expires - S.now : null;
          return h('div', { class: `wait-item ${left !== null && left <= 10 ? 'urgent' : ''}` },
            h('div', { class: 'wait-top' }, appIcon(m.app),
              h('span', { class: 'wait-from' }, h('b', {}, m.from.replace(/^Voicemail · /, '')), m.subject ? h('small', {}, m.subject) : null),
              h('span', { class: `wait-left ${left !== null && left <= 10 ? 'bad' : ''}` }, left === null ? 'no rush' : left <= 0 ? 'now' : `${left}m left`)),
            h('p', { class: 'wait-body' }, m.followUp ? '↩︎ ' : '', m.body),
            h('div', { class: 'wait-choices' },
              ...m.choices!.map((c, i) => h('button', { class: 'wait-choice', onclick: () => choose(m.id, i) }, c.label)),
              h('button', { class: 'wait-open', onclick: () => { waitingOpen = false; openMessage(m.id); } }, 'Open thread ›')),
          );
        })),
    ),
  ];
}

function openMessage(id: string) {
  const m = S.messages.find((x) => x.id === id);
  if (!m) return;
  if (m.app === 'mail') S.openMail = m.id;
  else openThread[m.app] = threadKey(m.from);
  if (layout === 'cal') layout = 'split';
  openApp(m.app);
}

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
      ...(() => {
        const bills = S.tasks.filter((t) => t.kind === 'invoice' && t.status === 'open');
        return bills.length ? [h('h4', {}, 'Bills due'), ...bills.map((t) => h('div', { class: 'order-row' },
          h('span', {}, h('b', {}, t.payee), h('div', { class: 'small muted' }, `$${t.amount} · due ${fmt(t.deadline)} · late fee if missed`)),
          h('button', { class: 'btn primary', onclick: () => payInvoice(t.id) }, `Pay $${t.amount}`)))] : [];
      })(),
      h('h4', {}, 'Recent'),
      S.ledger.length === 0 ? h('p', { class: 'empty' }, 'No spending yet. Finance is suspicious.') : null,
      ...S.ledger.slice(0, 30).map((l) => h('div', { class: 'order-row' }, h('span', {}, l.label), h('b', { class: l.amount < 0 ? 'neg' : 'pos' }, fmtMoney(l.amount)))),
    ),
  );
}

/** Where each kind of to-do gets done. */
const TASK_APP: Record<string, AppId> = { coffee: 'brew', gift: 'bundl', reservation: 'tably', invoice: 'card' };

function renderNotes() {
  const d = day();
  const openTasks = S.tasks.filter((t) => t.status === 'open').sort((a, b) => a.deadline - b.deadline);
  const doneTasks = S.tasks.filter((t) => t.status !== 'open');
  const derived = derivedTodos();
  return h('div', { class: 'app notes' },
    head('Notes', 'Your survival guide'),
    h('div', { class: 'scroll', 'data-keep': 'notes' },
      h('h4', {}, 'To-do', openTasks.length + derived.length > 0 && h('span', { class: 'count' }, openTasks.length + derived.length)),
      openTasks.length + derived.length === 0 ? h('p', { class: 'muted small' }, S.tasks.length ? 'All done. For now.' : 'Nothing yet. Enjoy it.') : null,
      ...openTasks.map((t) => {
        const left = t.deadline - S.now;
        const app = TASK_APP[t.kind];
        return h('div', { class: `task open ${left <= 20 ? 'urgent' : ''}` },
          h('span', { class: 'task-box' }, '⬜'),
          h('span', { class: 'task-text' }, t.text.replace(/\s*\(by [^)]*\)/, ''),
            h('small', { class: `muted ${left <= 20 ? 'bad' : ''}` }, ` · by ${fmt(t.deadline)}${S.phase === 'day' ? (left <= 0 ? ' · now' : ` · ${left}m left`) : ''}`)),
          t.kind === 'promise' ? h('button', { class: 'task-go do', onclick: () => doPromise(t.id) }, '✓ Do it now')
          : t.kind === 'invoice' ? h('button', { class: 'task-go do', onclick: () => payInvoice(t.id) }, `💳 Pay $${t.amount}`)
          : app && hasApp(app) && h('button', { class: 'task-go', onclick: () => openApp(app) }, `${appOf(app).icon} Open ${appOf(app).name}`));
      }),
      ...derived.map((x) => {
        const left = x.by - S.now;
        return h('div', { class: `task open ${left <= 20 ? 'urgent' : ''}` },
          h('span', { class: 'task-box' }, x.app === 'ryde' ? '🚕' : '🍱'),
          h('span', { class: 'task-text' }, x.text, h('small', { class: `muted ${left <= 20 ? 'bad' : ''}` }, ` · by ${fmt(x.by)}${S.phase === 'day' ? ` · ${left}m left` : ''}`)),
          h('button', { class: 'task-go', onclick: () => { S.selected = x.eventId ?? null; detailOpen = true; drawerOpen = false; openApp('calendar'); dirty(); } }, '📅 Open meeting'));
      }),
      doneTasks.length > 0 && h('div', { class: 'task-done' },
        ...doneTasks.map((t) => h('div', { class: `task ${t.status}` }, h('span', {}, t.status === 'done' ? '✅' : '❌'), h('span', {}, t.text.replace(/\s*\(by [^)]*\)/, ''))))),
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
          : e.departed || e.status !== 'scheduled' ? h('span', { class: 'small muted' }, e.withRide ? '✓ rode' : 'drove')
          : h('button', { class: `btn ${e.withRide ? '' : 'primary'}`, onclick: () => toggleAddon(e.id, 'ride') }, e.withRide ? '✓ Booked' : `Book $${RIDE_COST * 2}`)))),
  );
}

let tablyParty = 4;

let trellisTab: 'open' | 'closed' = 'open';

function renderTrellis() {
  const open = S.tickets.filter((t) => t.status === 'open').sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2) || a.dueDay - b.dueDay);
  const unbooked = open.filter((t) => !ticketBlock(t.id)).length;
  const closed = S.tickets.filter((t) => t.status !== 'open').reverse();
  const card = (t: (typeof S.tickets)[number]) => {
    const blk = t.status === 'open' ? ticketBlock(t.id) : null;
    const pct = Math.round(((t.est - t.left) / t.est) * 100);
    const due = t.dueDay === S.dayIndex ? 'Due today' : t.dueDay === S.dayIndex + 1 ? 'Due tomorrow' : `Due ${dayDate(t.dueDay)}`;
    const where = blk ? (blk.e.start === null ? 'In requests, not booked yet' : `${blk.day === S.dayIndex ? 'Today' : dayDate(blk.day)}, ${span2(blk.e.start, blk.e.start + blk.e.duration)}`) : null;
    return h('div', { class: `ticket st-${t.status} ${t.status === 'open' && t.dueDay <= S.dayIndex ? 'urgent' : ''}` },
      h('div', { class: 'ticket-top' },
        face(t.who, 34),
        h('div', { class: 'ticket-text' },
          h('b', {}, h('span', { class: `prio-pill p${t.priority ?? 2}` }, `P${t.priority ?? 2}`), ' ', t.title),
          h('small', { class: 'muted' }, `${EXECS[t.who].short} · from ${t.from} · ${t.est}m`)),
      ),
      t.status === 'open' && h('div', { class: 'ticket-bar' }, h('span', { style: `width:${pct}%` })),
      h('div', { class: 'ticket-foot' },
        t.status === 'open'
          ? h('span', { class: `ticket-due ${t.dueDay <= S.dayIndex ? 'bad' : ''}` }, `⏰ ${due}`, t.left < t.est ? ` · ${t.left}m left` : '')
          : h('span', { class: 'ticket-due' }, t.status === 'done' ? '✅ Done' : '💀 Late'),
        t.status === 'open' && (blk
          ? h('button', { class: 'btn small-btn', onclick: () => { if (blk.e.start === null) { drawerOpen = true; S.selected = null; if (!split.matches) openApp('calendar'); dirty(); } else scheduleTicket(t.id); } }, blk.e.start === null ? '📥 In requests' : `📅 ${where}`)
          : h('button', { class: 'btn primary small-btn', onclick: () => scheduleTicket(t.id, false) }, '＋ Add to requests')),
      ),
    );
  };
  return h('div', { class: 'app trellis' },
    head('Trellis', 'Add tickets to your requests, then book them'),
    h('div', { class: 'scroll', 'data-keep': 'trellis' },
      h('div', { class: 'seg' },
        h('button', { class: `seg-btn ${trellisTab === 'open' ? 'on' : ''}`, onclick: () => { trellisTab = 'open'; dirty(); } }, `🎫 Open · ${open.length}`),
        h('button', { class: `seg-btn ${trellisTab === 'closed' ? 'on' : ''}`, onclick: () => { trellisTab = 'closed'; dirty(); } }, `Closed · ${closed.length}`)),
      trellisTab === 'open' && unbooked > 1 && h('button', { class: 'btn primary big trellis-all', onclick: scheduleAllTickets }, `📥 Add all ${unbooked} to requests`),
      trellisTab === 'open' && h('p', { class: 'muted small trellis-tip' }, '🎧 Work blocks aren\'t meetings: they can go in Theo\'s focus time or before Margo\'s 10am. Anything booked on top of one interrupts it (and costs 15 min to get back into it).'),
      ...(trellisTab === 'open' ? open : closed).map(card),
      (trellisTab === 'open' ? open : closed).length === 0 && h('div', { class: 'empty' }, trellisTab === 'open' ? 'Inbox zero. Suspicious. 🌱' : 'Nothing closed yet.'),
    ),
  );
}

function renderTably() {
  const open = S.tasks.filter((x) => x.kind === 'reservation');
  return h('div', { class: 'app tably' },
    head('Tably', 'Tonight'),
    h('div', { class: 'scroll', 'data-keep': 'tably' },
      ...open.map((x) => h('div', { class: `task ${x.status}` }, h('span', {}, x.status === 'done' ? '✅' : x.status === 'failed' ? '❌' : '⬜'), h('span', {}, x.text))),
      h('div', { class: 'stepper party' },
        h('span', { class: 'small muted lbl' }, 'Party'),
        h('button', { class: 'd-step', disabled: tablyParty <= 1, onclick: () => { tablyParty--; dirty(); } }, '−'),
        h('b', { class: 'party-n' }, `👥 ${tablyParty}`),
        h('button', { class: 'd-step', disabled: tablyParty >= 10, onclick: () => { tablyParty++; dirty(); } }, '+')),
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
  if (S.phase === 'day' && S.paused) return renderPaused();
  if (S.call) return renderCall();
  if (calSheet) return renderCalSheet();
  if (S.sheet) return renderSheet();
  return null;
}

/** The day stopped while you were away. Tap anywhere to pick it back up. */
function renderPaused() {
  return h('div', { class: 'paused-cover', role: 'button', 'aria-label': 'Resume', onclick: resume },
    h('div', { class: 'paused-card' },
      h('div', { class: 'paused-icon' }, '⏸'),
      h('b', {}, 'Paused while you were away'),
      h('span', {}, `${fmt(S.now)} · everyone is frozen mid-sentence`),
      h('small', {}, 'Tap anywhere to pick it back up')));
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
