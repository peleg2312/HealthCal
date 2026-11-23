/**
 * The contrast rules of the project guide, as a test. Every pair the guide
 * promises is computed for all six palettes, so a palette change that
 * breaks one fails here instead of in a review. The three original palettes
 * (dark, light, Blossom) keep their two recorded exceptions; the three added
 * from the owner's five-colour palette (Butter, Honey, Java) are held to the
 * full rule with none (the last block).
 *
 * WCAG ratios: 4.5:1 for text, 3:1 for large numbers and for the lines and
 * outlines that carry meaning (the level line, the cup's outline, a fill on
 * its card). Colour differences are CIEDE2000.
 */
import { describe, expect, it } from 'vitest';

import { contrast, deltaE, luminance, over, parseHex } from './contrast';
import { THEME_NAMES, type ThemeName } from './resolve';
import {
  blossomColors,
  butterColors,
  chartFillOpacity,
  darkColors,
  honeyColors,
  isDarkTheme,
  javaColors,
  lightColors,
  paletteFor,
  PALETTES as THEME_PALETTES,
  THEME_IS_DARK,
  type ThemeColors,
} from './tokens';

const PALETTES = { dark: darkColors, light: lightColors, blossom: blossomColors, butter: butterColors, honey: honeyColors, java: javaColors } as const;
type Name = keyof typeof PALETTES;
const NAMES = Object.keys(PALETTES) as Name[];
/** The palettes made from the owner's five colours: the guide's full rule, no exception. */
const STRICT = ['butter', 'honey', 'java'] as const satisfies readonly Name[];

/**
 * Checks parked for the colour designer while Honey and Java had their first values (the lead's
 * D6: Java's raspberry cup, Honey's over mark that cannot be missed). They all pass now, so the
 * list is empty and every check runs as an ordinary `it`. Nothing may be added to this list.
 */
const FOR_THE_DESIGNER = new Set<string>([]);

/** `it`, or `it.fails` for a check listed for the colour designer. */
function check(name: string, title: string) {
  return FOR_THE_DESIGNER.has(`${name}: ${title}`) ? it.fails : it;
}

const DATA = ['calories', 'protein', 'carbs', 'fat', 'water', 'exercise', 'sleep', 'weight'] as const;
type Key = keyof ThemeColors;

/** Every failing pair in one message, so one run shows all of them. */
function failures(rows: { what: string; ratio: number; min: number }[]): string[] {
  return rows.filter((r) => r.ratio < r.min).map((r) => `${r.what}: ${r.ratio.toFixed(2)} is under ${r.min}`);
}

function pairs(name: Name, fgs: Key[], bgs: Key[], min: number) {
  const c = PALETTES[name];
  return fgs.flatMap((fg) => bgs.map((bg) => ({ what: `${name} ${fg} on ${bg}`, ratio: contrast(c[fg], c[bg]), min })));
}

