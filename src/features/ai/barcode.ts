/** Helpers for typed and scanned product barcodes (EAN-8, UPC-A, EAN-13, GTIN-14). */

export const BARCODE_LENGTHS = [8, 12, 13, 14];

export function cleanBarcode(input: string): string {
  return input.replace(/\D/g, '');
}

/** GS1 check digit: weights 3 and 1 alternating from the right, excluding the check digit. */
export function hasValidCheckDigit(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 2) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

export type BarcodeCheck = { ok: true; code: string } | { ok: false; message: string };

/** Validate a typed barcode with a message a person can act on. */
export function checkBarcode(input: string): BarcodeCheck {
  const code = cleanBarcode(input);
  if (code.length === 0) return { ok: false, message: 'Enter the number printed under the barcode.' };
  if (!BARCODE_LENGTHS.includes(code.length)) {
    return { ok: false, message: `Barcodes have 8, 12, 13 or 14 digits. This one has ${code.length}.` };
  }
  if (!hasValidCheckDigit(code)) {
    // A short UPC-E code (small US packs) checks against its expanded form.
    const upcA = code.length === 8 ? expandUpcE(code) : null;
    if (upcA) return { ok: true, code: upcA };
    return { ok: false, message: 'The last digit does not match the rest. Check the number for a typo.' };
  }
  return { ok: true, code };
}

/**
 * Expand an 8-digit UPC-E code (number system 0 or 1, six data digits, check
 * digit) to the 12-digit UPC-A it stands for. Open Food Facts stores products
 * under the expanded code. Returns null when the input is not a valid UPC-E.
 */
export function expandUpcE(input: string): string | null {
  const code = cleanBarcode(input);
  if (code.length !== 8 || (code[0] !== '0' && code[0] !== '1')) return null;
  const ns = code[0];
  const [d1, d2, d3, d4, d5, d6] = code.slice(1, 7).split('');
  const check = code[7];
  let body: string;
  if (d6 === '0' || d6 === '1' || d6 === '2') body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === '3') body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === '4') body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const upcA = `${ns}${body}${check}`;
  return hasValidCheckDigit(upcA) ? upcA : null;
}

/**
 * The code to look up for a scan. A UPC-E symbol (reported as such, or an
 * 8-digit code that fails the EAN-8 check but expands to a valid UPC-A) is
 * expanded; everything else is only cleaned.
 */
export function lookupCode(data: string, type?: string): string {
  const code = cleanBarcode(data);
  if (code.length !== 8) return code;
  const isUpcE = type ? /upc_?e/i.test(type) : false;
  if (isUpcE || !hasValidCheckDigit(code)) return expandUpcE(code) ?? code;
  return code;
}

/**
 * Comparable form of a barcode: digits only, leading zeros removed, so a
 * UPC-A (12 digits), its EAN-13 form (a leading 0, which Android keeps and
 * iOS drops) and a GTIN-14 with leading zeros all match.
 */
export function barcodeKey(input: string | undefined): string {
  return cleanBarcode(input ?? '').replace(/^0+/, '');
}

export function sameBarcode(a: string | undefined, b: string | undefined): boolean {
  const ka = barcodeKey(a);
  if (ka.length < 6) return false;
  if (ka === barcodeKey(b)) return true;
  // A stored or scanned UPC-E matches its expanded UPC-A.
  const ea = expandUpcE(cleanBarcode(a ?? ''));
  const eb = expandUpcE(cleanBarcode(b ?? ''));
  return (!!ea && barcodeKey(ea) === barcodeKey(b)) || (!!eb && barcodeKey(eb) === ka);
}

interface HasBarcode {
  barcode?: string;
  deleted?: boolean;
}

/**
 * Find a food the person already has for a barcode, without the network:
 * their own custom foods first, then recently logged foods, then the food
 * definitions kept on past diary entries (newest first).
 */
export function findLocalByBarcode<F extends HasBarcode>(
  code: string,
  sources: { custom: F[]; recent: F[]; entries: { food?: F; deleted?: boolean; loggedAt: string }[] },
): { food: F; from: 'custom' | 'recent' | 'diary' } | null {
  if (barcodeKey(code).length < 6) return null;
  const custom = sources.custom.find((f) => !f.deleted && sameBarcode(code, f.barcode));
  if (custom) return { food: custom, from: 'custom' };
  const recent = sources.recent.find((f) => sameBarcode(code, f.barcode));
  if (recent) return { food: recent, from: 'recent' };
  const entry = sources.entries
    .filter((e) => !e.deleted && e.food && sameBarcode(code, e.food.barcode))
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : a.loggedAt > b.loggedAt ? -1 : 0))[0];
  return entry?.food ? { food: entry.food, from: 'diary' } : null;
}
