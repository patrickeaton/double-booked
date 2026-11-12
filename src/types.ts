/** Calendars you manage: the bosses, plus your own and the company-wide one. */
export type ExecId = 'margo' | 'theo' | 'dana' | 'me' | 'team';
export type Meter = 'standing' | 'runway' | 'morale' | 'stress';
export type Effects = Partial<Record<Meter, number>>;
export type AppId = 'calendar' | 'mail' | 'huddle' | 'messages' | 'brew' | 'bundl' | 'card' | 'notes' | 'ryde' | 'tably' | 'presto' | 'pulse' | 'trellis';
export type InboxApp = 'mail' | 'huddle' | 'messages';

export interface Exec {
  id: ExecId;
  name: string;
  short: string;
  title: string;
  color: string;
  emoji: string;
  drink: string;
  quirks: string[];
}

export type EventStatus = 'pending' | 'scheduled' | 'running' | 'done' | 'missed' | 'declined' | 'bumped';

export interface CalEvent {
  id: string;
  title: string;
  attendees: ExecId[];
  start: number | null;
  /** Requested time: it arrives already on the calendar, wherever the requester put it. */
  proposed?: number;
  duration: number;
  fixed?: boolean;
  /** Fixed events that barge in: they never get "missed", they make others missed. */
  force?: boolean;
  /** 'work' = heads-down time for a Trellis ticket. Not a meeting: meeting rules don't apply. */
  kind?: 'meeting' | 'focus' | 'personal' | 'work';
  /** The Trellis ticket a work block is for. */
  ticket?: string;
  /** Ticket priority (work blocks): 1 urgent … 3 whenever. */
  priority?: number;
  /** Who asked for it (from the request message). */
  from?: string;
  /** Must START within this window. */
  window?: [number, number];
  /** Minutes the attendees need free right before it starts. */
  prep?: number;
  /** Margo/Theo want their coffee delivered before this starts. */
  coffee?: boolean;
  /** On start, the meeting quietly grows by this many minutes. */
  overrun?: number;
  overranBy?: number;
  /** Length as originally requested. */
  baseDuration?: number;
  /** Shortest booking that still gets the job done (defaults to the full length). */
  minOk?: number;
  /** Length that was actually booked when it started (before it ran long/short). */
  planned?: number;
  /** Cost of pushing it to tomorrow. Defaults to half the decline penalty. */
  bumpPenalty?: Effects;
  noBump?: boolean;
  /** How many times it has already been pushed. */
  bumps?: number;
  /** Minutes to get there (and back) when it happens in person. */
  travel?: number;
  /** Where it is, for display: "TechLeaf studio". */
  place?: string;
  /** How a remote version lands: 'fine' (no loss), 'meh' (half the upside). Absent = must be in person. */
  remoteOk?: 'fine' | 'meh';
  remote?: boolean;
  /** 'wanted' = expected (penalty without it), 'nice' = small bonus. */
  catering?: 'wanted' | 'nice';
  /** Add-ons the EA has attached. */
  withCoffee?: boolean;
  withCatering?: boolean;
  withRide?: boolean;
  /** Where the booked ride is headed (rides don't follow venue changes on their own). */
  rideTo?: string;
  departed?: boolean;
  /** For requests arriving mid-day: must be scheduled to START before this. */
  deadline?: number;
  reward?: Effects;
  missPenalty?: Effects;
  declinePenalty?: Effects;
  strikeOnMiss?: boolean;
  note?: string;
  status: EventStatus;
  fresh?: boolean;
  /** Someone else touched this meeting (Kendall). */
  editedBy?: string;
  /** Flag set when this meeting happens. */
  flagOnDone?: string;
  /** Can happen any day up to and including this one (absolute day index). Without it, it's today or never. */
  dueDay?: number;
  /** Weekend plans: nice to have. Left unbooked, they just don't happen. */
  optional?: boolean;
  /** A copy of a meeting that got missed, back in the tray to be rebooked. */
  rescheduled?: boolean;
  /** Protected empty time around it (minutes). Travel sets the minimum. */
  bufferBefore?: number;
  bufferAfter?: number;
  /** Everyone originally on the invite (set the first time you take someone off). */
  invited?: ExecId[];
}

export type EventDef = Omit<CalEvent, 'status'>;

export interface Rule {
  id: string;
  text: string;
  short: string;
  penalty: Effects;
  check: (ev: CalEvent) => boolean;
}

export interface Choice {
  label: string;
  reply?: string;
  effects?: Effects;
  log?: string;
  flag?: string;
  then?: Script[];
  /** Saying yes puts a to-do in Notes: do it in time or let them down. */
  promise?: { text: string; within: number; reward?: Effects; fail: Effects };
  /** Hand a job to Kendall. */
  delegate?: KendallJob;
}

export type KendallJob = 'catering' | 'coffee' | 'requests' | 'rides';