describe('the colour maths', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBe(1);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('flattens a translucent colour onto its background', () => {
    expect(over('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(over('#FF000080', '#FFFFFF')).toBe('#FF7F7F');
    expect(parseHex('#BF44201A').alpha).toBeCloseTo(0.102, 3);
    expect(() => parseHex('red')).toThrow();
  });

  it('computes CIEDE2000', () => {
    expect(deltaE('#336699', '#336699')).toBe(0);
    // Sharma, Wu and Dalal's reference pairs are in Lab; these sRGB pairs were checked against two other implementations.
    expect(deltaE('#FF0000', '#00FF00')).toBeCloseTo(86.6, 0);
    expect(deltaE('#FFFFFF', '#000000')).toBeCloseTo(100, 0);
  });
});

describe.each(NAMES)('%s palette', (name) => {
  const c = PALETTES[name];

  it('has only opaque six-digit colours, apart from the two that are meant to be translucent', () => {
    for (const [key, value] of Object.entries(c)) {
      const { alpha } = parseHex(value);
      if (key === 'overlay' || key === 'primarySoft') continue;
      expect(alpha, key).toBe(1);
    }
  });

  it('keeps body text at 4.5:1 on every surface it is used on', () => {
    expect(
      failures([
        ...pairs(name, ['text', 'textSecondary'], ['bg', 'bgElevated', 'surface', 'surfaceAlt', 'tabBar'], 4.5),
        // textTertiary is allowed on bg, surface and the tab bar only (never on surfaceAlt).
        ...pairs(name, ['textTertiary'], ['bg', 'surface', 'tabBar'], 4.5),
        // success is ink, so done marks and labels read like text.
        ...pairs(name, ['success'], ['bg', 'surface', 'surfaceAlt'], 4.5),
      ]),
    ).toEqual([]);
  });

  it('keeps status text at 4.5:1: warningInk and danger on bg, surface and surfaceAlt', () => {
    expect(failures(pairs(name, ['warningInk', 'danger'], ['bg', 'surface', 'surfaceAlt'], 4.5))).toEqual([]);
  });

  it('keeps accent text at 4.5:1: primary on surface, primaryInk everywhere else', () => {
    expect(
      failures([
        ...pairs(name, ['primary'], ['surface'], 4.5),
        ...pairs(name, ['primaryInk'], ['bg', 'surface', 'surfaceAlt'], 4.5),
        // The soft button: primaryInk on the primarySoft fill, over a card or over the page.
        { what: `${name} primaryInk on primarySoft over surface`, ratio: contrast(c.primaryInk, over(c.primarySoft, c.surface)), min: 4.5 },
        { what: `${name} primaryInk on primarySoft over bg`, ratio: contrast(c.primaryInk, over(c.primarySoft, c.bg)), min: 4.5 },
        // The primary button's label.
        ...pairs(name, ['onPrimary'], ['primary'], 4.5),
      ]),
    ).toEqual([]);
  });

  it('keeps number inks readable: caloriesInk 4.5:1 on surface, 3:1 (large numbers) on bg and surfaceAlt', () => {
    expect(failures([...pairs(name, ['caloriesInk'], ['surface'], 4.5), ...pairs(name, ['caloriesInk'], ['bg', 'surfaceAlt'], 3), ...pairs(name, ['warningInk'], ['bg', 'surface', 'surfaceAlt'], 4.5)])).toEqual([]);
  });

  it('keeps the inverted labels readable: the toast, a selected chip and the scrub label put bg on text', () => {
    expect(failures(pairs(name, ['bg'], ['text'], 4.5))).toEqual([]);
  });

  it('draws the level line at 3:1 against the empty part of every cup and bar', () => {
    expect(failures(pairs(name, ['rim'], ['vesselEmpty', 'track', 'surface', 'bg'], 3))).toEqual([]);
  });

  it('draws the cup outline at 3:1 on the page and on a card', () => {
    expect(failures(pairs(name, ['vesselEdge'], ['bg', 'surface', 'vesselEmpty'], 3))).toEqual([]);
  });

  it('leaves the empty part of a cup empty: vesselEmpty is the card colour', () => {
    expect(c.vesselEmpty).toBe(c.surface);
  });

  it('keeps the exercise hatching visible in the empty cup', () => {
    expect(c.headroom).toBe(c.exercise);
    expect(failures(pairs(name, ['headroom'], ['vesselEmpty'], 3))).toEqual([]);
  });

  check(name, 'keeps every data fill at 3:1 on a card')('keeps every data fill at 3:1 on a card', () => {
    const rows = [...DATA, 'warning' as const].map((k) => ({ what: `${name} ${k} fill on surface`, ratio: contrast(c[k], c.surface), min: 3 }));
    // The one documented exception: Blossom's tickle-pink calorie fill is 2.4:1 on the card. It is
    // the owner's colour, it is never text, and the raspberry rim and outline carry its shape.
    const known = name === 'blossom' ? rows.filter((r) => r.what.includes('calories')) : [];
    expect(failures(rows.filter((r) => !known.includes(r)))).toEqual([]);
    for (const r of known) expect(r.ratio, r.what).toBeGreaterThan(2.3);
  });

  check(name, 'keeps status colours apart from the accent and from each other')('keeps status colours apart from the accent and from each other', () => {
    // Destructive must not look like the brand button.
    expect(deltaE(c.danger, c.primary), 'danger vs primary').toBeGreaterThanOrEqual(15);
    expect(deltaE(c.danger, c.warning), 'danger vs warning').toBeGreaterThanOrEqual(15);
    // Amber means "over" and nothing else.
    for (const k of DATA) expect(deltaE(c.warning, c[k]), `warning vs ${k}`).toBeGreaterThanOrEqual(15);
    // Done marks are ink, not a ninth green that could be taken for exercise or carbs.
    expect(c.success).toBe(c.text);
  });

  it('keeps the eight data colours at least 12 apart', () => {
    const close: string[] = [];
    for (let i = 0; i < DATA.length; i++) {
      for (let j = i + 1; j < DATA.length; j++) {
        const d = deltaE(c[DATA[i]], c[DATA[j]]);
        if (d < 12) close.push(`${name} ${DATA[i]} and ${DATA[j]}: ${d.toFixed(1)}`);
      }
    }
    expect(close).toEqual([]);
  });
});

/**
 * The level line on top of a fill. The guide wants it at 3:1 against the fill
 * under it, and the light palette does that: its line is near-black ink and
 * every fill is a mid tone.
 *
 * Dark and Blossom cannot, by arithmetic rather than by choice of shade. Dark
 * fills are pastels (luminance 0.31 to 0.60) in a near-black cup (0.013): a
 * line 3:1 off the lightest fill would need a luminance above 1, and one 3:1
 * darker than the darkest fill would be under 2:1 against the empty cup, where
 * the line matters most. Blossom's line is the raspberry accent, whose
 * luminance (0.16) sits in the middle of its fills (0.09 to 0.40). Both
 * palettes are kept as they are on the owner's instruction, so there the test
 * holds the line to what makes the level readable: 3:1 against the empty cup
 * (tested above for every palette) and a clear colour difference from each
 * fill, so the line never merges into one.
 */
describe('the level line on a fill', () => {
  it('light: the ink line is 3:1 against every data fill', () => {
    const c = lightColors;
    expect(failures([...DATA, 'warning' as const, 'primary' as const].map((k) => ({ what: `light rim on ${k}`, ratio: contrast(c.rim, c[k]), min: 3 })))).toEqual([]);
  });

  it.each(['dark', 'blossom'] as const)('%s: the line differs from every data fill by at least 14 (CIEDE2000)', (name) => {
    const c = PALETTES[name];
    const merged = [...DATA, 'warning' as const].map((k) => ({ k, d: deltaE(c.rim, c[k]) })).filter((r) => r.d < 14);
    expect(merged.map((r) => `${name} rim and ${r.k}: ${r.d.toFixed(1)}`)).toEqual([]);
  });

  it('records why dark and Blossom cannot reach 3:1 on a fill, so the exception is checked rather than assumed', () => {
    for (const name of ['dark', 'blossom'] as const) {
      const c = PALETTES[name];
      const lums = DATA.map((k) => luminance(c[k]));
      const lightest = Math.max(...lums);
      const darkest = Math.min(...lums);
      // A line lighter than every fill by 3:1 would need this luminance (above 1 is impossible).
      const needLighter = 3 * (lightest + 0.05) - 0.05;
      // A line darker than every fill by 3:1 has at most this luminance...
      const maxDarker = (darkest + 0.05) / 3 - 0.05;
      // ...and must still be 3:1 against the empty cup. In dark it cannot be; in Blossom no luminance is left at all.
      const empty = luminance(c.vesselEmpty);
      const darkerWorks = maxDarker >= 0 && Math.max(maxDarker, empty) + 0.05 >= 3 * (Math.min(maxDarker, empty) + 0.05);
      expect(needLighter, `${name}: a lighter line`).toBeGreaterThan(1);
      expect(darkerWorks, `${name}: a darker line`).toBe(false);
    }
  });

  it('keeps bar-chart tints legible: the tint is drawn at chartFill and still differs from the card', () => {
    for (const name of NAMES) {
      const c = PALETTES[name];
      expect(chartFillOpacity[name]).toBeGreaterThan(0);
      expect(chartFillOpacity[name]).toBeLessThanOrEqual(1);
      for (const k of DATA) {
        const tint = over(c[k], c.surface, chartFillOpacity[name]);
        expect(contrast(tint, c.surface), `${name} ${k} bar on a card`).toBeGreaterThanOrEqual(1.4);
        // The rim on a bar is the day's level: it must read against the card above the bar.
        expect(contrast(c.rim, c.surface)).toBeGreaterThanOrEqual(3);
      }
    }
    // Dark bars keep their colour: the tint stays at least 3.5:1 off the dark card (42% would be about 2:1, a brown).
    for (const k of DATA) expect(contrast(over(darkColors[k], darkColors.surface, chartFillOpacity.dark), darkColors.surface), `dark ${k} bar`).toBeGreaterThanOrEqual(3.5);
  });
});

describe('the palettes by name', () => {
  it('has a palette, a dark flag and a chart opacity for every theme name', () => {
    expect(Object.keys(THEME_PALETTES).sort()).toEqual([...THEME_NAMES].sort());
    expect(Object.keys(THEME_IS_DARK).sort()).toEqual([...THEME_NAMES].sort());
    expect(Object.keys(chartFillOpacity).sort()).toEqual([...THEME_NAMES].sort());
    for (const name of THEME_NAMES) {
      expect(paletteFor(name)).toBe(PALETTES[name]);
      expect(THEME_PALETTES[name]).toBe(PALETTES[name]);
    }
  });

  it('marks the dark-background palettes as dark: dark and Java', () => {
    expect(THEME_NAMES.filter(isDarkTheme).sort()).toEqual(['dark', 'java']);
    // The flag agrees with the paper: a dark palette has a dark page and light text.
    for (const name of THEME_NAMES) expect(luminance(PALETTES[name].bg) < luminance(PALETTES[name].text), name).toBe(isDarkTheme(name));
  });

  it('keeps the original chart opacities', () => {
    expect([chartFillOpacity.dark, chartFillOpacity.light, chartFillOpacity.blossom]).toEqual([0.7, 0.42, 0.42]);
  });

  it('gives Light for a name it does not know, so a screen always has colours', () => {
    expect(paletteFor('sepia' as ThemeName)).toBe(lightColors);
    expect(paletteFor('toString' as ThemeName)).toBe(lightColors);
    expect(isDarkTheme('sepia' as ThemeName)).toBe(false);
  });
});

/**
 * The palettes made from the owner's five colours meet the guide's full rule, with no exception:
 * every data fill and the amber at 3:1 on the card (in the per-palette block above, which keeps
 * Blossom's exception to Blossom), the level line at 3:1 against every data fill and the amber and
 * against the empty cup, a dark palette's bar tints at 3.5:1 off its card at its own chart opacity,
 * and an over mark that cannot be taken for the calorie fill.
 */
describe.each(STRICT)('%s, held to the full rule', (name) => {
  const c = PALETTES[name];

  check(name, 'the level line is 3:1 against every data fill and the amber')('the level line is 3:1 against every data fill and the amber', () => {
    expect(failures([...DATA, 'warning' as const].map((k) => ({ what: `${name} rim on ${k}`, ratio: contrast(c.rim, c[k]), min: 3 })))).toEqual([]);
  });

  it('the level line is 3:1 against the empty cup and the progress track', () => {
    expect(failures(pairs(name, ['rim'], ['vesselEmpty', 'track', 'surface', 'bg'], 3))).toEqual([]);
  });

  check(name, 'the over mark stands apart from the calorie fill')('the over mark stands apart from the calorie fill', () => {
    // The amber lip sits right on the calorie cup and the over part of a bar right on its fill:
    // at least 20 apart (CIEDE2000), more than the 15 every data colour keeps from the amber.
    expect(deltaE(c.warning, c.calories), `${name} warning vs calories`).toBeGreaterThanOrEqual(20);
  });

  it('a dark palette keeps its bar tints at 3.5:1 off its card at its own chart opacity', () => {
    const opacity = chartFillOpacity[name];
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
    if (!isDarkTheme(name)) return;
    const rows = [...DATA, 'warning' as const].map((k) => ({ what: `${name} ${k} bar at ${opacity}`, ratio: contrast(over(c[k], c.surface, opacity), c.surface), min: 3.5 }));
    expect(failures(rows)).toEqual([]);
  });
});
