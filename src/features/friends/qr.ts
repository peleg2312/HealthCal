/**
 * A small QR code encoder for the invite link (ISO/IEC 18004): byte mode, error correction level M,
 * versions 1 to 6 (up to 106 bytes, room for any invite link). It builds the module matrix only; the
 * screen draws it (`QrCode.tsx`). Pure: no React, no storage, no clock.
 *
 * Steps: the text as UTF-8 bytes, the smallest version that holds them, the bit stream (mode, count,
 * data, terminator, pad bytes), Reed-Solomon error correction per block over GF(256), the codewords
 * interleaved and placed in the zigzag, then each of the eight masks tried and the one with the lowest
 * penalty kept (or the mask asked for), with its format information written twice.
 */

/** Level M's error correction per version: [EC codewords per block, number of blocks]. */
const EC_M: Record<number, [number, number]> = { 1: [10, 1], 2: [16, 1], 3: [26, 1], 4: [18, 2], 5: [24, 2], 6: [16, 4] };
/** Alignment pattern centres per version (version 1 has none). */
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
export const QR_MAX_VERSION = 6;

export interface QrCode {
  version: number;
  /** Modules per side (17 + 4 x version). */
  size: number;
  /** The mask pattern used, 0 to 7. */
  mask: number;
  /** modules[y][x]: true is a dark module. */
  modules: boolean[][];
}

/** UTF-8 bytes of a string (no TextEncoder needed). */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** Data modules of a version, less function patterns (and format information): its raw codeword bits. */
function rawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    result -= (25 * n - 10) * n - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

/** Total codewords of a version. */
export function totalCodewords(ver: number): number {
  return Math.floor(rawDataModules(ver) / 8);
}

/** Data codewords of a version at level M. */
export function dataCodewords(ver: number): number {
  const [ec, blocks] = EC_M[ver];
  return totalCodewords(ver) - ec * blocks;
}

/** Bytes a version holds in byte mode at level M (4 bits of mode, 8 of count). */
export function byteCapacity(ver: number): number {
  return Math.floor((dataCodewords(ver) * 8 - 12) / 8);
}

// ------------------------------------------------------------------ GF(256) and Reed-Solomon

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** The generator polynomial of the given degree, highest term left out (coefficients from x^(d-1) down). */
export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** The error correction codewords of one block. */
export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

// ------------------------------------------------------------------ codewords

/** The data codewords for `bytes` in `ver`: mode, count, data, terminator, bit padding and pad bytes. */
export function dataStream(bytes: readonly number[], ver: number): number[] {
  const bits: number[] = [];
  const put = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCodewords(ver); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Data and error correction codewords, split into blocks and interleaved as the symbol holds them. */
export function interleaved(data: readonly number[], ver: number): number[] {
  const [ecLen, numBlocks] = EC_M[ver];
  const raw = totalCodewords(ver);
  const numShort = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(ecLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortLen - ecLen + (i < numShort ? 0 : 1);
    const dat = data.slice(k, k + dataLen);
    k += dataLen;
    const ecc = rsRemainder(dat, divisor);
    // A short block takes a placeholder where a long block has one more data codeword.
    if (i < numShort) dat.push(-1);
    blocks.push([...dat, ...ecc]);
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - ecLen || j >= numShort) out.push(b[i]);
    });
  }
  return out;
}

// ------------------------------------------------------------------ the matrix

/** The 15 format bits for level M (00) and a mask. */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Matrix {
  readonly size: number;
  readonly modules: boolean[][];
  readonly fn: boolean[][];
  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  set(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark;
    this.fn[y][x] = true;
  }
  functionPatterns() {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [n - 4, 3],
      [3, n - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < n && y >= 0 && y < n) this.set(x, y, dist !== 2 && dist !== 4);
        }
      }
    }
    const pos = ALIGN[this.version];
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        // Not over the three finder patterns.
        if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    // Reserve the format areas (written for real once the mask is known).
    this.format(0);
  }
  format(mask: number) {
    const bits = formatBits(mask);
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    const n = this.size;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, n - 15 + i, bit(i));
    // The dark module, always dark.
    this.set(8, n - 8, true);
  }
  codewords(data: readonly number[]) {
    const n = this.size;
    let i = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? n - 1 - vert : vert;
          if (!this.fn[y][x] && i < data.length * 8) {
            this.modules[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }
  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (!this.fn[y][x] && maskBit(mask, x, y)) this.modules[y][x] = !this.modules[y][x];
  }
}

