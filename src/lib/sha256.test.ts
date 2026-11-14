import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sha256Hex, utf8Bytes } from './sha256';

describe('sha256Hex', () => {
  it('matches the published test vectors (FIPS 180-2)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu')).toBe(
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    );
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('hashes the UTF-8 bytes of the text, as the database and Node do', () => {
    for (const text of ['🏃 Running', 'Zürich', 'ß∑漢字', '\u0000', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(119)]) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });

  it('encodes lone surrogates as U+FFFD, like TextEncoder', () => {
    expect([...utf8Bytes('\ud800')]).toEqual([0xef, 0xbf, 0xbd]);
    expect([...utf8Bytes('é')]).toEqual([0xc3, 0xa9]);
  });
});
