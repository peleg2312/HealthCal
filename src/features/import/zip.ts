/**
 * Reading one entry of a very large ZIP without holding the archive, or the
 * entry, in memory. Built for the Health app's export.zip (50 to 300 MB, its
 * export.xml 0.5 to 3 GB once inflated), and fine for any ZIP.
 *
 * How (APPNOTE.TXT, PKWARE's ZIP specification, sections 4.3 and 4.4):
 *   1. The end of central directory record is found in the last 64 KB of the
 *      file (a fixed 22 bytes plus a comment of at most 65,535).
 *   2. A zip64 archive (one past 4 GB, or with more than 65,535 entries) puts a
 *      zip64 locator just before it, which points at the zip64 end record with
 *      the real offsets and sizes.
 *   3. The central directory lists every entry with its compressed size and
 *      where its local header starts; 0xFFFFFFFF in a size or an offset means
 *      "see the zip64 extra field" (header id 0x0001).
 *   4. The local header's own name and extra lengths say where the data starts.
 *      Its sizes are not used: an entry written with a data descriptor
 *      (general purpose flag bit 3, as iOS writes them) has zeros there and the
 *      real sizes only after the data and in the central directory, which is
 *      what this reads.
 *   5. Exactly that byte range is read in chunks and passed through fflate's
 *      streaming Inflate (method 8) or as it is (method 0), and each piece of
 *      output goes to the caller, who keeps nothing but what it needs.
 *
 * So the other entries (clinical records, routes, electrocardiograms) are never
 * read or inflated: only their names are listed. Everything here takes a
 * `ByteSource` (random access by offset), so it is tested with ZIPs built in
 * memory and runs on File.slice in a browser and a FileHandle on a phone.
 */
import { Inflate } from 'fflate';

/** Random access to a file's bytes. */
export interface ByteSource {
  readonly size: number;
  /** Up to `length` bytes from `offset` (fewer only at the end of the file). */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** A ByteSource over bytes already in memory (tests, small files). */
export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length)),
  };
}

export class ZipError extends Error {}
/** The archive ends before its central directory does (or has none): a download or copy cut short. Nothing reads such a file whole. */
export class ZipCutShort extends ZipError {}

export interface ZipEntry {
  name: string;
  /** 0 stored, 8 deflate. */
  method: number;
  compressedSize: number;
  size: number;
  /** Where the entry's local header starts. */
  localHeaderOffset: number;
  /** General purpose flags (bit 0 encrypted, bit 3 data descriptor, bit 11 UTF-8 name). */
  flags: number;
}

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_U32 = 0xffffffff;
/** A central directory bigger than this is not a real export (it would be a million entries). */
const MAX_CENTRAL = 64 * 1024 * 1024;

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
/** 64-bit little-endian as a JS number (exact up to 2^53, far beyond any file). */
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 0x1_0000_0000;

/** True when the first bytes are a ZIP's local header (or an empty archive's end record). */
export const looksLikeZip = (head: Uint8Array) => head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05) && (head[3] === 0x04 || head[3] === 0x06);

function decodeName(b: Uint8Array, utf8: boolean): string {
  let ascii = true;
  for (let i = 0; i < b.length; i++) if (b[i] > 0x7f) ascii = false;
  if (ascii) return String.fromCharCode(...b);
  if (utf8 || isUtf8(b)) return utf8Decode(b);
  // CP437 names are rare in practice; the bytes as Latin-1 keep the ASCII parts (folder and extension) readable.
  return String.fromCharCode(...b);
}

function isUtf8(b: Uint8Array): boolean {
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    const n = c < 0x80 ? 0 : c >= 0xc2 && c <= 0xdf ? 1 : c >= 0xe0 && c <= 0xef ? 2 : c >= 0xf0 && c <= 0xf4 ? 3 : -1;
    if (n < 0 || i + n >= b.length) return false;
    for (let k = 1; k <= n; k++) if ((b[i + k] & 0xc0) !== 0x80) return false;
    i += n + 1;
  }
  return true;
}

