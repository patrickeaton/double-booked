// Trellis: tickets that need heads-down time, not meetings.
import type { Effects, ExecId } from './types';

export interface Ticket {
  id: string;
  title: string;
  who: ExecId;
  /** Who filed it. */
  from: string;
  est: number;
  /** Minutes of real, uninterrupted work still needed. */
  left: number;
  dueDay: number;
  /** 1 = urgent, 2 = normal, 3 = whenever. Scales the payoff and the cost of missing it. */
  priority?: 1 | 2 | 3;
  status: 'open' | 'done' | 'late';
  reward: Effects;
  late: Effects;
  day: number;
}

type T = { title: string; who: ExecId; from: string; est: number };

const POOL: T[] = [
  { title: 'Fix the sentiment model (it called a cactus "needy")', who: 'theo', from: 'Ana', est: 90 },
  { title: 'Migrate off MossDB', who: 'theo', from: 'Theo', est: 120 },
  { title: 'Write the staging-outage postmortem', who: 'theo', from: 'Margo', est: 60 },
  { title: 'Review the PR backlog (14 open)', who: 'theo', from: 'Wren', est: 90 },
  { title: 'Rate-limit the "talk to your fern" API', who: 'theo', from: 'Priya', est: 60 },
  { title: 'Write the Kestrel follow-up memo', who: 'margo', from: 'Tobias', est: 60 },
  { title: 'Rewrite the pitch deck (v14)', who: 'margo', from: 'Margo', est: 90 },
  { title: 'Sign off the Q2 hiring plan', who: 'margo', from: 'Bev', est: 60 },
  { title: 'Draft all-hands talking points', who: 'margo', from: 'Bev', est: 45 },
  { title: 'Approve the billboard copy (finally)', who: 'margo', from: 'Sam', est: 45 },
  { title: 'Build the board KPI dashboard', who: 'dana', from: 'Gerald', est: 90 },
  { title: 'Review vendor contracts', who: 'dana', from: 'Dev', est: 60 },
  { title: 'Laminate the new org chart', who: 'dana', from: 'Dana', est: 45 },
  { title: 'Write the "process for processes" doc', who: 'dana', from: 'Dana', est: 60 },
  { title: 'File your expense reports', who: 'me', from: 'Dev', est: 45 },
  { title: 'Write an onboarding doc for the next EA', who: 'me', from: 'Bev', est: 60 },
  { title: 'Clean up the shared calendars', who: 'me', from: 'Margo', est: 45 },
];

const rewardFor = (t: T): Effects => (t.who === 'me' ? { standing: 2, stress: -3 } : { standing: 3 });
const lateFor = (t: T): Effects => (t.who === 'me' ? { stress: 5, standing: -2 } : t.who === 'theo' ? { morale: -3, standing: -2 } : { standing: -4 });

export const PRIORITY_MULT = { 1: 2, 2: 1, 3: 0.5 } as const;
export const PRIORITY_LABEL = { 1: 'P1 · Urgent', 2: 'P2 · Normal', 3: 'P3 · Whenever' } as const;
const scale = (fx: Effects, k: number): Effects => Object.fromEntries(Object.entries(fx).map(([m, v]) => [m, Math.round((v as number) * k) || Math.sign(v as number)]));

/** Day 0 is a Wednesday. Next weekday on or after `i`. */
const workday = (i: number) => {
  while ([0, 6].includes((3 + i) % 7)) i++;
  return i;
};

/** New tickets for a day: seeded, so a replay brings the same ones. */
export function ticketsFor(dayIndex: number, seed: number, execs: ExecId[], taken: string[], count: number): Ticket[] {
  let a = (seed + dayIndex * 104729) >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Ticket[] = [];
  const opts = POOL.filter((t) => execs.includes(t.who) && !taken.includes(t.title));
  for (let n = 0; n < count && opts.length; n++) {
    const t = opts.splice(Math.floor(r() * opts.length), 1)[0];
    const roll = r();
    const priority: 1 | 2 | 3 = roll < 0.22 ? 1 : roll < 0.72 ? 2 : 3;
    // Urgent ones are due sooner.
    const dueDay = workday(dayIndex + 1 + (priority === 1 ? 0 : Math.floor(r() * 3)));
    const k = PRIORITY_MULT[priority];
    out.push({ id: `t${dayIndex}-${n}`, title: t.title, who: t.who, from: t.from, est: t.est, left: t.est, dueDay, priority, status: 'open', reward: scale(rewardFor(t), k), late: scale(lateFor(t), k), day: dayIndex });
  }
  return out;
}
