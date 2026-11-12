// The ad-hoc pool: small requests, errands and dilemmas drawn at random each day,
// on top of the day's hand-written story beats. Seeded, so retrying a day replays the same draw.
import { TABLE_TIMES, fmt, isBoss, t } from './data';
import type { AppId, Choice, DayDef, Effects, EventDef, ExecId, InboxApp, Script } from './types';

type Rng = () => number;
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: Rng, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const chance = (r: Rng, p: number) => r() < p;
const q15 = (m: number) => Math.round(m / 15) * 15;

const STAKES: Record<'low' | 'mid' | 'high', { reward: Effects; miss: Effects; decline: Effects }> = {
  low: { reward: { morale: 2 }, miss: { morale: -3 }, decline: { morale: -2 } },
  mid: { reward: { standing: 3 }, miss: { standing: -5 }, decline: { standing: -3 } },
  high: { reward: { standing: 5, runway: 1500 }, miss: { standing: -8, runway: -1000 }, decline: { standing: -7 } },
};

interface MeetT {
  key: string;
  from: string;
  app: InboxApp;
  title: string;
  body: string;
  who: ExecId | 'any' | 'both';
  dur: number[];
  stakes: 'low' | 'mid' | 'high';
  travel?: [number, string, string]; // minutes, place, alternate place
  remoteOk?: 'fine' | 'meh';
  overrun?: number[];
  note?: string;
}

const MEETINGS: MeetT[] = [
  { key: 'priya', from: 'Priya (Sales)', app: 'huddle', title: 'Deal review · Priya', body: 'can I steal {exec} for {dur} before {by}? a deal is wobbling 😬', who: 'margo', dur: [15, 30], stakes: 'mid' },
  { key: 'fern', from: 'Ana (Customer Success)', app: 'huddle', title: "Escalation: a customer's fern is \"sad\"", body: "our app told a customer's fern it was \"disappointing\". they're upset. the customer too. need {exec} for {dur} before {by} 🌿", who: 'any', dur: [15, 30], stakes: 'mid' },
  { key: 'dev', from: 'Dev (Finance)', app: 'mail', title: 'Budget Q’s · Dev', body: 'Need {dur} with {exec} about "the numbers" before {by}. They\'re fine. Mostly. — Dev', who: 'margo', dur: [30], stakes: 'mid' },
  { key: 'wren', from: 'Wren', app: 'huddle', title: 'Design crit · Wren', body: '{dur} with {exec} for the new logo? it’s a leaf. but MORE.', who: 'any', dur: [30, 45], stakes: 'low', overrun: [15] },
  { key: 'sam', from: 'Sam (Marketing)', app: 'huddle', title: 'Billboard sign-off · Sam', body: 'need {exec} to sign off the billboard: "Your plants are talking. Are you listening?" 👀 {dur}, before {by}', who: 'margo', dur: [15], stakes: 'low' },
  { key: 'greenleaf', from: 'Greenleaf Nurseries', app: 'mail', title: 'Site visit · Greenleaf', body: 'Our biggest customer wants {exec} on-site today, before {by}. "In person, please. The plants can tell."', who: 'margo', dur: [45, 60], stakes: 'high', travel: [20, 'Greenleaf Nurseries', 'Greenleaf’s other site (the far one)'], remoteOk: 'meh' },
  { key: 'vendor', from: 'Theo', app: 'huddle', title: 'Demo · MossDB', body: 'MossDB want to demo their database. it\'s a database for moss. I need to see it. {dur}, before {by}', who: 'theo', dur: [45, 60], stakes: 'low', travel: [15, 'MossDB HQ', 'MossDB’s “innovation barn”'], remoteOk: 'fine', overrun: [30] },
  { key: 'cand', from: 'Theo', app: 'huddle', title: 'Interview · Backend candidate', body: 'got a backend candidate who can only do today. {dur}, before {by}. they wrote a compiler for fun. we need them.', who: 'theo', dur: [45], stakes: 'mid', overrun: [-15] },
  { key: 'press', from: 'The Sprout Report', app: 'mail', title: 'Interview · The Sprout Report', body: 'Could {exec} do a quick {dur} interview before {by}? Our readers (gardeners, mostly) are VERY curious.', who: 'margo', dur: [30], stakes: 'mid', travel: [15, 'Sprout Report studio', 'a "more authentic" community garden'], remoteOk: 'meh' },
  { key: 'landlord', from: 'Hal (Landlord)', app: 'mail', title: 'Lease chat · Hal', body: 'Hal would like {dur} with {exec} before {by} to "discuss the plants in the lobby". All 41 of them.', who: 'margo', dur: [15], stakes: 'mid' },
  { key: 'security', from: 'Theo', app: 'huddle', title: 'Security review', body: 'someone set the staging password to "fern123". need {dur} to fix it before {by}. it was me. I set it.', who: 'theo', dur: [30], stakes: 'mid' },
  { key: 'angel', from: 'Margo', app: 'huddle', title: 'Coffee · angel investor', body: 'an angel wants coffee TODAY 👼 {dur}, before {by}, in person (she doesn\'t "believe in zoom")', who: 'margo', dur: [30], stakes: 'high', travel: [10, 'Ground Up café', 'Ground Up café (the OTHER one)'] },
  { key: 'pair', from: 'Theo', app: 'huddle', title: 'Pairing · new hire', body: 'new hire is stuck. {dur} of pairing before {by}? they deleted main. it\'s fine. it\'s mostly fine.', who: 'theo', dur: [30], stakes: 'low' },
  { key: 'allhands', from: 'Bev (People Ops)', app: 'mail', title: 'Fire drill (mandatory) 🔥', body: 'Fire drill today! {exec} need {dur} before {by}. Last time Margo stayed inside "to finish a thought".', who: 'both', dur: [15], stakes: 'low' },
  { key: 'podcast', from: 'Rooted (podcast)', app: 'mail', title: 'Podcast · "Rooted"', body: 'Could {exec} join "Rooted" for {dur}? Before {by}. We can do it remote… but the vibes are better in the studio.', who: 'margo', dur: [45], stakes: 'mid', travel: [20, 'Rooted studio', 'Rooted’s new studio (a houseboat)'], remoteOk: 'meh' },
];

/** Not urgent: any day up to the deadline. `due`: 'week' = by Friday, or a number of days. */
const LATER: { key: string; from: string; app: InboxApp; title: string; body: string; who: ExecId | 'any' | 'both'; dur: number; stakes: 'low' | 'mid' | 'high'; due: 'week' | number }[] = [
  { key: 'qbr', from: 'Ana (Customer Success)', app: 'mail', title: 'QBR · Greenleaf', body: 'Greenleaf want their quarterly review with {exec}. {dur}, any time {due}. They will bring slides. Many slides.', who: 'margo', dur: 60, stakes: 'high', due: 'week' },
  { key: 'perf', from: 'Bev (People Ops)', app: 'mail', title: 'Perf calibration', body: 'Need {dur} with {exec} for perf calibration {due}. Bring opinions. Leave feelings at the door 💐', who: 'both', dur: 45, stakes: 'mid', due: 'week' },
  { key: 'roadmap', from: 'Theo', app: 'huddle', title: 'Roadmap review', body: 'can you find {dur} for a roadmap review {due}? not urgent. it\'s a bit urgent.', who: 'theo', dur: 60, stakes: 'mid', due: 3 },
  { key: 'offsite', from: 'Margo', app: 'huddle', title: 'Offsite planning 🏕️', body: 'we need an OFFSITE. {dur} to plan it {due}. I\'m thinking yurts. don\'t tell Dev', who: 'margo', dur: 45, stakes: 'low', due: 'week' },
  { key: 'skip', from: 'Wren', app: 'huddle', title: 'Skip-level · Wren', body: 'could I get {dur} with {exec} {due}? nothing bad. probably. it\'s fine 🙂', who: 'any', dur: 30, stakes: 'mid', due: 2 },
  { key: 'audit', from: 'Dev (Finance)', app: 'mail', title: 'Expense audit', body: '{exec}: {dur} to go through expenses {due}. There is a $400 kombucha line. We need to talk about it. — Dev', who: 'margo', dur: 30, stakes: 'mid', due: 4 },
  { key: 'partner', from: 'Priya (Sales)', app: 'huddle', title: 'Partner call · Bloomly', body: 'Bloomly want {dur} with {exec} {due}. could be big. could be a waste. that\'s sales baby 💅', who: 'any', dur: 30, stakes: 'high', due: 3 },
];

