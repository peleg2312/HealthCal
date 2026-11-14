import { describe, expect, it } from 'vitest';

import { darkColors } from '@/theme/tokens';

import { DEFAULT_SHARE_CHOICES, dayCardContent, dayVerdict, foodList, weekCardContent, weekCups, type ShareDayInput, type ShareWeekInput } from './content';
import { BAND_OPACITY, dayScene, PARTIAL_OPACITY, placeLabels, weekScene, type Prim } from './scene';

const day = (over: Partial<ShareDayInput> = {}): ShareDayInput => ({
  date: '2026-11-12',
  today: '2026-11-14',
  units: 'metric',
  kcal: 1850,
  budget: 2160,
  exerciseInBudget: 290,
  mealKcal: { breakfast: 420, lunch: 610, dinner: 700, snack: 120 },
  mealFoods: { breakfast: ['Porridge oats', 'Banana'], lunch: ['Chicken salad'], dinner: ['Salmon', 'Rice'], snack: ['Banana'] },
  waterMl: 2400,
  waterGoalMl: 2400,
  waterLogged: true,
  activeMinutes: 45,
  streak: 12,
  week: [
    { date: '2026-11-09', logged: true, kcal: 2000, budget: 2000, complete: true },
    { date: '2026-11-10', logged: true, kcal: 2300, budget: 2000, complete: true },
    { date: '2026-11-11', logged: true, kcal: 500, budget: 2000, complete: false },
    { date: '2026-11-12', logged: true, kcal: 1850, budget: 2160, complete: true },
  ],
  ...over,
});

const allText = (prims: Prim[]): string =>
  prims.map((p) => (p.k === 'text' ? p.runs.map((r) => r.text).join('') : p.k === 'clip' ? allText(p.children) : '')).join('\n');

describe('day card content', () => {
  it('shows how full the day is, not kcal, by default', () => {
    const c = dayCardContent(day(), DEFAULT_SHARE_CHOICES);
    expect(c.headline).toEqual({ value: '86%', unit: 'of the day’s budget' });
    expect(c.summary).not.toMatch(/kcal/);
    expect(allText(dayScene(c, darkColors).prims)).not.toMatch(/kcal|1,850|2,160/);
  });

  it('shows the kcal figures only when chosen', () => {
    const c = dayCardContent(day(), { ...DEFAULT_SHARE_CHOICES, kcal: true });
    expect(c.headline).toEqual({ value: '1,850', unit: 'of 2,160 kcal' });
    expect(allText(dayScene(c, darkColors).prims)).toMatch(/1,850/);
  });

  it('carries water, activity and the streak by default, and no food names', () => {
    const c = dayCardContent(day(), DEFAULT_SHARE_CHOICES);
    expect(c.stats.map((s) => s.key)).toEqual(['water', 'activity', 'streak']);
    expect(c.stats[0]).toMatchObject({ value: '2.4', unit: 'L', label: 'water, goal met' });
    expect(c.foods).toBeNull();
    expect(allText(dayScene(c, darkColors).prims)).not.toMatch(/Salmon|Banana/);
  });

  it('lists food names only when chosen, in meal order and without repeats', () => {
    const c = dayCardContent(day(), { ...DEFAULT_SHARE_CHOICES, foods: true });
    expect(c.foods).toBe('Porridge oats, Banana, Chicken salad, Salmon, Rice');
  });

  it('drops a stat when its choice is off or there is nothing to show', () => {
    const c = dayCardContent(day({ activeMinutes: 0 }), { ...DEFAULT_SHARE_CHOICES, streak: false });
    expect(c.stats.map((s) => s.key)).toEqual(['water']);
  });

  it('uses imperial units for water', () => {
    const c = dayCardContent(day({ units: 'imperial' }), DEFAULT_SHARE_CHOICES);
    expect(c.stats[0]).toMatchObject({ value: '81', unit: 'fl oz' });
  });

  it('never has a way to carry weight', () => {
    const c = dayCardContent({ ...day(), ...({ weightKg: 81.3 } as object) } as ShareDayInput, { kcal: true, water: true, activity: true, streak: true, week: true, foods: true });
    const text = allText(dayScene(c, darkColors).prims) + c.summary;
    expect(text).not.toMatch(/81\.3|weight|kg|lb/i);
  });

  it('stacks the meal bands in meal order as shares of the budget', () => {
    const c = dayCardContent(day(), DEFAULT_SHARE_CHOICES);
    expect(c.cup.bands.map((b) => b.meal)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
    expect(c.cup.bands[3].top).toBeCloseTo(1850 / 2160, 5);
    expect(c.cup.headroom).toBeCloseTo(290 / 2160, 5);
  });

  it('judges the day against its own budget, in neutral words', () => {
    expect(dayVerdict(2000, 2160, false, true)).toBe('Within the day’s budget');
    expect(dayVerdict(2300, 2160, false, true)).toBe('Within 10% of the budget');
    expect(dayVerdict(2600, 2160, false, true)).toBe('Above the day’s budget');
    expect(dayVerdict(900, 2160, true, true)).toBe('So far today');
    expect(dayVerdict(0, 2160, true, false)).toBe('Nothing logged yet today');
  });

  it('marks today as a day in progress', () => {
    const c = dayCardContent(day({ date: '2026-11-14' }), DEFAULT_SHARE_CHOICES);
    expect(c.inProgress).toBe(true);
    expect(c.headline.unit).toBe('of today’s budget');
  });

  it('cuts long food lists', () => {
    expect(foodList({ breakfast: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], lunch: [], dinner: [], snack: [] })).toBe('A, B, C, D, E, F and 2 more');
    expect(foodList({ breakfast: [], lunch: [], dinner: [], snack: [] })).toBeNull();
  });
});

