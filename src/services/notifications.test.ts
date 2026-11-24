import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { addDays, toISODate } from '@/lib/dates';
import { netKcal } from '@/lib/exercise';
import {
  checkInBody,
  dayOnTrack,
  inQuietHours,
  MAX_PER_DAY,
  MIN_GAP_MINUTES,
  planReminders,
  mealRepeat,
  mealRepeatCategory,
  parseReminderAction,
  repeatableMeals,
  reminderTimeLabel,
  snoozeTime,
  walkNetKcal,
  waterActionAmounts,
  waterCategory,
  WEIGHIN_CATEGORY,
  type PlannerDay,
  type PlannerInput,
} from '@/features/settings/reminderPlanner';
import type { DaySummary } from '@/store/selectors';
import type { FoodEntry, MealType, ReminderSettings } from '@/types';

const BASE: ReminderSettings = {
  enabled: true,
  quietStart: '22:00',
  quietEnd: '07:30',
  water: { enabled: true, everyMinutes: 120 },
  meals: { enabled: true, breakfast: '08:30', lunch: '13:00', dinner: '19:30' },
  dailySummary: { enabled: true, time: '20:30' },
  weighIn: { enabled: false, time: '07:45', weekdays: [1, 4] },
  movement: { enabled: false, time: '17:30' },
};

function reminders(patch: Partial<ReminderSettings> = {}): ReminderSettings {
  return { ...BASE, ...patch };
}

function entry(meal: MealType, kcal = 500, protein = 30): FoodEntry {
  return {
    id: `${meal}-1`,
    updatedAt: '',
    date: '',
    meal,
    name: 'x',
    source: 'builtin',
    verified: true,
    servingLabel: '1',
    quantity: 1,
    grams: 100,
    nutrients: { kcal, protein, carbs: 0, fat: 0 },
    loggedAt: '',
  };
}

function day(date: string, opts: { meals?: MealType[]; eaten?: number; protein?: number; waterMl?: number; activities?: number } = {}): DaySummary {
  const byMeal: Record<MealType, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const m of opts.meals ?? []) byMeal[m].push(entry(m));
  const eatenKcal = opts.eaten ?? 0;
  const waterGoalMl = 2500;
  const waterMl = opts.waterMl ?? 0;
  return {
    date,
    entries: Object.values(byMeal).flat(),
    byMeal,
    eaten: { kcal: eatenKcal, protein: opts.protein ?? 0, carbs: 0, fat: 0 },
    activities: Array.from({ length: opts.activities ?? 0 }, () => ({}) as DaySummary['activities'][number]),
    exerciseNet: 0,
    exerciseGross: 0,
    activeMinutes: 0,
    target: 2100,
    budget: 2100,
    exerciseRule: 'day',
    exerciseAdded: 0,
    exerciseCarry: 0,
    remaining: 2100 - eatenKcal,
    macros: { proteinG: 150, carbsG: 200, fatG: 70, fiberG: 30, split: { protein: 0.3, carbs: 0.4, fat: 0.3 } },
    waterEntries: [],
    waterMl,
    waterGoalMl,
    waterRemainingMl: Math.max(0, waterGoalMl - waterMl),
  };
}

const d = (s: DaySummary, weighed = false): PlannerDay => ({ summary: s, weighed });

/** Wednesday 13 Nov 2026 at the given local time. */
function at(h: number, m = 0, date = '2026-11-11'): Date {
  const [y, mo, dd] = date.split('-').map(Number);
  return new Date(y, mo - 1, dd, h, m, 0, 0);
}

function input(now: Date, patch: Partial<PlannerInput> = {}, today?: DaySummary): PlannerInput {
  const key = toISODate(now);
  return {
    reminders: reminders(),
    units: 'metric',
    today: d(today ?? day(key)),
    tomorrow: d(day(addDays(key, 1))),
    weightKg: 80,
    ...patch,
  };
}

const minutesOf = (x: Date) => x.getHours() * 60 + x.getMinutes();

