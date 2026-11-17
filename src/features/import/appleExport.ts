/**
 * The Health app's export.xml, read as a stream of bytes and never as a whole.
 *
 * "Export All Health Data" writes every sample the phone holds into one XML
 * file whose root is <HealthData>: commonly 0.5 to 3 GB for someone with a
 * watch, nearly all of it <Record> elements (heart rate, energy, distance,
 * steps, sleep, ...). This scanner receives the file's bytes in chunks of any
 * size, finds the tags with byte searches, and keeps only:
 *
 *   - <Workout> elements, with their direct <MetadataEntry> and
 *     <WorkoutStatistics> children (and the statistics inside a newer export's
 *     <WorkoutActivity>, marked as nested), as plain strings;
 *   - <Record type="HKQuantityTypeIdentifierStepCount"> whose start date is on
 *     or after `stepsFromDay`, handed to `onStep` one at a time (the caller
 *     adds them up and keeps no sample);
 *   - <Record type="HKCategoryTypeIdentifierSleepAnalysis"> whose start date is
 *     on or after `sleepFromDay`, handed to `onSleep` one at a time with only
 *     its source, device, dates, value and the HKTimeZone of its direct
 *     <MetadataEntry> children (the caller turns them into nights, sleep.ts);
 *   - the <ExportDate> value.
 *
 * Everything else (heart rate, older sleep, body measurements, the <Me> element
 * with the date of birth, workout events and routes, anything clinical) is
 * passed over by its first bytes: it is never decoded into a string, kept or
 * logged. A record's type and start date are compared as bytes, so a record
 * that is not kept is never decoded either.
 *
 * A tag, an attribute or a multi-byte character can be split across two
 * chunks: the unfinished tag's bytes are carried over to the next chunk, and
 * bytes are only decoded once a whole tag is there. Attribute values have
 * their XML entities decoded (&amp; &lt; &#8217; ...). Pure: no I/O, no clock.
 */
import { strFromU8 } from 'fflate';

import { decodeEntities } from './xml';

export interface RawStat {
  /** 'HKQuantityTypeIdentifierActiveEnergyBurned'. */
  type: string;
  /** The `sum` attribute; null when the statistic has none (heart rate has average, minimum, maximum). */
  sum: number | null;
  unit: string;
  /** Inside a <WorkoutActivity> (a newer export's per-activity figures) rather than on the workout itself. */
  nested: boolean;
}

/** One <Workout> as written, attributes and all, as strings. */
export interface RawWorkout {
  attrs: Record<string, string>;
  /** Direct <MetadataEntry key value> children. */
  metadata: Record<string, string>;
  stats: RawStat[];
}

/** One step-count sample, as written. */
export interface StepRecord {
  sourceName: string;
  startDate: string;
  endDate: string;
  value: string;
}

/** One sleep-analysis sample, as written. Its source name is for grouping in memory only, never kept. */
export interface SleepRecord {
  sourceName: string;
  /** The device string ('<<HKDevice: …>, name:…, model:Watch, …>'): only its kind is ever used. */
  device: string;
  startDate: string;
  endDate: string;
  /** 'HKCategoryValueSleepAnalysisAsleepCore', ... */
  value: string;
  /** The HKTimeZone metadata of the sample ('Europe/Berlin'), when the app wrote one. */
  timeZone: string | null;
}

export interface ScanOptions {
  /** 'YYYY-MM-DD': step records whose start date (as written, in its own offset) is before this are skipped unread. */
  stepsFromDay?: string;
  onStep?(record: StepRecord): void;
  /** 'YYYY-MM-DD': sleep records whose start date (as written) is before this are skipped unread. */
  sleepFromDay?: string;
  onSleep?(record: SleepRecord): void;
}

export interface ScanResult {
  /** A <HealthData> root (or its DOCTYPE) was seen: this is a Health export. */
  isHealthExport: boolean;
  /**
   * The closing </HealthData> was reached. A file cut short (an interrupted
   * copy, AirDrop or save) still has its <ExportDate> near the top, so this is
   * the only sign that it is not the whole export.
   */
  complete: boolean;
  exportDate: string | null;
  workouts: RawWorkout[];
  counts: { records: number; stepRecords: number; sleepRecords: number };
}