describe('week cups', () => {
  it('fills each day against its own budget, with future days dashed', () => {
    const cups = weekCups('2026-11-09', day().week, '2026-11-12');
    expect(cups).toHaveLength(7);
    expect(cups[1]).toMatchObject({ ratio: 1.15, over: true, inBand: false });
    expect(cups[0]).toMatchObject({ ratio: 1, inBand: true });
    expect(cups[2]).toMatchObject({ complete: false, inBand: false });
    expect(cups[4].future).toBe(true);
  });
});

const week = (over: Partial<ShareWeekInput> = {}): ShareWeekInput => ({
  weekStart: '2026-11-02',
  today: '2026-11-14',
  units: 'metric',
  days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, logged: true, kcal: 2000 + i * 20, budget: 2100, complete: true })),
  avgKcal: 2060,
  avgBudget: 2100,
  waterDaysAtGoal: 5,
  waterDaysTracked: 7,
  guidelineMinutes: 180,
  sessions: 4,
  streak: 20,
  ...over,
});

describe('week card content', () => {
  it('writes its own headline from facts it may show', () => {
    const c = weekCardContent(week(), DEFAULT_SHARE_CHOICES);
    expect(c.headline).toBe('Every full day within 10% of its budget.');
    expect(c.overline).toBe('WEEK OF NOV 2 – 8');
  });

  it('keeps kcal off unless chosen', () => {
    const off = weekCardContent(week(), DEFAULT_SHARE_CHOICES);
    expect(off.summary).not.toMatch(/kcal/);
    expect(allText(weekScene(off, darkColors).prims)).not.toMatch(/kcal/);
    const on = weekCardContent(week(), { ...DEFAULT_SHARE_CHOICES, kcal: true });
    expect(on.stats.find((s) => s.key === 'kcal')?.value).toBe('2,060');
  });

  it('does not quote activity in the headline when activity is off', () => {
    const c = weekCardContent(week({ days: week().days.map((d) => ({ ...d, kcal: 3000 })) }), { ...DEFAULT_SHARE_CHOICES, activity: false, water: false });
    expect(c.headline).not.toMatch(/active|water/i);
  });
});

