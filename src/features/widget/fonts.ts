/**
 * How much room a line of the widget's text takes, from the three font files the app.json plugin
 * bundles. The widget is drawn by Android TextViews into a picture, and the library cannot measure
 * text from JavaScript, so the layout (`layout.ts`) measures it here. Pure, tested (fonts.test.ts).
 *
 * Read from the TTF files themselves (unitsPerEm 1000 in all three):
 *
 * - Widths: each character's advance width, for every printable ASCII character (the widget's words,
 *   numbers and dates are ASCII). A character not in the table counts as the font's widest glyph.
 *   Kerning is not read, so a line is counted 4% wider than its advances, plus 1 dp for rounding to
 *   pixels (`WIDTH_SLACK`, `WIDTH_PAD`).
 * - Heights: a one-line TextView (font padding on, the default) is as tall as the font's highest
 *   point above the baseline and its lowest below it: max(bounding box top, ascender) plus
 *   max(bounding box bottom, descender). Bricolage Grotesque Bold: 1.152 + 0.380 = 1.532 em (its
 *   bounding box is far taller than its ascender, so a 30 dp figure takes a 46 dp line); Hanken
 *   Grotesk Medium and Bold: 1.000 + 0.303 = 1.303 em. Android rounds the top and the bottom out to
 *   whole pixels, so a line is counted 1 dp taller (`HEIGHT_PAD`, two pixels at density 2 and up).
 *
 * Checked against the owner's Pixel at font size 1.15: the screenshot's lines sit where these
 * metrics put them (the caption lines 1.30 to 1.34 em apart, the figure's line 0.38 em below its
 * baseline), and the cut "eaten of" line is what the old layout's 32 dp figure line left room for.
 */

export type WidgetFont = 'numbers' | 'words' | 'strong';

/** The bundled font files, by the name the plugin registers them under, with the weight each one is. */
export const FONT_FACES = {
  numbers: { fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '700' },
  words: { fontFamily: 'HankenGrotesk_500Medium', fontWeight: '500' },
  strong: { fontFamily: 'HankenGrotesk_700Bold', fontWeight: '700' },
} as const;

interface Metrics {
  /** Above the baseline and below it, in em: the TextView's line box. */
  top: number;
  bottom: number;
  /** Advance widths in thousandths of an em for the characters 32 (space) to 126 (~). */
  advances: number[];
  /** The widest advance: what a character outside the table counts as. */
  widest: number;
}

const table = (s: string) => s.split(',').map(Number);

const METRICS: Record<WidgetFont, Metrics> = {
  // BricolageGrotesque_700Bold.ttf: bbox yMax 1152, yMin -380; typo ascender 930, descender -270 (USE_TYPO_METRICS).
  numbers: {
    top: 1.152,
    bottom: 0.38,
    widest: 987,
    advances: table(
      '230,291,360,626,642,977,754,177,321,316,436,528,196,352,233,361,665,346,603,606,624,610,657,509,656,652,243,220,528,528,528,421,987,698,683,680,700,621,593,721,723,293,373,687,508,939,775,722,646,724,679,652,571,728,673,986,697,642,571,324,357,319,572,554,283,585,638,566,639,581,399,601,631,277,281,591,274,946,631,609,638,639,434,544,397,622,572,863,569,602,524,349,271,342,528',
    ),
  },
  // HankenGrotesk_500Medium.ttf: bbox yMax 994, yMin -258; ascender 1000, descender -303.
  words: {
    top: 1,
    bottom: 0.303,
    widest: 964,
    advances: table(
      '260,244,347,697,560,743,691,180,240,240,398,560,240,327,240,419,560,560,560,560,560,560,560,560,560,560,240,240,560,560,560,516,874,649,604,706,679,583,563,732,683,252,553,644,498,845,680,748,557,778,603,568,586,656,661,964,651,610,590,272,454,272,577,434,299,542,583,519,583,540,339,517,553,232,232,541,269,833,553,575,583,583,413,471,353,553,526,750,527,526,472,254,262,254,560',
    ),
  },
  // HankenGrotesk_700Bold.ttf: bbox yMax 997, yMin -259; ascender 1000, descender -303.
  strong: {
    top: 1,
    bottom: 0.303,
    widest: 979,
    advances: table(
      '260,252,366,694,560,735,700,193,277,277,399,560,240,327,240,420,560,560,560,560,560,560,560,560,560,560,240,240,560,560,560,515,873,674,611,709,674,578,558,735,693,263,556,663,504,856,689,747,562,785,612,575,584,657,672,979,670,625,605,299,467,299,627,493,312,546,574,522,574,541,348,522,564,245,245,560,278,843,564,572,574,574,426,472,367,564,535,755,542,535,471,283,271,283,560',
    ),
  },
};

/** A line is counted this much wider than its advances (kerning is not read). */
export const WIDTH_SLACK = 1.04;
/** And this many dp wider, for rounding to pixels. */
export const WIDTH_PAD = 1;
/** A line's box is this many dp taller than the font's extent, for rounding its top and bottom out to pixels. */
export const HEIGHT_PAD = 1;

/** No-break and zero-width characters the app's words may hold: a no-break space is a space, the marks take no room. */
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff]);

/** The advances of `text` in em, before the slack. */
export function advance(text: string, font: WidgetFont): number {
  const m = METRICS[font];
  let total = 0;
  for (const ch of text) {
    let code = ch.codePointAt(0) ?? 0;
    if (code === 0xa0 || code === 0x202f) code = 32;
    if (ZERO_WIDTH.has(code)) continue;
    total += code >= 32 && code <= 126 ? m.advances[code - 32] : m.widest;
  }
  return total / 1000;
}

/**
 * The room a line of `text` takes in `font` at `size` dp, in dp: its advances, the letter spacing
 * (`letterSpacing` em after each character, as Android adds it), the 4% slack and the 1 dp pad.
 */
export function textWidth(text: string, font: WidgetFont, size: number, letterSpacing = 0): number {
  if (!text) return 0;
  const chars = [...text].filter((c) => !ZERO_WIDTH.has(c.codePointAt(0) ?? 0)).length;
  const em = advance(text, font) + letterSpacing * chars;
  return Math.max(0, em * size) * WIDTH_SLACK + WIDTH_PAD;
}

/** The height of one line of `font` at `size` dp: the TextView's line box, plus the pad for pixel rounding. */
export function lineHeight(font: WidgetFont, size: number): number {
  const m = METRICS[font];
  return (m.top + m.bottom) * size + HEIGHT_PAD;
}

/** Where the baseline sits below the top of a one-line box of `font` at `size` dp. */
export function baselineOf(font: WidgetFont, size: number): number {
  return METRICS[font].top * size;
}

/** The font's extent above and below the baseline in em (for drawing the widget elsewhere, as the preview does). */
export function extentOf(font: WidgetFont): { top: number; bottom: number } {
  return { top: METRICS[font].top, bottom: METRICS[font].bottom };
}

/**
 * `text` broken into lines no wider than `width` dp, at spaces, as a TextView breaks words. A word
 * wider than the whole line stays whole on a line of its own (the caller then knows it does not fit).
 */
export function wrapWords(text: string, font: WidgetFont, size: number, width: number): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, font, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
