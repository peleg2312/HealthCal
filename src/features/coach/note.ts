/**
 * "Share my week": the one door through which the person's data reaches the AI coach. Built on the
 * phone, at the moment of sending, from what the phone holds; sent only while the switch is on; shown
 * word for word under "See what is sent" before and after agreeing. Pure (the state and the day come
 * in), so every line is tested from a worked store.
 *
 * Plain sentences, one a line, each present only when its data exists, at most 900 characters:
 *   the goal and its weekly pace; food over the 7 days before today (days logged, average calories
 *   against the budget, protein as a share of its target) and today so far (eaten and left);
 *   training over the last 7 days from every workout on the phone (active minutes, the guideline's
 *   `guidelineMinutes` under the name a person reads everywhere; sessions, the
 *   three most frequent kinds, the overview's title, days without a session); sleep, the average of
 *   the last 7 nights when there are 4 or more; the weight trend as a direction and a rate a week;
 *   water as a share of its goal on days water was tracked.
 * Protein and water are shares of their targets only, never grams or millilitres: both targets are
 * the body weight times a fixed factor (PROTEIN_PER_KG, 33 ml a kg), so a target, or an average
 * beside its share, would give the body weight back. Shares are rounded to 5%.
 * NEVER in it: name, email, body weight, height, age or date of birth, sex, notes, times of day,
 * heart rate, food names, device or app names, or any single record. Kinds of workout are the
 * catalogue's names, never a title a device wrote. Nothing passes through `keepTogether` or
 * `isolateRtl`: the server refuses invisible and direction characters in a note.
 *
 * THE IPHONE RULE. While app.json's Apple Health permission sentence (shown by iOS when access is
 * asked) says the app never sends that data to the AI functions, on iPhone a line is written without
 * the records with source 'health' (Apple Health and the Health export), or left out when nothing
 * remains, and the budget and the protein and water shares are left out when health data may have
 * fed them (`appleNote` then asks the preview to say so): a health-sourced workout or weigh-in of
 * the last 35 days (the budgets of the 7 days before today each look 28 days behind themselves), or a
 * profile weight equal to the latest health-sourced weigh-in (taken over with "Use it for my target").
 * `APPLE_HEALTH_PROMISE` holds the sentence's words; note.test.ts reads app.json and fails when the
 * two disagree, so the rule changes only with the next iPhone build's sentence.
 */
import { Platform } from 'react-native';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { hasFoodLogged } from '@/features/drinks/via';
import { addDays } from '@/lib/dates';
import { hasWaterTracked } from '@/lib/hydration';
import { trainingOverview } from '@/lib/trainingLoad';
import { weeklyRate, weightTrend } from '@/lib/trend';
import { formatNumber } from '@/lib/units';
import { computeDays, live } from '@/store/selectors';
import type { StoreState } from '@/store';
import type { ActivityEntry, ISODate, SleepEntry, WeightEntry } from '@/types';

/** The words of app.json's NSHealthShareUsageDescription that the iPhone rule keeps true. */
export const APPLE_HEALTH_PROMISE = 'never sends this data to the AI functions';
/** True while app.json's iPhone permission sentence holds APPLE_HEALTH_PROMISE (note.test.ts). */
export const APPLE_HEALTH_LEFT_OUT = true;

export const NOTE_MAX = 900;
/**
 * How far back a health-sourced workout or weigh-in can have fed a budget the note reads: the energy
 * model looks 28 days back, from each of the 7 days before today, so 35 days in all.
 */
export const BUDGET_INPUT_DAYS = 35;
export const MIN_NIGHTS = 4;

export type NoteState = Pick<StoreState, 'profile' | 'foodEntries' | 'activities' | 'weights' | 'water' | 'sleep' | 'days'>;

export interface CoachNote {
  /** The note as sent; '' when there is nothing to share. */
  text: string;
  lines: string[];
  /** On iPhone, records from Apple Health were left out (the preview says so). */
  appleNote: boolean;
}

const KG_PER_LB = 0.45359237;

/** "0.4", "1": one decimal, no trailing ".0". */
function oneDecimal(n: number): string {
  const v = Math.round(n * 10) / 10;
  return formatNumber(v, Number.isInteger(v) ? 0 : 1);
}

