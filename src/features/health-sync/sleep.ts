/**
 * Sleep from the phone's health store (Health Connect, Apple Health) and from
 * the Health app's export file: the rules that turn raw sleep samples into
 * nights, and what a sync writes to the sleep log.
 *
 * Everything here is pure: no storage, no clock read (`now` and the calendar
 * come in as arguments, as in steps.ts and plan.ts), no React. The adapters
 * only list samples (`HealthAdapter.readSleep`); the engine reads, calls
 * `nightsFrom` and `planSleep`, writes the plan and offers one Undo.
 *
 * A night is an ordinary `sleep` record (one per wake day, its id derived from
 * the date), with `source: 'health'`, the store, the app it came from and its
 * stages. The rules, each tested in sleep.test.ts:
 *  a) Within one app, overlapping samples count once (their union).
 *  b) One app's samples less than 2 h apart make one period. Its wake day is the
 *     local date of its last moment asleep, by the sample's own zone offset when
 *     the store gives one, else by the phone's calendar. Lengths come from
 *     instants only, so midnight, clock changes and time zones need nothing.
 *  c) Asleep is light + deep + rem + asleep-without-a-stage. Time awake, in bed
 *     and of unknown kind is never counted as sleep: an app that wrote only "in
 *     bed" makes no night. Where one app's samples overlap, the more specific
 *     stage wins: deep, rem, light, awake, then asleep-without-a-stage (so an app
 *     that writes one long "asleep" with its wakings inside is not counted awake).
 *  d) Per app and wake day, the main period is the night: the one with the most
 *     sleep among those that are 3 h or longer or touch 00:00 to 05:00 local
 *     time on the wake day. Every other period is a nap and is not saved. A
 *     night shift (asleep 10:00 to 18:30) is that day's night.
 *  e) Per wake day, one app's night is taken, never a sum: with stages over
 *     without, a watch over a phone or another app, then more sleep, then the
 *     app's id (so two phones always choose the same one).
 *  f) A period that ended less than 15 minutes ago may still be going on: it is
 *     left for a later sync. Every sync reads the last three wake days again.
 *  g) The first sync reads 28 wake days (`SLEEP_DAYS`); later ones from the day
 *     before the last read, at least three wake days. Never further back: a
 *     deleted night's marker leaves a device 30 days after the deletion
 *     (store/persistence.ts), and a night older than that read again would be
 *     added back, then un-delete itself on every device. Samples are read from
 *     local noon two days before the first wake day, so a night that begins in
 *     the evening is whole.
 *  h) `planSleep`: a day the person deleted, or whose sync they undid, is never
 *     written again (checked before any write, because saving a record brings a
 *     deleted one back). A night entered by hand is never touched. A synced
 *     night is updated by a new reading from the same store and app that ends
 *     no earlier (the watch corrected it), or by any reading that ranks strictly higher
 *     by (e), judged on the saved fields only, so phones never take turns
 *     overwriting each other. (Two devices can read the same app's night at
 *     different times, an iPhone and an iPad on one Apple Health, two phones
 *     with Garmin Connect: one that has only the start of the night ends
 *     earlier, so it never cuts the whole night short.) A reading from the export file never replaces one
 *     from a health store. Equal figures write nothing. The person's quality
 *     mark is kept.
 *  i) `undoSleep`: one Undo with the workouts: the added nights go, the updated
 *     ones get their earlier version back, and every day it touched is
 *     remembered so the next sync does not write it again.
 *  j) `readSleepSafely`: a failed or refused sleep read never fails the sync.
 */
import { addDays } from '@/lib/dates';
import type { ISODate, SleepEntry, SleepStages, SleepStore } from '@/types';

import { GARMIN_ORIGINS } from './origins';
import type { Handled } from './plan';
import type { StepClock } from './steps';
import type { HealthAccess, HealthAdapter, HealthErrorCode, SleepSample, SleepSourceKind, SleepStage } from './types';
import { HealthError } from './types';

// ---------------------------------------------------------------- the numbers

