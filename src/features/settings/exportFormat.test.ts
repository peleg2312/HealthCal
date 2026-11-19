import { describe, expect, it } from 'vitest';

import {
  activitiesCsv,
  backupJson,
  BACKUP_COLLECTIONS,
  csvCell,
  foodCsv,
  isValidProfile,
  isValidRecord,
  mergeCollections,
  parseBackup,
  waterCsv,
  weightCsv,
  type BackupSource,
} from './exportFormat';
import type { ActivityEntry, FoodEntry, Settings, WaterEntry, WeightEntry } from '@/types';

const U1 = '0b6f3c1e-8f0a-4c49-9d3e-1a2b3c4d5e6f';
const U2 = '1c7a4d2f-9a1b-4d5a-8e4f-2b3c4d5e6f70';
const U3 = '2d8b5e3a-0b2c-4e6b-9f50-3c4d5e6f7081';

const SETTINGS = { theme: 'system', haptics: true, celebrations: true, waterPresets: [250], fastingTargetHours: 16, updatedAt: '' } as unknown as Settings;

const food = (over: Partial<FoodEntry>): FoodEntry => ({
  id: 'f1',
  updatedAt: '2026-11-10T10:00:00.000Z',
  date: '2026-11-10',
  meal: 'lunch',
  name: 'Chicken breast, grilled',
  source: 'builtin',
  verified: false,
  servingLabel: '1 breast',
  quantity: 1,
  grams: 172,
  nutrients: { kcal: 283.8, protein: 53.32, carbs: 0, fat: 6.19 },
  loggedAt: '2026-11-10T10:00:00.000Z',
  ...over,
});

function emptySource(): BackupSource {
  const collections = Object.fromEntries(BACKUP_COLLECTIONS.map((c) => [c, {}])) as BackupSource['collections'];
  return { profile: null, settings: SETTINGS, collections, favoriteFoodIds: [], recentFoods: [], recentActivityIds: [] };
}

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('Rice, cooked')).toBe('"Rice, cooked"');
    expect(csvCell('5" sub')).toBe('"5"" sub"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });
  it('neutralises formulas and formats numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-3.456)).toBe('-3.46');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });
});