describe('inQuietHours', () => {
  it('handles a window that crosses midnight', () => {
    expect(inQuietHours(23 * 60, '22:00', '07:30')).toBe(true);
    expect(inQuietHours(0, '22:00', '07:30')).toBe(true);
    expect(inQuietHours(7 * 60 + 29, '22:00', '07:30')).toBe(true);
    expect(inQuietHours(7 * 60 + 30, '22:00', '07:30')).toBe(false);
    expect(inQuietHours(21 * 60 + 59, '22:00', '07:30')).toBe(false);
  });
  it('handles a same-day window and an empty window', () => {
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
    expect(inQuietHours(15 * 60, '12:00', '14:00')).toBe(false);
    expect(inQuietHours(3 * 60, '00:00', '00:00')).toBe(false);
  });
});

describe('planReminders', () => {
  it('plans nothing when reminders are off or before onboarding', () => {
    const now = at(6);
    expect(planReminders(input(now, { reminders: reminders({ enabled: false }) }), now)).toEqual([]);
    expect(planReminders(input(now, { today: null }), now)).toEqual([]);
  });

  it('never plans anything in the past', () => {
    const now = at(14, 10);
    const plan = planReminders(input(now), now);
    expect(plan.length).toBeGreaterThan(0);
    for (const r of plan) expect(r.at.getTime()).toBeGreaterThan(now.getTime());
    expect(plan.some((r) => r.id.startsWith('meal-breakfast-2026-11-11'))).toBe(false);
  });

  it('keeps every reminder out of quiet hours that cross midnight', () => {
    const now = at(6);
    const plan = planReminders(
      input(now, {
        reminders: reminders({
          quietStart: '21:00',
          quietEnd: '09:00',
          water: { enabled: true, everyMinutes: 60 },
          meals: { enabled: true, breakfast: '08:00', lunch: '13:00', dinner: '20:30' },
          dailySummary: { enabled: true, time: '23:00' },
        }),
      }),
      now,
    );
    for (const r of plan) expect(inQuietHours(minutesOf(r.at), '21:00', '09:00')).toBe(false);
    expect(plan.find((r) => r.kind === 'checkin')).toBeUndefined();
    expect(plan.find((r) => r.id.startsWith('meal-breakfast'))).toBeUndefined();
  });

  it('skips water once the goal is met and states what is left otherwise', () => {
    const now = at(6);
    const met = planReminders(input(now, {}, day('2026-11-11', { waterMl: 2600 })), now);
    expect(met.filter((r) => r.kind === 'water' && r.at.getDate() === 11)).toEqual([]);

    const partial = planReminders(input(now, {}, day('2026-11-11', { waterMl: 1880 })), now);
    const water = partial.find((r) => r.kind === 'water');
    expect(water?.body).toBe('620 ml to go today, about 3 glasses.');
  });

  it('skips a meal that already has food logged and mentions calories left', () => {
    const now = at(6);
    const plan = planReminders(input(now, {}, day('2026-11-11', { meals: ['breakfast'], eaten: 450 })), now);
    expect(plan.find((r) => r.id === 'meal-breakfast-2026-11-11')).toBeUndefined();
    const lunch = plan.find((r) => r.id === 'meal-lunch-2026-11-11');
    expect(lunch?.body).toBe('Nothing logged for lunch yet. 1,650 kcal left for today.');
    expect(lunch?.at.getHours()).toBe(13);
  });

  it('states being over budget neutrally', () => {
    const now = at(15);
    const plan = planReminders(input(now, {}, day('2026-11-11', { meals: ['breakfast', 'lunch'], eaten: 2220 })), now);
    const dinner = plan.find((r) => r.id === 'meal-dinner-2026-11-11');
    expect(dinner?.body).toBe('Nothing logged for dinner yet. Today is 120 kcal above the budget so far.');
    const check = plan.find((r) => r.kind === 'checkin');
    expect(check?.body.startsWith('120 kcal above today\'s budget')).toBe(true);
    for (const r of plan) expect(r.body).not.toMatch(/fail|cheat|bad|!/i);
  });

  it('writes a short positive check-in when everything is on track', () => {
    const s = day('2026-11-11', { meals: ['breakfast', 'lunch', 'dinner'], eaten: 1900, protein: 150, waterMl: 2500 });
    expect(checkInBody(s, 'metric')).toBe('Everything is logged and on track today: 200 kcal left, protein and water goals met.');
    const partial = day('2026-11-11', { meals: ['breakfast'], eaten: 900, protein: 60, waterMl: 1000 });
    expect(checkInBody(partial, 'metric')).toBe('1,200 kcal left, 90 g protein to go, 1.5 L water to go. Not logged yet: lunch, dinner.');
  });

  it('keeps at least 45 minutes between reminders and prefers the more important one', () => {
    const now = at(6);
    const plan = planReminders(
      input(now, {
        reminders: reminders({
          water: { enabled: true, everyMinutes: 60 },
          meals: { enabled: true, breakfast: '08:30', lunch: '12:45', dinner: '19:30' },
        }),
      }),
      now,
    );
    const times = plan.map((r) => r.at.getTime());
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(MIN_GAP_MINUTES * 60_000);
    // Water at 12:30 is dropped in favour of lunch at 12:45.
    expect(plan.find((r) => r.id === 'meal-lunch-2026-11-11')).toBeDefined();
    expect(plan.find((r) => r.id === `water-${12 * 60 + 30}-2026-11-11`)).toBeUndefined();
  });

  it('caps the number of reminders per day', () => {
    const now = at(6);
    const plan = planReminders(
      input(now, {
        reminders: reminders({
          quietStart: '23:59',
          quietEnd: '00:00',
          water: { enabled: true, everyMinutes: 60 },
          movement: { enabled: true, time: '17:30' },
          weighIn: { enabled: true, time: '07:00', weekdays: [0, 1, 2, 3, 4, 5, 6] },
        }),
      }),
      now,
    );
    const todayOnes = plan.filter((r) => toISODate(r.at) === '2026-11-11');
    expect(todayOnes.length).toBe(MAX_PER_DAY);
    // The highest-priority kinds survive the cap.
    expect(todayOnes.some((r) => r.kind === 'checkin')).toBe(true);
    expect(todayOnes.filter((r) => r.kind === 'meal').length).toBe(3);
  });

  it('plans tomorrow morning only, with tomorrow numbers', () => {
    const now = at(21, 30);
    const plan = planReminders(input(now), now);
    const tomorrow = plan.filter((r) => toISODate(r.at) === '2026-11-12');
    expect(tomorrow.length).toBeGreaterThan(0);
    for (const r of tomorrow) expect(r.at.getHours()).toBeLessThan(12);
    expect(tomorrow.find((r) => r.id === 'meal-breakfast-2026-11-12')?.body).toBe('Nothing logged for breakfast yet. 2,100 kcal left for today.');
    expect(reminderTimeLabel(tomorrow[0].at, now)).toMatch(/^Tomorrow \d\d:\d\d$/);
  });

  it('uses imperial units for water', () => {
    const now = at(6);
    const plan = planReminders(input(now, { units: 'imperial' }, day('2026-11-11', { waterMl: 1880 })), now);
    expect(plan.find((r) => r.kind === 'water')?.body).toBe('21 fl oz to go today, about 3 glasses.');
  });

  it('weigh-in only on chosen weekdays and only when not weighed yet', () => {
    const r = reminders({ weighIn: { enabled: true, time: '07:45', weekdays: [3] } }); // Wednesday
    const now = at(6); // Wed 11 Nov 2026
    const plan = planReminders(input(now, { reminders: r }), now);
    expect(plan.find((x) => x.kind === 'weighin')?.at.getHours()).toBe(7);
    const weighed = planReminders(input(now, { reminders: r, today: d(day('2026-11-11'), true) }), now);
    expect(weighed.find((x) => x.kind === 'weighin')).toBeUndefined();
    const otherDay = planReminders(input(now, { reminders: reminders({ weighIn: { enabled: true, time: '07:45', weekdays: [1] } }) }), now);
    expect(otherDay.find((x) => x.kind === 'weighin')).toBeUndefined();
  });

  it('movement only when no activity is logged', () => {
    const r = reminders({ movement: { enabled: true, time: '17:00' } });
    const now = at(6);
    const plan = planReminders(input(now, { reminders: r, baselineKcalPerDay: 2400 }), now);
    // Same number the logger gives for Walking, moderate (3.8 MET), 20 min, 80 kg, 2,400 kcal baseline: 106.4 - 33.3 = 73 -> 75.
    expect(plan.find((x) => x.kind === 'movement')?.body).toBe(
      'No activity logged today. A 20 minute walk at a moderate pace adds about 75 kcal to your budget.',
    );
    const logged = netKcal(ACTIVITY_BY_ID.walking.met.moderate, 80, 20, 2400);
    expect(Math.abs(walkNetKcal(80, 2400)! - logged)).toBeLessThanOrEqual(2.5);
    const noBaseline = planReminders(input(now, { reminders: r }), now);
    expect(noBaseline.find((x) => x.kind === 'movement')?.body).toBe('No activity logged today. A short walk now still counts.');
    const active = planReminders(input(now, { reminders: r }, day('2026-11-11', { activities: 1 })), now);
    expect(active.find((x) => x.kind === 'movement')).toBeUndefined();
  });
});

