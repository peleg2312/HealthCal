import { beforeEach, describe, expect, it } from 'vitest';

import { stableId } from '@/lib/hash';
import type { Food, WeightEntry } from '@/types';

import { collapseDateDuplicates, favoriteRecordId, nextStamp, useStore } from './index';

const food = (id: string, source: Food['source'] = 'openfoodfacts'): Food => ({
  id,
  name: id,
  per100g: { kcal: 100, protein: 5, carbs: 10, fat: 4 },
  servings: [{ label: '1 serving', grams: 50 }],
  source,
  verified: false,
});

beforeEach(() => useStore.getState().resetAll());

describe('nextStamp', () => {
  it('is the current time for a new record', () => {
    const t = Date.parse(nextStamp());
    expect(Math.abs(t - Date.now())).toBeLessThan(1000);
  });
  it('never goes backwards: an edit of a version stamped in the future lands just after it', () => {
    const future = new Date(Date.now() + 120_000).toISOString();
    expect(Date.parse(nextStamp(future))).toBe(Date.parse(future) + 1);
  });
});

describe('edit stamps under clock skew', () => {
  it('an edit made on a device whose clock is behind still beats the version it replaced', () => {
    const s = useStore.getState();
    const ahead = new Date(Date.now() + 5 * 60_000).toISOString();
    // A record that arrived from a device whose clock runs five minutes ahead.
    s.mergeRemote({ records: [{ collection: 'water', record: { id: 'w1', updatedAt: ahead, date: '2026-01-05', ml: 250 } as never }], pulledAt: ahead });
    useStore.getState().upsert('water', { id: 'w1', date: '2026-01-05', ml: 400, beverage: 'water', loggedAt: ahead });
    expect(useStore.getState().water.w1.updatedAt > ahead).toBe(true);
    useStore.getState().remove('water', 'w1');
    expect(Date.parse(useStore.getState().water.w1.updatedAt)).toBe(Date.parse(ahead) + 2);
  });
});

describe('one record per date', () => {
  it('weigh-ins for the same date share one stable id, so a second save updates the first', () => {
    const s = useStore.getState();
    const a = s.upsert('weights', { date: '2026-03-01', kg: 80 });
    const b = useStore.getState().upsert('weights', { date: '2026-03-01', kg: 79.4 });
    expect(a.id).toBe(stableId('weights', '2026-03-01'));
    expect(b.id).toBe(a.id);
    const live = Object.values(useStore.getState().weights).filter((w) => !w.deleted);
    expect(live).toHaveLength(1);
    expect(live[0].kg).toBe(79.4);
  });

  it('two records for one date arriving from sync collapse to the newest, and the removal is queued for upload', () => {
    const s = useStore.getState();
    const mine = s.upsert('weights', { date: '2026-03-02', kg: 80 });
    const theirs = { id: '11111111-1111-4111-8111-111111111111', date: '2026-03-02', kg: 79.4, updatedAt: new Date(Date.now() + 60_000).toISOString(), deleted: false } as WeightEntry;
    useStore.getState().mergeRemote({ records: [{ collection: 'weights', record: theirs }], pulledAt: theirs.updatedAt });
    const state = useStore.getState();
    const live = Object.values(state.weights).filter((w) => !w.deleted);
    expect(live.map((w) => w.kg)).toEqual([79.4]);
    expect(state.weights[mine.id].deleted).toBe(true);
    expect(state.dirty.weights[mine.id]).toBe(true);
  });

  it('saving over an older duplicate with a different id retires the duplicate', () => {
    useStore.setState({ weights: { old: { id: 'old', date: '2026-03-03', kg: 81, updatedAt: '2026-03-03T07:00:00.000Z', deleted: false } as WeightEntry } });
    useStore.getState().upsert('weights', { date: '2026-03-03', kg: 80.2 });
    const live = Object.values(useStore.getState().weights).filter((w) => !w.deleted);
    expect(live).toHaveLength(1);
    expect(live[0].kg).toBe(80.2);
  });

  it('collapseDateDuplicates returns the same objects when there is nothing to do', () => {
    const map = { a: { id: 'a', date: '2026-01-01', updatedAt: '2026-01-01T00:00:00.000Z' }, b: { id: 'b', date: '2026-01-02', updatedAt: '2026-01-02T00:00:00.000Z' } };
    const dirty = {};
    const out = collapseDateDuplicates(map, dirty);
    expect(out.map).toBe(map);
    expect(out.dirty).toBe(dirty);
  });
});

