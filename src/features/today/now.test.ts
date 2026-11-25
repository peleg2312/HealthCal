import { describe, expect, it } from 'vitest';

import type { DaySummary } from '@/store/selectors';
import type { FoodEntry, MealType } from '@/types';

import { coachTip, DEFAULT_RHYTHM, isLateEvening, type CoachTip } from './coach';
import { NOW_WORDS, nowPlan, repeatFoodsLine, repeatSpoken, repeatTitle, type NowInput } from './now';

const tip = (patch: Partial<CoachTip> = {}): CoachTip => ({ id: 'on-track', emoji: '', title: 'On track', body: 'Within budget so far, with water still to go.', tone: 'positive', ...patch });

const input = (patch: Partial<NowInput> = {}): NowInput => ({
  tip: tip(),
  mealNow: 'dinner',
  late: false,
  foodLogged: true,
  over: false,
  logged: new Set<MealType>(['breakfast', 'lunch', 'snack']),
  repeatable: new Set<MealType>(['breakfast', 'lunch', 'dinner', 'snack']),
  weighed: true,
  targets: "Today's budget: 2,160 kcal and 152 g of protein.",
  ...patch,
});

const kinds = (p: ReturnType<typeof nowPlan>) => p.actions.map((a) => (a.kind === 'repeat' ? `repeat:${a.meal}` : a.kind === 'fits' ? `fits${a.proteinFirst ? ':protein' : ''}` : a.kind === 'link' ? `link:${a.label}` : a.kind));

