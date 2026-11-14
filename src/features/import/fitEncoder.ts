/**
 * A tiny FIT writer used by the unit tests to build files byte by byte
 * (no real recordings are committed). Not used by the app.
 */
import { fitCrc } from './fit';
import { FIT_EPOCH_OFFSET_S } from './time';

/** Base type bytes as they appear in a definition message. */
export const T = {
  enum: 0x00,
  sint8: 0x01,
  uint8: 0x02,
  sint16: 0x83,
  uint16: 0x84,
  sint32: 0x85,
  uint32: 0x86,
  string: 0x07,
  float32: 0x88,
  uint8z: 0x0a,
  uint16z: 0x8b,
  uint32z: 0x8c,
  byte: 0x0d,
} as const;

const INVALID: Record<number, number> = {
  0x00: 0xff, 0x01: 0x7f, 0x02: 0xff, 0x83: 0x7fff, 0x84: 0xffff, 0x85: 0x7fffffff, 0x86: 0xffffffff, 0x0a: 0, 0x8b: 0, 0x8c: 0, 0x0d: 0xff,
};
const SIZE: Record<number, number> = { 0x00: 1, 0x01: 1, 0x02: 1, 0x83: 2, 0x84: 2, 0x85: 4, 0x86: 4, 0x07: 1, 0x88: 4, 0x0a: 1, 0x8b: 2, 0x8c: 4, 0x0d: 1 };

/** FIT date_time for an ISO instant. */
export const fitTime = (iso: string) => Date.parse(iso) / 1000 - FIT_EPOCH_OFFSET_S;

type FieldSpec = [num: number, size: number, base: number];
type Value = number | string | null;

interface LocalDef {
  fields: FieldSpec[];
  big: boolean;
  devSize: number;
}

export class FitWriter {
  private out: number[] = [];
  private defs: (LocalDef | undefined)[] = [];

  /** Definition message for a local type. `dev` adds developer fields (number, size, data index). */
  define(local: number, global: number, fields: FieldSpec[], opts: { bigEndian?: boolean; dev?: FieldSpec[] } = {}): this {
    const big = opts.bigEndian === true;
    this.out.push(0x40 | (opts.dev ? 0x20 : 0) | local, 0, big ? 1 : 0);
    this.out.push(...(big ? [(global >> 8) & 0xff, global & 0xff] : [global & 0xff, (global >> 8) & 0xff]));
    this.out.push(fields.length);
    for (const [n, size, base] of fields) this.out.push(n, size, base);
    let devSize = 0;
    if (opts.dev) {
      this.out.push(opts.dev.length);
      for (const [n, size, idx] of opts.dev) {
        this.out.push(n, size, idx);
        devSize += size;
      }
    }
    this.defs[local] = { fields, big, devSize };
    return this;
  }

  /** Normal data message. null writes the base type's invalid marker. */
  data(local: number, values: Value[]): this {
    this.out.push(local & 0x0f);
    this.writeValues(local, values);
    return this;
  }

  /** Compressed-timestamp data message (local types 0-3, offset 0-31 s). */
  compressed(local: number, offset: number, values: Value[]): this {
    this.out.push(0x80 | ((local & 0x3) << 5) | (offset & 0x1f));
    this.writeValues(local, values);
    return this;
  }

  /** Raw bytes, for building broken files. */
  raw(...bytes: number[]): this {
    this.out.push(...bytes);
    return this;
  }

  private writeValues(local: number, values: Value[]) {
    const def = this.defs[local];
    if (!def) throw new Error(`local ${local} not defined`);
    def.fields.forEach(([, size, base], i) => {
      const v = values[i] ?? null;
      if (base === T.string) {
        const s = typeof v === 'string' ? Array.from(new TextEncoder().encode(v)) : [];
        for (let k = 0; k < size; k++) this.out.push(s[k] ?? 0);
        return;
      }
      const one = SIZE[base];
      for (let k = 0; k < size; k += one) {
        const bytes = encode(k === 0 ? v : null, base, def.big);
        this.out.push(...bytes.slice(0, Math.min(one, size - k)));
      }
    });
    for (let k = 0; k < def.devSize; k++) this.out.push(0xaa);
  }

