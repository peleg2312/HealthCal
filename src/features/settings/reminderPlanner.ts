/**
 * Reminder planner. Pure: plain data in, a list of dated reminders out.
 *
 * Local notifications cannot compute their text when they fire, so the app
 * re-plans whenever data changes and every body is built from the numbers as
 * they are right now. The rules exist to keep reminders useful or silent:
 * skip what is already done, respect quiet hours, space them out, cap the day.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { hasFoodLogged, isWaterDrinkEntry } from '@/features/drinks/via';
import { addDays, formatClock, fromISODate, parseHHmm, toISODate } from '@/lib/dates';
import { netKcal } from '@/lib/exercise';
import { glassesLeft } from '@/lib/hydration';
import { formatNumber, formatVolume, mlToFlOz } from '@/lib/units';
import type { DaySummary } from '@/store/selectors';
import type { FoodEntry, ISODate, MealType, ReminderSettings, UnitSystem } from '@/types';

export type ReminderKind = 'water' | 'meal' | 'checkin' | 'weighin' | 'movement';

export interface PlannedReminder {
  id: string;
  at: Date;
  title: string;
  body: string;
  kind: ReminderKind;
  /** Screen a tap opens. A meal reminder carries its meal and day. */
  url: string;
  /** Notification category with action buttons, when this reminder has any. */
  category?: ReminderCategory;
  /** What the actions need: the day, and the meal for a meal reminder. */
  data?: { date: ISODate; meal?: Exclude<MealType, 'snack'> };
}

export interface ReminderAction {
  identifier: string;
  buttonTitle: string;
}

export interface ReminderCategory {
  /** Unique per set of buttons, so a change of presets or units registers a new category. */
  identifier: string;
  actions: ReminderAction[];
}

export interface PlannerDay {
  summary: DaySummary;
  /** A weight entry exists for this date. */
  weighed: boolean;
  /** Main meals logged on the day before, which a meal reminder can offer to repeat. */
  previousDayMeals?: MealType[];
}

export interface PlannerInput {
  reminders: ReminderSettings;
  units: UnitSystem;
  /** Today's numbers. Null before onboarding: nothing is planned. */
  today: PlannerDay | null;
  /** Tomorrow as it stands (usually empty), for the morning reminders. */
  tomorrow?: PlannerDay | null;
  /** Current body weight, used for the movement suggestion. */
  weightKg?: number;
  /**
   * Non-exercise daily expenditure the budget is built on (formulaTdee), so the
   * movement suggestion uses the same net calories as the activity logger.
   */
  baselineKcalPerDay?: number;
  /** Quick-add glass sizes in ml; the first two become water reminder buttons. */
  waterPresetsMl?: number[];
}

/** Minimum gap between any two reminders. */
export const MIN_GAP_MINUTES = 45;
/** Hard cap per calendar day. */
export const MAX_PER_DAY = 6;
/** Tomorrow's reminders are planned up to this local time; the app re-plans when it is next opened. */
export const TOMORROW_UNTIL_MINUTES = 12 * 60;

/** Higher wins when two reminders are too close or the day is over the cap. */
export const PRIORITY: Record<ReminderKind, number> = {
  checkin: 5,
  meal: 4,
  weighin: 3,
  movement: 2,
  water: 1,
};

export const REMINDER_ROUTES: Record<ReminderKind, string> = {
  water: '/water',
  meal: '/food/search',
  checkin: '/',
  weighin: '/weight',
  movement: '/activity/pick',
};

/** How long "Later today" on a weigh-in reminder waits. */
export const SNOOZE_MINUTES = 120;

