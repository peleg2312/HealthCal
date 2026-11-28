/**
 * The invite's QR encoder against reference symbols from an independent encoder (`__fixtures__/qr-reference.json`:
 * toqr 0.1.1, level M, byte mode, versions 1 to 6 with one, two and four blocks and multi-byte UTF-8). Encoders may
 * choose different masks, so each reference is rebuilt with the mask its own format information names and must
 * match module for module. The automatic choice is checked by reading its format bits and the penalty rule. The
 * symbols built here were also read back by an independent decoder (zxing-cpp through zxing-wasm) while this was
 * written: version, level M and text all as encoded.
 */
import { describe, expect, it } from 'vitest';

import reference from './__fixtures__/qr-reference.json';
import { byteCapacity, dataCodewords, encodeQr, formatBits, penalty, qrPath, readFormatMask, rsDivisor, rsRemainder, totalCodewords, utf8Bytes, versionFor } from './qr';

const grid = (rows: string[]) => rows.map((r) => [...r].map((c) => c === '#'));

describe('QR code for the invite link', () => {
  it.each(reference.symbols.map((s) => [s.text.slice(0, 32), s] as const))('matches the reference symbol for %s', (_, s) => {
    const want = grid(s.rows);
    expect(s.mask).not.toBeNull();
    const got = encodeQr(s.text, { mask: s.mask as number });
    expect(got?.size).toBe(want.length);
    expect(got?.modules).toEqual(want);
  });

  it('knows the capacities of versions 1 to 6 at level M (ISO 18004 table 7)', () => {
    expect([1, 2, 3, 4, 5, 6].map(totalCodewords)).toEqual([26, 44, 70, 100, 134, 172]);
    expect([1, 2, 3, 4, 5, 6].map(dataCodewords)).toEqual([16, 28, 44, 64, 86, 108]);
    expect([1, 2, 3, 4, 5, 6].map(byteCapacity)).toEqual([14, 26, 42, 62, 84, 106]);
    expect(versionFor(14)).toBe(1);
    expect(versionFor(15)).toBe(2);
    expect(versionFor(106)).toBe(6);
    expect(versionFor(107)).toBeNull();
    expect(encodeQr('q'.repeat(107))).toBeNull();
  });

  it('writes the format information of the standard (level M, mask 0 is 101010000010010)', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010');
    expect([1, 2, 3, 4, 5, 6, 7].map((m) => formatBits(m).toString(2).padStart(15, '0'))).toEqual(['101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000']);
  });

  it("computes Reed-Solomon codewords: the standard's 1-M example (ISO 18004 annex I)", () => {
    // "01234567" in numeric mode, version 1-M: 16 data codewords and their 10 error correction codewords.
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(rsRemainder(data, rsDivisor(10))).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  it('encodes text as UTF-8', () => {
    expect(utf8Bytes('a')).toEqual([0x61]);
    expect(utf8Bytes('ש')).toEqual([0xd7, 0xa9]);
    expect(utf8Bytes('🙂')).toEqual([0xf0, 0x9f, 0x99, 0x82]);
  });

  it('chooses the mask with the lowest penalty and names it in the format bits', () => {
    const text = 'https://healthcal.example/friends/add?invite=WAW9GCSW';
    const auto = encodeQr(text);
    expect(auto).not.toBeNull();
    expect(readFormatMask(auto!.modules)).toBe(auto!.mask);
    const scores = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => penalty(encodeQr(text, { mask: m })!.modules));
    expect(penalty(auto!.modules)).toBe(Math.min(...scores));
  });

  it('draws the dark modules as one path inside a quiet zone', () => {
    expect(qrPath([[true, true, false, true]], 2, 4)).toBe('M8 8h4v2h-4zM14 8h2v2h-2z');
    expect(qrPath([[false]])).toBe('');
  });
});
