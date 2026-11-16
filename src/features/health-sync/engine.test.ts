/**
 * The sync end to end against a health store in memory: what is saved, what
 * waits, what a failure leaves behind, and what Undo puts back.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import { createHealthSync, type SyncDeps } from './engine';
import { createFakeAdapter, FULL_ACCESS, type FakeHealth } from './fake';
import type { HealthSyncState } from './state';
import { CTX, GARMIN, handLogged, memoryDiary, memoryState, restingKcal, SAMSUNG, totalFromActive, TYPE, workout, type MemoryDiary } from './testing';
import { HealthError, NO_ACCESS, type HealthWorkout } from './types';

/** The net figure of the morning run (552 kcal in total over 45 min). */
const RUN_NET = expect.closeTo(552 - restingKcal(45), 0);

const NOON = Date.parse('2026-11-14T12:00:00Z');
const MIN = 60_000;

interface Rig {
  sync: ReturnType<typeof createHealthSync>;
  health: FakeHealth;
  diary: MemoryDiary;
  state: ReturnType<typeof memoryState>;
  toasts: { message: string; undo: () => void }[];
  clock: { now: number };
}

function rig(options: { workouts?: HealthWorkout[]; existing?: Parameters<typeof memoryDiary>[0]; enabled?: boolean; health?: Partial<FakeHealth>; profile?: boolean; timeoutMs?: number } = {}): Rig {
  const { adapter, health } = createFakeAdapter({ access: FULL_ACCESS, workouts: options.workouts ?? [], ...options.health });
  const diary = memoryDiary(options.existing ?? [], options.profile ?? true);
  const state = memoryState({ enabled: options.enabled ?? true });
  const toasts: Rig['toasts'] = [];
  const clock = { now: NOON };
  const deps: SyncDeps = { adapter, now: () => clock.now, state, diary, announce: (message, undo) => toasts.push({ message, undo }), timeoutMs: options.timeoutMs };
  return { sync: createHealthSync(deps), health, diary, state, toasts, clock };
}

const morningRun = (over: Partial<Parameters<typeof workout>[0]> = {}) => workout({ start: '2026-11-13T06:00:00Z', minutes: 45, activeKcal: 480, totalKcal: 552, distanceM: 8200, ...over });
const eveningRide = (over: Partial<Parameters<typeof workout>[0]> = {}) => workout({ start: '2026-11-13T17:00:00Z', minutes: 60, exerciseType: TYPE.cycling, activeKcal: 520, ...over });

