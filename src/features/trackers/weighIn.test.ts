import { describe, expect, it } from 'vitest';

import type { WeightEntry } from '@/types';

import { bodyFatFollowsDelete, ownLatestBodyFat, profileAfterDelete, targetsBehind, weighInAfterEdit } from './helpers';
import { isSyncedWeighIn, weighInFromLine } from './weighInSource';

const GARMIN = 'com.garmin.android.apps.connectmobile';
const hand = (over: Partial<WeightEntry> = {}): WeightEntry => ({ id: 'w', updatedAt: '2026-11-14T08:00:00.000Z', date: '2026-11-14', kg: 82.4, ...over });
const synced = (over: Partial<WeightEntry> = {}): WeightEntry =>
  hand({ bodyFatPct: 18.2, source: 'health', store: 'healthConnect', origin: GARMIN, measuredAt: '2026-11-14T06:12:00.000Z', syncedKg: 82.4, syncedBodyFatPct: 18.2, ...over });
const SYNC_KEYS = ['source', 'store', 'origin', 'measuredAt', 'syncedKg', 'syncedBodyFatPct'];

describe('a synced weigh-in', () => {
  it('is one only while its weight and body fat are what the sync wrote', () => {
    expect(isSyncedWeighIn(synced())).toBe(true);
    expect(isSyncedWeighIn(synced({ kg: 82.404 }))).toBe(true);
    expect(isSyncedWeighIn(synced({ kg: 81 }))).toBe(false);
    expect(isSyncedWeighIn(synced({ bodyFatPct: 20 }))).toBe(false);
    expect(isSyncedWeighIn(synced({ bodyFatPct: undefined }))).toBe(false);
    expect(isSyncedWeighIn(synced({ syncedKg: undefined }))).toBe(false);
    expect(isSyncedWeighIn(hand())).toBe(false);
    expect(isSyncedWeighIn(synced({ bodyFatPct: undefined, syncedBodyFatPct: undefined }))).toBe(true);
  });

  it('says where it came from, and nothing once it is the person\'s', () => {
    expect(weighInFromLine(synced())).toBe('From Garmin Connect');
    expect(weighInFromLine(synced({ store: 'healthKit', origin: 'com.apple.Health' }))).toMatch(/^From /);
    expect(weighInFromLine(synced({ store: 'file' }))).toBe('From your Health export');
    expect(weighInFromLine(synced({ kg: 80 }))).toBeNull();
    expect(weighInFromLine(hand())).toBeNull();
  });
});

describe('editing a weigh-in', () => {
  it('a changed weight or body fat makes a synced weigh-in the person\'s own', () => {
    for (const patch of [{ kg: 81.9 }, { kg: 82.4, bodyFatPct: 19 }, { kg: 82.4, bodyFatPct: undefined }]) {
      const out = weighInAfterEdit(synced(), '2026-11-14', patch);
      for (const k of SYNC_KEYS) expect(out).not.toHaveProperty(k);
      expect(isSyncedWeighIn(out)).toBe(false);
      expect(out.id).toBe('w');
    }
  });

  it('a note or measurement alone keeps it synced, and the same figures saved again too', () => {
    const noted = weighInAfterEdit(synced(), '2026-11-14', { kg: 82.4, note: 'after holiday', waistCm: 88 });
    expect(noted).toMatchObject({ note: 'after holiday', waistCm: 88, source: 'health', syncedKg: 82.4 });
    expect(isSyncedWeighIn(noted)).toBe(true);
    expect(isSyncedWeighIn(weighInAfterEdit(synced(), '2026-11-14', { kg: 82.4, bodyFatPct: 18.2 }))).toBe(true);
  });

  it('a hand weigh-in keeps its fields; a cleared one goes', () => {
    expect(weighInAfterEdit(hand({ waistCm: 88, bodyFatPct: 20 }), '2026-11-14', { kg: 82, bodyFatPct: undefined })).toEqual({ id: 'w', date: '2026-11-14', kg: 82, waistCm: 88 });
    expect(weighInAfterEdit(undefined, '2026-11-15', { kg: 80 })).toEqual({ id: undefined, date: '2026-11-15', kg: 80 });
    expect(weighInAfterEdit(hand({ deleted: true }), '2026-11-14', { kg: 80 })).not.toHaveProperty('deleted');
  });
});

