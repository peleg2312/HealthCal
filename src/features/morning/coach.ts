/**
 * The coach sentence on the morning page: one short message to one person, in up to three parts
 * that read as one: what went well yesterday, the one thing most worth improving (as a next step),
 * and the first step for today. Pure and unit-tested (coach.test.ts): no hooks, no clock, no
 * storage; the page passes what it already has (facts.ts, review.ts, plan.ts).
 *
 * The rules (the lead's decision a, product principle 4):
 * - Warm words only when tied to something true from the person's own data: the good part is
 *   built from wentWell's items, never on a day with nothing to point at. The whole day is praised
 *   (GOOD_STRONG, GOOD_MIXED, GOOD_LOGGED) only when it was fully logged; on a day logged in part,
 *   or without food, only the one thing is (GOOD_ITEM), since the page does not judge that day.
 * - What to improve names one thing as a next step, never a verdict, in this order: protein (with
 *   today's share per meal), sleep, water, then logging the rest of the day on a day not fully
 *   logged. Calories above the band come last and only as a fresh budget, never "eat less", "make
 *   up for it" or a logging tip to someone who logged everything.
 * - The step for today comes from today's plan (its first row) or today's targets; yesterday is
 *   never the measure there. The good part carries no numbers, so a number is said once.
 * - A day with nothing good to point at gets a neutral opener, a next step and the step for today.
 * - Two good things on a strong day, one beside a next step. The first week (day 1 to 7) gets
 *   fewer, gentler words: one good thing, no improve part.
 * - Every part has three phrasings, chosen by today's date (the same all day on every device,
 *   and two mornings in a row never read alike), and no two parts that can meet share "start".
 *   At most MAX_COACH characters joined.
 * - The message says which went-well items, which thing to improve and which plan row it names
 *   (goodKinds, improveKind, todayFrom), so the page does not list them a second time.
 */
import { diffDays } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

import type { DayFacts } from './facts';
import { isNothing } from './facts';
import type { PlanItem, PlanKind, TodayTargets } from './plan';
import { GOOD_NIGHT_H, PROTEIN_ADJUST_SHARE, type ReviewItem, type ReviewKind } from './review';

/** The longest the joined message may be, so it reads in one breath. */
export const MAX_COACH = 170;

export interface CoachInput {
  /** Today's local date: the phrasing is chosen by it. */
  today: ISODate;
  /** dayFacts(useDay(yesterday)). */
  y: DayFacts;
  /** wentWell(review), in its order. */
  well: readonly ReviewItem[];
  /** toAdjust(review), in its order. */
  adjust: readonly ReviewItem[];
  /** todayPlan(...), in its order. */
  plan: readonly PlanItem[];
  /** Today's budget and protein target (useDay(today)). */
  targets: TodayTargets;
  /** Day 1 to 7 of the first week since setup, else 0. */
  firstWeekDay: number;
}

/** What the message is built from: a judged day, or one that only gets an opener. */
export type CoachKind = 'strong' | 'mixed' | 'item' | 'first-week' | 'partial' | 'water-only' | 'nothing';

/** What the improve part speaks of. */
export type ImproveKind = 'cal' | 'sleep' | 'water' | 'protein' | 'log';

export interface CoachMessage {
  kind: CoachKind;
  /** A neutral first sentence on a day that is not judged (part-logged, water only, nothing), else null. */
  opener: string | null;
  /** What went well yesterday, from wentWell; null when nothing true to point at. */
  good: string | null;
  /** The one thing most worth improving, as a next step; null on a strong day, in the first week, or when today's step already names it. */
  improve: string | null;
  /** The first step for today, with its numbers; null when there is no plan row and no target. */
  today: string | null;
  /** The went-well kinds the good part names (the page leaves them out of "What went well"). */
  goodKinds: ReviewKind[];
  /** What the improve part (or a water-led step for today) names, or null (the page leaves it out of "What to improve"). */
  improveKind: ImproveKind | null;
  /** Where the step for today came from (the page leaves that row out of "For today"). */
  todayFrom: TodayFrom;
  /** The parts joined with spaces. */
  text: string;
  /** The same for a screen reader, units in words. */
  label: string;
}