const SELF_BOOKS: { title: string; body: string; who: ExecId; kind?: 'personal' }[] = [
  { title: 'Call w/ lawyer ⚖️', body: "put a call w/ the lawyer at {at}. don't ask. don't move it.", who: 'margo' },
  { title: 'Kombucha tasting 🍵', body: 'booked a kombucha tasting at {at}. it is a BUSINESS MEETING. probably.', who: 'margo', kind: 'personal' },
  { title: 'Haircut ✂️', body: 'I have a haircut at {at}. non-negotiable. look at me.', who: 'margo', kind: 'personal' },
  { title: 'Incident review 🔥', body: "something broke. blocking {at} for an incident review. I don't want to talk about it.", who: 'theo' },
];

const GIFTS = [
  { to: 'Greenleaf Nurseries', text: 'Send Greenleaf an apology gift (~$50)', budget: 50, from: 'Ana (Customer Success)', body: 'Greenleaf are upset (the fern thing). can you send them something nice? ~$50. not a mug. please not a mug.' },
  { to: "Priya's baby shower", text: "Gift for Priya's baby shower (~$40)", budget: 40, from: 'Bev (People Ops)', body: "Priya's baby shower is at 4! Can you grab something from all of us? ~$40. 🍼" },
  { to: 'Dev (Finance)', text: "Dev's 5-year work anniversary (~$50)", budget: 50, from: 'Margo', body: "it's Dev's 5 year anniversary?? since when do we have 5 years. get him something ~$50 🎉" },
  { to: 'Hal (Landlord)', text: '"Thank" the landlord (~$40)', budget: 40, from: 'Margo', body: "we need Hal to like us. rent is late. send Hal something ~$40. something that says \"we're good for it\"" },
];

const DILEMMAS: { from: string; app: InboxApp; body: string; choices: Choice[]; subject?: string; timeout: Effects; timeoutLog: string }[] = [
  {
    from: 'Bev (People Ops)', app: 'mail', subject: 'Re: Re: RE: who is this', body: 'Theo replied-all "who is this" to a company-wide email from the CEO. The CEO is Margo. Margo has seen it.',
    choices: [
      { label: 'Cover for Theo ("his cat did it")', effects: { morale: 3, standing: -2 } },
      { label: 'Let it burn', effects: { stress: 3 } },
      { label: 'Forward it to Margo with "🙃"', effects: { standing: 2, morale: -4 } },
    ], timeout: { stress: 3 }, timeoutLog: 'The reply-all thread reached 140 messages.',
  },
  {
    from: 'Intern (Kai)', app: 'huddle', body: 'sorry dumb question. what does sproutly actually do',
    choices: [
      { label: '"AI that talks to your houseplants"', effects: { morale: 1 } },
      { label: '"Honestly? Unclear."', effects: { morale: 3, standing: -2 } },
      { label: 'Send them the 40-slide deck', effects: { morale: -2, stress: -1 } },
    ], timeout: { morale: -2 }, timeoutLog: 'Kai asked Margo instead. Margo talked for an hour.',
  },
  {
    from: 'Wren', app: 'huddle', body: 'the lobby fern is dying. investors are in today. it is the ONE thing we are supposed to be good at',
    choices: [
      { label: 'Buy a new fern ($60)', effects: { runway: -60, standing: 2 } },
      { label: 'Ask the app what it needs', effects: { morale: 2 }, log: 'The app says the fern "needs space". Wren is concerned.' },
      { label: 'Turn it to face the wall', effects: { standing: -2, morale: 1 } },
    ], timeout: { standing: -2 }, timeoutLog: 'An investor asked if the fern was "a metaphor".',
  },
  {
    from: 'Unknown (journalist?)', app: 'messages', body: 'hi! is it true sproutly has 3 weeks of money left? asking for a story 🙂',
    choices: [
      { label: '"No comment"', effects: { stress: 2 } },
      { label: '"We\'re thriving!" (you don\'t know that)', effects: { standing: 2, stress: 5 } },
      { label: 'Forward to Margo', effects: { standing: -1, stress: -1 }, log: 'Margo: "why are you sending me this. why do they know this."' },
    ], timeout: { standing: -3 }, timeoutLog: 'The story ran with "Sproutly did not respond".',
  },
  {
    from: 'Theo', app: 'huddle', body: 'can you tell margo I\'m sick today. I\'m not sick. I just can\'t do another pricing meeting',
    choices: [
      { label: 'Tell Margo he\'s sick', effects: { morale: 4, stress: 3 }, flag: 'covered-theo' },
      { label: '"I\'m not lying to Margo"', effects: { morale: -4, standing: 1 } },
      { label: 'Block "deep work" on his calendar instead', effects: { morale: 2 } },
    ], timeout: { morale: -3 }, timeoutLog: 'Theo sat through the pricing meeting. His soul left at minute 12.',
  },
  {
    from: 'Margo', app: 'huddle', body: 'can you post on my linkedin for me? something like "humbled to announce" but about nothing specific. just vibes',
    choices: [
      { label: 'Write it (humbly)', effects: { standing: 3, stress: 4 } },
      { label: '"I\'m not your ghostwriter"', effects: { standing: -4 } },
      { label: 'Post a photo of the lobby fern', effects: { standing: 1, morale: 2 }, log: 'The fern got 400 likes. More than Margo ever has.' },
    ], timeout: { standing: -2 }, timeoutLog: 'Margo posted it herself. It was about her kombucha.',
  },
  {
    from: 'Dev (Finance)', app: 'mail', subject: 'Kombucha subscription', body: 'Margo\'s kombucha subscription billed us 3 times this month ($240). Cancel 2?',
    choices: [
      { label: 'Cancel two', effects: { runway: 160, standing: -2 } },
      { label: 'Leave it. Do not touch the kombucha.', effects: { runway: -240 } },
    ], timeout: { runway: -240 }, timeoutLog: 'The kombucha kept coming.',
  },
  {
    from: 'Ana (Customer Success)', app: 'huddle', body: 'support queue is at 212 tickets. can you answer a few?? most are "my plant said something mean"',
    choices: [
      { label: 'Answer 20 tickets (ouch)', effects: { morale: 4, stress: 6 } },
      { label: '"Not my job" (it isn\'t)', effects: { morale: -3 } },
      { label: 'Write a macro: "Your plant loves you"', effects: { morale: 2, stress: 2 } },
    ], timeout: { morale: -3 }, timeoutLog: 'Ana answered 212 tickets alone. Ana has questions for HR.',
  },
  {
    from: 'Sam (Marketing)', app: 'huddle', body: 'can I borrow the company card for like 5 mins. for a marketing thing. a marketing thing that is lunch',
    choices: [
      { label: 'Sure', effects: { morale: 2, runway: -85 } },
      { label: 'No', effects: { morale: -2 } },
    ], timeout: { morale: -1 }, timeoutLog: 'Sam ate a sad desk sandwich.',
  },
  {
    from: 'Someone in #random', app: 'huddle', body: 'WHO microwaved fish 🐟🔥 the entire 3rd floor is evacuating',
    choices: [
      { label: 'Order an air purifier ($90)', effects: { runway: -90, morale: 3 } },
      { label: 'Post a passive-aggressive sign', effects: { morale: -1, stress: -2 } },
      { label: 'Ignore it (it was Theo)', effects: { morale: -2 } },
    ], timeout: { morale: -2 }, timeoutLog: 'The fish incident entered company folklore.',
  },
];

