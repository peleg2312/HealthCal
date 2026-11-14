/**
 * Bytes to text without TextDecoder (not available everywhere React Native runs).
 * UTF-8 (with or without BOM) and UTF-16 with BOM; anything that is not valid
 * UTF-8 is read as Windows-1252, which is what a spreadsheet re-save usually writes.
 */
import { strFromU8 } from 'fflate';

function isValidUtf8(b: Uint8Array): boolean {
  let i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (c < 0x80) {
      i += 1;
      continue;
    }
    const len = c >= 0xc2 && c <= 0xdf ? 2 : c >= 0xe0 && c <= 0xef ? 3 : c >= 0xf0 && c <= 0xf4 ? 4 : 0;
    if (len === 0 || i + len > n) return false;
    for (let k = 1; k < len; k++) if ((b[i + k] & 0xc0) !== 0x80) return false;
    i += len;
  }
  return true;
}

const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function utf16(b: Uint8Array, little: boolean): string {
  let out = '';
  for (let i = 2; i + 1 < b.length; i += 2) out += String.fromCharCode(little ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  return out;
}

export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return utf16(bytes, true);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return utf16(bytes, false);
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const body = start ? bytes.subarray(start) : bytes;
  if (isValidUtf8(body)) return strFromU8(body);
  let out = '';
  for (let i = 0; i < body.length; i++) out += String.fromCharCode(CP1252[body[i]] ?? body[i]);
  return out;
}

/** True when the bytes look like text rather than binary (no NUL bytes in the first 4 KB, UTF-16 aside). */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) return true;
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return false;
  return true;
}

/**
 * Unicode normalisation where the JavaScript engine has it (Hermes builds
 * without full Intl may not); the text is returned unchanged otherwise.
 */
export function normalizeText(s: string, form: 'NFC' | 'NFKD'): string {
  try {
    return typeof s.normalize === 'function' ? s.normalize(form) : s;
  } catch {
    return s;
  }
}
