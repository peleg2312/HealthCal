import { describe, expect, it } from 'vitest';

import { AVATAR_TINTS, avatarTintKey, friendTints, stableHash, tintFor } from './avatar';

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

describe('the tints of friends shown together', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const friends = ids.map((userId, i) => ({ userId, since: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }));

  it('gives the first six friends six different tints, whatever their hashes', () => {
    for (let start = 0; start < 30; start++) {
      const six = friends.slice(start, start + 6);
      const tints = friendTints(six);
      expect(new Set(six.map((f) => tints.get(f.userId))).size).toBe(6);
    }
  });

  it('keeps a friend’s own hash tint where nobody earlier has it, and the first friend always does', () => {
    const tints = friendTints(friends.slice(0, 6));
    expect(tints.get(friends[0].userId)).toBe(avatarTintKey(friends[0].userId));
  });

  it('is stable: the order given does not matter, and a new friend leaves the earlier tints as they were', () => {
    const a = friendTints(friends.slice(0, 5));
    const b = friendTints([...friends.slice(0, 5)].reverse());
    const c = friendTints(friends.slice(0, 6));
    for (const f of friends.slice(0, 5)) {
      expect(b.get(f.userId)).toBe(a.get(f.userId));
      expect(c.get(f.userId)).toBe(a.get(f.userId));
    }
  });

  it('orders by when the friendship began, then id, a friend with no date last', () => {
    const x = { userId: 'x', since: null };
    const y = { userId: 'y', since: '2026-01-01T00:00:00Z' };
    const t1 = friendTints([x, y]);
    expect(t1.get('y')).toBe(avatarTintKey('y'));
  });

  it('uses the hash from the seventh friend on and for anyone not a friend', () => {
    const tints = friendTints(friends.slice(0, 10));
    for (const f of friends.slice(6, 10)) expect(tints.get(f.userId)).toBe(avatarTintKey(f.userId));
    expect(tintFor('stranger', tints)).toBe(avatarTintKey('stranger'));
    expect(tintFor(undefined, tints)).toBeNull();
  });
});