export class HealthExportError extends Error {}

const LT = 0x3c;
const GT = 0x3e;
const QUOTE = 0x22;
const SLASH = 0x2f;
const BANG = 0x21;
const QMARK = 0x3f;
/** An unfinished tag longer than this is not XML a Health export writes. */
const MAX_TAG = 4 * 1024 * 1024;

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const STEP_TYPE = ascii('HKQuantityTypeIdentifierStepCount"');
const SLEEP_TYPE = ascii('HKCategoryTypeIdentifierSleepAnalysis"');
const TYPE_ATTR = ascii('type="');
const START_ATTR = ascii('startDate="');

/** Does `buf` hold `pat` at `at`? */
function bytesAt(buf: Uint8Array, at: number, pat: Uint8Array): boolean {
  if (at + pat.length > buf.length) return false;
  for (let i = 0; i < pat.length; i++) if (buf[at + i] !== pat[i]) return false;
  return true;
}

/** Position just after `pat` inside [from, to), or -1. Patterns here start after a space, so a match is an attribute name. */
function after(buf: Uint8Array, from: number, to: number, pat: Uint8Array): number {
  const first = pat[0];
  for (let i = from; i + pat.length <= to; i++) {
    if (buf[i] === first && (buf[i - 1] === 0x20 || buf[i - 1] === 0x0a || buf[i - 1] === 0x09 || buf[i - 1] === 0x0d) && bytesAt(buf, i, pat)) return i + pat.length;
  }
  return -1;
}

/** The element name right after '<' (or '</'), as a string; only called on tags that may matter. */
function nameAt(buf: Uint8Array, from: number, to: number): string {
  let end = from;
  while (end < to) {
    const c = buf[end];
    if (c === 0x20 || c === 0x0a || c === 0x09 || c === 0x0d || c === SLASH || c === GT) break;
    end++;
  }
  let s = '';
  for (let i = from; i < end; i++) s += String.fromCharCode(buf[i]);
  return s;
}

const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function attrsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(text))) out[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
  return out;
}

/** The tag's bytes as text (UTF-8), then its attributes. */
const decodeAttrs = (buf: Uint8Array, lt: number, gt: number) => attrsOf(strFromU8(buf.subarray(lt, gt + 1)));

/** A name that starts with one of these may matter; anything else is skipped by its first letters. */
const firstLetterMatters = new Set([0x57 /* W */, 0x52 /* R */, 0x45 /* E */, 0x48 /* H */, 0x4d /* M */]);

/** Does the start date at `s` (as written, 'YYYY-MM-DD …') fall on or after `day`? Compared as bytes: nothing is decoded. */
function onOrAfter(buf: Uint8Array, s: number, day: Uint8Array): boolean {
  for (let i = 0; i < day.length; i++) {
    const c = buf[s + i];
    if (c < day[i]) return false;
    if (c > day[i]) return true;
  }
  return true;
}