// ------------------------------------------------------------------ choosing a phrasing

const EPOCH: ISODate = '2000-01-03';

/** The day's number: consecutive days differ by one, so a three-way choice never repeats on two days in a row. */
export function dayIndex(today: ISODate): number {
  return diffDays(EPOCH, today);
}

function pick<T>(options: readonly T[], today: ISODate, salt: number): T {
  const n = options.length;
  return options[(((dayIndex(today) + salt) % n) + n) % n];
}

const SALT_OPEN = 0;
const SALT_GOOD = 1;
const SALT_IMPROVE = 2;
const SALT_TODAY = 0;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ the good part

/** The noun phrase for a went-well item: no numbers (the card under the coach carries them). */
function goodPhrase(item: ReviewItem, y: DayFacts): string {
  switch (item.kind) {
    case 'move':
      return y.activities.length > 1 ? 'your workouts' : 'your workout';
    case 'sleep':
      return "a full night's sleep";
    case 'budget':
      return 'a day within budget';
    case 'protein':
      return 'protein on target';
    case 'water':
      return 'water on target';
    default:
      return 'the whole day logged';
  }
}

/** One or two went-well items as one phrase: "your workout and a full night's sleep", "protein and water on target". */
export function goodList(items: readonly ReviewItem[], y: DayFacts): string {
  const kinds = items.map((i) => i.kind);
  if (kinds.length === 2 && kinds[0] === 'protein' && kinds[1] === 'water') return 'protein and water on target';
  return items.map((i) => goodPhrase(i, y)).join(' and ');
}

/** A fully logged day with nothing to improve: one or two good things, said warmly. */
export const GOOD_STRONG: readonly ((p: string) => string)[] = [
  (p) => `${cap(p)}: a strong base to build on today.`,
  (p) => `${cap(p)}. That is a day worth repeating.`,
  (p) => `${cap(p)}: carry that into today.`,
];
/** A fully logged day with one good thing beside a next step. */
export const GOOD_MIXED: readonly ((p: string) => string)[] = [
  (p) => `${cap(p)}: keep that going.`,
  (p) => `${cap(p)} yesterday: worth doing again.`,
  (p) => `${cap(p)}: that one is yours to keep.`,
];
/** A fully logged day whose one good thing is the logging itself: the habit, named as such. */
export const GOOD_LOGGED: readonly string[] = [
  'You logged the whole day: the habit that carries the rest.',
  'The whole day is in the diary, and that habit matters most.',
  'You kept the diary whole yesterday; that habit carries the rest.',
];
/**
 * A day not fully logged that still has something true to point at (a workout, a night, water):
 * the praise is for that one thing, never for the day, which the page does not judge.
 */
export const GOOD_ITEM: readonly ((p: string) => string)[] = [
  (p) => `One to keep from yesterday: ${p}.`,
  (p) => `${cap(p)}: that part of yesterday counts.`,
  (p) => `From yesterday, ${p} is worth keeping.`,
];
/** The first week: one thing, gently. */
export const GOOD_FIRST_WEEK: readonly ((p: string) => string)[] = [
  (p) => `${cap(p)}: a good first-week step.`,
  (p) => `${cap(p)}: your first week is taking shape.`,
  (p) => `${cap(p)}: solid footing for a first week.`,
];

// ------------------------------------------------------------------ openers (a day not judged)

export const OPEN_PARTIAL: readonly string[] = ['Part of yesterday made it into the diary.', 'Some of yesterday is logged; today can hold the rest.', 'Yesterday has a few entries to build on.'];
export const OPEN_WATER: readonly string[] = ['Water logged yesterday is a place to begin.', "Yesterday's water is in the diary.", 'Yesterday has water in the diary to build on.'];
export const OPEN_NOTHING: readonly string[] = ['A fresh page today.', 'Today opens with a clean diary.', 'New day, open diary.'];
export const OPEN_FIRST_WEEK: readonly string[] = ['Small steps count in a first week.', 'One small step today is plenty.', 'A first week goes one entry at a time.'];