describe('time zones are local', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.TZ;
  });
  afterEach(() => {
    process.env.TZ = saved;
  });

  for (const tz of ['America/Los_Angeles', 'Asia/Tokyo', 'Asia/Jerusalem', 'Pacific/Kiritimati']) {
    it(`schedules at the configured wall-clock time in ${tz}`, () => {
      process.env.TZ = tz;
      const now = at(6);
      const plan = planReminders(input(now), now);
      const lunch = plan.find((r) => r.id === 'meal-lunch-2026-11-11');
      expect(lunch?.at.getHours()).toBe(13);
      expect(lunch?.at.getMinutes()).toBe(0);
      expect(toISODate(lunch!.at)).toBe('2026-11-11');
      const check = plan.find((r) => r.kind === 'checkin');
      expect(check && minutesOf(check.at)).toBe(20 * 60 + 30);
    });
  }

  it('keeps wall-clock times across a daylight saving change', () => {
    process.env.TZ = 'America/New_York';
    // DST ends on Sunday 1 Nov 2026 at 02:00.
    const now = new Date(2026, 9, 31, 21, 30);
    const key = toISODate(now);
    const plan = planReminders({ ...input(now), today: d(day(key)), tomorrow: d(day(addDays(key, 1))) }, now);
    const breakfast = plan.find((r) => r.id === 'meal-breakfast-2026-11-01');
    expect(breakfast?.at.getHours()).toBe(8);
    expect(breakfast?.at.getMinutes()).toBe(30);
  });
});

