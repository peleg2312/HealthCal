/**
 * Weigh-ins from the phone's health store (Health Connect Weight and BodyFat;
 * HealthKit BodyMass and BodyFatPercentage), into the synced `weights`
 * collection: one record per day, with body fat when the same app measured it.
 *
 * Everything here is pure: no storage, no clock read (`now` and the calendar
 * come in as arguments, as in sleep.ts and steps.ts), no React, and no profile.
 * A sync never writes the profile: `profile.weightKg` follows a synced weigh-in
 * only by the person's own save or "Use it for targets" on /weight
 * (src/features/trackers/actions.ts).
 *
 * A synced weigh-in is an ordinary `weights` record with `source: 'health'`,
 * the store, the app (`origin`), the reading's instant (`measuredAt`) and what
 * the sync wrote (`syncedKg`, `syncedBodyFatPct`). It stays a synced one only
 * while `isSyncedWeighIn` holds (src/features/trackers/weighInSource.ts): a
 * weight or body fat the person changed makes it theirs, whatever its `source`.
 *
 * The rules, each tested in body.test.ts:
 *  a) Values (`plausibleSample`): a weight is kept from 20 to 400 kg (the
 *     weigh-in sheet's bounds) and rounded to 2 decimals; a body fat at or below
 *     1 is a fraction (HealthKit's percent unit) and is multiplied by 100, then
 *     kept from 3 to 60 % (isPlausibleBodyFat) and rounded to 1 decimal. A
 *     sample without an origin or with a time that cannot be read is dropped.
 *     Instants are kept as `new Date(ms).toISOString()` and always compared
 *     with Date.parse, so '…00Z' and '…00.000Z' are one instant.
 *  b) The day a reading belongs to (`readingDay`): with the record's own zone
 *     offset, the local date where it was measured; without one, the phone's
 *     calendar. 23:30 is that evening's day, 00:10 the next.
 *  c) One weigh-in a day (`weighInsFrom`): the earliest weight reading of the
 *     local day across all apps (the app asks for a morning weigh-in before
 *     breakfast); a tie at the same instant goes to the origin id that sorts
 *     first. A later reading never moves it, so syncs do not churn and two
 *     phones converge. Days before the read's first day are dropped.
 *  d) Body fat: the reading from the same app within 10 minutes of the chosen
 *     weight (the nearest; a tie goes to the earlier), else none. A body-fat
 *     reading alone makes no record.
 *  e) Between two apps on one day, (c)'s earliest wins: a weigh-in is one
 *     measurement, not an estimate, so no app outranks another.
 *  f) `planWeights`, per day: a day remembered as skipped ('weight:<date>') is
 *     never written (checked first: saving a record undeletes it); a day whose
 *     record is deleted is remembered and skipped; a day with nothing gets the
 *     reading; a record that is not a synced one is the person's and is never
 *     touched; a synced one is updated only by an earlier reading that arrived
 *     late (or one at the same instant from an origin that sorts first), or by
 *     the same reading corrected (its kg, or body fat that arrived later or was
 *     corrected). The person's waist, hip, neck and note are kept. Equal figures
 *     write nothing. A later reading never replaces an earlier one, so two
 *     phones that each saw different readings converge on the earliest.
 *  g) The read window (`weightReadRange`): 28 local days the first time, today
 *     included; later from the day before the last read, at least the last 3
 *     days; never further back than 28 days. A deleted weigh-in's marker stays on
 *     a device 30 days after the deletion once uploaded (store/persistence.ts),
 *     and a weigh-in is never deleted before its own date, so every reading in
 *     the window still has its marker, with a day's room for an offset (as
 *     SLEEP_DAYS in sleep.ts). Read from the local midnight of the day before the
 *     first day, so a reading whose own offset puts it on that day is whole.
 *  h) `undoWeighIns`: one Undo with workouts and nights. An added record still
 *     as written goes (soft delete, so its marker keeps every phone from adding
 *     it again); an updated one still as written gets its earlier figures back,
 *     as the person's own (the sync fields go: they chose that value); every
 *     date touched is remembered as skipped at once.
 *  i) `readWeighInsSafely`: a failed or refused read never fails the sync; the
 *     engine then keeps `weightReadAt`, so the next sync reads the same days.
 *  j) Deletion memory: a day the person deleted is remembered under
 *     'weight:<date>' only once the save is confirmed on the device (the engine's
 *     `rememberSaved`, as for sleep). Across phones the synced soft-deleted record
 *     is the memory; the engine plans weigh-ins only after a data-sync round that
 *     pulled after the run began, so it is on the device before planning.
 */