/** One app's samples closer than this belong to one period (rule b). */
export const SLEEP_JOIN_GAP_MS = 2 * 3600_000;
/** A period with at least this much sleep is a night wherever it falls (rule d). */
export const NIGHT_MIN_ASLEEP_MIN = 180;
/** A period that touches local 00:00 up to this hour on its wake day is a night, however short (rule d). */
export const NIGHT_WINDOW_END_HOUR = 5;
/** A period that ended less than this long ago may still be going on (rule f). */
export const SLEEP_SETTLE_MS = 15 * 60_000;
/**
 * Wake days read by the first sync and by a Health export, today included
 * (rule g). Less than the 30 days a deleted night's marker stays on a device
 * once uploaded (store/persistence.ts, TOMBSTONE_DAYS_SYNCED), with room for a
 * night's own offset being a day off the phone's calendar: a night is never
 * read again after its marker is gone, so a deleted one cannot come back from
 * a new install, a second phone or an old export. (Workouts have the same
 * guard: their 30-day window starts at the workout, the marker's at the deletion.)
 */
export const SLEEP_DAYS = 28;
/** Wake days before today that every sync reads again (so three in all). */
export const SLEEP_RECHECK_DAYS = 2;
/** Days before the first wake day whose noon the read starts from (rule g). */
export const SLEEP_LEAD_DAYS = 2;

/** The stages that count as sleep. */
const ASLEEP: ReadonlySet<SleepStage> = new Set<SleepStage>(['asleep', 'light', 'deep', 'rem']);

/** Where one app's samples overlap, the higher wins (rule c). 0: not counted at all. */
const PRIORITY: Record<SleepStage, number> = { deep: 5, rem: 4, light: 3, awake: 2, asleep: 1, inBed: 0, unknown: 0 };

// ---------------------------------------------------------------- what a night is

/** One wake day's night from one app, as the rules made it. */
export interface SleepNight {
  /** The wake day, 'YYYY-MM-DD' (rule b). */
  date: ISODate;
  store: SleepStore;
  origin: string;
  kind: SleepSourceKind;
  /** First moment asleep and last, ISO instants ('Z'). */
  startedAt: string;
  endedAt: string;
  /** Whole minutes asleep (light + deep + rem + asleep without a stage). */
  asleepMin: number;
  /** Asleep minutes / 60, rounded to 2 decimals: the record's `hours`. */
  hours: number;
  /** Minutes per stage; null when the app recorded no stages. May add up to less than `asleepMin` where part of the night had none. */
  stages: SleepStages | null;
  /** The offset the wake day was read in (seconds east of UTC); null: the phone's calendar. */
  zoneOffsetSec: number | null;
}

/** A night as it is saved (upsert fills `id` from the date, and `updatedAt`). */
export type SleepSave = Omit<SleepEntry, 'id' | 'updatedAt'> & {
  source: 'health';
  store: SleepStore;
  origin: string;
  startedAt: string;
  endedAt: string;
  stages: SleepStages | null;
};

/** 'watch' for Garmin Connect and an Apple Watch, 'phone' for an iPhone's own sensors, else 'other'. */
export function sleepKindOf(origin: string): SleepSourceKind {
  if (GARMIN_ORIGINS.includes(origin) || origin === 'com.apple.health.watch') return 'watch';
  if (origin === 'com.apple.health.iphone') return 'phone';
  return 'other';
}

// ---------------------------------------------------------------- reading window (rule g)

export interface SleepReadRange {
  /** The first wake day that may be written. */
  firstDay: ISODate;
  /** The phone's day now: the last wake day that may be written. */
  today: ISODate;
  /** What to ask the store for, ISO instants: from local noon `SLEEP_LEAD_DAYS` before `firstDay`, up to now. */
  from: string;
  to: string;
}

/**
 * What one sync reads. `readAt`: when sleep was last read successfully (null:
 * never). The last three wake days every time, from the day before the last
 * read after a pause, 35 days the first time; never further back than that.
 */