describe('nowPlan', () => {
  it('evening, dinner not logged: the coach asks, Repeat and What fits, the meal tagged now', () => {
    const p = nowPlan(input({ tip: tip({ id: 'meal-dinner', title: 'Had dinner yet?', body: "It is not in today's log.", action: { label: 'Log dinner', href: '/food/search?meal=dinner' }, quick: { kind: 'repeat', meal: 'dinner' } }) }));
    expect(p.heading).toBe('Dinner · now');
    expect(p.headingShort).toBe('Dinner');
    expect(p.meal).toBe('dinner');
    expect(p.title).toBe('Had dinner yet?');
    expect(p.body).toBe("It is not in today's log.");
    // The tip's own "Log dinner" opens food search: the meal row's "+" and the tab bar's + do that, so it is left out.
    expect(kinds(p)).toEqual(['repeat:dinner', 'fits']);
  });

  it('morning with nothing logged: the budget line, Repeat breakfast; Weigh in while there is nothing to repeat and no weigh-in', () => {
    const t = tip({ id: 'start', title: 'Nothing logged yet today', body: 'Logging the first thing takes a few seconds.', action: { label: 'Log food', href: '/food/search?meal=breakfast' }, quick: { kind: 'repeat', meal: 'breakfast' } });
    const p = nowPlan(input({ tip: t, mealNow: 'breakfast', foodLogged: false, logged: new Set(), weighed: false }));
    expect(p.heading).toBe('Breakfast · now');
    expect(p.title).toBe("Today's budget: 2,160 kcal and 152 g of protein.");
    expect(p.body).toBe('');
    // Logging speed first: Repeat leads, and What fits keeps its place.
    expect(kinds(p)).toEqual(['repeat:breakfast', 'fits']);
    expect(kinds(nowPlan(input({ tip: t, mealNow: 'breakfast', foodLogged: false, logged: new Set(), repeatable: new Set(), weighed: false })))).toEqual(['weigh', 'fits']);
    expect(kinds(nowPlan(input({ mealNow: 'breakfast', logged: new Set(['breakfast']), weighed: false })))).toEqual(['weigh', 'fits']);
    expect(kinds(nowPlan(input({ mealNow: 'breakfast', logged: new Set(['breakfast']), weighed: true })))).toEqual(['fits']);
  });

  it('a morning after a day closed within budget keeps the coach\'s own line', () => {
    const t = tip({ id: 'closed', title: 'Yesterday closed within budget', body: '2,050 of 2,160 kcal.', quick: { kind: 'repeat', meal: 'breakfast' } });
    const p = nowPlan(input({ tip: t, mealNow: 'breakfast', foodLogged: false, logged: new Set() }));
    expect(p.title).toBe('Yesterday closed within budget.');
    expect(p.body).toBe('2,050 of 2,160 kcal.');
  });

  it('midday: the meal of the hour is repeated while it is empty, even before the coach asks', () => {
    const p = nowPlan(input({ mealNow: 'lunch', logged: new Set(['breakfast']) }));
    expect(p.heading).toBe('Lunch · now');
    expect(kinds(p)).toEqual(['repeat:lunch', 'fits']);
    // Nothing to repeat, or the meal logged: What fits alone.
    expect(kinds(nowPlan(input({ mealNow: 'lunch', logged: new Set(['breakfast']), repeatable: new Set() })))).toEqual(['fits']);
    expect(kinds(nowPlan(input({ mealNow: 'lunch', logged: new Set(['breakfast', 'lunch']) })))).toEqual(['fits']);
  });

  it('protein behind: What fits, protein first, once', () => {
    const t = tip({ id: 'protein', title: '77 g of protein to go', body: 'A few of your own foods would close most of it.', action: { label: 'See what fits', href: '/food/search?meal=dinner' }, quick: { kind: 'fits' } });
    const p = nowPlan(input({ tip: t, mealNow: 'snack', logged: new Set(['breakfast', 'lunch', 'snack']) }));
    expect(p.title).toBe('77 g of protein to go.');
    expect(kinds(p)).toEqual(['fits:protein']);
  });

  it('late evening with dinner logged: the wrap-up, Share the day and What fits', () => {
    const p = nowPlan(input({ late: true, mealNow: 'snack', logged: new Set(['breakfast', 'lunch', 'dinner']) }));
    expect(p.heading).toBe('Your day · wrap-up');
    // Under 360 px, beside "Ask the coach", it keeps one line.
    expect(p.headingShort).toBe('Your day');
    expect(p.meal).toBeNull();
    expect(kinds(p)).toEqual(['share', 'fits']);
  });

  it('late evening with dinner still empty: the coach\'s Repeat leads, before the share', () => {
    const t = tip({ id: 'meal-dinner', title: 'Had dinner yet?', body: "It is not in today's log.", quick: { kind: 'repeat', meal: 'dinner' } });
    const p = nowPlan(input({ tip: t, late: true, mealNow: 'snack' }));
    expect(p.heading).toBe('Dinner · now');
    expect(kinds(p)).toEqual(['repeat:dinner', 'fits']);
  });

  it('above the budget What fits stays, beside the tip\'s own action or the hour\'s', () => {
    const t = tip({ id: 'over', title: "Above today's budget", body: 'One day does not move the trend much.', action: { label: 'See your week', href: '/progress' } });
    const p = nowPlan(input({ tip: t, over: true, logged: new Set(['breakfast', 'lunch', 'dinner']) }));
    expect(p.heading).toBe('Your day');
    expect(kinds(p)).toEqual(['link:See your week', 'fits']);
    expect(kinds(nowPlan(input({ tip: t, over: true, late: true, logged: new Set(['breakfast', 'lunch', 'dinner']) })))).toEqual(['share', 'fits']);
    expect(kinds(nowPlan(input({ tip: t, over: true })))).toEqual(['repeat:dinner', 'fits']);
    // Just above, where the coach still says "On track": What fits all the same.
    expect(kinds(nowPlan(input({ over: true, logged: new Set(['breakfast', 'lunch', 'dinner']) })))).toEqual(['fits']);
  });

  it("a tip that leads elsewhere keeps its action (Log activity)", () => {
    const t = tip({ id: 'move', title: 'No activity logged today', body: 'A brisk 20 minute walk counts toward the week.', action: { label: 'Log activity', href: '/activity/pick' } });
    expect(kinds(nowPlan(input({ tip: t, logged: new Set(['breakfast', 'lunch', 'dinner']) })))).toEqual(['link:Log activity', 'fits']);
  });

  it('never more than two actions, never one twice, What fits always last', () => {
    const t = tip({ id: 'move', title: 'No activity logged today', body: '', action: { label: 'Log activity', href: '/activity/pick' }, quick: { kind: 'repeat', meal: 'breakfast' } });
    for (const late of [false, true])
      for (const over of [false, true])
        for (const mealNow of ['breakfast', 'lunch', 'dinner', 'snack'] as const)
          for (const weighed of [false, true]) {
            const p = nowPlan(input({ tip: t, late, over, mealNow, weighed, logged: new Set() }));
            expect(p.actions.length).toBeGreaterThan(0);
            expect(p.actions.length).toBeLessThanOrEqual(2);
            expect(new Set(p.actions.map((a) => a.kind)).size).toBe(p.actions.length);
            expect(p.actions[p.actions.length - 1].kind).toBe('fits');
          }
  });
});