describe('reminder links and actions', () => {
  it('a meal reminder opens food search for its own meal and day', () => {
    const now = at(6);
    const plan = planReminders(input(now), now);
    const lunch = plan.find((r) => r.id === 'meal-lunch-2026-11-11');
    expect(lunch?.url).toBe('/food/search?meal=lunch&date=2026-11-11');
    expect(lunch?.data).toEqual({ date: '2026-11-11', meal: 'lunch' });
    const tomorrowBreakfast = plan.find((r) => r.id === 'meal-breakfast-2026-11-12');
    expect(tomorrowBreakfast?.url).toBe('/food/search?meal=breakfast&date=2026-11-12');
    expect(plan.find((r) => r.kind === 'water')?.url).toBe('/water');
  });

  it('water reminders carry the first two presets as buttons, in the user units', () => {
    const now = at(6);
    const plan = planReminders(input(now, { waterPresetsMl: [330, 500, 750] }), now);
    const water = plan.find((r) => r.kind === 'water');
    expect(water?.category?.actions.map((a) => a.buttonTitle)).toEqual(['+330 ml', '+500 ml']);
    expect(water?.category?.actions.map((a) => a.identifier)).toEqual(['water-add-330', 'water-add-500']);
    expect(waterCategory([237, 473], 'imperial').actions.map((a) => a.buttonTitle)).toEqual(['+8 fl oz', '+16 fl oz']);
    expect(waterCategory([250, 500], 'metric').identifier).not.toBe(waterCategory([250, 500], 'imperial').identifier);
    expect(waterActionAmounts(undefined)).toEqual([250, 500]);
    expect(waterActionAmounts([250, 250, 5])).toEqual([250]);
  });

  it('a drink from Water never cancels a meal reminder nor counts as a logged meal in the check-in', () => {
    const now = at(6);
    const latte = { ...entry('breakfast', 139, 7), id: 'latte', via: 'water' as const };
    const s = day('2026-11-11', { meals: ['lunch', 'dinner'], eaten: 1900, protein: 150, waterMl: 2500 });
    s.byMeal.breakfast.push(latte);
    s.entries.push(latte);
    const plan = planReminders(input(now, {}, s), now);
    expect(plan.find((r) => r.id === 'meal-breakfast-2026-11-11')).toBeDefined();
    expect(dayOnTrack(s)).toBe(false);
    expect(checkInBody(s, 'metric')).toMatch(/Not logged yet: breakfast\.$/);
  });

  it('"Repeat yesterday\'s" never copies a drink from Water, is not offered for drinks alone, and is not refused by one', () => {
    const at2 = (date: string, meal: MealType, id: string, via?: 'water') => ({ ...entry(meal), id, date, ...(via ? { via } : null) });
    const y = '2026-11-10';
    const t = '2026-11-11';
    const onlyDrink = [at2(y, 'breakfast', 'y-latte', 'water')];
    expect(repeatableMeals(onlyDrink, t)).toEqual([]);
    expect(mealRepeat(onlyDrink, t, 'breakfast').items).toEqual([]);
    const both = [...onlyDrink, at2(y, 'breakfast', 'y-oats'), at2(t, 'breakfast', 't-latte', 'water')];
    expect(repeatableMeals(both, t)).toEqual(['breakfast']);
    const r = mealRepeat(both, t, 'breakfast');
    expect(r.items.map((e) => e.id)).toEqual(['y-oats']);
    expect(r.already).toBe(false);
    expect(mealRepeat([...both, at2(t, 'breakfast', 't-oats')], t, 'breakfast').already).toBe(true);
  });

  it('offers to repeat a meal only when the day before had it', () => {
    const now = at(6);
    const today: PlannerDay = { summary: day('2026-11-11'), weighed: false, previousDayMeals: ['lunch'] };
    const plan = planReminders({ ...input(now), today }, now);
    expect(plan.find((r) => r.id === 'meal-lunch-2026-11-11')?.category).toEqual(mealRepeatCategory('lunch'));
    expect(plan.find((r) => r.id === 'meal-dinner-2026-11-11')?.category).toBeUndefined();
    expect(mealRepeatCategory('lunch').actions[0].buttonTitle).toBe("Repeat yesterday's lunch");
  });

  it('a weigh-in offers "Later today" only when the snooze lands before quiet hours', () => {
    const now = at(6);
    const r = reminders({ weighIn: { enabled: true, time: '07:45', weekdays: [3] } });
    const plan = planReminders(input(now, { reminders: r }), now);
    expect(plan.find((x) => x.kind === 'weighin')?.category).toEqual(WEIGHIN_CATEGORY);
    const late = reminders({ weighIn: { enabled: true, time: '20:30', weekdays: [3] }, dailySummary: { enabled: false, time: '20:30' } });
    const latePlan = planReminders(input(now, { reminders: late }), now);
    expect(latePlan.find((x) => x.kind === 'weighin')).toBeDefined();
    expect(latePlan.find((x) => x.kind === 'weighin')?.category).toBeUndefined();
  });

  it('parses action buttons and rejects anything unexpected', () => {
    expect(parseReminderAction('water-add-250', {})).toEqual({ type: 'water', ml: 250 });
    expect(parseReminderAction('water-add-9999', {})).toBeNull();
    expect(parseReminderAction('water-add-abc', {})).toBeNull();
    expect(parseReminderAction('repeat-meal', { meal: 'lunch', date: '2026-11-11' })).toEqual({ type: 'repeat-meal', meal: 'lunch', date: '2026-11-11' });
    expect(parseReminderAction('repeat-meal', { meal: 'snack', date: '2026-11-11' })).toBeNull();
    expect(parseReminderAction('repeat-meal', { meal: 'lunch' })).toBeNull();
    expect(parseReminderAction('snooze', {})).toEqual({ type: 'snooze' });
    expect(parseReminderAction('expo.modules.notifications.actions.DEFAULT', {})).toBeNull();
  });

  it('snoozes two hours unless that is in quiet hours or tomorrow', () => {
    expect(snoozeTime(at(8), '22:00', '07:30')?.getHours()).toBe(10);
    expect(snoozeTime(at(20, 30), '22:00', '07:30')).toBeNull();
    expect(snoozeTime(at(23), '00:00', '00:00')).toBeNull();
  });
});