// ------------------------------------------------------------------ the improve part

/**
 * Next steps for the one thing chosen to improve: never a verdict, never "eat less" or "make up
 * for it". Calories above the band (only on a fully logged day) get a fresh-budget line, never a
 * logging tip; `log` is for a day not fully logged.
 */
export const IMPROVE: Readonly<Record<'cal' | 'sleep' | 'water' | 'protein' | 'log', readonly string[]>> = {
  cal: ['A fresh budget today; plan the next meal from it.', 'Today brings a fresh budget.', 'Today is a new budget, one meal at a time.'],
  sleep: [
    `Next step: an earlier night tonight, ${GOOD_NIGHT_H} h is the target.`,
    `Tonight, give sleep more room: ${GOOD_NIGHT_H} h is the target.`,
    `An earlier night is the next step, toward ${GOOD_NIGHT_H} h.`,
  ],
  water: ['Next step: a glass with each meal today.', 'Water next: keep a glass in reach today.', 'A glass with every meal is the next step.'],
  protein: ['Next step: some protein at each meal.', 'Protein next: add some to each meal.', 'A protein source at each meal is the next step.'],
  log: ['Next step: every meal in the diary today.', 'Next step: log each meal today as it happens.', 'Today, log the meals as they come.'],
};
/** The protein step with today's share per meal, `g` with its unit ("50 g"): today's target over three meals. */
export const IMPROVE_PROTEIN: readonly ((g: string) => string)[] = [
  (g) => `Next step: about ${g} of protein at each meal today.`,
  (g) => `Protein next: about ${g} at breakfast, lunch and dinner.`,
  (g) => `Build each meal around protein today, about ${g} each.`,
];

/** What the improve part speaks of, in this order: never calories while anything else is listed. */
const IMPROVE_ORDER: readonly ('protein' | 'sleep' | 'water')[] = ['protein', 'sleep', 'water'];

/** The one thing the improve part names (`log` on a day not fully logged), or null. */
function improveKind(adjust: readonly ReviewItem[], y: DayFacts): keyof typeof IMPROVE | null {
  // Protein comes first even when "What to improve" ran out of room for it (it keeps three items,
  // ranked by the share missing): the coach's next step is the most useful one, not the largest gap.
  if (proteinShort(y)) return 'protein';
  const found = IMPROVE_ORDER.find((k) => adjust.some((a) => a.kind === k));
  if (found) return found;
  if (adjust.some((a) => a.kind === 'cal')) return 'cal';
  // Something but not all of the day is in the diary, or water or a workout without food.
  if (!y.complete && !isNothing(y)) return 'log';
  return null;
}

/** A fully logged day with protein under the share toAdjust lists (review.ts's own rule). */
function proteinShort(y: DayFacts): boolean {
  return y.complete && y.proteinG > 0 && y.protein < y.proteinG * PROTEIN_ADJUST_SHARE - 1e-9;
}

/** Today's protein per meal, to the nearest 5 g, or null without a target. */
export function proteinPerMeal(proteinG: number): number | null {
  const g = Math.round(proteinG / 3 / 5) * 5;
  return g > 0 ? g : null;
}

function improveText(k: keyof typeof IMPROVE, i: CoachInput): string {
  if (k === 'protein') {
    const g = proteinPerMeal(i.targets.proteinG);
    if (g !== null) return pick(IMPROVE_PROTEIN, i.today, SALT_IMPROVE)(`${formatNumber(g)} g`);
  }
  return pick(IMPROVE[k], i.today, SALT_IMPROVE);
}

// ------------------------------------------------------------------ the step for today

