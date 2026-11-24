/**
 * "What went well" and "What to improve" on the morning page, and the note under yesterday's
 * card. Pure and unit-tested (review.test.ts); the screen only places the strings.
 *
 * The rules (spec section 4, product principle 4):
 * - Every item is a fact from yesterday with its numbers. Praise only for something true and
 *   specific; never a consolation line, never praise words.
 * - Yesterday is judged against its own targets (DayFacts carries the day's own budget and goals).
 * - A part-logged day, or a day without food, is not judged on food or water (reviewNote says so).
 * - Calories are an item to improve only on a complete day over the band (more than 10% above the
 *   day's budget), ranked first, with the filled amber key mark (mark 'warning'); the words are
 *   figures only ("Calories at 2,510 of 2,190 kcal"; the card's sentence states the difference),
 *   never "eat less" or "make up for it".
 * - "Within the day's budget" holds on a complete day from 80% of the budget up to the budget.
 * - A complete day always has one thing that went well: "The whole day is logged" ranks last, and
 *   shows only when the budget item does not (one calorie mark, never two).
 * - Sleep is the night dated today (the person woke up today): 7 h or more went well, under 6 h
 *   is listed to adjust, in between neither.
 * - Each figure is said once on the page (rubric D2-04): when yesterday's card shows its figures
 *   (`figuresOnCard`), an item whose number the card already shows (sleep, water, protein, a
 *   workout's minutes) names the fact in words only ("A full night's sleep", "Water below its
 *   goal"); the numbers stay on the card. Without the card's figures the items keep them.
 */
import { originName } from '@/features/health-sync/origins';
import { SLEEP_RANGE, formatHours } from '@/features/trackers/helpers';
import { formatNumber } from '@/lib/units';
import type { UnitSystem } from '@/types';

import type { DayFacts } from './facts';
import { waterFigures } from './figures';
import { goalMet } from './line';

/**
 * The water the review judges: the day's whole total (drinks from the diary included) on a day with
 * water logged as water (`hasWater`, `hasWaterTracked`), else nothing, so a day whose only water came
 * with a latte in the diary reads exactly as a day with no water ("No water logged, goal 2.6 L").
 */
export function trackedWaterMl(y: Pick<DayFacts, 'waterMl' | 'hasWater'>): number {
  return y.hasWater ? y.waterMl : 0;
}

export type ReviewKind = 'move' | 'sleep' | 'budget' | 'protein' | 'water' | 'logged' | 'cal';
/** A theme colour name the screen looks up in colors (a CupKey's colour). */
export type DataColor = 'calories' | 'protein' | 'water' | 'exercise' | 'sleep' | 'weight';
/** The key mark beside an item: the list's own ('filled' in went well, 'outline' in to improve), or the filled amber over-target mark (colors.warning). */
export type ReviewMark = 'filled' | 'outline' | 'warning';

export interface ReviewItem {
  kind: ReviewKind;
  text: string;
  /** The data colour of the item's key (colors[color]); with mark 'warning' the key is colors.warning instead. */
  color: DataColor;
  /** CupKey variant and colour: 'filled' and 'outline' in color, 'warning' a filled key in colors.warning. The text stays in the text colour. */
  mark: ReviewMark;
}

/** The section titles (the second list's testID stays morning-adjust). */
export const WELL_TITLE = 'What went well';
export const ADJUST_TITLE = 'What to improve';
export const PLAN_TITLE = 'For today';

export interface LastNight {
  hours: number;
  /** 'health' when the night was read from a health store. */
  source?: string;
  /** The app that wrote it (SleepEntry.origin), named with originName. */
  origin?: string;
}

export interface ReviewInput {
  /** dayFacts(useDay(yesterday)). */
  y: DayFacts;
  /** guidelineMinutes of the activities from startOfWeek(yesterday) to the day before yesterday; 0 when yesterday is a Monday. */
  weekBefore: number;
  /** The night dated today: findByDate(useLive('sleep'), today), or null. */
  lastNight: LastNight | null;
  units: UnitSystem;
  /** Day 1 to 7 since setup: at most one item to adjust. */
  firstWeek: boolean;
  /**
   * True when yesterday's card shows its four figures (eaten, protein, water, last night's sleep)
   * and the movement row, as the morning page does on any day with something logged: the items
   * then leave those numbers to the card. Absent or false: every item carries its numbers.
   */
  figuresOnCard?: boolean;
}