import { isSyncedWeighIn, KG_SAME, sameFat, withoutSyncFields } from '@/features/trackers/weighInSource';
import { addDays } from '@/lib/dates';
import { isPlausibleBodyFat } from '@/lib/energy';
import type { ISODate, SleepStore, WeightEntry } from '@/types';

import type { Handled } from './plan';
import type { StepClock } from './steps';
import type { BodySample, HealthAccess, HealthErrorCode } from './types';
import { HealthError } from './types';

export type { BodySample } from './types';

// ---------------------------------------------------------------- the numbers

/** The weigh-in sheet's bounds (src/app/weight.tsx): a reading outside them is not a person's weight. */
export const MIN_WEIGHT_KG = 20;
export const MAX_WEIGHT_KG = 400;
/** A body-fat reading this close to the weight, from the same app, belongs to it (rule d). */
export const BODY_FAT_PAIR_MS = 10 * 60_000;
/** Local days read by the first sync, today included (rule g). Equal to the learned estimate's window. */
export const WEIGHT_DAYS = 28;
/** Days before today that every sync reads again (so three in all). */
export const WEIGHT_RECHECK_DAYS = 2;

// ---------------------------------------------------------------- shapes

/** One day's weigh-in, as the rules chose it (rule c). */
export interface WeighIn {
  date: ISODate;
  store: SleepStore;
  origin: string;
  /** The reading's instant, `new Date(ms).toISOString()`. */
  measuredAt: string;
  kg: number;
  bodyFatPct: number | null;
}

/** A weigh-in as a sync saves it (upsert fills `id` from the date, and `updatedAt`). */
export type WeightSave = Omit<WeightEntry, 'id' | 'updatedAt'> & {
  source: 'health';
  store: SleepStore;
  origin: string;
  measuredAt: string;
  syncedKg: number;
};

export interface WeightUpdate {
  before: WeightEntry;
  after: WeightEntry;
}

export interface WeightPlan {
  add: WeightSave[];
  update: WeightUpdate[];
  /** Days to remember once the save is confirmed on the device (a deleted record found: skipped). */
  remember: Record<string, Handled>;
}

/** The sync's memory of what the person did with a day's weigh-in. */
export const weightHandledKey = (date: ISODate): string => `weight:${date}`;

const round = (x: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};

// ---------------------------------------------------------------- values (rule a)

/** The sample made safe (rule a), or null when it is not a usable reading. Its time is the canonical ISO form. */
export function plausibleSample(s: BodySample): BodySample | null {
  if (!s || typeof s.origin !== 'string' || !s.origin) return null;
  const ms = typeof s.time === 'string' ? Date.parse(s.time) : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  if (typeof s.value !== 'number' || !Number.isFinite(s.value)) return null;
  const zoneOffsetSec = typeof s.zoneOffsetSec === 'number' && Number.isFinite(s.zoneOffsetSec) ? s.zoneOffsetSec : null;
  let value: number;
  if (s.kind === 'weight') {
    if (s.value < MIN_WEIGHT_KG || s.value > MAX_WEIGHT_KG) return null;
    value = round(s.value, 2);
  } else if (s.kind === 'bodyFat') {
    if (s.value <= 0) return null;
    const pct = s.value <= 1 ? s.value * 100 : s.value;
    if (!isPlausibleBodyFat(pct)) return null;
    value = round(pct, 1);
  } else return null;
  return { store: s.store, origin: s.origin, time: new Date(ms).toISOString(), zoneOffsetSec, kind: s.kind, value };
}

// ---------------------------------------------------------------- the day (rule b)

/** The local date the reading was measured on: by its own offset when it has one, else the phone's calendar. */
export function readingDay(sample: Pick<BodySample, 'time' | 'zoneOffsetSec'>, clock: StepClock): ISODate {
  const ms = Date.parse(sample.time);
  if (typeof sample.zoneOffsetSec === 'number' && Number.isFinite(sample.zoneOffsetSec)) return new Date(ms + sample.zoneOffsetSec * 1000).toISOString().slice(0, 10);
  return clock.dayOf(ms);
}

// ---------------------------------------------------------------- one a day (rules c, d, e)

/** Negative when reading `a` comes first: earlier instant, then the origin id that sorts first. */
function firstReading(a: { ms: number; origin: string }, b: { ms: number; origin: string }): number {
  if (a.ms !== b.ms) return a.ms - b.ms;
  return a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0;
}

