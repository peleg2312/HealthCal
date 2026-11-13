/**
 * Reminder planner. Pure: plain data in, a list of dated reminders out.
 *
 * Local notifications cannot compute their text when they fire, so the app
 * re-plans whenever data changes and every body is built from the numbers as
 * they are right now. The rules exist to keep reminders useful or silent:
 * skip what is already done, respect quiet hours, space them out, cap the day.
 */
import { addDays, formatClock, fromISODate, parseHHmm, toISODate } from '@/lib/dates';
import { glassesLeft } from '@/lib/hydration';
import { formatNumber, formatVolume, mlToFlOz } from '@/lib/units';
import type { DaySummary } from '@/store/selectors';
import type { ISODate, MealType, ReminderSettings, UnitSystem } from '@/types';

export type ReminderKind = 'water' | 'meal' | 'checkin' | 'weighin' | 'movement';

export interface PlannedReminder {
  id: string;
  at: Date;
  title: string;
  body: string;
  kind: ReminderKind;
}

export interface PlannerDay {
  summary: DaySummary;
  /** A weight entry exists for this date. */
  weighed: boolean;
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
  return `${kcal(day.remaining)} over today's budget`;
}

export function waterBody(day: DaySummary, units: UnitSystem): string {
  return `${volumeText(day.waterRemainingMl, units)} to go today, ${glassPhrase(day.waterRemainingMl, units)}.`;
}

export function mealBody(day: DaySummary, mealLabel: string): string {
  const left =
    day.remaining >= 0
      ? `${kcal(day.remaining)} left for today.`
      : `Today is ${kcal(day.remaining)} over budget so far.`;
  return `Nothing logged for ${mealLabel.toLowerCase()} yet. ${left}`;
}

/** Everything that counts as "on track" for the evening check-in. */
export function dayOnTrack(day: DaySummary): boolean {
  const mealsLogged = MEALS.every((m) => day.byMeal[m.key].length > 0);
  return (
    mealsLogged &&
    day.remaining >= 0 &&
    day.eaten.protein >= day.macros.proteinG * 0.9 &&
    day.waterRemainingMl <= 0
  );
}

export function checkInBody(day: DaySummary, units: UnitSystem): string {
  if (dayOnTrack(day)) return `Everything is logged and on track today: ${caloriesLine(day)}, protein and water goals met.`;
  const parts: string[] = [caloriesLine(day)];
  const proteinLeft = Math.round(day.macros.proteinG - day.eaten.protein);
  parts.push(proteinLeft > 0 ? `${proteinLeft} g protein to go` : 'protein goal met');
  parts.push(day.waterRemainingMl > 0 ? `${volumeText(day.waterRemainingMl, units)} water to go` : 'water goal met');
  const unlogged = MEALS.filter((m) => day.byMeal[m.key].length === 0).map((m) => m.label.toLowerCase());
  const tail = unlogged.length ? ` Not logged yet: ${unlogged.join(', ')}.` : '';
  const sentence = parts.join(', ');
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${tail}`;
}

/** Net calories of a 20 minute brisk walk (MET 3.8, Compendium), resting share removed. */
function walkNetKcal(weightKg: number): number {
  return Math.round(((3.8 - 1) * 3.5 * weightKg * 5 * 20) / 1000 / 5) * 5;
}

export function movementBody(weightKg: number | undefined): string {
  if (!weightKg) return 'No activity logged today. A short walk now still counts.';
  return `No activity logged today. A 20 minute brisk walk burns about ${walkNetKcal(weightKg)} kcal above resting.`;
}

interface Candidate extends PlannedReminder {
  date: ISODate;
  minutes: number;
}

function candidatesForDay(input: PlannerInput, day: PlannerDay, untilMinutes: number): Candidate[] {
  const r = input.reminders;
  const s = day.summary;
  const out: Candidate[] = [];
  const add = (kind: ReminderKind, minutes: number, key: string, title: string, body: string) => {
    if (minutes < 0 || minutes >= untilMinutes) return;
    out.push({ id: `${kind}-${key}-${s.date}`, kind, minutes, date: s.date, at: atLocal(s.date, minutes), title, body });
  };

  if (r.water.enabled && s.waterRemainingMl > 0 && r.water.everyMinutes >= 15) {
    // Through the waking window: from the end of quiet hours until they start again.
    const wake = parseHHmm(r.quietEnd);
    const sleep = parseHHmm(r.quietStart);
    const windowEnd = sleep > wake ? sleep : sleep + 1440;
    const body = waterBody(s, input.units);
    for (let t = wake + r.water.everyMinutes; t < windowEnd && t < 1440; t += r.water.everyMinutes) {
      add('water', t, String(t), 'Water', body);
    }
  }

  if (r.meals.enabled) {
    for (const m of MEALS) {
      if (s.byMeal[m.key].length > 0) continue;
      add('meal', parseHHmm(r.meals[m.key]), m.key, m.label, mealBody(s, m.label));
    }
  }

  if (r.dailySummary.enabled) {
    add('checkin', parseHHmm(r.dailySummary.time), 'day', 'Daily check-in', checkInBody(s, input.units));
  }

  if (r.weighIn.enabled && !day.weighed && r.weighIn.weekdays.includes(fromISODate(s.date).getDay())) {
    add('weighin', parseHHmm(r.weighIn.time), 'day', 'Weigh-in', 'Weighing in before breakfast keeps your trend line accurate.');
  }

  if (r.movement.enabled && s.activities.length === 0) {
    add('movement', parseHHmm(r.movement.time), 'day', 'Movement', movementBody(input.weightKg));
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
    .map(({ id, at, title, body, kind }) => ({ id, at, title, body, kind }));
}

/** Label for a planned time, relative to `now`: "14:30" or "Tomorrow 08:30". */
export function reminderTimeLabel(at: Date, now: Date, hour12 = false): string {
  const clock = formatClock(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`, hour12);
  return toISODate(at) === toISODate(now) ? clock : `Tomorrow ${clock}`;
}