function rateWords(kgPerWeek: number, imperial: boolean): string {
  return imperial ? `${oneDecimal(kgPerWeek / KG_PER_LB)} lb` : `${oneDecimal(kgPerWeek)} kg`;
}

/** "70%": a share of a goal, rounded to 5%. */
function share(part: number, whole: number): string {
  return `${formatNumber(Math.round((part / whole) * 20) * 5)}%`;
}

function hoursWords(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const fromHealth = (r: { source?: string }) => r.source === 'health';

/** The note and what the preview needs. `os` is Platform.OS. */
export function coachNote(state: NoteState, today: ISODate, os: string = Platform.OS): CoachNote {
  const profile = state.profile;
  if (!profile?.onboardedAt) return { text: '', lines: [], appleNote: false };
  const imperial = profile.units === 'imperial';
  const appleRule = os === 'ios' && APPLE_HEALTH_LEFT_OUT;

  const food = live(state.foodEntries);
  const water = live(state.water);
  const allActivities = live(state.activities);
  const allWeights = live(state.weights);
  const allSleep = live(state.sleep);
  const activities: ActivityEntry[] = appleRule ? allActivities.filter((a) => !fromHealth(a)) : allActivities;
  const weights: WeightEntry[] = appleRule ? allWeights.filter((w) => !fromHealth(w)) : allWeights;
  const sleep: SleepEntry[] = appleRule ? allSleep.filter((s) => !fromHealth(s)) : allSleep;
  const appleNote = appleRule && (allActivities.some(fromHealth) || allWeights.some(fromHealth) || allSleep.some(fromHealth));
  // The budget (and the targets built on it) is left out on iPhone when health data may have fed it.
  const windowFrom = addDays(today, -BUDGET_INPUT_DAYS);
  const latestHealthWeigh = allWeights.filter((w) => fromHealth(w) && w.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const healthFed =
    appleRule &&
    ([...allActivities, ...allWeights].some((r) => fromHealth(r) && r.date >= windowFrom && r.date <= today) ||
      (latestHealthWeigh !== undefined && Math.abs(latestHealthWeigh.kg - profile.weightKg) < 0.05));
  const targets = !healthFed;

  const lines: string[] = [];

  // The goal and its weekly pace (the number the person typed in Goals).
  const rate = profile.weeklyRateKg > 0 ? `, about ${rateWords(profile.weeklyRateKg, imperial)} a week` : '';
  if (profile.goal === 'lose') lines.push(`Goal: lose weight${rate}.`);
  else if (profile.goal === 'gain') lines.push(`Goal: gain weight${rate}.`);
  else lines.push('Goal: keep weight steady.');

  // Food: the 7 days before today, then today.
  const days = computeDays(8, today, profile, food, allWeights, allActivities, water, live(state.days));
  const before = days.slice(0, 7);
  const now = days[7];
  const logged = before.filter((d) => hasFoodLogged(d.entries));
  if (logged.length) {
    const avg = (f: (d: (typeof logged)[number]) => number) => Math.round(logged.reduce((s, d) => s + f(d), 0) / logged.length);
    const kcal = formatNumber(avg((d) => d.eaten.kcal));
    const daysWord = `logged on ${plural(logged.length, 'day', 'days')}`;
    // Protein only as a share of its goal: the goal is the body weight times a fixed factor.
    const proteinTarget = logged.reduce((s, d) => s + d.macros.proteinG, 0);
    const protein = proteinTarget > 0 ? `; protein at about ${share(logged.reduce((s, d) => s + d.eaten.protein, 0), proteinTarget)} of its goal on average` : '';
    lines.push(
      targets
        ? `Food, the 7 days before today: ${daysWord}; on those days about ${kcal} kcal a day against an average budget of ${formatNumber(avg((d) => d.budget))} kcal${protein}.`
        : `Food, the 7 days before today: ${daysWord}; on those days about ${kcal} kcal a day.`,
    );
  }
  const eatenToday = Math.round(now.eaten.kcal);
  if (hasFoodLogged(now.entries) || eatenToday > 0) {
    const left = now.remaining >= 0 ? `${formatNumber(now.remaining)} kcal left in the budget` : `${formatNumber(-now.remaining)} kcal above the budget`;
    lines.push(targets ? `Today so far: ${formatNumber(eatenToday)} kcal eaten, ${left}.` : `Today so far: ${formatNumber(eatenToday)} kcal eaten.`);
  } else if (targets) lines.push(`Today so far: nothing logged; the budget is ${formatNumber(now.budget)} kcal.`);

  // Training: the overview of the last 7 days from every workout the phone holds (on iPhone, without Apple Health's).
  const recent = activities.filter((a) => a.date <= today && a.date >= addDays(today, -27));
  if (recent.length) {
    const o = trainingOverview(activities, today);
    const last7 = activities.filter((a) => a.date <= today && a.date >= o.from);
    const kinds = new Map<string, number>();
    for (const a of last7) if (ACTIVITY_BY_ID[a.activityId]) kinds.set(a.activityId, (kinds.get(a.activityId) ?? 0) + 1);
    const top = [...kinds.entries()]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 3)
      .map(([id, n]) => `${ACTIVITY_BY_ID[id].name.toLowerCase()} ${n}`);
    const head = last7.length
      ? `Training, last 7 days: ${plural(o.minutes, 'active minute', 'active minutes')} in ${plural(last7.length, 'session', 'sessions')}${top.length ? ` (${top.join(', ')})` : ''}.`
      : 'Training, last 7 days: no sessions.';
    const rest = o.counts.restDays === 0 ? 'A session on each day.' : `${plural(o.counts.restDays, 'day', 'days')} without a session.`;
    lines.push([head, o.title ? `Overview: ${o.title}.` : '', last7.length ? rest : ''].filter(Boolean).join(' '));
  }

  // Sleep: the last 7 nights (by the day of waking), when 4 or more were recorded.
  const nights = sleep.filter((s) => s.date <= today && s.date > addDays(today, -7) && s.hours > 0);
  const byDay = new Map<string, number>();
  for (const s of nights) byDay.set(s.date, Math.max(byDay.get(s.date) ?? 0, s.hours));
  if (byDay.size >= MIN_NIGHTS) {
    const avg = [...byDay.values()].reduce((a, b) => a + b, 0) / byDay.size;
    lines.push(`Sleep: about ${hoursWords(avg)} a night on average, ${byDay.size} of the last 7 nights recorded.`);
  }

  // The weight trend: a direction and a rate a week, never the weight itself.
  const trend = weightTrend(weights.filter((w) => w.date <= today).map((w) => ({ date: w.date, kg: w.kg })));
  const wRate = weeklyRate(trend, 21, today);
  if (wRate !== null) {
    if (Math.abs(wRate) < 0.05) lines.push('Weight trend: steady over the last 3 weeks.');
    else lines.push(`Weight trend: going ${wRate < 0 ? 'down' : 'up'}, about ${rateWords(Math.abs(wRate), imperial)} a week.`);
  }

  // Water: the days of the 7 before today with water tracked, only as a share of the goal (33 ml a kg).
  const tracked = before.filter((d) => hasWaterTracked(d.waterEntries));
  if (tracked.length) {
    const goal = tracked.reduce((s, d) => s + d.waterGoalMl, 0);
    const head = `Water, the 7 days before today: tracked on ${plural(tracked.length, 'day', 'days')}`;
    lines.push(
      targets && goal > 0
        ? `${head}; on those days water at about ${share(tracked.reduce((s, d) => s + d.waterMl, 0), goal)} of its goal on average.`
        : `${head}.`,
    );
  }

  // At most 900 characters: a line that would pass it is left out (the order above is the priority).
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const add = line.length + (kept.length ? 1 : 0);
    if (length + add > NOTE_MAX) continue;
    kept.push(line);
    length += add;
  }
  return { text: kept.join('\n'), lines: kept, appleNote };
}

/** The note as sent with a question while "Share my week" is on ('' when there is nothing to share). */
export function buildCoachNote(state: NoteState, today: ISODate, os: string = Platform.OS): string {
  return coachNote(state, today, os).text;
}
