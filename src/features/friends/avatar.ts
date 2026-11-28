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
