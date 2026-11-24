/**
 * How a line of words sits on the account screens and the legal pages: pure helpers, tested in
 * lines.test.ts. The words themselves are ./words.ts and the legal content; these only say where a
 * line may break and where a block may start.
 */

const NBSP = ' ';

/**
 * The same sentence with its last `count` words joined by no-break spaces, so that a line which
 * wraps never leaves one word alone on its last line, at any width. For display only: tests and
 * screen-reader labels keep the plain sentence (browser tests normalise the no-break space).
 */
export function lastWordsTogether(text: string, count = 2): string {
  const words = text.split(' ');
  if (count < 2 || words.length <= count) return text;
  return `${words.slice(0, -count).join(' ')} ${words.slice(-count).join(NBSP)}`;
}

/**
 * The same sentence with every `name` in it kept on one line (a button's name, such as
 * "Continue with Google", is found on screen by its whole name).
 */
export function nameTogether(text: string, name: string): string {
  return name ? text.split(name).join(name.split(' ').join(NBSP)) : text;
}

/**
 * How far a block is pushed down so the bottom of the first view never cuts it: 0 when it ends at or
 * above that edge (`fold`) or already starts at or below it, else the distance that puts its top on the
 * edge. `top` is where the block starts with no push, `height` its own height, both in the scroll
 * area's content; `fold` is the height of the scroll area (the first view). The sign-in form uses it
 * for what an account agrees to, so the sentence and its two links are seen together or not at all.
 */
export function foldPush(top: number, height: number, fold: number): number {
  if (!(fold > 0) || !(height > 0) || top >= fold || top + height <= fold) return 0;
  // A block taller than the first view cannot be kept whole: it stays where it is.
  if (height > fold) return 0;
  return Math.ceil(fold - top);
}