describe('scenes', () => {
  const inside = (prims: Prim[], w: number, h: number) =>
    prims.every((p) => (p.k === 'rect' ? p.x >= 0 && p.y >= 0 && p.x + p.w <= w + 0.01 && p.y + p.h <= h + 0.01 : p.k === 'text' ? p.y > 0 && p.y < h && p.x >= 0 && p.x <= w : true));

  it('keeps the day card inside its frame with everything turned on', () => {
    const c = dayCardContent(day(), { kcal: true, water: true, activity: true, streak: true, week: true, foods: true });
    const s = dayScene(c, darkColors);
    expect(inside(s.prims, s.width, s.height)).toBe(true);
    expect(allText(s.prims)).toMatch(/HealthCal/);
  });

  it('never cuts a stat label on the week card', () => {
    for (const minutes of [90, 180, 1250]) {
      const c = weekCardContent(week({ guidelineMinutes: minutes, waterDaysTracked: 7, waterDaysAtGoal: 1 }), { ...DEFAULT_SHARE_CHOICES, kcal: true });
      expect(allText(weekScene(c, darkColors).prims)).not.toMatch(/…/);
    }
  });

  it('keeps the week card inside its frame with five stats', () => {
    const c = weekCardContent(week(), { ...DEFAULT_SHARE_CHOICES, kcal: true });
    const s = weekScene(c, darkColors);
    expect(c.stats).toHaveLength(5);
    expect(inside(s.prims, s.width, s.height)).toBe(true);
  });
});

describe('scene spacing', () => {
  it('keeps the week row clear of the HealthCal mark with everything on', () => {
    const c = dayCardContent(day(), { kcal: true, water: true, activity: true, streak: true, week: true, foods: true });
    const s = dayScene(c, darkColors);
    const letters = s.prims.filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text' && /^[MTWFS]$/.test(p.runs[0]?.text ?? ''));
    expect(letters).toHaveLength(7);
    for (const l of letters) expect(l.y).toBeLessThan(s.height - 52);
  });
});

describe('week card, review fixes', () => {
  // This week (Nov 9 to 15) on Saturday Nov 14, with only breakfast logged each day.
  const partialWeek = week({
    weekStart: '2026-11-09',
    today: '2026-11-14',
    days: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'].map((date) => ({ date, logged: true, kcal: 400, budget: 2000, complete: false })),
    avgKcal: null,
    avgBudget: null,
    waterDaysTracked: 0,
    waterDaysAtGoal: 0,
    guidelineMinutes: 60,
  });

  it('draws partly logged days in the lighter fill and only today hatched', () => {
    const c = weekCardContent(partialWeek, DEFAULT_SHARE_CHOICES);
    expect(c.cups.map((d) => d.partial)).toEqual([true, true, true, true, true, false, false]);
    expect(c.cups.map((d) => d.isToday)).toEqual([false, false, false, false, false, true, false]);
    const s = weekScene(c, darkColors);
    const clips = s.prims.filter((p): p is Extract<Prim, { k: 'clip' }> => p.k === 'clip');
    // Six drawn cups (Sunday is still to come): five lighter fills, one hatched.
    const lighter = clips.filter((p) => p.children.some((ch) => ch.k === 'rect' && ch.opacity === PARTIAL_OPACITY));
    const hatched = clips.filter((p) => p.children.filter((ch) => ch.k === 'path').length > 3);
    expect(lighter).toHaveLength(5);
    expect(hatched).toHaveLength(1);
  });

  it('leaves out "0 of 0" and says a week in progress is so far', () => {
    const c = weekCardContent(partialWeek, DEFAULT_SHARE_CHOICES);
    expect(c.stats.find((s) => s.key === 'budget')).toBeUndefined();
    expect(c.inProgress).toBe(true);
    expect(c.summary).toMatch(/^My week so far/);
    expect(c.stats.find((s) => s.key === 'activity')?.label).toBe('active so far');
    const text = allText(weekScene(c, darkColors).prims);
    expect(text).not.toMatch(/0 of 0/);
    expect(text).toMatch(/Week in progress/);
  });

  it('never prints the same figure in the headline and the stats', () => {
    for (const over of [{}, { guidelineMinutes: 295 }, { waterDaysAtGoal: 7 }, { days: week().days.map((d) => ({ ...d, kcal: 3000 })) }]) {
      const c = weekCardContent(week(over), DEFAULT_SHARE_CHOICES);
      const figures = c.headline.match(/\d[\d,]*/g) ?? [];
      for (const f of figures) expect(c.stats.map((s) => s.value)).not.toContain(f);
    }
    expect(weekCardContent(week({ guidelineMinutes: 295, days: week().days.map((d) => ({ ...d, kcal: 3000 })), waterDaysAtGoal: 1 }), DEFAULT_SHARE_CHOICES).headline).toBe('Past the weekly 150 active minutes.');
  });

  it('says "full day" for one', () => {
    const c = weekCardContent(week({ days: week().days.map((d, i) => ({ ...d, complete: i === 0 })) }), DEFAULT_SHARE_CHOICES);
    expect(c.stats[0]).toMatchObject({ value: '1', unit: 'of 1', label: 'full day within 10%' });
  });
});

