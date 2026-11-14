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
  failProfileRead: false,
  onPush: null as null | (() => void),
  /** Ids the server refuses (as a constraint violation would). */
  refuseIds: new Set<string>(),
  /** The ids of each push_records call, in order. */
  pushCalls: [] as string[][],
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
    const filters: { user?: string; after?: string; ids?: string[] } = {};
    let limit = 1000;
    const builder = {
      select: () => builder,
      eq: (_col: string, v: string) => ((filters.user = v), builder),
      gt: (_col: string, v: string) => ((filters.after = v), builder),
      in: (_col: string, ids: string[]) => ((filters.ids = ids), builder),
      order: () => builder,
      limit: (n: number) => ((limit = n), builder),
      maybeSingle: async () => {
        if (server.failProfileRead) return { data: null, error: { message: 'TypeError: Network request failed' } };
        const p = server.profiles.get(filters.user ?? '');
        return { data: p ? { data: p.data, settings: p.settings } : null, error: null };
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
        if (table !== 'records') return resolve({ data: [], error: null });
        if (server.failRecordsRead) return resolve({ data: null as never, error: { message: 'TypeError: Network request failed' } as never });
        if (filters.ids) {
          const wanted = new Set(filters.ids);
          return resolve({ data: server.rows.filter((r) => r.user_id === filters.user && wanted.has(r.id)), error: null });
        }
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
      server.pushCalls.push((args.p_records as { id: string }[]).map((r) => r.id));
      // Like the real function, a batch with one bad row stores nothing.
      if ((args.p_records as { id: string }[]).some((r) => server.refuseIds.has(r.id))) {
        return { data: null, error: { message: 'new row violates check constraint', code: '23514' } };
      }
      // Like the SQL function, the answer is the number of rows stored: a row older than the server's copy is skipped silently.
      let stored = 0;
      for (const r of args.p_records as Omit<Row, 'user_id' | 'server_updated_at'>[]) {
        const existing = server.rows.find((x) => x.user_id === uid && x.collection === r.collection && x.id === r.id);
        if (existing && existing.updated_at > r.updated_at) continue; // older write loses
        const row: Row = { ...r, user_id: uid, server_updated_at: server.tick() };
        if (existing) Object.assign(existing, row);
        else server.rows.push(row);
        stored += 1;
      }
      return { data: stored, error: null };
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

import { attachUser, canonicalTime, resetRejected, startAutoSync, syncNow, useSyncState } from './sync';

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
  server.failProfileRead = false;
  server.onPush = null;
  server.refuseIds.clear();
  server.pushCalls = [];
  useStore.getState().resetAll();
  resetRejected();
  useSyncState.setState({ status: 'idle', error: null, lastRunAt: null, rejected: 0, keptAccountPlan: false });
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

  const seedAccountA = () => {
    server.rows.push({
      user_id: 'user-a', collection: 'water', id: '11111111-1111-4111-8111-111111111111', date: '2026-01-05',
      data: { ...water(330), id: '11111111-1111-4111-8111-111111111111' }, deleted: false,
      updated_at: '2026-01-05T08:00:00.000Z', server_updated_at: server.tick(),
    });
    server.profiles.set('user-a', { data: { ...profile('Alex'), updatedAt: '2026-01-02T00:00:00.000Z' }, profile_updated_at: '2026-01-02T00:00:00.000Z', settings: null, settings_updated_at: null });
  };

  it('keeps the plan of an existing account when a device with a guest profile signs in, and adds only what was logged', async () => {
    // The account, as its other devices left it months ago.
    server.profiles.set('user-a', {
      data: { ...profile('Alex'), weightKg: 92, goal: 'lose', calorieTargetOverride: 1800, updatedAt: '2026-01-02T00:00:00.000Z' },
      profile_updated_at: '2026-01-02T00:00:00.000Z',
      settings: { ...useStore.getState().settings, fastingTargetHours: 18, updatedAt: '2026-01-02T00:00:00.000Z' },
      settings_updated_at: '2026-01-02T00:00:00.000Z',
    });
    server.rows.push({
      user_id: 'user-a', collection: 'days', id: 'days-2026-01-05', date: '2026-01-05',
      data: { date: '2026-01-05', target: 1800, tdee: 2300, eatBackExercise: true, weightKg: 92 },
      deleted: false, updated_at: '2026-01-05T08:00:00.000Z', server_updated_at: server.tick(),
    });
    // The same person onboards again as a guest on a new device and logs a glass of water.
    const s = useStore.getState();
    s.setProfile({ ...profile('Guest'), weightKg: 70, goal: 'gain' });
    s.setSettings({ fastingTargetHours: 12 });
    const glass = s.upsert('water', water(250));
    const guestDay = s.upsert('days', { date: '2026-01-05', target: 2900, tdee: 2500, eatBackExercise: true, weightKg: 70 });

    expect(await attachUser('user-a')).toBe('ok');

    const account = server.profiles.get('user-a')!;
    expect(account.data).toMatchObject({ name: 'Alex', weightKg: 92, goal: 'lose', calorieTargetOverride: 1800 });
    expect((account.settings as { fastingTargetHours: number }).fastingTargetHours).toBe(18);
    // The device now shows the account's plan, and the user is told once.
    const after = useStore.getState();
    expect(after.profile).toMatchObject({ name: 'Alex', weightKg: 92, goal: 'lose' });
    expect(after.settings.fastingTargetHours).toBe(18);
    expect(useSyncState.getState().keptAccountPlan).toBe(true);
    // What was logged is in the account; the guest's targets for a past day did not replace the account's.
    expect(server.rows.some((r) => r.id === glass.id)).toBe(true);
    expect(server.rows.filter((r) => r.collection === 'days').map((r) => (r.data as { target: number }).target)).toEqual([1800]);
    expect(Object.values(after.days).map((d) => d.target)).toEqual([1800]);
    expect(after.days[guestDay.id]?.target ?? 1800).toBe(1800);
    expect(pendingChanges(after)).toBe(0);
  });

  it('does not attach guest data while it cannot tell whether the account already has a plan', async () => {
    useStore.getState().setProfile(profile('Guest'));
    useStore.getState().upsert('water', water(250));
    server.failProfileRead = true;
    expect(await attachUser('user-a')).toBe('failed');
    expect(useStore.getState().ownerId).toBeNull();
    expect(server.rows).toHaveLength(0);
    server.failProfileRead = false;
    expect(await attachUser('user-a')).toBe('ok');
    expect(server.rows).toHaveLength(1);
    expect((server.profiles.get('user-a')!.data as { name: string }).name).toBe('Guest');
  });

  it('takes the server copy when the server has a newer version of a record it was sent (an old backup restored)', async () => {
    await attachUser('user-a');
    const entry = useStore.getState().upsert('water', water(250));
    await syncNow();
    const old = { ...useStore.getState().water[entry.id] };
    // Deleted and synced; later the tombstone is gone from the device and an old backup brings the entry back.
    useStore.getState().remove('water', entry.id);
    await syncNow();
    expect(server.rows.find((r) => r.id === entry.id)!.deleted).toBe(true);
    useStore.setState((st) => ({ water: { [entry.id]: old }, dirty: { ...st.dirty, water: { [entry.id]: true } } }));

    await syncNow();
    // The device agrees with the server (and every other device) instead of keeping a copy only it can see.
    expect(useStore.getState().water[entry.id].deleted).toBe(true);
    expect(pendingChanges(useStore.getState())).toBe(0);
    expect(server.rows.find((r) => r.id === entry.id)!.deleted).toBe(true);
  });

  it('refuses to switch accounts while the device holds unsynced changes of another account', async () => {
    useStore.getState().setOwner('user-b');
    useStore.getState().setProfile(profile('Bea'));
    useStore.getState().upsert('water', water(999));
    seedAccountA();

    expect(await attachUser('user-a')).toBe('blocked');
    // Nothing was erased, nothing was uploaded, and the data still belongs to B.
    const state = useStore.getState();
    expect(state.ownerId).toBe('user-b');
    expect(state.profile?.name).toBe('Bea');
    expect(Object.values(state.water).map((w) => w.ml)).toEqual([999]);
    expect(server.rows.some((r) => (r.data as { ml?: number }).ml === 999)).toBe(false);
  });

  it('switches accounts once the user agrees to discard those changes, without leaking them into the new account', async () => {
    useStore.getState().setOwner('user-b');
    useStore.getState().setProfile(profile('Bea'));
    useStore.getState().upsert('water', water(999));
    seedAccountA();

    expect(await attachUser('user-a', { discardOtherAccount: true })).toBe('ok');
    const state = useStore.getState();
    expect(state.ownerId).toBe('user-a');
    expect(state.profile?.name).toBe('Alex');
    expect(Object.values(state.water).map((w) => w.ml)).toEqual([330]);
    expect(server.rows.some((r) => (r.data as { ml?: number }).ml === 999)).toBe(false);
  });

  it('switches accounts without asking when everything of the previous account was already backed up', async () => {
    useStore.getState().setOwner('user-b');
    useStore.setState({ water: { w: { id: 'w', date: '2026-01-05', ml: 999, beverage: 'water', loggedAt: '2026-01-05T08:00:00.000Z', updatedAt: '2026-01-05T08:00:00.000Z', deleted: false } } });
    seedAccountA();
    expect(pendingChanges(useStore.getState())).toBe(0);
    expect(await attachUser('user-a')).toBe('ok');
    expect(Object.values(useStore.getState().water).map((w) => w.ml)).toEqual([330]);
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

  it('sets a record the server refuses aside, so one bad record cannot hold up the rest', async () => {
    await attachUser('user-a');
    const s = useStore.getState();
    const good1 = s.upsert('water', water(250));
    const bad = s.upsert('water', water(300));
    const good2 = s.upsert('water', water(500));
    server.refuseIds.add(bad.id);
    await syncNow();
    // The other two reached the server, the refused one is still on the device and still pending.
    expect(server.rows.map((r) => r.id).sort()).toEqual([good1.id, good2.id].sort());
    expect(useStore.getState().water[bad.id]).toBeTruthy();
    expect(useStore.getState().dirty.water).toEqual({ [bad.id]: true });
    expect(useSyncState.getState()).toMatchObject({ status: 'idle', error: null, rejected: 1 });

    // It is not sent again on every run...
    server.pushCalls = [];
    const later = useStore.getState().upsert('water', water(750));
    await syncNow();
    expect(server.pushCalls).toEqual([[later.id]]);
    expect(useSyncState.getState().rejected).toBe(1);

    // ...but an edit to it is tried at once, and goes through when the server accepts it.
    server.refuseIds.clear();
    useStore.getState().upsert('water', { ...useStore.getState().water[bad.id], ml: 350 });
    await syncNow();
    expect(server.rows.find((r) => r.id === bad.id)?.data.ml).toBe(350);
    expect(pendingChanges(useStore.getState())).toBe(0);
    expect(useSyncState.getState().rejected).toBe(0);
  });

  it('treats a failure that is not about the data as a failed run, keeping every record pending', async () => {
    await attachUser('user-a');
    useStore.getState().upsert('water', water(250));
    useStore.getState().upsert('water', water(500));
    server.failNext = 'JWT expired';
    await syncNow();
    expect(server.rows).toHaveLength(0);
    expect(pendingChanges(useStore.getState())).toBe(2);
    expect(useSyncState.getState()).toMatchObject({ status: 'error', rejected: 0 });
  });

  it('reads times in the format the database prints as the same instants', async () => {
    expect(canonicalTime('2026-01-05T08:00:00.12+00:00')).toBe('2026-01-05T08:00:00.120Z');
    expect(canonicalTime('2026-01-05T10:00:00+02:00')).toBe('2026-01-05T08:00:00.000Z');
    expect(canonicalTime('not a time')).toBe('not a time');

    await attachUser('user-a');
    const entry = useStore.getState().upsert('water', water(250));
    await syncNow();
    // Another device edited it; the server hands the time back the way PostgREST prints it.
    const row = server.rows.find((r) => r.id === entry.id)!;
    const later = new Date(Date.parse(row.updated_at) + 60_000);
    Object.assign(row, { data: { ...row.data, ml: 400 }, updated_at: later.toISOString().replace('.000Z', '+00:00'), server_updated_at: server.tick() });
    await syncNow();
    const local = useStore.getState().water[entry.id];
    expect(local.ml).toBe(400);
    expect(local.updatedAt).toBe(later.toISOString());
    // A local edit after that is newer, uploads, and leaves nothing pending.
    useStore.getState().upsert('water', { ...local, ml: 450 });
    await syncNow();
    expect((server.rows.find((r) => r.id === entry.id)!.data as { ml: number }).ml).toBe(450);
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
