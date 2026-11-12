// Presto: one-tap shortcuts you set up ahead of time, then fire from a banner when the moment comes.
import { EXECS, PRODUCTS } from './data';
import { drinkEmoji, drinkName } from './drinks';
import { buyProduct, findEvent, hasApp, orderDrink, rideStale, rideUnneeded, toggleAddon, travelOf } from './engine';
import { S, banner, dirty, uid } from './state';
import type { CalEvent, ExecId, RideAction, Shortcut } from './types';

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
  const who = EXECS[sc.to].short;
  return sc.action === 'book' ? `🚕 Book ${who}'s next ride` : sc.action === 'reroute' ? `🔁 Re-route ${who}'s ride` : `✖️ Cancel ${who}'s ride`;
}

export interface ShortcutCtx { taskId?: string; eventId?: string }

/** What this ride needs, if anything. */
export function rideProblem(e: CalEvent): RideAction | null {
  if (e.status !== 'scheduled' || e.start === null || e.departed || !e.travel) return null;
  if (rideUnneeded(e)) return 'cancel';
  if (rideStale(e)) return 'reroute';
  if (travelOf(e) > 0 && !e.withRide) return 'book';
  return null;
}

/** The one meeting a ride shortcut acts on: the one it was offered for, else the soonest that fits. */
function rideTarget(action: RideAction, to: ExecId, eventId?: string) {
  const fits = (e: CalEvent) => rideProblem(e) === action && e.attendees.includes(to);
  const hinted = eventId ? findEvent(eventId) : undefined;
  if (hinted && fits(hinted)) return hinted;
  return S.events.filter(fits).sort((a, b) => a.start! - b.start!)[0];
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
  const e = rideTarget(sc.action, sc.to, ctx.eventId);
  if (!e) {
    banner('presto', '⚡ Nothing to do', `${shortcutLabel(sc)}: no ride needs that right now.`);
    return;
  }
  toggleAddon(e.id, 'ride');
  const verb = sc.action === 'book' ? 'Booked' : sc.action === 'reroute' ? `Re-routed to ${e.place}` : 'Cancelled';
  banner('ryde', '🚕 Done', `${verb}: ${e.title}`);
}

export type Trigger = { kind: 'coffee'; exec: ExecId; taskId?: string } | { kind: 'gift'; taskId?: string } | { kind: 'ride'; eventId?: string };

/** For an offer: only the exact meeting that just changed counts (or any, for new requests with no id). */
function rideFor(action: RideAction, to: ExecId, eventId?: string) {
  if (!eventId) return rideTarget(action, to);
  const e = findEvent(eventId);
  return e && rideProblem(e) === action && e.attendees.includes(to) ? e : undefined;
}

/** Something happened that a saved shortcut could handle: pop a banner with a one-tap button. */
export function offerShortcut(tr: Trigger) {
  if (!hasApp('presto')) return;
  const sc = S.shortcuts.find((s) =>
    tr.kind === 'coffee' ? s.kind === 'coffee' && s.to === tr.exec : tr.kind === 'gift' ? s.kind === 'gift' : s.kind === 'ride' && !!rideFor(s.action, s.to, tr.eventId),
  );
  if (!sc) return;
  const ctx: ShortcutCtx = tr.kind === 'ride' ? { eventId: tr.eventId } : { taskId: tr.taskId };
  banner('presto', '⚡ Shortcut ready', shortcutLabel(sc), { label: '⚡ Run', run: () => runShortcut(sc, ctx) }, 10000);
}