describe('day card meal bands', () => {
  const textPrims = (prims: Prim[]) => prims.filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text');

  it('draws each meal a step lighter, bottom first', () => {
    const s = dayScene(dayCardContent(day(), DEFAULT_SHARE_CHOICES), darkColors);
    const clip = s.prims.find((p): p is Extract<Prim, { k: 'clip' }> => p.k === 'clip')!;
    const fills = clip.children.filter((p): p is Extract<Prim, { k: 'rect' }> => p.k === 'rect' && p.fill === darkColors.calories);
    expect(fills.map((f) => f.opacity)).toEqual(BAND_OPACITY);
    // By meal, not by position: a day without dinner still draws snacks at 55%.
    const noDinner = dayScene(dayCardContent(day({ mealKcal: { breakfast: 420, lunch: 610, dinner: 0, snack: 120 }, kcal: 1150 }), DEFAULT_SHARE_CHOICES), darkColors);
    const clip2 = noDinner.prims.find((p): p is Extract<Prim, { k: 'clip' }> => p.k === 'clip')!;
    expect(clip2.children.filter((p): p is Extract<Prim, { k: 'rect' }> => p.k === 'rect' && p.fill === darkColors.calories).map((f) => f.opacity)).toEqual([1, 0.85, 0.55]);
  });

  it('names every meal, whatever the day looks like', () => {
    const cases: Partial<ShareDayInput>[] = [
      {},
      { date: '2026-11-14', kcal: 1100, mealKcal: { breakfast: 400, lunch: 500, dinner: 200, snack: 0 } },
      { kcal: 2700, mealKcal: { breakfast: 900, lunch: 900, dinner: 800, snack: 100 } },
      { kcal: 300, mealKcal: { breakfast: 100, lunch: 100, dinner: 50, snack: 50 } },
    ];
    for (const over of cases) {
      for (const kcal of [false, true]) {
        const c = dayCardContent(day(over), { ...DEFAULT_SHARE_CHOICES, kcal });
        const texts = textPrims(dayScene(c, darkColors).prims);
        const names = texts.filter((t) => /^(Breakfast|Lunch|Dinner|Snacks)$/.test(t.runs[0].text));
        expect(names).toHaveLength(c.cup.bands.length);
        // A line apart, and clear of the headline's unit line.
        const ys = names.map((n) => n.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(16);
        const unitY = texts.find((t) => t.runs[0].text.startsWith(c.headline.unit.split(' ')[0]) && t.runs[0].size === 14)!.y;
        expect(ys[0]).toBeGreaterThan(unitY + 8);
        if (kcal) expect(names[0].runs[1].text).toMatch(/ kcal$/);
        else expect(names.every((n) => !n.runs[1].text)).toBe(true);
      }
    }
  });

  it('places labels near their bands and never drops one', () => {
    const l = (want: number) => ({ text: 'x', kcal: null, opacity: 1, want });
    expect(placeLabels([l(300), l(250)], 100, 320).map((p) => p.y)).toEqual([300, 250]);
    expect(placeLabels([l(300), l(295), l(290)], 100, 320).map((p) => p.y)).toEqual([300, 284, 268]);
    expect(placeLabels([l(120), l(110)], 200, 320).map((p) => p.y)).toEqual([216, 200]);
    expect(placeLabels([l(300), l(290), l(280), l(270)], 290, 300)).toHaveLength(4);
  });
});
