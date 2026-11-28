/**
 * Which soft tint a person's initials tile wears: one of the theme's six (`avatar1`..`avatar6`), chosen by a
 * stable hash of their user id, so the same friend has the same colour on every screen, every visit and every
 * device, and people side by side are told apart. The colour means nothing else: never a rank, never a state.
 * Pure.
 */
export const AVATAR_TINTS = ['avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6'] as const;
export type AvatarTint = (typeof AVATAR_TINTS)[number];

/** FNV-1a (32 bit) of a string's UTF-16 code units: stable everywhere JavaScript runs. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The tint of a person by their id; null without an id (the person's own tile stays the neutral cup). */
export function avatarTintKey(id: string | null | undefined): AvatarTint | null {
  if (!id) return null;
  return AVATAR_TINTS[stableHash(id) % AVATAR_TINTS.length];
}

/**
 * The tints of the person's friends, so friends shown together differ: the friends in a stable order (when the
 * friendship began, then id; one without a date after those with one), and the first six each take their own
 * hash tint, or, when an earlier friend has it, the next tint not taken yet (counting on from the hash). From the
 * seventh on, and for anyone not in the list (a request, a circle member who is not a friend), the hash alone.
 * A new friend joins at the end of the order, so the earlier ones keep their tints. Pure.
 */
export function friendTints(friends: readonly { userId: string; since?: string | null }[]): Map<string, AvatarTint> {
  const time = (s: string | null | undefined) => {
    const t = s ? Date.parse(s) : NaN;
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const ordered = [...new Map(friends.filter((f) => f.userId).map((f) => [f.userId, f])).values()].sort(
    (a, b) => time(a.since) - time(b.since) || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  const out = new Map<string, AvatarTint>();
  const taken = new Set<number>();
  for (const f of ordered) {
    const start = stableHash(f.userId) % AVATAR_TINTS.length;
    let k = start;
    if (taken.size < AVATAR_TINTS.length) {
      while (taken.has(k)) k = (k + 1) % AVATAR_TINTS.length;
      taken.add(k);
    }
    out.set(f.userId, AVATAR_TINTS[k]);
  }
  return out;
}

/** The tint of one person: their place among the friends when they are one (`friendTints`), else the hash alone. */
export function tintFor(id: string | null | undefined, tints: ReadonlyMap<string, AvatarTint>): AvatarTint | null {
  if (!id) return null;
  return tints.get(id) ?? avatarTintKey(id);
}