/** The weekly activity guideline, minutes. */
export const WEEKLY_GUIDELINE_MIN = 150;
/** A night of this many hours or more went well (SLEEP_RANGE[0], 7 h). */
export const GOOD_NIGHT_H = SLEEP_RANGE[0];
/** A night under this many hours is listed to adjust. */
export const SHORT_NIGHT_H = 6;
/** Protein under this share of its goal, on a complete day, is listed to adjust. */
export const PROTEIN_ADJUST_SHARE = 0.8;
/**
 * "Within the day's budget" is praised only from this share of the budget up to the budget: a day
 * eaten far under its own budget is neither praised nor listed (the page gives no eating advice).
 */
export const BUDGET_PRAISE_FROM = 0.8;

export const MAX_WELL = 3;
export const MAX_ADJUST = 3;
export const MAX_ADJUST_FIRST_WEEK = 1;

const round = (n: number) => formatNumber(Math.round(n));

/** "1 active minute", "75 active minutes". */
export function activeMinutes(n: number): string {
  return `${round(n)} active ${n === 1 ? 'minute' : 'minutes'}`;
}

function moveText(y: DayFacts, weekBefore: number, figuresOnCard: boolean): string {
  const m = Math.round(y.guidelineMin);
  const before = Math.round(weekBefore);
  if (m > 0 && before >= WEEKLY_GUIDELINE_MIN) {
    // The week had passed the guideline before yesterday: yesterday's minutes and the week's total, nothing "toward" it.
    return `${m === 1 ? '1 more active minute' : `${round(m)} more active minutes`}, ${round(before + m)} this week`;
  }
  if (m > 0 && before + m >= WEEKLY_GUIDELINE_MIN) {
    return `Weekly ${WEEKLY_GUIDELINE_MIN} active minutes reached: ${round(before + m)} min`;
  }
  if (m > 0) return `${activeMinutes(m)} toward the weekly ${WEEKLY_GUIDELINE_MIN}`;
  // The movement row on the card already says the session and its minutes.
  if (figuresOnCard) return y.activities.length === 1 ? `${y.activities[0].name.trim()} logged` : 'Every session logged';
  if (y.activities.length === 1) {
    const a = y.activities[0];
    return `${a.name.trim()}, ${round(a.durationMin)} min`;
  }
  const total = y.activities.reduce((s, a) => s + a.durationMin, 0);
  return `${y.activities.length} sessions, ${round(total)} min`;
}

export const LOGGED_TEXT = 'The whole day is logged';

/** Up to three things that went well yesterday, the ones the sentence does not already say first. */
export function wentWell(i: ReviewInput): ReviewItem[] {
  const { y, lastNight, units } = i;
  const onCard = !!i.figuresOnCard;
  const items: ReviewItem[] = [];

  if (y.activities.length > 0) items.push({ kind: 'move', text: moveText(y, i.weekBefore, onCard), color: 'exercise', mark: 'filled' });

  if (lastNight && lastNight.hours >= GOOD_NIGHT_H) {
    const from = lastNight.source === 'health' && lastNight.origin ? `, from ${originName(lastNight.origin)}` : '';
    const text = onCard ? `A full night's sleep${from}` : `${formatHours(lastNight.hours)} of sleep last night${from}`;
    items.push({ kind: 'sleep', text, color: 'sleep', mark: 'filled' });
  }

  const withinBudget = y.complete && y.budget > 0 && y.kcal >= y.budget * BUDGET_PRAISE_FROM - 1e-9 && y.kcal <= y.budget;
  if (withinBudget) {
    items.push({ kind: 'budget', text: `Within the day's budget: ${y.approx ? 'about ' : ''}${round(y.kcal)} of ${round(y.budget)} kcal`, color: 'calories', mark: 'filled' });
  }

  if (y.foodLogged && !y.overBand && goalMet(y.protein, y.proteinG)) {
    items.push({ kind: 'protein', text: `Protein reached: ${round(y.protein)} of ${round(y.proteinG)} g`, color: 'protein', mark: 'filled' });
  }

  const waterMl = trackedWaterMl(y);
  if (goalMet(waterMl, y.waterGoalMl)) {
    const w = waterFigures(waterMl, y.waterGoalMl, units);
    items.push({ kind: 'water', text: `Water reached: ${w.value} of ${w.goal}`, color: 'water', mark: 'filled' });
  }

  // Keeping the diary is the habit the app is for: true and specific on any complete day, so it ranks last,
  // and only when the budget item (the same calorie mark) is not already there.
  if (y.complete && !withinBudget) items.push({ kind: 'logged', text: LOGGED_TEXT, color: 'calories', mark: 'filled' });

  return items.slice(0, MAX_WELL);
}

