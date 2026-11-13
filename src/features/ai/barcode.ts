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
  if (!hasValidCheckDigit(code)) return { ok: false, message: 'The last digit does not match the rest. Check the number for a typo.' };
  return { ok: true, code };
}