export interface MsgDef {
  app: InboxApp;
  from: string;
  subject?: string;
  body: string;
  choices?: Choice[];
  /** A second chance at a message you didn't answer in time (no further follow-ups). */
  followUp?: boolean;
  /** Margo asks your advice. `gut` is what she leans towards; she may ignore you and do that instead. */
  advice?: { gut: number };
  expiresIn?: number;
  timeoutEffects?: Effects;
  timeoutLog?: string;
}

export interface Message extends MsgDef {
  id: string;
  at: number;
  read: boolean;
  /** Which day it arrived (older ones stay in the inbox as history). */
  day?: number;
  chosen?: number; // -1 = timed out
  /** For advice: which option actually happened. */
  outcome?: number;
  expires?: number;
}

export interface CallDef {
  from: string;
  lines: string[];
  choices: Choice[];
  missed: Effects;
  missedLog?: string;
}

export interface CallState extends CallDef {
  status: 'ringing' | 'active';
  ringUntil: number;
}

export interface TaskDef {
  id: string;
  text: string;
  deadline: number;
  kind: 'coffee' | 'gift' | 'reservation' | 'invoice' | 'promise' | 'treat';
  /** treat: a team lunch (Tably) or a coffee run (Brew). */
  treat?: 'lunch' | 'coffee';
  /** invoice: who gets paid, and how much. */
  payee?: string;
  amount?: number;
  /** reservation: party size, acceptable time range, and (optionally) a specific restaurant id. */
  party?: number;
  window?: [number, number];
  place?: string;
  exec?: ExecId;
  recipient?: string;
  personal?: boolean;
  budget?: number;
  reward: Effects;
  fail: Effects;
}

export interface Task extends TaskDef {
  status: 'open' | 'done' | 'failed';
}

/** `at` is an absolute time; scripts inside a Choice's `then` use `after` (minutes from the choice). */
/** Only fire if all `if` flags are set, no `unless` flags are set, and the meter is in range. */
export interface ScriptCond {
  if?: string[];
  unless?: string[];
  meter?: { m: Meter; min?: number; max?: number };
}

export type Script = { at: number; after?: number; when?: ScriptCond } & (
  | { type: 'msg'; msg: MsgDef }
  | { type: 'request'; event: EventDef; msg?: MsgDef }
  | { type: 'insert'; event: EventDef; msg?: MsgDef }
  | { type: 'move'; id: string; start: number; duration?: number; msg?: MsgDef }
  /** Someone changes the venue, or flips a meeting between remote and in person. */
  | { type: 'change'; id: string; place?: string; travel?: number; remote?: boolean; mustBeInPerson?: boolean; msg?: MsgDef }
  | { type: 'task'; task: TaskDef; msg?: MsgDef }
  /** Push a scheduled meeting later (or earlier) by `by` minutes. */
  | { type: 'nudge'; id: string; by: number; msg?: MsgDef }
  | { type: 'call'; call: CallDef }
  | { type: 'reveal'; flag: string }
  /** Kendall, the backup EA, touches the calendars: mostly helpful, sometimes not. */
  | { type: 'kendall'; mode: 'help' | 'sabotage' | 'job'; job?: KendallJob }
  | { type: 'effects'; effects: Effects; log: string; msg?: MsgDef }
);

export interface DayDef {
  title: string;
  weekday: string;
  /** No prep, no payroll, faster clock, and resting lowers stress. */
  weekend?: boolean;
  /** How many ad-hoc things get drawn from the pool today. */
  adhoc: number;
  /** Apps that unlock on this day (they stay unlocked afterwards). */
  apps: AppId[];
  subtitle: string;
  memo: { from: string; subject: string; body: string };
  execs: ExecId[];
  rules: string[];
  events: EventDef[];
  script: Script[];
  /** Flags checked overnight: consequences that catch up with you. */
  reckonings?: { flag: string; unless?: string; text: string; effects: Effects; strike?: boolean }[];
}

export interface Order {
  id: string;
  app: 'brew' | 'bundl';
  item: string;
  label: string;
  to: string;
  price: number;
  arriveAt: number;
  arrived: boolean;
  paidBy: 'company' | 'me';
}

export interface LogEntry {
  at: number;
  text: string;
  effects: Effects;
}

export interface Product {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  tier: 'cheap' | 'good' | 'lavish';
}

export type RideAction = 'book' | 'reroute' | 'cancel';

export type Shortcut = { id?: string } & (
  | { kind: 'coffee'; drink: string; to: ExecId }
  | { kind: 'gift'; product: string; pay: 'company' | 'me' }
  /** One ride action, for one exec's trips, one meeting at a time. */
  | { kind: 'ride'; action: RideAction; to: ExecId }
);

export interface Restaurant {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  /** Times already taken tonight. */
  full: number[];
  /** Extra effects when it's used for a work booking. */
  vibe?: Effects;
  vibeLog?: string;
  deposit?: number;
}

export interface Drink {
  id: string;
  name: string;
  emoji: string;
  price: number;
}