export function sleepReadRange(readAt: string | null, now: number, clock: StepClock): SleepReadRange {
  const today = clock.dayOf(now);
  const oldest = addDays(today, -(SLEEP_DAYS - 1));
  let firstDay = addDays(today, -SLEEP_RECHECK_DAYS);
  const last = readAt ? Date.parse(readAt) : Number.NaN;
  if (!Number.isFinite(last)) firstDay = oldest;
  else {
    const after = addDays(clock.dayOf(last), -1);
    if (after < firstDay) firstDay = after;
  }
  if (firstDay < oldest) firstDay = oldest;
  const from = clock.midnightOf(addDays(firstDay, -SLEEP_LEAD_DAYS)) + 12 * 3600_000;
  return { firstDay, today, from: new Date(from).toISOString(), to: new Date(now).toISOString() };
}

// ---------------------------------------------------------------- samples to nights (rules a to f)

interface Seg {
  s: number;
  e: number;
  stage: SleepStage;
  offset: number | null;
  kind: SleepSourceKind;
}

interface Period {
  segs: Seg[];
  /** Asleep-type samples only: the period's raw span. */
  start: number;
  end: number;
}

interface Measured {
  store: SleepStore;
  origin: string;
  kind: SleepSourceKind;
  date: ISODate;
  asleepMs: number;
  first: number;
  last: number;
  stageMs: { light: number; deep: number; rem: number; awake: number };
  offset: number | null;
  /** The raw span's end, for rule f. */
  rawEnd: number;
}

const KIND_ORDER: Record<SleepSourceKind, number> = { watch: 2, phone: 1, other: 1 };

function toSeg(x: SleepSample): Seg | null {
  if (!x || typeof x.start !== 'string' || typeof x.end !== 'string') return null;
  const s = Date.parse(x.start);
  const e = Date.parse(x.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  if (!(x.stage in PRIORITY)) return null;
  const offset = typeof x.zoneOffsetSec === 'number' && Number.isFinite(x.zoneOffsetSec) ? x.zoneOffsetSec : null;
  return { s, e, stage: x.stage, offset, kind: x.kind === 'watch' || x.kind === 'phone' ? x.kind : 'other' };
}

/** Rule b: one app's asleep-type samples less than 2 h apart; awake samples go with the period they overlap. */
function periodsOf(segs: Seg[]): Period[] {
  const asleep = segs.filter((g) => ASLEEP.has(g.stage)).sort((a, b) => a.s - b.s || a.e - b.e);
  const periods: Period[] = [];
  for (const g of asleep) {
    const cur = periods[periods.length - 1];
    if (cur && g.s - cur.end < SLEEP_JOIN_GAP_MS) {
      cur.segs.push(g);
      if (g.e > cur.end) cur.end = g.e;
    } else periods.push({ segs: [g], start: g.s, end: g.e });
  }
  for (const g of segs) {
    if (g.stage !== 'awake') continue;
    const p = periods.find((q) => g.s < q.end && g.e > q.start);
    if (p) p.segs.push({ ...g, s: Math.max(g.s, p.start), e: Math.min(g.e, p.end) });
  }
  return periods;
}

/** The local date of an instant, by a fixed offset or the phone's calendar. */
function dayAt(ms: number, offset: number | null, clock: StepClock): ISODate {
  return offset === null ? clock.dayOf(ms) : new Date(ms + offset * 1000).toISOString().slice(0, 10);
}

/** Local midnight that starts `day`, by a fixed offset or the phone's calendar. */
function midnightAt(day: ISODate, offset: number | null, clock: StepClock): number {
  if (offset === null) return clock.midnightOf(day);
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - offset * 1000;
}

/** Rules a and c: sleep and stage time of one period, each moment counted once at its most specific stage. */
function measure(p: Period, store: SleepStore, origin: string, clock: StepClock): Measured | null {
  const points = [...new Set(p.segs.flatMap((g) => [g.s, g.e]))].sort((a, b) => a - b);
  const stageMs = { light: 0, deep: 0, rem: 0, awake: 0 };
  let asleepMs = 0;
  let first = Number.NaN;
  let last = Number.NaN;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    let top: SleepStage | null = null;
    for (const g of p.segs) if (g.s <= a && g.e >= b && PRIORITY[g.stage] > 0 && (!top || PRIORITY[g.stage] > PRIORITY[top])) top = g.stage;
    if (!top) continue;
    const len = b - a;
    if (top === 'awake') {
      stageMs.awake += len;
      continue;
    }
    asleepMs += len;
    if (top === 'light' || top === 'deep' || top === 'rem') stageMs[top] += len;
    if (Number.isNaN(first)) first = a;
    last = b;
  }
  if (asleepMs <= 0) return null;
  // The wake day is read in the offset of the sample that ends last (any sample of the period that has one, else the phone's).
  const byEnd = p.segs.filter((g) => ASLEEP.has(g.stage)).sort((x, y) => y.e - x.e);
  const offset = byEnd[0]?.offset ?? byEnd.find((g) => g.offset !== null)?.offset ?? null;
  const kind = p.segs.some((g) => g.kind === 'watch') ? 'watch' : p.segs.some((g) => g.kind === 'phone') ? 'phone' : 'other';
  return { store, origin, kind, date: dayAt(last, offset, clock), asleepMs, first, last, stageMs, offset, rawEnd: p.end };
}

