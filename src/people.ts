// The Team tab in Pulse: everyone you've met, what you know about them, and where things stand.
import { EXECS } from './data';
import { drinkName } from './drinks';
import { personKey } from './avatars';
import { S } from './state';
import type { ExecId } from './types';

export interface Person {
  key: string;
  name: string;
  role: string;
  bio: string;
  facts: string[];
  /** Calendar you manage, if any. */
  exec?: ExecId;
  personal?: boolean;
}

export const PEOPLE: Person[] = [
  { key: 'margo', exec: 'margo', name: 'Margo Vance', role: 'Founder & CEO', bio: 'Started Sproutly after her fern "said something". Runs on kombucha and conviction.', facts: EXECS.margo.quirks },
  { key: 'theo', exec: 'theo', name: 'Theo Okafor', role: 'CTO', bio: 'Built the plant-talking AI. Would like to be left alone with it.', facts: EXECS.theo.quirks },
  { key: 'dana', exec: 'dana', name: 'Dana Reyes', role: 'Interim COO', bio: "The board's idea. Laminates things.", facts: EXECS.dana.quirks },
  { key: 'bev', name: 'Bev', role: 'People Ops', bio: 'Warm, relentless, always holding a folder. Runs your probation.', facts: ['Signs off emails with 💐.', 'Three "Quick chat? 🙂" invites and you\'re out.'] },
  { key: 'wren', name: 'Wren', role: 'Design', bio: 'Has "a few concerns". Always has a few concerns. Notices everything.', facts: ['Will tip you off when something is off.', 'Breaks staging about once a week.'] },
  { key: 'sam', name: 'Sam', role: 'Marketing', bio: 'Enthusiastic. Writes billboards. May or may not be "restructured".', facts: ['Borrows the company card for "marketing lunches".'] },
  { key: 'priya', name: 'Priya', role: 'Sales', bio: 'Closes deals. Opens them again when they wobble.', facts: [] },
  { key: 'ana', name: 'Ana', role: 'Customer Success', bio: "Fields every \"my plant said something mean\" ticket.", facts: [] },
  { key: 'dev', name: 'Dev', role: 'Finance', bio: 'Knows exactly how many days of money are left. Wishes he didn\'t.', facts: [] },
  { key: 'kai', name: 'Kai', role: 'Intern', bio: 'Still not sure what Sproutly does. Neither is anyone, really.', facts: [] },
  { key: 'kendall', name: 'Kendall', role: 'Backup EA', bio: 'Here "just in case". Very helpful. Usually.', facts: ['Edits calendars without asking (look for ✏️).'] },
  { key: 'gerald', name: 'Gerald Pemberton', role: 'Board member', bio: 'Speaks in short sentences. Signs off "— G". Knows more than he says.', facts: ["Doesn't \"do video\"."] },
  { key: 'tobias', name: 'Tobias', role: 'Kestrel Ventures', bio: "Sproutly's best shot at funding. Genuinely rooting for you.", facts: [] },
  { key: 'jules', name: 'Jules', role: 'Your partner', bio: 'Patient. Mostly.', facts: ["Birthday: Friday of week two. Lucca's, 7pm."], personal: true },
  { key: 'mum', name: 'Mum', role: 'Your mum', bio: 'Wants to know if you\'re eating.', facts: [], personal: true },
  { key: 'ollie', name: 'Ollie', role: 'Your flatmate', bio: 'Reports on the flat in real time, mostly in capitals.', facts: [], personal: true },
];

const f = (x: string) => S.flags.includes(x);

/** Met = they've messaged you, or you manage their calendar. */
export function metPeople(): Person[] {
  const talked = new Set(S.messages.map((m) => personKey(m.from)));
  if (f('kendall-sabotaged') || S.kendall.helped > 0) talked.add('kendall');
  return PEOPLE.filter((p) => talked.has(p.key) || (p.exec && S.dayIndex >= ({ margo: 0, theo: 1, dana: 7 } as Record<string, number>)[p.exec]));
}

/** What's going on with them right now, if anything. */
export function statusOf(p: Person): string | null {
  switch (p.key) {
    case 'theo': return f('gone-theo') ? '🚪 Left for Leafly' : f('theo-leaves') && S.dayIndex >= 12 ? '📦 Last day today' : f('theo-leaves') ? '🤫 Quietly interviewing' : f('theo-talk') ? '🤫 Talking to Leafly' : null;
    case 'dana': return f('gone-dana') ? '🚪 Let go after the board vote' : f('honest-gerald') && S.dayIndex >= 12 ? '📋 Permanent COO' : null;
    case 'margo': return f('margo-ousted') ? '🎨 "Chief Visionary Officer"' : null;
    case 'kendall': return f('kendall-reported') && f('kendall-sabotaged') ? '🖨️ Moved to "special projects"' : S.kendall.sabotaged > 0 ? `✏️ Has edited your calendars ${S.kendall.helped + S.kendall.sabotaged}×` : S.kendall.helped > 0 ? `✏️ Has helped ${S.kendall.helped}×` : null;
    case 'wren': return f('wren-quits') ? '🚪 Thinking about leaving' : null;
    case 'sam': return f('funded') ? '😭 Not restructured!' : f('lied-to-sam') ? '😬 Thinks it\'s "probably nothing"' : f('told-sam') ? '😟 Knows about the restructuring' : null;
    case 'jules': return f('missed-birthday') ? (f('apologized') ? '❤️‍🩹 Forgave the birthday (mostly)' : '💔 Upset about the birthday') : f('went-birthday') ? '❤️ Still glowing about the birthday' : null;
    case 'mum': return f('called-mum') ? '✅ All clear' : null;
    case 'gerald': return f('backed-margo') ? 'You told him to back Margo' : f('honest-gerald') ? 'You said Margo needs a COO' : f('theo-ceo') ? 'You said Theo should run it' : null;
    default: return null;
  }
}

/** Coffee order, once you've learned it. */
export function coffeeOf(p: Person): string | null {
  if (!p.exec) return null;
  return f(`drink-${p.exec}`) ? drinkName(EXECS[p.exec].drink) : '??? (listen for clues)';
}