describe('health sync', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  describe('a normal run', () => {
    it('adds new workouts by themselves with one message, and Undo removes exactly those', async () => {
      const mine = handLogged('yoga', 30, '2026-11-12', '2026-11-12T20:00:00');
      const r = rig({ workouts: [morningRun(), eveningRide()], existing: [mine] });
      expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 2, updated: 0, review: 0 });
      expect(r.diary.live()).toHaveLength(3);
      expect(r.toasts.map((t) => t.message)).toEqual(['2 workouts added from Garmin Connect']);
      expect(r.state.get()).toMatchObject({ lastSyncedAt: new Date(NOON).toISOString(), lastError: null, lastResult: { added: 2, updated: 0 } });
      expect(r.state.get().origins).toMatchObject([{ name: 'Garmin Connect', count: 2 }]);

      r.toasts[0].undo();
      expect(r.diary.live()).toEqual([expect.objectContaining({ id: mine.id })]);

      // The next sync does not bring them back.
      r.clock.now += 20 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ status: 'done', added: 0 });
      expect(r.diary.live()).toHaveLength(1);
      expect(r.toasts).toHaveLength(1);
    });

    it('says "1 workout" and names Health Connect when several apps were involved', async () => {
      const one = rig({ workouts: [morningRun()] });
      await one.sync.sync('auto');
      expect(one.toasts[0].message).toBe('1 workout added from Garmin Connect');
      const two = rig({ workouts: [morningRun(), eveningRide({ origin: SAMSUNG })] });
      await two.sync.sync('auto');
      expect(two.toasts[0].message).toBe('2 workouts added from Health Connect');
    });

    it('is quiet when there is nothing new', async () => {
      const r = rig({ workouts: [morningRun()] });
      await r.sync.sync('auto');
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 0, updated: 0, review: 0 });
      expect(r.toasts).toHaveLength(1);
      expect(r.diary.live()).toHaveLength(1);
    });

    it('only looks at the last 30 days', async () => {
      const r = rig({ workouts: [morningRun(), workout({ start: '2026-10-01T06:00:00Z', minutes: 30 })] });
      expect(await r.sync.sync('manual')).toMatchObject({ added: 1 });
    });
  });

  describe('when it runs', () => {
    it('does nothing while the switch is off', async () => {
      const r = rig({ workouts: [morningRun()], enabled: false });
      expect(await r.sync.sync('auto')).toEqual({ status: 'skipped', why: 'off' });
      expect(await r.sync.sync('manual')).toEqual({ status: 'skipped', why: 'off' });
      expect(r.health.calls.reads).toBe(0);
    });

    it('runs automatically at most once every 15 minutes; "Sync now" always runs', async () => {
      const r = rig({ workouts: [morningRun()] });
      await r.sync.sync('auto');
      r.clock.now += 14 * MIN;
      expect(await r.sync.sync('auto')).toEqual({ status: 'skipped', why: 'too-soon' });
      expect(r.health.calls.reads).toBe(1);
      expect(await r.sync.sync('manual')).toMatchObject({ status: 'done' });
      expect(r.health.calls.reads).toBe(2);
      r.clock.now += 15 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ status: 'done' });
      expect(r.health.calls.reads).toBe(3);
    });

    it('a failed attempt also waits 15 minutes before the next automatic one', async () => {
      const r = rig({ health: { availability: 'update-required' } });
      await r.sync.sync('auto');
      r.clock.now += 5 * MIN;
      expect(await r.sync.sync('auto')).toEqual({ status: 'skipped', why: 'too-soon' });
    });

    it('waits for setup: no profile, no sync', async () => {
      const r = rig({ workouts: [morningRun()], profile: false });
      expect(await r.sync.sync('auto')).toEqual({ status: 'skipped', why: 'no-profile' });
      expect(r.health.calls.reads).toBe(0);
    });

    it('two triggers at once make one read', async () => {
      const r = rig({ workouts: [morningRun()], health: { delayMs: 20 } });
      const [a, b] = await Promise.all([r.sync.sync('auto'), r.sync.sync('auto')]);
      expect([a.status, b.status].sort()).toEqual(['done', 'skipped']);
      expect(r.health.calls.reads).toBe(1);
      expect(r.diary.live()).toHaveLength(1);
    });

    it('does not ask again for the details of workouts it already has with calories', async () => {
      const r = rig({ workouts: [morningRun(), eveningRide()] });
      await r.sync.sync('auto');
      expect(r.health.calls.details).toBe(2);
      r.health.workouts.push(workout({ start: '2026-11-14T07:00:00Z', minutes: 30, activeKcal: 300 }));
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ added: 1 });
      expect(r.health.calls.details).toBe(3);
      // "Sync now" reads everything again.
      await r.sync.sync('manual');
      expect(r.health.calls.details).toBe(6);
    });

    it('finds a workout that reached the phone days after it was done', async () => {
      const r = rig({ workouts: [morningRun()] });
      await r.sync.sync('auto');
      // The watch synced late: a run from nine days ago appears now.
      r.health.workouts.push(workout({ start: '2026-11-05T06:00:00Z', minutes: 40, activeKcal: 400 }));
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ added: 1 });
    });
  });

  describe('failures are quiet and change nothing', () => {
    const cases: [string, Partial<FakeHealth>, string][] = [
      ['Health Connect needs an update', { availability: 'update-required' }, 'update-required'],
      ['Health Connect is not installed', { availability: 'not-installed' }, 'not-installed'],
      ['permission was taken away', { access: NO_ACCESS }, 'permission'],
      ['the read fails', { fail: { error: new HealthError('failed', 'android.os.RemoteException') } }, 'failed'],
      ['permission is taken away in the middle of a read', { fail: { error: new HealthError('permission', 'SecurityException'), afterDetails: 1 } }, 'permission'],
    ];
    for (const [name, health, code] of cases) {
      it(name, async () => {
        const r = rig({ workouts: [morningRun(), eveningRide()], health });
        const out = await r.sync.sync('auto');
        expect(out).toMatchObject({ status: 'failed', error: { code } });
        expect(r.diary.all()).toEqual([]);
        expect(r.toasts).toEqual([]);
        expect(r.state.get().lastError).toMatchObject({ code });
        expect(r.state.get().lastSyncedAt).toBeNull();
        expect(r.state.get().enabled).toBe(true);
      });
    }

    it('a health store that does not answer is given up on', async () => {
      const r = rig({ workouts: [morningRun()], health: { delayMs: 80 }, timeoutMs: 20 });
      expect(await r.sync.sync('manual')).toMatchObject({ status: 'failed', error: { code: 'timeout' } });
      expect(r.diary.all()).toEqual([]);
    });

    it('the next good sync clears the note and picks up where it left off', async () => {
      const r = rig({ workouts: [morningRun(), eveningRide()], health: { fail: { error: new HealthError('permission', 'SecurityException'), afterDetails: 1 } } });
      await r.sync.sync('auto');
      r.health.fail = null;
      expect(await r.sync.sync('manual')).toMatchObject({ status: 'done', added: 2 });
      expect(r.state.get().lastError).toBeNull();
    });

    it('without permission for calories, workouts are still added, as estimates', async () => {
      const r = rig({ workouts: [morningRun()], health: { access: { ...NO_ACCESS, workouts: true } } });
      await r.sync.sync('auto');
      expect(r.diary.live()[0].measured).toBeUndefined();
      expect(r.diary.live()[0].distanceKm).toBeUndefined();
      expect(r.state.get().access).toEqual({ ...NO_ACCESS, workouts: true });
    });
  });

  describe('turning it on and off', () => {
    it('asks for permission, then syncs straight away', async () => {
      const r = rig({ workouts: [morningRun()], enabled: false, health: { access: NO_ACCESS } });
      const out = await r.sync.enable();
      expect(out).toEqual({ ok: true, sync: { status: 'done', added: 1, updated: 0, review: 0 } });
      expect(r.health.calls.request).toBe(1);
      expect(r.state.get().enabled).toBe(true);
    });

    it('does not show the permission sheet when access is already there', async () => {
      const r = rig({ enabled: false });
      await r.sync.enable();
      expect(r.health.calls.request).toBe(0);
    });

    it('stays off when the person refuses', async () => {
      const r = rig({ workouts: [morningRun()], enabled: false, health: { access: NO_ACCESS, grant: null } });
      expect(await r.sync.enable()).toEqual({ ok: false, why: 'refused' });
      expect(r.state.get().enabled).toBe(false);
      expect(r.diary.all()).toEqual([]);
    });

    it('stays off and says why when Health Connect is missing or old, without asking for anything', async () => {
      for (const availability of ['not-installed', 'update-required', 'unsupported'] as const) {
        const r = rig({ enabled: false, health: { availability, access: NO_ACCESS } });
        expect(await r.sync.enable()).toEqual({ ok: false, why: availability });
        expect(r.health.calls.request).toBe(0);
        expect(r.state.get().enabled).toBe(false);
      }
    });

    it('switching off keeps what was added and what was deleted, and drops the waiting list', async () => {
      const hand = handLogged('running', 45, '2026-11-13', '2026-11-13T09:00:00');
      const r = rig({ workouts: [morningRun(), eveningRide()], existing: [hand] });
      await r.sync.sync('auto');
      expect(r.state.get().review).toHaveLength(1);
      r.sync.disable();
      expect(r.state.get()).toMatchObject({ enabled: false, review: [] });
      expect(r.diary.live()).toHaveLength(2);
      expect(Object.keys(r.state.get().handled)).toHaveLength(1);
    });
  });

  describe('a deleted workout stays deleted', () => {
    it('while its deletion marker is in the diary', async () => {
      const r = rig({ workouts: [morningRun()] });
      await r.sync.sync('auto');
      r.diary.remove(r.diary.live()[0].id);
      expect(await r.sync.sync('manual')).toMatchObject({ added: 0 });
      expect(r.diary.live()).toEqual([]);
    });

    it('and after the marker itself was cleared from the phone (a day later without an account)', async () => {
      const r = rig({ workouts: [morningRun()] });
      await r.sync.sync('auto');
      const id = r.diary.live()[0].id;
      r.diary.remove(id);
      r.diary.purge(id);
      r.clock.now += 26 * 60 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ added: 0, review: 0 });
      expect(r.diary.all()).toEqual([]);
    });
  });

  describe('a better reading later', () => {
    it('updates the stored workout, says so, and Undo puts the estimate back for good', async () => {
      const bare = morningRun({ activeKcal: null, totalKcal: null, distanceM: null, id: 'run-1' });
      const r = rig({ workouts: [bare] });
      await r.sync.sync('auto');
      const estimate = r.diary.live()[0];
      expect(estimate.measured).toBeUndefined();

      r.health.workouts = [{ ...bare, activeKcal: 480, totalKcal: 552, distanceM: 8200 }];
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 0, updated: 1, review: 0 });
      expect(r.diary.live()).toHaveLength(1);
      expect(r.diary.live()[0]).toMatchObject({ id: estimate.id, kcalNet: RUN_NET, kcalGross: 552, measured: true, distanceKm: 8.2 });
      expect(r.toasts[1].message).toBe('1 workout updated from Garmin Connect');

      r.toasts[1].undo();
      expect(r.diary.live()[0]).toMatchObject({ id: estimate.id, kcalNet: estimate.kcalNet });
      expect(r.diary.live()[0].measured).toBeUndefined();
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ updated: 0 });
      expect(r.diary.live()[0].measured).toBeUndefined();
    });
  });

  describe('needs a look', () => {
    const hand = () => handLogged('running', 45, '2026-11-13', '2026-11-13T09:00:00', { notes: 'easy pace' });

    it('keeps a possible duplicate of a hand-logged session out of the diary and in the list', async () => {
      const r = rig({ workouts: [morningRun(), eveningRide()], existing: [hand()] });
      expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 1, updated: 0, review: 1 });
      expect(r.toasts[0].message).toBe('1 workout added from Garmin Connect');
      expect(r.state.get().review).toMatchObject([{ kind: 'duplicate', matchByHand: true, from: 'Garmin Connect' }]);
      expect(r.diary.live().map((e) => e.activityId).sort()).toEqual(['cycling', 'running']);
      // It keeps waiting, once, over later syncs.
      await r.sync.sync('manual');
      expect(r.state.get().review).toHaveLength(1);
    });

    it('replace: the workout takes the place of the hand-logged session and keeps its note; Undo restores both', async () => {
      const mine = hand();
      const r = rig({ workouts: [morningRun()], existing: [mine] });
      await r.sync.sync('auto');
      const id = r.state.get().review[0].id;
      expect(r.sync.replaceItem(id)).toBe(true);
      expect(r.diary.live()).toHaveLength(1);
      expect(r.diary.live()[0]).toMatchObject({ id, source: 'health', kcalNet: RUN_NET, notes: 'easy pace' });
      expect(r.state.get().review).toEqual([]);
      expect(r.toasts[0].message).toBe('Replaced your hand-logged running');

      r.toasts[0].undo();
      expect(r.diary.live()).toEqual([expect.objectContaining({ id: mine.id })]);
      expect(r.state.get().review).toHaveLength(1);

      // Replaced for real: later syncs leave it alone.
      r.sync.replaceItem(id);
      await r.sync.sync('manual');
      expect(r.diary.live()).toHaveLength(1);
      expect(r.state.get().review).toEqual([]);
    });

    it('add: both stay', async () => {
      const r = rig({ workouts: [morningRun()], existing: [hand()] });
      await r.sync.sync('auto');
      r.sync.addItem(r.state.get().review[0].id);
      expect(r.diary.live()).toHaveLength(2);
      expect(r.toasts[0].message).toBe('Running added from Garmin Connect');
      r.toasts[0].undo();
      expect(r.diary.live()).toHaveLength(1);
      expect(r.state.get().review).toHaveLength(1);
    });

    it('skip: it is not asked again, and Undo brings the question back', async () => {
      const r = rig({ workouts: [morningRun()], existing: [hand()] });
      await r.sync.sync('auto');
      const id = r.state.get().review[0].id;
      r.sync.skipItem(id);
      expect(r.state.get().review).toEqual([]);
      await r.sync.sync('manual');
      expect(r.state.get().review).toEqual([]);
      expect(r.diary.live()).toHaveLength(1);

      r.toasts[0].undo();
      expect(r.state.get().review).toHaveLength(1);
      await r.sync.sync('manual');
      expect(r.state.get().review).toHaveLength(1);
    });

    it('replace when the hand-logged session is gone meanwhile simply adds', async () => {
      const mine = hand();
      const r = rig({ workouts: [morningRun()], existing: [mine] });
      await r.sync.sync('auto');
      r.diary.remove(mine.id);
      r.sync.replaceItem(r.state.get().review[0].id);
      expect(r.diary.live()).toHaveLength(1);
      expect(r.diary.live()[0].source).toBe('health');
    });

    it('a workout whose type is unknown waits until the person says what it was; the answer is remembered', async () => {
      const first = workout({ start: '2026-11-12T16:00:00Z', minutes: 90, exerciseType: TYPE.other, title: 'Climbing gym', activeKcal: 500 });
      const r = rig({ workouts: [first] });
      expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 0, updated: 0, review: 1 });
      expect(r.toasts).toEqual([]);
      const item = r.state.get().review[0];
      expect(item).toMatchObject({ kind: 'activity', entry: null });

      expect(r.sync.chooseActivity(item.id, 'bouldering')).toBe(true);
      expect(r.diary.live()).toMatchObject([{ activityId: 'bouldering', kcalNet: expect.closeTo(totalFromActive(500, 90) - restingKcal(90), 0), measured: true, notes: 'Climbing gym' }]);
      expect(r.state.get().review).toEqual([]);
      expect(r.toasts[0].message).toBe('1 workout added from Garmin Connect');

      // Next week's session of the same name is added by itself.
      r.health.workouts.push(workout({ start: '2026-11-14T08:00:00Z', minutes: 80, exerciseType: TYPE.other, title: 'Climbing Gym', activeKcal: 450 }));
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toMatchObject({ added: 1, review: 0 });
      expect(r.diary.live().map((e) => e.activityId)).toEqual(['bouldering', 'bouldering']);
    });

    it('choosing an activity for one settles the others of the same kind that are waiting', async () => {
      const r = rig({ workouts: [workout({ start: '2026-11-12T16:00:00Z', minutes: 60, exerciseType: TYPE.paddling }), workout({ start: '2026-11-13T16:00:00Z', minutes: 50, exerciseType: TYPE.paddling })] });
      await r.sync.sync('auto');
      expect(r.state.get().review).toHaveLength(2);
      r.sync.chooseActivity(r.state.get().review[0].id, 'kayaking');
      expect(r.diary.live().map((e) => e.activityId)).toEqual(['kayaking', 'kayaking']);
      expect(r.toasts[0].message).toBe('2 workouts added from Garmin Connect');
    });

    it('a chosen activity that turns out to repeat a hand-logged session keeps waiting with that question', async () => {
      const mine = handLogged('kayaking', 60, '2026-11-12', '2026-11-12T19:00:00');
      const r = rig({ workouts: [workout({ start: '2026-11-12T16:00:00Z', minutes: 62, exerciseType: TYPE.paddling })], existing: [mine] });
      await r.sync.sync('auto');
      r.sync.chooseActivity(r.state.get().review[0].id, 'kayaking');
      expect(r.diary.live()).toHaveLength(1);
      expect(r.state.get().review).toMatchObject([{ kind: 'duplicate', matchId: mine.id, picked: 'kayaking' }]);
      // And the choice survives the next sync.
      await r.sync.sync('manual');
      expect(r.state.get().review).toMatchObject([{ kind: 'duplicate', picked: 'kayaking' }]);
    });
  });

  describe('the phone and the watch', () => {
    it('the watch reading arriving later takes the place of the phone reading, in one message with an Undo', async () => {
      const phone = workout({ start: '2026-11-13T06:02:00Z', minutes: 40, origin: SAMSUNG });
      const r = rig({ workouts: [phone] });
      await r.sync.sync('auto');
      expect(r.diary.live()).toHaveLength(1);
      const phoneId = r.diary.live()[0].id;

      r.health.workouts.push(morningRun());
      r.clock.now += 16 * MIN;
      expect(await r.sync.sync('auto')).toEqual({ status: 'done', added: 0, updated: 1, review: 0 });
      expect(r.diary.live()).toMatchObject([{ kcalNet: RUN_NET, measured: true }]);
      expect(r.diary.live()[0].id).not.toBe(phoneId);
      expect(r.toasts[1].message).toBe('1 workout updated from Garmin Connect');

      r.toasts[1].undo();
      expect(r.diary.live()).toMatchObject([{ id: phoneId }]);
      r.clock.now += 16 * MIN;
      await r.sync.sync('auto');
      expect(r.diary.live()).toMatchObject([{ id: phoneId }]);
    });
  });

  it('500 workouts on the first sync: every one saved once', async () => {
    const many = Array.from({ length: 500 }, (_, i) => workout({ start: new Date(NOON - 29 * 86_400_000 + i * 80 * MIN).toISOString(), minutes: 30 + (i % 30), activeKcal: 200 + i, origin: i % 5 === 0 ? SAMSUNG : GARMIN }));
    const r = rig({ workouts: many });
    expect(await r.sync.sync('manual')).toEqual({ status: 'done', added: 500, updated: 0, review: 0 });
    expect(r.diary.live()).toHaveLength(500);
    expect(r.toasts[0].message).toBe('500 workouts added from Health Connect');
    r.toasts[0].undo();
    expect(r.diary.live()).toEqual([]);
    expect(CTX.weightKg).toBeGreaterThan(0);
  });
});

