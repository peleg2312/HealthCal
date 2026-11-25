import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toISODate } from '@/lib/dates';
import type { ReminderSettings } from '@/types';

import {
  FAST_GOAL_DEFAULT,
  fastGoalOn,
  fastGoalPatch,
  fastGoalReminder,
  fastGoalTiming,
  fastGoalWords,
  fastHours,
  fastNotifyLine,
  planReminders,
  reminderTimeLabel,
  runningFast,
  type PlannerFast,
} from './reminderPlanner';

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

/** Local time on a day in November 2026 (Wednesday the 11th by default). */
const at = (h: number, m = 0, day = 11) => new Date(2026, 10, day, h, m, 0, 0);
const fast = (start: Date, targetHours = 16, id = 'f1'): PlannerFast => ({ id, start: start.toISOString(), targetHours });
const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('the fast goal switch', () => {
  it('is on when absent, and the patch writes the stored field both ways', () => {
    expect(FAST_GOAL_DEFAULT).toBe(true);
    expect(fastGoalOn(BASE)).toBe(true);
    const off = { ...BASE, ...fastGoalPatch(false) };
    expect(fastGoalOn(off)).toBe(false);
    expect(fastGoalOn({ ...off, ...fastGoalPatch(true) })).toBe(true);
    expect(fastGoalPatch(false)).toEqual({ fastGoal: false });
  });

  it('ignores a stored value that is not a boolean', () => {
    expect(fastGoalOn({ ...BASE, fastGoal: 'no' } as unknown as ReminderSettings)).toBe(true);
  });
});

describe('the running fast', () => {
  it('is the latest started fast with no end', () => {
    const fasts = [
      { id: 'a', start: at(8).toISOString(), targetHours: 16, end: at(20).toISOString() },
      { id: 'b', start: at(9).toISOString(), targetHours: 16 },
      { id: 'c', start: at(10).toISOString(), targetHours: 18 },
    ];
    expect(runningFast(fasts)?.id).toBe('c');
    expect(runningFast(fasts.slice(0, 1))).toBeNull();
    expect(runningFast([])).toBeNull();
  });
});

describe('when the fast goal notification comes', () => {
  it('comes at the goal when that is outside quiet hours', () => {
    const t = fastGoalTiming(fast(at(20)), '22:00', '07:30')!;
    expect(t.deferred).toBe(false);
    expect(t.at.getTime()).toBe(t.goalAt.getTime());
    expect(clock(t.at)).toBe('12:00');
    expect(toISODate(t.at)).toBe('2026-11-12');
  });

  it('waits for the end of quiet hours that cross midnight, on the same or the next morning', () => {
    // Started 14:00, 16 h: the goal at 06:00 the next morning, inside 22:00-07:30.
    const early = fastGoalTiming(fast(at(14)), '22:00', '07:30')!;
    expect(early.deferred).toBe(true);
    expect(clock(early.goalAt)).toBe('06:00');
    expect(clock(early.at)).toBe('07:30');
    expect(toISODate(early.at)).toBe('2026-11-12');
    // Started 07:00, 16 h: the goal at 23:00 the same day, so the notification comes the next morning.
    const late = fastGoalTiming(fast(at(7)), '22:00', '07:30')!;
    expect(late.deferred).toBe(true);
    expect(toISODate(late.goalAt)).toBe('2026-11-11');
    expect(toISODate(late.at)).toBe('2026-11-12');
    expect(clock(late.at)).toBe('07:30');
  });

  it('handles a quiet window inside one day, and no quiet window at all', () => {
    const t = fastGoalTiming(fast(at(22), 16), '13:00', '15:00')!; // the goal at 14:00
    expect(t.deferred).toBe(true);
    expect(clock(t.at)).toBe('15:00');
    expect(toISODate(t.at)).toBe('2026-11-12');
    const none = fastGoalTiming(fast(at(14)), '00:00', '00:00')!;
    expect(none.deferred).toBe(false);
  });

  it('keeps a custom goal to the minute', () => {
    const t = fastGoalTiming(fast(at(19, 15), 13.5), '22:00', '07:30')!;
    expect(clock(t.at)).toBe('08:45');
  });

  it('is null for a fast with no valid start or goal', () => {
    expect(fastGoalTiming({ id: 'x', start: 'nonsense', targetHours: 16 }, '22:00', '07:30')).toBeNull();
    expect(fastGoalTiming(fast(at(8), 0), '22:00', '07:30')).toBeNull();
  });
});