/**
 * Up to three facts from yesterday to improve on (one in the first week): calories over the band
 * first, then a short night, then water and protein by the share still missing.
 */
export function toAdjust(i: ReviewInput): ReviewItem[] {
  const { y, lastNight, units } = i;
  const onCard = !!i.figuresOnCard;
  const items: ReviewItem[] = [];

  if (y.overBand) {
    const about = y.approx ? 'about ' : '';
    items.push({
      kind: 'cal',
      // The figures only: the card's sentence already states the difference.
      text: `Calories at ${about}${round(y.kcal)} of ${round(y.budget)} kcal`,
      color: 'calories',
      mark: 'warning',
    });
  }

  if (lastNight && lastNight.hours < SHORT_NIGHT_H) {
    const text = onCard ? "A short night's sleep" : `Sleep last night: ${formatHours(lastNight.hours)} of ${GOOD_NIGHT_H} h`;
    items.push({ kind: 'sleep', text, color: 'sleep', mark: 'outline' });
  }

  // Food and water are judged only on a complete day; ranked by the share still missing, water first on a tie.
  const ranked: { item: ReviewItem; missing: number; order: number }[] = [];
  const waterMl = trackedWaterMl(y);
  if (y.complete && y.waterGoalMl > 0 && waterMl < y.waterGoalMl) {
    const w = waterFigures(waterMl, y.waterGoalMl, units);
    const text = onCard
      ? waterMl <= 0
        ? 'No water logged'
        : 'Water below its goal'
      : waterMl <= 0
        ? `No water logged, goal ${w.goal}`
        : `Water stopped at ${w.value} of ${w.goal}`;
    ranked.push({ item: { kind: 'water', text, color: 'water', mark: 'outline' }, missing: 1 - Math.max(0, waterMl) / y.waterGoalMl, order: 0 });
  }
  if (y.complete && y.proteinG > 0 && y.protein < y.proteinG * PROTEIN_ADJUST_SHARE - 1e-9) {
    ranked.push({
      item: { kind: 'protein', text: onCard ? 'Protein below its goal' : `Protein at ${round(y.protein)} of ${round(y.proteinG)} g`, color: 'protein', mark: 'outline' },
      missing: 1 - Math.max(0, y.protein) / y.proteinG,
      order: 1,
    });
  }
  ranked.sort((a, b) => b.missing - a.missing || a.order - b.order);
  for (const r of ranked) items.push(r.item);

  return items.slice(0, i.firstWeek ? MAX_ADJUST_FIRST_WEEK : MAX_ADJUST);
}

export const NOTE_PART_LOGGED = 'With part of the day logged, its totals are not compared with your budget and goals.';
export const NOTE_NO_FOOD = "With no food logged, the day's totals are not compared with your budget and goals.";

/** The caption under yesterday's card when the day is not judged on food and water, else null. */
export function reviewNote(y: DayFacts): string | null {
  if (y.foodLogged && !y.complete) return NOTE_PART_LOGGED;
  if (!y.foodLogged && (y.hasWater || y.activities.length > 0)) return NOTE_NO_FOOD;
  return null;
}

/** The plain card's words when nothing was logged yesterday (spec 1.3 and 2.4). */
export const NOTHING_LINE = 'Nothing logged yesterday.';
export const NOTHING_CAPTION = "This page sums up the day before: food, water, movement and last night's sleep.";
