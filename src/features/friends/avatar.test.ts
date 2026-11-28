import { describe, expect, it } from 'vitest';

import { AVATAR_TINTS, avatarTintKey, stableHash } from './avatar';

describe('a friend’s avatar tint', () => {
  it('is the same for the same id, every time', () => {
    expect(avatarTintKey('7f1c-aa')).toBe(avatarTintKey('7f1c-aa'));
    expect(stableHash('')).toBe(0x811c9dc5);
    // FNV-1a's published value for "a".
    expect(stableHash('a')).toBe(0xe40c292c);
  });

  it('is one of the six theme tints, and none without an id', () => {
    expect(AVATAR_TINTS).toContain(avatarTintKey('someone'));
    expect(avatarTintKey('')).toBeNull();
    expect(avatarTintKey(undefined)).toBeNull();
  });

  it('spreads people over all six tints', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const k = avatarTintKey(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) as string;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const n of counts.values()) expect(n).toBeGreaterThan(60);
  });
});