describe('CSV tables', () => {
  it('builds the food table sorted by date and meal, skipping deleted rows', () => {
    const csv = foodCsv([
      food({ id: 'b', meal: 'dinner', name: 'Salmon' }),
      food({ id: 'a', meal: 'breakfast', name: 'Oats, rolled', kcalRange: [250, 350], source: 'ai' }),
      food({ id: 'c', deleted: true, name: 'Gone' }),
      food({ id: 'd', date: '2026-11-09', name: 'Earlier' }),
    ]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('date,meal,food,brand,quantity,serving,grams,kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,source,kcal_range,logged_at');
    expect(lines).toHaveLength(4);
    expect(lines[1].startsWith('2026-11-09,lunch,Earlier,')).toBe(true);
    expect(lines[2]).toBe('2026-11-10,breakfast,"Oats, rolled",,1,1 breast,172,283.8,53.32,0,6.19,,,,ai,250-350,2026-11-10T10:00:00.000Z');
    expect(lines[3].startsWith('2026-11-10,dinner,Salmon')).toBe(true);
    expect(csv).not.toContain('Gone');
  });

  it('builds activity, weight and water tables', () => {
    const act: ActivityEntry = {
      id: 'a1', updatedAt: '', date: '2026-11-10', activityId: 'running', name: 'Running', emoji: '🏃', category: 'cardio',
      intensity: 'moderate', durationMin: 38, met: 9.3, kcalNet: 410.4, kcalGross: 470.2, distanceKm: 6.1, loggedAt: '2026-11-10T07:00:00Z',
    };
    expect(activitiesCsv([act]).split('\r\n')[1]).toBe('2026-11-10,Running,cardio,moderate,38,6.1,9.3,410.4,470.2,');
    const w: WeightEntry = { id: 'w1', updatedAt: 'x', date: '2026-11-10', kg: 80.25, bodyFatPct: 18, note: 'after run' };
    expect(weightCsv([w]).split('\r\n')[1]).toBe('2026-11-10,80.25,18,,,,after run');
    const water: WaterEntry = { id: 'h1', updatedAt: '', date: '2026-11-10', ml: 250, beverage: 'coffee', loggedAt: '2026-11-10T08:00:00Z' };
    expect(waterCsv([water]).split('\r\n')[1]).toBe('2026-11-10,coffee,250,225,2026-11-10T08:00:00Z,');
  });
});

describe('JSON backup', () => {
  it('round-trips through parseBackup with live records only', () => {
    const src = emptySource();
    src.collections.foodEntries = { [U1]: food({ id: U1 }), [U2]: food({ id: U2, deleted: true }) };
    src.favoriteFoodIds = ['b_oats'];
    const json = backupJson(src, new Date('2026-11-13T12:00:00Z'));
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.exportedAt).toBe('2026-11-13T12:00:00.000Z');
    expect(parsed.backup.collections.foodEntries.map((r) => r.id)).toEqual([U1]);
    expect(parsed.skipped).toBe(0);
    expect(parsed.backup.collections.weights).toEqual([]);
    expect(parsed.backup.favoriteFoodIds).toEqual(['b_oats']);
  });

  it('rejects files that are not backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    const future = parseBackup(JSON.stringify({ format: 'healthcal-backup', version: 99 }));
    expect(future.ok).toBe(false);
  });

  it('merges by id and keeps the newer record', () => {
    const local = emptySource().collections;
    local.foodEntries = {
      same: food({ id: 'same', updatedAt: '2026-11-10T10:00:00Z', name: 'Local' }),
      older: food({ id: 'older', updatedAt: '2026-11-01T10:00:00Z', name: 'Local old' }),
      newer: food({ id: 'newer', updatedAt: '2026-11-12T10:00:00Z', name: 'Local new' }),
    };
    const incoming = Object.fromEntries(BACKUP_COLLECTIONS.map((c) => [c, []])) as unknown as Parameters<typeof mergeCollections>[1];
    incoming.foodEntries = [
      food({ id: 'same', updatedAt: '2026-11-10T10:00:00Z', name: 'Backup' }),
      food({ id: 'older', updatedAt: '2026-11-05T10:00:00Z', name: 'Backup newer' }),
      food({ id: 'newer', updatedAt: '2026-11-02T10:00:00Z', name: 'Backup older' }),
      food({ id: 'fresh', name: 'Only in backup' }),
    ];
    const res = mergeCollections(local, incoming);
    const names = Object.fromEntries(Object.values(res.collections.foodEntries).map((r) => [r.id, (r as FoodEntry).name]));
    expect(names).toEqual({ same: 'Local', older: 'Backup newer', newer: 'Local new', fresh: 'Only in backup' });
    expect(res.added).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.unchanged).toBe(2);
    expect(res.changed.foodEntries.sort()).toEqual(['fresh', 'older']);
  });
});

