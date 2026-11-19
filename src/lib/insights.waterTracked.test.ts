/**
 * "Water tracked" means water logged as water: a person who never logs on the Water screen and logs a
 * latte in the diary every day sees exactly what they saw before on Progress (the hydration insight,
 * the habits card's water, the milestones, the logging calendar's water mark), the morning page and the
 * share card; only the water total itself includes the latte (`hasWaterTracked`, @/features/drinks/via).
 * One test per caller.
 */
import { describe, expect, it, vi } from 'vitest';

// The two hooks are read with React's memo run in place and the store's hooks stubbed per test.
vi.mock('react', () => ({ useMemo: (f: () => unknown) => f() }));
const hooks = vi.hoisted(() => ({ day: null as unknown, days: [] as unknown[], water: [] as unknown[] }));
vi.mock('@/store/clock', () => ({ useToday: () => '2026-11-19' }));
vi.mock('@/store', () => ({ useStore: (sel: (s: unknown) => unknown) => sel({ settings: { rhythmTargets: undefined } }) }));
vi.mock('@/store/selectors', () => ({
  useProfile: () => ({ units: 'metric' }),
  useDay: () => hooks.day,
  useDays: () => hooks.days,
  useConsistency: () => ({ streak: 3 }),
  useLive: (c: string) => (c === 'water' ? hooks.water : []),
  foodLoggedDates: () => new Set<string>(),
}));

import { dayFacts, isNothing } from '@/features/morning/facts';
import { useConsistencyData } from '@/features/progress/useConsistencyData';
import { useShareDayInput } from '@/features/share/useShareData';
import type { WaterEntry } from '@/types';

import { addDays } from './dates';
import { computeMilestones, generateInsights, hydrationPattern, summarizePeriod, type InsightDay } from './insights';

const TODAY = '2026-11-19';
const GOAL = 2500;

const latteWater = (date: string, ml = 2600): Pick<WaterEntry, 'ml' | 'beverage' | 'loggedAt' | 'fromEntryId'> => ({
  ml,
  beverage: 'coffee',
  loggedAt: `${date}T08:10:00.000Z`,
  fromEntryId: `e-${date}`,
});
const glass = (date: string, ml = 250): Pick<WaterEntry, 'ml' | 'beverage' | 'loggedAt' | 'fromEntryId'> => ({ ml, beverage: 'water', loggedAt: `${date}T15:00:00.000Z` });

/** 14 closed, fully logged days with a latte each morning, with the latte's water (now) or without (before this work). */
function days(withDiaryWater: boolean, latteMl = 2600): InsightDay[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = addDays(TODAY, i - 14);
    return {
      date,
      entries: [{ nutrients: {} }],
      eaten: { kcal: 2000, protein: 120, carbs: 200, fat: 70 },
      budget: 2100,
      macros: { proteinG: 120, carbsG: 220, fatG: 70, fiberG: 30 },
      activities: [],
      activeMinutes: 0,
      waterEntries: withDiaryWater ? [latteWater(date, latteMl)] : [],
      waterMl: withDiaryWater ? latteMl * 0.9 : 0,
      waterGoalMl: GOAL,
    };
  });
}

const ctx = (d: InsightDay[]) => ({
  summary: summarizePeriod({ days: d, trend: [], sleep: [], today: TODAY }),
  days: d,
  sleep: [],
  today: TODAY,
  units: 'metric' as const,
  goal: 'maintain' as const,
  chosenWeeklyKg: 0,
  weightKg: 70,
  currentWeeklyRateKg: null,
  weighInsTotal: 0,
  lastWeighIn: null,
  energy: { formulaTdee: 2100, adaptive: { observed: null } as never, usingAdaptive: false, useAdaptiveSetting: false, tdee: 2100 },
  streak: 14,
});

