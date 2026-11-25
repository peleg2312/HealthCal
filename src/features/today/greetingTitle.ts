/**
 * Today's title is its greeting ("Good morning, Alex") on one line in the tab header,
 * next to the Friends button and the profile tile. The name is added only when the
 * whole line fits, so a long name never pushes the header to two lines or gets cut:
 * "Good afternoon" alone is still the greeting. Beside the three header cups Today may also
 * shorten the greeting ("Afternoon, Alex"), keeping the name as long as it can.
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

/** The greeting cut to its time of day, for a narrow title: "Good afternoon" reads "Afternoon"; "Good night" stays. */
export function shortGreeting(greeting: string): string {
  const m = /^Good (morning|afternoon|evening)$/.exec(greeting);
  return m ? m[1][0].toUpperCase() + m[1].slice(1) : greeting;
}

/**
 * The greeting with the name when the line fits in `maxWidth`, else the greeting alone.
 * With `shorten` (Today's tab title, beside three header cups) it returns the first that fits of
 * "Good evening, Dana", "Evening, Dana", "Good evening" and "Evening", so the name stays where a
 * shorter greeting keeps it.
 */
export function greetingTitle(greeting: string, name: string, maxWidth: number, size: number, shorten = false): string {
  const trimmed = name.trim();
  const short = shortGreeting(greeting);
  const tries = trimmed ? [`${greeting}, ${trimmed}`] : [];
  if (shorten && trimmed && short !== greeting) tries.push(`${short}, ${trimmed}`);
  tries.push(greeting);
  if (shorten && short !== greeting) tries.push(short);
  // With `shorten` the line keeps 4 px to spare: the estimate is within 4 px of the browser, and a
  // line that fits by less than that was drawn cut ("Morning, Al…" at 320 px).
  const room = shorten ? maxWidth - 4 : maxWidth;
  return tries.find((t) => titleWidth(t, size) <= room) ?? tries[tries.length - 1];
}

/** How far Today's title may step down to keep the name (26 px to 24 px); the line height and the header do not change. */
export const TITLE_STEP = 2;

/**
 * With text grown (the app's or the phone's size), a tab title may give back its growth to stay on one line beside
 * the header's cups, a step of 2 px at a time, but is never drawn smaller than this: the tab title's own size on a
 * 320 px phone. At the designed text size nothing steps past `TITLE_STEP`.
 */
export const TITLE_FLOOR = 22;

/** The size a designed size is drawn at (`useDrawnFontSize` from @/theme); the designed size itself by default. */
type Drawn = (size: number) => number;
const asDesigned: Drawn = (s) => s;

/**
 * The designed sizes a tab title may be passed at, largest first: `first`, then (only while text is grown, so that
 * `drawn` grows them) a step of 2 px at a time while the drawn size stays at `TITLE_FLOOR` or more.
 */
function grownSteps(first: number[], drawn: Drawn): number[] {
  const out = [...first];
  const last = out[out.length - 1];
  if (drawn(last) <= last) return out;
  for (let s = last - TITLE_STEP; s > 0 && drawn(s) >= TITLE_FLOOR; s -= TITLE_STEP) out.push(s);
  return out;
}

/**
 * A tab title that is one fixed word or two ("Food diary", "Progress") at grown text: the designed size to pass so its
 * drawn line fits `maxWidth` (stepping down from `size` as `grownSteps` allows), else `size` (it then wraps at its
 * words). At the designed text size always `size`.
 */
export function tabTitleFit(text: string, maxWidth: number, size: number, drawn: Drawn = asDesigned): number {
  return grownSteps([size], drawn).find((s) => titleWidth(text, drawn(s)) <= maxWidth - 4) ?? size;
}

/**
 * Today's tab title and the size it is drawn at. The name is kept first: the full and the short
 * greeting with the name at `size`, then (when `size` is the 26 px of a window 360 px or wider) the
 * same two at `size - TITLE_STEP`, and only then the greeting without the name at `size`. At 360 px
 * every greeting keeps a 4-letter name ("Good night, Alex" at 24 px). `drawn` is the device's text
 * growth (`useDrawnFontSize`): with text grown each line is measured as drawn, and the title may step
 * on down (`grownSteps`, never drawn under `TITLE_FLOOR`) to keep the name on one line. The size
 * returned is the designed one, which the kit's Text then grows.
 */
export function todayTitle(greeting: string, name: string, maxWidth: number, size: number, drawn: Drawn = asDesigned): { text: string; size: number } {
  const trimmed = name.trim();
  const room = maxWidth - 4;
  if (trimmed) {
    const short = shortGreeting(greeting);
    const named = short !== greeting ? [`${greeting}, ${trimmed}`, `${short}, ${trimmed}`] : [`${greeting}, ${trimmed}`];
    const sizes = grownSteps(size >= 26 ? [size, size - TITLE_STEP] : [size], drawn);
    for (const s of sizes) {
      const hit = named.find((t) => titleWidth(t, drawn(s)) <= room);
      if (hit) return { text: hit, size: s };
    }
  }
  const text = greetingTitle(greeting, '', maxWidth, drawn(size), true);
  return { text, size: tabTitleFit(text, maxWidth, size, drawn) };
}