describe('backup validation', () => {
  const wrap = (collections: Record<string, unknown[]>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ format: 'healthcal-backup', version: 1, collections, ...extra });

  it('skips records the sync server or the screens would choke on', () => {
    const parsed = parseBackup(
      wrap({
        foodEntries: [
          food({ id: U1 }),
          food({ id: 'abc' }),
          food({ id: U2, updatedAt: 'yesterday' }),
          { ...food({ id: U3 }), nutrients: undefined },
          food({ id: '3e9c6f4b-1c3d-4f7c-8a61-4d5e6f708192', date: '2026-02-31' }),
        ],
        water: [{ id: U1, updatedAt: '2026-11-10T10:00:00Z', date: '2026-11-10', ml: 'lots', beverage: 'water', loggedAt: '' }],
        weights: [{ id: U2, updatedAt: '2026-11-10T10:00:00Z', date: '2026-11-10', kg: 80.2 }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.collections.foodEntries.map((r) => r.id)).toEqual([U1]);
    expect(parsed.backup.collections.water).toEqual([]);
    expect(parsed.backup.collections.weights).toHaveLength(1);
    expect(parsed.skipped).toBe(5);
  });

  it('drops a malformed profile, settings and recent foods', () => {
    const parsed = parseBackup(
      wrap({}, { profile: { name: 'x', updatedAt: '2026-11-10T10:00:00Z', heightCm: 'tall' }, settings: 'dark', recentFoods: [{ id: 'b_x' }, null] }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.profile).toBeNull();
    expect(parsed.backup.settings).toBeNull();
    expect(parsed.backup.recentFoods).toEqual([]);
    expect(parsed.skipped).toBe(1);
  });

  it('accepts the morning page settings as optional and drops malformed ones', () => {
    const base = { theme: 'system', haptics: true, updatedAt: '2026-11-10T10:00:00Z' };
    const settingsOf = (extra: Record<string, unknown>) => {
      const parsed = parseBackup(wrap({}, { settings: { ...base, ...extra } }));
      return parsed.ok ? parsed.backup.settings : 'not ok';
    };
    expect(settingsOf({})).toEqual(base);
    expect(settingsOf({ morningSummary: false, morningSeenDay: '2026-11-16' })).toEqual({ ...base, morningSummary: false, morningSeenDay: '2026-11-16' });
    expect(settingsOf({ morningSummary: 'yes' })).toBeNull();
    expect(settingsOf({ morningSeenDay: '2026-02-30' })).toBeNull();
    expect(settingsOf({ morningSeenDay: 20261116 })).toBeNull();
  });

  it('checks a night\'s rating and the fields of a synced night', () => {
    const night = (extra: Record<string, unknown> = {}) => ({ id: U1, updatedAt: '2026-11-10T10:00:00Z', date: '2026-11-10', hours: 7.25, ...extra });
    const synced = {
      source: 'health',
      store: 'healthConnect',
      origin: 'com.garmin.android.apps.connectmobile',
      startedAt: '2026-11-09T22:41:00.000Z',
      endedAt: '2026-11-10T06:12:00.000Z',
      stages: { light: 230, deep: 75, rem: 110, awake: 16 },
    };
    const ok = (extra: Record<string, unknown>) => isValidRecord('sleep', night(extra));
    expect(ok({ quality: 4 })).toBe(true);
    expect(ok({})).toBe(true); // a synced night has no rating until the person gives one
    expect(ok(synced)).toBe(true);
    expect(ok({ ...synced, stages: null, quality: 2 })).toBe(true);
    expect(ok({ ...synced, store: 'file' })).toBe(true);
    expect(ok({ quality: 0 })).toBe(false);
    expect(ok({ quality: 6 })).toBe(false);
    expect(ok({ quality: 3.5 })).toBe(false);
    expect(ok({ quality: '3' })).toBe(false);
    expect(ok({ source: 'garmin' })).toBe(false);
    expect(ok({ store: 'fitbit' })).toBe(false);
    expect(ok({ origin: 42 })).toBe(false);
    expect(ok({ startedAt: 'last night' })).toBe(false);
    expect(ok({ endedAt: 1731218000 })).toBe(false);
    expect(ok({ stages: { light: 230, deep: 75, rem: 110 } })).toBe(false);
    expect(ok({ stages: { light: -1, deep: 75, rem: 110, awake: 0 } })).toBe(false);
    expect(ok({ stages: [230, 75, 110, 16] })).toBe(false);
  });

  it('round-trips a synced weigh-in and checks its fields; old weigh-ins stay valid', () => {
    const weigh = (extra: Record<string, unknown> = {}) => ({ id: U1, updatedAt: '2026-11-10T10:00:00Z', date: '2026-11-10', kg: 82.4, ...extra });
    const synced = {
      bodyFatPct: 18.2,
      source: 'health',
      store: 'healthConnect',
      origin: 'com.garmin.android.apps.connectmobile',
      measuredAt: '2026-11-10T05:12:00.000Z',
      syncedKg: 82.4,
      syncedBodyFatPct: 18.2,
      waistCm: 88,
    };
    const ok = (extra: Record<string, unknown>) => isValidRecord('weights', weigh(extra));
    expect(ok({})).toBe(true); // a weigh-in entered by hand, as every backup before this held
    expect(ok({ bodyFatPct: 20, note: 'after run' })).toBe(true);
    expect(ok(synced)).toBe(true);
    expect(ok({ ...synced, store: 'healthKit', origin: 'com.apple.Health', measuredAt: '2026-11-10T05:12:00Z' })).toBe(true);
    expect(ok({ source: 'garmin' })).toBe(false);
    expect(ok({ ...synced, store: 'fitbit' })).toBe(false);
    expect(ok({ ...synced, origin: 7 })).toBe(false);
    expect(ok({ ...synced, measuredAt: 'this morning' })).toBe(false);
    expect(ok({ ...synced, syncedKg: '82.4' })).toBe(false);
    expect(ok({ ...synced, syncedBodyFatPct: 'x' })).toBe(false);
    const parsed = parseBackup(wrap({ weights: [weigh(synced)] }));
    expect(parsed.ok && parsed.backup.collections.weights).toEqual([weigh(synced)]);
  });

  it('round-trips a workout\'s heart rate', () => {
    const act = { id: U2, updatedAt: '2026-11-10T10:00:00Z', date: '2026-11-10', name: 'Running', durationMin: 45, kcalNet: 420, kcalGross: 510, avgHeartRate: 142, maxHeartRate: 171 };
    expect(isValidRecord('activities', act)).toBe(true);
    expect(isValidRecord('activities', { ...act, maxHeartRate: 'high' })).toBe(false);
    expect(isValidRecord('activities', { ...act, avgHeartRate: '142' })).toBe(false);
    const parsed = parseBackup(wrap({ activities: [act] }));
    expect(parsed.ok && parsed.backup.collections.activities).toEqual([act]);
  });

  it('keeps a valid profile', () => {
    const profile = {
      name: 'A', sex: 'female', birthDate: '1990-04-21', heightCm: 170, weightKg: 70, activityLevel: 'light', goal: 'lose', weeklyRateKg: 0.5,
      units: 'metric', eatBackExercise: true, useAdaptiveTdee: true, updatedAt: '2026-11-10T10:00:00Z',
    };
    const parsed = parseBackup(wrap({}, { profile }));
    expect(parsed.ok && parsed.backup.profile).toEqual(profile);
  });

  it('accepts how workout calories are placed, and refuses what it cannot read', () => {
    const base = {
      name: 'A', sex: 'female', birthDate: '1990-04-21', heightCm: 170, weightKg: 70, activityLevel: 'light', goal: 'lose', weeklyRateKg: 0.5,
      units: 'metric', eatBackExercise: true, useAdaptiveTdee: true, updatedAt: '2026-11-10T10:00:00Z',
    };
    const history = [{ until: '2026-11-01', rule: 'off' }, { until: '2026-11-16', rule: 'day' }];
    for (const extra of [{ exerciseSpread: 'day' }, { exerciseSpread: 'week' }, {}, { exerciseSpread: 'week', exerciseRuleHistory: history }, { exerciseRuleHistory: [] }]) {
      expect(isValidProfile({ ...base, ...extra })).toBe(true);
    }
    const parsed = parseBackup(wrap({}, { profile: { ...base, exerciseSpread: 'week', exerciseRuleHistory: history } }));
    expect(parsed.ok && parsed.backup.profile).toEqual({ ...base, exerciseSpread: 'week', exerciseRuleHistory: history });
    for (const extra of [
      { exerciseSpread: 'month' },
      { exerciseRuleHistory: [{ rule: 'day' }] },
      { exerciseRuleHistory: [{ until: '16/11/2026', rule: 'day' }] },
      { exerciseRuleHistory: [{ until: '2026-11-16', rule: 'month' }] },
      { exerciseRuleHistory: [null] },
      { exerciseRuleHistory: { until: '2026-11-16', rule: 'day' } },
    ]) {
      expect(isValidProfile({ ...base, ...extra })).toBe(false);
    }
  });
});

describe('a drink logged in the diary in a backup (src/features/drinks/diary.ts)', () => {
  const wrap = (collections: Record<string, unknown[]>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ format: 'healthcal-backup', version: 1, collections, ...extra });
  const waterRec = (over: Record<string, unknown>) => ({ id: U1, updatedAt: '2026-11-19T12:40:00.000Z', date: '2026-11-19', ml: 500, beverage: 'other', drink: 'food', loggedAt: '2026-11-19T12:40:00.000Z', ...over });

  it('keeps the water record\'s link to its entry, and refuses a link that is not an id', () => {
    expect(isValidRecord('water', waterRec({ fromEntryId: U2 }))).toBe(true);
    expect(isValidRecord('water', waterRec({}))).toBe(true);
    expect(isValidRecord('water', waterRec({ fromEntryId: 'lunch' }))).toBe(false);
    expect(isValidRecord('water', waterRec({ fromEntryId: 42 }))).toBe(false);
    // Both links are not rejected (foodEntryId is read first).
    expect(isValidRecord('water', waterRec({ fromEntryId: U2, foodEntryId: U3 }))).toBe(true);
    const parsed = parseBackup(wrap({ water: [waterRec({ fromEntryId: U2 })], foodEntries: [food({ id: U2 })] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect((parsed.backup.collections.water[0] as WaterEntry).fromEntryId).toBe(U2);
  });

  it('a food\'s drink flag is a yes or a no, wherever a food is kept', () => {
    const own = { id: U1, updatedAt: '2026-11-19T12:40:00.000Z', name: 'Home shake', per100g: { kcal: 70, protein: 5, carbs: 8, fat: 2 }, servings: [{ label: '1 glass', grams: 350 }], source: 'custom', verified: false };
    expect(isValidRecord('customFoods', { ...own, beverage: true })).toBe(true);
    expect(isValidRecord('customFoods', { ...own, beverage: false })).toBe(true);
    expect(isValidRecord('customFoods', own)).toBe(true);
    expect(isValidRecord('customFoods', { ...own, beverage: 'yes' })).toBe(false);
    expect(isValidRecord('foodEntries', food({ id: U2, food: { ...own, beverage: true } as never }))).toBe(true);
  });

  it('the profile switch is optional and a yes or a no; the backup version stays 1 so older apps read it', () => {
    const base = {
      name: 'A', sex: 'female', birthDate: '1990-04-21', heightCm: 170, weightKg: 70, activityLevel: 'light', goal: 'lose', weeklyRateKg: 0.5,
      units: 'metric', eatBackExercise: true, useAdaptiveTdee: true, updatedAt: '2026-11-10T10:00:00Z',
    };
    expect(isValidProfile(base)).toBe(true);
    expect(isValidProfile({ ...base, diaryDrinksInWater: false })).toBe(true);
    expect(isValidProfile({ ...base, diaryDrinksInWater: true })).toBe(true);
    expect(isValidProfile({ ...base, diaryDrinksInWater: 'off' })).toBe(false);
    const parsed = parseBackup(wrap({}, { profile: { ...base, diaryDrinksInWater: false } }));
    expect(parsed.ok && parsed.backup.profile?.diaryDrinksInWater).toBe(false);
    expect(JSON.parse(backupJson(emptySource())).version).toBe(1);
  });
});