const CALLS = [
  {
    from: 'Mum', lines: ['"Hi love! Just checking in."', '"Are you eating? You sound like you\'re not eating."'],
    choices: [{ label: 'Chat for a bit', effects: { stress: -6 } }, { label: '"Can\'t talk, Mum. Love you"', effects: { stress: 2 } }],
    missed: { stress: 2 }, missedLog: 'Mum left a voicemail. It was 4 minutes of her dog barking.',
  },
  {
    from: 'Unknown number', lines: ['"Hi! Recruiter from Leafly."', '"We\'re hiring EAs. Double the pay. Half the… Margo."', '"Interested?"'],
    choices: [{ label: '"Not interested"', effects: { standing: 1 } }, { label: '"Send me details"', effects: { stress: -4 }, flag: 'leafly-you' }],
    missed: {}, missedLog: 'Ignored a recruiter. Probably for the best.',
  },
  {
    from: 'Dev (Finance)', lines: ['"Dev here."', '"Margo expensed a $400 \'kombucha fridge\'."', '"Do I approve it?"'],
    choices: [
      { label: 'Approve it', effects: { runway: -400, standing: 2 } },
      { label: 'Reject it', effects: { standing: -3, runway: 0 } },
      { label: '"Ask Margo" (coward)', effects: { stress: 2 } },
    ],
    missed: { stress: 2 }, missedLog: 'Dev approved the fridge. It hums.',
  },
];

const DANA_MEETINGS: MeetT[] = [
  { key: 'audit', from: 'Dana Reyes', app: 'mail', title: 'Process audit · Dana', body: '{dur} with {exec} before {by}. Agenda attached. (The agenda is: why.)', who: 'dana', dur: [30], stakes: 'mid' },
  { key: 'contracts', from: 'Dana Reyes', app: 'mail', title: 'Vendor contracts · Dana', body: 'Need {dur} before {by} to review vendor contracts. Someone signed one with a llama farm.', who: 'dana', dur: [30], stakes: 'mid' },
  { key: 'okr', from: 'Dana Reyes', app: 'huddle', title: 'OKR alignment · Dana & Margo', body: '{dur} with Margo before {by}. We need OKRs. Margo thinks OKR is a yoga pose.', who: 'dana', dur: [30], stakes: 'high' },
];

/** Your own errands: they land on your calendar and need doing during work hours. */
const ERRANDS: { title: string; body: string; from: string; dur: number; travel?: [number, string] }[] = [
  { title: 'Call landlord re: the leak 🔧', body: 'the ceiling is dripping. like ACTIVELY. can you call the landlord today?? 15 mins before {by} pls', from: 'Ollie (flatmate)', dur: 15 },
  { title: 'Pharmacy run 💊', body: 'your prescription is ready for pickup! (closes early today: {by})', from: 'Pharmacy 💊', dur: 15, travel: [10, 'Pharmacy'] },
  { title: 'Call the bank back 🏦', body: 'Please call us back today before {by} regarding "unusual activity" (it was the kombucha).', from: 'Your bank', dur: 15 },
  { title: 'Sign for a parcel 📦', body: "there's a parcel for you that needs a signature. I'm not home. are you? 😬 before {by}", from: 'Ollie (flatmate)', dur: 15, travel: [10, 'home'] },
];

/** Your own work: tasks that land on your calendar (skip them and Bev notices). */
const MY_WORK: { title: string; body: string; from: string; app: InboxApp; dur: number }[] = [
  { title: 'Expense report 🧾', body: 'Your expenses are due before {by}. Receipts please. Yes, the kombucha ones too. — Dev', from: 'Dev (Finance)', app: 'mail', dur: 30 },
  { title: "Triage Margo's inbox 📥", body: "Margo's inbox is at 3,402 unread. Can you block 30 mins before {by} to triage? She says \"just archive the scary ones\" 💐", from: 'Bev (People Ops)', app: 'huddle', dur: 30 },
  { title: 'Training: "Calendars & You" 🎓', body: 'Mandatory 30-min training, before {by}. Module 3 is called "When Everyone Is Double Booked". Topical!', from: 'Bev (People Ops)', app: 'mail', dur: 30 },
  { title: 'Book the team lunch 🥪', body: "can you sort team lunch? 15 mins to order before {by}. no fish. we've talked about the fish", from: 'Wren', app: 'huddle', dur: 15 },
  { title: 'Draft Margo\'s newsletter ✍️', body: 'need you to draft the investor newsletter before {by}. 45 mins? make it sound like we have a plan 🌱', from: 'Margo', app: 'huddle', dur: 45 },
];

/** Margo asks your advice. `gut` is what she leans towards anyway. */
const ADVICE: { body: string; gut: number; choices: Choice[] }[] = [
  { body: 'should I reply-all to the investor thread with a gif? it is a GOOD gif', gut: 1, choices: [{ label: 'No gif.', effects: { standing: 1 } }, { label: 'Send the gif', effects: { standing: -4 } }] },
  { body: 'Wren wants to rebrand. again. do I let them?', gut: 0, choices: [{ label: 'Let them', effects: { morale: 5, runway: -500 } }, { label: 'Not now', effects: { morale: -3 } }] },
  { body: 'thinking of announcing a 4-day week. thoughts?? 🌴', gut: 0, choices: [{ label: 'Love it', effects: { morale: 8, standing: -4 } }, { label: 'After funding', effects: { standing: 2, morale: -2 } }] },
  { body: 'Theo wants to rewrite everything in Rust. yes??', gut: 1, choices: [{ label: 'Let him', effects: { morale: 4, runway: -1500 } }, { label: 'Absolutely not', effects: { morale: -4 } }] },
  { body: 'the podcast guy who yells wants me back. do I go', gut: 0, choices: [{ label: 'Go', effects: { standing: -3 } }, { label: 'Skip it', effects: { standing: 1 } }] },
  { body: 'a journalist wants a quote on "do plants have feelings". do I say yes', gut: 0, choices: [{ label: '"Yes, deeply."', effects: { standing: -2, runway: 600 } }, { label: 'Keep it vague', effects: { standing: 2 } }] },
  { body: 'should I fly to the conference or do the keynote over video 🎤', gut: 0, choices: [{ label: 'Fly there', effects: { standing: 4, runway: -900 } }, { label: 'Video', effects: { standing: -1 } }] },
];

