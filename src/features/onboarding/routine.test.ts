import { describe, expect, it } from 'vitest';

import { defaultRoutine, nudgeExamples, remindersPatch, validateRoutine, type Routine } from './routine';

const PLAN = { targetKcal: 1800, waterMl: 2000, macros: { proteinG: 130, carbsG: 180, fatG: 60, fiberG: 25, split: { protein: 0.3, carbs: 0.4, fat: 0.3 } } };
const BASE = new Date(2026, 10, 13, 9);

const routine = (patch: Partial<Routine> = {}): Routine => ({ ...defaultRoutine(), ...patch });

describe('routine step', () => {
  it('accepts the defaults', () => {
    expect(validateRoutine(routine())).toEqual({});
  });

  it('wants meals in order and while awake', () => {
    expect(validateRoutine(routine({ lunch: '08:00' })).meals).toMatch(/in order/);
    expect(validateRoutine(routine({ bed: '19:00' })).meals).toMatch(/^Dinner at 19:30 falls while you are asleep/);
    expect(validateRoutine(routine({ bed: '19:00' }), true).meals).toMatch(/7:30 PM/);
    expect(validateRoutine(routine({ bed: '07:00' })).sleep).toBeTruthy();
  });

  it('allows a bedtime after midnight', () => {
    expect(validateRoutine(routine({ wake: '10:00', bed: '01:30', breakfast: '10:30', lunch: '14:00', dinner: '20:30' }))).toEqual({});
  });

  it('writes quiet hours from bed and wake, and the chosen nudges', () => {
    const p = remindersPatch(routine({ nudges: { water: false, meals: true, checkin: true, weighIn: true } }), true);
    expect(p).toMatchObject({ enabled: true, quietStart: '22:30', quietEnd: '07:00' });
    expect(p.water?.enabled).toBe(false);
    expect(p.meals).toEqual({ enabled: true, breakfast: '08:30', lunch: '13:00', dinner: '19:30' });
    expect(p.weighIn?.enabled).toBe(true);
    expect(remindersPatch(routine(), false).enabled).toBe(false);
  });

  it('builds the examples with the real planner from the plan numbers', () => {
    const ex = nudgeExamples(routine(), PLAN, 'metric', false, BASE);
    expect(ex.water?.time).toBe('13:00');
    // 6 of 15.5 waking hours, 85% on pace: 650 ml drunk of 2,000.
    expect(ex.water?.body).toBe('1.4 L to go today, about 6 glasses.');
    // Breakfast logged at a quarter of 1,800 kcal.
    expect(ex.meals?.title).toBe('Lunch');
    expect(ex.meals?.body).toBe('Nothing logged for lunch yet. 1,350 kcal left for today.');
    expect(ex.checkin?.body).toMatch(/^720 kcal left/);
    expect(ex.weighIn?.time).toBe('07:45');
  });

  it('uses imperial units and 12-hour clocks when asked', () => {
    const ex = nudgeExamples(routine(), PLAN, 'imperial', true, BASE);
    expect(ex.water?.time).toBe('1:00 PM');
    expect(ex.water?.body).toMatch(/fl oz to go today/);
  });

  it('has no example for a nudge that would fall in quiet hours', () => {
    const ex = nudgeExamples(routine({ wake: '09:00' }), PLAN, 'metric', false, BASE);
    expect(ex.weighIn).toBeNull();
  });
});
