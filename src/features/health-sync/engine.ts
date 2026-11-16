/**
 * The sync itself, with everything it touches passed in (the adapter, the
 * clock, the diary, the phone's own memory, the toast), so it runs in unit
 * tests against a fake adapter exactly as it runs on a phone.
 *
 * One run: check the health store is there and may be read, list the last 30
 * days of workouts, plan (plan.ts), save what is new, keep what needs a look,
 * and say what was added in one message with an Undo. A run that fails changes
 * nothing in the diary and leaves a note for the sync screen; it never shows
 * anything by itself.
 *
 * What was added is remembered (`handled`) only once the diary is confirmed on
 * the device (`rememberSaved`): the diary and this memory are saved apart, and
 * a memory that ran ahead of the diary would turn a workout lost to a closed
 * app into one "the person deleted", never added again. Until then the sync
 * is saving (`onSaving`), which the updater waits for as it waits for a run.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import type { ImportedEntry } from '@/features/import/convert';
import { replaceHandLoggedPlan } from '@/features/import/plan';
import { isoSeconds } from '@/features/import/time';
import type { ActivityEntry } from '@/types';

import { recordIdFor, workoutSpan, type HealthContext, type HealthEntry } from './convert';
import { choiceKey, planSync, workoutKey, type Handled, type ReviewItem, type SyncPlan } from './plan';
import { pruneHandled, readRange, RECHECK_DAYS, rememberMarks, shouldAutoSync, syncMessage, unremembered, type HealthSyncState, type SyncError, type SyncErrorCode } from './state';
import { localClock, mergeStepDays, NO_STEPS, pruneStepDays, stepDaysFromTotals, stepsReadRange, type StepClock, type StepsMemory } from './steps';
import { HealthError, storeName, type HealthAccess, type HealthAdapter, type HealthWorkout, type StepDayTotal } from './types';

export type SyncTrigger = 'auto' | 'manual';

export type SyncOutcome =
  | { status: 'skipped'; why: 'off' | 'too-soon' | 'no-profile' | 'busy' }
  | { status: 'failed'; error: SyncError }
  | { status: 'done'; added: number; updated: number; review: number };

export type EnableOutcome =
  | { ok: true; sync: SyncOutcome }
  /** 'refused': the person did not allow workouts to be read. Otherwise the health store is missing, old, or not answering. */
  | { ok: false; why: 'refused' | SyncErrorCode };

export interface Diary {
  /** Every saved activity, soft-deleted ones included. */
  all(): ActivityEntry[];
  /** Weight and resting baseline, as a hand-logged session uses, and the resting rate (BMR); null before setup. */
  context(): HealthContext | null;
  /** Insert or replace (a soft-deleted record that is saved again is live again). */
  save(entries: (HealthEntry | ActivityEntry)[]): void;
  /** Soft delete. */
  remove(id: string): void;
  /**
   * Write what the diary holds to the device now. True once it is there; false
   * when the save failed or cannot be confirmed. A workout is remembered as
   * saved only after this said true (`rememberSaved`).
   */
  flush(): Promise<boolean>;
}

export interface SyncDeps {
  adapter: HealthAdapter;
  now(): number;
  state: { get(): HealthSyncState; set(patch: Partial<HealthSyncState>): void };
  diary: Diary;
  /** One confirmation with an Undo. */
  announce(message: string, undo: () => void): void;
  /**
   * Called when a run starts and when it is done, for the screen's "Syncing"
   * and for the updater, which restarts only at rest.
   */
  onBusy?(busy: boolean): void;
  /**
   * Called when the sync starts waiting for what it saved to be confirmed on
   * the device (`rememberSaved`) and when it is done waiting. The screen shows
   * nothing for it; the updater waits for it as it waits for a run.
   */
  onSaving?(saving: boolean): void;
  /** How long the health store may take to answer. Default 45 s. */
  timeoutMs?: number;
  /** Which calendar day an instant is in, for steps. Default: the phone's own zone. */
  stepClock?: StepClock;
}