const WEEKEND: { from: string; app: InboxApp; body: string; choices: Choice[]; timeout: Effects; timeoutLog: string }[] = [
  {
    from: 'Margo', app: 'huddle', body: 'r u up? quick q about monday. ok not quick. ok it\'s 6 questions',
    choices: [{ label: 'Answer all 6', effects: { standing: 3, stress: 6 } }, { label: '"Monday!" 🙂', effects: { standing: -1, stress: -2 } }],
    timeout: { standing: -2 }, timeoutLog: 'Margo sent 6 more questions. Then "nvm".',
  },
  {
    from: 'Theo', app: 'huddle', body: 'sorry to bug you on a weekend. do you know where the server password is. the real one. not fern123',
    choices: [{ label: 'Dig through your notes for him', effects: { morale: 4, stress: 4 } }, { label: '"Pretty sure it\'s fern123"', effects: { morale: -2, stress: -1 } }],
    timeout: { morale: -2 }, timeoutLog: 'Theo guessed. Theo got locked out.',
  },
  {
    from: 'Jules ❤️', app: 'messages', body: 'phone down?? farmers market?? 🥕',
    choices: [{ label: 'Phone down. Carrots. 🥕', effects: { stress: -10 } }, { label: '"Just one more email…"', effects: { stress: 3, standing: 1 } }],
    timeout: { stress: 3 }, timeoutLog: 'Jules went to the market alone.',
  },
  {
    from: 'Group chat 🍕', app: 'messages', body: 'pizza tonight? you have to come. we have not seen you since "the job"',
    choices: [{ label: "I'm in 🍕", effects: { stress: -8, runway: 0 } }, { label: '"Raincheck"', effects: { stress: 2 } }],
    timeout: { stress: 2 }, timeoutLog: 'The group chat moved on without you.',
  },
  {
    from: 'Wren', app: 'huddle', body: 'is it weird that I\'m working on the logo on a saturday. don\'t answer. I know.',
    choices: [{ label: '"Go outside, Wren"', effects: { morale: 2 } }, { label: '"Send it, I\'ll look"', effects: { morale: 3, stress: 3 } }],
    timeout: { morale: 0 }, timeoutLog: 'Wren kept working on the logo.',
  },
];

/** The team's own calendar: things for everyone. They pay out in morale, and cost it when they slip. */
const TEAM_REQS: { key: string; from: string; app: InboxApp; title: string; body: string; with: 'none' | 'any' | 'both'; dur: number; due: 'today' | 'week'; big?: boolean; catering?: boolean }[] = [
  { key: 'tlunch', from: 'Bev (People Ops)', app: 'huddle', title: 'Team lunch 🍕', body: 'Team lunch! {dur}, ideally between 12 and 2, {due}. Morale is "vibing low" per my survey.', with: 'none', dur: 60, due: 'today', catering: true },
  { key: 'learn', from: 'Wren', app: 'huddle', title: 'Lunch & learn: Figma for non-designers', body: "can I do a lunch & learn {due}? {dur}. I'll teach everyone Figma. they will not learn Figma. it'll be fun", with: 'none', dur: 45, due: 'week', catering: true },
  { key: 'retro', from: 'Theo', app: 'huddle', title: 'Team retro 🔁', body: 'We need a retro. {dur}, whole team, {due}. Bring feelings. Theo will bring sticky notes.', with: 'any', dur: 45, due: 'week' },
  { key: 'welcome', from: 'Bev (People Ops)', app: 'mail', title: 'Welcome coffee: new hire ☕', body: 'Priya (Support) starts today! Can the team do a {dur} welcome coffee {due}? First impressions!', with: 'none', dur: 30, due: 'today', catering: true },
  { key: 'training', from: 'Bev (People Ops)', app: 'mail', title: 'Mandatory training: Respect at Work 📋', body: 'Everyone needs {dur} of Respect at Work training {due}. It is mandatory. It has a quiz. Kendall wrote the quiz.', with: 'both', dur: 45, due: 'week', big: true },
  { key: 'offsite', from: 'Margo', app: 'huddle', title: 'Offsite planning 🏕️', body: 'OFFSITE. we need {dur} with the whole team to plan it, {due}. I\'m thinking yurts. Theo is thinking no.', with: 'both', dur: 60, due: 'week', big: true },
  { key: 'demo', from: 'Theo', app: 'huddle', title: 'Demo day: what shipped 🚢', body: 'Team demo, {dur}, {due}. Engineers show what shipped. Everyone claps. Nobody asks about the bugs.', with: 'any', dur: 30, due: 'today' },
  { key: 'social', from: 'Wren', app: 'huddle', title: 'Team social: board games 🎲', body: 'board games after work?? well, during work. {dur}, {due}, whole team. Margo is banned from Monopoly', with: 'none', dur: 60, due: 'week' },
  { key: 'bday', from: 'Bev (People Ops)', app: 'huddle', title: 'Cake for Ana 🎂', body: "It's Ana's birthday! {dur} for cake {due}, whole team. I've bought a cake shaped like a plant. It is a cake.", with: 'none', dur: 15, due: 'today', catering: true },
  { key: 'survey', from: 'Bev (People Ops)', app: 'mail', title: 'Engagement survey results 📊', body: 'The engagement survey is back. {dur} to share it with the team {due}, with {exec}. Brace.', with: 'any', dur: 30, due: 'week', big: true },
];

/** Just people being people. Replying is a small kindness; ignoring it costs nothing but warmth. */
const CHATTER: { from: string; app: InboxApp; body: string; replies: [string, string]; work: boolean }[] = [
  { from: 'Wren', app: 'huddle', body: 'someone left a whole cake in the kitchen with a note that just says "sorry". no context. eating it', replies: ['"Save me a slice"', '"Could be a trap"'], work: true },
  { from: 'Ana (Customer Success)', app: 'huddle', body: 'a customer just sent us a photo of their fern wearing a tiny hat. I will be framing this', replies: ['"Frame it. Now."', '"The hat is a choice"'], work: true },
  { from: 'Theo', app: 'huddle', body: 'the deploy went out and nothing broke. I don\'t trust it. why is it quiet', replies: ['"Enjoy it, Theo"', '"Knock on wood"'], work: true },
  { from: 'Bev (People Ops)', app: 'huddle', body: 'Reminder that the kitchen fridge is cleared on Fridays. This is not a threat. It is a schedule.', replies: ['"Noted 🫡"', '"RIP my yoghurt"'], work: true },
  { from: 'Margo', app: 'huddle', body: 'random but thank you for today. I know I\'m a lot. you\'re handling it 🌱', replies: ['"Happy to help"', '"You\'re… a normal amount"'], work: true },
  { from: 'Wren', app: 'huddle', body: 'pigeon on the window ledge has been staring at me for 20 mins. we\'re friends now. his name is Gary', replies: ['"Hi Gary"', '"Gary is HR"'], work: true },
  { from: 'Ana (Customer Success)', app: 'huddle', body: 'playlist for the afternoon slump? I need something that isn\'t lo-fi beats to cry to', replies: ['"ABBA. Always."', '"Sea shanties"'], work: true },
  { from: 'Theo', app: 'huddle', body: 'found a mug on my desk that says "World\'s Okayest CTO". who did this. I\'m keeping it', replies: ['"No idea 😇"', '"It\'s accurate"'], work: true },
  { from: 'Dana', app: 'huddle', body: 'The coffee machine has been fixed. I fixed it. Do not tell anyone; they will ask me to fix things.', replies: ['"Your secret\'s safe"', '"Hero"'], work: true },
  { from: 'Jules ❤️', app: 'messages', body: 'thinking about you being busy and important 🥺 also what do we want for dinner', replies: ['"Pasta. Always pasta."', '"Surprise me ❤️"'], work: false },
  { from: 'Ollie', app: 'messages', body: 'mate. I just saw a dog on a skateboard. not doing anything with this info just needed you to know', replies: ['"Video or it didn\'t happen"', '"Living the dream"'], work: false },
  { from: 'Mum', app: 'messages', body: 'Hi love. Just saw a programme about plants and thought of you. Are you eating? xx Mum', replies: ['"Yes Mum ❤️"', '"Define eating"'], work: false },
  { from: 'Jules ❤️', app: 'messages', body: 'the neighbour\'s cat got into our flat again. he\'s on the bed. he lives here now I guess', replies: ['"Name him"', '"He pays rent?"'], work: false },
];

