import { CAL_END, CAL_START, DAYS, DAY_END, DRINKS, EXECS, PAYROLL, PRODUCTS, RULES, fmt } from './data';
import {
  answerCall, buyProduct, choose, chooseCall, continueGame, day, declineCall, declineEvent, findEvent, issuesFor,
  minStart, newGame, nextDay, openApp, orderDrink, placeEvent, retryDay, select, startDay, startPrep, togglePause,
  toggleSpeed, unschedule,
} from './engine';
import { METER_LABEL, S, dirty, fmtEffect, fmtMoney, isGood, readSave, setRenderer } from './state';
import type { AppId, CalEvent, ExecId, InboxApp, Meter } from './types';

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

const APPS: { id: AppId; name: string; icon: string; color: string }[] = [
  { id: 'calendar', name: 'Calendar', icon: '📅', color: '#ff5b5b' },
  { id: 'mail', name: 'Mail', icon: '✉️', color: '#3d8bff' },
  { id: 'huddle', name: 'Huddle', icon: '💬', color: '#7b5cff' },
  { id: 'messages', name: 'Messages', icon: '💚', color: '#2fc463' },
  { id: 'brew', name: 'Brew', icon: '☕', color: '#a86b3c' },
  { id: 'bundl', name: 'Bundl', icon: '📦', color: '#ff9f1c' },
  { id: 'card', name: 'Card', icon: '💳', color: '#1f2a44' },
  { id: 'notes', name: 'Notes', icon: '📝', color: '#f5c518' },
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
    if (S.banners.some((b) => now - b.born > 4500) || S.toasts.some((t) => now - t.born > 1800)) dirty();
  }, 400);
  render();
}

function keepScroll(container: HTMLElement, build: () => void) {
  const saved = new Map<string, number>();
  container.querySelectorAll<HTMLElement>('[data-keep]').forEach((el) => saved.set(el.dataset.keep!, el.scrollTop));
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
    if (saved.has(k)) el.scrollTop = saved.get(k)!;
    else if (el.dataset.initial) el.scrollTop = Number(el.dataset.initial);
  });
}
const stickCounts = new Map<string, number>();