describe('the fast goal reminder', () => {
  const input = (patch: Partial<ReminderSettings> = {}, f: PlannerFast | null = fast(at(20))) => ({ reminders: { ...BASE, ...patch }, units: 'metric' as const, fast: f });

  it('is planned while a fast runs, opens Fasting and carries an id stable per fast', () => {
    const r = fastGoalReminder(input(), at(21))!;
    expect(r.kind).toBe('fast');
    expect(r.url).toBe('/fasting');
    expect(r.id).toBe('fast-goal-f1');
    expect(r.title).toBe('16 h fast reached');
    expect(r.data).toEqual({ date: '2026-11-12' });
  });

  it('is silent with reminders off, the switch off, no fast, or its moment past', () => {
    expect(fastGoalReminder(input({ enabled: false }), at(21))).toBeNull();
    expect(fastGoalReminder(input(fastGoalPatch(false)), at(21))).toBeNull();
    expect(fastGoalReminder(input({}, null), at(21))).toBeNull();
    expect(fastGoalReminder(input(), at(12, 1, 12))).toBeNull();
  });

  it('is still planned after a goal reached in quiet hours, until they end', () => {
    // The goal at 06:00; at 06:30 the notification still waits for 07:30.
    const r = fastGoalReminder(input({}, fast(at(14))), at(6, 30, 12))!;
    expect(clock(r.at)).toBe('07:30');
    expect(fastGoalReminder(input({}, fast(at(14))), at(7, 31, 12))).toBeNull();
  });

  it('moves with the goal and the start: a change gives another time under the same id', () => {
    const a = fastGoalReminder(input({}, fast(at(20), 16)), at(21))!;
    const b = fastGoalReminder(input({}, fast(at(20), 18)), at(21))!;
    const c = fastGoalReminder(input({}, fast(at(19), 16)), at(21))!;
    expect(a.id).toBe(b.id);
    expect(clock(b.at)).toBe('14:00');
    expect(clock(c.at)).toBe('11:00');
  });

  it('says when it started, and when it was reached if quiet hours held it back, in neutral words', () => {
    const onTime = fastGoalReminder(input(), at(21))!;
    expect(onTime.body).toBe('Started yesterday at 20:00. The timer runs until you end it.');
    const held = fastGoalReminder(input({}, fast(at(14))), at(15))!;
    expect(held.body).toBe('Reached at 06:00, in your quiet hours. Started yesterday at 14:00. The timer runs until you end it.');
    const sameDay = fastGoalReminder(input({}, fast(at(8), 4)), at(9))!;
    expect(sameDay.body).toBe('Started at 08:00. The timer runs until you end it.');
    const long = fastGoalReminder(input({}, fast(at(9), 72)), at(10))!;
    expect(long.title).toBe('72 h fast reached');
    expect(long.body).toBe('Started on Wednesday at 09:00. The timer runs until you end it.');
    for (const r of [onTime, held, sameDay, long]) {
      expect(`${r.title} ${r.body}`).not.toMatch(/!|great|well done|bad|fail|missed|should|cheat|congrat/i);
    }
  });

  it('uses the 12-hour clock in imperial units', () => {
    const r = fastGoalReminder({ ...input(), units: 'imperial' }, at(21))!;
    expect(r.body).toBe('Started yesterday at 8:00 PM. The timer runs until you end it.');
  });

  it('names a custom goal with one decimal', () => {
    expect(fastHours(13.5)).toBe('13.5');
    expect(fastHours(16)).toBe('16');
    const t = fastGoalTiming(fast(at(19), 13.5), '22:00', '07:30')!;
    expect(fastGoalWords(fast(at(19), 13.5), t).title).toBe('13.5 h fast reached');
  });
});