/**
 * The standard penalty of a finished symbol (lower is better): runs of five or more in a row or column,
 * 2 x 2 blocks of one colour, finder-like 1:1:3:1:1 runs with four light modules beside them, and how far
 * the share of dark modules is from half.
 */
export function penalty(modules: readonly (readonly boolean[])[]): number {
  const n = modules.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    const a = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= n; i++) {
      if (!a.every((v, k) => get(i + k) === v)) continue;
      const lightBefore = i >= 4 && [1, 2, 3, 4].every((k) => !get(i - k));
      const lightAfter = i + 11 <= n && [7, 8, 9, 10].every((k) => !get(i + k));
      if (lightBefore || lightAfter) score += 40;
    }
  };
  for (let y = 0; y < n; y++) line((x) => modules[y][x]);
  for (let x = 0; x < n; x++) line((y) => modules[y][x]);
  for (let y = 0; y + 1 < n; y++) {
    for (let x = 0; x + 1 < n; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }
  const dark = modules.reduce((s, row) => s + row.filter(Boolean).length, 0);
  score += 10 * Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5);
  return score;
}

/** The smallest version (1 to 6) that holds `length` bytes at level M, or null when none does. */
export function versionFor(length: number): number | null {
  for (let v = 1; v <= QR_MAX_VERSION; v++) if (byteCapacity(v) >= length) return v;
  return null;
}

/**
 * The QR code of `text` (byte mode, level M), or null when it is longer than version 6 holds (106 bytes).
 * `mask` fixes the mask pattern; left out, the one with the lowest penalty is kept (the first on a tie).
 */
export function encodeQr(text: string, options: { mask?: number } = {}): QrCode | null {
  const bytes = utf8Bytes(text);
  const version = versionFor(bytes.length);
  if (!version) return null;
  const codewords = interleaved(dataStream(bytes, version), version);
  const build = (mask: number) => {
    const m = new Matrix(version);
    m.functionPatterns();
    m.codewords(codewords);
    m.applyMask(mask);
    m.format(mask);
    return m;
  };
  let best: Matrix | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  const masks = typeof options.mask === 'number' ? [options.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const mask of masks) {
    const m = build(mask);
    const score = penalty(m.modules);
    if (score < bestScore) {
      best = m;
      bestMask = mask;
      bestScore = score;
    }
  }
  const m = best as Matrix;
  return { version, size: m.size, mask: bestMask, modules: m.modules };
}

/**
 * The dark modules as one SVG path, a quiet zone of `quiet` modules around them and each module `scale`
 * units wide: runs of dark modules in a row are one rectangle each.
 */
export function qrPath(modules: readonly (readonly boolean[])[], scale = 1, quiet = 4): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end]) end++;
      const px = (x + quiet) * scale;
      const py = (y + quiet) * scale;
      parts.push(`M${px} ${py}h${(end - x) * scale}v${scale}h${-(end - x) * scale}z`);
      x = end;
    }
  });
  return parts.join('');
}

/** The mask a symbol's format information names (read from its first copy), or null when it is not level M. */
export function readFormatMask(modules: readonly (readonly boolean[])[]): number | null {
  let bits = 0;
  const bit = (x: number, y: number, i: number) => {
    if (modules[y][x]) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i++) bit(8, i, i);
  bit(8, 7, 6);
  bit(8, 8, 7);
  bit(7, 8, 8);
  for (let i = 9; i < 15; i++) bit(14 - i, 8, i);
  for (let mask = 0; mask < 8; mask++) if (formatBits(mask) === bits) return mask;
  return null;
}