/** UTF-8 bytes to a string, without TextDecoder (not on every React Native engine). Invalid bytes become U+FFFD. */
export function utf8Decode(b: Uint8Array, start = 0, end = b.length): string {
  let out = '';
  let i = start;
  const parts: string[] = [];
  while (i < end) {
    const c = b[i];
    let cp: number;
    if (c < 0x80) {
      cp = c;
      i += 1;
    } else if (c >= 0xc2 && c <= 0xdf && i + 1 < end) {
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f);
      i += 2;
    } else if (c >= 0xe0 && c <= 0xef && i + 2 < end) {
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f);
      i += 3;
    } else if (c >= 0xf0 && c <= 0xf4 && i + 3 < end) {
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f);
      i += 4;
    } else {
      cp = 0xfffd;
      i += 1;
    }
    out += String.fromCodePoint(cp);
    if (out.length > 4096) {
      parts.push(out);
      out = '';
    }
  }
  parts.push(out);
  return parts.join('');
}

/** Find the end records and return where the central directory is and how big. */
async function centralDirectory(src: ByteSource): Promise<{ offset: number; size: number; count: number; shift: number }> {
  if (src.size < 22) throw new ZipError('Too small to be a ZIP.');
  // Most archives have no comment: the end record is the last 22 bytes (with a zip64 locator just before it).
  // Only when it is not there is the last 64 KB read, the longest a comment can make it.
  let tailLen = Math.min(src.size, 22 + 20);
  let tailStart = src.size - tailLen;
  let tail = await src.read(tailStart, tailLen);
  let at = tail.length >= 22 && u32(tail, tail.length - 22) === EOCD && u16(tail, tail.length - 2) === 0 ? tail.length - 22 : -1;
  if (at < 0) {
    tailLen = Math.min(src.size, 22 + 65535 + 20);
    tailStart = src.size - tailLen;
    tail = await src.read(tailStart, tailLen);
    for (let i = tail.length - 22; i >= 0; i--) {
      if (u32(tail, i) === EOCD && i + 22 + u16(tail, i + 20) <= tail.length) {
        at = i;
        break;
      }
    }
  }
  if (at < 0) throw new ZipCutShort('No end of central directory.');
  let count = u16(tail, at + 10);
  let size = u32(tail, at + 12);
  let offset = u32(tail, at + 16);
  // zip64: the locator sits right before the end record.
  if (at >= 20 && u32(tail, at - 20) === ZIP64_LOCATOR) {
    const recOffset = u64(tail, at - 20 + 8);
    const rec = await src.read(recOffset, 56);
    if (rec.length < 56 || u32(rec, 0) !== ZIP64_EOCD) throw new ZipError('Damaged zip64 end record.');
    count = u64(rec, 32);
    size = u64(rec, 40);
    offset = u64(rec, 48);
  } else if (count === 0xffff || size === MAX_U32 || offset === MAX_U32) {
    throw new ZipError('A zip64 archive without its locator.');
  }
  // A prefix before the archive (a self-extracting stub) shifts every offset: measured from where the end record really is.
  const zip64 = at >= 20 && u32(tail, at - 20) === ZIP64_LOCATOR;
  const shift = !zip64 && size > 0 && tailStart + at > offset + size ? tailStart + at - (offset + size) : 0;
  if (size > MAX_CENTRAL) throw new ZipError('Central directory too large.');
  return { offset: offset + shift, size, count, shift };
}

