/**
 * "Share my week" (`buildCoachNote`): every line from a worked store, the never-list proved by
 * planting a name, an email, a body weight, a note, a device title, a food name, a time of day and a
 * heart rate and finding none of them in the text, the 900 cap, the iPhone rule with and without
 * records from Apple Health, its constant held to app.json's sentence, and friends' meals, which never
 * reach it (neither the store nor note.ts's imports hold anything from friends).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { macroTargets } from '@/lib/energy';
import { trainingOverview } from '@/lib/trainingLoad';
import type { ActivityEntry, FeedMeal, FoodEntry, MySharedMeal, Profile, SleepEntry, WaterEntry, WeightEntry } from '@/types';

import { APPLE_HEALTH_LEFT_OUT, APPLE_HEALTH_PROMISE, buildCoachNote, coachNote, NOTE_MAX, type NoteState } from './note';

const TODAY = '2026-11-23';
const STAMP = '2026-11-01T00:00:00Z';

const PROFILE: Profile = {
  name: 'Zelda Quixote',
  sex: 'female',
  birthDate: '1987-04-19',
  heightCm: 171.4,
  weightKg: 91.3,
  activityLevel: 'moderate',
  goal: 'lose',
  weeklyRateKg: 0.4,
  units: 'metric',
  calorieTargetOverride: 2000,
  waterGoalMlOverride: 2500,
  eatBackExercise: false,
  useAdaptiveTdee: false,
  onboardedAt: '2026-09-01T08:00:00Z',
  updatedAt: STAMP,
};

let seq = 0;
const id = (p: string) => `${p}${seq++}`;
const food = (date: string, kcal: number, protein: number, extra: Partial<FoodEntry> = {}): FoodEntry =>
  ({
    id: id('f'),
    updatedAt: STAMP,
    date,
    meal: 'lunch',
    name: 'Secret Pickle Soup',
    source: 'custom',
    verified: false,
    servingLabel: '1 bowl',
    quantity: 1,
    grams: 300,
    nutrients: { kcal, protein, carbs: 10, fat: 10 },
    loggedAt: `${date}T12:31:00Z`,
    note: 'ate at Grandma Wilhelmina',
    ...extra,
  }) as FoodEntry;
const act = (date: string, activityId: string, durationMin: number, met: number, extra: Partial<ActivityEntry> = {}): ActivityEntry =>
  ({
    id: id('a'),
    updatedAt: STAMP,
    date,
    activityId,
    name: "Zelda's Forerunner 965",
    emoji: '🏃',
    category: 'cardio',
    intensity: 'moderate',
    durationMin,
    met,
    kcalNet: 300,
    kcalGross: 380,
    avgHeartRate: 163,
    maxHeartRate: 187,
    startedAt: `${date}T06:47:00Z`,
    loggedAt: `${date}T07:30:00Z`,
    note: 'knee felt odd',
    ...extra,
  }) as ActivityEntry;
const weigh = (date: string, kg: number, extra: Partial<WeightEntry> = {}): WeightEntry =>
  ({ id: `w-${date}`, updatedAt: STAMP, date, kg, note: 'zelda@example.com after the gym', ...extra }) as WeightEntry;
const night = (date: string, hours: number, extra: Partial<SleepEntry> = {}): SleepEntry =>
  ({ id: `s-${date}`, updatedAt: STAMP, date, hours, startedAt: `${addDays(date, -1)}T23:47:00Z`, endedAt: `${date}T06:59:00Z`, ...extra }) as SleepEntry;
const drink = (date: string, ml: number, extra: Partial<WaterEntry> = {}): WaterEntry =>
  ({ id: id('d'), updatedAt: STAMP, date, ml, beverage: 'water', loggedAt: `${date}T10:13:00Z`, ...extra }) as WaterEntry;

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, T>;

function worked(over: Partial<{ activities: ActivityEntry[]; weights: WeightEntry[]; sleep: SleepEntry[]; profile: Profile }> = {}): NoteState {
  const d = (n: number) => addDays(TODAY, -n);
  const foods = [
    // Five of the 7 days before today logged: 1,800 / 1,900 / 2,000 / 2,100 / 1,700 kcal, 90 / 100 / 110 / 120 / 80 g protein.
    food(d(1), 1800, 90),
    food(d(2), 1900, 100),
    food(d(3), 2000, 110),
    food(d(5), 2100, 120),
    food(d(7), 1700, 80),
    // A drink from the water screen alone does not make a day logged.
    food(d(6), 120, 6, { via: 'water' }),
    // Today so far.
    food(TODAY, 1250, 60),
  ];
  const activities = over.activities ?? [
    // Three earlier weeks of a usual 200 guideline minutes, then this week.
    ...[8, 15, 22].flatMap((n) => [act(d(n), 'running', 50, 9.8, { intensity: 'vigorous' }), act(d(n + 2), 'walking', 100, 3.5)]),
    act(d(0), 'volleyball', 60, 4),
    act(d(2), 'volleyball', 60, 4),
    act(d(1), 'running', 30, 9.8, { intensity: 'vigorous' }),
    act(d(4), 'running', 30, 9.8, { intensity: 'vigorous' }),
    act(d(5), 'walking', 40, 3.5),
  ];
  const weights = over.weights ?? [weigh(d(21), 92.8), weigh(d(14), 92.3), weigh(d(7), 91.8), weigh(d(0), 91.3)];
  const sleep = over.sleep ?? [night(d(0), 7.5), night(d(1), 6.5), night(d(2), 7), night(d(3), 8), night(d(4), 7)];
  const water = [drink(d(1), 2000), drink(d(2), 2200), drink(d(3), 1800), drink(d(1), 300, { fromEntryId: 'x' })];
  return {
    profile: over.profile ?? PROFILE,
    foodEntries: byId(foods),
    activities: byId(activities),
    weights: byId(weights),
    sleep: byId(sleep),
    water: byId(water),
    days: {},
  };
}

describe('the note from a worked store', () => {
  const note = coachNote(worked(), TODAY, 'android');
  const lines = note.lines;

  it('the goal and its weekly pace', () => {
    expect(lines[0]).toBe('Goal: lose weight, about 0.4 kg a week.');
  });

  it('food over the 7 days before today, against the budget, protein as a share of its goal; and today so far', () => {
    // 500 g eaten over 5 days against 5 x the target (147 g at this profile): 68%, said as 70%.
    expect(macroTargets(PROFILE, 2000).proteinG).toBe(147);
    expect(lines[1]).toBe(
      'Food, the 7 days before today: logged on 5 days; on those days about 1,900 kcal a day against an average budget of 2,000 kcal; protein at about 70% of its goal on average.',
    );
    expect(lines[2]).toBe('Today so far: 1,250 kcal eaten, 750 kcal left in the budget.');
  });

  it('training over the last 7 days, from every workout, with the overview title', () => {
    const o = trainingOverview(Object.values(worked().activities), TODAY);
    expect(o.title).not.toBeNull();
    expect(lines[3]).toBe(
      `Training, last 7 days: ${o.minutes} active minutes in 5 sessions (running 2, volleyball 2, walking 1). Overview: ${o.title}. 2 days without a session.`,
    );
  });

  it('sleep, the weight trend as a direction and rate, and water as a share of its goal', () => {
    expect(lines[4]).toBe('Sleep: about 7 h 12 min a night on average, 5 of the last 7 nights recorded.');
    expect(lines[5]).toMatch(/^Weight trend: going down, about 0\.\d kg a week\.$/);
    // Tracked days only; a drink that came from the diary still counts in the total (300 ml on d(1)):
    // 6,300 ml against 3 x 2,500 ml is 84%, said as 85%.
    expect(lines[6]).toBe('Water, the 7 days before today: tracked on 3 days; on those days water at about 85% of its goal on average.');
    expect(lines).toHaveLength(7);
    expect(note.text).toBe(lines.join('\n'));
  });

  it('holds nothing from the never-list', () => {
    const t = note.text;
    for (const planted of ['Zelda', 'Quixote', '@', 'example.com', '91.3', '91,3', '171', 'female', 'woman', '1987', '04-19', 'Pickle', 'Soup', 'Grandma', 'Wilhelmina', 'knee', 'Forerunner', '965', '163', '187', 'bpm', 'heart', ':', 'gym'])
      expect(t, planted).not.toContain(planted === ':' ? '06:47' : planted);
    expect(t).not.toMatch(/\d{1,2}:\d{2}/);
    expect(t).not.toMatch(/\b(age|aged|years old|born|tall|weigh|weighs)\b/i);
  });

  it('is plain text the server accepts: no control, invisible or direction characters', () => {
    expect(note.text).not.toMatch(new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u00A0\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2069\\u2028\\u2029\\uFEFF]'));
  });

  it('is at most 900 characters, in imperial and with big numbers too', () => {
    expect(note.text.length).toBeLessThanOrEqual(NOTE_MAX);
    const big = worked({ profile: { ...PROFILE, units: 'imperial', goal: 'gain', weeklyRateKg: 0.25 } });
    const many = Array.from({ length: 30 }, (_, i) => act(addDays(TODAY, -(i % 7)), ['rowing', 'swimming', 'cycling', 'yoga', 'running'][i % 5], 600, 8, { intensity: 'vigorous' }));
    const b = coachNote({ ...big, activities: byId(many) }, TODAY, 'android');
    expect(b.text.length).toBeLessThanOrEqual(NOTE_MAX);
    expect(b.lines[0]).toBe('Goal: gain weight, about 0.6 lb a week.');
    expect(b.text).not.toMatch(/fl oz|\bml\b|\bcups?\b/);
  });

  it('leaves out a line whose data does not exist', () => {
    const bare = coachNote({ ...worked({ activities: [], weights: [], sleep: [night(TODAY, 7)] }), foodEntries: {}, water: {} }, TODAY, 'android');
    expect(bare.lines).toEqual(['Goal: lose weight, about 0.4 kg a week.', 'Today so far: nothing logged; the budget is 2,000 kcal.']);
    expect(coachNote({ ...worked(), profile: null }, TODAY, 'web').text).toBe('');
    expect(coachNote(worked({ profile: { ...PROFILE, goal: 'maintain', weeklyRateKg: 0 } }), TODAY, 'web').lines[0]).toBe('Goal: keep weight steady.');
  });

  it('buildCoachNote is the text', () => {
    expect(buildCoachNote(worked(), TODAY, 'android')).toBe(note.text);
  });
});

// The never-list's last item: friends' meals. Friends live on the server and in the friends store (`useFriends`),
// never in the app's store, so the note cannot read them: a friend's meal in the feed and a meal the person shows
// change nothing when they sit beside the store, and the note's code reaches no friends code at all.
describe("friends' meals", () => {
  const theirs: FeedMeal = {
    kind: 'meal',
    ref: 'a'.repeat(32),
    day: TODAY,
    meal: 'dinner',
    showKcal: true,
    items: [{ name: 'Marjoram Tahini Dressing', emoji: '🥗', portion: '2 tbsp · 30 g', source: 'custom', kcal: 777 }],
    cheered: true,
    userId: 'friend-1',
    displayName: 'Ottoline Brackenbury',
    avatar: 'OB',
  };
  const mine: MySharedMeal = {
    ref: 'b'.repeat(32),
    day: TODAY,
    meal: 'lunch',
    showKcal: false,
    items: [{ name: 'Secret Pickle Soup', portion: '1 bowl', source: 'custom' }],
    shownAt: '2026-11-23T12:40:00Z',
    expiresAt: '2026-11-30T12:40:00Z',
    viewers: [{ userId: 'friend-2', displayName: 'Peregrine Throckmorton', avatar: 'PT' }],
    cheers: 3,
  };

  it('a friend’s meal and a meal shown to friends, held beside the store, change nothing and are found nowhere', () => {
    const plain = coachNote(worked(), TODAY, 'android');
    const withFriends = { ...worked(), friends: { feed: [theirs], myMeals: [mine], friends: [{ userId: 'friend-1', displayName: 'Ottoline Brackenbury', avatar: 'OB' }] } } as NoteState;
    const both = coachNote(withFriends, TODAY, 'android');
    expect(both.text).toBe(plain.text);
    for (const planted of ['Ottoline', 'Brackenbury', 'Peregrine', 'Throckmorton', 'Marjoram', 'Tahini', 'Dressing', '777', 'friend', 'shown', 'cheer'])
      expect(both.text.toLowerCase(), planted).not.toContain(planted.toLowerCase());
    expect(buildCoachNote(withFriends, TODAY, 'ios')).toBe(coachNote(worked(), TODAY, 'ios').text);
  });

  it('note.ts reaches no friends code, directly or through its imports (the code map)', () => {
    const map = new Map<string, string[]>();
    for (const line of readFileSync(join(__dirname, '../../../docs/code-map/imports.tsv'), 'utf8').split('\n')) {
      const [file, ...deps] = line.split('\t');
      if (file) map.set(file, deps.filter(Boolean));
    }
    expect(map.get('src/features/coach/note.ts')?.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    const todo = ['src/features/coach/note.ts'];
    while (todo.length) {
      const f = todo.pop()!;
      if (seen.has(f)) continue;
      seen.add(f);
      todo.push(...(map.get(f) ?? []));
    }
    const friendsCode = [...seen].filter((f) => f.startsWith('src/features/friends/') || /^src\/services\/friends/.test(f));
    expect(friendsCode).toEqual([]);
  });
});

describe('the iPhone rule', () => {
  const d = (n: number) => addDays(TODAY, -n);
  const health = { source: 'health' as const };

  it('its constant agrees with the Apple Health permission sentence in app.json', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'app.json'), 'utf8'));
    // The HealthKit config plugin's options carry the sentence iOS shows when access is asked.
    const sentences = (app.expo.plugins as unknown[])
      .filter((p): p is [string, Record<string, unknown>] => Array.isArray(p) && typeof p[1] === 'object' && p[1] !== null)
      .map((p) => p[1].NSHealthShareUsageDescription)
      .filter((v): v is string => typeof v === 'string');
    expect(sentences).toHaveLength(1);
    const sentence = sentences[0];
    expect(typeof sentence).toBe('string');
    expect(sentence.includes(APPLE_HEALTH_PROMISE)).toBe(APPLE_HEALTH_LEFT_OUT);
  });

  it('without records from Apple Health an iPhone note is the same as anywhere else', () => {
    const ios = coachNote(worked(), TODAY, 'ios');
    expect(ios.text).toBe(coachNote(worked(), TODAY, 'android').text);
    expect(ios.appleNote).toBe(false);
  });

  it('with records from Apple Health: they are left out, and so are the budget figures they fed', () => {
    const state = worked({
      activities: [act(d(1), 'running', 45, 9.8, { ...health, intensity: 'vigorous' }), act(d(2), 'volleyball', 60, 4)],
      weights: [weigh(d(20), 93, health), weigh(d(10), 92, health), weigh(d(1), 91, health)],
      sleep: [night(d(0), 7, health), night(d(1), 7, health), night(d(2), 7, health), night(d(3), 7, health)],
    });
    const ios = coachNote(state, TODAY, 'ios');
    expect(ios.appleNote).toBe(true);
    const t = ios.text;
    expect(t).not.toMatch(/budget|target|goal of/);
    expect(t).toContain('Food, the 7 days before today: logged on 5 days; on those days about 1,900 kcal a day.');
    expect(t).not.toMatch(/protein|%/);
    expect(t).toContain('Today so far: 1,250 kcal eaten.');
    // The hand-logged volleyball is there; the synced run is not.
    expect(t).toMatch(/Training, last 7 days: \d+ active minutes in 1 session \(volleyball 1\)/);
    expect(t).not.toMatch(/running/);
    expect(t).not.toMatch(/Sleep|Weight trend/);
    expect(t).toContain('Water, the 7 days before today: tracked on 3 days.');

    // On Android (no such sentence) and the web the same store is shared whole.
    const android = coachNote(state, TODAY, 'android');
    expect(android.appleNote).toBe(false);
    expect(android.text).toMatch(/running 1/);
    expect(android.text).toMatch(/Sleep: about 7 h a night/);
    expect(android.text).toMatch(/against an average budget/);
  });

  it('a health record older than 35 days does not take the budget out; the record itself still stays out', () => {
    const state = worked({ weights: [weigh(d(40), 93, health), weigh(d(14), 92.3), weigh(d(7), 91.8), weigh(d(0), 91.3)] });
    const ios = coachNote(state, TODAY, 'ios');
    expect(ios.appleNote).toBe(true);
    expect(ios.text).toMatch(/against an average budget of 2,000 kcal/);
  });

  // "Learn from my data": the budget of each of the 7 days before today is worked out from the 28 days
  // behind that day, so a health workout up to 35 days old can have fed a budget the note reads.
  const learning = { ...PROFILE, useAdaptiveTdee: true, calorieTargetOverride: undefined, waterGoalMlOverride: undefined };
  const handLogged = [act(d(2), 'volleyball', 60, 4), act(d(9), 'walking', 60, 3.5)];
  for (const age of [28, 33, 35]) {
    it(`a health workout ${age} days old takes the budget figures out on iPhone, and not on Android`, () => {
      const state = worked({ profile: learning, activities: [...handLogged, act(d(age), 'running', 50, 9.8, { ...health, intensity: 'vigorous' })] });
      const ios = coachNote(state, TODAY, 'ios');
      expect(ios.appleNote).toBe(true);
      expect(ios.text).not.toMatch(/budget|target|goal|%/);
      expect(ios.text).toContain('Food, the 7 days before today: logged on 5 days; on those days about 1,900 kcal a day.');
      const android = coachNote(state, TODAY, 'android');
      expect(android.text).toMatch(/against an average budget of [\d,]+ kcal; protein at about \d+% of its goal on average\./);
      expect(android.text).toMatch(/water at about \d+% of its goal on average/);
    });
  }

  it('a health workout 36 days old no longer takes them out', () => {
    const state = worked({ profile: learning, activities: [...handLogged, act(d(36), 'running', 50, 9.8, { ...health, intensity: 'vigorous' })] });
    expect(coachNote(state, TODAY, 'ios').text).toMatch(/against an average budget/);
  });

  it('a profile weight taken over from an older health weigh-in takes them out too', () => {
    const weights = [weigh(d(60), 91.3, health), weigh(d(14), 92.3), weigh(d(7), 91.8)];
    const ios = coachNote(worked({ weights }), TODAY, 'ios');
    expect(ios.text).not.toMatch(/budget|target|goal|%/);
    // A different weight in the profile (typed since) leaves them in.
    expect(coachNote(worked({ weights, profile: { ...PROFILE, weightKg: 90.2 } }), TODAY, 'ios').text).toMatch(/against an average budget/);
    expect(coachNote(worked({ weights }), TODAY, 'android').text).toMatch(/against an average budget/);
  });
});

describe('the body weight cannot be worked out from the note', () => {
  // The protein target is the reference weight times PROTEIN_PER_KG, the automatic water goal 33 ml a kg:
  // no figure in the note, divided by those factors, may come near the weight planted.
  const FACTORS = [1.6, 1.8, 2.0, 33];
  // Weights clear of figures that match by chance (1,900 kcal / 33 is 57.6; a share of 95% / 1.8 is 52.8).
  const PLANTED = [64.8, 69.7, 76.2, 87.9, 104.6];
  for (const kg of PLANTED) {
    it(`${kg} kg`, () => {
      const d = (n: number) => addDays(TODAY, -n);
      const profile: Profile = { ...PROFILE, weightKg: kg, heightCm: 180, waterGoalMlOverride: undefined };
      const state = worked({ profile, weights: [weigh(d(21), kg), weigh(d(14), kg), weigh(d(7), kg), weigh(d(0), kg)] });
      for (const os of ['android', 'web', 'ios']) {
        const t = coachNote(state, TODAY, os).text;
        expect(t).toMatch(/protein at about \d+% of its goal/);
        expect(t).toMatch(/water at about \d+% of its goal/);
        const numbers = (t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
        for (const n of numbers) for (const f of FACTORS) expect(Math.abs(n / f - kg), `${n} / ${f}`).toBeGreaterThanOrEqual(2);
        expect(t).not.toMatch(/\d\s*g\b|\bg protein/);
        expect(t).not.toMatch(/\d\s*(ml|l|fl oz|cups?|oz)\b/i);
      }
    });
  }
});