function render() {
  const isSplit = split.matches;
  refs.device.classList.toggle('is-split', isSplit);
  refs.device.classList.toggle('is-day', S.phase === 'day');

  refs.status.replaceChildren(renderStatus());
  refs.meters.replaceChildren(...renderMeters());

  keepScroll(refs.main, () => {
    const panes: HTMLElement[] = [];
    if (isSplit) {
      if (S.app === 'calendar') S.app = 'mail';
      panes.push(h('section', { class: 'pane pane-cal' }, renderCalendar()));
      panes.push(h('section', { class: 'pane pane-app' }, renderApp(S.app)));
    } else {
      panes.push(h('section', { class: 'pane pane-app' }, S.app === 'calendar' ? renderCalendar() : renderApp(S.app)));
    }
    refs.main.replaceChildren(...panes);
  });

  refs.dock.replaceChildren(...renderDock(isSplit));

  const now = performance.now();
  S.banners = S.banners.filter((b) => now - b.born < 4500);
  S.toasts = S.toasts.filter((t) => now - t.born < 1800);
  refs.banners.replaceChildren(
    ...S.banners.slice(-2).map((b) =>
      h('button', { class: 'banner', style: `animation-delay:${b.born - now}ms`, onclick: () => openApp(b.app) },
        h('span', { class: 'banner-icon', style: `background:${appOf(b.app).color}` }, appOf(b.app).icon),
        h('span', { class: 'banner-text' }, h('b', {}, b.title), h('span', {}, b.body)),
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
function renderStatus() {
  const time = S.phase === 'prep' || S.phase === 'memo' ? fmt(S.now) : S.phase === 'day' ? fmt(S.now) : '—';
  const label = S.phase === 'prep' ? 'Morning prep' : S.phase === 'day' ? (S.paused ? 'Paused' : 'Workday') : '';
  return h('div', { class: 'status-inner' },
    h('span', { class: 'clock' }, time, label && h('small', {}, label)),
    h('span', { class: 'day-pill' }, `Day ${S.dayIndex + 1}/30`),
    h('span', { class: 'status-right' },
      S.phase === 'day' && h('button', { class: 'chip-btn', onclick: toggleSpeed, title: 'Speed' }, `${S.speed}×`),
      S.phase === 'day' && h('button', { class: 'chip-btn', onclick: togglePause, title: 'Pause' }, S.paused ? '▶' : '⏸'),
    ),
  );
}

const METER_ICON: Record<Meter, string> = { standing: '⭐', runway: '💸', morale: '🤝', stress: '😰' };

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
  return 0;
}

function renderDock(isSplit: boolean) {
  return APPS.filter((a) => !(isSplit && a.id === 'calendar')).map((a) => {
    const n = badgeFor(a.id);
    return h('button', { class: `dock-app ${S.app === a.id ? 'active' : ''}`, onclick: () => openApp(a.id) },
      h('span', { class: 'app-icon', style: `background:${a.color}` }, a.icon, n > 0 && h('span', { class: 'badge' }, n)),
      h('span', { class: 'app-name' }, a.name),
    );
  });
}

// ───────────────────────────── calendar ─────────────────────────────
function renderCalendar() {
  const d = day();
  const execs = d.execs;
  const pending = S.events.filter((e) => e.status === 'pending');
  const sel = findEvent(S.selected);

  const header = h('header', { class: 'app-head' },
    h('h2', {}, 'Calendar'),
    S.phase === 'prep'
      ? h('button', { class: 'btn primary', onclick: startDay }, pending.length ? `Start day (${pending.length} unbooked) →` : 'Start day →')
      : h('span', { class: 'muted' }, S.phase === 'day' ? `${fmt(S.now)} · ends ${fmt(DAY_END)}` : ''),
  );

  const tray = h('div', { class: 'tray' },
    h('div', { class: 'tray-head' }, `Requests`, h('span', { class: 'count' }, pending.length),
      h('span', { class: 'muted hint' }, pending.length ? 'Drag onto the calendar, or tap then tap a time' : 'All booked 🎉')),
    h('div', { class: 'tray-cards' }, ...pending.map(renderCard)),
  );

  const selBar = sel ? renderSelection(sel) : null;

  const heads = h('div', { class: 'cal-heads' },
    h('div', { class: 'gutter' }),
    ...execs.map((x) => h('div', { class: 'cal-head', style: `--c:${EXECS[x].color}` }, h('span', { class: 'avatar' }, EXECS[x].emoji), h('span', {}, h('b', {}, EXECS[x].short), h('small', {}, EXECS[x].title)))),
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
    for (const e of S.events) {
      if (e.start === null || !e.attendees.includes(x) || e.status === 'declined') continue;
      col.append(renderBlock(e));
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
    h('div', { class: 'cal-grid', style: `height:${height}px` }, gutter, ...cols));

  return h('div', { class: `app cal ${sel ? 'placing' : ''}` }, header, tray, selBar, heads, scroller);
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

function renderBlock(e: CalEvent) {
  const start = e.start!;
  const issues = issuesFor(e);
  const bad = issues.some((i) => i.bad && i.icon !== '☕');
  const movable = !e.fixed && e.status === 'scheduled';
  const small = e.duration * PX < 34;
  const cls = ['evt', `st-${e.status}`, `k-${e.kind ?? 'meeting'}`, bad ? 'has-issue' : '', S.selected === e.id ? 'selected' : '', movable ? 'movable' : '', small ? 'small' : '', e.attendees.length > 1 ? 'multi' : '', e.fresh ? 'fresh' : ''].join(' ');
  const el = h('div', { class: cls, style: `top:${(start - CAL_START) * PX}px;height:${Math.max(16, e.duration * PX - 2)}px;--c:${EXECS[e.attendees[0]].color}` },
    h('div', { class: 'evt-title' }, e.status === 'missed' ? '💥 ' : e.status === 'done' ? '✓ ' : '', e.title),
    !small && h('div', { class: 'evt-time' }, `${fmt(start)}–${fmt(start + e.duration)}`, e.overranBy ? ` (+${e.overranBy}m)` : ''),
    !small && issues.length > 0 && e.status === 'scheduled' && h('div', { class: 'evt-issues' }, issues.map((i) => i.icon).join(' ')),
  );
  if (movable) makeDraggable(el, e.id, true);
  else el.addEventListener('click', () => select(e.id));
  return el;
}

function renderSelection(e: CalEvent) {
  const issues = issuesFor(e);
  const canAct = e.status === 'pending' || (e.status === 'scheduled' && !e.fixed);
  return h('div', { class: 'selbar' },
    h('div', { class: 'selbar-main' },
      h('b', {}, e.title),
      h('div', { class: 'muted small' },
        `${e.attendees.map((a) => EXECS[a].short).join(' & ')} · ${e.duration} min`,
        e.start !== null ? ` · ${fmt(e.start)}` : '',
        e.status !== 'scheduled' && e.status !== 'pending' ? ` · ${e.status}` : ''),
      e.note && h('div', { class: 'small note' }, e.note),
      issues.length > 0 && h('div', { class: 'req-tags' }, ...issues.map((i) => h('span', { class: `tag ${i.bad ? 'bad' : ''}` }, `${i.icon} ${i.text}`))),
      canAct && h('div', { class: 'small hint-strong' }, '👆 Tap a time on the calendar to place it'),
    ),
    h('div', { class: 'selbar-actions' },
      e.status === 'scheduled' && !e.fixed && h('button', { class: 'btn', onclick: () => unschedule(e.id) }, 'Unbook'),
      canAct && h('button', { class: 'btn danger', onclick: () => declineEvent(e.id) }, 'Decline'),
      h('button', { class: 'btn ghost', onclick: () => select(null) }, '✕'),
    ),
  );
}

function minuteAt(col: HTMLElement, clientY: number) {
  const r = col.getBoundingClientRect();
  return CAL_START + (clientY - r.top) / PX;
}

let suppressUntil = 0;

function makeDraggable(el: HTMLElement, id: string, isBlock: boolean) {
  el.addEventListener('pointerdown', (down: PointerEvent) => {
    if (down.button !== 0) return;
    const sx = down.clientX;
    const sy = down.clientY;
    const r = el.getBoundingClientRect();
    const offY = isBlock ? down.clientY - r.top : 0;
    const ev = findEvent(id)!;
    let ghost: HTMLElement | null = null;

    const move = (m: PointerEvent) => {
      if (!ghost && Math.hypot(m.clientX - sx, m.clientY - sy) > 7) {
        ghost = h('div', { class: 'ghost', style: `--c:${EXECS[ev.attendees[0]].color};height:${Math.max(18, ev.duration * PX)}px` }, h('b', {}, ev.title), h('span', { class: 'ghost-time' }));
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
      const moved = Math.hypot(u.clientX - sx, u.clientY - sy) > 7;
      if (ghost || moved) {
        ghost?.remove();
        suppressUntil = Date.now() + 250;
        const col = colAt(u.clientX, u.clientY);
        if (col && u.type === 'pointerup') placeEvent(id, minuteAt(col, u.clientY - offY));
      } else if (u.type === 'pointerup') {
        select(id);
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
    case 'huddle': return renderFeed('huddle', 'Huddle', '# general-chaos');
    case 'messages': return renderFeed('messages', 'Messages', 'Personal');
    case 'brew': return renderBrew();
    case 'bundl': return renderBundl();
    case 'card': return renderCard$();
    case 'notes': return renderNotes();
  }
}

const head = (title: string, sub?: Child, right?: Child) =>
  h('header', { class: 'app-head' }, h('h2', {}, title, sub && h('small', {}, sub)), right);

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
    return h('div', { class: 'reply' }, m.chosen === -1 ? h('i', { class: 'muted' }, 'No reply. (Too late.)') : `You: ${m.choices[m.chosen].label}`);
  }
  const left = m.expires !== undefined && S.phase === 'day' ? Math.max(0, m.expires - S.now) : null;
  return h('div', { class: 'choices' },
    left !== null && h('div', { class: 'expires' }, `⏳ needs an answer in ${left} min`),
    ...m.choices.map((c, i) => h('button', { class: 'btn choice', onclick: () => choose(m.id, i) }, c.label)),
  );
}

function renderMail() {
  const mails = S.messages.filter((m) => m.app === 'mail').slice().reverse();
  const open = S.messages.find((m) => m.id === S.openMail);
  if (open) {
    open.read = true;
    return h('div', { class: 'app mail' },
      head('Mail', undefined, h('button', { class: 'btn ghost', onclick: () => { S.openMail = null; dirty(); } }, '‹ Inbox')),
      h('div', { class: 'scroll', 'data-keep': `mail-${open.id}` },
        h('article', { class: 'mail-open' },
          h('div', { class: 'mail-from' }, h('span', { class: 'avatar-dot', style: `background:${avatarColor(open.from)}` }, open.from[0]), h('div', {}, h('b', {}, open.from), h('div', { class: 'muted small' }, fmt(open.at)))),
          h('h3', {}, open.subject ?? '(no subject)'),
          h('div', { class: 'mail-body' }, open.body),
          choiceButtons(open),
        ),
      ),
    );
  }
  return h('div', { class: 'app mail' },
    head('Mail', `${mails.filter((m) => !m.read).length} unread`),
    h('div', { class: 'scroll', 'data-keep': 'mail' },
      mails.length === 0 ? h('p', { class: 'empty' }, 'Inbox zero. Enjoy it while it lasts.') : null,
      ...mails.map((m) =>
        h('button', { class: `mail-row ${m.read ? '' : 'unread'}`, onclick: () => { S.openMail = m.id; dirty(); } },
          h('span', { class: 'avatar-dot', style: `background:${avatarColor(m.from)}` }, m.from[0]),
          h('span', { class: 'mail-row-text' },
            h('span', { class: 'mail-row-top' }, h('b', {}, m.from), h('span', { class: 'muted small' }, fmt(m.at))),
            h('span', { class: 'mail-subj' }, m.choices && m.chosen === undefined ? '⚡ ' : '', m.subject ?? ''),
            h('span', { class: 'muted small clamp' }, m.body),
          ),
        ),
      ),
    ),
  );
}

function renderFeed(app: InboxApp, title: string, sub: string) {
  const msgs = S.messages.filter((m) => m.app === app);
  msgs.forEach((m) => (m.read = true));
  return h('div', { class: `app feed feed-${app}` },
    head(title, sub),
    h('div', { class: 'scroll', 'data-keep': `feed-${app}`, 'data-stick': 'bottom', 'data-count': msgs.length },
      msgs.length === 0 ? h('p', { class: 'empty' }, app === 'messages' ? 'No texts yet. Your friends think you\'re busy.' : 'Quiet… too quiet.') : null,
      ...msgs.map((m) =>
        h('div', { class: 'bubble-row' },
          h('span', { class: 'avatar-dot', style: `background:${avatarColor(m.from)}` }, m.from[0]),
          h('div', { class: 'bubble-wrap' },
            h('div', { class: 'bubble-meta' }, h('b', {}, m.from), h('span', { class: 'muted small' }, fmt(m.at))),
            h('div', { class: 'bubble' }, m.body),
            choiceButtons(m),
          ),
        ),
      ),
    ),
  );
}

let brewFor: string = 'margo';

function renderBrew() {
  const execs = day().execs;
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
      brewFor !== 'me' && h('p', { class: 'muted small hintline' }, known(brewFor as ExecId) ? `📝 Notes say: ${DRINKS.find((d) => d.id === EXECS[brewFor as ExecId].drink)!.name}` : '📝 You don\'t know their order yet. Guess?'),
      h('div', { class: 'drink-grid' },
        ...DRINKS.map((d) => h('button', { class: 'drink', onclick: () => orderDrink(d.id, brewFor) },
          h('span', { class: 'drink-emoji' }, d.emoji), h('b', {}, d.name), h('span', { class: 'muted small' }, `$${d.price}`)))),
      orders.length > 0 && h('h4', {}, 'Orders'),
      ...orders.map((o) => h('div', { class: 'order-row' },
        h('span', {}, `${DRINKS.find((d) => d.id === o.item)?.emoji} ${o.label}`),
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
      ...d.execs.map((x) => {
        const e = EXECS[x];
        return h('div', { class: 'dossier', style: `--c:${e.color}` },
          h('div', { class: 'dossier-head' }, h('span', { class: 'avatar' }, e.emoji), h('div', {}, h('b', {}, e.name), h('div', { class: 'muted small' }, e.title))),
          h('div', { class: 'small' }, '☕ ', S.flags.includes(`drink-${x}`) ? DRINKS.find((dr) => dr.id === e.drink)!.name : '??? (listen for clues)'),
          ...e.quirks.map((q) => h('div', { class: 'small' }, '• ', q)),
        );
      }),
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
  if (S.sheet) return renderSheet();
  return null;
}

function renderTitle() {
  const save = readSave();
  return h('div', { class: 'card-screen title-screen' },
    h('div', { class: 'logo' }, '📅'),
    h('h1', {}, 'Double Booked'),
    h('p', { class: 'tagline' }, '30 days of probation. One phone. Zero right answers.'),
    h('div', { class: 'stack' },
      save && save.dayIndex > 0 && h('button', { class: 'btn primary big', onclick: continueGame }, `Continue · Day ${save.dayIndex + 1}`),
      h('button', { class: `btn ${save && save.dayIndex > 0 ? '' : 'primary'} big`, onclick: newGame }, 'New game'),
    ),
    h('p', { class: 'muted small' }, 'Prototype · Days 1–3'),
  );
}

function renderMemo() {
  const d = day();
  return h('div', { class: 'card-screen memo', 'data-keep': 'memo' },
    h('div', { class: 'eyebrow' }, `Day ${S.dayIndex + 1} of 30`),
    h('h1', {}, d.title),
    h('p', { class: 'tagline' }, d.subtitle),
    h('div', { class: 'memo-mail' },
      h('div', { class: 'muted small' }, `From: ${d.memo.from}`),
      h('b', {}, d.memo.subject),
      h('p', {}, d.memo.body),
    ),
    h('div', { class: 'rules' }, h('h4', {}, "Today's rules"), ...d.rules.map((r) => h('div', { class: 'rule' }, '📌 ', RULES[r].text))),
    h('button', { class: 'btn primary big', onclick: startPrep }, 'Start morning prep ☕'),
  );
}

function renderReview() {
  const r = S.review!;
  const row = (m: Meter) => {
    const v = r.deltas[m];
    return h('div', { class: 'delta-row' }, h('span', {}, METER_ICON[m], ' ', METER_LABEL[m]),
      h('b', { class: v === 0 ? '' : isGood(m, v) ? 'pos' : 'neg' }, v === 0 ? '—' : fmtEffect(m, v).replace(` ${METER_LABEL[m]}`, '')));
  };
  const last = S.dayIndex + 1 >= DAYS.length;
  return h('div', { class: 'card-screen review', 'data-keep': 'review' },
    h('div', { class: 'eyebrow' }, `End of Day ${S.dayIndex + 1}`),
    h('h1', {}, '6:00pm. You survived.'),
    h('div', { class: 'boss-note' }, h('span', { class: 'avatar' }, '🌱'), h('div', {}, h('b', {}, 'Margo'), h('div', {}, r.bossNote))),
    h('div', { class: 'deltas' }, ...(['standing', 'runway', 'morale', 'stress'] as Meter[]).map(row)),
    r.highlights.length > 0 && h('h4', {}, 'Highlights'),
    ...r.highlights.map((l) => h('div', { class: 'highlight' }, h('span', { class: 'muted small' }, fmt(l.at)), h('span', {}, l.text),
      h('span', { class: 'fx' }, ...(Object.entries(l.effects) as [Meter, number][]).filter(([, v]) => v).map(([m, v]) => h('span', { class: isGood(m, v) ? 'pos' : 'neg' }, fmtEffect(m, v)))))),
    ...r.notes.map((n) => h('p', { class: 'small note' }, '🌙 ', n)),
    ...r.newStrikes.map((n) => h('div', { class: 'strike-note' }, '📅 "Quick chat? 🙂" — strike! ', n)),
    h('div', { class: 'strikes big' }, ...[0, 1, 2].map((i) => h('span', { class: i < S.strikes ? 'on' : '' }, '✕'))),
    h('button', { class: 'btn primary big', onclick: nextDay }, last ? 'See how you did →' : `Sleep. Day ${S.dayIndex + 2} →`),
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
    h('p', { class: 'muted small' }, `Day ${S.dayIndex + 1} of 30.`),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary big', onclick: retryDay }, `Retry Day ${S.dayIndex + 1}`),
      h('button', { class: 'btn big', onclick: newGame }, 'Start over'),
    ),
  );
}

function renderEnd() {
  const m = S.meters;
  return h('div', { class: 'card-screen end' },
    h('div', { class: 'logo' }, '🌱'),
    h('h1', {}, '3 days down. 27 to go.'),
    h('p', {}, "That's the end of the prototype. You're still employed, which is more than your three predecessors managed."),
    h('div', { class: 'deltas' },
      h('div', { class: 'delta-row' }, h('span', {}, '⭐ Standing'), h('b', {}, Math.round(m.standing))),
      h('div', { class: 'delta-row' }, h('span', {}, '💸 Runway'), h('b', {}, fmtMoney(m.runway))),
      h('div', { class: 'delta-row' }, h('span', {}, '🤝 Morale'), h('b', {}, Math.round(m.morale))),
      h('div', { class: 'delta-row' }, h('span', {}, '😰 Stress'), h('b', {}, Math.round(m.stress))),
      h('div', { class: 'delta-row' }, h('span', {}, '✕ Strikes'), h('b', {}, `${S.strikes}/3`)),
    ),
    h('button', { class: 'btn primary big', onclick: newGame }, 'Play again'),
  );
}

function renderCall() {
  const c = S.call!;
  if (c.status === 'ringing') {
    return h('div', { class: 'call ringing' },
      h('div', { class: 'call-avatar' }, c.from[0]),
      h('h2', {}, c.from),
      h('p', { class: 'muted' }, `Incoming call… (${Math.max(0, c.ringUntil - S.now)} min)`),
      h('div', { class: 'call-btns' },
        h('button', { class: 'round decline', onclick: declineCall }, '✕'),
        h('button', { class: 'round answer', onclick: answerCall }, '✆'),
      ),
    );
  }
  return h('div', { class: 'call active' },
    h('div', { class: 'call-avatar small' }, c.from[0]),
    h('h3', {}, c.from),
    h('div', { class: 'call-lines' }, ...c.lines.map((l) => h('p', {}, l))),
    h('div', { class: 'stack' }, ...c.choices.map((ch, i) => h('button', { class: 'btn choice', onclick: () => chooseCall(i) }, ch.label))),
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
