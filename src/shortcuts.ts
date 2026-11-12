// Presto: one-tap shortcuts you set up ahead of time, then fire from a banner when the moment comes.
import { EXECS, PRODUCTS } from './data';
import { drinkEmoji, drinkName } from './drinks';
import { buyProduct, findEvent, hasApp, orderDrink, rideStale, rideUnneeded, toggleAddon, travelOf } from './engine';
import { S, banner, dirty, uid } from './state';
import type { ExecId, Shortcut } from './types';

export const MAX_SHORTCUTS = 4;

export function addShortcut(sc: Shortcut) {
  if (S.shortcuts.length >= MAX_SHORTCUTS) return;
  S.shortcuts.push({ ...sc, id: `sc${uid()}` });
  banner('presto', '⚡ Shortcut saved', shortcutLabel(sc));
}

export function removeShortcut(id: string) {
  S.shortcuts = S.shortcuts.filter((s) => s.id !== id);
  dirty();
}

export function shortcutLabel(sc: Shortcut): string {
  if (sc.kind === 'coffee') {
    return `${drinkEmoji(sc.drink)} ${drinkName(sc.drink)} → ${EXECS[sc.to].short}`;
  }
  if (sc.kind === 'gift') {
    const p = PRODUCTS.find((x) => x.id === sc.product)!;
    return `${p.emoji} Gift: ${p.name} ($${p.price}, ${sc.pay === 'me' ? 'my card' : 'company card'})`;
  }
  return '🚕 Sort out every ride';
}

export interface ShortcutCtx { taskId?: string; eventId?: string }

/** Every ride that needs attention today (missing, wrong address, or for a meeting that went remote). */
function ridesNeedingWork(onlyId?: string) {
  return S.events.filter(
    (e) =>
      (!onlyId || e.id === onlyId) && e.status === 'scheduled' && e.start !== null && !e.departed && !!e.travel &&
      (rideUnneeded(e) || rideStale(e) || (travelOf(e) > 0 && !e.withRide)),
  );
}

export function runShortcut(sc: Shortcut, ctx: ShortcutCtx = {}) {
  if (sc.kind === 'coffee') {
    orderDrink(sc.drink, sc.to, null);
    return;
  }
  if (sc.kind === 'gift') {
    const task =
      S.tasks.find((t) => t.id === ctx.taskId && t.status === 'open') ?? S.tasks.find((t) => t.kind === 'gift' && t.status === 'open');
    if (!task || !task.recipient) {
      banner('presto', '⚡ Nothing to send', 'Nobody needs a gift right now. (Yet.)');
      return;
    }
    buyProduct(sc.product, task.recipient, sc.pay);
    return;
  }
  const todo = ridesNeedingWork(ctx.eventId && findEvent(ctx.eventId) ? ctx.eventId : undefined);
  let booked = 0, fixed = 0, cancelled = 0;
  for (const e of todo) {
    if (rideUnneeded(e)) cancelled++;
    else if (rideStale(e)) fixed++;
    else booked++;
    toggleAddon(e.id, 'ride');
  }
  const bits = [booked && `booked ${booked}`, fixed && `re-routed ${fixed}`, cancelled && `cancelled ${cancelled}`].filter(Boolean);
  banner('ryde', '🚕 Rides sorted', bits.length ? bits.join(', ') : 'All rides were already fine.');
}

export type Trigger = { kind: 'coffee'; exec: ExecId; taskId?: string } | { kind: 'gift'; taskId?: string } | { kind: 'ride'; eventId?: string };

/** Something happened that a saved shortcut could handle: pop a banner with a one-tap button. */
export function offerShortcut(tr: Trigger) {
  if (!hasApp('presto')) return;
  const sc = S.shortcuts.find((s) =>
    tr.kind === 'coffee' ? s.kind === 'coffee' && s.to === tr.exec : tr.kind === 'gift' ? s.kind === 'gift' : s.kind === 'rides',
  );
  if (!sc) return;
  if (tr.kind === 'ride' && ridesNeedingWork(tr.eventId).length === 0) return;
  const ctx: ShortcutCtx = tr.kind === 'ride' ? { eventId: tr.eventId } : { taskId: tr.taskId };
  banner('presto', '⚡ Shortcut ready', shortcutLabel(sc), { label: '⚡ Run', run: () => runShortcut(sc, ctx) }, 10000);
}