describe('favourites', () => {
  it('are stored as records with a stable id and mirrored in favoriteFoodIds', () => {
    const f = food('off_123');
    useStore.getState().toggleFavoriteFood(f);
    let s = useStore.getState();
    expect(s.favoriteFoodIds).toEqual(['off_123']);
    expect(s.favorites[favoriteRecordId('off_123')].food).toEqual(f);
    expect(s.dirty.favorites[favoriteRecordId('off_123')]).toBe(true);
    useStore.getState().toggleFavoriteFood(f);
    s = useStore.getState();
    expect(s.favoriteFoodIds).toEqual([]);
    expect(s.favorites[favoriteRecordId('off_123')].deleted).toBe(true);
  });

  it('survive logging many other foods, because the definition lives in the favourite itself', () => {
    const fav = food('off_fav');
    useStore.getState().toggleFavoriteFood(fav);
    for (let i = 0; i < 80; i++) useStore.getState().rememberFood(food(`off_${i}`));
    const s = useStore.getState();
    expect(s.recentFoods.some((f) => f.id === 'off_fav')).toBe(false);
    expect(s.favorites[favoriteRecordId('off_fav')].food.id).toBe('off_fav');
    expect(s.favoriteFoodIds).toEqual(['off_fav']);
  });

  it('arrive on another device through sync', () => {
    const rec = { id: favoriteRecordId('off_9'), food: food('off_9'), updatedAt: '2026-02-01T00:00:00.000Z', deleted: false };
    useStore.getState().mergeRemote({ records: [{ collection: 'favorites', record: rec }], pulledAt: rec.updatedAt });
    expect(useStore.getState().favoriteFoodIds).toEqual(['off_9']);
  });

  it('an id list saved by an earlier build is turned into records when loading', () => {
    useStore.getState().hydrate({ favoriteFoodIds: ['off_old', 'missing'], recentFoods: [food('off_old')] });
    const s = useStore.getState();
    expect(s.favoriteFoodIds).toEqual(['off_old']);
    expect(s.dirty.favorites[favoriteRecordId('off_old')]).toBe(true);
  });
});

describe('recent foods', () => {
  it('are rebuilt from the diary on a device that has none (first sign-in on a new phone)', () => {
    const entry = (id: string, foodId: string, loggedAt: string) => ({ id, date: '2026-02-01', meal: 'lunch', name: foodId, food: food(foodId), loggedAt, updatedAt: loggedAt, deleted: false });
    useStore.getState().mergeRemote({
      records: [
        { collection: 'foodEntries', record: entry('e1', 'a', '2026-02-01T08:00:00.000Z') as never },
        { collection: 'foodEntries', record: entry('e2', 'b', '2026-02-01T12:00:00.000Z') as never },
        { collection: 'foodEntries', record: entry('e3', 'a', '2026-02-01T19:00:00.000Z') as never },
      ],
      pulledAt: '2026-02-01T20:00:00.000Z',
    });
    expect(useStore.getState().recentFoods.map((f) => f.id)).toEqual(['a', 'b']);
  });
});

describe('mergeLocal (another browser tab)', () => {
  it('takes the newer version of each record and keeps what this tab has that the other lacks', () => {
    const mine = useStore.getState().upsert('water', { date: '2026-01-05', ml: 250, beverage: 'water', loggedAt: '2026-01-05T08:00:00.000Z' });
    const theirs = { id: 'other', date: '2026-01-05', ml: 500, beverage: 'water', loggedAt: '2026-01-05T09:00:00.000Z', updatedAt: '2026-01-05T09:00:00.000Z', deleted: false };
    useStore.getState().mergeLocal({ water: { other: theirs } as never, dirty: { water: { other: true } } as never });
    const s = useStore.getState();
    expect(Object.keys(s.water).sort()).toEqual([mine.id, 'other'].sort());
    expect(s.dirty.water.other).toBe(true);
    expect(s.dirty.water[mine.id]).toBe(true);
  });

  it('changes nothing, not even object identity, when the other tab has nothing newer', () => {
    useStore.getState().upsert('water', { date: '2026-01-05', ml: 250, beverage: 'water', loggedAt: '2026-01-05T08:00:00.000Z' });
    const before = useStore.getState();
    useStore.getState().mergeLocal({ water: { ...before.water }, dirty: before.dirty, profile: before.profile, settings: before.settings });
    const after = useStore.getState();
    expect(after.water).toBe(before.water);
    expect(after.dirty).toBe(before.dirty);
  });
});
