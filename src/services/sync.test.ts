/**
 * Sync engine against an in-memory fake of the Supabase backend. The fake
 * implements the same contract as the SQL in supabase/migrations: last write
 * wins on the client `updated_at`, and a server clock orders the pull cursor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  user_id: string;
  collection: string;
  id: string;
  date: string | null;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
  server_updated_at: string;
}

const server = vi.hoisted(() => ({
  rows: [] as Row[],
  profiles: new Map<string, { data: unknown; profile_updated_at: string | null; settings: unknown; settings_updated_at: string | null }>(),
  userId: 'user-a' as string | null,
  clock: 0,
  failNext: null as string | null,
  failRecordsRead: false,
  onPush: null as null | (() => void),
  tick(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock)).toISOString();
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

let idSeq = 0;
vi.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}` }));

vi.mock('./supabase', () => {
  const from = (table: string) => {
    const filters: { user?: string; after?: string } = {};
    let limit = 1000;
    const builder = {
      select: () => builder,
      eq: (_col: string, v: string) => ((filters.user = v), builder),
      gt: (_col: string, v: string) => ((filters.after = v), builder),
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      maybeSingle: async () => {
        const p = server.profiles.get(filters.user ?? '');
        return { data: p ? { data: p.data, settings: p.settings } : null, error: null };
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
        if (table !== 'records') return resolve({ data: [], error: null });
        if (server.failRecordsRead) return resolve({ data: null as never, error: { message: 'TypeError: Network request failed' } as never });
        const data = server.rows
          .filter((r) => r.user_id === filters.user && r.server_updated_at > (filters.after ?? ''))
          .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
          .slice(0, limit);
        return resolve({ data, error: null });
      },
    };
    return builder;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (server.failNext) {
      const message = server.failNext;
      server.failNext = null;
      return { data: null, error: { message } };
    }
    const uid = server.userId as string;
    if (name === 'push_records') {
      const hook = server.onPush;
      server.onPush = null;
      hook?.();
      for (const r of args.p_records as Omit<Row, 'user_id' | 'server_updated_at'>[]) {
        const existing = server.rows.find((x) => x.user_id === uid && x.collection === r.collection && x.id === r.id);
        if (existing && existing.updated_at > r.updated_at) continue; // older write loses
        const row: Row = { ...r, user_id: uid, server_updated_at: server.tick() };
        if (existing) Object.assign(existing, row);
        else server.rows.push(row);
      }
    }
    if (name === 'push_profile') {
      const cur = server.profiles.get(uid) ?? { data: null, profile_updated_at: null, settings: null, settings_updated_at: null };
      const a = args as { p_profile: unknown; p_profile_updated_at: string | null; p_settings: unknown; p_settings_updated_at: string | null };
      if (a.p_profile && (!cur.profile_updated_at || cur.profile_updated_at <= (a.p_profile_updated_at ?? ''))) {
        cur.data = a.p_profile;
        cur.profile_updated_at = a.p_profile_updated_at;
      }
      if (a.p_settings && (!cur.settings_updated_at || cur.settings_updated_at <= (a.p_settings_updated_at ?? ''))) {
        cur.settings = a.p_settings;
        cur.settings_updated_at = a.p_settings_updated_at;
      }
      server.profiles.set(uid, cur);
    }
    return { data: null, error: null };
  };
  return {
    isBackendConfigured: true,
    FUNCTIONS_URL: 'http://test/functions/v1',
    supabase: {
      from,
      rpc,
      auth: { getSession: async () => ({ data: { session: server.userId ? { user: { id: server.userId } } : null } }) },
    },
  };
});

import { pendingChanges, useStore } from '@/store';
import type { Profile } from '@/types';

import { attachUser, startAutoSync, syncNow, useSyncState } from './sync';

const profile = (name: string): Partial<Profile> => ({
  name,
  sex: 'male',
  birthDate: '1990-01-01',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'light',
  goal: 'maintain',
  weeklyRateKg: 0,
  units: 'metric',
  eatBackExercise: true,
  useAdaptiveTdee: true,
  onboardedAt: '2026-01-01T00:00:00.000Z',
});

const water = (ml: number) => ({ date: '2026-01-05', ml, beverage: 'water' as const, loggedAt: '2026-01-05T08:00:00.000Z' });

beforeEach(() => {
  server.rows = [];
  server.profiles.clear();
  server.userId = 'user-a';
  server.failNext = null;
  server.failRecordsRead = false;
  server.onPush = null;
  useStore.getState().resetAll();
  useSyncState.setState({ status: 'idle', error: null, lastRunAt: null });
});

describe('sync', () => {
  it('adopts data created without an account and uploads all of it on first sign-in', async () => {
    const s = useStore.getState();
    s.setProfile(profile('Guest'));
    s.upsert('water', water(250));
    s.upsert('water', water(500));
    // Pretend an earlier (failed) session left nothing flagged dirty: adoption must still upload everything.
    useStore.setState({ dirty: { ...useStore.getState().dirty, water: {} }, profileDirty: false });

    await attachUser('user-a');

    expect(useStore.getState().ownerId).toBe('user-a');
    expect(server.rows.filter((r) => r.collection === 'water')).toHaveLength(2);
    expect((server.profiles.get('user-a')?.data as Profile).name).toBe('Guest');
    expect(pendingChanges(useStore.getState())).toBe(0);
    expect(useSyncState.getState().status).toBe('idle');
  });

  it('clears another account\'s local data before pulling the new user\'s', async () => {
    useStore.getState().setOwner('user-b');
    useStore.getState().setProfile(profile('Bea'));
    useStore.getState().upsert('water', water(999));

    server.rows.push({
      user_id: 'user-a', collection: 'water', id: '11111111-1111-4111-8111-111111111111', date: '2026-01-05',
      data: { ...water(330), id: '11111111-1111-4111-8111-111111111111' }, deleted: false,
      updated_at: '2026-01-05T08:00:00.000Z', server_updated_at: server.tick(),
    });
    server.profiles.set('user-a', { data: { ...profile('Alex'), updatedAt: '2026-01-02T00:00:00.000Z' }, profile_updated_at: '2026-01-02T00:00:00.000Z', settings: null, settings_updated_at: null });

    await attachUser('user-a');

    const state = useStore.getState();
    expect(state.ownerId).toBe('user-a');
    expect(state.profile?.name).toBe('Alex');
    const amounts = Object.values(state.water).map((w) => w.ml);
    expect(amounts).toEqual([330]);
    // Nothing of user B's may have been uploaded under user A.
    expect(server.rows.some((r) => (r.data as { ml?: number }).ml === 999)).toBe(false);
  });

  it('propagates deletes as soft-deleted rows', async () => {
    await attachUser('user-a');
    const entry = useStore.getState().upsert('water', water(250));
    await syncNow();
    useStore.getState().remove('water', entry.id);
    await syncNow();
    const row = server.rows.find((r) => r.id === entry.id);
    expect(row?.deleted).toBe(true);
    expect(pendingChanges(useStore.getState())).toBe(0);
  });

  it('pulls changes made on another device and keeps the newer version of a conflict', async () => {
    await attachUser('user-a');
    const entry = useStore.getState().upsert('water', water(250));
    await syncNow();

    // Another device edits the same record later, and adds a new one.
    const row = server.rows.find((r) => r.id === entry.id)!;
    const later = new Date(Date.now() + 60_000).toISOString();
    Object.assign(row, { data: { ...row.data, ml: 400 }, updated_at: later, server_updated_at: server.tick() });
    server.rows.push({
      user_id: 'user-a', collection: 'water', id: '22222222-2222-4222-8222-222222222222', date: '2026-01-05',
      data: water(750), deleted: false, updated_at: later, server_updated_at: server.tick(),
    });

    await syncNow();
    const state = useStore.getState();
    expect(state.water[entry.id].ml).toBe(400);
    expect(state.water['22222222-2222-4222-8222-222222222222'].ml).toBe(750);
    expect(pendingChanges(state)).toBe(0);
  });

  it('does not let a stale remote copy overwrite a newer local edit', async () => {
    await attachUser('user-a');
    const entry = useStore.getState().upsert('water', water(250));
    await syncNow();

    // The server copy is touched by an old device whose edit predates ours.
    const row = server.rows.find((r) => r.id === entry.id)!;
    Object.assign(row, { data: { ...row.data, ml: 100 }, updated_at: '2020-01-01T00:00:00.000Z', server_updated_at: server.tick() });
    useStore.getState().upsert('water', { ...water(600), id: entry.id });

    await syncNow();
    expect(useStore.getState().water[entry.id].ml).toBe(600);
    expect((server.rows.find((r) => r.id === entry.id)!.data as { ml: number }).ml).toBe(600);
  });

  it('keeps records dirty when a push fails so nothing is lost, then recovers', async () => {
    await attachUser('user-a');
    useStore.getState().upsert('water', water(250));
    server.failNext = 'permission denied';
    await syncNow();
    expect(useSyncState.getState().status).toBe('error');
    expect(pendingChanges(useStore.getState())).toBeGreaterThan(0);
    expect(server.rows).toHaveLength(0);

    await syncNow();
    expect(useSyncState.getState().status).toBe('idle');
    expect(server.rows).toHaveLength(1);
    expect(pendingChanges(useStore.getState())).toBe(0);
  });

  it('pulls every row when a page boundary falls inside a group sharing one server timestamp', async () => {
    // 990 rows with distinct timestamps, then 30 uploaded in one batch (one shared timestamp):
    // the first page of 1000 ends ten rows into that batch.
    for (let i = 0; i < 990; i++) {
      server.rows.push({
        user_id: 'user-a', collection: 'water', id: `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`, date: '2026-01-05',
        data: water(100), deleted: false, updated_at: '2026-01-05T08:00:00.000Z', server_updated_at: server.tick(),
      });
    }
    const shared = server.tick();
    for (let i = 0; i < 30; i++) {
      server.rows.push({
        user_id: 'user-a', collection: 'water', id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`, date: '2026-01-05',
        data: water(200), deleted: false, updated_at: '2026-01-05T08:00:00.000Z', server_updated_at: shared,
      });
    }
    await attachUser('user-a');
    expect(Object.keys(useStore.getState().water)).toHaveLength(1020);
  });

  it('picks up a row whose server timestamp is slightly older than the stored cursor', async () => {
    await attachUser('user-a');
    useStore.getState().upsert('water', water(250));
    await syncNow();
    const cursor = useStore.getState().lastPulledAt!;
    // A slower transaction commits after our pull with a timestamp just before the cursor.
    server.rows.push({
      user_id: 'user-a', collection: 'water', id: '55555555-5555-4555-8555-555555555555', date: '2026-01-05',
      data: water(777), deleted: false, updated_at: '2026-01-05T09:00:00.000Z',
      server_updated_at: new Date(Date.parse(cursor) - 5_000).toISOString(),
    });
    await syncNow();
    expect(useStore.getState().water['55555555-5555-4555-8555-555555555555']?.ml).toBe(777);
    // The cursor never moves backwards.
    expect(Date.parse(useStore.getState().lastPulledAt!)).toBeGreaterThanOrEqual(Date.parse(cursor));
  });

  it('fetches the profile before the history, so a dropped connection cannot make an existing account look new', async () => {
    server.profiles.set('user-a', { data: { ...profile('Alex'), updatedAt: '2026-01-02T00:00:00.000Z' }, profile_updated_at: '2026-01-02T00:00:00.000Z', settings: null, settings_updated_at: null });
    server.failRecordsRead = true;
    const outcome = await attachUser('user-a');
    expect(outcome).toBe('failed');
    expect(useStore.getState().profile?.name).toBe('Alex');
    expect(useStore.getState().profile?.onboardedAt).toBeTruthy();
  });

  it('reports a clean first sync as ok', async () => {
    expect(await attachUser('user-a')).toBe('ok');
  });

  it('uploads an edit made while a push was in flight in the same run (an Undo during sync)', async () => {
    await attachUser('user-a');
    const entry = useStore.getState().upsert('water', water(250));
    // The user taps Undo exactly while the first upload is on its way.
    server.onPush = () => useStore.getState().remove('water', entry.id);
    await syncNow();
    expect(server.rows.find((r) => r.id === entry.id)?.deleted).toBe(true);
    expect(pendingChanges(useStore.getState())).toBe(0);
  });

  it('does nothing when signed out', async () => {
    server.userId = null;
    useStore.getState().upsert('water', water(250));
    await syncNow();
    expect(server.rows).toHaveLength(0);
    expect(pendingChanges(useStore.getState())).toBe(1);
  });

  it('reports network failures as offline rather than as an error', async () => {
    await attachUser('user-a');
    useStore.getState().upsert('water', water(250));
    server.failNext = 'TypeError: Network request failed';
    await syncNow();
    expect(useSyncState.getState().status).toBe('offline');
  });

  describe('auto-sync', () => {
    afterEach(() => vi.useRealTimers());

    it('schedules another upload when the same record is edited again (pending count unchanged)', async () => {
      await attachUser('user-a');
      const entry = useStore.getState().upsert('water', water(250));
      vi.useFakeTimers();
      const stop = startAutoSync();
      // Still one pending record, but its content changed: this must count as a change.
      useStore.getState().upsert('water', { ...water(400), id: entry.id });
      expect(pendingChanges(useStore.getState())).toBe(1);
      await vi.advanceTimersByTimeAsync(3000);
      vi.useRealTimers();
      // No manual sync here: only the scheduled one may have uploaded the edit.
      await new Promise((resolve) => setTimeout(resolve, 50));
      stop();
      expect((server.rows.find((r) => r.id === entry.id)?.data as { ml: number }).ml).toBe(400);
    });
  });
});
