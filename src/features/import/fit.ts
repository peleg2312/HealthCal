/**
 * FIT reader, written from Garmin's FIT Protocol (rev 2.4) and Profile 21.221.
 *
 * It reads only what an import needs: file_id, sport, session, activity and
 * (for files with no summary) record messages. It handles both header sizes,
 * chained files, per-definition endianness, compressed-timestamp headers,
 * developer fields, local message types redefined mid-file, array fields,
 * invalid-value markers, the FIT epoch and device "system time" below 0x10000000.
 * One workout is returned per session message; multisport files have several.
 */
import { FIT_FILE_ACTIVITY, FIT_FILE_KINDS, FIT_MANUFACTURERS, FIT_SPORTS, FIT_SUB_SPORTS, MESG } from './fitProfile';
import { FIT_EPOCH_OFFSET_S, FIT_MIN_DATE_TIME, fitLocalToWallTime, isoSeconds, wallTimeToEpoch } from './time';
import { ImportError, plural, warn, type ImportedWorkout, type ImportWarning, type ReadResult } from './types';

// ------------------------------------------------------------ low level

/** Size in bytes of each base type number (bits 0-4 of the base type byte). */
const BASE_SIZE = [1, 1, 1, 2, 2, 4, 4, 1, 4, 8, 1, 2, 4, 1, 8, 8, 8];

const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];

/** FIT CRC-16 over bytes[start, end). */
export function fitCrc(bytes: Uint8Array, start = 0, end = bytes.length, seed = 0): number {
  let crc = seed;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc;
}

/** True when the bytes start with a FIT header (size byte then '.FIT' at offset 8). */
export function looksLikeFit(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && bytes[0] >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54;
}

interface FieldDef {
  num: number;
  size: number;
  base: number; // base type number 0-16
}

interface Definition {
  global: number;
  little: boolean;
  fields: FieldDef[];
  devBytes: number;
  /** Bytes of field data that follow the record header. */
  length: number;
}

type FieldValue = number | string;
export type FitMessage = Map<number, FieldValue>;