/** Every entry in the archive, from its central directory. Reads only the end of the file. */
export async function listZip(src: ByteSource): Promise<ZipEntry[]> {
  const cd = await centralDirectory(src);
  const b = await src.read(cd.offset, cd.size);
  if (b.length < cd.size) throw new ZipCutShort('Central directory cut short.');
  const out: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= b.length && u32(b, p) === CENTRAL) {
    const flags = u16(b, p + 8);
    const method = u16(b, p + 10);
    let compressedSize = u32(b, p + 20);
    let size = u32(b, p + 24);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    let localHeaderOffset = u32(b, p + 42);
    const name = decodeName(b.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    // The zip64 extra field holds, in this order, only the values that were 0xFFFFFFFF.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(b, e);
      const len = u16(b, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === MAX_U32 && q + 8 <= e + 4 + len) {
          size = u64(b, q);
          q += 8;
        }
        if (compressedSize === MAX_U32 && q + 8 <= e + 4 + len) {
          compressedSize = u64(b, q);
          q += 8;
        }
        if (localHeaderOffset === MAX_U32 && q + 8 <= e + 4 + len) localHeaderOffset = u64(b, q);
      }
      e += 4 + len;
    }
    out.push({ name, method, compressedSize, size, localHeaderOffset: localHeaderOffset + cd.shift, flags });
    p = extraEnd + commentLen;
  }
  if (out.length === 0 && cd.count > 0) throw new ZipError('Central directory unreadable.');
  return out;
}

/** Where an entry's compressed data starts: after its local header, whose own name and extra lengths are used. */
export async function dataOffset(src: ByteSource, entry: ZipEntry): Promise<number> {
  const h = await src.read(entry.localHeaderOffset, 30);
  if (h.length < 30 || u32(h, 0) !== LOCAL) throw new ZipError('Local header not found.');
  return entry.localHeaderOffset + 30 + u16(h, 26) + u16(h, 28);
}

export interface StreamOptions {
  /** Compressed bytes read per step. Default 1 MB. */
  chunkSize?: number;
  /** Share of the entry read so far (0 to 1), after every step. */
  onProgress?(share: number): void;
  /** Checked before every step: true stops the read with a StreamCancelled. */
  cancelled?(): boolean;
  /** Awaited between steps so the screen can draw (a frame on the phone, a task in the browser). */
  yieldEvery?(): Promise<void>;
  /** Stop early (for a peek): return true from here and no more is read. */
  enough?(): boolean;
}

export class StreamCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'StreamCancelled';
  }
}

/**
 * Inflate one entry, handing each piece of output to `onData` as it is made.
 * Only the entry's own compressed bytes are read, one chunk at a time; nothing
 * is kept here. Encrypted entries and methods other than stored and deflate are refused.
 */
export async function streamEntry(src: ByteSource, entry: ZipEntry, onData: (chunk: Uint8Array) => void, options: StreamOptions = {}): Promise<void> {
  if (entry.flags & 1) throw new ZipError('Encrypted entry.');
  if (entry.method !== 0 && entry.method !== 8) throw new ZipError(`Compression method ${entry.method} is not supported.`);
  const start = await dataOffset(src, entry);
  await streamRange(src, start, entry.compressedSize, entry.method === 8, onData, options);
}

/** Read `length` bytes from `start`, inflating them when `deflated`, chunk by chunk. A bare (uncompressed) file is read with deflated false. */
export async function streamRange(src: ByteSource, start: number, length: number, deflated: boolean, onData: (chunk: Uint8Array) => void, options: StreamOptions = {}): Promise<void> {
  const step = options.chunkSize ?? 1024 * 1024;
  let error: unknown = null;
  const inflate = deflated
    ? new Inflate((chunk) => {
        try {
          onData(chunk);
        } catch (e) {
          error = e;
        }
      })
    : null;
  let done = 0;
  while (done < length) {
    if (options.cancelled?.()) throw new StreamCancelled();
    const want = Math.min(step, length - done);
    const chunk = await src.read(start + done, want);
    if (chunk.length === 0) throw new ZipError('The file ended before the entry did.');
    done += chunk.length;
    if (inflate) {
      try {
        inflate.push(chunk, done >= length);
      } catch {
        throw new ZipError('The compressed data is damaged.');
      }
    } else onData(chunk);
    if (error) throw error;
    options.onProgress?.(length ? done / length : 1);
    if (options.enough?.()) return;
    if (options.yieldEvery) await options.yieldEvery();
  }
  if (length === 0 && inflate) inflate.push(new Uint8Array(0), true);
}
