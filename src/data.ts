import type { DayDef, Drink, Exec, ExecId, Product, Rule } from './types';

export const t = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const fmt = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

export const PREP_TIME = t('7:45');
export const DAY_START = t('9:00');
export const DAY_END = t('18:00');
export const CAL_START = t('8:30');
export const CAL_END = t('18:30');
export const PAYROLL = 3500;

export const EXECS: Record<ExecId, Exec> = {
  margo: {
    id: 'margo',
    name: 'Margo Vance',
    short: 'Margo',
    title: 'Founder & CEO',
    color: '#ff7a59',
    emoji: '🌱',
    drink: 'oat-flat-white',
    quirks: [
      'Not a morning person. Nothing before 10am except standup.',
      'Says yes to everything in person. Blames you later.',
      'Gets hangry. Protect lunch.',
    ],
  },
  theo: {
    id: 'theo',
    name: 'Theo Okafor',
    short: 'Theo',
    title: 'CTO',
    color: '#4f7cff',
    emoji: '🛠️',
    drink: 'black',
    quirks: [
      '1–5pm is focus time. Sacred. Do not touch.',
      'Forgets to eat. Lunch before 1pm or never.',
      'Loves vendor demos. Vendor demos are long.',
    ],
  },
};

export const DRINKS: Drink[] = [
  { id: 'oat-flat-white', name: 'Oat Flat White, extra hot', emoji: '☕', price: 6 },
  { id: 'oat-latte', name: 'Oat Latte', emoji: '🥛', price: 6 },
  { id: 'black', name: 'Black Coffee', emoji: '⚫', price: 4 },
  { id: 'matcha', name: 'Matcha Latte', emoji: '🍵', price: 7 },
  { id: 'cortado', name: 'Cortado', emoji: '🤎', price: 5 },
  { id: 'mocha', name: 'Triple Mocha w/ Whip', emoji: '🍫', price: 8 },
];

export const PRODUCTS: Product[] = [
  { id: 'mug', name: 'Branded Sproutly Mug', emoji: '☕', price: 12, desc: '"Talk to your plants." Ships in a box with more logo.', tier: 'cheap' },
  { id: 'succulent', name: 'Desk Succulent', emoji: '🪴', price: 38, desc: 'On-brand. Hard to kill. Like Margo.', tier: 'good' },
  { id: 'chocolate', name: 'Artisan Chocolate Box', emoji: '🍫', price: 54, desc: '12 pieces. Each one has a backstory.', tier: 'good' },
  { id: 'candle', name: 'Candle: "Boardroom"', emoji: '🕯️', price: 64, desc: 'Notes of leather, ambition and quiet panic.', tier: 'good' },
  { id: 'whisky', name: 'Single Malt, 18 yr', emoji: '🥃', price: 180, desc: 'Says "we\'re doing great" louder than words.', tier: 'lavish' },
];

export const RULES: Record<string, Rule> = {
  margoMorning: {
    id: 'margoMorning',
    text: 'Margo: no meetings before 10am (standup excepted).',
    short: 'Margo before 10am',
    penalty: { standing: -4 },
    check: (ev) => ev.attendees.includes('margo') && !ev.fixed && ev.kind !== 'personal' && (ev.start ?? 0) < t('10:00'),
  },
  theoFocus: {
    id: 'theoFocus',
    text: 'Theo: 1–5pm is focus time. Nothing goes in it.',
    short: "Theo's focus block",
    penalty: { morale: -10 },
    check: (ev) =>
      ev.attendees.includes('theo') &&
      ev.kind !== 'focus' &&
      ev.start !== null &&
      ev.start < t('17:00') &&
      ev.start + ev.duration > t('13:00'),
  },
  max60: {
    id: 'max60',
    text: 'HR: no meeting may run longer than 60 minutes.',
    short: 'Over 60 min',
    penalty: { standing: -3 },
    check: (ev) => ev.kind !== 'focus' && ev.kind !== 'personal' && ev.duration > 60 && !ev.fixed,
  },
};