/** Rules a to e: one weigh-in per local day from `firstDay` on, oldest day first. */
export function weighInsFrom(samples: readonly BodySample[], clock: StepClock, firstDay: ISODate): WeighIn[] {
  const clean = samples.map(plausibleSample).filter((s): s is BodySample => s !== null);
  const chosen = new Map<ISODate, BodySample & { ms: number }>();
  for (const s of clean) {
    if (s.kind !== 'weight') continue;
    const day = readingDay(s, clock);
    if (day < firstDay) continue;
    const r = { ...s, ms: Date.parse(s.time) };
    const held = chosen.get(day);
    if (!held || firstReading(r, held) < 0) chosen.set(day, r);
  }
  const fats = clean.filter((s) => s.kind === 'bodyFat').map((s) => ({ ...s, ms: Date.parse(s.time) }));
  const out: WeighIn[] = [];
  for (const day of [...chosen.keys()].sort()) {
    const w = chosen.get(day)!;
    let fat: { value: number; ms: number } | null = null;
    for (const f of fats) {
      if (f.origin !== w.origin) continue;
      const gap = Math.abs(f.ms - w.ms);
      if (gap > BODY_FAT_PAIR_MS) continue;
      if (!fat || gap < Math.abs(fat.ms - w.ms) || (gap === Math.abs(fat.ms - w.ms) && f.ms < fat.ms)) fat = f;
    }
    out.push({ date: day, store: w.store, origin: w.origin, measuredAt: w.time, kg: w.value, bodyFatPct: fat ? fat.value : null });
  }
  return out;
}

// ---------------------------------------------------------------- the plan (rule f)

/** The record a sync adds for a weigh-in. */
export function weightRecordFrom(w: WeighIn): WeightSave {
  return {
    date: w.date,
    kg: w.kg,
    ...(w.bodyFatPct !== null ? { bodyFatPct: w.bodyFatPct } : {}),
    source: 'health',
    store: w.store,
    origin: w.origin,
    measuredAt: w.measuredAt,
    syncedKg: w.kg,
    ...(w.bodyFatPct !== null ? { syncedBodyFatPct: w.bodyFatPct } : {}),
  };
}

const parse = (x: string | undefined): number => (typeof x === 'string' ? Date.parse(x) : Number.NaN);
const numOrUndef = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** True when two records hold the same reading: figures, where it came from and what the sync wrote. */
export function sameWeighIn(a: Partial<WeightEntry>, b: Partial<WeightEntry>): boolean {
  const kgSame = (x: unknown, y: unknown) => {
    const p = numOrUndef(x);
    const q = numOrUndef(y);
    return p === undefined || q === undefined ? p === q : Math.abs(p - q) < KG_SAME;
  };
  const ta = parse(a.measuredAt);
  const tb = parse(b.measuredAt);
  return (
    kgSame(a.kg, b.kg) &&
    sameFat(a.bodyFatPct, b.bodyFatPct) &&
    kgSame(a.syncedKg, b.syncedKg) &&
    sameFat(a.syncedBodyFatPct, b.syncedBodyFatPct) &&
    a.source === b.source &&
    a.store === b.store &&
    a.origin === b.origin &&
    (ta === tb || (Number.isNaN(ta) && Number.isNaN(tb)))
  );
}

export interface WeightPlanInput {
  weighIns: readonly WeighIn[];
  /** Every 'weights' record, soft-deleted ones included. */
  existing: readonly WeightEntry[];
  handled: Record<string, Handled>;
}