/** Today's first plan row, `t` its title ("2.6 L of water to go", "45 active minutes left"). */
export const TODAY_WATER: readonly ((t: string) => string)[] = [
  (t) => `First thing, a glass: ${t}.`,
  (t) => `One glass now: ${t}.`,
  (t) => `Today, one glass at a time: ${t}.`,
];
/** The water row when water is also yesterday's first thing to improve: one sentence says both. `a` is the amount left with its unit ("2.6 L"). */
export const TODAY_WATER_LEAD: readonly ((a: string) => string)[] = [
  (a) => `Next step, water: ${a} to go today.`,
  (a) => `Water is today's step: ${a} to go.`,
  (a) => `Today, water first: ${a} to go.`,
];

/** The amount in a water row's title ("2.6 L of water to go" gives "2.6 L"). */
export function waterLeft(title: string): string {
  const m = /^(.*) of water to go$/.exec(title);
  return m ? m[1] : title;
}
export const TODAY_MOVE: readonly ((t: string) => string)[] = [
  (t) => `Some movement today: ${t} this week.`,
  (t) => `A walk or a session today: ${t} this week.`,
  (t) => `Today's step is movement: ${t} this week.`,
];
export const TODAY_WEIGH: readonly string[] = ["Today's first step: a weigh-in.", 'A weigh-in today keeps the trend current.', 'Step on the scale today to keep the trend current.'];
export const TODAY_SLEEP: readonly string[] = ["First, add last night's sleep.", "First step: add last night's sleep.", "Add last night's sleep to complete the picture."];
/** No plan row: today's targets, `k` the budget with its unit and `p` the protein with its unit. */
export const TODAY_TARGETS: readonly ((k: string, p: string) => string)[] = [
  (k, p) => `Today's budget: ${k} and ${p} of protein.`,
  (k, p) => `Today: ${k} to work with and ${p} of protein to reach.`,
  (k, p) => `Aim for ${p} of protein within ${k} today.`,
];
export const TODAY_BUDGET: readonly ((k: string) => string)[] = [
  (k) => `Today's budget: ${k}.`,
  (k) => `Today: ${k} to work with.`,
  (k) => `A fresh ${k} to work with today.`,
];

/** Where the step for today came from: a plan row's kind (the page leaves that row out of For today), today's targets, or nothing. */
export type TodayFrom = PlanKind | 'targets' | null;

function todayStep(i: CoachInput, waterLead: boolean): { text: string | null; from: TodayFrom } {
  const row = i.plan[0];
  const t = i.today;
  if (row) {
    switch (row.kind) {
      case 'water':
        return { text: waterLead ? pick(TODAY_WATER_LEAD, t, SALT_TODAY)(waterLeft(row.title)) : pick(TODAY_WATER, t, SALT_TODAY)(row.title), from: 'water' };
      case 'move':
        return { text: pick(TODAY_MOVE, t, SALT_TODAY)(row.title), from: 'move' };
      case 'weigh':
        return { text: pick(TODAY_WEIGH, t, SALT_TODAY), from: 'weigh' };
      case 'sleep':
        return { text: pick(TODAY_SLEEP, t, SALT_TODAY), from: 'sleep' };
    }
  }
  const budget = Math.round(i.targets.budget);
  if (!(budget > 0)) return { text: null, from: null };
  const k = `${formatNumber(budget)} kcal`;
  const protein = Math.round(i.targets.proteinG);
  return { text: protein > 0 ? pick(TODAY_TARGETS, t, SALT_TODAY)(k, `${formatNumber(protein)} g`) : pick(TODAY_BUDGET, t, SALT_TODAY)(k), from: 'targets' };
}

// ------------------------------------------------------------------ the label

/** Units in words for a screen reader: "2.6 L" is "2.6 litres". */
export function spokenCoach(text: string): string {
  return text
    .replace(/(\d) kcal\b/g, '$1 kilocalories')
    .replace(/(\d) fl oz\b/g, '$1 fluid ounces')
    .replace(/(\d) ml\b/g, '$1 millilitres')
    .replace(/(\d) L\b/g, '$1 litres')
    .replace(/(\d) g\b/g, '$1 grams')
    .replace(/(\d) h\b/g, '$1 hours')
    .replace(/(\d) min\b/g, '$1 minutes');
}