/** Rule d's night test. */
function isNight(m: Measured, clock: StepClock): boolean {
  if (m.asleepMs >= NIGHT_MIN_ASLEEP_MIN * 60_000) return true;
  const start = midnightAt(m.date, m.offset, clock);
  return m.first < start + NIGHT_WINDOW_END_HOUR * 3600_000 && m.last > start;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toNight(m: Measured): SleepNight {
  const staged = m.stageMs.light + m.stageMs.deep + m.stageMs.rem > 0;
  const min = (ms: number) => Math.round(ms / 60_000);
  return {
    date: m.date,
    store: m.store,
    origin: m.origin,
    kind: m.kind,
    startedAt: new Date(m.first).toISOString(),
    endedAt: new Date(m.last).toISOString(),
    asleepMin: min(m.asleepMs),
    hours: round2(m.asleepMs / 3600_000),
    stages: staged ? { light: min(m.stageMs.light), deep: min(m.stageMs.deep), rem: min(m.stageMs.rem), awake: min(m.stageMs.awake) } : null,
    zoneOffsetSec: m.offset,
  };
}

/**
 * Rule e between two nights read now: > 0 when `a` is the better night of its
 * day, < 0 when `b` is, 0 only for the same app's same figures.
 */
export function compareNights(a: Pick<SleepNight, 'stages' | 'kind' | 'hours' | 'origin'>, b: Pick<SleepNight, 'stages' | 'kind' | 'hours' | 'origin'>): number {
  const staged = Number(a.stages !== null) - Number(b.stages !== null);
  if (staged) return staged;
  const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kind) return kind;
  if (a.hours !== b.hours) return a.hours > b.hours ? 1 : -1;
  if (a.origin !== b.origin) return a.origin < b.origin ? 1 : -1;
  return 0;
}

export interface NightsOptions {
  /** Now, epoch ms (rule f). */
  now: number;
  /** The phone's calendar: the wake day of a sample without a zone offset, and today. */
  clock: StepClock;
  /** Only wake days from this one on are returned (`sleepReadRange().firstDay`). */
  firstDay?: ISODate;
}

/**
 * Rules a to f: the samples of one read (any stores, any apps) as at most one
 * night per wake day, oldest first. Wake days after the phone's today are left
 * out. Samples that make no sense (no times, end before start) are ignored.
 */