function utf8(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const c = bytes[i++];
    if (c < 0x80) out += String.fromCharCode(c);
    else if (c >= 0xc0 && c < 0xe0 && i < bytes.length) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (c >= 0xe0 && c < 0xf0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i] & 0x3f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (c >= 0xf0 && i + 2 < bytes.length) {
      const cp = ((c & 0x07) << 18) | ((bytes[i] & 0x3f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      out += String.fromCodePoint(cp);
      i += 3;
    }
  }
  return out;
}

/**
 * One field's value, or undefined when it holds the base type's invalid
 * marker or its size does not fit its type. Arrays give their first element.
 */
function readField(view: DataView, bytes: Uint8Array, at: number, f: FieldDef, little: boolean): FieldValue | undefined {
  if (f.base === 7) {
    const raw = bytes.subarray(at, at + f.size);
    const nul = raw.indexOf(0);
    const s = utf8(nul === -1 ? raw : raw.subarray(0, nul)).trim();
    return s ? s : undefined;
  }
  const size = BASE_SIZE[f.base];
  if (size === undefined || f.size < size || f.size % size !== 0) return undefined;
  switch (f.base) {
    case 0: // enum
    case 2: // uint8
    case 13: { // byte
      const v = view.getUint8(at);
      return v === 0xff ? undefined : v;
    }
    case 1: {
      const v = view.getInt8(at);
      return v === 0x7f ? undefined : v;
    }
    case 10: {
      const v = view.getUint8(at);
      return v === 0 ? undefined : v;
    }
    case 3: {
      const v = view.getInt16(at, little);
      return v === 0x7fff ? undefined : v;
    }
    case 4: {
      const v = view.getUint16(at, little);
      return v === 0xffff ? undefined : v;
    }
    case 11: {
      const v = view.getUint16(at, little);
      return v === 0 ? undefined : v;
    }
    case 5: {
      const v = view.getInt32(at, little);
      return v === 0x7fffffff ? undefined : v;
    }
    case 6: {
      const v = view.getUint32(at, little);
      return v === 0xffffffff ? undefined : v;
    }
    case 12: {
      const v = view.getUint32(at, little);
      return v === 0 ? undefined : v;
    }
    case 8: {
      if (view.getUint32(at, little) === 0xffffffff) return undefined;
      const v = view.getFloat32(at, little);
      return Number.isFinite(v) ? v : undefined;
    }
    case 9: {
      if (view.getUint32(at, little) === 0xffffffff && view.getUint32(at + 4, little) === 0xffffffff) return undefined;
      const v = view.getFloat64(at, little);
      return Number.isFinite(v) ? v : undefined;
    }
    default:
      // 64-bit integers: nothing the importer reads uses them.
      return undefined;
  }
}

export interface DecodedFit {
  /** Messages the importer reads, in file order, keyed by global message number. */
  messages: Map<number, FitMessage[]>;
  /** Number of FIT files found (more than one when files are chained). */
  files: number;
  crcOk: boolean;
  truncated: boolean;
  /** Byte offset where reading stopped early, when it did. */
  stoppedAt: number | null;
}

const WANTED = new Set<number>([MESG.fileId, MESG.sport, MESG.session, MESG.record, MESG.activity]);
const TIMESTAMP_FIELD = 253;

/**
 * Decode the messages the importer needs. Throws ImportError('not-fit') when
 * the bytes are not a FIT file at all; a damaged or cut-short file decodes as
 * far as it can and says so in `crcOk` / `truncated`.
 */
export function decodeFit(bytes: Uint8Array, fileName = 'file.fit'): DecodedFit {
  if (!looksLikeFit(bytes)) {
    throw new ImportError('not-fit', 'This file is not a FIT file: it does not start with a FIT header.', fileName);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const messages = new Map<number, FitMessage[]>();
  let files = 0;
  let crcOk = true;
  let truncated = false;
  let stoppedAt: number | null = null;
  let pos = 0;

  while (pos + 12 <= bytes.length && looksLikeFit(bytes.subarray(pos))) {
    files += 1;
    const headerSize = bytes[pos];
    const dataSize = view.getUint32(pos + 4, true);
    const start = pos + headerSize;
    let end = start + dataSize;
    if (end + 2 > bytes.length) {
      truncated = true;
      end = Math.min(end, bytes.length);
    } else if (fitCrc(bytes, pos, end) !== view.getUint16(end, true)) {
      crcOk = false;
    }

    // Each chained file starts with no definitions.
    const defs: (Definition | undefined)[] = new Array(16);
    let lastTimestamp: number | undefined;
    let p = start;
    while (p < end) {
      const header = bytes[p];
      if (header & 0x80) {
        // Compressed timestamp header: local type in bits 5-6, time offset in bits 0-4.
        const local = (header >> 5) & 0x3;
        const def = defs[local];
        if (!def || p + 1 + def.length > end) {
          stoppedAt = p;
          break;
        }
        const offset = header & 0x1f;
        let ts: number | undefined;
        if (lastTimestamp !== undefined) {
          ts = ((lastTimestamp & ~0x1f) >>> 0) + offset;
          if (offset < (lastTimestamp & 0x1f)) ts += 0x20;
          lastTimestamp = ts;
        }
        const msg = readData(view, bytes, p + 1, def, WANTED.has(def.global));
        if (WANTED.has(def.global)) {
          if (ts !== undefined && !msg.has(TIMESTAMP_FIELD)) msg.set(TIMESTAMP_FIELD, ts);
          push(messages, def.global, msg);
        }
        p += 1 + def.length;
      } else if (header & 0x40) {
        // Definition message.
        const local = header & 0x0f;
        const hasDev = (header & 0x20) !== 0;
        if (p + 6 > end) {
          stoppedAt = p;
          break;
        }
        const little = bytes[p + 2] === 0;
        const global = view.getUint16(p + 3, little);
        const count = bytes[p + 5];
        let q = p + 6;
        if (q + count * 3 > end) {
          stoppedAt = p;
          break;
        }
        const fields: FieldDef[] = [];
        let length = 0;
        for (let i = 0; i < count; i++) {
          const size = bytes[q + 1];
          fields.push({ num: bytes[q], size, base: bytes[q + 2] & 0x1f });
          length += size;
          q += 3;
        }
        let devBytes = 0;
        if (hasDev) {
          if (q + 1 > end) {
            stoppedAt = p;
            break;
          }
          const devCount = bytes[q];
          q += 1;
          if (q + devCount * 3 > end) {
            stoppedAt = p;
            break;
          }
          for (let i = 0; i < devCount; i++) {
            devBytes += bytes[q + 1];
            q += 3;
          }
        }
        defs[local] = { global, little, fields, devBytes, length: length + devBytes };
        p = q;
      } else {
        const local = header & 0x0f;
        const def = defs[local];
        if (!def || p + 1 + def.length > end) {
          stoppedAt = p;
          break;
        }
        const msg = readData(view, bytes, p + 1, def, WANTED.has(def.global));
        const ts = msg.get(TIMESTAMP_FIELD);
        if (typeof ts === 'number') lastTimestamp = ts;
        if (WANTED.has(def.global)) push(messages, def.global, msg);
        p += 1 + def.length;
      }
    }
    if (stoppedAt !== null) {
      truncated = true;
      break;
    }
    pos = end + 2;
  }
  return { messages, files, crcOk, truncated, stoppedAt };
}

function push(map: Map<number, FitMessage[]>, global: number, msg: FitMessage) {
  const list = map.get(global);
  if (list) list.push(msg);
  else map.set(global, [msg]);
}

/** Read a data message. Unwanted messages only have their timestamp read (for compressed headers). */
function readData(view: DataView, bytes: Uint8Array, at: number, def: Definition, wanted: boolean): FitMessage {
  const msg: FitMessage = new Map();
  let q = at;
  for (const f of def.fields) {
    if (wanted || f.num === TIMESTAMP_FIELD) {
      const v = readField(view, bytes, q, f, def.little);
      if (v !== undefined) msg.set(f.num, v);
    }
    q += f.size;
  }
  return msg;
}

// --------------------------------------------------------- to workouts

const num = (m: FitMessage | undefined, field: number): number | undefined => {
  const v = m?.get(field);
  return typeof v === 'number' ? v : undefined;
};
const str = (m: FitMessage | undefined, field: number): string | undefined => {
  const v = m?.get(field);
  return typeof v === 'string' ? v : undefined;
};

const isRealTime = (t: number | undefined): t is number => t !== undefined && t >= FIT_MIN_DATE_TIME;
const fitToMs = (t: number) => (t + FIT_EPOCH_OFFSET_S) * 1000;

export function fitSportName(n: number | undefined): string {
  if (n === undefined) return 'generic';
  return FIT_SPORTS[n] ?? `sport_${n}`;
}

export function fitSubSportName(n: number | undefined): string | null {
  if (n === undefined) return null;
  return FIT_SUB_SPORTS[n] ?? `sub_sport_${n}`;
}

export interface FitReadOptions {
  /** Zone for files whose start is device system time and only local time is known. Default: the device's zone. */
  timeZone?: string;
}

/** Read a FIT file into workouts, one per session. Throws ImportError for files that hold no workout. */
export function readFit(bytes: Uint8Array, fileName = 'file.fit', options: FitReadOptions = {}): ReadResult {
  const decoded = decodeFit(bytes, fileName);
  const warnings: ImportWarning[] = [];
  const get = (g: number) => decoded.messages.get(g) ?? [];

  const fileId = get(MESG.fileId)[0];
  const fileType = num(fileId, 0);
  if (fileType !== undefined && fileType !== FIT_FILE_ACTIVITY) {
    const kind = FIT_FILE_KINDS[fileType] ?? 'non-activity';
    throw new ImportError('fit-not-activity', `This FIT file holds ${kind.startsWith('a') ? 'an' : 'a'} ${kind} file, not a recorded workout.`, fileName);
  }
  if (!decoded.crcOk) {
    warnings.push(warn('fit-crc', 'This file looks damaged (its checksum does not match). Its numbers were read, but check them.', fileName));
  }
  if (decoded.truncated) {
    warnings.push(warn('fit-truncated', 'This file stops part way through, perhaps because the recording or download was cut short. What was there has been read.', fileName));
  }

  const device = deviceLabel(fileId);
  const activity = get(MESG.activity)[0];
  const sports = get(MESG.sport);
  const sessions = get(MESG.session);
  const records = get(MESG.record);

  type Raw = { msg: FitMessage; start: number | undefined; order: number };
  let raws: Raw[] = sessions.map((msg, order) => ({ msg, start: sessionStart(msg), order }));
  let synthetic = false;

  if (raws.length === 0) {
    const fromRecords = sessionFromRecords(records, sports[0]);
    if (fromRecords) {
      raws = [{ msg: fromRecords, start: sessionStart(fromRecords), order: 0 }];
      synthetic = true;
      warnings.push(warn('fit-no-session', 'This file has no summary, usually because the recording stopped early. Duration and distance were worked out from the recorded points, and calories are not known.', fileName));
    }
  }
  if (raws.length === 0) {
    throw new ImportError('fit-no-workouts', 'This FIT file has no workout in it.', fileName);
  }

  // Summaries may be written first or last in the file: order legs by start time.
  raws.sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity) || a.order - b.order);

  const workouts: ImportedWorkout[] = [];
  let systemTime = 0;
  let noStart = 0;
  let noTimer = 0;
  raws.forEach((raw, i) => {
    const s = raw.msg;
    const elapsed = scaled(num(s, 7), 1000);
    const timer = scaled(num(s, 8), 1000);
    const endTs = num(s, TIMESTAMP_FIELD);

    let startMs: number | undefined;
    let fromLocal = false;
    if (isRealTime(raw.start)) {
      startMs = fitToMs(raw.start);
    } else {
      // Device system time (seconds since power-on). Fall back to local wall time
      // from the activity message: local_timestamp is the local time at activity.timestamp.
      const localTs = num(activity, 5);
      const actTs = num(activity, TIMESTAMP_FIELD);
      if (raw.start !== undefined && localTs !== undefined && actTs !== undefined && !isRealTime(actTs)) {
        const localStart = localTs - (actTs - raw.start);
        startMs = wallTimeToEpoch(fitLocalToWallTime(localStart), options.timeZone, fileName);
        fromLocal = true;
        systemTime += 1;
      } else if (isRealTime(endTs) && elapsed !== null) {
        startMs = fitToMs(endTs) - elapsed * 1000;
      }
    }
    if (startMs === undefined) {
      noStart += 1;
      return;
    }

    let durationSec = timer !== null && timer > 0 ? timer : null;
    let includesPauses = false;
    if (durationSec === null && elapsed !== null && elapsed > 0) {
      durationSec = elapsed;
      includesPauses = true;
    }
    if (durationSec === null && isRealTime(endTs) && isRealTime(raw.start) && endTs > raw.start) {
      durationSec = endTs - raw.start;
      includesPauses = true;
    }
    if (durationSec === null) {
      noStart += 1;
      return;
    }
    if (includesPauses && !synthetic) noTimer += 1;

    const sportNum = num(s, 5);
    const sport = fitSportName(sportNum);
    const avgHr = num(s, 16);
    const maxHr = num(s, 17);
    const title = str(s, 110) ?? (raws.length === 1 || sports.length === raws.length ? str(sports[raws.length === 1 ? 0 : i], 3) : undefined) ?? null;
    const w: ImportedWorkout = {
      format: 'fit',
      fileName,
      index: i + 1,
      startUtc: isoSeconds(startMs),
      startFromLocalTime: fromLocal,
      durationSec: round3(durationSec),
      elapsedSec: elapsed === null ? null : round3(elapsed),
      durationIncludesPauses: includesPauses,
      distanceM: scaledOrNull(num(s, 9), 100),
      kcal: num(s, 11) ?? null,
      avgHeartRate: avgHr ?? null,
      maxHeartRate: maxHr ?? null,
      sport,
      subSport: fitSubSportName(num(s, 6)),
      title,
      device,
    };
    if (raws.length > 1) w.leg = { number: i + 1, of: raws.length };
    if (sportNum === 3) w.transition = true;
    workouts.push(w);
  });

  if (systemTime > 0) {
    warnings.push(warn('fit-system-time', "This watch's clock was not set when it recorded, so the start time comes from its local time and the time zone you chose. Check the time before importing.", fileName));
  }
  if (noStart > 0) {
    warnings.push(warn('fit-no-start', `${plural(noStart, 'workout', 'workouts')} in this file had no usable start time or duration and ${noStart === 1 ? 'was' : 'were'} skipped.`, fileName));
  }
  if (noTimer > 0) {
    warnings.push(warn('fit-no-timer', `${plural(noTimer, 'workout', 'workouts')} in this file had no moving time, so the time from start to finish (pauses included) was used.`, fileName));
  }
  if (workouts.length === 0) {
    throw new ImportError('fit-no-workouts', 'This FIT file has no workout with a start time and a duration.', fileName);
  }
  return { workouts, warnings };
}