/** Rule f. */
export function planWeights({ weighIns, existing, handled }: WeightPlanInput): WeightPlan {
  const byDate = new Map<ISODate, WeightEntry[]>();
  for (const r of existing) {
    if (!r || typeof r.date !== 'string') continue;
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  const plan: WeightPlan = { add: [], update: [], remember: {} };
  const seen = new Set<ISODate>();
  for (const w of weighIns) {
    if (seen.has(w.date)) continue;
    seen.add(w.date);
    const key = weightHandledKey(w.date);
    // 1. Deleted or undone: never again. First, because saving a record undeletes it.
    if (handled[key]?.how === 'skipped') continue;
    const records = byDate.get(w.date) ?? [];
    const live = records.find((r) => !r.deleted);
    if (!live) {
      // 2. Deleted here or on another phone: remember it, write nothing.
      if (records.length) {
        plan.remember[key] = { how: 'skipped', at: w.measuredAt };
        continue;
      }
      // 3. Nothing for the day.
      plan.add.push(weightRecordFrom(w));
      continue;
    }
    // 4. Entered or changed by the person: theirs.
    if (!isSyncedWeighIn(live)) continue;
    // 5. A synced weigh-in.
    const next = { ms: Date.parse(w.measuredAt), origin: w.origin };
    const held = { ms: parse(live.measuredAt), origin: live.origin ?? '' };
    const earlier = Number.isFinite(held.ms) && firstReading(next, held) < 0;
    const sameReading = Number.isFinite(held.ms) && next.ms === held.ms && next.origin === held.origin;
    if (!earlier && !sameReading) continue;
    const after: WeightEntry = { ...live, kg: w.kg, store: w.store, origin: w.origin, measuredAt: w.measuredAt, syncedKg: w.kg };
    if (w.bodyFatPct !== null) {
      after.bodyFatPct = w.bodyFatPct;
      after.syncedBodyFatPct = w.bodyFatPct;
    } else if (earlier) {
      // Another reading now: the earlier one's body fat does not describe it.
      delete after.bodyFatPct;
      delete after.syncedBodyFatPct;
    }
    // 6. Same figures: nothing to write.
    if (sameWeighIn(after, live)) continue;
    plan.update.push({ before: live, after });
  }
  return plan;
}

/** How many weigh-ins a plan writes (for the sync's one toast). */
export const weighInChanges = (plan: Pick<WeightPlan, 'add' | 'update'>): number => plan.add.length + plan.update.length;

// ---------------------------------------------------------------- the read window (rule g)

export interface WeightReadRange {
  /** The first local day whose weigh-in may be written. */
  firstDay: ISODate;
  /** What to ask the store for, ISO instants: from the local midnight of the day before `firstDay`, up to now. */
  from: string;
  to: string;
}

/** Rule g. `readAt`: when weigh-ins were last read and confirmed saved (null: never). */
export function weightReadRange(readAt: string | null, now: number, clock: StepClock): WeightReadRange {
  const today = clock.dayOf(now);
  const oldest = addDays(today, -(WEIGHT_DAYS - 1));
  let firstDay = addDays(today, -WEIGHT_RECHECK_DAYS);
  const last = readAt ? Date.parse(readAt) : Number.NaN;
  if (!Number.isFinite(last)) firstDay = oldest;
  else {
    const after = addDays(clock.dayOf(last), -1);
    if (after < firstDay) firstDay = after;
  }
  if (firstDay < oldest) firstDay = oldest;
  return { firstDay, from: new Date(clock.midnightOf(addDays(firstDay, -1))).toISOString(), to: new Date(now).toISOString() };
}

// ---------------------------------------------------------------- Undo (rule h)

export interface WeightUndo {
  /** Records the sync added, still as it wrote them: remove each (soft delete). */
  remove: WeightEntry[];
  /** Records the sync updated, still as it wrote them, with their earlier figures back as the person's own: upsert each. */
  restore: WeightEntry[];
  /** Every day the sync wrote, to remember as skipped at once. */
  marks: Record<string, Handled>;
}

/** Rule h. `current`: the 'weights' records now. A weigh-in the person changed since the sync is left as it is. */
export function undoWeighIns(plan: Pick<WeightPlan, 'add' | 'update'>, current: readonly WeightEntry[]): WeightUndo {
  const liveOn = (date: ISODate) => current.find((r) => r.date === date && !r.deleted);
  const out: WeightUndo = { remove: [], restore: [], marks: {} };
  for (const added of plan.add) {
    out.marks[weightHandledKey(added.date)] = { how: 'skipped', at: added.measuredAt };
    const now = liveOn(added.date);
    if (now && isSyncedWeighIn(now) && parse(now.measuredAt) === Date.parse(added.measuredAt)) out.remove.push(now);
  }
  for (const { before, after } of plan.update) {
    out.marks[weightHandledKey(after.date)] = { how: 'skipped', at: after.measuredAt ?? before.measuredAt ?? `${after.date}T12:00:00.000Z` };
    const now = liveOn(after.date);
    if (!now || !sameWeighIn(now, after)) continue;
    // The person's measurements and note written since stay; the reading's figures go back to the earlier ones.
    const back: WeightEntry = withoutSyncFields({ ...now, kg: before.kg, deleted: false });
    if (typeof before.bodyFatPct === 'number') back.bodyFatPct = before.bodyFatPct;
    else delete back.bodyFatPct;
    out.restore.push(back);
  }
  return out;
}

// ---------------------------------------------------------------- reading (rule i)

/** What the engine asks of the adapter for weigh-ins (HealthAdapter.readWeighIns). */
export interface WeighInReader {
  readWeighIns(range: { from: string; to: string }, access: HealthAccess): Promise<BodySample[]>;
}

export type WeighInRead = { ok: true; samples: BodySample[] } | { ok: false; code: HealthErrorCode; detail: string };

/** Rule i: a weigh-in read that fails or is refused is an answer, never a thrown error that would end the sync. */
export async function readWeighInsSafely(adapter: WeighInReader, range: { from: string; to: string }, access: HealthAccess): Promise<WeighInRead> {
  if (!access.weight) return { ok: true, samples: [] };
  try {
    const samples = await adapter.readWeighIns(range, access);
    return { ok: true, samples: Array.isArray(samples) ? samples : [] };
  } catch (e) {
    if (e instanceof HealthError) return { ok: false, code: e.code, detail: e.message };
    return { ok: false, code: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
}
