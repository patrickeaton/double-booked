// Brew's drink builder: a drink is base + milk + temperature + shots + sweetener, stored as a spec string
// like "flatwhite|oat|extrahot|single|none". Execs have one exact order; close isn't the same as right.

export interface Opt { id: string; name: string; emoji?: string; price?: number }
export interface Base extends Opt { price: number; emoji: string; milk: 'always' | 'optional'; shots: boolean }

export const BASES: Base[] = [
  { id: 'latte', name: 'Latte', emoji: '🥛', price: 5, milk: 'always', shots: true },
  { id: 'flatwhite', name: 'Flat White', emoji: '☕', price: 5, milk: 'always', shots: true },
  { id: 'cappuccino', name: 'Cappuccino', emoji: '☁️', price: 5, milk: 'always', shots: true },
  { id: 'cortado', name: 'Cortado', emoji: '🤎', price: 4, milk: 'always', shots: true },
  { id: 'americano', name: 'Americano', emoji: '🫖', price: 4, milk: 'optional', shots: true },
  { id: 'drip', name: 'Drip Coffee', emoji: '⚫', price: 3, milk: 'optional', shots: false },
  { id: 'matcha', name: 'Matcha', emoji: '🍵', price: 6, milk: 'always', shots: false },
  { id: 'mocha', name: 'Mocha', emoji: '🍫', price: 6, milk: 'always', shots: true },
];
export const MILKS: Opt[] = [
  { id: 'none', name: 'No milk', emoji: '🚫' },
  { id: 'whole', name: 'Whole', emoji: '🐄' },
  { id: 'skim', name: 'Skim', emoji: '💧' },
  { id: 'oat', name: 'Oat', emoji: '🌾', price: 1 },
  { id: 'almond', name: 'Almond', emoji: '🌰', price: 1 },
  { id: 'soy', name: 'Soy', emoji: '🫘', price: 1 },
];
export const TEMPS: Opt[] = [
  { id: 'hot', name: 'Hot', emoji: '🔥' },
  { id: 'extrahot', name: 'Extra hot', emoji: '🌋' },
  { id: 'iced', name: 'Iced', emoji: '🧊' },
];
export const SHOTS: Opt[] = [
  { id: 'single', name: 'Single', emoji: '1️⃣' },
  { id: 'double', name: 'Double', emoji: '2️⃣', price: 1 },
  { id: 'triple', name: 'Triple', emoji: '3️⃣', price: 2 },
];
export const SWEETS: Opt[] = [
  { id: 'none', name: 'No sugar', emoji: '🚫' },
  { id: 'sugar', name: 'Sugar', emoji: '🧂' },
  { id: 'vanilla', name: 'Vanilla', emoji: '🌼', price: 1 },
  { id: 'caramel', name: 'Caramel', emoji: '🍯', price: 1 },
];

export interface DrinkSpec { base: string; milk: string; temp: string; shots: string; sweet: string }
export type Step = keyof DrinkSpec;

const LEGACY: Record<string, string> = { 'oat-flat-white': 'flatwhite|oat|extrahot|single|none', black: 'drip|none|hot|single|none' };

export function parseSpec(s: string): DrinkSpec {
  const [base, milk, temp, shots, sweet] = (LEGACY[s] ?? s).split('|');
  return {
    base: BASES.some((b) => b.id === base) ? base : 'latte',
    milk: milk ?? 'whole', temp: temp ?? 'hot', shots: shots ?? 'single', sweet: sweet ?? 'none',
  };
}
export const specString = (d: DrinkSpec) => [d.base, d.milk, d.temp, d.shots, d.sweet].join('|');
export const baseOf = (id: string) => BASES.find((b) => b.id === id) ?? BASES[0];
const opt = (xs: Opt[], id: string) => xs.find((x) => x.id === id);

/** Which steps this base actually asks about (no milk choice for a matcha with no milk, no shots for drip…). */
export function stepsFor(base: string): Step[] {
  const b = baseOf(base);
  return ['base', 'milk', 'temp', ...(b.shots ? (['shots'] as Step[]) : []), 'sweet'];
}
export function optionsFor(step: Step, base: string): Opt[] {
  if (step === 'base') return BASES;
  if (step === 'milk') return baseOf(base).milk === 'always' ? MILKS.filter((m) => m.id !== 'none') : MILKS;
  if (step === 'temp') return TEMPS;
  if (step === 'shots') return SHOTS;
  return SWEETS;
}
export const STEP_LABEL: Record<Step, string> = { base: 'Drink', milk: 'Milk', temp: 'Temp', shots: 'Shots', sweet: 'Sweet' };

export function drinkPrice(s: string) {
  const d = parseSpec(s);
  return baseOf(d.base).price + (opt(MILKS, d.milk)?.price ?? 0) + (opt(SHOTS, d.shots)?.price ?? 0) + (opt(SWEETS, d.sweet)?.price ?? 0);
}
export const drinkEmoji = (s: string) => baseOf(parseSpec(s).base).emoji;

export function drinkName(s: string) {
  const d = parseSpec(s);
  const b = baseOf(d.base);
  const bits: string[] = [];
  if (d.temp === 'extrahot') bits.push('Extra hot');
  if (d.temp === 'iced') bits.push('Iced');
  if (d.milk === 'none') bits.push('black');
  else if (d.milk !== 'whole' || b.milk === 'optional') bits.push(opt(MILKS, d.milk)!.name.toLowerCase());
  bits.push(b.name);
  let name = bits.join(' ');
  name = name[0].toUpperCase() + name.slice(1);
  const extra: string[] = [];
  if (b.shots && d.shots !== 'single') extra.push(`${d.shots} shot`);
  if (d.sweet !== 'none') extra.push(opt(SWEETS, d.sweet)!.name.toLowerCase());
  return extra.length ? `${name}, ${extra.join(', ')}` : name;
}

/** perfect = exactly their order; close = right drink and milk, wrong details; wrong = anything else. */
export function drinkMatch(got: string, wanted: string): 'perfect' | 'close' | 'wrong' {
  const a = parseSpec(got);
  const b = parseSpec(wanted);
  if (specString(a) === specString(b)) return 'perfect';
  if (a.base === b.base && a.milk === b.milk) return 'close';
  return 'wrong';
}
