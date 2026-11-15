/**
 * Today's title is its greeting ("Good morning, Alex") on one line in the tab header,
 * next to the Friends button and the profile tile. The name is added only when the
 * whole line fits, so a long name never pushes the header to two lines or gets cut:
 * "Good afternoon" alone is still the greeting.
 *
 * Widths are Bricolage Grotesque Bold advance widths (per 100 px, measured in the
 * browser from the bundled font, the same file on every platform) for a-z, A-Z and a
 * few marks; anything else counts as a wide letter, so an estimate errs towards
 * leaving the name out rather than cutting it.
 */
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ ,.'-";
const WIDTHS = [
  58, 64, 57, 64, 58, 40, 60, 63, 28, 28, 59, 27, 95, 63, 61, 64, 64, 43, 54, 40, 62, 57, 86, 57, 60, 52, 70, 68, 68, 70, 62, 59, 72, 72, 29, 37, 69, 51, 94, 77, 72, 65, 72, 68,
  65, 57, 73, 67, 99, 70, 64, 57, 23, 20, 23, 18, 35,
];
const OTHER = 80;

/** The width of a one-line title in Bricolage Bold at `size` px with the tab title's letter spacing (-2.5%). */
export function titleWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    const i = CHARS.indexOf(ch);
    w += (i < 0 ? OTHER : WIDTHS[i]) / 100 - 0.025;
  }
  return w * size;
}

/** The greeting with the name when the line fits in `maxWidth`, else the greeting alone. */
export function greetingTitle(greeting: string, name: string, maxWidth: number, size: number): string {
  const trimmed = name.trim();
  if (!trimmed) return greeting;
  const full = `${greeting}, ${trimmed}`;
  return titleWidth(full, size) <= maxWidth ? full : greeting;
}