export function createHealthScanner(options: ScanOptions = {}) {
  const fromDay = options.stepsFromDay ? ascii(options.stepsFromDay) : null;
  const sleepFromDay = options.sleepFromDay ? ascii(options.sleepFromDay) : null;
  let carry: Uint8Array | null = null;
  let isHealthExport = false;
  let complete = false;
  let exportDate: string | null = null;
  const workouts: RawWorkout[] = [];
  let records = 0;
  let stepRecords = 0;
  let sleepRecords = 0;
  /** A kept sleep record whose children (its metadata) are still being read: handed on at its </Record>. */
  let sleep: SleepRecord | null = null;
  /** The workout being read, and the names of the open elements inside it. */
  let current: RawWorkout | null = null;
  const inside: string[] = [];

  /** The end of a tag starting at lt: the first '>' outside double quotes (Apple writes only double quotes). -1 when not in the buffer yet. */
  function tagEnd(buf: Uint8Array, lt: number, careful: boolean): number {
    let gt = buf.indexOf(GT, lt + 1);
    if (!careful) return gt;
    while (gt !== -1) {
      let quotes = 0;
      for (let i = lt + 1; i < gt; i++) if (buf[i] === QUOTE) quotes++;
      if (quotes % 2 === 0) return gt;
      gt = buf.indexOf(GT, gt + 1);
    }
    return -1;
  }

  function onRecord(buf: Uint8Array, lt: number, gt: number) {
    records++;
    const t = after(buf, lt + 7, gt, TYPE_ATTR);
    if (t < 0) return;
    if (bytesAt(buf, t, STEP_TYPE)) {
      stepRecords++;
      if (!options.onStep) return;
      if (fromDay) {
        // 'YYYY-MM-DD' compares as text: an old sample is dropped before anything is decoded.
        const s = after(buf, lt + 7, gt, START_ATTR);
        if (s < 0 || !onOrAfter(buf, s, fromDay)) return;
      }
      const a = decodeAttrs(buf, lt, gt);
      options.onStep({ sourceName: a.sourceName ?? '', startDate: a.startDate ?? '', endDate: a.endDate ?? a.startDate ?? '', value: a.value ?? '' });
      return;
    }
    if (!bytesAt(buf, t, SLEEP_TYPE)) return;
    sleepRecords++;
    if (!options.onSleep) return;
    if (sleepFromDay) {
      const s = after(buf, lt + 7, gt, START_ATTR);
      if (s < 0 || !onOrAfter(buf, s, sleepFromDay)) return;
    }
    const a = decodeAttrs(buf, lt, gt);
    const record: SleepRecord = { sourceName: a.sourceName ?? '', device: a.device ?? '', startDate: a.startDate ?? '', endDate: a.endDate ?? a.startDate ?? '', value: a.value ?? '', timeZone: null };
    // A record with children carries its metadata inside: it is handed on at its </Record>.
    if (buf[gt - 1] === SLASH) options.onSleep(record);
    else sleep = record;
  }

  /** One whole tag, buf[lt..gt]. */
  function onTag(buf: Uint8Array, lt: number, gt: number) {
    const c1 = buf[lt + 1];
    const selfClosing = buf[gt - 1] === SLASH;
    if (c1 === SLASH) {
      if (sleep) {
        // Only a kept sleep record's own children come before its </Record> (Apple writes no deeper elements in a record).
        if (nameAt(buf, lt + 2, Math.min(gt, lt + 16)) === 'Record') {
          options.onSleep?.(sleep);
          sleep = null;
        }
        return;
      }
      if (!current) {
        if (nameAt(buf, lt + 2, Math.min(gt, lt + 16)) === 'HealthData') complete = true;
        return;
      }
      inside.pop();
      if (inside.length === 0) {
        workouts.push(current);
        current = null;
      }
      return;
    }
    if (current) {
      const name = nameAt(buf, lt + 1, gt);
      const depth = inside.length; // 1: a direct child of <Workout>
      if (name === 'MetadataEntry' && depth === 1) {
        const a = decodeAttrs(buf, lt, gt);
        if (a.key !== undefined) current.metadata[a.key] = a.value ?? '';
      } else if (name === 'WorkoutStatistics' && (depth === 1 || inside[depth - 1] === 'WorkoutActivity')) {
        const a = decodeAttrs(buf, lt, gt);
        const sum = a.sum !== undefined && a.sum.trim() !== '' ? Number(a.sum) : Number.NaN;
        if (a.type) current.stats.push({ type: a.type, sum: Number.isFinite(sum) ? sum : null, unit: a.unit ?? '', nested: depth > 1 });
      }
      if (!selfClosing) inside.push(name);
      return;
    }
    if (sleep) {
      // A kept sleep record's metadata: only its time zone is read.
      if (c1 === 0x4d && nameAt(buf, lt + 1, Math.min(gt, lt + 20)) === 'MetadataEntry') {
        const a = decodeAttrs(buf, lt, gt);
        if (a.key === 'HKTimeZone' && a.value) sleep.timeZone = a.value;
      }
      return;
    }
    if (!firstLetterMatters.has(c1)) return;
    // Records are nearly all of the file: tell them apart by their first bytes only.
    if (c1 === 0x52 && buf[lt + 2] === 0x65 && buf[lt + 3] === 0x63 && buf[lt + 7] !== undefined && nameAt(buf, lt + 1, Math.min(gt, lt + 12)) === 'Record') {
      onRecord(buf, lt, gt);
      return;
    }
    const name = nameAt(buf, lt + 1, Math.min(gt, lt + 40));
    if (name === 'Workout') {
      const w: RawWorkout = { attrs: decodeAttrs(buf, lt, gt), metadata: {}, stats: [] };
      if (selfClosing) workouts.push(w);
      else {
        current = w;
        inside.push('Workout');
      }
    } else if (name === 'ExportDate') exportDate = decodeAttrs(buf, lt, gt).value ?? null;
    else if (name === 'HealthData') isHealthExport = true;
  }

  function push(chunk: Uint8Array) {
    let buf: Uint8Array;
    if (carry) {
      buf = new Uint8Array(carry.length + chunk.length);
      buf.set(carry, 0);
      buf.set(chunk, carry.length);
      carry = null;
    } else buf = chunk;
    let pos = 0;
    const n = buf.length;
    while (pos < n) {
      const lt = buf.indexOf(LT, pos);
      if (lt === -1) return;
      // Need a few bytes to know what the tag is.
      if (lt + 4 > n) {
        carry = buf.slice(lt);
        return;
      }
      const c1 = buf[lt + 1];
      if (c1 === BANG && buf[lt + 2] === 0x2d && buf[lt + 3] === 0x2d) {
        // A comment: ends at '-->', whatever it holds.
        let end = lt + 4;
        let found = -1;
        while ((end = buf.indexOf(GT, end)) !== -1) {
          if (buf[end - 1] === 0x2d && buf[end - 2] === 0x2d && end - 2 >= lt + 4) {
            found = end;
            break;
          }
          end++;
        }
        if (found === -1) {
          if (n - lt > MAX_TAG) throw new HealthExportError('Unclosed comment.');
          carry = buf.slice(lt);
          return;
        }
        pos = found + 1;
        continue;
      }
      if (c1 === BANG || c1 === QMARK) {
        // DOCTYPE, its declarations, the XML declaration: nothing to keep, except knowing the root.
        const gt = buf.indexOf(GT, lt + 1);
        if (gt === -1) {
          if (n - lt > MAX_TAG) throw new HealthExportError('Unclosed declaration.');
          carry = buf.slice(lt);
          return;
        }
        if (c1 === BANG && nameAt(buf, lt + 2, Math.min(gt, lt + 12)) === 'DOCTYPE' && /\bHealthData\b/.test(strFromU8(buf.subarray(lt, Math.min(gt, lt + 64))))) isHealthExport = true;
        pos = gt + 1;
        continue;
      }
      // Inside a workout every tag is read carefully (quotes respected), so its depth stays right.
      const careful = current !== null || firstLetterMatters.has(c1);
      const gt = tagEnd(buf, lt, careful);
      if (gt === -1) {
        if (n - lt > MAX_TAG) throw new HealthExportError('A tag never ends.');
        carry = buf.slice(lt);
        return;
      }
      onTag(buf, lt, gt);
      pos = gt + 1;
    }
  }

  function finish(): ScanResult {
    // A workout still open is half read (its statistics may come after the cut): it is never handed on as finished.
    // A sleep record still open is the same: a file cut there is refused as incomplete anyway.
    current = null;
    sleep = null;
    inside.length = 0;
    carry = null;
    return { isHealthExport, complete, exportDate, workouts, counts: { records, stepRecords, sleepRecords } };
  }

  return { push, finish };
}

/** True when the first bytes of a text file are a Health export's (its DOCTYPE or <HealthData> root). */
export function looksLikeHealthXml(head: Uint8Array): boolean {
  let s = '';
  const n = Math.min(head.length, 8192);
  for (let i = 0; i < n; i++) s += String.fromCharCode(head[i]);
  return /<!DOCTYPE\s+HealthData\b|<HealthData[\s>]/.test(s);
}
