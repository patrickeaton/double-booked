// The fortnight: 14 days of probation. Hand-written story beats live here; the ad-hoc pool (adhoc.ts) fills the gaps.
// See STORY.md for the arc these beats follow.
import { t } from './data';
import type { DayDef, EventDef, ExecId } from './types';

const standup = (d: string, who: ExecId[] = ['margo', 'theo']): EventDef => ({ id: `${d}-standup`, title: 'Standup', attendees: who, start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } });
const focus = (d: string): EventDef => ({ id: `${d}-focus`, title: 'Focus time 🔒', attendees: ['theo'], start: t('13:00'), duration: 240, fixed: true, kind: 'focus' });
const mlunch = (d: string, at = '12:30'): EventDef => ({
  id: `${d}-mlunch`, proposed: t(at), title: "Margo's lunch 🥗", minOk: 30, attendees: ['margo'], start: null, duration: 45, kind: 'personal', window: [t('12:00'), t('14:00')],
  reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6 },
});
const tlunch = (d: string, at = '12:00'): EventDef => ({
  id: `${d}-tlunch`, proposed: t(at), title: "Theo's lunch 🍜", minOk: 15, attendees: ['theo'], start: null, duration: 30, kind: 'personal', window: [t('11:30'), t('12:30')],
  reward: { morale: 2 }, missPenalty: { morale: -4 }, declinePenalty: { morale: -4 },
});
const WEEKDAY_RULES = ['margoMorning', 'theoFocus', 'max60'];
const WEEK2_RULES = [...WEEKDAY_RULES, 'danaShort'];
const W1: ExecId[] = ['margo', 'theo', 'me'];
const W1T: ExecId[] = ['margo', 'theo', 'team', 'me'];
const ALL: ExecId[] = ['margo', 'theo', 'dana', 'team', 'me'];
/** Company-wide standup lives on the Team calendar once there is one. */
const teamStandup = (d: string, who: ExecId[] = ['team', 'margo', 'theo', 'me']): EventDef => standup(d, who);
const myLunch = (d: string): EventDef => ({
  id: `${d}-melunch`, proposed: t('13:00'), title: 'Your lunch 🥪', minOk: 15, attendees: ['me'], start: null, duration: 30, kind: 'personal', window: [t('12:00'), t('14:30')],
  reward: { stress: -4 }, missPenalty: { stress: 6 }, declinePenalty: { stress: 5 }, note: 'Yours. You are allowed to eat.',
});
const weekendMemo = (subject: string, body: string) => ({ from: 'Your phone 📱', subject, body });