describe('targets behind a synced weigh-in', () => {
  const profile = { weightKg: 84, bodyFatPct: 20 };
  it('is null when the newest weigh-in is the person\'s, or the targets already use it', () => {
    expect(targetsBehind(profile, [synced({ date: '2026-11-13' }), hand({ date: '2026-11-14', kg: 83 })])).toBeNull();
    expect(targetsBehind({ weightKg: 82.42, bodyFatPct: 18.2 }, [synced()])).toBeNull();
    expect(targetsBehind(null, [synced()])).toBeNull();
    expect(targetsBehind(profile, [])).toBeNull();
    expect(targetsBehind(profile, [synced({ deleted: true })])).toBeNull();
  });

  it('gives the figures when they differ', () => {
    const latest = synced();
    expect(targetsBehind(profile, [hand({ date: '2026-11-10', kg: 85 }), latest])).toEqual({ latest, kg: 82.4, bodyFatPct: 18.2 });
    // Only the weight differs: body fat is not offered.
    expect(targetsBehind({ weightKg: 84, bodyFatPct: 18.2 }, [latest])).toEqual({ latest, kg: 82.4 });
    // Only the body fat differs.
    expect(targetsBehind({ weightKg: 82.4 }, [latest])).toEqual({ latest, kg: 82.4, bodyFatPct: 18.2 });
  });
});

describe('deleting a weigh-in with body fat', () => {
  const a = { id: 'a', date: '2026-11-10', bodyFatPct: 21 };
  const b = { id: 'b', date: '2026-11-14', bodyFatPct: 18.2 };
  it('moves the profile\'s body fat only when it came from the newest reading being deleted', () => {
    expect(bodyFatFollowsDelete({ bodyFatPct: 18.2 }, b, [a, b])).toBe(true);
    // Typed in Goals or on /body since: left alone.
    expect(bodyFatFollowsDelete({ bodyFatPct: 17 }, b, [a, b])).toBe(false);
    expect(bodyFatFollowsDelete({}, b, [a, b])).toBe(false);
    // Not the newest reading.
    expect(bodyFatFollowsDelete({ bodyFatPct: 21 }, a, [a, b])).toBe(false);
    // No body fat on the deleted one.
    expect(bodyFatFollowsDelete({ bodyFatPct: 18.2 }, { id: 'c', date: '2026-11-15' }, [a, b])).toBe(false);
  });
});

describe('what deleting a weigh-in changes in the profile', () => {
  const oct = hand({ id: 'oct', date: '2026-10-03', kg: 90 });
  const nov10 = hand({ id: 'n10', date: '2026-11-10', kg: 84, bodyFatPct: 21 });
  const nov17 = synced({ id: 'n17', date: '2026-11-17', kg: 82.4, syncedKg: 82.4, bodyFatPct: 18.2, syncedBodyFatPct: 18.2 });
  const nov18 = synced({ id: 'n18', date: '2026-11-18', kg: 82.0, syncedKg: 82.0, bodyFatPct: undefined, syncedBodyFatPct: undefined });
  const all = [oct, nov10, nov17, nov18];

  it('deleting an older weigh-in never points the targets at a newer synced one', () => {
    expect(profileAfterDelete({ weightKg: 84, bodyFatPct: 21 }, oct, all)).toEqual({});
    expect(profileAfterDelete({ weightKg: 84, bodyFatPct: 21 }, nov10, all)).toEqual({});
  });

  it('deleting the newest moves the weight only when it came from it, and then to the person\'s own newest', () => {
    const mine = hand({ id: 'n19', date: '2026-11-19', kg: 81 });
    expect(profileAfterDelete({ weightKg: 81 }, mine, [...all, mine])).toEqual({ weightKg: 84 });
    // Typed over in Goals since: left alone.
    expect(profileAfterDelete({ weightKg: 79 }, mine, [...all, mine])).toEqual({});
    // A synced newest the person used for targets: back to their own newest, not to the other synced one.
    expect(profileAfterDelete({ weightKg: 82.0 }, nov18, all)).toEqual({ weightKg: 84 });
    // Nothing of their own left: the profile stays, and "Use it for targets" offers the synced one.
    expect(profileAfterDelete({ weightKg: 82.0 }, nov18, [nov17, nov18])).toEqual({});
    // Before this round's records: hand weigh-ins only, as it always was.
    expect(profileAfterDelete({ weightKg: 81 }, mine, [oct, nov10, mine])).toEqual({ weightKg: 84 });
  });

  it('body fat falls back to the person\'s own newest reading, never to a synced one, or is cleared', () => {
    const mine = hand({ id: 'n19', date: '2026-11-19', kg: 81, bodyFatPct: 19.5 });
    expect(profileAfterDelete({ weightKg: 81, bodyFatPct: 19.5 }, mine, [...all, mine])).toEqual({ weightKg: 84, bodyFatPct: 21 });
    expect(profileAfterDelete({ weightKg: 81, bodyFatPct: 19.5 }, mine, [nov17, mine])).toEqual({ bodyFatPct: undefined });
    expect(ownLatestBodyFat(all)).toBe(21);
    expect(ownLatestBodyFat([nov17])).toBeUndefined();
  });

  it('no profile, no change', () => {
    expect(profileAfterDelete(null, oct, all)).toEqual({});
  });
});