describe('isLateEvening', () => {
  it('from 90 minutes after the usual dinner time', () => {
    expect(isLateEvening(new Date(2026, 2, 10, 20, 15))).toBe(false);
    expect(isLateEvening(new Date(2026, 2, 10, 20, 45))).toBe(true);
    expect(isLateEvening(new Date(2026, 2, 10, 23, 30))).toBe(true);
    expect(isLateEvening(new Date(2026, 2, 10, 8, 10))).toBe(false);
    expect(isLateEvening(new Date(2026, 2, 10, 21, 0), { ...DEFAULT_RHYTHM, meals: { ...DEFAULT_RHYTHM.meals, dinner: '20:00' } })).toBe(false);
  });
});

describe('coachTip without the water tip', () => {
  const e = (meal: FoodEntry['meal']) => ({ id: meal, meal, name: meal, nutrients: { kcal: 400, protein: 40, carbs: 40, fat: 10 } }) as FoodEntry;
  const day = (): DaySummary => {
    const entries = [e('breakfast'), e('lunch')];
    return {
      date: '2026-03-10',
      entries,
      byMeal: { breakfast: [entries[0]], lunch: [entries[1]], dinner: [], snack: [] },
      eaten: { kcal: 800, protein: 80, carbs: 80, fat: 20 },
      activities: [],
      exerciseNet: 0,
      exerciseGross: 0,
      activeMinutes: 0,
      target: 2000,
      budget: 2000,
      exerciseRule: 'day',
      exerciseAdded: 0,
      exerciseCarry: 0,
      remaining: 1200,
      macros: { proteinG: 150, carbsG: 200, fatG: 60, fiberG: 28, split: { protein: 0.3, carbs: 0.4, fat: 0.3 } },
      waterEntries: [],
      waterMl: 0,
      waterGoalMl: 2600,
      waterRemainingMl: 2600,
    } as DaySummary;
  };
  it('the glass is right above the card: the water tip gives way to the next one', () => {
    const at = new Date(2026, 2, 10, 16, 0);
    expect(coachTip(day(), 'metric', at).id).toBe('water');
    expect(coachTip(day(), 'metric', at, DEFAULT_RHYTHM, null, { water: false }).id).not.toBe('water');
  });
});

describe('the words', () => {
  const BANNED = /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
  it('hold the morning page\'s banned list, with no exclamation mark', () => {
    const words = [...Object.values(NOW_WORDS), repeatTitle('744'), repeatSpoken('744', 'yesterday', 'dinner'), repeatFoodsLine('yesterday', ['Pasta', 'Chicken breast'])];
    for (const p of [nowPlan(input()), nowPlan(input({ late: true })), nowPlan(input({ over: true }))]) words.push(p.heading, p.title, p.body);
    expect(words.filter((w) => BANNED.test(w) || w.includes('!'))).toEqual([]);
  });
  it('Repeat says its calories, and its name starts with its words', () => {
    expect(repeatTitle('744')).toBe('Repeat · 744 kcal');
    expect(repeatSpoken('744', 'yesterday', 'dinner')).toBe("Repeat, 744 kcal: yesterday's dinner");
    // Label in name: the drawn words, unit included, are whole words of the name, in order.
    const words = (s: string) => ` ${s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
    expect(words(repeatSpoken('1,170', 'Nov 22', 'lunch'))).toContain(words(repeatTitle('1,170')));
    expect(repeatFoodsLine('yesterday', ['Pasta', 'Chicken breast'])).toBe('Yesterday: Pasta, Chicken breast');
    expect(repeatFoodsLine('Nov 22', ['Banana'])).toBe('Nov 22: Banana');
  });
});