export const DAYS: DayDef[] = [
  // ───────────────────────────── DAY 1 ─────────────────────────────
  {
    title: 'Welcome to Sproutly',
    weekday: 'Wed',
    adhoc: 1,
    apps: ['calendar', 'huddle', 'notes', 'brew', 'pulse'],
    subtitle: 'The AI that talks to your houseplants.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Welcome aboard! 🌱',
      body:
        "Hi and welcome! You're Margo's new Executive Assistant. Your last three predecessors were lovely.\n\nYou're on a 14-day probation (weekends included — startups don't believe in them). Margo said yes to a lot of things overnight, and some of them are already on her calendar. Some of them overlap. Some of them break her own rules. Get her day sorted before 9am.\n\nFor now you've got the basics: Calendar, Huddle (chat), Notes and Brew (coffee). IT says the rest of your apps are \"coming\".\n\nTip: things go long. Leave yourself some breathing room. 💐",
    },
    execs: ['margo'],
    rules: ['margoMorning'],
    events: [
      { id: 'd1-standup', title: 'Standup', attendees: ['margo'], start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } },
      {
        id: 'd1-kestrel', proposed: t('11:00'), title: 'Investor call · Kestrel Ventures', bumpPenalty: { standing: -6, runway: -1000 }, attendees: ['margo'], start: null, duration: 45,
        prep: 30, window: [t('10:00'), t('16:00')], overrun: 20,
        reward: { runway: 4000, standing: 6 }, missPenalty: { standing: -15, runway: -3000 }, declinePenalty: { standing: -20 },
        note: 'The big one. Needs 30 min clear beforehand to prep.',
      },
      {
        id: 'd1-wren', title: '1:1 · Wren (Design)', bumpPenalty: {}, catering: 'nice', attendees: ['margo'], start: null, duration: 30,
        reward: { morale: 4 }, missPenalty: { morale: -5 }, declinePenalty: { morale: -4 },
        note: 'Wren has "a few concerns". Wren always has a few concerns.',
      },
      {
        id: 'd1-podcast', proposed: t('12:30'), title: 'Podcast · "Leaf It Out"', minOk: 45, bumpPenalty: { standing: -3 }, travel: 20, place: 'Leaf It Out studio', remoteOk: 'meh', attendees: ['margo'], start: null, duration: 60,
        window: [t('13:00'), t('16:30')], coffee: true,
        reward: { standing: 4, runway: 500 }, missPenalty: { standing: -6 }, declinePenalty: { standing: -5 },
        note: 'Afternoons only, across town. Margo needs her coffee first. (Could dial in, but it sounds worse.)',
      },
      {
        id: 'd1-lunch', proposed: t('12:00'), title: "Margo's lunch 🥗", minOk: 30, attendees: ['margo'], start: null, duration: 45, kind: 'personal',
        window: [t('12:00'), t('14:00')],
        reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6, standing: -2 },
        note: 'Protect this. You do not want to meet hangry Margo.',
      },
    ],
    script: [
      { at: t('9:04'), type: 'msg', msg: { app: 'huddle', from: 'Margo', body: "morning!!! 🌞 did I agree to a podcast yesterday? I agree to everything after two kombuchas" } },
      { at: t('9:30'), type: 'msg', msg: { app: 'huddle', from: 'Bev (People Ops)', subject: 'Probation, the fine print', body: "Just so you know how this works: if Margo sends you a \"Quick chat? 🙂\" invite, that's a strike. Three strikes and... well. Let's not think about that! 💐" } },
      { at: t('10:40'), type: 'msg', msg: { app: 'huddle', from: 'Margo', body: 'also my coffee order, write this down: OAT flat white, EXTRA hot. NOT a latte. lattes are for cowards ☕' } },
      { at: t('10:40'), type: 'reveal', flag: 'drink-margo' },
      {
        at: t('12:45'), type: 'request',
        event: {
          id: 'd1-gerald', title: 'Sync · Gerald (Board)', bumpPenalty: { standing: -5 }, travel: 15, place: "Gerald's club", remoteOk: 'meh', attendees: ['margo'], start: null, duration: 15, deadline: t('16:00'),
          reward: { standing: 3 }, missPenalty: { standing: -8 }, declinePenalty: { standing: -6 },
          note: 'Must start before 4pm. At his club. Gerald "doesn\'t really do video".',
        },
        msg: { app: 'huddle', from: 'Gerald Pemberton', subject: '15 mins today?', body: 'Margo — 15 minutes today, before 4? Nothing urgent. (It is a bit urgent.)\n\n— G' },
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
      { at: t('17:05'), type: 'msg', msg: { app: 'huddle', from: 'Theo', body: "Hi. Theo, CTO. Heard you're doing my calendar from tomorrow. I have one rule. You'll find out what it is." } },
    ],
  },

  // ───────────────────────────── DAY 2 ─────────────────────────────
  {
    title: 'Two Bosses',
    weekday: 'Thu',
    adhoc: 2,
    apps: ['mail', 'messages'],
    subtitle: 'Theo has entered the chat.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'New policy + new boss',
      body:
        "Two things!\n\n1. Margo read a book on productivity. Effective today: no meeting may run longer than 60 minutes.\n\n2. You're now also managing Theo (CTO). His 1–5pm focus block is non-negotiable. Last EA who touched it now works at a llama farm. (Happily, we hear.)\n\n3. IT set up your Mail and Messages. The rest of your apps are \"in the pipeline\".",
    },
    execs: ['margo', 'theo'],
    rules: ['margoMorning', 'theoFocus', 'max60'],
    events: [
      { id: 'd2-standup', title: 'Standup', attendees: ['margo', 'theo'], start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } },
      { id: 'd2-focus', title: 'Focus time 🔒', attendees: ['theo'], start: t('13:00'), duration: 240, fixed: true, kind: 'focus', note: 'Sacred.' },
      {
        id: 'd2-review', proposed: t('10:00'), title: 'Product review', minOk: 45, bumpPenalty: { standing: -4, morale: -2 }, catering: 'nice', attendees: ['margo', 'theo'], start: null, duration: 60, overrun: 30,
        reward: { morale: 5, standing: 3 }, missPenalty: { standing: -8, morale: -4 }, declinePenalty: { standing: -6 },
        note: 'Both of them. These always run long.',
      },
      {
        id: 'd2-hire', title: 'Interview · Senior Engineer', overrun: -15, bumpPenalty: { morale: -3 }, attendees: ['theo'], start: null, duration: 45,
        reward: { morale: 4 }, missPenalty: { morale: -6 }, declinePenalty: { morale: -4 },
      },
      {
        id: 'd2-mlunch', proposed: t('12:30'), title: "Margo's lunch 🥗", minOk: 30, attendees: ['margo'], start: null, duration: 45, kind: 'personal', window: [t('12:00'), t('14:00')],
        reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6 },
      },
      {
        id: 'd2-tlunch', proposed: t('12:00'), title: "Theo's lunch 🍜", minOk: 15, attendees: ['theo'], start: null, duration: 30, kind: 'personal', window: [t('11:30'), t('12:30')],
        reward: { morale: 2 }, missPenalty: { morale: -4 }, declinePenalty: { morale: -4 },
        note: 'Before focus time, or he forgets to eat until 6pm.',
      },
    ],
    script: [
      { at: t('9:06'), type: 'msg', msg: { app: 'huddle', from: 'Theo', body: 'Reminder: 1pm–5pm is focus time. Anything booked in it and I simply evaporate. 💨' } },
      {
        at: t('10:20'), type: 'request',
        event: {
          id: 'd2-pricing', title: 'Pricing chat (urgent)', bumpPenalty: { standing: -6 }, attendees: ['margo', 'theo'], start: null, duration: 30, deadline: t('15:00'),
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
      { at: t('9:40'), type: 'msg', msg: { app: 'messages', from: 'Mum', body: 'Hope the new job is going well!! Remember to EAT. Love you x' } },
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
    ],
  },


  // ───────────────────────────── DAY 3 ─────────────────────────────
  {
    title: 'Thank-You Notes',
    weekday: 'Fri',
    adhoc: 3,
    apps: ['bundl', 'card', 'presto'],
    subtitle: 'Friday. Allegedly the easy one.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Happy Friday! 🎉 (+ some apps)',
      body:
        "You made it to Friday! You also get your own calendar now (lighter, but yours to protect). IT came through: you now have Bundl (shopping), the company Card, and Presto ⚡ (one-tap shortcuts — set them up now, tap them later).\n\nFriday Wins is at 4:30. Attendance is \"optional\". It is not optional.",
    },
    execs: W1,
    rules: WEEKDAY_RULES,
    events: [
      standup('d3'),
      focus('d3'),
      {
        id: 'd3-press', proposed: t('10:30'), title: 'Press · TechLeaf interview', noBump: true, travel: 15, place: 'TechLeaf studio', remoteOk: 'meh', attendees: ['margo'], start: null, duration: 30, window: [t('10:00'), t('12:00')], coffee: true,
        reward: { standing: 5, runway: 1000 }, missPenalty: { standing: -8 }, declinePenalty: { standing: -5 },
        note: 'Morning slot. Without coffee she says "synergy" a lot.',
      },
      myLunch('d3'),
      { id: 'd3-wins', title: 'Friday Wins 🎉', attendees: ['margo', 'theo', 'me'], start: t('16:30'), duration: 30, fixed: true, reward: { morale: 4 } },
      mlunch('d3'),
      tlunch('d3'),
    ],
    script: [
      {
        at: t('9:50'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: 'TechLeaf photo today 📸 blazer or hoodie. be honest', advice: { gut: 1 }, expiresIn: 30, timeoutEffects: {}, timeoutLog: 'Margo dressed herself.',
          choices: [{ label: 'Blazer', effects: { standing: 2 } }, { label: 'Hoodie (founder energy)', effects: { standing: -1 } }],
        },
      },
      { at: t('12:40'), type: 'msg', msg: { app: 'messages', from: 'Ollie (flatmate)', body: "so. the landlord is selling the flat?? we have 3 weeks to move out 😬 don't panic. (panic a little)" } },
      {
        at: t('9:35'), type: 'msg',
        msg: { app: 'mail', from: 'Finance Bot 🤖', subject: 'Runway check', body: "At current burn, Sproutly has about 10 days of money left.\n\nKestrel Ventures' decision is due in two weeks.\n\nThat's fine! That's fine. 🤖" },
      },
      {
        at: t('10:15'), type: 'task',
        task: { id: 'd3-gift', kind: 'gift', text: 'Send Kestrel a thank-you gift (~$50)', recipient: 'Kestrel Ventures', budget: 50, deadline: t('15:30'), reward: { standing: 4 }, fail: { standing: -5 } },
        msg: { app: 'mail', from: 'Margo', subject: 'thank-you gift?', body: "Kestrel loved Wednesday's call!! Can you send them something nice? Budget like $50. We are a startup. But make it look like we're not. 🙏" },
      },
      { at: t('11:10'), type: 'msg', msg: { app: 'huddle', from: 'Theo', body: 'got a weird linkedin message from someone at Leafly lol. anyway. ignore that I said that.' } },
      {
        at: t('15:40'), type: 'msg',
        msg: {
          app: 'messages', from: 'Jules ❤️', body: 'work drinks or dinner w me tonight? (this is not a test) (it is a little bit a test)', expiresIn: 60, timeoutEffects: { stress: 5 }, timeoutLog: 'Left Jules on read. On a Friday.',
          choices: [
            { label: 'Dinner with you ❤️', effects: { stress: -8, standing: -2 }, log: 'Skipped Friday drinks. Margo noticed. Jules noticed more.' },
            { label: 'Work drinks (just one!)', effects: { standing: 3, stress: 6 }, log: 'It was not just one.' },
          ],
        },
      },
    ],
  },

  // ───────────────────────────── DAY 4 · SATURDAY ─────────────────────────────
  {
    title: 'Saturday (Allegedly)',
    weekday: 'Sat',
    weekend: true,
    adhoc: 3,
    apps: [],
    subtitle: 'No standup. No prep. Your phone is still on, though.',
    memo: weekendMemo("It's Saturday", "No calendar to plan. Just your phone, pinging.\n\nResting lowers stress all day. Answering work pings earns standing, but costs you the rest. Choose."),
    execs: W1,
    rules: [],
    events: [
      {
        id: 'd4-deck', title: 'Deck review (Zoom) · Margo', attendees: ['margo'], start: null, duration: 30, remote: true, deadline: t('15:00'),
        reward: { standing: 3, stress: 6 }, missPenalty: { standing: -2 }, declinePenalty: { standing: -1 }, bumpPenalty: { standing: -1 },
        note: 'On a Saturday. Declining is allowed. Probably.',
      },
    ],
    script: [
      { at: t('9:20'), type: 'msg', msg: { app: 'huddle', from: 'Margo', body: "not working today!! 🧘 just thinking. out loud. at you. can we do 30 mins on the deck at some point? zero pressure. some pressure" } },
    ],
  },

  // ───────────────────────────── DAY 5 · SUNDAY ─────────────────────────────
  {
    title: 'Sunday Scaries',
    weekday: 'Sun',
    weekend: true,
    adhoc: 2,
    apps: [],
    subtitle: 'The calm before the week. And a text from an unknown number.',
    memo: weekendMemo("It's Sunday", 'Rest up. Big week ahead: Ryde unlocks tomorrow, and everyone is going somewhere.'),
    execs: W1,
    rules: [],
    events: [],
    script: [
      { at: t('13:00'), type: 'msg', msg: { app: 'messages', from: 'Jules ❤️', body: "found a flat!! 🏠 2 bed, near the park, has a BATH. viewing is tomorrow 12:30. you have to come. you HAVE to." } },
      {
        at: t('11:00'), type: 'msg',
        msg: {
          app: 'messages', from: 'Gerald Pemberton', body: "It's Gerald (board). Would you take a call from me tomorrow? Just us. Best not to mention it to Margo. — G", expiresIn: 120, timeoutEffects: { stress: 3 }, timeoutLog: 'Ignored Gerald. He called anyway.',
          choices: [
            { label: "Sure. I'll keep it quiet.", effects: { stress: 4 }, flag: 'gerald-secret' },
            { label: "I'll have to tell Margo.", effects: { standing: 3 }, flag: 'gerald-told', log: 'Told Margo about Gerald. Margo went very quiet.' },
          ],
        },
      },
      { at: t('16:30'), type: 'msg', msg: { app: 'huddle', from: 'Margo', body: "big week!! 🚗 you're getting Ryde tmrw. you'll be driving us everywhere. not literally. ok a bit literally" } },
    ],
  },

  // ───────────────────────────── DAY 6 · MONDAY ─────────────────────────────
  {
    title: 'On the Road',
    weekday: 'Mon',
    adhoc: 4,
    apps: ['ryde'],
    subtitle: 'Everyone is somewhere else today.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Halfway! + Ryde',
      body: "You're halfway through probation! Margo says you're \"fine\". From Margo, that's practically a hug.\n\nThere's now a Team calendar for company-wide things. Everyone's meant to be at those.\n\nNew: Ryde. Off-site meetings now need a car — book one, or watch an exec hail a cab in the rain.",
    },
    execs: W1T,
    rules: WEEKDAY_RULES,
    events: [
      teamStandup('d6'),
      myLunch('d6'),
      {
        id: 'd6-flat', proposed: t('12:30'), title: 'Flat viewing w/ Jules 🏠', attendees: ['me'], start: null, duration: 30, travel: 15, place: 'Park Road flat', kind: 'personal', window: [t('12:30'), t('12:30')],
        reward: { stress: -6 }, missPenalty: { stress: 8 }, declinePenalty: { stress: 8 }, flagOnDone: 'flat-viewed', note: 'Jules booked it. 12:30 sharp. It has a BATH.',
      },
      { id: 'd6-allhands', title: 'All-hands 📣', attendees: ['team', 'margo', 'theo', 'me'], start: t('16:15'), duration: 30, fixed: true, reward: { morale: 3 }, note: 'Company-wide. Margo will "share some thoughts".' },
      focus('d6'),
      {
        id: 'd6-vendor', proposed: t('10:00'), title: 'Demo · CloudCompost', minOk: 45, bumpPenalty: { morale: -1 }, travel: 20, place: 'CloudCompost HQ', remoteOk: 'fine', attendees: ['theo'], start: null, duration: 90,
        reward: { morale: 3 }, missPenalty: { morale: -3 }, declinePenalty: { morale: -3 },
        note: 'Theo really wants this one. It is 90 minutes long. (It could be 45. Do not tell Theo.)',
      },
      {
        id: 'd6-bloomly', proposed: t('14:00'), title: 'Customer visit · Bloomly Florists', travel: 20, place: 'Bloomly Florists', noBump: true, attendees: ['margo'], start: null, duration: 45, window: [t('13:30'), t('16:30')],
        reward: { standing: 5, runway: 2000 }, missPenalty: { standing: -6 }, declinePenalty: { standing: -6 },
        note: 'A new customer. They want to meet Margo in the shop, "among the stems".',
      },
      mlunch('d6'),
      tlunch('d6', '11:45'),
    ],
    script: [
      {
        at: t('11:50'), type: 'insert',
        event: { id: 'd6-notes', title: 'Take notes · Margo & Priya', attendees: ['margo', 'me'], start: t('12:30'), duration: 30, reward: { standing: 3 }, missPenalty: { standing: -4 }, declinePenalty: { standing: -3 }, bumpPenalty: { standing: -2 }, note: 'Margo needs you in the room. At 12:30. Of course.' },
        msg: { app: 'huddle', from: 'Margo', body: 'need you in my 12:30 w/ Priya to take notes 📝 you\'re free right? you\'re always free' },
      },
      {
        at: t('10:20'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: 'real question. should I tell the team how little money we actually have? at all-hands today?', advice: { gut: 1 }, expiresIn: 60, timeoutEffects: {}, timeoutLog: 'Margo decided without you.',
          choices: [
            { label: 'Tell them the truth', effects: { morale: -5, standing: 2 }, flag: 'told-team' },
            { label: 'Not yet', effects: { stress: 3 }, flag: 'hid-runway' },
          ],
        },
      },
      {
        at: t('12:40'), type: 'call',
        call: {
          from: 'Gerald Pemberton',
          lines: ['"Gerald here. I\'ll be brief."', '"How is Margo, really? Day to day."', '"The board has… questions."'],
          choices: [
            { label: '"Brilliant. Chaotic, but brilliant."', effects: { stress: 2 }, flag: 'defended-margo' },
            { label: '"Honestly? She needs help."', effects: { stress: -2 }, flag: 'honest-early' },
            { label: '"I\'d rather not say."', effects: { stress: 3 } },
          ],
          missed: { stress: 2 },
          missedLog: 'Missed Gerald. He left a voicemail that just said "Hm."',
        },
      },
      {
        at: t('13:15'), type: 'msg', when: { if: ['gerald-told'] },
        msg: {
          app: 'huddle', from: 'Margo', body: 'gerald called you?? 👀 what did he want', expiresIn: 40, timeoutEffects: { standing: -3 }, timeoutLog: 'Margo assumed the worst.',
          choices: [
            { label: 'Tell her everything', effects: { standing: 3, stress: 2 } },
            { label: '"Just logistics!"', effects: { stress: 5 }, flag: 'lied-margo-gerald' },
          ],
        },
      },
    ],
  },

  // ───────────────────────────── DAY 7 · TUESDAY ─────────────────────────────
  {
    title: 'Table for Three',
    weekday: 'Tue',
    adhoc: 4,
    apps: ['tably'],
    subtitle: 'Dinner plans, and an email that was not meant for you.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Tably is live 🍽️',
      body: 'New: Tably, for restaurant reservations. Margo has opinions about restaurants. Most of them are about the bread.',
    },
    execs: W1T,
    rules: WEEKDAY_RULES,
    events: [
      teamStandup('d7'),
      myLunch('d7'),
      focus('d7'),
      {
        id: 'd7-tobias', proposed: t('11:00'), title: 'Check-in · Tobias (Kestrel)', attendees: ['margo'], start: null, duration: 30, window: [t('10:00'), t('16:00')], prep: 15,
        reward: { standing: 4, runway: 2000 }, missPenalty: { standing: -8, runway: -1000 }, declinePenalty: { standing: -10 },
        note: 'Kestrel keeping warm. 15 min prep.',
      },
      {
        id: 'd7-ops', title: 'Interview · Ops lead', overrun: -10, bumpPenalty: { morale: -2 }, attendees: ['margo'], start: null, duration: 30,
        reward: { morale: 3 }, missPenalty: { morale: -3 }, declinePenalty: { morale: -2 },
        note: 'If this goes well, you might get help. Imagine.',
      },
      mlunch('d7'),
      tlunch('d7'),
    ],
    script: [
      { at: t('16:40'), type: 'msg', msg: { app: 'messages', from: 'Mum', body: "don't worry but the doctor wants to run some tests. results thursday. it's probably nothing!! 😊 call me thursday x" } },
      {
        at: t('10:05'), type: 'task',
        task: { id: 'd7-dinner', kind: 'reservation', text: 'Dinner with Tobias: 3 people, 7–8pm', party: 3, window: [t('19:00'), t('20:00')], deadline: t('16:00'), reward: { standing: 4 }, fail: { standing: -6 } },
        msg: { app: 'huddle', from: 'Margo', body: 'tobias wants dinner TONIGHT 🍷 3 of us, 7–8pm. somewhere impressive but cheap. is that a thing. make it a thing (Tably)' },
      },
      {
        at: t('11:30'), type: 'msg',
        msg: {
          app: 'mail', from: 'Leafly Talent 🌿', subject: 'Confirming Thursday!', body: "Hi Theo! Confirming your final-round interview at Leafly HQ, Thursday 3pm. We're SO excited. 🌿\n\n(Wait — is this Theo's email? Oops.)",
          expiresIn: 90, timeoutEffects: { stress: 3 }, timeoutLog: "Sat on the Leafly email. It's still sitting there.",
          choices: [
            { label: 'Forward it to Margo', effects: { standing: 4, morale: -6 }, flag: 'leafly-told', log: 'Margo took Theo for a "walk". Theo is not speaking to you.' },
            { label: 'Talk to Theo privately', effects: { morale: 4, stress: 3 }, flag: 'theo-talk' },
            { label: 'Delete it. Not your business.', effects: { stress: 3 } },
          ],
        },
      },
      { at: t('14:40'), type: 'msg', when: { if: ['theo-talk'] }, msg: { app: 'huddle', from: 'Theo', body: "…thanks for not telling Margo. I'm just looking. It's been a rough few months." } },
    ],
  },

  // ───────────────────────────── DAY 8 · WEDNESDAY ─────────────────────────────
  {
    title: 'Hump Day',
    weekday: 'Wed',
    adhoc: 5,
    apps: [],
    subtitle: 'A new boss. A new colleague. Neither of them asked you.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Week two!',
      body: "Two new people today!\n\n• Dana Reyes joins as interim COO (the board's idea). Her calendar is yours now too.\n• Kendall joins as a backup EA, \"just in case\". Kendall will help with your calendars. Kendall is very helpful. 💐\n\nAlso, someone booked a meeting called \"Restructuring\". Probably nothing.",
    },
    execs: ALL,
    rules: WEEK2_RULES,
    events: [
      teamStandup('d8', ['team', 'margo', 'theo', 'dana', 'me']),
      myLunch('d8'),
      {
        id: 'd8-dana', proposed: t('10:30'), title: 'Intro · Dana & Margo', attendees: ['margo', 'dana'], start: null, duration: 30, window: [t('10:00'), t('15:00')],
        reward: { standing: 3 }, missPenalty: { standing: -5 }, declinePenalty: { standing: -6 }, note: 'Margo did not ask for a COO. Dana did not ask for Margo.',
      },
      focus('d8'),
      {
        id: 'd8-sam', title: '1:1 · Margo & Sam: "Restructuring"', overrun: -15, bumpPenalty: {}, attendees: ['margo'], start: null, duration: 30,
        reward: { standing: 3 }, missPenalty: { standing: -4 }, declinePenalty: { standing: -4 },
        note: 'Sam from Marketing. That calendar title is… a lot.',
      },
      mlunch('d8'),
      tlunch('d8'),
    ],
    script: [
      { at: t('9:20'), type: 'msg', msg: { app: 'huddle', from: 'Dana Reyes', body: 'Hello. I take an iced americano, double shot, no milk, no sugar. I will not say it twice. Agendas for everything, please.' } },
      { at: t('9:20'), type: 'reveal', flag: 'drink-dana' },
      { at: t('9:25'), type: 'msg', msg: { app: 'huddle', from: 'Kendall (backup EA)', body: "hiii!! 👋 Bev said to help with calendars so I'll just jump in wherever!! think of me as your backup 😊" } },
      { at: t('9:30'), type: 'msg', msg: { app: 'mail', from: 'Gerald Pemberton', subject: 'Board meeting: Monday 11am', body: 'Board meeting confirmed for Monday, 11am. Agenda item one: "Leadership".\n\nPlease ensure Margo attends. — G' } },
      {
        at: t('10:05'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Sam', body: "hey!! 👋 saw something on Margo's calendar with my name and the word \"restructuring\" 😬 should I be worried lol",
          expiresIn: 45, timeoutEffects: { morale: -4 }, timeoutLog: 'Left Sam on read. Sam assumes the worst.',
          choices: [
            { label: 'Tell Sam the truth (it looks bad)', effects: { morale: 6, standing: -10 }, log: 'Sam knows. So does Margo, somehow.', flag: 'told-sam' },
            { label: '"I genuinely don\'t know!" (you do)', effects: { stress: 8, morale: -2 } },
            { label: '"Probably nothing! 🙂"', effects: { stress: 4 }, flag: 'lied-to-sam' },
          ],
        },
      },
      {
        at: t('14:10'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: "why does gerald want to talk about \"leadership\" on monday. am I the leadership. I'm the leadership 😰",
          expiresIn: 45, timeoutEffects: { standing: -3 }, timeoutLog: 'Margo spiralled alone.',
          choices: [
            { label: '"You\'ll be fine!"', effects: { standing: 1, stress: 2 } },
            {
              label: '"Let\'s get you prepped"', effects: { standing: 3 },
              then: [{
                at: 0, after: 1, type: 'request',
                event: { id: 'd8-prep', title: 'Board prep · Margo', attendees: ['margo'], start: null, duration: 45, deadline: t('17:00'), reward: { standing: 4 }, missPenalty: { standing: -4 }, declinePenalty: { standing: -3 }, flagOnDone: 'board-prepped', note: 'You offered. Now find 45 minutes.' },
              }],
            },
          ],
        },
      },
    ],
  },

  // ───────────────────────────── DAY 9 · THURSDAY ─────────────────────────────
  {
    title: 'Fire Drill',
    weekday: 'Thu',
    adhoc: 4,
    apps: [],
    subtitle: 'Kestrel is doing due diligence. The servers are doing their own thing.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Kestrel diligence today',
      body: "Kestrel are doing due diligence today — they need Margo AND Theo on a call before lunch. Theo knows. Theo has \"concerns\".",
    },
    execs: ALL,
    rules: WEEK2_RULES,
    events: [
      teamStandup('d9', ['team', 'margo', 'theo', 'dana', 'me']),
      myLunch('d9'),
      {
        id: 'd9-mum', title: 'Call Mum (results) 📞', attendees: ['me'], start: null, duration: 15, kind: 'personal', window: [t('12:00'), t('14:00')],
        reward: { stress: -6 }, missPenalty: { stress: 10 }, declinePenalty: { stress: 10 }, flagOnDone: 'called-mum', note: 'She said call Thursday. It is Thursday.',
      },
      { id: 'd9-ops', proposed: t('15:30'), title: 'Ops review · Dana', attendees: ['dana', 'margo'], start: null, duration: 30, window: [t('14:00'), t('17:00')], reward: { standing: 2 }, missPenalty: { standing: -4 }, declinePenalty: { standing: -4 } },
      focus('d9'),
      {
        id: 'd9-diligence', proposed: t('11:00'), title: 'Kestrel due diligence 🔍', noBump: true, attendees: ['margo', 'theo', 'me'], start: null, duration: 60, window: [t('10:00'), t('12:30')], prep: 15,
        reward: { standing: 6, runway: 3000 }, missPenalty: { standing: -12, runway: -2000 }, declinePenalty: { standing: -15 },
        note: 'Both of them. Before 12:30. 15 min prep.',
      },
      mlunch('d9'),
      tlunch('d9', '12:15'),
    ],
    script: [
      {
        at: t('10:22'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: 'servers are on fire and kestrel wants theo on diligence. do I drag him out of the war room?', advice: { gut: 0 }, expiresIn: 30, timeoutEffects: {}, timeoutLog: 'Margo dragged Theo out anyway.',
          choices: [
            { label: 'Drag him in', effects: { morale: -6, standing: 3 } },
            { label: 'Let him fix the servers', effects: { standing: -2, morale: 4 } },
          ],
        },
      },
      { at: t('14:20'), type: 'msg', when: { if: ['called-mum'] }, msg: { app: 'messages', from: 'Mum', body: 'ALL CLEAR!! told you it was nothing 😘 thank you for calling love x' } },
      { at: t('14:20'), type: 'effects', when: { unless: ['called-mum'] }, effects: { stress: 6 }, log: "You didn't call Mum.", msg: { app: 'messages', from: 'Mum', body: "results were fine. you didn't call. that's ok. I know you're busy x" } },
      {
        at: t('10:20'), type: 'insert',
        event: { id: 'd9-incident', title: '🔥 INCIDENT: servers down', attendees: ['theo'], start: t('10:30'), duration: 60, fixed: true, force: true, kind: 'personal', note: 'Every plant in the country has gone silent.' },
        msg: { app: 'huddle', from: 'Theo', body: "servers are down. I'm in the war room til 11:30. if anything is booked with me, it isn't anymore 🔥" },
      },
      {
        at: t('14:50'), type: 'msg', when: { if: ['theo-talk'] },
        msg: {
          app: 'huddle', from: 'Theo', body: "leafly interview is at 3. I'm going. if margo asks… can you cover?", expiresIn: 30, timeoutEffects: { morale: -3 }, timeoutLog: 'Theo went anyway.',
          choices: [
            { label: '"Dentist. Got it." 🦷', effects: { morale: 4, stress: 4 }, flag: 'covered-leafly' },
            { label: '"I can\'t lie to her, Theo"', effects: { morale: -4 } },
          ],
        },
      },
      {
        at: t('15:30'), type: 'msg', when: { meter: { m: 'morale', max: 40 } },
        msg: {
          app: 'huddle', from: 'Wren', body: "real talk. I'm thinking about quitting. the vibes are bad. you'd tell me if they were going to get better right?", expiresIn: 40, timeoutEffects: { morale: -5 }, timeoutLog: 'Wren updated their LinkedIn.',
          choices: [
            { label: '"Hang in there. Kestrel will come through."', effects: { morale: 4, stress: 3 } },
            { label: '"Honestly? Do what\'s right for you."', effects: { morale: -3, stress: -2 }, flag: 'wren-quits' },
          ],
        },
      },
    ],
  },

  // ───────────────────────────── DAY 10 ─────────────────────────────
  {
    title: 'The Squeeze',
    weekday: 'Fri',
    adhoc: 2,
    apps: [],
    subtitle: 'There are no right answers. Only less-wrong ones.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Big day!! (no pressure)',
      body:
        "Kestrel's partners are visiting today. If it goes well, Sproutly survives the quarter. If not… let's stay positive! 🌸\n\nAlso, Finance lowered the company card limit. Please spend wisely.\n\nAlso it's Jules' birthday, right? You booked something? You definitely booked something.",
    },
    execs: ALL,
    rules: WEEK2_RULES,
    events: [
      myLunch('d10'),
      { id: 'd10-wins', title: 'Friday Wins 🎉', attendees: ['team', 'theo', 'dana', 'me'], start: t('16:30'), duration: 30, fixed: true, reward: { morale: 4 } },
      { id: 'd10-standup', title: 'Standup', attendees: ['team', 'margo', 'theo', 'dana', 'me'], start: t('9:00'), duration: 15, fixed: true, reward: { morale: 1 } },
      { id: 'd10-focus', title: 'Focus time 🔒', attendees: ['theo'], start: t('13:00'), duration: 240, fixed: true, kind: 'focus' },
      { id: 'd10-board', title: 'Board call', attendees: ['margo', 'theo'], start: t('17:00'), duration: 60, fixed: true, force: true, reward: { standing: 3 } },
      {
        id: 'd10-kestrel', proposed: t('11:00'), title: 'Kestrel partner meeting 💰', noBump: true, catering: 'wanted', attendees: ['margo', 'theo'], start: null, duration: 60, prep: 30, coffee: true, overrun: 15,
        window: [t('10:00'), t('11:30')], strikeOnMiss: true, flagOnDone: 'kestrel-met',
        reward: { runway: 12000, standing: 10 }, missPenalty: { runway: -8000, standing: -20 }, declinePenalty: { standing: -25 },
        note: 'Start by 11:30 (they fly out). 30 min prep. Margo needs coffee. Partners expect lunch-quality catering. Miss it = strike.',
      },
      {
        id: 'd10-arch', proposed: t('10:00'), title: 'Architecture review', minOk: 45, bumpPenalty: { morale: -3 }, catering: 'nice', attendees: ['theo'], start: null, duration: 60,
        reward: { morale: 4 }, missPenalty: { morale: -5 }, declinePenalty: { morale: -4 },
      },
      {
        id: 'd10-dinnerprep', proposed: t('15:00'), title: 'Investor dinner prep', minOk: 15, noBump: true, travel: 15, place: 'the restaurant', remoteOk: 'fine', attendees: ['margo'], start: null, duration: 30, window: [t('14:00'), t('16:30')],
        reward: { standing: 3 }, missPenalty: { standing: -5 }, declinePenalty: { standing: -4 },
      },
      {
        id: 'd10-soil', proposed: t('12:30'), title: 'Supplier call · SoilSense', remote: true, remoteOk: 'fine', travel: 15, place: 'SoilSense warehouse', bumpPenalty: { morale: -2 }, attendees: ['theo'], start: null, duration: 30, window: [t('12:00'), t('13:00')],
        reward: { morale: 3 }, missPenalty: { morale: -4 }, declinePenalty: { morale: -3 },
        note: 'Video call. Probably.',
      },
      {
        id: 'd10-shoot', proposed: t('16:00'), title: 'Photo shoot · Bloom Magazine 📸', noBump: true, travel: 20, place: 'Bloom studio, Shoreditch', attendees: ['margo'], start: null, duration: 30, window: [t('15:30'), t('16:30')],
        reward: { standing: 4 }, missPenalty: { standing: -5 }, declinePenalty: { standing: -5 },
        note: '"30 Under 30-ish". Margo has been practising her thoughtful-lean pose.',
      },
      {
        id: 'd10-mlunch', proposed: t('12:00'), title: "Margo's lunch 🥗", minOk: 30, attendees: ['margo'], start: null, duration: 45, kind: 'personal', window: [t('12:00'), t('14:00')],
        reward: { morale: 2 }, missPenalty: { morale: -6, standing: -3 }, declinePenalty: { morale: -6 },
      },
      {
        id: 'd10-tlunch', proposed: t('12:00'), title: "Theo's lunch 🍜", minOk: 15, attendees: ['theo'], start: null, duration: 30, kind: 'personal', window: [t('11:30'), t('12:30')],
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
          id: 'd10-sync', title: 'Quick sync (Margo booked it)', bumpPenalty: { standing: -4 }, attendees: ['margo', 'theo'], start: t('14:00'), duration: 30,
          reward: { standing: 2 }, missPenalty: { standing: -6 }, declinePenalty: { standing: -6 },
          note: "Margo put this right in Theo's focus block. She said don't move it.",
        },
        msg: { app: 'huddle', from: 'Margo', body: "put a quick sync w/ theo at 2 ✌️ don't move it" },
      },
      {
        at: t('13:50'), type: 'change', id: 'd10-dinnerprep', place: 'The Linden Hotel', travel: 25,
        msg: { app: 'huddle', from: 'Margo', body: "dinner prep is at kestrel's HOTEL now (the linden). they want to \"see us in our element\" 🙃 it's further btw" },
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
        at: t('15:05'), type: 'change', id: 'd10-shoot', remote: true,
        msg: { app: 'huddle', from: 'Margo', body: "photographer's van broke down 😩 they're doing the shoot over VIDEO?? is that a thing?? anyway no need to go to shoreditch" },
      },
      {
        at: t('15:00'), type: 'task',
        task: { id: 'd10-jules', kind: 'gift', personal: true, text: "Get Jules a birthday gift (it's TODAY)", recipient: 'Jules', budget: 60, deadline: t('17:50'), reward: { stress: -10 }, fail: { stress: 15 } },
        msg: { app: 'messages', from: 'Jules ❤️', body: "tonight!! 7pm, Lucca's. it's my birthday and you PROMISED 🥺🎂" },
      },
      {
        at: t('16:00'), type: 'move', id: 'd10-board', start: t('17:30'), duration: 30,
        msg: {
          app: 'mail', from: 'Margo', subject: 'board call moved → 5:30 (will run to 7)', body: "Board moved the call to 5:30. It'll run to 7. Need you on it for notes. You're the best 🙏",
          expiresIn: 60, timeoutEffects: { standing: -6 }, timeoutLog: "Didn't answer Margo about the board call.",
          choices: [
            { label: 'Stay late. Text Jules sorry.', effects: { standing: 8, stress: 20 }, log: "Stayed for the board call. Missed Jules' birthday dinner.", flag: 'missed-birthday' },
            { label: 'Leave at 6. Send a notes template.', effects: { standing: -10, stress: -5 }, log: 'Went to the birthday dinner. Margo noticed.', flag: 'went-birthday' },
            { label: 'Ask Wren to cover notes', effects: { morale: -6, standing: -3 }, log: 'Wren covered. Wren will remember this.', flag: 'went-birthday' },
          ],
        },
      },
      {
        at: t('11:20'), type: 'change', id: 'd10-soil', mustBeInPerson: true,
        msg: { app: 'huddle', from: 'Theo', body: 'SoilSense wants me there in person. "the samples don\'t translate over zoom". It\'s dirt. It\'s literally dirt.' },
      },
      {
        at: t('11:50'), type: 'task',
        task: { id: 'd10-table', kind: 'reservation', text: "Book Kestrel's dinner: 4 people, 7–8pm", party: 4, window: [t('19:00'), t('20:00')], deadline: t('16:30'), reward: { standing: 4 }, fail: { standing: -8 } },
        msg: { app: 'mail', from: 'Margo', subject: 'dinner w/ kestrel tonight!!', body: "They said YES to dinner 🎉 Table for 4, somewhere between 7 and 8. Somewhere that says \"we have runway\". Use Tably." },
      },
      {
        at: t('15:20'), type: 'task',
        task: { id: 'd10-lucca', kind: 'reservation', personal: true, text: "Book Lucca's for Jules' birthday (2 people, 7pm)", party: 2, place: 'lucca', window: [t('19:00'), t('19:00')], deadline: t('17:30'), reward: { stress: -8 }, fail: { stress: 12 } },
        msg: { app: 'messages', from: 'Jules ❤️', body: "wait. you DID book Lucca's right?? 7pm?? 🥺" },
      },
      { at: t('17:40'), type: 'msg', msg: { app: 'huddle', from: 'Gerald', body: 'Margo — is the new EA working out? Asking for the board. — G\n\n(Sorry, wrong channel.)' } },
    ],
    reckonings: [
      { flag: 'lied', text: "Kestrel saw Margo's smoothie selfie on LinkedIn. They know about the \"traffic\".", effects: { standing: -6, runway: -2000 } },
      { flag: 'embezzle', text: 'Finance found a birthday gift on the company card.', effects: { standing: -10 }, strike: true },
    ],
  },

  // ───────────────────────────── DAY 11 · SATURDAY ─────────────────────────────
  {
    title: 'The Morning After',
    weekday: 'Sat',
    weekend: true,
    adhoc: 2,
    apps: [],
    subtitle: 'Yesterday happened. Everyone has feelings about it.',
    memo: weekendMemo('Saturday, again', "Everyone is processing Friday. Your phone is processing everyone."),
    execs: ['margo', 'theo', 'dana', 'me'],
    rules: [],
    events: [],
    script: [
      {
        at: t('13:00'), type: 'msg',
        msg: {
          app: 'messages', from: 'Jules ❤️', body: 'they OFFERED US THE FLAT 😱 deposit due monday 12:30. can we afford it on a probation salary?? be honest', expiresIn: 120, timeoutEffects: { stress: 6 }, timeoutLog: 'Jules signed nothing. Jules is upset.',
          choices: [
            { label: "Sign it. We'll make it work.", effects: { stress: 6 }, flag: 'signed-flat' },
            { label: 'Wait until after my review', effects: { stress: -2 }, flag: 'flat-wait', log: "Jules said \"ok\". It was not ok." },
          ],
        },
      },
      {
        at: t('15:00'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: 'should I call gerald before monday? get ahead of it?', advice: { gut: 0 }, expiresIn: 90, timeoutEffects: {}, timeoutLog: 'Margo called Gerald. It was a long call.',
          choices: [
            { label: 'Call him', effects: { standing: 2 }, flag: 'margo-called-gerald' },
            { label: 'Let the board come to you', effects: { stress: -2 } },
          ],
        },
      },
      { at: t('10:00'), type: 'msg', when: { if: ['kestrel-met'] }, msg: { app: 'mail', from: 'Tobias (Kestrel)', subject: 'Yesterday', body: "The partners loved it. A term sheet is drafted…\n\n…pending the outcome of your board meeting on Monday. 🤞" } },
      { at: t('10:00'), type: 'msg', when: { unless: ['kestrel-met'] }, msg: { app: 'mail', from: 'Tobias (Kestrel)', subject: 'Yesterday', body: "The partners are \"reconsidering\". Monday's board meeting will be decisive. I'm still rooting for you." } },
      {
        at: t('11:30'), type: 'msg', when: { if: ['missed-birthday'] },
        msg: {
          app: 'messages', from: 'Jules ❤️', body: 'so. last night.', expiresIn: 90, timeoutEffects: { stress: 8 }, timeoutLog: 'Jules stopped waiting for a reply.',
          choices: [
            { label: 'Grovel. Properly. In person.', effects: { stress: -4 }, flag: 'apologized' },
            { label: '"Work was insane"', effects: { stress: 6 } },
          ],
        },
      },
      { at: t('11:30'), type: 'effects', when: { if: ['went-birthday'] }, effects: { stress: -10 }, log: 'Jules is still glowing about the birthday.', msg: { app: 'messages', from: 'Jules ❤️', body: 'last night was perfect ❤️ (also you smelled like a board call. cute.)' } },
      {
        at: t('16:30'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: "can't sleep. it's 4:30pm. what if the board fires me. lol. jk. unless", expiresIn: 60, timeoutEffects: { standing: -2 }, timeoutLog: 'Margo stared at the ceiling alone.',
          choices: [
            { label: '"You\'ll be fine."', effects: { standing: 1 } },
            { label: '"Want me to draft a board doc?"', effects: { standing: 4, stress: 6 }, flag: 'board-doc' },
          ],
        },
      },
    ],
  },

  // ───────────────────────────── DAY 12 · SUNDAY ─────────────────────────────
  {
    title: 'Quiet Before',
    weekday: 'Sun',
    weekend: true,
    adhoc: 2,
    apps: [],
    subtitle: 'Gerald calls. This one matters.',
    memo: weekendMemo('Sunday', "Board meeting tomorrow. Try to rest. (You won't.)"),
    execs: ['margo', 'theo', 'dana', 'me'],
    rules: [],
    events: [],
    script: [
      {
        at: t('11:00'), type: 'call',
        call: {
          from: 'Gerald Pemberton',
          lines: ['"The board votes tomorrow on whether Margo stays as CEO."', '"You\'ve seen her closer than anyone."', '"What do I tell them?"'],
          choices: [
            { label: '"Back her. She IS Sproutly."', effects: { stress: 3 }, flag: 'backed-margo' },
            { label: '"Brilliant, but she needs a COO."', effects: { stress: -2 }, flag: 'honest-gerald' },
            { label: '"Theo should run it."', effects: { stress: 4 }, flag: 'theo-ceo' },
          ],
          missed: { stress: 4 },
          missedLog: 'Missed Gerald. The board will decide without you.',
        },
      },
      {
        at: t('14:00'), type: 'msg', when: { if: ['theo-talk'] },
        msg: {
          app: 'huddle', from: 'Theo', body: 'Leafly made an offer. More money. Fewer kombuchas. Should I take it?', expiresIn: 90, timeoutEffects: { morale: -3 }, timeoutLog: 'Theo decided alone.',
          choices: [
            { label: '"Stay. We need you."', effects: { morale: 6 }, flag: 'theo-stays' },
            { label: '"Take it. You deserve it."', effects: { morale: -4, stress: -3 }, flag: 'theo-leaves' },
          ],
        },
      },
      { at: t('14:00'), type: 'effects', when: { if: ['leafly-told'] }, effects: { runway: -2000 }, log: "Margo gave Theo a raise to stay.", msg: { app: 'huddle', from: 'Margo', body: "theo's staying. I gave him a raise. with what money, you ask? great question 🙃" } },
      { at: t('14:01'), type: 'reveal', flag: 'theo-stays', when: { if: ['leafly-told'] } },
      { at: t('17:00'), type: 'reveal', flag: 'theo-leaves', when: { unless: ['theo-talk', 'leafly-told'] } },
    ],
  },

  // ───────────────────────────── DAY 13 · MONDAY ─────────────────────────────
  {
    title: 'Board Day',
    weekday: 'Mon',
    adhoc: 5,
    apps: [],
    subtitle: 'The board meets at 11. Everything else still has to happen.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Board day 😬',
      body: "Board meeting at 11. Margo needs 30 minutes of quiet before it.\n\nAnd tomorrow is your review! No pressure. All of the pressure.",
    },
    execs: ALL,
    rules: WEEK2_RULES,
    events: [
      teamStandup('d13', ['team', 'margo', 'theo', 'dana', 'me']),
      myLunch('d13'),
      focus('d13'),
      { id: 'd13-board', title: 'Board meeting 📊', attendees: ['margo', 'theo', 'dana', 'me'], start: t('11:00'), duration: 60, fixed: true, force: true, prep: 30, reward: { standing: 3 } },
      mlunch('d13', '12:30'),
      tlunch('d13', '12:15'),
    ],
    script: [
      {
        at: t('9:05'), type: 'request', when: { if: ['signed-flat'] },
        event: { id: 'd13-lease', title: 'Sign the lease 🖊️', attendees: ['me'], start: null, duration: 30, travel: 15, place: "letting agent's office", kind: 'personal', window: [t('12:30'), t('12:30')], reward: { stress: -8 }, missPenalty: { stress: 12 }, declinePenalty: { stress: 12 }, flagOnDone: 'got-flat', note: '12:30. In person. With ID. On board day.' },
        msg: { app: 'messages', from: 'Jules ❤️', body: "lease signing is 12:30 today!! in person. bring ID. this is happening 🏠✨" },
      },
      {
        at: t('9:30'), type: 'msg',
        msg: {
          app: 'huddle', from: 'Margo', body: 'board in 90 mins. power suit or hoodie', advice: { gut: 1 }, expiresIn: 30, timeoutEffects: {}, timeoutLog: 'Margo wore the hoodie.',
          choices: [{ label: 'Power suit', effects: { standing: 2 } }, { label: 'Hoodie', effects: { standing: -2 } }],
        },
      },
      { at: t('12:06'), type: 'msg', when: { if: ['backed-margo'] }, msg: { app: 'mail', from: 'Dana Reyes', subject: 'Transition', body: "The board has decided my services are no longer required. Tomorrow is my last day… actually, today is. Agendas are in the shared drive. Nobody will read them." } },
      { at: t('17:58'), type: 'reveal', flag: 'gone-dana', when: { if: ['backed-margo'] } },
      { at: t('12:06'), type: 'msg', when: { if: ['honest-gerald'] }, msg: { app: 'huddle', from: 'Dana Reyes', body: "I've been made permanent COO. Margo and I have agreed to \"respect each other's process\". Please book us separate rooms." } },
      {
        at: t('9:10'), type: 'effects', when: { if: ['theo-leaves'] }, effects: { morale: -10 }, log: 'Theo resigned. Leafly wanted him Monday.',
        msg: { app: 'huddle', from: 'Theo', body: "today's my last day. leafly wanted me monday. sorry. you were the best part of this calendar." },
      },
      {
        at: t('9:15'), type: 'insert', when: { if: ['theo-leaves'] },
        event: { id: 'd13-exit', title: 'Exit interview · Theo', attendees: ['theo'], start: t('17:15'), duration: 30, fixed: true, force: true, kind: 'personal', note: 'Last one.' },
      },
      { at: t('12:05'), type: 'effects', when: { if: ['backed-margo'] }, effects: { standing: 6 }, log: 'The board kept Margo.', msg: { app: 'messages', from: 'Gerald Pemberton', body: "The board voted. Margo stays. She doesn't know you spoke up for her. Perhaps that's best. — G" } },
      { at: t('12:05'), type: 'effects', when: { if: ['honest-gerald'] }, effects: { standing: 2, morale: 4 }, log: 'Margo stays, with a COO.', msg: { app: 'messages', from: 'Gerald Pemberton', body: 'Margo stays, with a COO hire. She was furious. Then relieved. Then furious again. Good work. — G' } },
      { at: t('12:05'), type: 'effects', when: { if: ['theo-ceo'], unless: ['theo-leaves'] }, effects: { morale: 6, standing: -6 }, log: 'Theo is interim CEO.', msg: { app: 'messages', from: 'Gerald Pemberton', body: 'Theo is interim CEO. Margo is now "Chief Visionary Officer". She is taking it well. (She is not.) — G' } },
      { at: t('12:06'), type: 'reveal', flag: 'margo-ousted', when: { if: ['theo-ceo'], unless: ['theo-leaves'] } },
      { at: t('12:05'), type: 'effects', when: { if: ['theo-ceo', 'theo-leaves'] }, effects: { standing: -3 }, log: 'You suggested Theo. Theo just quit.', msg: { app: 'messages', from: 'Gerald Pemberton', body: 'You suggested Theo. Theo resigned this morning. The board is… confused. Margo stays by default. — G' } },
      { at: t('12:05'), type: 'effects', when: { unless: ['backed-margo', 'honest-gerald', 'theo-ceo'] }, effects: { standing: -2 }, log: 'The board decided without you.', msg: { app: 'messages', from: 'Gerald Pemberton', body: 'Margo stays. It would have been nice to hear from you. — G' } },
      {
        at: t('14:10'), type: 'request',
        event: {
          id: 'd13-numbers', title: 'Q3 numbers for Kestrel · Margo & Dev', attendees: ['margo'], start: null, duration: 30, deadline: t('16:30'), bumpPenalty: { standing: -6 },
          reward: { standing: 4, runway: 2000 }, missPenalty: { standing: -8 }, declinePenalty: { standing: -8 }, flagOnDone: 'numbers-sent', note: 'Kestrel wants numbers by end of day.',
        },
        msg: { app: 'mail', from: 'Tobias (Kestrel)', subject: 'One last thing', body: 'We need your Q3 numbers today to finalise. 30 mins with Margo and Dev should do it. Before 4:30? 🙏' },
      },
    ],
  },

  // ───────────────────────────── DAY 14 · TUESDAY ─────────────────────────────
  {
    title: 'Review Day',
    weekday: 'Tue',
    adhoc: 3,
    apps: [],
    subtitle: 'Kestrel decides. Then Margo decides about you.',
    memo: {
      from: 'Bev (People Ops)',
      subject: 'Your review: 5pm',
      body: "Big day! Kestrel gives their answer today, and your probation review is at 5pm with Margo and me.\n\nJust be yourself. (Unless yourself is late.) 💐",
    },
    execs: ALL,
    rules: WEEK2_RULES,
    events: [
      teamStandup('d14', ['team', 'margo', 'theo', 'dana', 'me']),
      myLunch('d14'),
      focus('d14'),
      { id: 'd14-review', title: 'Your probation review 😬', attendees: ['margo', 'me'], start: t('17:00'), duration: 30, fixed: true, force: true, reward: { standing: 2 }, note: 'Bev will be there. Bev has a folder.' },
      mlunch('d14'),
      tlunch('d14'),
    ],
    script: [
      { at: t('11:00'), type: 'effects', when: { if: ['kendall-reported', 'kendall-sabotaged'] }, effects: { standing: 5 }, log: 'Kendall was moved to "special projects".', msg: { app: 'mail', from: 'Bev (People Ops)', subject: 'Re: Kendall', body: 'We looked into it. Kendall has been moved to "special projects" (a desk near the printer). Thank you for flagging. 💐' } },
      { at: t('11:00'), type: 'effects', when: { if: ['kendall-reported'], unless: ['kendall-sabotaged'] }, effects: { standing: -3 }, log: 'You reported Kendall. Kendall was innocent.', msg: { app: 'mail', from: 'Bev (People Ops)', subject: 'Re: Kendall', body: "We looked into it. Kendall's edits were… all helpful? Let's talk about trust at your review. 💐" } },
      { at: t('13:30'), type: 'reveal', flag: 'funded', when: { if: ['kestrel-met'], meter: { m: 'standing', min: 50 } } },
      { at: t('13:31'), type: 'effects', when: { if: ['funded'] }, effects: { runway: 60000, morale: 10 }, log: 'Kestrel signed the term sheet!', msg: { app: 'mail', from: 'Tobias (Kestrel)', subject: "We're in 🎉", body: "Term sheet signed. Welcome to the Kestrel family.\n\n(Tell Margo to stop sending kombucha.)" } },
      { at: t('13:32'), type: 'effects', when: { unless: ['funded'] }, effects: { morale: -8 }, log: 'Kestrel passed.', msg: { app: 'mail', from: 'Tobias (Kestrel)', subject: 'Our decision', body: "We're going to pass, for now. I'm genuinely rooting for you all. Keep the plants talking." } },
      { at: t('14:30'), type: 'msg', when: { if: ['funded'] }, msg: { app: 'huddle', from: 'Sam', body: 'wait. NO LAYOFFS?? 😭🌱 I take back everything I said about the calendar' } },
      { at: t('14:30'), type: 'msg', when: { unless: ['funded'] }, msg: { app: 'huddle', from: 'Margo', body: "we have to cut three roles. sam's is one. can you… book the meetings. I'm sorry." } },
    ],
    reckonings: [
      { flag: 'kendall-sabotaged', unless: 'kendall-reported', text: "Bev's folder has a list of \"your\" calendar mistakes. Kendall wrote it.", effects: { standing: -6 } },
    ],
  },
];