/** Small asks you can say yes to. Yes puts a promise in Notes; no costs a little goodwill now. */
const FAVOURS: { key: string; from: string; app: InboxApp; body: string; yes: string; no: string; todo: string; within: number }[] = [
  { key: 'deck', from: 'Ana (Customer Success)', app: 'huddle', body: 'can you send me the Q1 deck? the REAL one, not "Q1 final final v3"', yes: '"On it"', no: '"Ask Margo?"', todo: 'Send Ana the real Q1 deck', within: 60 },
  { key: 'contract', from: 'Theo', app: 'huddle', body: 'do you know where the hosting contract PDF is? I need it for a thing. a lawyer thing', yes: '"I\'ll dig it out"', no: '"Not sure, sorry"', todo: 'Find Theo the hosting contract', within: 75 },
  { key: 'receipts', from: 'Dana', app: 'mail', body: 'I need the receipts from last week\'s client dinner. Today, please.', yes: '"I\'ll send them over"', no: '"Margo has them"', todo: 'Send Dana the dinner receipts', within: 90 },
  { key: 'survey', from: 'Bev (People Ops)', app: 'huddle', body: 'Could you fill in the desk-moves survey? It takes 2 minutes! (It takes 20.)', yes: '"Will do"', no: '"Bit swamped"', todo: "Fill in Bev's desk-moves survey", within: 120 },
  { key: 'intro', from: 'Margo', app: 'huddle', body: 'can you intro me to that guy from the conference? the one with the hat. you know the one', yes: '"I\'ll find him"', no: '"…which hat?"', todo: 'Intro Margo to the man with the hat', within: 90 },
  { key: 'logo', from: 'Wren', app: 'huddle', body: 'logo v14 is up. could you give it a look before I show Margo? be honest. not too honest', yes: '"I\'ll look"', no: '"Ship it, it\'s great"', todo: "Give Wren notes on logo v14", within: 60 },
  { key: 'notes', from: 'Theo', app: 'huddle', body: 'could you write up notes from this morning? I remember nothing. it was a lot of words', yes: '"Sure"', no: '"I wasn\'t in it"', todo: "Write up this morning's notes for Theo", within: 90 },
];

const INVOICES: { payee: string; amount: number; who: ExecId; body: string }[] = [
  { payee: 'Hydro Hosting', amount: 640, who: 'theo', body: 'Your monthly hosting invoice ($640) is due today. Late payment may result in "service adjustments".' },
  { payee: 'Leaf & Co. Plants', amount: 180, who: 'margo', body: 'Invoice for office plant maintenance: $180. The fiddle-leaf fig is "struggling emotionally".' },
  { payee: 'Bean There Coffee', amount: 220, who: 'margo', body: 'Monthly beans invoice: $220. Margo\'s oat milk surcharge is itemised separately. And extensively.' },
  { payee: 'Pemberton Legal', amount: 900, who: 'dana', body: 'Invoice for legal services: $900. "Reviewing the kombucha fridge situation" took longer than expected.' },
  { payee: 'CleanSweep', amount: 150, who: 'margo', body: 'Office cleaning, $150. We found 14 mugs under one desk. We are not judging.' },
];

/** Weekend work: it needs YOU, so it fights your plans for the same calendar. */
const WEEKEND_WORK: { who: ExecId; app: InboxApp; title: string; duration: number; body: string; stakes: 1 | 2; book?: boolean }[] = [
  { who: 'margo', app: 'huddle', title: 'Investor update draft (Zoom)', duration: 45, body: 'can we jam on the investor update?? 45 mins. today ideally. it\'s fine. it\'s urgent. it\'s fine 🙃', stakes: 2 },
  { who: 'margo', app: 'messages', title: '"Quick" call · Margo', duration: 30, body: 'are you around for a quick call? like 30 mins. like actually 30 this time', stakes: 1 },
  { who: 'margo', app: 'huddle', title: 'Podcast prep (Zoom)', duration: 60, body: 'I said yes to a podcast. it records monday. I need talking points. and a vibe. today?', stakes: 2 },
  { who: 'margo', app: 'huddle', title: 'Rewrite the all-hands deck', duration: 60, body: 'woke up with a new vision for monday\'s all-hands. the deck is wrong. all of it. help', stakes: 2 },
  { who: 'theo', app: 'huddle', title: 'On-call handover (Zoom)', duration: 30, body: 'need someone to sit on the on-call handover. it\'s mostly listening. and taking notes. sorry', stakes: 1 },
  { who: 'theo', app: 'huddle', title: 'Vendor contract review', duration: 45, body: 'the hosting contract renews monday. can you read it with me? I don\'t speak lawyer', stakes: 2 },
  { who: 'theo', app: 'messages', title: 'Server room key run 🔑', duration: 45, body: 'locked out of the server cupboard. you have the spare key. I know it\'s saturday. I KNOW', stakes: 1 },
  { who: 'dana', app: 'mail', title: 'Board pack proofread', duration: 60, body: 'The board pack needs a proofread before Monday. One hour. I\'d appreciate it.', stakes: 2 },
  { who: 'dana', app: 'mail', title: 'Expense audit (Zoom)', duration: 30, body: 'Thirty minutes on last month\'s expenses. Several receipts are "vibes". Please advise.', stakes: 1 },
];
const WEEKEND_BOOKED: { who: ExecId; title: string; duration: number; body: string }[] = [
  { who: 'margo', title: 'Sync w/ you (Margo booked this)', duration: 30, body: 'I put 30 mins in your cal at {at}. hope that\'s ok!! (it\'s ok right)' },
  { who: 'theo', title: 'Incident review (Theo booked)', duration: 45, body: 'Booked us an incident review at {at}. Sorry. Things caught fire. Smallish fire.' },
  { who: 'dana', title: 'Budget call (Dana booked)', duration: 30, body: 'I have scheduled a budget call for {at}. Your attendance is assumed.' },
];