export const DAYS: DayDef[] = [
  // ───────────────────────────── DAY 1 ─────────────────────────────
  {
    title: 'Welcome to Sproutly',
    subtitle: 'The AI that talks to your houseplants.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Welcome aboard! 🌱',
      body:
        "Hi and welcome! You're Margo's new Executive Assistant. Your last three predecessors were lovely.\n\nYou're on a 30-day probation. Margo's requests from overnight are waiting in your calendar. Get her day sorted before 9am.\n\nTip: things go long. Leave yourself some breathing room. 💐",
    },
    execs: ['margo'],
    rules: ['margoMorning'],
    events: [
      { id: 'd1-standup', title: 'Standup', attendees: ['margo'], start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } },
      {
        id: 'd1-kestrel', title: 'Investor call · Kestrel Ventures', attendees: ['margo'], start: null, duration: 45,
        prep: 30, window: [t('10:00'), t('16:00')], overrun: 20,
        reward: { runway: 4000, standing: 6 }, missPenalty: { standing: -15, runway: -3000 }, declinePenalty: { standing: -20 },
        note: 'The big one. Needs 30 min clear beforehand to prep.',
      },
      {
        id: 'd1-wren', title: '1:1 · Wren (Design)', attendees: ['margo'], start: null, duration: 30,
        reward: { morale: 4 }, missPenalty: { morale: -5 }, declinePenalty: { morale: -4 },
        note: 'Wren has "a few concerns". Wren always has a few concerns.',
      },
      {
        id: 'd1-podcast', title: 'Podcast · "Leaf It Out"', attendees: ['margo'], start: null, duration: 60,
        window: [t('13:00'), t('16:30')], coffee: true,
        reward: { standing: 4, runway: 500 }, missPenalty: { standing: -6 }, declinePenalty: { standing: -5 },
        note: 'Afternoons only. Margo needs her coffee first.',
      },
      {
        id: 'd1-lunch', title: "Margo's lunch 🥗", attendees: ['margo'], start: null, duration: 45, kind: 'personal',
        window: [t('12:00'), t('14:00')],
        reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6, standing: -2 },
        note: 'Protect this. You do not want to meet hangry Margo.',
      },
      {
        id: 'd1-interview', title: 'Interview · Ops candidate', attendees: ['margo'], start: null, duration: 30,
        reward: { morale: 3 }, missPenalty: { morale: -3, stress: 3 }, declinePenalty: { morale: -2 },
        note: 'Candidate is driving two hours for this. No pressure.',
      },
    ],
    script: [
      { at: t('9:04'), type: 'msg', msg: { app: 'huddle', from: 'Margo', body: "morning!!! 🌞 did I agree to a podcast yesterday? I agree to everything after two kombuchas" } },
      { at: t('9:30'), type: 'msg', msg: { app: 'mail', from: 'Bev (People Ops)', subject: 'Probation, the fine print', body: "Just so you know how this works: if Margo sends you a \"Quick chat? 🙂\" invite, that's a strike. Three strikes and... well. Let's not think about that! 💐" } },
      { at: t('10:40'), type: 'msg', msg: { app: 'huddle', from: 'Margo', body: 'also my coffee order, write this down: OAT flat white, EXTRA hot. NOT a latte. lattes are for cowards ☕' } },
      { at: t('10:40'), type: 'reveal', flag: 'drink-margo' },
      {
        at: t('12:45'), type: 'request',
        event: {
          id: 'd1-gerald', title: 'Sync · Gerald (Board)', attendees: ['margo'], start: null, duration: 15, deadline: t('16:00'),
          reward: { standing: 3 }, missPenalty: { standing: -8 }, declinePenalty: { standing: -6 },
          note: 'Must start before 4pm. Gerald will "just pop in" otherwise.',
        },
        msg: { app: 'mail', from: 'Gerald Pemberton', subject: '15 mins today?', body: 'Margo — 15 minutes today, before 4? Nothing urgent. (It is a bit urgent.)\n\n— G' },
      },
      {
        at: t('14:20'), type: 'call',
        call: {
          from: 'Tobias · Kestrel Ventures',
          lines: ['"Hi! Tobias from Kestrel."', '"Loved the call. Could Margo send the deck tonight? The partners meet tomorrow."', '"She mentioned it\'s… not quite ready?"'],
          choices: [
            { label: 'Send the draft deck yourself', effects: { runway: 3000, standing: -6 }, log: 'Sent an unfinished deck. Kestrel liked it. Margo did not.' },
            { label: 'Stall politely', effects: { runway: -1500 }, log: 'Kestrel cooled off a little.' },
            { label: 'Pull Margo out of her meeting', effects: { standing: 2, morale: -3, stress: 5 }, log: 'Margo handled it. The room she left did not love it.' },
          ],
          missed: { runway: -2000, stress: 3 },
          missedLog: 'Missed Kestrel\'s call. They went with "we\'ll circle back".',
        },
      },
      {
        at: t('15:30'), type: 'task',
        task: { id: 'd1-gift', kind: 'gift', text: 'Send Kestrel a thank-you gift (~$50)', recipient: 'Kestrel Ventures', budget: 50, deadline: t('17:30'), reward: { standing: 4 }, fail: { standing: -5 } },
        msg: { app: 'mail', from: 'Margo', subject: 'thank-you gift?', body: "Can you send Kestrel something nice? Budget like $50. We are a startup. But make it look like we're not. 🙏\n\n(Bundl has stuff.)" },
      },
      {
        at: t('16:05'), type: 'msg',
        msg: {
          app: 'messages', from: 'Jules ❤️', body: 'dinner tonight at 7? or have they chained you to a desk already 😅', expiresIn: 60, timeoutEffects: { stress: 4 }, timeoutLog: 'Left Jules on read.',
          choices: [
            { label: "Wouldn't miss it ❤️", effects: { stress: -8 } },
            { label: 'Might be a bit late…', effects: { stress: 4, standing: 1 } },
          ],
        },
      },
      { at: t('17:05'), type: 'msg', msg: { app: 'huddle', from: 'Theo', body: "Hi. Theo, CTO. Heard you're doing my calendar from tomorrow. I have one rule. You'll find out what it is." } },
      { at: t('17:25'), type: 'msg', msg: { app: 'messages', from: 'Mum', body: 'Hope the new job is going well!! Remember to EAT. Love you x' } },
    ],
  },

  // ───────────────────────────── DAY 2 ─────────────────────────────
  {
    title: 'Two Bosses',
    subtitle: 'Theo has entered the chat.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'New policy + new boss',
      body:
        "Two things!\n\n1. Margo read a book on productivity. Effective today: no meeting may run longer than 60 minutes.\n\n2. You're now also managing Theo (CTO). His 1–5pm focus block is non-negotiable. Last EA who touched it now works at a llama farm. (Happily, we hear.)",
    },
    execs: ['margo', 'theo'],
    rules: ['margoMorning', 'theoFocus', 'max60'],
    events: [
      { id: 'd2-standup', title: 'Standup', attendees: ['margo', 'theo'], start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } },
      { id: 'd2-focus', title: 'Focus time 🔒', attendees: ['theo'], start: t('13:00'), duration: 240, fixed: true, kind: 'focus', note: 'Sacred.' },
      {
        id: 'd2-review', title: 'Product review', attendees: ['margo', 'theo'], start: null, duration: 60, overrun: 30,
        reward: { morale: 5, standing: 3 }, missPenalty: { standing: -8, morale: -4 }, declinePenalty: { standing: -6 },
        note: 'Both of them. These always run long.',
      },
      {
        id: 'd2-press', title: 'Press · TechLeaf interview', attendees: ['margo'], start: null, duration: 30, window: [t('10:00'), t('12:00')], coffee: true,
        reward: { standing: 5, runway: 1000 }, missPenalty: { standing: -8 }, declinePenalty: { standing: -5 },
        note: 'Morning slot. Without coffee she says "synergy" a lot.',
      },
      {
        id: 'd2-hire', title: 'Interview · Senior Engineer', attendees: ['theo'], start: null, duration: 45,
        reward: { morale: 4 }, missPenalty: { morale: -6 }, declinePenalty: { morale: -4 },
      },
      {
        id: 'd2-vendor', title: 'Demo · CloudCompost', attendees: ['theo'], start: null, duration: 90,
        reward: { morale: 2 }, missPenalty: { morale: -2 }, declinePenalty: { morale: -3 },
        note: 'Theo really wants this one. It is 90 minutes long.',
      },
      {
        id: 'd2-mlunch', title: "Margo's lunch 🥗", attendees: ['margo'], start: null, duration: 45, kind: 'personal', window: [t('12:00'), t('14:00')],
        reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6 },
      },
      {
        id: 'd2-tlunch', title: "Theo's lunch 🍜", attendees: ['theo'], start: null, duration: 30, kind: 'personal', window: [t('11:30'), t('12:30')],
        reward: { morale: 2 }, missPenalty: { morale: -4 }, declinePenalty: { morale: -4 },
        note: 'Before focus time, or he forgets to eat until 6pm.',
      },
    ],
    script: [
      { at: t('9:06'), type: 'msg', msg: { app: 'huddle', from: 'Theo', body: 'Reminder: 1pm–5pm is focus time. Anything booked in it and I simply evaporate. 💨' } },
      {
        at: t('10:20'), type: 'request',
        event: {
          id: 'd2-pricing', title: 'Pricing chat (urgent)', attendees: ['margo', 'theo'], start: null, duration: 30, deadline: t('15:00'),
          reward: { standing: 6, runway: 1000 }, missPenalty: { standing: -10 }, declinePenalty: { standing: -10 },
          note: 'Both of them, 30 min, must start before 3pm. Good luck.',
        },
        msg: { app: 'huddle', from: 'Margo', body: 'ok BIG idea 💡 theo and I need to talk pricing TODAY. 30 min. before 3pm. make it happen ✨' },
      },
      {
        at: t('11:40'), type: 'insert',
        event: { id: 'd2-dentist', title: 'Dentist (ran long) 🦷', attendees: ['margo'], start: t('11:45'), duration: 105, fixed: true, force: true, kind: 'personal', note: 'Margo is unreachable until 1:30.' },
        msg: { app: 'huddle', from: 'Margo', body: "dentist is running SO long 🦷 can't do anything til 1:30. pls fix everything 🙏" },
      },
      {
        at: t('14:05'), type: 'msg',
        msg: {
          app: 'mail', from: 'Bev (People Ops)', subject: 'Mandatory: Compliance Training', body: "Friendly reminder that \"Spreadsheets, Ethics & You\" (30 min) is due today! It's mandatory. Mostly. 💐",
          choices: [
            { label: 'Do it now (your phone, your time)', effects: { stress: 6, standing: 2 } },
            { label: "Do it later (you won't)", effects: { stress: 2 }, flag: 'skipped-training' },
          ],
        },
      },
      {
        at: t('15:10'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Wren', body: 'quick q: is theo in a good mood today? asking for a friend (me) (i broke staging)', expiresIn: 40,
          choices: [
            { label: '"Wait till after 5. Trust me."', effects: { morale: 3 } },
            { label: '"Go now, rip the band-aid"', effects: { morale: -4 }, log: 'Wren interrupted focus time. Theo evaporated.' },
          ],
        },
      },
      {
        at: t('16:10'), type: 'task',
        task: { id: 'd2-theo-coffee', kind: 'coffee', exec: 'theo', text: 'Get Theo a coffee (by 4:45pm)', deadline: t('16:45'), reward: { morale: 5 }, fail: { morale: -3 } },
        msg: { app: 'huddle', from: 'Theo', body: "Would kill for a black coffee. No sugar. \"Oat\" is a lie told by Big Oat. No pressure. Some pressure." },
      },
      { at: t('16:10'), type: 'reveal', flag: 'drink-theo' },
      {
        at: t('17:15'), type: 'msg',
        msg: {
          app: 'messages', from: 'Jules ❤️', body: 'you said 7 yesterday and walked in at 8:40 😐', expiresIn: 40, timeoutEffects: { stress: 6 }, timeoutLog: 'Left Jules on read. Again.',
          choices: [
            { label: "I'm sorry. Tomorrow I'm all yours.", effects: { stress: -6 }, flag: 'promised-jules' },
            { label: "Work's insane rn, bear with me", effects: { stress: 6 } },
          ],
        },
      },
    ],
  },

  // ───────────────────────────── DAY 3 ─────────────────────────────
  {
    title: 'The Squeeze',
    subtitle: 'There are no right answers. Only less-wrong ones.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Big day!! (no pressure)',
      body:
        "Kestrel's partners are visiting today. If it goes well, Sproutly survives the quarter. If not… let's stay positive! 🌸\n\nAlso, Finance lowered the company card limit. Please spend wisely.",
    },
    execs: ['margo', 'theo'],
    rules: ['margoMorning', 'theoFocus', 'max60'],
    events: [
      { id: 'd3-standup', title: 'Standup', attendees: ['margo', 'theo'], start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } },
      { id: 'd3-focus', title: 'Focus time 🔒', attendees: ['theo'], start: t('13:00'), duration: 240, fixed: true, kind: 'focus' },
      { id: 'd3-board', title: 'Board call', attendees: ['margo', 'theo'], start: t('17:00'), duration: 60, fixed: true, force: true, reward: { standing: 3 } },
      {
        id: 'd3-kestrel', title: 'Kestrel partner meeting 💰', attendees: ['margo', 'theo'], start: null, duration: 60, prep: 30, coffee: true, overrun: 15,
        window: [t('10:00'), t('11:30')], strikeOnMiss: true,
        reward: { runway: 12000, standing: 10 }, missPenalty: { runway: -8000, standing: -20 }, declinePenalty: { standing: -25 },
        note: 'Start by 11:30 (they fly out). 30 min prep. Margo needs coffee. Miss it = strike.',
      },
      {
        id: 'd3-sam', title: '1:1 · Margo & Sam: "Restructuring"', attendees: ['margo'], start: null, duration: 30,
        reward: { standing: 3 }, missPenalty: { standing: -4 }, declinePenalty: { standing: -4 },
        note: 'Sam from Marketing. That calendar title is… a lot.',
      },
      {
        id: 'd3-arch', title: 'Architecture review', attendees: ['theo'], start: null, duration: 60,
        reward: { morale: 4 }, missPenalty: { morale: -5 }, declinePenalty: { morale: -4 },
      },
      {
        id: 'd3-dinnerprep', title: 'Investor dinner prep', attendees: ['margo'], start: null, duration: 30, window: [t('14:00'), t('16:30')],
        reward: { standing: 3 }, missPenalty: { standing: -5 }, declinePenalty: { standing: -4 },
      },
      {
        id: 'd3-mlunch', title: "Margo's lunch 🥗", attendees: ['margo'], start: null, duration: 45, kind: 'personal', window: [t('12:00'), t('14:00')],
        reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6 },
      },
      {
        id: 'd3-tlunch', title: "Theo's lunch 🍜", attendees: ['theo'], start: null, duration: 30, kind: 'personal', window: [t('11:30'), t('12:30')],
        reward: { morale: 2 }, missPenalty: { morale: -4 }, declinePenalty: { morale: -4 },
      },
    ],
    script: [
      {
        at: t('9:10'), type: 'msg',
        msg: {
          app: 'mail', from: 'Finance Bot 🤖', subject: '⚠️ Card limit: 3 bills, money for 2',
          body: 'Three bills are due today. The card can cover two. Please choose.\n\n• Cloud hosting ($1,500)\n• Office coffee vendor ($1,000)\n• Conference booth deposit ($1,500)',
          expiresIn: 90, timeoutEffects: { runway: -3000, standing: -6 }, timeoutLog: 'Finance Bot picked for you. Badly.',
          choices: [
            { label: 'Cloud + coffee (skip the booth)', effects: { runway: -2500, standing: -8 }, log: 'Margo lost her conference booth. She is "not mad, just disappointed".' },
            { label: 'Cloud + booth (skip coffee)', effects: { runway: -3000, morale: -12 }, log: 'The office coffee machine was repossessed. The team mourns.' },
            {
              label: 'Coffee + booth (skip cloud)', effects: { runway: -2500 }, log: 'Skipped the cloud bill. Surely nothing will happen.',
              then: [{ at: t('14:00'), type: 'effects', effects: { runway: -6000, morale: -6 }, log: 'The servers went down. Every plant in the country went silent.', msg: { app: 'huddle', from: 'Theo', body: "THE SERVERS ARE DOWN. WHO DIDN'T PAY THE CLOUD BILL." } }],
            },
          ],
        },
      },
      {
        at: t('10:05'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Sam', body: "hey!! 👋 saw something on Margo's calendar with my name and the word \"restructuring\" 😬 should I be worried lol",
          expiresIn: 45, timeoutEffects: { morale: -4 }, timeoutLog: 'Left Sam on read. Sam assumes the worst.',
          choices: [
            { label: 'Tell Sam the truth (it looks bad)', effects: { morale: 6, standing: -10 }, log: 'Sam knows. So does Margo, somehow.' },
            { label: '"I genuinely don\'t know!" (you do)', effects: { stress: 8, morale: -2 } },
            { label: '"Probably nothing! 🙂"', effects: { stress: 4 }, flag: 'lied-to-sam' },
          ],
        },
      },
      {
        at: t('10:30'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: "running late. smoothie situation 🥤 if kestrel asks, tell them I'm \"in traffic\" 🚗",
          expiresIn: 30, timeoutEffects: { standing: -5 }, timeoutLog: 'Kestrel asked where Margo was. You had nothing.',
          choices: [
            { label: 'Tell Kestrel she\'s "in traffic"', effects: { standing: 4 }, flag: 'lied' },
            { label: 'Refuse to lie for her', effects: { standing: -8, morale: 3 }, log: 'Margo: "wow. ok." 🙂' },
            { label: 'Send Kestrel pastries to stall ($80)', effects: { runway: -80, standing: 2 }, log: 'Kestrel ate the pastries. Crisis postponed.' },
          ],
        },
      },
      {
        at: t('13:20'), type: 'insert',
        event: {
          id: 'd3-sync', title: 'Quick sync (Margo booked it)', attendees: ['margo', 'theo'], start: t('14:00'), duration: 30,
          reward: { standing: 2 }, missPenalty: { standing: -6 }, declinePenalty: { standing: -6 },
          note: "Margo put this right in Theo's focus block. She said don't move it.",
        },
        msg: { app: 'huddle', from: 'Margo', body: "put a quick sync w/ theo at 2 ✌️ don't move it" },
      },
      {
        at: t('13:35'), type: 'call',
        call: {
          from: 'Theo',
          lines: ['"Theo here."', '"There is a \'quick sync\' in my focus block."', '"Did you do this?"'],
          choices: [
            { label: '"Margo booked it herself, sorry"', effects: { morale: -2 }, log: 'Theo sighed at a frequency only dogs can hear.' },
            { label: '"I\'ll move it" (Margo said don\'t)', effects: { morale: 5, standing: -5 } },
            { label: '"Yes. It\'s important."', effects: { morale: -6, standing: 3 } },
          ],
          missed: { morale: -4 },
          missedLog: 'You let Theo go to voicemail. He left a 4-minute silence.',
        },
      },
      {
        at: t('15:00'), type: 'task',
        task: { id: 'd3-jules', kind: 'gift', personal: true, text: "Get Jules a birthday gift (it's TODAY)", recipient: 'Jules', budget: 60, deadline: t('17:50'), reward: { stress: -10 }, fail: { stress: 15 } },
        msg: { app: 'messages', from: 'Jules ❤️', body: "tonight!! 7pm, Lucca's. it's my birthday and you PROMISED 🥺🎂" },
      },
      {
        at: t('16:00'), type: 'move', id: 'd3-board', start: t('17:30'), duration: 30,
        msg: {
          app: 'mail', from: 'Margo', subject: 'board call moved → 5:30 (will run to 7)', body: "Board moved the call to 5:30. It'll run to 7. Need you on it for notes. You're the best 🙏",
          expiresIn: 60, timeoutEffects: { standing: -6 }, timeoutLog: "Didn't answer Margo about the board call.",
          choices: [
            { label: 'Stay late. Text Jules sorry.', effects: { standing: 8, stress: 20 }, log: "Stayed for the board call. Missed Jules' birthday dinner." },
            { label: 'Leave at 6. Send a notes template.', effects: { standing: -10, stress: -5 }, log: 'Went to the birthday dinner. Margo noticed.' },
            { label: 'Ask Wren to cover notes', effects: { morale: -6, standing: -3 }, log: 'Wren covered. Wren will remember this.' },
          ],
        },
      },
      { at: t('17:40'), type: 'msg', msg: { app: 'huddle', from: 'Gerald', body: 'Margo — is the new EA working out? Asking for the board. — G\n\n(Sorry, wrong channel.)' } },
    ],
    reckonings: [
      { flag: 'lied', text: "Kestrel saw Margo's smoothie selfie on LinkedIn. They know about the \"traffic\".", effects: { standing: -6, runway: -2000 } },
      { flag: 'embezzle', text: 'Finance found a birthday gift on the company card.', effects: { standing: -10 }, strike: true },
    ],
  },
];
