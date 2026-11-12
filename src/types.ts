export type ExecId = 'margo' | 'theo';
export type Meter = 'standing' | 'runway' | 'morale' | 'stress';
export type Effects = Partial<Record<Meter, number>>;
export type AppId = 'calendar' | 'mail' | 'huddle' | 'messages' | 'brew' | 'bundl' | 'card' | 'notes' | 'ryde' | 'tably' | 'presto';
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
  kind?: 'meeting' | 'focus' | 'personal';
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
}

export interface MsgDef {
  app: InboxApp;
  from: string;
  subject?: string;
  body: string;
  choices?: Choice[];
  expiresIn?: number;
  timeoutEffects?: Effects;
  timeoutLog?: string;
}

export interface Message extends MsgDef {
  id: string;
  at: number;
  read: boolean;
  chosen?: number; // -1 = timed out
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
  kind: 'coffee' | 'gift' | 'reservation';
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
export type Script = { at: number; after?: number } & (
  | { type: 'msg'; msg: MsgDef }
  | { type: 'request'; event: EventDef; msg?: MsgDef }
  | { type: 'insert'; event: EventDef; msg?: MsgDef }
  | { type: 'move'; id: string; start: number; duration?: number; msg?: MsgDef }
  /** Someone changes the venue, or flips a meeting between remote and in person. */
  | { type: 'change'; id: string; place?: string; travel?: number; remote?: boolean; mustBeInPerson?: boolean; msg?: MsgDef }
  | { type: 'task'; task: TaskDef; msg?: MsgDef }
  | { type: 'call'; call: CallDef }
  | { type: 'reveal'; flag: string }
  | { type: 'effects'; effects: Effects; log: string; msg?: MsgDef }
);

export interface DayDef {
  title: string;
  /** Apps that unlock on this day (they stay unlocked afterwards). */
  apps: AppId[];
  subtitle: string;
  memo: { from: string; subject: string; body: string };
  execs: ExecId[];
  rules: string[];
  events: EventDef[];
  script: Script[];
  /** Flags checked overnight: consequences that catch up with you. */
  reckonings?: { flag: string; text: string; effects: Effects; strike?: boolean }[];
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

export type Shortcut = { id?: string } & (
  | { kind: 'coffee'; drink: string; to: ExecId }
  | { kind: 'gift'; product: string; pay: 'company' | 'me' }
  | { kind: 'rides' }
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
