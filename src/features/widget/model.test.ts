/**
 * The widget's figures are Today's figures for the same day, worded as Today words them, and the
 * look follows the person's choice. Built on the real store, so `computeDayFromStore` is the one
 * source of every number.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '@/store';
import { computeDayFromStore } from '@/store/selectors';
import type { Profile } from '@/types';

import { widgetModel, widgetTexts, type WidgetDay } from './model';

const DAY = '2026-11-25';

const profile: Profile = {
  name: 'Dana',
  sex: 'female',
  birthDate: '1990-01-01',
  heightCm: 168,
  weightKg: 64,
  activityLevel: 'moderate',
  goal: 'maintain',
  weeklyRateKg: 0,
  units: 'metric',
  eatBackExercise: true,
  useAdaptiveTdee: false,
  calorieTargetOverride: 2160,
  waterGoalMlOverride: 3300,
  onboardedAt: '2026-11-01T08:00:00Z',
  updatedAt: '2026-11-01T08:00:00Z',
};

const eat = (kcal: number) =>
  useStore.getState().upsert('foodEntries', {
    date: DAY,
    meal: 'lunch',
    name: 'Lunch',
    source: 'custom',
    verified: false,
    servingLabel: '1',
    quantity: 1,
    grams: 100,
    nutrients: { kcal, protein: 0, carbs: 0, fat: 0 },
    loggedAt: `${DAY}T12:00:00Z`,
  });
const drink = (ml: number) => useStore.getState().upsert('water', { date: DAY, ml, beverage: 'water', loggedAt: `${DAY}T09:00:00Z` });
const day = (): WidgetDay => {
  const f = widgetModel(useStore.getState(), DAY);
  if (f.kind !== 'day') throw new Error('expected the day');
  return f;
};

beforeEach(() => {
  useStore.getState().resetAll();
  useStore.getState().setProfile(profile);
});

describe('widgetModel', () => {
  it('shows the calories left of the budget and the water of its goal, as Today does', () => {
    eat(1219);
    drink(1230);
    const f = day();
    const today = computeDayFromStore(useStore.getState(), DAY)!;
    expect(f.dateLine).toBe('Wed, Nov 25');
    expect(f.kcal.figure).toBe('941');
    expect(f.kcal.word).toBe('left');
    expect(f.kcal.over).toBe(false);
    expect(f.kcal.eatenLine).toBe('1,219 eaten of 2,160');
    expect(f.kcal.budget).toBe(today.budget);
    expect(f.water.line).toBe('1.23 of 3.3 L');
    expect(f.water.caption).toBe('Water');
    expect(f.water.reached).toBe(false);
    expect(f.glass).toEqual({ ml: 250, label: '+ 250 ml', spoken: 'Add 250 ml of water' });
    expect(f.added).toBeNull();
    expect(f.kcal.spoken).toBe('941 kilocalories left. 1,219 eaten of a 2,160 kilocalorie budget. Open Today');
    expect(f.water.spoken).toBe('Water, 1.23 of 3.3 litres. Open Water');
    expect(f.spoken).toBe('HealthCal, Wed, Nov 25. 941 kilocalories left. 1,219 eaten of a 2,160 kilocalorie budget. Water, 1.23 of 3.3 litres.');
  });

  it('above the budget: the distance, "above", never a sign', () => {
    eat(2290);
    const f = day();
    expect(f.kcal.figure).toBe('130');
    expect(f.kcal.word).toBe('above');
    expect(f.kcal.over).toBe(true);
    expect(f.kcal.spoken).toMatch(/^130 kilocalories above the day's budget\./);
  });

  it('a reached water goal is said plainly', () => {
    drink(3000);
    drink(380);
    const f = day();
    expect(f.water.line).toBe('3.38 of 3.3 L');
    expect(f.water.reached).toBe(true);
    expect(f.water.caption).toBe('Goal reached');
    expect(f.water.spoken).toBe('Water, 3.38 of 3.3 litres, goal reached. Open Water');
  });

  it('workouts in the budget are its hatched headroom, said in the spoken line', () => {
    useStore.getState().upsert('activities', {
      date: DAY,
      activityId: 'running',
      name: 'Run',
      emoji: 'x',
      category: 'running' as never,
      intensity: 'moderate',
      durationMin: 30,
      met: 9,
      kcalNet: 290,
      kcalGross: 340,
      loggedAt: `${DAY}T07:00:00Z`,
    });
    const f = day();
    expect(f.kcal.headroom).toBe(290);
    expect(f.kcal.budget).toBe(2450);
    expect(f.kcal.spoken).toContain('about 290 of it added by workouts');
  });

  it('imperial: the glass and the water in fluid ounces', () => {
    useStore.getState().setProfile({ units: 'imperial' });
    useStore.getState().setSettings({ waterPresets: [237, 355, 473, 710] });
    const f = day();
    expect(f.glass.label).toBe('+ 12 fl oz');
    expect(f.glass.spoken).toBe('Add 12 fl oz of water');
    expect(f.water.line).toBe('0 of 112 fl oz');
  });

  it('a glass from the widget is offered to undo on its own day only', () => {
    const g = drink(250);
    const recent = { id: g.id, ml: 250, date: DAY, at: 0 };
    const f = widgetModel(useStore.getState(), DAY, recent);
    expect(f.kind === 'day' && f.added).toEqual({ id: g.id, caption: '250 ml added', undoSpoken: 'Undo 250 ml of water' });
    const other = widgetModel(useStore.getState(), DAY, { ...recent, date: '2026-11-24' });
    expect(other.kind === 'day' && other.added).toBeNull();
  });

  it('before set-up: one message that opens the app, in the lead look', () => {
    useStore.getState().resetAll();
    const f = widgetModel(useStore.getState(), DAY);
    expect(f.kind).toBe('message');
    if (f.kind !== 'message') return;
    expect(f.title).toBe('Set up HealthCal');
    expect(f.spoken).toMatch(/Open HealthCal$/);
    expect(f.themes).toEqual({ light: 'blossom', dark: 'dark' });
  });

  it('the look: follows the phone on "Match my phone", stays the chosen look otherwise', () => {
    expect(day().themes).toEqual({ light: 'light', dark: 'dark' });
    useStore.getState().setSettings({ theme: 'blossom' });
    expect(day().themes).toEqual({ light: 'blossom', dark: 'blossom' });
    useStore.getState().setSettings({ theme: 'dark', look: 'java' });
    expect(day().themes).toEqual({ light: 'java', dark: 'java' });
    useStore.getState().setSettings({ theme: 'light', look: 'butter' });
    expect(day().themes).toEqual({ light: 'butter', dark: 'butter' });
  });

  it('leaves deleted records out, as Today does', () => {
    const g = drink(500);
    useStore.getState().remove('water', g.id);
    expect(day().water.line).toBe('0 ml of 3.3 L');
  });

  it('hands the layout the words exactly as the drawing draws them', () => {
    eat(1219);
    const g = drink(213);
    expect(widgetTexts(day())).toEqual({
      date: 'WED, NOV 25',
      figure: '941',
      word: 'left',
      eaten: '1,219 eaten of 2,160',
      water: '213 ml of 3.3 L',
      caption: 'Water',
      glass: '+ 250 ml',
      undo: null,
    });
    const f = widgetModel(useStore.getState(), DAY, { id: g.id, ml: 250, date: DAY, at: 0 });
    if (f.kind !== 'day') throw new Error('expected the day');
    expect(widgetTexts(f)).toMatchObject({ caption: '250 ml added', undo: 'Undo' });
  });
});