function sessionStart(s: FitMessage): number | undefined {
  const start = num(s, 2);
  if (start !== undefined) return start;
  const end = num(s, TIMESTAMP_FIELD);
  const elapsed = num(s, 7);
  if (end !== undefined && elapsed !== undefined) return end - Math.round(elapsed / 1000);
  return undefined;
}

/** A stand-in session from record messages, for files cut short before the summary was written. */
function sessionFromRecords(records: FitMessage[], sport: FitMessage | undefined): FitMessage | null {
  let first: number | undefined;
  let last: number | undefined;
  let distance: number | undefined;
  let hrSum = 0;
  let hrCount = 0;
  let hrMax = 0;
  for (const r of records) {
    const t = num(r, TIMESTAMP_FIELD);
    if (isRealTime(t)) {
      if (first === undefined || t < first) first = t;
      if (last === undefined || t > last) last = t;
    }
    const d = num(r, 5);
    if (d !== undefined) distance = Math.max(distance ?? 0, d);
    const hr = num(r, 3);
    if (hr !== undefined && hr > 0) {
      hrSum += hr;
      hrCount += 1;
      hrMax = Math.max(hrMax, hr);
    }
  }
  if (first === undefined || last === undefined || last <= first) return null;
  const s: FitMessage = new Map();
  s.set(2, first);
  s.set(TIMESTAMP_FIELD, last);
  s.set(7, (last - first) * 1000);
  if (distance !== undefined) s.set(9, distance);
  if (hrCount > 0) {
    s.set(16, Math.round(hrSum / hrCount));
    s.set(17, hrMax);
  }
  const sp = num(sport, 0);
  if (sp !== undefined) s.set(5, sp);
  const sub = num(sport, 1);
  if (sub !== undefined) s.set(6, sub);
  return s;
}

function deviceLabel(fileId: FitMessage | undefined): string | null {
  const name = str(fileId, 8);
  if (name) return name;
  const m = num(fileId, 1);
  if (m === undefined) return null;
  return FIT_MANUFACTURERS[m] ?? null;
}

const scaled = (v: number | undefined, scale: number): number | null => (v === undefined ? null : v / scale);
const scaledOrNull = (v: number | undefined, scale: number): number | null => (v === undefined ? null : Math.round((v / scale) * 100) / 100);
const round3 = (v: number) => Math.round(v * 1000) / 1000;
