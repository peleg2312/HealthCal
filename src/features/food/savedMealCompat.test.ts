/**
 * The older-copy proofs for `SavedMeal.favoriteAt`: a copy of the app made before favourite meals runs
 * the same saved-meal writers, sync merge and backup code as this one (none of these paths changed for
 * the field), so each is run here on a stored meal that holds `favoriteAt` and a field no version knows
 * yet. Every one keeps both: an older phone that edits, renames, deletes and restores, pulls or backs up
 * a starred meal never drops the star, and pushes it back whole.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Toast = { message: string; opts?: { label?: string; onPress?: () => void } };
const toasts: Toast[] = [];
vi.mock('@/ui', () => ({
  toast: (message: string, opts?: Toast['opts']) => toasts.push({ message, opts }),
  haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} },
}));

import { backupJson, isValidRecord, mergeCollections, parseBackup, type BackupSource } from '@/features/settings/exportFormat';
import { COLLECTIONS, useStore } from '@/store';
import type { SavedMeal, SavedMealItem } from '@/types';

import { deleteSavedMeal, renameSavedMeal, storeSavedMeal } from './actions';

const S = () => useStore.getState();
const STAR = '2026-11-20T09:30:00.000Z';
const FUTURE = { kept: ['by', 'every', 'writer'] };
type Stored = SavedMeal & { futureField?: unknown };

const item = (name: string): SavedMealItem => ({
  name,
  servingLabel: '1 serving',
  quantity: 1,
  grams: 120,
  nutrients: { kcal: 250, protein: 12, carbs: 30, fat: 8 },
  source: 'ai',
  verified: false,
  kcalRange: [200, 310],
  confidence: 0.6,
});

let clock = Date.parse('2026-11-24T08:00:00.000Z');
const tick = () => {
  clock += 1000;
  vi.setSystemTime(clock);
};

function storedMeal(): Stored {
  return S().upsert('savedMeals', { name: 'Chicken and rice', items: [item('Chicken'), item('Rice')], favoriteAt: STAR, futureField: FUTURE } as Partial<Stored> & { name: string; items: SavedMealItem[] }) as Stored;
}
const now = (id: string) => S().savedMeals[id] as Stored;
const expectKept = (m: Stored) => {
  expect(m.favoriteAt).toBe(STAR);
  expect(m.futureField).toEqual(FUTURE);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = Date.parse('2026-11-24T08:00:00.000Z');
  vi.setSystemTime(clock);
  S().resetAll();
  toasts.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('an older copy keeps favoriteAt (and any field it does not know)', () => {
  it('the meal builder (storeSavedMeal spreads the stored record) and its Undo', () => {
    const m = storedMeal();
    tick();
    storeSavedMeal({ id: m.id, name: 'Chicken, rice', servings: null, items: [item('Chicken')] });
    expectKept(now(m.id));
    expect(now(m.id).name).toBe('Chicken, rice');
    tick();
    toasts[toasts.length - 1].opts!.onPress!();
    expectKept(now(m.id));
    expect(now(m.id).items).toHaveLength(2);
  });

  it('a rename', () => {
    const m = storedMeal();
    tick();
    renameSavedMeal(m, 'Lunch bowl');
    expectKept(now(m.id));
    expect(now(m.id).name).toBe('Lunch bowl');
  });

  it('a delete, then its Undo (restore)', () => {
    const m = storedMeal();
    tick();
    deleteSavedMeal(m);
    expectKept(now(m.id));
    expect(now(m.id).deleted).toBe(true);
    tick();
    toasts[toasts.length - 1].opts!.onPress!();
    expectKept(now(m.id));
    expect(now(m.id).deleted).toBe(false);
  });

  it('a pull of a newer remote copy (sync stores the row whole)', () => {
    // sync.ts turns a pulled row into a record by spreading its data whole; this is that line.
    const sync = readFileSync(resolve(__dirname, '../../services/sync.ts'), 'utf8');
    expect(sync).toMatch(/const toRecord = \(r: RemoteRow\) => \(\{ collection: r\.collection, record: \{ \.\.\.r\.data, id: r\.id, updatedAt: canonicalTime\(r\.updated_at\), deleted: r\.deleted \} \}\);/);
    // And a push sends the stored record whole as the row's data.
    expect(sync).toMatch(/data: rec,/);
    const m = storedMeal();
    const row = { collection: 'savedMeals' as const, id: m.id, data: { ...m, name: 'From the other phone' }, updated_at: '2026-11-24T09:00:00.000Z', deleted: false };
    const record = { ...row.data, id: row.id, updatedAt: row.updated_at, deleted: row.deleted };
    S().mergeRemote({ records: [{ collection: row.collection, record }], pulledAt: '2026-11-24T09:00:01.000Z' });
    expectKept(now(m.id));
    expect(now(m.id).name).toBe('From the other phone');
  });

  it('a backup and its restore round trip (parseBackup keeps unknown fields; a merge replaces whole records)', () => {
    const m = storedMeal();
    const s = S();
    const collections = {} as BackupSource['collections'];
    for (const c of COLLECTIONS) collections[c] = s[c];
    const text = backupJson({ profile: s.profile, settings: s.settings, collections, favoriteFoodIds: [], recentFoods: [], recentActivityIds: [] });
    expect(isValidRecord('savedMeals', m)).toBe(true);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = parsed.backup.collections.savedMeals[0] as Stored;
    expectKept(back);
    S().resetAll();
    const merged = mergeCollections(
      Object.fromEntries(COLLECTIONS.map((c) => [c, S()[c]])) as unknown as Parameters<typeof mergeCollections>[0],
      parsed.backup.collections,
    );
    expectKept(merged.collections.savedMeals[m.id] as Stored);
  });

  it('the validator takes a starred meal, and a meal whose favoriteAt is junk, as valid (readers just ignore junk)', () => {
    const m = storedMeal();
    expect(isValidRecord('savedMeals', { ...m, favoriteAt: 12 })).toBe(true);
    expect(isValidRecord('savedMeals', { ...m, favoriteAt: 'soon' })).toBe(true);
  });
});