// ------------------------------------------------------------------ the message

function join(parts: (string | null)[]): string {
  return parts.filter((p): p is string => !!p).join(' ');
}

interface Parts {
  kind: CoachKind;
  opener: string | null;
  good: string | null;
  goodKinds: ReviewKind[];
  improve: string | null;
  improveKind: ImproveKind | null;
  today: { text: string | null; from: TodayFrom };
}

function done(p: Parts): CoachMessage {
  const text = join([p.opener, p.good, p.improve, p.today.text]);
  return {
    kind: p.kind,
    opener: p.opener,
    good: p.good,
    improve: p.improve,
    today: p.today.text,
    goodKinds: p.goodKinds,
    // A water-led step for today names water too.
    improveKind: p.improve ? p.improveKind : p.improveKind === 'water' && p.today.from === 'water' ? 'water' : null,
    todayFrom: p.today.text ? p.today.from : null,
    text,
    label: spokenCoach(text),
  };
}

/** The coach message for this morning. */
export function coachMessage(i: CoachInput): CoachMessage {
  const t = i.today;
  const firstWeek = i.firstWeekDay >= 1 && i.firstWeekDay <= 7;
  const first = firstWeek ? null : improveKind(i.adjust, i.y);
  // Water to improve and today's first row is water: the step for today says both.
  const waterLead = first === 'water' && i.plan[0]?.kind === 'water';
  const today = todayStep(i, waterLead);
  const improve = first && !waterLead ? improveText(first, i) : null;
  const improveK: ImproveKind | null = waterLead ? 'water' : first;

  // A day with no good thing to point at: a neutral opener (with a next step when there is one).
  if (i.well.length === 0) {
    const y = i.y;
    const kind: CoachKind = isNothing(y) ? 'nothing' : y.foodLogged ? 'partial' : 'water-only';
    const options = firstWeek ? OPEN_FIRST_WEEK : kind === 'nothing' ? OPEN_NOTHING : kind === 'partial' ? OPEN_PARTIAL : OPEN_WATER;
    const opener = pick(options, t, SALT_OPEN);
    const base = { kind, opener, good: null, goodKinds: [], improveKind: improveK, today };
    const m = done({ ...base, improve });
    return m.text.length <= MAX_COACH ? m : done({ ...base, improve: null });
  }

  // Praise for the whole day only when the whole day is logged; otherwise for the one thing.
  const kind: CoachKind = firstWeek ? 'first-week' : !i.y.complete ? 'item' : first && first !== 'log' ? 'mixed' : 'strong';
  const goods = kind === 'first-week' ? GOOD_FIRST_WEEK : kind === 'item' ? GOOD_ITEM : kind === 'mixed' ? GOOD_MIXED : GOOD_STRONG;
  // Two good things on a strong day; one beside a next step, so the message stays short.
  const take = kind === 'strong' ? 2 : 1;

  // Shorter until it fits: one good thing, then without the improve part.
  const tries: [number, boolean][] = [
    [take, true],
    [1, true],
    [1, false],
  ];
  let m: CoachMessage | null = null;
  for (const [n, withImprove] of tries) {
    const items = i.well.slice(0, n);
    const onlyLogged = items.length === 1 && items[0].kind === 'logged' && (kind === 'strong' || kind === 'mixed');
    const good = onlyLogged ? pick(GOOD_LOGGED, t, SALT_GOOD) : pick(goods, t, SALT_GOOD)(goodList(items, i.y));
    m = done({ kind, opener: null, good, goodKinds: items.map((x) => x.kind), improve: withImprove ? improve : null, improveKind: improveK, today });
    if (m.text.length <= MAX_COACH) return m;
  }
  return m as CoachMessage;
}