  /** The whole file with header and CRC. */
  bytes(opts: { headerSize?: 12 | 14; corruptCrc?: boolean } = {}): Uint8Array {
    const headerSize = opts.headerSize ?? 14;
    const data = this.out;
    const header = [headerSize, 0x20, 0x00, 0x08, ...u32le(data.length), 0x2e, 0x46, 0x49, 0x54];
    if (headerSize === 14) {
      const crc = fitCrc(new Uint8Array(header));
      header.push(crc & 0xff, crc >> 8);
    }
    const body = new Uint8Array([...header, ...data]);
    let crc = fitCrc(body);
    if (opts.corruptCrc) crc ^= 0x1234;
    return new Uint8Array([...body, crc & 0xff, crc >> 8]);
  }
}

function u32le(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function encode(v: Value, base: number, big: boolean): number[] {
  const size = SIZE[base];
  const buf = new DataView(new ArrayBuffer(size));
  const little = !big;
  if (base === T.float32) {
    if (v === null) buf.setUint32(0, 0xffffffff, little);
    else buf.setFloat32(0, Number(v), little);
  } else {
    const n = v === null ? INVALID[base] : Number(v);
    if (size === 1) buf.setUint8(0, n & 0xff);
    else if (size === 2) buf.setUint16(0, n & 0xffff, little);
    else buf.setUint32(0, n >>> 0, little);
  }
  return Array.from(new Uint8Array(buf.buffer));
}

/** Concatenate files (chained FIT). */
export function chain(...files: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(files.reduce((n, f) => n + f.length, 0));
  let at = 0;
  for (const f of files) {
    out.set(f, at);
    at += f.length;
  }
  return out;
}

/** Field lists for the messages the tests write. */
export const FILE_ID: FieldSpec[] = [[0, 1, T.enum], [1, 2, T.uint16], [2, 2, T.uint16], [4, 4, T.uint32]];
/** timestamp, start_time, sport, sub_sport, elapsed, timer, distance, calories, avg hr, max hr */
export const SESSION: FieldSpec[] = [
  [253, 4, T.uint32], [2, 4, T.uint32], [5, 1, T.enum], [6, 1, T.enum], [7, 4, T.uint32], [8, 4, T.uint32], [9, 4, T.uint32], [11, 2, T.uint16], [16, 1, T.uint8], [17, 1, T.uint8],
];
/** timestamp, heart rate, distance */
export const RECORD: FieldSpec[] = [[253, 4, T.uint32], [3, 1, T.uint8], [5, 4, T.uint32]];
/** record without timestamp, for compressed headers: heart rate, distance */
export const RECORD_NO_TS: FieldSpec[] = [[3, 1, T.uint8], [5, 4, T.uint32]];
/** timestamp, total_timer_time, num_sessions, local_timestamp */
export const ACTIVITY: FieldSpec[] = [[253, 4, T.uint32], [0, 4, T.uint32], [1, 2, T.uint16], [5, 4, T.uint32]];

export interface SessionValues {
  start: string;
  sport?: number | null;
  subSport?: number | null;
  elapsedS: number;
  timerS?: number | null;
  distanceM?: number | null;
  kcal?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
}

/** Values in SESSION order. */
export function sessionValues(s: SessionValues, startRaw?: number): Value[] {
  const start = startRaw ?? fitTime(s.start);
  return [
    start + Math.round(s.elapsedS),
    start,
    s.sport ?? null,
    s.subSport ?? null,
    Math.round(s.elapsedS * 1000),
    s.timerS === null ? null : Math.round((s.timerS ?? s.elapsedS) * 1000),
    s.distanceM === null || s.distanceM === undefined ? null : Math.round(s.distanceM * 100),
    s.kcal ?? null,
    s.avgHr ?? null,
    s.maxHr ?? null,
  ];
}

/** A one-session activity file. */
export function simpleActivity(s: SessionValues, opts: { headerSize?: 12 | 14; bigEndian?: boolean } = {}): Uint8Array {
  const w = new FitWriter();
  w.define(0, 0, FILE_ID, { bigEndian: opts.bigEndian }).data(0, [4, 1, 2697, fitTime(s.start)]);
  w.define(1, 18, SESSION, { bigEndian: opts.bigEndian }).data(1, sessionValues(s));
  return w.bytes({ headerSize: opts.headerSize });
}
