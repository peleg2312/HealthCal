/**
 * Builds ZIP archives in memory for the tests, in the forms the reader must
 * take: plain, with data descriptors (general purpose bit 3: zero sizes and
 * CRC in the local header, the real ones in a descriptor after the data, as
 * iOS writes them), and zip64 (sizes and offsets of 0xFFFFFFFF in the central
 * directory with the real values in the zip64 extra field, a zip64 end record
 * and its locator, as an archive over 4 GB has; here forced on small data so a
 * test can hold it). Test-only: nothing in the app imports it.
 */
import { deflateSync } from 'fflate';

export interface BuildEntry {
  name: string;
  data: Uint8Array;
  /** 8 deflate (default) or 0 stored. */
  method?: 0 | 8;
}

export interface BuildOptions {
  dataDescriptor?: boolean;
  zip64?: boolean;
  /** Bytes put before the archive (a self-extracting stub). */
  prefix?: number;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class Writer {
  parts: Uint8Array[] = [];
  length = 0;
  bytes(b: Uint8Array) {
    this.parts.push(b);
    this.length += b.length;
  }
  u16(v: number) {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }
  u32(v: number) {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  }
  u64(v: number) {
    this.u32(v % 0x1_0000_0000);
    this.u32(Math.floor(v / 0x1_0000_0000));
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let p = 0;
    for (const part of this.parts) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }
}

const enc = (s: string) => Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));

export function buildZip(entries: BuildEntry[], options: BuildOptions = {}): Uint8Array {
  const w = new Writer();
  if (options.prefix) w.bytes(new Uint8Array(options.prefix).fill(0x20));
  const base = options.prefix ?? 0;
  const central: { name: Uint8Array; crc: number; csize: number; size: number; offset: number; method: number; flags: number }[] = [];
  for (const e of entries) {
    const method = e.method ?? 8;
    const comp = method === 8 ? deflateSync(e.data) : e.data;
    const crc = crc32(e.data);
    const name = enc(e.name);
    const flags = (options.dataDescriptor ? 0x8 : 0) | 0x800;
    const offset = w.length - base;
    w.u32(0x04034b50);
    w.u16(options.zip64 ? 45 : 20);
    w.u16(flags);
    w.u16(method);
    w.u16(0);
    w.u16(0x21);
    w.u32(options.dataDescriptor ? 0 : crc);
    if (options.zip64) {
      w.u32(0xffffffff);
      w.u32(0xffffffff);
    } else {
      w.u32(options.dataDescriptor ? 0 : comp.length);
      w.u32(options.dataDescriptor ? 0 : e.data.length);
    }
    w.u16(name.length);
    w.u16(options.zip64 ? 20 : 0);
    w.bytes(name);
    if (options.zip64) {
      w.u16(0x0001);
      w.u16(16);
      w.u64(options.dataDescriptor ? 0 : e.data.length);
      w.u64(options.dataDescriptor ? 0 : comp.length);
    }
    w.bytes(comp);
    if (options.dataDescriptor) {
      w.u32(0x08074b50);
      w.u32(crc);
      if (options.zip64) {
        w.u64(comp.length);
        w.u64(e.data.length);
      } else {
        w.u32(comp.length);
        w.u32(e.data.length);
      }
    }
    central.push({ name, crc, csize: comp.length, size: e.data.length, offset, method, flags });
  }
  const cdStart = w.length - base;
  for (const c of central) {
    w.u32(0x02014b50);
    w.u16(options.zip64 ? 45 : 20);
    w.u16(options.zip64 ? 45 : 20);
    w.u16(c.flags);
    w.u16(c.method);
    w.u16(0);
    w.u16(0x21);
    w.u32(c.crc);
    w.u32(options.zip64 ? 0xffffffff : c.csize);
    w.u32(options.zip64 ? 0xffffffff : c.size);
    w.u16(c.name.length);
    w.u16(options.zip64 ? 28 : 0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(options.zip64 ? 0xffffffff : c.offset);
    w.bytes(c.name);
    if (options.zip64) {
      w.u16(0x0001);
      w.u16(24);
      w.u64(c.size);
      w.u64(c.csize);
      w.u64(c.offset);
    }
  }
  const cdSize = w.length - base - cdStart;
  if (options.zip64) {
    const recAt = w.length - base;
    w.u32(0x06064b50);
    w.u64(44);
    w.u16(45);
    w.u16(45);
    w.u32(0);
    w.u32(0);
    w.u64(central.length);
    w.u64(central.length);
    w.u64(cdSize);
    w.u64(cdStart);
    w.u32(0x07064b50);
    w.u32(0);
    w.u64(recAt);
    w.u32(1);
  }
  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(options.zip64 ? 0xffff : central.length);
  w.u16(options.zip64 ? 0xffff : central.length);
  w.u32(options.zip64 ? 0xffffffff : cdSize);
  w.u32(options.zip64 ? 0xffffffff : cdStart);
  w.u16(0);
  return w.done();
}

export const utf8 = enc;