const MEALS: { key: Exclude<MealType, 'snack'>; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

/** True when `minutes` (after midnight) is inside the quiet window, which may cross midnight. */
export function inQuietHours(minutes: number, quietStart: string, quietEnd: string): boolean {
  const s = parseHHmm(quietStart);
  const e = parseHHmm(quietEnd);
  if (s === e) return false;
  if (s < e) return minutes >= s && minutes < e;
  return minutes >= s || minutes < e;
}

/** Local Date for a day key and minutes after midnight. */
export function atLocal(date: ISODate, minutes: number): Date {
  const d = fromISODate(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

/**
 * Volume for reminder copy: whole ml below a litre, one decimal above
 * ("1.5 L", never "1.50 L"), whole fl oz in imperial units.
 */
export function volumeText(ml: number, units: UnitSystem): string {
  if (units === 'imperial' || ml < 1000) return formatVolume(ml, units);
  return `${String(Math.round(ml / 100) / 10)} L`;
}

const kcal = (n: number) => `${formatNumber(Math.round(Math.abs(n)))} kcal`;

function glassPhrase(remainingMl: number, units: UnitSystem): string {
  // A glass is 250 ml, or 8 fl oz in imperial units.
  const glassMl = units === 'imperial' ? 8 / mlToFlOz(1) : 250;
  const n = glassesLeft(remainingMl, glassMl);
  return `about ${n} ${n === 1 ? 'glass' : 'glasses'}`;
}

function caloriesLine(day: DaySummary): string {
  if (day.remaining >= 0) return `${kcal(day.remaining)} left`;
  return `${kcal(day.remaining)} above today's budget`;
}

export function waterBody(day: DaySummary, units: UnitSystem): string {
  return `${volumeText(day.waterRemainingMl, units)} to go today, ${glassPhrase(day.waterRemainingMl, units)}.`;
}

export function mealBody(day: DaySummary, mealLabel: string): string {
  const left =
    day.remaining >= 0
      ? `${kcal(day.remaining)} left for today.`
      : `Today is ${kcal(day.remaining)} above the budget so far.`;
  return `Nothing logged for ${mealLabel.toLowerCase()} yet. ${left}`;
}

/** Everything that counts as "on track" for the evening check-in. */
export function dayOnTrack(day: DaySummary): boolean {
  const mealsLogged = MEALS.every((m) => hasFoodLogged(day.byMeal[m.key]));
  return (
    mealsLogged &&
    day.remaining >= 0 &&
    day.eaten.protein >= day.macros.proteinG * 0.9 &&
    day.waterRemainingMl <= 0
  );
}

export function checkInBody(day: DaySummary, units: UnitSystem): string {
  if (dayOnTrack(day)) return `Everything is logged and on track today: ${caloriesLine(day)}, protein and water goals reached.`;
  const parts: string[] = [caloriesLine(day)];
  const proteinLeft = Math.round(day.macros.proteinG - day.eaten.protein);
  parts.push(proteinLeft > 0 ? `${proteinLeft} g protein to go` : 'protein goal reached');
  parts.push(day.waterRemainingMl > 0 ? `${volumeText(day.waterRemainingMl, units)} water to go` : 'water goal reached');
  const unlogged = MEALS.filter((m) => !hasFoodLogged(day.byMeal[m.key])).map((m) => m.label.toLowerCase());
  const tail = unlogged.length ? ` Not logged yet: ${unlogged.join(', ')}.` : '';
  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${tail}`;
}

/** Minutes of the suggested walk. */
const WALK_MINUTES = 20;

/**
 * Net calories of a 20 minute walk at a moderate pace, computed exactly as
 * the activity logger would log it (catalogue MET, the budget's own baseline
 * removed), rounded to 5. Null when there is no baseline to measure against.
 */
export function walkNetKcal(weightKg: number, baselineKcalPerDay: number): number | null {
  const met = ACTIVITY_BY_ID.walking?.met.moderate;
  if (!met || !(weightKg > 0) || !(baselineKcalPerDay > 0)) return null;
  return Math.round(netKcal(met, weightKg, WALK_MINUTES, baselineKcalPerDay) / 5) * 5;
}

export function movementBody(weightKg: number | undefined, baselineKcalPerDay?: number, added = true): string {
  const net = weightKg && baselineKcalPerDay ? walkNetKcal(weightKg, baselineKcalPerDay) : null;
  // The run log's words for the part above resting (`budgetAdds`): "adds about 75 kcal to your budget", said only
  // while the day adds workouts.
  if (!net || !added) return 'No activity logged today. A short walk now still counts.';
  return `No activity logged today. A ${WALK_MINUTES} minute walk at a moderate pace adds about ${net} kcal to your budget.`;
}

// ------------------------------------------------------------- actions

/** Short volume for a button: "+250 ml", "+8 fl oz". */
export function waterButtonTitle(ml: number, units: UnitSystem): string {
  return `+${formatVolume(ml, units)}`;
}

/** The two water buttons: the first two distinct sensible presets, or 250 and 500 ml. */
export function waterActionAmounts(presets: number[] | undefined): number[] {
  const valid = [...new Set((presets ?? []).filter((n) => Number.isFinite(n) && n >= 50 && n <= 2000).map((n) => Math.round(n)))];
  return valid.length >= 2 ? valid.slice(0, 2) : valid.length === 1 ? valid : [250, 500];
}

export function waterCategory(presets: number[] | undefined, units: UnitSystem): ReminderCategory {
  const amounts = waterActionAmounts(presets);
  return {
    identifier: `healthcal-water-${amounts.join('-')}-${units}`,
    actions: amounts.map((ml) => ({ identifier: `water-add-${ml}`, buttonTitle: waterButtonTitle(ml, units) })),
  };
}

/**
 * "Repeat yesterday's <meal>": what it copies and whether it may. Only food logged in the diary
 * itself: a drink from Water is never copied (its water would not come with it), a meal that held
 * only such drinks is not offered (`repeatableMeals`), and a drink alone in today's meal does not
 * make it "already logged". `entries` are the live entries.
 */
export function mealRepeat(entries: readonly FoodEntry[], date: ISODate, meal: MealType): { items: FoodEntry[]; already: boolean } {
  const from = addDays(date, -1);
  const items = entries.filter((e) => e.date === from && e.meal === meal && !isWaterDrinkEntry(e));
  const already = hasFoodLogged(entries.filter((e) => e.date === date && e.meal === meal));
  return { items, already };
}

/** The main meals of the day before `date` that "Repeat yesterday's" can offer (`PlannerDay.previousDayMeals`). */
export function repeatableMeals(entries: readonly FoodEntry[], date: ISODate): MealType[] {
  const before = addDays(date, -1);
  return [...new Set(entries.filter((e) => e.date === before && e.meal !== 'snack' && !isWaterDrinkEntry(e)).map((e) => e.meal))];
}

export function mealRepeatCategory(meal: Exclude<MealType, 'snack'>): ReminderCategory {
  return {
    identifier: `healthcal-meal-repeat-${meal}`,
    actions: [{ identifier: 'repeat-meal', buttonTitle: `Repeat yesterday's ${meal}` }],
  };
}

export const WEIGHIN_CATEGORY: ReminderCategory = {
  identifier: 'healthcal-weighin',
  actions: [{ identifier: 'snooze', buttonTitle: 'Later today' }],
};

export type ParsedAction =
  | { type: 'water'; ml: number }
  | { type: 'repeat-meal'; meal: Exclude<MealType, 'snack'>; date: ISODate }
  | { type: 'snooze' }
  | null;

/** What an action button asks for, from its identifier and the reminder's data. Null for a plain tap or anything unknown. */
export function parseReminderAction(actionIdentifier: string, data: unknown): ParsedAction {
  const m = /^water-add-(\d{2,4})$/.exec(actionIdentifier);
  if (m) {
    const ml = Number(m[1]);
    return ml >= 50 && ml <= 2000 ? { type: 'water', ml } : null;
  }
  if (actionIdentifier === 'snooze') return { type: 'snooze' };
  if (actionIdentifier === 'repeat-meal') {
    const d = (data ?? {}) as { meal?: unknown; date?: unknown };
    const meal = MEALS.find((x) => x.key === d.meal)?.key;
    if (!meal || typeof d.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return null;
    return { type: 'repeat-meal', meal, date: d.date };
  }
  return null;
}

/**
 * When a snoozed reminder should come back: `SNOOZE_MINUTES` from now, or
 * null when that is past midnight or inside quiet hours.
 */
export function snoozeTime(now: Date, quietStart: string, quietEnd: string, minutes = SNOOZE_MINUTES): Date | null {
  const at = new Date(now.getTime() + minutes * 60_000);
  if (toISODate(at) !== toISODate(now)) return null;
  if (inQuietHours(at.getHours() * 60 + at.getMinutes(), quietStart, quietEnd)) return null;
  return at;
}

interface Candidate extends PlannedReminder {
  date: ISODate;
  minutes: number;
}

function candidatesForDay(input: PlannerInput, day: PlannerDay, untilMinutes: number): Candidate[] {
  const r = input.reminders;
  const s = day.summary;
  const out: Candidate[] = [];
  const add = (
    kind: ReminderKind,
    minutes: number,
    key: string,
    title: string,
    body: string,
    extra: Pick<PlannedReminder, 'category' | 'data'> & { url?: string } = {},
  ) => {
    if (minutes < 0 || minutes >= untilMinutes) return;
    out.push({
      id: `${kind}-${key}-${s.date}`,
      kind,
      minutes,
      date: s.date,
      at: atLocal(s.date, minutes),
      title,
      body,
      url: extra.url ?? REMINDER_ROUTES[kind],
      data: extra.data ?? { date: s.date },
      ...(extra.category ? { category: extra.category } : null),
    });
  };

  if (r.water.enabled && s.waterRemainingMl > 0 && r.water.everyMinutes >= 15) {
    // Through the waking window: from the end of quiet hours until they start again.
    const wake = parseHHmm(r.quietEnd);
    const sleep = parseHHmm(r.quietStart);
    const windowEnd = sleep > wake ? sleep : sleep + 1440;
    const body = waterBody(s, input.units);
    for (let t = wake + r.water.everyMinutes; t < windowEnd && t < 1440; t += r.water.everyMinutes) {
      add('water', t, String(t), 'Water', body, { category: waterCategory(input.waterPresetsMl, input.units) });
    }
  }

  if (r.meals.enabled) {
    for (const m of MEALS) {
      // Skipped once food is logged for the meal; a coffee or juice from Water alone does not count.
      if (hasFoodLogged(s.byMeal[m.key])) continue;
      const repeatable = day.previousDayMeals?.includes(m.key) ?? false;
      add('meal', parseHHmm(r.meals[m.key]), m.key, m.label, mealBody(s, m.label), {
        url: `/food/search?meal=${m.key}&date=${s.date}`,
        data: { date: s.date, meal: m.key },
        ...(repeatable ? { category: mealRepeatCategory(m.key) } : null),
      });
    }
  }

  if (r.dailySummary.enabled) {
    add('checkin', parseHHmm(r.dailySummary.time), 'day', 'Evening check-in', checkInBody(s, input.units));
  }

  if (r.weighIn.enabled && !day.weighed && r.weighIn.weekdays.includes(fromISODate(s.date).getDay())) {
    const t = parseHHmm(r.weighIn.time);
    // "Later today" only when the snoozed reminder would still land before quiet hours.
    const canSnooze = snoozeTime(atLocal(s.date, t), r.quietStart, r.quietEnd) !== null;
    add('weighin', t, 'day', 'Weigh-in', 'Weighing in before breakfast keeps your trend line accurate.', canSnooze ? { category: WEIGHIN_CATEGORY } : {});
  }

  if (r.movement.enabled && s.activities.length === 0) {
    add('movement', parseHHmm(r.movement.time), 'day', 'Movement', movementBody(input.weightKg, input.baselineKcalPerDay, s.exerciseRule !== 'off'));
  }

  return out;
}

/**
 * Reminders for the rest of today and tomorrow morning, sorted by time.
 * `now` decides what is in the past; every time is in the device's local zone.
 */
export function planReminders(input: PlannerInput, now: Date): PlannedReminder[] {
  const r = input.reminders;
  if (!r.enabled || !input.today) return [];

  const todayKey = toISODate(now);
  const candidates: Candidate[] = [];
  if (input.today.summary.date === todayKey) candidates.push(...candidatesForDay(input, input.today, 1440));
  const tomorrow = input.tomorrow;
  if (tomorrow && tomorrow.summary.date === addDays(todayKey, 1)) {
    candidates.push(...candidatesForDay(input, tomorrow, TOMORROW_UNTIL_MINUTES));
  }

  const eligible = candidates.filter(
    (c) => c.at.getTime() > now.getTime() && !inQuietHours(c.minutes, r.quietStart, r.quietEnd),
  );

  // Greedy by priority, earliest first within a priority: a reminder too close
  // to a more important one, or past the day's cap, is dropped.
  eligible.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind] || a.at.getTime() - b.at.getTime());
  const kept: Candidate[] = [];
  const perDay: Record<string, number> = {};
  const gapMs = MIN_GAP_MINUTES * 60_000;
  for (const c of eligible) {
    if ((perDay[c.date] ?? 0) >= MAX_PER_DAY) continue;
    if (kept.some((k) => Math.abs(k.at.getTime() - c.at.getTime()) < gapMs)) continue;
    kept.push(c);
    perDay[c.date] = (perDay[c.date] ?? 0) + 1;
  }

  return kept
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ date: _date, minutes: _minutes, ...reminder }) => reminder);
}

/** Label for a planned time, relative to `now`: "14:30" or "Tomorrow 08:30". */
export function reminderTimeLabel(at: Date, now: Date, hour12 = false): string {
  const clock = formatClock(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`, hour12);
  return toISODate(at) === toISODate(now) ? clock : `Tomorrow ${clock}`;
}
