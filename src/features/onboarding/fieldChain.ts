/**
 * The order of the fields on one setup step, for the keyboard's Next key and for Continue.
 *
 * With the keyboard up, a phone shows little more than the field in hand. A person who has typed
 * their height and presses Continue means "next", not "check everything": the step goes to the
 * first field that is still empty instead of answering with errors under fields they have not
 * reached yet. Pure, unit-tested; the hook that holds the inputs is `useFieldChain` in ./components.
 */

/**
 * The field to go to from `current`: the first empty one after it, else the first empty one before
 * it. Null when every other field is filled (then Continue checks the step as usual, which also
 * covers the field in hand being the empty one).
 */
export function nextEmptyField(current: number, empty: readonly boolean[]): number | null {
  if (current < 0 || current >= empty.length) return null;
  for (let i = current + 1; i < empty.length; i++) if (empty[i]) return i;
  for (let i = 0; i < current; i++) if (empty[i]) return i;
  return null;
}

/**
 * A field that lost the focus this recently still counts as the one in hand: in a browser the tap
 * on Continue takes the focus away from the field before the button hears about it.
 */
export const FOCUS_GRACE_MS = 700;

/** Whether a field is in hand: it has the focus, or lost it within the grace time. */
export function inHand(focus: { index: number; on: boolean; at: number }, now: number): boolean {
  return focus.index >= 0 && (focus.on || now - focus.at <= FOCUS_GRACE_MS);
}