export function generateAdhoc(dayIndex: number, d: DayDef, seed: number, has: (a: AppId) => boolean, morale = 60): Script[] {
  const r = mulberry32(seed);
  const out: Script[] = [];
  let n = 0;
  const id = () => `ah${dayIndex}-${n++}`;

  if (d.weekend) {
    const pool = [...WEEKEND];
    for (let i = 0; i < d.adhoc && pool.length; i++) {
      const w = pool.splice(Math.floor(r() * pool.length), 1)[0];
      out.push({ at: q15(t('9:30') + r() * 7 * 60) + Math.floor(r() * 10), type: 'msg', msg: { app: w.app, from: w.from, body: w.body, choices: w.choices, expiresIn: 60, timeoutEffects: w.timeout, timeoutLog: w.timeoutLog } });
    }
    // Friends and family check in too.
    for (const c of CHATTER.filter((x) => !x.work).sort(() => r() - 0.5).slice(0, 2)) {
      out.push({ at: q15(t('9:30') + r() * 7 * 60), type: 'msg', msg: { app: c.app, from: c.from, body: c.body, expiresIn: 60, timeoutEffects: {}, timeoutLog: `${c.from.split(' ')[0]} didn't hear back.`, choices: c.replies.map((label) => ({ label, effects: { stress: -2 } })) } });
    }
    // The bosses don't really believe in weekends either.
    const who = d.execs.filter(isBoss);
    const nm = (x: ExecId) => ({ margo: 'Margo', theo: 'Theo', dana: 'Dana' } as Record<string, string>)[x] ?? x;
    const asks = WEEKEND_WORK.filter((w) => who.includes(w.who));
    const nAsks = 2 + (chance(r, 0.5) ? 1 : 0);
    for (let k = 0; k < nAsks && asks.length; k++) {
      const w = asks.splice(Math.floor(r() * asks.length), 1)[0];
      const at = q15(t('9:15') + r() * 6 * 60);
      out.push({
        at, type: 'request',
        event: {
          id: id(), title: w.title, attendees: [w.who, 'me'], start: null, duration: w.duration, remote: true, from: w.who, deadline: Math.min(at + 4 * 60, t('17:00')),
          reward: w.stakes === 2 ? { standing: 5, stress: 7 } : { standing: 3, stress: 5 },
          missPenalty: w.stakes === 2 ? { standing: -6 } : { standing: -4 }, declinePenalty: w.stakes === 2 ? { standing: -4 } : { standing: -2 },
          note: 'On a weekend. Saying no is allowed. It is noticed.',
        },
        msg: { app: w.app, from: nm(w.who), subject: w.app === 'mail' ? w.title : undefined, body: w.body },
      });
    }
    // Sometimes they just book you.
    const books = WEEKEND_BOOKED.filter((b) => who.includes(b.who));
    if (books.length && chance(r, 0.6)) {
      const b = pick(r, books);
      const at = q15(t('9:30') + r() * 4 * 60);
      const start = q15(at + 60 + r() * 120);
      out.push({
        at, type: 'insert',
        event: { id: id(), title: b.title, attendees: [b.who, 'me'], start, duration: b.duration, remote: true, from: b.who, reward: { standing: 2, stress: 5 }, missPenalty: { standing: -5 }, declinePenalty: { standing: -3 }, bumpPenalty: { standing: -2 }, note: 'Booked straight into your weekend.' },
        msg: { app: 'huddle', from: nm(b.who), body: b.body.replace('{at}', fmt(start)) },
      });
    }
    // And the phone rings.
    if (chance(r, 0.5)) out.push({ at: q15(t('10:00') + r() * 6 * 60), type: 'call', call: { ...pick(r, CALLS) } });
    return out.sort((a, b) => a.at - b.at);
  }

  // Spread the drops across the day.
  const times: number[] = [];
  for (let i = 0; i < d.adhoc; i++) times.push(t('9:20') + Math.floor(r() * (t('15:45') - t('9:20'))));
  times.sort((a, b) => a - b);

  const used = new Set<string>();
  const kinds: [string, number][] = [
    ['meeting', 4], ['dilemma', 3], ['call', 1], ['self', 1], ...(d.weekend ? [] : [['later', 1.6] as [string, number]]),
    ...(d.execs.includes('me') ? [['errand', 1.2] as [string, number], ['mywork', 1.5] as [string, number]] : []),
    ...(d.execs.includes('margo') && dayIndex >= 2 ? [['advice', 1.5] as [string, number]] : []),
    ...(has('brew') ? [['coffee', 1] as [string, number]] : []),
    ...(has('bundl') ? [['gift', 1] as [string, number]] : []),
    ...(has('tably') ? [['table', 1] as [string, number]] : []),
    ['favour', 1.4],
    ['chat', 2],
    ...(d.execs.includes('team') && (has('brew') || has('tably')) ? [['treat', 1.1] as [string, number]] : []),
    ...(has('card') ? [['invoice', 0.9] as [string, number]] : []),
  ];
  const total = kinds.reduce((a, [, w]) => a + w, 0);
  const bosses: ExecId[] = d.execs.filter(isBoss);
  const execAt = (who: ExecId | 'any' | 'both'): ExecId[] | null => {
    if (who === 'both') return bosses.length > 1 ? bosses.filter((x) => x !== 'dana') : null;
    if (who === 'any') return [pick(r, bosses)];
    return bosses.includes(who) ? [who] : null;
  };
  const names = (xs: ExecId[]) => xs.map((x) => ({ margo: 'Margo', theo: 'Theo', dana: 'Dana', me: 'you', team: 'everyone' })[x]).join(' & ');

  // The team's calendar gets its own asks: one or two every workday once you manage it.
  if (d.execs.includes('team')) {
    const nTeam = 1 + (chance(r, 0.5) ? 1 : 0);
    const dow = (3 + dayIndex) % 7;
    for (let k = 0; k < nTeam; k++) {
      const opts = TEAM_REQS.filter((m) => !used.has(m.key) && (m.with === 'none' || execAt(m.with)));
      if (!opts.length) break;
      const m = pick(r, opts);
      used.add(m.key);
      const att: ExecId[] = ['team', ...(m.with === 'none' ? [] : execAt(m.with)!)];
      const at = t('9:20') + Math.floor(r() * (t('13:30') - t('9:20')));
      const reward: Effects = m.big ? { morale: 6, standing: 1 } : { morale: 4 };
      const miss: Effects = m.big ? { morale: -8, standing: -2 } : { morale: -5 };
      const ev: EventDef = { id: id(), title: m.title, attendees: att, start: null, duration: m.dur, reward, missPenalty: miss, declinePenalty: { morale: m.big ? -6 : -4 }, from: m.from === 'Margo' ? 'margo' : m.from === 'Theo' ? 'theo' : undefined, catering: m.catering ? 'nice' : undefined, note: '' };
      let due = '';
      if (m.due === 'week') {
        let n = (5 - dow + 7) % 7;
        if (n < 2) n += 7;
        let dueDay = dayIndex + n;
        while ([0, 6].includes((3 + dueDay) % 7)) dueDay++;
        const dayName = new Date(2026, 2, 4 + dueDay).toLocaleDateString('en-GB', { weekday: 'long' });
        ev.dueDay = dueDay;
        ev.noBump = true;
        ev.note = `Whole team. Any day up to ${dayName}.`;
        due = `this week (by ${dayName})`;
      } else {
        const by = Math.min(q15(at + 150 + r() * 90), t('16:30'));
        ev.deadline = by;
        ev.note = `Whole team. Must start before ${fmt(by)}.`;
        due = `today, before ${fmt(by)}`;
      }
      const body = m.body.replace('{exec}', names(att.filter((x) => x !== 'team'))).replace('{dur}', `${m.dur} min`).replace('{due}', due);
      out.push({ at, type: 'request', event: ev, msg: { app: m.app, from: m.from, subject: m.app === 'mail' ? m.title : undefined, body } });
    }
  }

  // Every weekday from Day 2 brings at least one "sometime this week" request, on top of the usual.
  const laterAt = !d.weekend && dayIndex >= 1 ? t('9:30') + Math.floor(r() * (t('14:00') - t('9:30'))) : -1;
  if (laterAt >= 0) { times.push(laterAt); times.sort((a, b) => a - b); }
  for (const at of times) {
    let kind = 'dilemma';
    let roll = r() * total;
    for (const [k, w] of kinds) { if ((roll -= w) < 0) { kind = k; break; } }
    if (at === laterAt) kind = 'later';

    if (kind === 'later') {
      const opts = LATER.filter((m) => !used.has(m.key) && execAt(m.who));
      if (!opts.length) continue;
      const m = pick(r, opts);
      used.add(m.key);
      const att = execAt(m.who)!;
      // Day 0 is a Wednesday. "This week" = by Friday (next Friday if that's under two days away).
      const dow = (3 + dayIndex) % 7;
      let due = m.due === 'week' ? (5 - dow + 7) % 7 : m.due;
      if (m.due === 'week' && due < 2) due += 7;
      let dueDay = dayIndex + due;
      while ([0, 6].includes((3 + dueDay) % 7)) dueDay++;
      const dayName = new Date(2026, 2, 4 + dueDay).toLocaleDateString('en-GB', { weekday: 'long' });
      const st = STAKES[m.stakes];
      const ev: EventDef = {
        id: id(), title: m.title, attendees: att, start: null, duration: m.dur, dueDay,
        reward: st.reward, missPenalty: st.miss, declinePenalty: st.decline, noBump: true,
        note: `Any day up to ${dayName}.`,
      };
      const body = m.body.replace('{exec}', names(att)).replace('{dur}', `${m.dur} min`).replace('{due}', m.due === 'week' ? `this week (by ${dayName})` : `by ${dayName}`);
      out.push({ at, type: 'request', event: ev, msg: { app: m.app, from: m.from, subject: m.app === 'mail' ? m.title : undefined, body } });
      continue;
    }

    if (kind === 'meeting') {
      const opts = [...MEETINGS, ...DANA_MEETINGS].filter((m) => !used.has(m.key) && execAt(m.who));
      if (!opts.length) continue;
      const m = pick(r, opts);
      used.add(m.key);
      const att = execAt(m.who)!;
      const dur = pick(r, m.dur);
      const by = Math.min(q15(at + 120 + r() * 90), t('17:00'));
      const st = STAKES[m.stakes];
      const ev: EventDef = {
        id: id(), title: m.title, attendees: att, start: null, duration: dur, deadline: by,
        reward: st.reward, missPenalty: st.miss, declinePenalty: st.decline, bumpPenalty: m.stakes === 'high' ? { standing: -4 } : {},
        overrun: m.overrun ? pick(r, m.overrun) : undefined,
        note: `Must start before ${fmt(by)}.`,
      };
      if (m.travel) {
        ev.travel = m.travel[0];
        ev.place = m.travel[1];
        ev.remoteOk = m.remoteOk;
        if (m.remoteOk && chance(r, 0.3)) ev.remote = true;
      }
      const body = m.body.replace('{exec}', names(att)).replace('{dur}', `${dur} min`).replace('{by}', fmt(by));
      out.push({ at, type: 'request', event: ev, msg: { app: m.app, from: m.from, subject: m.app === 'mail' ? m.title : undefined, body } });

      // Follow-ups: the venue moves, it flips remote/in-person, or someone pushes it.
      if (m.travel && has('ryde') && chance(r, 0.55)) {
        const when = at + 45 + Math.floor(r() * 60);
        if (ev.remote) {
          out.push({ at: when, type: 'change', id: ev.id, mustBeInPerson: true, msg: { app: 'huddle', from: m.from, body: `update: ${m.title} has to be IN PERSON now. sorry!! 🙏` } });
        } else if (m.remoteOk && chance(r, 0.5)) {
          out.push({ at: when, type: 'change', id: ev.id, remote: true, msg: { app: 'huddle', from: m.from, body: `${m.title}: can we do it over video instead? 💻` } });
        } else {
          out.push({ at: when, type: 'change', id: ev.id, place: m.travel[2], travel: m.travel[0] + 10, msg: { app: 'huddle', from: m.from, body: `${m.title} is at ${m.travel[2]} now. it's further. sorry!!` } });
        }
      } else if (chance(r, 0.25)) {
        out.push({ at: at + 50 + Math.floor(r() * 50), type: 'nudge', id: ev.id, by: 30, msg: { app: 'huddle', from: m.from, body: `can we push ${m.title} 30 mins? 🙏 (I already moved it, sorry)` } });
      }
    } else if (kind === 'dilemma') {
      const opts = DILEMMAS.filter((x) => !used.has(x.body));
      if (!opts.length) continue;
      const x = pick(r, opts);
      used.add(x.body);
      out.push({ at, type: 'msg', msg: { app: x.app, from: x.from, subject: x.subject, body: x.body, choices: x.choices, expiresIn: 40, timeoutEffects: x.timeout, timeoutLog: x.timeoutLog } });
    } else if (kind === 'call') {
      const opts = CALLS.filter((c) => !used.has(c.from));
      if (!opts.length) continue;
      const c = pick(r, opts);
      used.add(c.from);
      out.push({ at, type: 'call', call: { ...c } });
    } else if (kind === 'self') {
      const opts = SELF_BOOKS.filter((s) => !used.has(s.title) && bosses.includes(s.who));
      if (!opts.length) continue;
      const s = pick(r, opts);
      used.add(s.title);
      const start = Math.min(q15(at + 45 + r() * 60), t('17:00'));
      out.push({
        at, type: 'insert',
        event: { id: id(), title: s.title, attendees: [s.who], start, duration: 30, kind: s.kind, bumpPenalty: { standing: -3 }, reward: { morale: 1 }, missPenalty: { standing: -4 }, declinePenalty: { standing: -4 }, note: 'They booked this themselves.' },
        msg: { app: 'huddle', from: names([s.who]), body: s.body.replace('{at}', fmt(start)) },
      });
    } else if (kind === 'coffee') {
      if (used.has('coffee')) continue;
      used.add('coffee');
      const x = pick(r, bosses);
      const by = at + 40;
      out.push({
        at, type: 'task',
        task: { id: id(), kind: 'coffee', exec: x, text: `Get ${names([x])} a coffee (by ${fmt(by)})`, deadline: by, reward: x === 'margo' ? { standing: 3 } : { morale: 4 }, fail: x === 'margo' ? { standing: -3 } : { morale: -3 } },
        msg: { app: 'huddle', from: names([x]), body: x === 'margo' ? 'coffee. please. my usual. I am a husk ☕' : x === 'dana' ? 'Coffee. My usual. Please confirm receipt.' : 'Coffee would be good. The usual. Thank you. (Help.)' },
      });
    } else if (kind === 'favour') {
      const opts = FAVOURS.filter((f) => !used.has(f.key) && (f.from !== 'Dana' || bosses.includes('dana')) && (f.from !== 'Theo' || bosses.includes('theo')));
      if (!opts.length) continue;
      const f = pick(r, opts);
      used.add(f.key);
      out.push({
        at, type: 'msg',
        msg: {
          app: f.app, from: f.from, subject: f.app === 'mail' ? 'Quick one' : undefined, body: f.body, expiresIn: 45, timeoutEffects: { morale: -1 }, timeoutLog: `${f.from.split(' ')[0]} figured it out alone.`,
          choices: [
            { label: f.yes, effects: { morale: 1 }, promise: { text: f.todo, within: f.within, reward: { morale: 2, standing: 1 }, fail: { morale: -3, standing: -2 } } },
            { label: f.no, effects: { morale: -1 } },
          ],
        },
      });
    } else if (kind === 'chat') {
      const opts = CHATTER.filter((c) => !used.has(c.body) && (c.from !== 'Dana' || bosses.includes('dana')) && (c.from !== 'Theo' || bosses.includes('theo')));
      if (!opts.length) continue;
      const c = pick(r, opts);
      used.add(c.body);
      out.push({
        at, type: 'msg',
        msg: { app: c.app, from: c.from, body: c.body, expiresIn: 40, timeoutEffects: {}, timeoutLog: `${c.from.split(' ')[0]} didn't hear back. No harm done.`, choices: c.replies.map((label) => (c.work ? { label, effects: { morale: 1 } } : { label, effects: { stress: -2 } })) },
      });
    } else if (kind === 'treat') {
      if (used.has('treat')) continue;
      used.add('treat');
      const lunch = has('tably') && at < t('11:15') && chance(r, 0.6);
      if (!lunch && !has('brew')) continue;
      const by = lunch ? t('12:00') : Math.min(q15(at + 90), t('16:00'));
      out.push({
        at, type: 'task',
        task: { id: id(), kind: 'treat', treat: lunch ? 'lunch' : 'coffee', text: lunch ? `Book a team lunch on Tably (by ${fmt(by)})` : `Coffee run for the team (by ${fmt(by)})`, deadline: by, reward: { morale: 2 }, fail: { morale: -4 } },
        msg: lunch
          ? { app: 'huddle', from: 'Bev (People Ops)', body: `The team is flagging. Could you book a team lunch somewhere today? Tably, before ${fmt(by)}. On the company card. Margo approved it. (Margo doesn't know yet.)` }
          : { app: 'huddle', from: 'Wren', body: `is anyone doing a coffee run?? the whole team is running on fumes. before ${fmt(by)}? 🥺` },
      });
    } else if (kind === 'invoice') {
      if (used.has('invoice')) continue;
      used.add('invoice');
      const v = pick(r, INVOICES.filter((x) => bosses.includes(x.who)));
      if (!v) continue;
      const by = Math.min(q15(at + 150 + r() * 90), t('17:00'));
      out.push({
        at, type: 'task',
        task: { id: id(), kind: 'invoice', text: `Pay ${v.payee} ($${v.amount})`, payee: v.payee, amount: v.amount, exec: v.who, deadline: by, reward: { standing: 1 }, fail: { standing: -3, runway: -Math.round(v.amount * 0.25) } },
        msg: { app: 'mail', from: `Accounts · ${v.payee}`, subject: `Invoice due ${fmt(by)}`, body: v.body },
      });
    } else if (kind === 'gift') {
      const opts = GIFTS.filter((g) => !used.has(g.to));
      if (!opts.length) continue;
      const g = pick(r, opts);
      used.add(g.to);
      out.push({
        at, type: 'task',
        task: { id: id(), kind: 'gift', text: g.text, recipient: g.to, budget: g.budget, deadline: Math.min(at + 150, t('17:30')), reward: { standing: 3 }, fail: { standing: -3 } },
        msg: { app: 'huddle', from: g.from, body: g.body },
      });
    } else if (kind === 'errand') {
      const opts = ERRANDS.filter((x) => !used.has(x.title));
      if (!opts.length) continue;
      const x = pick(r, opts);
      used.add(x.title);
      const by = Math.min(q15(at + 120 + r() * 90), t('17:30'));
      out.push({
        at, type: 'request',
        event: {
          id: id(), title: x.title, attendees: ['me'], start: null, duration: x.dur, deadline: by, kind: 'personal',
          travel: x.travel?.[0], place: x.travel?.[1],
          reward: { stress: -3 }, missPenalty: { stress: 6 }, declinePenalty: { stress: 3 }, bumpPenalty: { stress: 2 },
          note: `Your own errand. Before ${fmt(by)}.`,
        },
        msg: { app: 'messages', from: x.from, body: x.body.replace('{by}', fmt(by)) },
      });
    } else if (kind === 'mywork') {
      const opts = MY_WORK.filter((x) => !used.has(x.title));
      if (!opts.length) continue;
      const x = pick(r, opts);
      used.add(x.title);
      const by = Math.min(q15(at + 120 + r() * 90), t('17:30'));
      out.push({
        at, type: 'request',
        event: {
          id: id(), title: x.title, attendees: ['me'], start: null, duration: x.dur, deadline: by,
          reward: { standing: 2 }, missPenalty: { standing: -3 }, declinePenalty: { standing: -2 }, bumpPenalty: { standing: -1 },
          note: `Your work. Before ${fmt(by)}.`,
        },
        msg: { app: x.app, from: x.from, subject: x.app === 'mail' ? x.title : undefined, body: x.body.replace('{by}', fmt(by)) },
      });
    } else if (kind === 'advice') {
      const opts = ADVICE.filter((x) => !used.has(x.body));
      if (!opts.length) continue;
      const x = pick(r, opts);
      used.add(x.body);
      out.push({ at, type: 'msg', msg: { app: 'huddle', from: 'Margo', body: x.body, choices: x.choices, advice: { gut: x.gut }, expiresIn: 40, timeoutEffects: { standing: -2 }, timeoutLog: 'Margo asked for advice. You were busy. She did her own thing.' } });
    } else if (kind === 'table') {
      if (used.has('table')) continue;
      used.add('table');
      const party = pick(r, [2, 3, 4, 6]);
      const i0 = Math.floor(r() * (TABLE_TIMES.length - 1));
      const win: [number, number] = [TABLE_TIMES[i0], TABLE_TIMES[i0 + 1]];
      const who = pick(r, ['an angel investor', 'Greenleaf', 'the TechLeaf editor', "Margo's old boss"]);
      out.push({
        at, type: 'task',
        task: { id: id(), kind: 'reservation', text: `Dinner with ${who}: ${party} people, ${fmt(win[0])}–${fmt(win[1])}`, party, window: win, deadline: Math.min(at + 150, t('17:30')), reward: { standing: 3 }, fail: { standing: -4 } },
        msg: { app: 'huddle', from: 'Margo', body: `dinner w/ ${who} tonight!! ${party} of us, ${fmt(win[0])}–${fmt(win[1])}. somewhere nice. Tably it 🍽️` },
      });
    }
  }
  // Kendall (from Day 8): mostly helpful, sometimes not.
  if (dayIndex >= 7) {
    const k = 2 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      out.push({ at: t('9:40') + Math.floor(r() * (t('16:00') - t('9:40'))), type: 'kendall', mode: r() < (morale < 35 ? 0.5 : morale >= 70 ? 0.15 : 0.3) ? 'sabotage' : 'help' });
    }
  }
  return out;
}