describe('src/lib/insights.ts', () => {
  it('summarizePeriod: no water summary (the habits card and the recap tile show none) for diary drinks only', () => {
    expect(summarizePeriod({ days: days(true), trend: [], sleep: [], today: TODAY }).water).toBeNull();
    expect(summarizePeriod({ days: days(false), trend: [], sleep: [], today: TODAY }).water).toBeNull();
  });

  it('summarizePeriod: a day with one glass logged as water is tracked, and its total includes the latte', () => {
    const d = days(true);
    d[0] = { ...d[0], waterEntries: [...d[0].waterEntries, glass(d[0].date)], waterMl: d[0].waterMl + 250 };
    const w = summarizePeriod({ days: d, trend: [], sleep: [], today: TODAY }).water!;
    expect(w.daysTracked).toBe(1);
    expect(w.avgMl).toBe(2600 * 0.9 + 250);
  });

  it('the hydration insights: the same list as before', () => {
    const ids = (d: InsightDay[]) => generateInsights(ctx(d) as never).map((i) => i.id);
    expect(ids(days(true, 500))).toEqual(ids(days(false)));
    expect(ids(days(true, 500)).some((id) => id.startsWith('water'))).toBe(false);
  });

  it('hydrationPattern: none from diary drinks', () => {
    expect(hydrationPattern(days(true), TODAY)).toBeNull();
  });

  it('computeMilestones: days at water goal count only tracked days', () => {
    const m = (d: InsightDay[]) => computeMilestones({ days: d, weighInDates: [], trend: [], goal: 'maintain', units: 'metric' }).find((x) => x.id === 'water-7')!;
    expect(m(days(true)).current).toBe(m(days(false)).current);
    expect(m(days(true)).current).toBe(0);
  });
});

describe('src/features/morning/facts.ts (the review, coach and plan read it)', () => {
  const source = (water: Pick<WaterEntry, 'fromEntryId'>[]) => ({
    date: '2026-11-18',
    entries: [],
    eaten: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    budget: 2100,
    macros: { proteinG: 120, carbsG: 220, fatG: 70, fiberG: 30 },
    waterMl: 0,
    waterGoalMl: GOAL,
    waterEntries: water,
    activities: [],
  });
  it('hasWater only for water logged as water', () => {
    expect(dayFacts(source([{ fromEntryId: 'e1' }]) as never).hasWater).toBe(false);
    expect(dayFacts(source([{ fromEntryId: 'e1' }, {}]) as never).hasWater).toBe(true);
    expect(isNothing(dayFacts(source([{ fromEntryId: 'e1' }]) as never))).toBe(true);
  });
});

describe('src/features/share/useShareData.ts', () => {
  const day = (water: Pick<WaterEntry, 'fromEntryId'>[], waterMl: number) => ({
    date: TODAY,
    byMeal: { breakfast: [], lunch: [], dinner: [], snack: [] },
    eaten: { kcal: 0 },
    budget: 2100,
    exerciseAdded: 0,
    waterMl,
    waterGoalMl: GOAL,
    waterEntries: water,
    activeMinutes: 0,
  });
  it('waterLogged is false for a latte only, the total still counts it', () => {
    hooks.day = day([{ fromEntryId: 'e1' }], 216);
    hooks.days = [];
    const input = useShareDayInput(TODAY);
    expect(input.waterLogged).toBe(false);
    expect(input.waterMl).toBe(216);
    hooks.day = day([{ fromEntryId: 'e1' }, {}], 466);
    expect(useShareDayInput(TODAY).waterLogged).toBe(true);
  });
});

describe('src/features/progress/useConsistencyData.ts (the logging calendar)', () => {
  it("a day's water mark needs water logged as water", () => {
    const d = (date: string, water: Pick<WaterEntry, 'fromEntryId'>[]) => ({
      date,
      entries: [],
      eaten: { kcal: 0 },
      budget: 2100,
      waterMl: 3000,
      waterGoalMl: GOAL,
      waterEntries: water,
      activities: [],
    });
    hooks.water = [{ date: '2026-11-17' }];
    hooks.days = [d('2026-11-17', [{ fromEntryId: 'e1' }]), d('2026-11-18', [{ fromEntryId: 'e2' }, {}])];
    const data = useConsistencyData();
    expect(data.byDate.get('2026-11-17')!.waterMet).toBe(false);
    expect(data.byDate.get('2026-11-18')!.waterMet).toBe(true);
  });
});
