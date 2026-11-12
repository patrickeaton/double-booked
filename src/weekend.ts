// Weekend plans: your own life, booked on your own calendar. They're how stress actually comes down.
import { mulberry32 } from './adhoc';
import { t } from './data';
import type { EventDef } from './types';

interface Plan {
  key: string;
  title: string;
  duration: number;
  relief: number;
  with?: 'jules' | 'mum' | 'ollie';
  window?: [string, string];
  place?: string;
  travel?: number;
  note: string;
}

const PLANS: Plan[] = [
  { key: 'brunch', title: 'Brunch w/ Jules 🥞', duration: 90, relief: 14, with: 'jules', window: ['10:00', '12:30'], place: 'Bluebell Café', travel: 15, note: 'Bottomless coffee. Phone face down. Ideally.' },
  { key: 'run', title: 'Run in the park 🏃', duration: 45, relief: 10, window: ['9:00', '11:00'], note: 'The only meeting with no agenda.' },
  { key: 'nap', title: 'A long nap 😴', duration: 60, relief: 9, window: ['13:00', '16:30'], note: 'Do not disturb. Seriously.' },
  { key: 'mum', title: 'Call Mum 📞', duration: 30, relief: 6, with: 'mum', note: 'She has news about the neighbours. All of it.' },
  { key: 'football', title: 'Five-a-side w/ Ollie ⚽', duration: 90, relief: 12, with: 'ollie', window: ['10:00', '15:00'], place: 'Rec ground', travel: 15, note: 'Ollie needs a keeper. You are the keeper.' },
  { key: 'market', title: 'Farmers market 🧺', duration: 60, relief: 7, with: 'jules', window: ['9:30', '13:00'], place: 'Old Town Square', travel: 10, note: 'Jules wants the good sourdough before it sells out.' },
  { key: 'movie', title: 'Movie w/ Ollie 🎬', duration: 120, relief: 12, with: 'ollie', window: ['14:00', '16:00'], place: 'The Rex', travel: 15, note: 'Phones off for two whole hours. Terrifying.' },
  { key: 'bath', title: 'Bath + a book 🛁', duration: 60, relief: 9, note: 'A real book. Made of paper.' },
  { key: 'spa', title: 'Spa afternoon 🧖', duration: 120, relief: 18, window: ['12:00', '15:30'], place: 'Willow Spa', travel: 20, note: 'Expensive. Worth it.' },
  { key: 'pottery', title: 'Pottery class w/ Jules 🏺', duration: 120, relief: 14, with: 'jules', window: ['13:00', '15:00'], place: 'Clay Studio', travel: 15, note: 'You will make a bowl. It will be bad. That is the point.' },
  { key: 'cook', title: 'Cook something slow 🍲', duration: 90, relief: 10, window: ['14:00', '16:30'], note: 'A recipe that takes hours and asks nothing of you.' },
  { key: 'walk', title: 'Walk w/ Mum 🌳', duration: 60, relief: 8, with: 'mum', window: ['10:00', '15:00'], place: 'Riverside', travel: 15, note: "Mum's choice of route. It's always the long one." },
];

/** A handful of things you could do today. None of them are required. All of them are good for you. */
export function weekendPlans(dayIndex: number, seed: number): EventDef[] {
  const r = mulberry32(seed + dayIndex * 4241);
  const pool = [...PLANS];
  const out: EventDef[] = [];
  for (let n = 0; n < 5 && pool.length; n++) {
    const p = pool.splice(Math.floor(r() * pool.length), 1)[0];
    out.push({
      id: `w${dayIndex}-${p.key}`, title: p.title, attendees: ['me'], start: null, duration: p.duration, kind: 'personal', optional: true,
      from: p.with, window: p.window ? [t(p.window[0]), t(p.window[1])] : undefined, place: p.place, travel: p.travel,
      reward: { stress: -p.relief }, missPenalty: { stress: p.with ? 6 : 3 }, declinePenalty: {},
      note: `${p.note} (−${p.relief} stress)`,
    });
  }
  return out;
}

const BREATHERS: Plan[] = [
  { key: 'walk', title: 'Walk round the block 🚶', duration: 15, relief: 4, window: ['10:30', '16:00'], note: 'Fresh air. No phone. Fifteen minutes. You can do this.' },
  { key: 'tea', title: 'Tea, phone face down 🫖', duration: 15, relief: 3, window: ['10:00', '16:30'], note: 'The kettle is the only thing that needs you.' },
  { key: 'stairs', title: 'Sit in the stairwell 🪜', duration: 15, relief: 3, window: ['11:00', '16:30'], note: 'The one place in the building with no Wi-Fi.' },
];

/** On workdays you can still steal a few minutes for yourself, if your own calendar has room. */
export function weekdayBreathers(dayIndex: number, seed: number): EventDef[] {
  const r = mulberry32(seed + dayIndex * 911);
  const pool = [...BREATHERS];
  return [0, 1].map(() => {
    const p = pool.splice(Math.floor(r() * pool.length), 1)[0];
    return {
      id: `b${dayIndex}-${p.key}`, title: p.title, attendees: ['me'], start: null, duration: p.duration, kind: 'personal', optional: true,
      window: [t(p.window![0]), t(p.window![1])], reward: { stress: -p.relief }, missPenalty: { stress: 2 }, declinePenalty: {},
      note: `${p.note} (−${p.relief} stress)`,
    } as EventDef;
  });
}