// ───────────────────────────── endless mode ─────────────────────────────
const WEEK = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
const endlessCache = new Map<number, DayDef>();

/** Story days first, then generated days forever (pure ad-hoc, slowly getting busier). */
export function dayAt(i: number): DayDef {
  if (i < DAYS.length) return DAYS[i];
  const hit = endlessCache.get(i);
  if (hit) return hit;
  const weekday = WEEK[i % 7];
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const n = i - DAYS.length + 1;
  const tag = `e${i}`;
  const d: DayDef = weekend
    ? {
        title: `Endless · Day ${i + 1}`, weekday, weekend: true, adhoc: 3, apps: [],
        subtitle: 'A weekend. In theory.',
        memo: weekendMemo(weekday === 'Sat' ? "It's Saturday" : "It's Sunday", 'Rest lowers stress. Work pings raise standing. You know the drill.'),
        execs: ['margo', 'theo', 'dana', 'me'], rules: [], events: [], script: [],
      }
    : {
        title: `Endless · Day ${i + 1}`, weekday, adhoc: Math.min(5 + Math.floor(n / 2), 12), apps: [],
        subtitle: n === 1 ? 'You passed probation. The calendar did not notice.' : 'The calendar never ends. Neither do you.',
        memo: { from: 'Bev (People Ops)', subject: `${weekday}: another one`, body: n === 1 ? "Welcome to endless mode! It's just like probation, except it never stops and it gets busier every couple of days. 💐" : 'Another day, another calendar. How long can you last?' },
        execs: ALL, rules: WEEK2_RULES, events: [teamStandup(tag, ALL), focus(tag), mlunch(tag), tlunch(tag), myLunch(tag)], script: [],
      };
  endlessCache.set(i, d);
  return d;
}
