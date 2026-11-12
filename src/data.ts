import type { Drink, Exec, ExecId, Product, Restaurant, Rule } from './types';

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
export const PAYROLL = 2500; // weekdays only

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

export const RIDE_COST = 18; // each way

export const RESTAURANTS: Restaurant[] = [
  { id: 'ember', name: 'Ember', emoji: '🔥', blurb: 'Steak, candles, a sommelier who judges you.', full: [t('19:00')], vibe: { standing: 3, runway: -400 }, vibeLog: 'Ember screamed "we have runway". The deposit did not help the runway.', deposit: 400 },
  { id: 'fern', name: 'The Fern', emoji: '🌿', blurb: 'Seasonal, calm, very on-brand for a plant company.', full: [t('19:30')] },
  { id: 'sakura', name: 'Sakura Bar', emoji: '🍣', blurb: 'Great sushi. Karaoke starts at 8. Loudly.', full: [], vibe: { standing: -3 }, vibeLog: 'Karaoke started mid-pitch at Sakura Bar.' },
  { id: 'lucca', name: "Lucca's", emoji: '🍝', blurb: 'Tiny, romantic, impossible to get into.', full: [t('18:30'), t('20:00')] },
];
export const TABLE_TIMES = [t('18:30'), t('19:00'), t('19:30'), t('20:00'), t('20:30')];

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