export function nightsFrom(samples: readonly SleepSample[], options: NightsOptions): SleepNight[] {
  const { now, clock, firstDay } = options;
  const today = clock.dayOf(now);
  const groups = new Map<string, { store: SleepStore; origin: string; segs: Seg[] }>();
  for (const x of samples) {
    const seg = toSeg(x);
    if (!seg || typeof x.origin !== 'string' || !x.origin) continue;
    const key = `${x.store}\u0000${x.origin}`;
    const g = groups.get(key) ?? { store: x.store, origin: x.origin, segs: [] };
    g.segs.push(seg);
    groups.set(key, g);
  }
  // Rule d: one main period per app and wake day.
  const mains = new Map<string, Measured>();
  for (const g of groups.values()) {
    for (const p of periodsOf(g.segs)) {
      if (p.end > now - SLEEP_SETTLE_MS) continue;
      const m = measure(p, g.store, g.origin, clock);
      if (!m || !isNight(m, clock)) continue;
      const key = `${g.store}\u0000${g.origin}\u0000${m.date}`;
      const had = mains.get(key);
      if (!had || m.asleepMs > had.asleepMs || (m.asleepMs === had.asleepMs && m.last > had.last)) mains.set(key, m);
    }
  }
  // Rule e: one app per wake day.
  const best = new Map<ISODate, SleepNight>();
  for (const m of mains.values()) {
    if (m.date > today || (firstDay && m.date < firstDay)) continue;
    const night = toNight(m);
    const had = best.get(night.date);
    if (!had || compareNights(night, had) > 0) best.set(night.date, night);
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- what a sync writes (rule h)

/** The memory key of a wake day in the sync's `handled` (state.ts), beside the workouts' record ids. */
export const sleepHandledKey = (date: ISODate): string => `sleep:${date}`;

/** The record a night becomes. */
export function sleepRecordFrom(night: SleepNight): SleepSave {
  return {
    date: night.date,
    hours: night.hours,
    source: 'health',
    store: night.store,
    origin: night.origin,
    startedAt: night.startedAt,
    endedAt: night.endedAt,
    stages: night.stages ? { ...night.stages } : null,
  };
}

type Rankable = Pick<SleepEntry, 'hours' | 'origin' | 'stages'>;

/**
 * Rule e on saved figures only (the kind from the app's id, not from a
 * device type only one phone can see), so every phone ranks two records the
 * same way and no two phones take turns overwriting a night.
 */
export function outranks(a: Rankable, b: Rankable): boolean {
  const key = (r: Rankable) => ({ stages: r.stages ?? null, kind: sleepKindOf(r.origin ?? ''), hours: r.hours, origin: r.origin ?? '' });
  return compareNights(key(a), key(b)) > 0;
}

const sameStages = (a: SleepStages | null | undefined, b: SleepStages | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.light === b.light && a.deep === b.deep && a.rem === b.rem && a.awake === b.awake);

/** The figures a sync writes are the same (quality and the record's own fields aside). */
export function sameNight(a: Partial<SleepEntry>, b: Partial<SleepEntry>): boolean {
  return (
    a.date === b.date &&
    a.hours === b.hours &&
    a.source === b.source &&
    a.store === b.store &&
    a.origin === b.origin &&
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt &&
    sameStages(a.stages, b.stages)
  );
}

export interface SleepUpdate {
  /** The record as it is now. */
  before: SleepEntry;
  /** The same record (id, quality) with the new reading's figures. */
  after: SleepEntry;
}

export interface SleepPlan {
  /** Nights for days with no record: upsert each into 'sleep'. */
  add: SleepSave[];
  /** Synced nights with a better or corrected reading: upsert each `after`. */
  update: SleepUpdate[];
  /**
   * Days the person deleted, to remember in `handled` (sleepHandledKey) once
   * the diary is saved, so a night stays deleted after the deletion marker is
   * dropped for good.
   */
  remember: Record<string, Handled>;
}

export interface SleepPlanInput {
  /** From `nightsFrom`. */
  nights: readonly SleepNight[];
  /** Every 'sleep' record, the deleted ones included. */
  existing: readonly SleepEntry[];
  /** The sync's memory on this phone (state.ts `handled`). */
  handled: Readonly<Record<string, Handled>>;
}

/** The new reading's last moment asleep is before the saved night's. */
function endsEarlier(next: Pick<SleepEntry, 'endedAt'>, live: Pick<SleepEntry, 'endedAt'>): boolean {
  const a = Date.parse(next.endedAt ?? '');
  const b = Date.parse(live.endedAt ?? '');
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

/** Rule h, for each night read. */
export function planSleep({ nights, existing, handled }: SleepPlanInput): SleepPlan {
  const byDate = new Map<ISODate, SleepEntry[]>();
  for (const r of existing) {
    if (!r || typeof r.date !== 'string') continue;
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  const plan: SleepPlan = { add: [], update: [], remember: {} };
  const seen = new Set<ISODate>();
  for (const night of nights) {
    if (seen.has(night.date)) continue;
    seen.add(night.date);
    const key = sleepHandledKey(night.date);
    // 1. Deleted or undone: never again. First, because saving a record un-deletes it.
    if (handled[key]?.how === 'skipped') continue;
    const records = byDate.get(night.date) ?? [];
    const live = records.find((r) => !r.deleted);
    if (!live) {
      if (records.length) {
        plan.remember[key] = { how: 'skipped', at: night.startedAt };
        continue;
      }
      // 2. Nothing for the day.
      plan.add.push(sleepRecordFrom(night));
      continue;
    }
    // 3. Entered or changed by the person: theirs.
    if (live.source !== 'health') continue;
    // 4. A synced night.
    const next = sleepRecordFrom(night);
    if (night.store === 'file' && live.store !== 'file') continue;
    // A correction from the same store and app keeps or extends the night's end; a reading that ends earlier is
    // another device that has not seen the whole night yet, and must outrank the saved one like any other.
    const correction = live.store === night.store && live.origin === night.origin && !endsEarlier(next, live);
    if (!correction && !outranks(next, live)) continue;
    const after: SleepEntry = { ...live, ...next };
    // 5. Same figures: nothing to write.
    if (sameNight(after, live)) continue;
    plan.update.push({ before: live, after });
  }
  return plan;
}

/** How many nights a plan writes (for the sync's one toast). */
export const sleepChanges = (plan: Pick<SleepPlan, 'add' | 'update'>): number => plan.add.length + plan.update.length;

// ---------------------------------------------------------------- Undo (rule i)

export interface SleepUndo {
  /** Records the sync added, still as it wrote them: remove each (soft delete). */
  remove: SleepEntry[];
  /** The earlier versions of nights the sync updated, still as it wrote them: upsert each. */
  restore: SleepEntry[];
  /** Every day the sync wrote, to remember in `handled` once the diary is saved, so no later sync writes it again. */
  marks: Record<string, Handled>;
}

/**
 * Rule i. `current`: the 'sleep' records now. A night the person changed since
 * the sync wrote it (its hours, so it is theirs now) is left as it is.
 */
export function undoSleep(plan: Pick<SleepPlan, 'add' | 'update'>, current: readonly SleepEntry[]): SleepUndo {
  const liveOn = (date: ISODate) => current.find((r) => r.date === date && !r.deleted);
  const out: SleepUndo = { remove: [], restore: [], marks: {} };
  for (const added of plan.add) {
    out.marks[sleepHandledKey(added.date)] = { how: 'skipped', at: added.startedAt };
    const now = liveOn(added.date);
    if (now && sameNight(now, added)) out.remove.push(now);
  }
  for (const { before, after } of plan.update) {
    out.marks[sleepHandledKey(after.date)] = { how: 'skipped', at: after.startedAt ?? before.startedAt ?? `${after.date}T12:00:00.000Z` };
    const now = liveOn(after.date);
    // A quality mark given since the sync stays: it is the person's, not the reading's.
    if (now && sameNight(now, after)) out.restore.push(now.quality !== undefined ? { ...before, quality: now.quality, deleted: false } : { ...before, deleted: false });
  }
  return out;
}

// ---------------------------------------------------------------- reading (rule j)
// (The words for where a night came from are trackers/sleepSource.ts, sleepFromLine.)

export type SleepRead = { ok: true; samples: SleepSample[] } | { ok: false; code: HealthErrorCode; detail: string };

/** Rule j: a sleep read that fails or is refused is an answer, never a thrown error that would end the sync. */
export async function readSleepSafely(adapter: Pick<HealthAdapter, 'readSleep'>, range: { from: string; to: string }, access: HealthAccess): Promise<SleepRead> {
  if (!access.sleep) return { ok: true, samples: [] };
  try {
    const samples = await adapter.readSleep(range, access);
    return { ok: true, samples: Array.isArray(samples) ? samples : [] };
  } catch (e) {
    if (e instanceof HealthError) return { ok: false, code: e.code, detail: e.message };
    return { ok: false, code: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
}