const DAY_MS = 86_400_000;
/** How long the diary's save may take to be confirmed (less than the health store's limit: nothing waits on it but the memory). */
const FLUSH_LIMIT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HealthError('timeout', 'The health store did not answer in time.')), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function asSyncError(e: unknown, now: number): SyncError {
  const at = new Date(now).toISOString();
  if (e instanceof HealthError) return { code: e.code, at, detail: e.message };
  return { code: 'failed', at, detail: e instanceof Error ? e.message : String(e) };
}

export function createHealthSync(deps: SyncDeps) {
  const { adapter, diary, state } = deps;
  const timeout = deps.timeoutMs ?? 45_000;
  const clock = deps.stepClock ?? localClock;
  // Asked each time: a development build can swap the adapter after this is made.
  const storeLabel = () => storeName(adapter.store);
  const flushLimit = Math.min(timeout, FLUSH_LIMIT_MS);
  let running: Promise<SyncOutcome> | null = null;
  /** Runs reading and saving now (busy), and saves waiting to be confirmed on the device (saving). */
  let runs = 0;
  let confirming = 0;
  let shownBusy = false;
  let shownSaving = false;
  const showBusy = () => {
    if (runs > 0 !== shownBusy) {
      shownBusy = runs > 0;
      deps.onBusy?.(shownBusy);
    }
    if (confirming > 0 !== shownSaving) {
      shownSaving = confirming > 0;
      deps.onSaving?.(shownSaving);
    }
  };

  const startOf = (w: HealthWorkout) => workoutSpan(w)?.startUtc ?? w.startTime;
  const mark = (handled: Record<string, Handled>, id: string, how: Handled['how'], at: string) => ({ ...handled, [id]: { how, at } });
  const unmark = (handled: Record<string, Handled>, ids: string[]) => {
    const out = { ...handled };
    for (const id of ids) delete out[id];
    return out;
  };

  function fail(code: SyncErrorCode, detail?: string): SyncOutcome {
    const error: SyncError = { code, at: new Date(deps.now()).toISOString(), ...(detail ? { detail } : null) };
    state.set({ lastError: error });
    return { status: 'failed', error };
  }

  /**
   * Remember as 'saved' the synced workouts the diary holds (live or deleted)
   * that this phone does not remember yet, but only once the diary has really
   * been written to the device. The diary's store saves a moment after a change
   * and this memory is saved under its own key: marking first would leave a
   * workout remembered as saved that the device never got if the app was closed
   * in between, and the next sync would take it for one the person deleted and
   * never bring it back. When the save cannot be confirmed nothing is marked;
   * the next sync tries again (and heals a memory that missed a workout the
   * other way round). A skip or Undo made while waiting is kept (rememberMarks).
   */
  async function rememberSaved(): Promise<boolean> {
    const s = state.get();
    const marks = unremembered(s.handled, diary.all(), deps.now(), new Set(s.review.map((r) => r.id)));
    if (!Object.keys(marks).length) return true;
    confirming += 1;
    showBusy();
    try {
      // A flush that throws, rejects or never answers is a save that was not confirmed.
      let flushing: Promise<boolean>;
      try {
        flushing = diary.flush();
      } catch {
        flushing = Promise.resolve(false);
      }
      const saved = await withTimeout(flushing, flushLimit).catch(() => false);
      if (!saved) return false;
      // Only what is still there and not waiting again (an Undo put it back in "Needs a look", or the data was erased).
      const latest = state.get();
      const present = new Set(diary.all().map((e) => e.id));
      const waiting = new Set(latest.review.map((r) => r.id));
      const keep = Object.fromEntries(Object.entries(marks).filter(([id]) => present.has(id) && !waiting.has(id)));
      const handled = rememberMarks(latest.handled, keep);
      if (handled !== latest.handled) state.set({ handled });
      return true;
    } finally {
      confirming -= 1;
      showBusy();
    }
  }

  /** Save what the plan adds by itself and say so once (rememberSaved remembers it once it is on the device). Returns how many were added and updated. */
  function apply(plan: SyncPlan, more: Partial<HealthSyncState> = {}): { added: number; updated: number } {
    const saves = [...plan.add, ...plan.update, ...plan.replace];
    if (saves.length) diary.save(saves.map((p) => p.entry));
    for (const r of plan.replace) diary.remove(r.remove.id);
    const added = plan.add.length;
    const updated = plan.update.length + plan.replace.length;
    state.set(more);
    if (added + updated > 0) {
      deps.announce(syncMessage(added, updated, saves.map((p) => p.from), storeLabel()), () => {
        // Take out exactly what was added, and put changed workouts back as they were.
        for (const p of [...plan.add, ...plan.replace]) diary.remove(p.entry.id);
        const back = [...plan.update.map((u) => u.before), ...plan.replace.map((r) => r.remove)];
        if (back.length) diary.save(back);
        // A change the person undid is not made again by the next sync.
        let h = state.get().handled;
        for (const u of plan.update) h = mark(h, recordIdFor(u.entry.startedAt), 'skipped', u.entry.startedAt);
        for (const r of plan.replace) h = mark(h, r.entry.id, 'skipped', r.entry.startedAt);
        // What was added and taken out again is remembered at once, so it stays out even if the app is closed
        // before the diary is saved (the person asked for it out, so this can never hide one they want).
        h = rememberMarks(h, Object.fromEntries(plan.add.map((p) => [p.entry.id, { how: 'saved' as const, at: p.entry.startedAt }])));
        state.set({ handled: h });
      });
    }
    return { added, updated };
  }

  /** Review items carry the activity the person picked for them from one plan to the next. */
  const picksOf = (review: ReviewItem[]) => Object.fromEntries(review.filter((r) => r.picked).map((r) => [workoutKey(r.workout), r.picked as string]));
  const carryPicks = (next: ReviewItem[], before: ReviewItem[]) => {
    const picked = picksOf(before);
    return next.map((r) => (picked[workoutKey(r.workout)] && !r.picked ? { ...r, picked: picked[workoutKey(r.workout)] } : r));
  };

  /** `done` is called once the reading and saving is over, before the wait for the device (the screen's "Syncing" ends there). */
  async function run(trigger: SyncTrigger, done: () => void): Promise<SyncOutcome> {
    const now = deps.now();
    const s = state.get();
    if (!s.enabled) return { status: 'skipped', why: 'off' };
    if (trigger === 'auto' && !shouldAutoSync(s, now)) {
      // Not a run, but the memory still heals (a reopen soon after a closed app is too soon), before the person can delete
      // the workout. Not waited for, so a "Sync now" pressed meanwhile is a run of its own, not this skip.
      void rememberSaved();
      return { status: 'skipped', why: 'too-soon' };
    }
    if (!diary.context()) return { status: 'skipped', why: 'no-profile' };
    state.set({ lastAttemptAt: new Date(now).toISOString() });
    const outcome = await readAndApply(trigger, now, s);
    // Within the run, so a second trigger shares it (or is skipped) until what it saved is on the device.
    // After a failed read too: the memory heals whether or not the health store answered.
    const saving = rememberSaved();
    done();
    await saving;
    return outcome;
  }

  async function readAndApply(trigger: SyncTrigger, now: number, s: HealthSyncState): Promise<SyncOutcome> {
    let access: HealthAccess;
    let read: HealthWorkout[];
    let steps: StepsMemory | null = null;
    try {
      const availability = await withTimeout(adapter.availability(), timeout);
      if (availability !== 'available') return fail(availability);
      access = await withTimeout(adapter.access(), timeout);
      if (!access.workouts) return fail('permission');

      // Details (three more questions per workout) are only asked where they can still
      // change something: not for a workout the diary has with measured calories or that
      // the person edited, one the person deleted, or one this phone already dealt with.
      // "Sync now" asks for all.
      const stored = new Map(diary.all().map((e) => [e.id, e]));
      const recheckFrom = now - RECHECK_DAYS * DAY_MS;
      const needsDetail = (w: { startTime: string }) => {
        if (trigger === 'manual') return true;
        const startMs = Date.parse(w.startTime);
        if (!Number.isFinite(startMs)) return true;
        const id = recordIdFor(isoSeconds(startMs));
        const have = stored.get(id);
        // An estimate may still get its calories; measured: false is the person's own edit, which a sync leaves alone.
        if (have) return !have.deleted && have.measured === undefined && startMs >= recheckFrom;
        return !s.handled[id];
      };
      read = await withTimeout(adapter.readWorkouts(readRange(now), access, { needsDetail }), timeout);
      steps = await readSteps(access, s.steps, now);
    } catch (e) {
      const error = asSyncError(e, deps.now());
      state.set({ lastError: error });
      return { status: 'failed', error };
    }

    // From here on nothing waits: the plan is made from the diary as it is now and saved at once.
    const ctx = diary.context();
    const current = state.get();
    if (!current.enabled || !ctx) return { status: 'skipped', why: current.enabled ? 'no-profile' : 'off' };
    const readKeys = new Set(read.map(workoutKey));
    // Workouts still waiting for an answer stay in the plan even if this read did not return them.
    const waiting = current.review.map((r) => r.workout).filter((w) => !readKeys.has(workoutKey(w)));
    const plan = planSync({
      workouts: [...read, ...waiting],
      existing: diary.all(),
      ctx,
      handled: current.handled,
      choices: current.choices,
      picks: picksOf(current.review),
    });
    const at = new Date(deps.now()).toISOString();
    const { added, updated } = apply(plan, {
      lastSyncedAt: at,
      lastError: null,
      access,
      origins: plan.origins,
      review: carryPicks(plan.review, current.review),
    });
    state.set({
      handled: pruneHandled(state.get().handled, deps.now()),
      lastResult: added + updated > 0 ? { at, added, updated } : state.get().lastResult,
      // Steps the store would not give (not allowed, or the read failed) leave what was kept; old days drop out.
      steps: steps ?? { ...current.steps, days: pruneStepDays(current.steps.days, clock.dayOf(deps.now())) },
    });
    return { status: 'done', added, updated, review: plan.review.length };
  }

  /**
   * Steps since the last read (steps.ts), or null when they may not be read or
   * the read failed: steps are extra, so a failure here never fails the sync.
   */
  async function readSteps(access: HealthAccess, before: StepsMemory, now: number): Promise<StepsMemory | null> {
    if (!access.steps) return null;
    const range = stepsReadRange(before.readAt, now, clock);
    const today = clock.dayOf(now);
    let totals: StepDayTotal[];
    try {
      totals = await withTimeout(adapter.readStepDays({ from: range.from, to: range.to, fromDay: range.fromDay, toDay: today }, access), timeout);
    } catch {
      return null;
    }
    const read = stepDaysFromTotals(totals);
    return { days: mergeStepDays(before.days, read, range.fromDay, today), readAt: new Date(now).toISOString() };
  }

  /** Run a sync. Two triggers at once share one run. */
  function sync(trigger: SyncTrigger): Promise<SyncOutcome> {
    if (running) return trigger === 'manual' ? running : Promise.resolve({ status: 'skipped', why: 'busy' });
    runs += 1;
    showBusy();
    let working = true;
    const done = () => {
      if (!working) return;
      working = false;
      runs -= 1;
      showBusy();
    };
    running = run(trigger, done)
      .catch((e): SyncOutcome => {
        const error = asSyncError(e, deps.now());
        state.set({ lastError: error });
        return { status: 'failed', error };
      })
      .finally(() => {
        running = null;
        done();
      });
    return running;
  }

  /**
   * Turn the switch on: make sure the health store is there, ask for permission
   * if it is not given yet (the screen explains first), then sync straight away.
   */
  async function enable(): Promise<EnableOutcome> {
    try {
      const availability = await withTimeout(adapter.availability(), timeout);
      if (availability !== 'available') return { ok: false, why: availability };
      let access = await withTimeout(adapter.access(), timeout);
      // The permission sheet waits for the person, so it has no time limit.
      if (!access.workouts) access = await adapter.requestAccess();
      if (!access.workouts) return { ok: false, why: 'refused' };
      state.set({ enabled: true, access, lastError: null });
    } catch (e) {
      return { ok: false, why: asSyncError(e, deps.now()).code };
    }
    return { ok: true, sync: await sync('manual') };
  }

  /**
   * Switch off: nothing more is read. What was added stays; so does the memory of what was deleted or skipped.
   * The steps go: they are only a copy of the health store's, shown while sync is on.
   */
  function disable(): void {
    state.set({ enabled: false, review: [], lastError: null, steps: NO_STEPS });
  }

  const itemOf = (id: string) => state.get().review.find((r) => r.id === id);
  const without = (id: string) => state.get().review.filter((r) => r.id !== id);
  const putBack = (item: ReviewItem) => {
    const s = state.get();
    if (s.review.some((r) => r.id === item.id)) return;
    state.set({ review: [...s.review, item].sort((a, b) => startOf(b.workout).localeCompare(startOf(a.workout))), handled: unmark(s.handled, [item.id]) });
  };

  /** "Add": save the waiting workout as it is, beside whatever it may repeat. */
  function addItem(id: string): boolean {
    const item = itemOf(id);
    if (!item?.entry) return false;
    const entry = item.entry;
    const before = diary.all().find((e) => e.id === entry.id);
    diary.save([entry]);
    state.set({ review: without(id) });
    void rememberSaved();
    deps.announce(`${entry.name} added from ${item.from}`, () => {
      if (before) {
        diary.save([before]);
        if (before.deleted) diary.remove(before.id);
      } else diary.remove(entry.id);
      putBack(item);
    });
    return true;
  }

  /** "Skip": leave it out, now and at every later sync. */
  function skipItem(id: string): boolean {
    const item = itemOf(id);
    if (!item) return false;
    state.set({ review: without(id), handled: mark(state.get().handled, id, 'skipped', startOf(item.workout)) });
    deps.announce('Skipped. It will not be asked again', () => putBack(item));
    return true;
  }

  /** "Replace": the waiting workout takes the place of the session it repeats (a hand log keeps its note on the workout). */
  function replaceItem(id: string): boolean {
    const item = itemOf(id);
    if (!item?.entry) return false;
    const match = item.matchId ? diary.all().find((e) => e.id === item.matchId) : undefined;
    if (!match || match.deleted) return addItem(id);
    const byHand = replaceHandLoggedPlan({ status: 'probable-duplicate', match, entry: item.entry as ImportedEntry });
    const save: HealthEntry = byHand ? { ...item.entry, ...(byHand.save.notes ? { notes: byHand.save.notes } : null) } : item.entry;
    const before = diary.all().find((e) => e.id === save.id);
    diary.save([save]);
    diary.remove(match.id);
    state.set({ review: without(id) });
    void rememberSaved();
    deps.announce(byHand ? `Replaced your hand-logged ${match.name.toLowerCase()}` : `Replaced the ${match.name.toLowerCase()} you had`, () => {
      diary.save([match]);
      if (before) {
        diary.save([before]);
        if (before.deleted) diary.remove(before.id);
      } else diary.remove(save.id);
      putBack(item);
    });
    return true;
  }

  /**
   * The person said which activity a waiting workout was. The choice is kept
   * for later workouts of the same kind, and every waiting workout it settles
   * is added now (unless it may repeat something, in which case it keeps waiting with that question).
   */
  function chooseActivity(id: string, activityId: string): boolean {
    const item = itemOf(id);
    const ctx = diary.context();
    if (!item || !ctx || !(activityId in ACTIVITY_BY_ID)) return false;
    const s = state.get();
    const key = choiceKey(item.workout);
    const choices = key ? { ...s.choices, [key]: activityId } : s.choices;
    const review = s.review.map((r) => (r.id === id ? { ...r, picked: activityId } : r));
    const plan = planSync({ workouts: review.map((r) => r.workout), existing: diary.all(), ctx, handled: s.handled, choices, picks: picksOf(review) });
    apply(plan, { choices, review: carryPicks(plan.review, review) });
    void rememberSaved();
    return true;
  }

  return { sync, enable, disable, addItem, skipItem, replaceItem, chooseActivity };
}

export type HealthSync = ReturnType<typeof createHealthSync>;