describe('the fast goal in the plan', () => {
  const day = (date: string) =>
    ({
      date,
      byMeal: { breakfast: [], lunch: [], dinner: [], snack: [] },
      activities: [],
      remaining: 1000,
      eaten: { kcal: 1000, protein: 50, carbs: 0, fat: 0 },
      macros: { proteinG: 150 },
      waterRemainingMl: 1000,
      exerciseRule: 'day',
    }) as never;

  it('sits beside the other reminders: never spaced out, never capped, never dropping one', () => {
    // Started 21:00 yesterday, 16 h: the goal at 13:00 today, the same time as the lunch reminder.
    const now = at(9);
    const f = fast(at(21, 0, 10));
    const withFast = planReminders({ reminders: BASE, units: 'metric', today: { summary: day('2026-11-11'), weighed: false }, fast: f }, now);
    const without = planReminders({ reminders: BASE, units: 'metric', today: { summary: day('2026-11-11'), weighed: false } }, now);
    expect(withFast.filter((r) => r.kind !== 'fast')).toEqual(without);
    const goal = withFast.find((r) => r.kind === 'fast')!;
    expect(clock(goal.at)).toBe('13:00');
    expect(withFast.find((r) => r.id === 'meal-lunch-2026-11-11')).toBeTruthy();
    // Sorted by time with the rest.
    expect(withFast.map((r) => r.at.getTime())).toEqual([...withFast.map((r) => r.at.getTime())].sort((a, b) => a - b));
  });

  it('is planned however far ahead the goal is, and never with reminders off', () => {
    const now = at(10);
    const f = fast(at(9), 72);
    const plan = planReminders({ reminders: BASE, units: 'metric', today: { summary: day('2026-11-11'), weighed: false }, fast: f }, now);
    expect(plan.find((r) => r.kind === 'fast')?.at.getDate()).toBe(14);
    expect(planReminders({ reminders: { ...BASE, enabled: false }, units: 'metric', today: { summary: day('2026-11-11'), weighed: false }, fast: f }, now)).toEqual([]);
  });
});

describe('labels and the screen line', () => {
  it('labels a time today, tomorrow, or by its weekday further on', () => {
    const now = at(10);
    expect(reminderTimeLabel(at(14, 30), now)).toBe('14:30');
    expect(reminderTimeLabel(at(8, 30, 12), now)).toBe('Tomorrow 08:30');
    expect(reminderTimeLabel(at(9, 0, 14), now)).toBe('Sat 09:00');
  });

  it('says on the fasting screen when the notification comes', () => {
    const onTime = fastGoalTiming(fast(at(20)), '22:00', '07:30')!;
    expect(fastNotifyLine(onTime, at(21))).toBe('A notification comes at the goal.');
    const held = fastGoalTiming(fast(at(14)), '22:00', '07:30')!;
    expect(fastNotifyLine(held, at(15))).toBe('The goal falls in quiet hours. The notification comes tomorrow at 07:30.');
    expect(fastNotifyLine(held, at(5, 0, 12))).toBe('The goal falls in quiet hours. The notification comes at 07:30.');
  });
});

describe('local time', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.TZ;
  });
  afterEach(() => {
    process.env.TZ = saved;
  });

  it('keeps the end of quiet hours at its wall-clock time across a daylight saving change', () => {
    process.env.TZ = 'America/New_York';
    // DST ends on Sunday 1 Nov 2026 at 02:00: a 16 h fast from 14:00 on the 31st reaches its goal at 05:00.
    const t = fastGoalTiming({ id: 'f', start: new Date(2026, 9, 31, 14, 0).toISOString(), targetHours: 16 }, '22:00', '07:30')!;
    expect(t.deferred).toBe(true);
    expect(clock(t.goalAt)).toBe('05:00');
    expect(clock(t.at)).toBe('07:30');
    expect(toISODate(t.at)).toBe('2026-11-01');
  });
});