/**
 * The diary (the app's store, saved a moment after a change) and the sync's
 * memory (saved under its own key) reach the device apart. A phone here is a
 * sync whose memory is on the device the moment it is written (the worst case)
 * and whose diary is on the device only once a flush got through
 * (`diary.disk`); `restart` is the app closed and opened again from what the
 * device holds.
 */
describe('the diary and the sync memory reach the device apart', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  interface Phone extends Rig {
    busy: boolean[];
    saving: boolean[];
  }

  function phone(o: { workouts?: HealthWorkout[]; existing?: ActivityEntry[]; state?: Partial<HealthSyncState>; now?: number } = {}): Phone {
    const { adapter, health } = createFakeAdapter({ access: FULL_ACCESS, workouts: o.workouts ?? [] });
    const diary = memoryDiary(o.existing ?? []);
    const state = memoryState({ enabled: true, ...o.state });
    const toasts: Rig['toasts'] = [];
    const busy: boolean[] = [];
    const saving: boolean[] = [];
    const clock = { now: o.now ?? NOON };
    const sync = createHealthSync({
      adapter,
      now: () => clock.now,
      state,
      diary,
      announce: (message, undo) => toasts.push({ message, undo }),
      onBusy: (b) => busy.push(b),
      onSaving: (b) => saving.push(b),
    });
    return { sync, health, diary, state, toasts, clock, busy, saving };
  }

  /** The app is closed now and opened again later: only what reached the device is there. */
  const restart = (p: Phone, later = 16 * MIN) => phone({ workouts: p.health.workouts, existing: [...p.diary.disk.values()], state: p.state.get(), now: p.clock.now + later });

  /** Let every promise that can move, move. */
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const hand = () => handLogged('running', 45, '2026-11-13', '2026-11-13T09:00:00');

  describe('closed after the memory is written and before the diary is: the workout is not lost', () => {
    it('a sync that adds workouts', async () => {
      const p = phone({ workouts: [morningRun(), eveningRide()] });
      p.diary.flushMode = 'hold';
      void p.sync.sync('auto');
      await settle();
      // The person sees the same as ever: one message with Undo, the workouts in the diary.
      expect(p.toasts.map((t) => t.message)).toEqual(['2 workouts added from Garmin Connect']);
      expect(p.diary.live()).toHaveLength(2);
      // Not remembered before the diary is on the device.
      expect(p.diary.held()).toBe(1);
      expect(p.state.get().handled).toEqual({});

      const q = restart(p);
      expect(q.diary.all()).toEqual([]);
      expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', added: 2 });
      expect(q.diary.live()).toHaveLength(2);
      expect(Object.values(q.state.get().handled).map((h) => h.how)).toEqual(['saved', 'saved']);
    });

    it('"Add" in Needs a look', async () => {
      const p = phone({ workouts: [morningRun()], existing: [hand()] });
      await p.sync.sync('auto');
      const id = p.state.get().review[0].id;
      p.diary.flushMode = 'hold';
      expect(p.sync.addItem(id)).toBe(true);
      await settle();
      expect(p.diary.live()).toHaveLength(2);
      expect(p.state.get().handled[id]).toBeUndefined();

      const q = restart(p);
      expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', review: 1 });
      expect(q.state.get().review.map((r) => r.id)).toEqual([id]);
    });

    it('"Replace" in Needs a look', async () => {
      const mine = hand();
      const p = phone({ workouts: [morningRun()], existing: [mine] });
      await p.sync.sync('auto');
      const id = p.state.get().review[0].id;
      p.diary.flushMode = 'hold';
      expect(p.sync.replaceItem(id)).toBe(true);
      await settle();
      expect(p.state.get().handled[id]).toBeUndefined();

      const q = restart(p);
      expect(q.diary.live()).toEqual([expect.objectContaining({ id: mine.id })]);
      expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', review: 1 });
      expect(q.state.get().review.map((r) => r.id)).toEqual([id]);
    });

    it('choosing the activity of a waiting workout', async () => {
      const p = phone({ workouts: [workout({ start: '2026-11-12T16:00:00Z', minutes: 60, exerciseType: TYPE.paddling })] });
      await p.sync.sync('auto');
      const id = p.state.get().review[0].id;
      p.diary.flushMode = 'hold';
      p.sync.chooseActivity(id, 'kayaking');
      await settle();
      expect(p.state.get().handled[id]).toBeUndefined();

      const q = restart(p);
      // The choice was remembered, so the next sync adds it by itself.
      expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', added: 1 });
      expect(q.diary.live().map((e) => e.activityId)).toEqual(['kayaking']);
    });
  });

  describe('the diary reached the device and the memory did not: it heals at the next sync', () => {
    it('closed while the save was being confirmed', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'hold';
      void p.sync.sync('auto');
      await settle();
      p.diary.write();
      const q = restart(p);
      const id = q.diary.live()[0].id;
      expect(q.state.get().handled).toEqual({});

      expect(await q.sync.sync('auto')).toMatchObject({ added: 0 });
      expect(q.state.get().handled[id]).toMatchObject({ how: 'saved' });
      q.diary.remove(id);
      q.diary.purge(id);
      q.clock.now += 26 * 60 * MIN;
      expect(await q.sync.sync('auto')).toMatchObject({ added: 0, review: 0 });
      expect(q.diary.all()).toEqual([]);
    });

    it('deleted before the next sync, and the deletion marker cleared after it: it stays deleted', async () => {
      const first = phone({ workouts: [morningRun()] });
      await first.sync.sync('auto');
      const saved = first.diary.live()[0];
      // The half state: the workout on the device, the memory without it.
      const p = phone({ workouts: first.health.workouts, existing: [saved], now: NOON + 16 * MIN });
      p.diary.remove(saved.id);
      expect(await p.sync.sync('auto')).toMatchObject({ added: 0 });
      expect(p.state.get().handled[saved.id]).toMatchObject({ how: 'saved' });

      p.diary.purge(saved.id);
      p.clock.now += 26 * 60 * MIN;
      expect(await p.sync.sync('auto')).toMatchObject({ added: 0, review: 0 });
      expect(p.diary.all()).toEqual([]);
    });

    it('reopened within 15 minutes (a too-soon sync), deleted, and the marker cleared a day later: it stays deleted', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'hold';
      void p.sync.sync('auto');
      await settle();
      p.diary.write();
      const q = restart(p, 5 * MIN);
      const id = q.diary.live()[0].id;
      expect(await q.sync.sync('auto')).toEqual({ status: 'skipped', why: 'too-soon' });
      await settle();
      expect(q.health.calls.reads).toBe(0);
      expect(q.state.get().handled[id]).toMatchObject({ how: 'saved' });
      q.diary.remove(id);
      q.diary.purge(id);
      q.clock.now += 25 * 60 * MIN;
      expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', added: 0, review: 0 });
      expect(q.diary.all()).toEqual([]);
    });

    it('a "Sync now" pressed while a too-soon sync heals is a run of its own', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'hold';
      void p.sync.sync('auto');
      await settle();
      p.diary.write();
      const q = restart(p, 5 * MIN);
      q.diary.flushMode = 'hold';
      expect(await q.sync.sync('auto')).toEqual({ status: 'skipped', why: 'too-soon' });
      const manual = q.sync.sync('manual');
      await settle();
      q.diary.release(true);
      expect(await manual).toMatchObject({ status: 'done', added: 0 });
      expect(q.health.calls.reads).toBe(1);
    });

    for (const action of ['Add', 'Replace', 'choosing the activity'] as const) {
      it(`after "${action}" in Needs a look: the next sync remembers it, and a delete stays a delete`, async () => {
        const paddle = workout({ start: '2026-11-12T16:00:00Z', minutes: 60, exerciseType: TYPE.paddling });
        const p = phone(action === 'choosing the activity' ? { workouts: [paddle] } : { workouts: [morningRun()], existing: [hand()] });
        await p.sync.sync('auto');
        const id = p.state.get().review[0].id;
        const memoryBefore = p.state.get();
        p.diary.flushMode = 'hold';
        if (action === 'Add') p.sync.addItem(id);
        else if (action === 'Replace') p.sync.replaceItem(id);
        else p.sync.chooseActivity(id, 'kayaking');
        await settle();
        // The diary reached the device; the memory still holds the item as waiting.
        p.diary.write();
        const q = phone({ workouts: p.health.workouts, existing: [...p.diary.disk.values()], state: memoryBefore, now: p.clock.now + 16 * MIN });
        expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', added: 0, review: 0 });
        expect(q.state.get().handled[id]).toMatchObject({ how: 'saved' });
        q.diary.remove(id);
        q.diary.purge(id);
        q.clock.now += 25 * 60 * MIN;
        expect(await q.sync.sync('auto')).toMatchObject({ added: 0, review: 0 });
        expect(q.diary.records.has(id)).toBe(false);
      });
    }

    it('a failed read heals the memory too', async () => {
      const first = phone({ workouts: [morningRun()] });
      await first.sync.sync('auto');
      const saved = first.diary.live()[0];
      const p = phone({ workouts: first.health.workouts, existing: [saved] });
      p.health.availability = 'update-required';
      expect(await p.sync.sync('auto')).toMatchObject({ status: 'failed' });
      expect(p.state.get().handled[saved.id]).toMatchObject({ how: 'saved' });
    });
  });

  describe('a save that fails', () => {
    it('is not remembered; the person sees the same; the next sync with a working save remembers it', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'fail';
      expect(await p.sync.sync('auto')).toEqual({ status: 'done', added: 1, updated: 0, review: 0 });
      expect(p.toasts).toHaveLength(1);
      expect(p.diary.live()).toHaveLength(1);
      expect(p.state.get().handled).toEqual({});
      expect(p.state.get().lastError).toBeNull();

      p.diary.flushMode = 'ok';
      p.clock.now += 16 * MIN;
      expect(await p.sync.sync('auto')).toMatchObject({ added: 0 });
      expect(Object.keys(p.state.get().handled)).toEqual([p.diary.live()[0].id]);
    });

    it('closed after a failed save: the next start adds the workout again', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'fail';
      await p.sync.sync('auto');
      const q = restart(p);
      expect(await q.sync.sync('auto')).toMatchObject({ added: 1 });
    });

    it('Undo after a failed save still keeps the workouts out', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'fail';
      await p.sync.sync('auto');
      p.toasts[0].undo();
      expect(p.diary.live()).toEqual([]);
      p.diary.flushMode = 'ok';
      p.clock.now += 16 * MIN;
      expect(await p.sync.sync('auto')).toMatchObject({ added: 0 });
      expect(p.diary.live()).toEqual([]);
    });

    it('a save that never answers is given up on, and the sync comes to rest', async () => {
      const { adapter } = createFakeAdapter({ access: FULL_ACCESS, workouts: [morningRun()] });
      const diary = memoryDiary();
      diary.flushMode = 'hold';
      const state = memoryState({ enabled: true });
      const sync = createHealthSync({ adapter, now: () => NOON, state, diary, announce: () => {}, timeoutMs: 20 });
      expect(await sync.sync('auto')).toMatchObject({ status: 'done', added: 1 });
      expect(state.get().handled).toEqual({});
    });
  });

  describe('Undo before the save is confirmed', () => {
    it('takes the workouts out, and they stay out', async () => {
      const p = phone({ workouts: [morningRun(), eveningRide()] });
      p.diary.flushMode = 'hold';
      const run = p.sync.sync('auto');
      await settle();
      p.toasts[0].undo();
      expect(p.diary.live()).toEqual([]);
      // Remembered at once: the person asked for them out.
      expect(Object.values(p.state.get().handled).map((h) => h.how)).toEqual(['saved', 'saved']);
      p.diary.release(true);
      expect(await run).toMatchObject({ added: 2 });
      expect(Object.values(p.state.get().handled).map((h) => h.how)).toEqual(['saved', 'saved']);
      p.clock.now += 16 * MIN;
      p.diary.flushMode = 'ok';
      expect(await p.sync.sync('auto')).toMatchObject({ added: 0 });
      expect(p.diary.live()).toEqual([]);
    });

    it('closed right after the Undo, before the diary was saved: the next start does not add them again', async () => {
      const p = phone({ workouts: [morningRun(), eveningRide()] });
      p.diary.flushMode = 'hold';
      void p.sync.sync('auto');
      await settle();
      p.toasts[0].undo();
      const q = restart(p);
      expect(q.diary.all()).toEqual([]);
      expect(await q.sync.sync('auto')).toMatchObject({ status: 'done', added: 0, review: 0 });
      expect(q.diary.live()).toEqual([]);
    });

    it("an undone change stays skipped: the confirmation never turns it into 'saved'", async () => {
      const p = phone({ workouts: [workout({ start: '2026-11-13T06:02:00Z', minutes: 40, origin: SAMSUNG })] });
      await p.sync.sync('auto');
      const phoneId = p.diary.live()[0].id;
      p.health.workouts.push(morningRun());
      p.clock.now += 16 * MIN;
      p.diary.flushMode = 'hold';
      const run = p.sync.sync('auto');
      await settle();
      expect(p.toasts[1].message).toBe('1 workout updated from Garmin Connect');
      const watchId = p.diary.live()[0].id;
      expect(watchId).not.toBe(phoneId);
      p.toasts[1].undo();
      p.diary.release(true);
      await run;
      expect(p.state.get().handled[watchId]).toMatchObject({ how: 'skipped' });
      expect(p.diary.live()).toMatchObject([{ id: phoneId }]);
      p.diary.flushMode = 'ok';
      p.clock.now += 16 * MIN;
      await p.sync.sync('auto');
      expect(p.diary.live()).toMatchObject([{ id: phoneId }]);
    });

    it('"Add" undone before the save is confirmed waits in the list again, not remembered', async () => {
      const p = phone({ workouts: [morningRun()], existing: [hand()] });
      await p.sync.sync('auto');
      const id = p.state.get().review[0].id;
      p.diary.flushMode = 'hold';
      p.sync.addItem(id);
      p.toasts[0].undo();
      p.diary.release(true);
      await settle();
      expect(p.state.get().review.map((r) => r.id)).toEqual([id]);
      expect(p.state.get().handled[id]).toBeUndefined();
    });
  });

  describe('a sync waiting for its save is busy', () => {
    it('a second trigger meanwhile shares it or is skipped, and the sync is at rest only once the save is confirmed', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'hold';
      const first = p.sync.sync('auto');
      await settle();
      // The screen's "Syncing" ends when the reading and saving is done; the wait for the device is 'saving' (the updater waits for both).
      expect(p.busy).toEqual([true, false]);
      expect(p.saving).toEqual([true]);
      p.clock.now += 16 * MIN;
      expect(await p.sync.sync('auto')).toEqual({ status: 'skipped', why: 'busy' });
      const manual = p.sync.sync('manual');
      expect(p.health.calls.reads).toBe(1);
      p.diary.release(true);
      const [a, b] = await Promise.all([first, manual]);
      expect(a).toEqual(b);
      expect(a).toMatchObject({ status: 'done', added: 1 });
      expect(p.busy).toEqual([true, false]);
      expect(p.saving).toEqual([true, false]);
      expect(p.diary.live()).toHaveLength(1);
    });

    it('"Add" is saving until what it saved is confirmed, and the screen shows no sync for it', async () => {
      const p = phone({ workouts: [morningRun()], existing: [hand()] });
      await p.sync.sync('auto');
      expect(p.busy).toEqual([true, false]);
      p.diary.flushMode = 'hold';
      p.sync.addItem(p.state.get().review[0].id);
      expect(p.saving).toEqual([true]);
      p.diary.release(true);
      await settle();
      expect(p.saving).toEqual([true, false]);
      expect(p.busy).toEqual([true, false]);
    });

    it('two syncs: one waiting for its save, the next one ("Sync now" after it) adds nothing twice', async () => {
      const p = phone({ workouts: [morningRun()] });
      p.diary.flushMode = 'hold';
      const first = p.sync.sync('auto');
      await settle();
      p.diary.release(true);
      await first;
      p.diary.flushMode = 'hold';
      p.health.workouts.push(eveningRide());
      const second = p.sync.sync('manual');
      await settle();
      expect(p.diary.live()).toHaveLength(2);
      // The second run's heal confirms only what is still to be remembered; the first workout is already.
      p.diary.release(true);
      expect(await second).toMatchObject({ status: 'done', added: 1 });
      expect(Object.values(p.state.get().handled).map((h) => h.how)).toEqual(['saved', 'saved']);
      expect(p.saving.at(-1)).toBe(false);
    });

    it('a flush that throws at once is a save not confirmed: nothing escapes and nothing is marked', async () => {
      const p = phone({ workouts: [morningRun()], existing: [hand()] });
      await p.sync.sync('auto');
      const id = p.state.get().review[0].id;
      p.diary.flush = () => {
        throw new Error('storage gone');
      };
      expect(p.sync.addItem(id)).toBe(true);
      await settle();
      expect(p.state.get().handled[id]).toBeUndefined();
      expect(p.saving).toEqual([true, false]);
      p.clock.now += 16 * MIN;
      expect(await p.sync.sync('auto')).toMatchObject({ status: 'done', added: 0 });
      expect(p.state.get().lastError).toBeNull();
    });

    it('a run that saves nothing new does not wait for the device', async () => {
      const p = phone({ workouts: [morningRun()] });
      await p.sync.sync('auto');
      const flushes = p.diary.flushes;
      p.diary.flushMode = 'hold';
      p.clock.now += 16 * MIN;
      expect(await p.sync.sync('auto')).toMatchObject({ status: 'done', added: 0 });
      expect(p.diary.flushes).toBe(flushes);
    });
  });
});
