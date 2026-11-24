/**
 * Design tokens for the "Pour" identity: the day fills up like a cup.
 * One source of truth for colour, type, spacing and radius. Screens never
 * hard-code a hex value; they read from `useTheme()`.
 *
 * Every amount is a flat colour poured into an open, straight-sided vessel,
 * topped by a crisp level line (`rim`), with what is left visible above it.
 * There are no gradients, no glows and no pills. Containers are cups: square
 * shoulders on top, a round base below (see `cup()`).
 */
import type { ViewStyle } from 'react-native';

import type { ThemeName } from './resolve';

export interface ThemeColors {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceAlt: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  /** Only on bg or surface: it is just under 4.5:1 on surfaceAlt in light and Blossom. */
  textTertiary: string;
  /** Brand accent (persimmon, raspberry in Blossom) and the text colour that sits on top of it. As text, `primary` is 4.5:1 on surface only. */
  primary: string;
  onPrimary: string;
  primarySoft: string;
  /** The primary as text where `primary` itself is under 4.5:1: on primarySoft (the soft button), bg and surfaceAlt. A shade darker in light and Blossom. */
  primaryInk: string;
  /**
   * The ink of a borderless control: a ghost button's label and its icon. Its own colour, at least 15 apart
   * (CIEDE2000) from `caloriesInk` in every look, so a control is never drawn in the colour of a calorie figure
   * (in Dark the accent and the calorie ink are one persimmon). 4.5:1 on bg, bgElevated, surface and surfaceAlt.
   */
  actionInk: string;
  /** Semantic data colours, identical meaning in every theme. Fills and key marks only, never text. */
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  exercise: string;
  sleep: string;
  weight: string;
  /** Done and OK marks (checks, a done tile, a healthy-range badge). It is ink (equal to `text`), not a green: a ninth green could not be told from exercise or carbs. */
  success: string;
  /** Over target: a fill, a lip or a key mark (amber, never red). Never text: use `warningInk`. */
  warning: string;
  /** Warning as text, or as an icon beside text: 4.5:1 on bg, surface and surfaceAlt in every theme. */
  warningInk: string;
  /** Destructive actions and field errors. A red of its own, at least 15 ΔE (CIEDE2000) from the primary in every theme; 4.5:1 as text on bg, surface and surfaceAlt. */
  danger: string;
  overlay: string;
  /** The unfilled part of a progress bar (a tinted track). Not for cups: see `vesselEmpty`. */
  track: string;
  /** The unfilled part of a cup (Vessel, MiniCup, Trough, cups drawn by hand). Equal to `surface`, so room left reads as empty space, not as a cup full of something pale. */
  vesselEmpty: string;
  tabBar: string;
  /** Sheet shadow only. Nothing else in the kit casts a shadow. */
  shadow: string;
  /** The level line: a 3 px bar on top of every fill, every progress tick, the active tab and the selected segment. Never a data colour. */
  rim: string;
  /** Hatching for budget added by exercise inside a vessel (equals exercise). */
  headroom: string;
  /** Outline of vessel sides and base (never the top: vessels are open). At least 3:1 on bg and surface: with an empty inside, the outline is what draws the cup. */
  vesselEdge: string;
  /**
   * The outline of a text field (TextField, NumberField, the search field): at least 3:1 against the field's
   * own fill (the card colour) and against the page and the card around it, so the field can be found
   * without its label (WCAG 1.4.11). `borderStrong` is a hairline for dividers and dashes, under 3:1.
   */
  fieldEdge: string;
  /** Marks and words drawn over the live camera picture (the barcode frame's corners, its hint): the picture is the same in every look, so this is white in all of them. */
  cameraInk: string;
  /** Calorie colour for text and large numbers (the calorie fill is too light to read in light and Blossom). */
  caloriesInk: string;
  /**
   * The calorie colour as a solid bar in a chart (the kit's `BarChart` draws a solid segment in `calories` with
   * it): 3:1 on the card in every look. It equals `calories` everywhere but Blossom, whose tickle-pink cup fill
   * is 2.4:1 on the card; there the bar is a deeper pink.
   */
  caloriesBar: string;
  /**
   * A dashed line that carries meaning: a chart's goal line and the dashed slot of an empty meal. 3:1 on the
   * page and the card (bg, bgElevated, surface) in every look. `borderStrong` stays the hairline for dashes
   * that only divide.
   */
  dashEdge: string;
  /** @deprecated No gradients in Pour. Equals `surface`; kept so old callers do not break. */
  heroStart: string;
  /** @deprecated No gradients in Pour. Equals `surface`. */
  heroEnd: string;
  /** @deprecated No gradients in Pour. Equals `calories`. */
  ringEnd: string;
  /**
   * "Continue with Google" only (src/features/auth/GoogleButton.tsx). Google's sign-in button rules fix
   * its colours, so these three are Google's own values, the one sanctioned exception to the palette:
   * its Light button (white fill, #747775 edge, #1F1F1F label) on the light papers and its Dark button
   * (#131314 fill, #8E918F edge, #E3E3E3 label) on Dark and Java. Never use them for anything else.
   */
  googleFill: string;
  googleEdge: string;
  googleText: string;
}

/** Google's Light and Dark sign-in button colours (https://developers.google.com/identity/branding-guidelines). */
const GOOGLE_LIGHT = { googleFill: '#FFFFFF', googleEdge: '#747775', googleText: '#1F1F1F' } as const;
const GOOGLE_DARK = { googleFill: '#131314', googleEdge: '#8E918F', googleText: '#E3E3E3' } as const;

/** Dark: warm black, not chocolate. The surfaces are neutral; the warmth lives in the cream text and the persimmon accent. */
export const darkColors: ThemeColors = {
  bg: '#121110',
  bgElevated: '#1A1918',
  surface: '#1F1E1C',
  surfaceAlt: '#292826',
  surfacePressed: '#353331',
  border: '#353331',
  borderStrong: '#57534E',
  text: '#F6EEE3',
  textSecondary: '#C9BCAC',
  textTertiary: '#A09282',
  primary: '#FF9466',
  onPrimary: '#1F120A',
  primarySoft: '#FF946624',
  primaryInk: '#FF9466',
  // A pale rose-peach: the persimmon is also the calorie ink here, so a control needs a colour of its own (16 apart).
  actionInk: '#F0BAB4',
  calories: '#FF9466',
  protein: '#F28BB8',
  carbs: '#C9D45A',
  fat: '#B8946E',
  water: '#6FB4F7',
  exercise: '#4FCDA3',
  sleep: '#B9A3F5',
  weight: '#B7C3C6',
  success: '#F6EEE3',
  // A clear amber, yellower than the persimmon calorie fill it sits on (27.8 apart, CIEDE2000; it was
  // 22.4 at #F5B83D and read as the same orange on a bar), and still 18 from the carbs' yellow-green.
  warning: '#FFC400',
  warningInk: '#FFC400',
  danger: '#FA5863',
  overlay: '#070606B8',
  track: '#2A2927',
  vesselEmpty: '#1F1E1C',
  tabBar: '#1A1918',
  shadow: '#000000',
  rim: '#F6EEE3',
  headroom: '#4FCDA3',
  vesselEdge: '#75706A',
  fieldEdge: '#726D67',
  cameraInk: '#FFFFFF',
  caloriesInk: '#FF9466',
  caloriesBar: '#FF9466',
  dashEdge: '#726D67',
  heroStart: '#1F1E1C',
  heroEnd: '#1F1E1C',
  ringEnd: '#FF9466',
  ...GOOGLE_DARK,
};

/** Light: oat paper, ink text and level line, a persimmon accent, fresh leaf-green carbs and caramel fat. */
export const lightColors: ThemeColors = {
  bg: '#F4EEE5',
  bgElevated: '#FAF6F0',
  surface: '#FFFCF8',
  surfaceAlt: '#EEE6DA',
  surfacePressed: '#E4D9CA',
  border: '#E2D8CA',
  borderStrong: '#B9AB99',
  text: '#211913',
  // 7:1 on the page, the card and the soft surface (WCAG's enhanced level for reading text).
  textSecondary: '#54483F',
  textTertiary: '#73665A',
  primary: '#BF4420',
  onPrimary: '#FFFFFF',
  primarySoft: '#BF44201A',
  primaryInk: '#AD3C1C',
  actionInk: '#782A18',
  calories: '#E2683F',
  protein: '#B43872',
  carbs: '#5E9B1F',
  fat: '#9A6640',
  water: '#2672CC',
  exercise: '#14876C',
  sleep: '#7558C4',
  weight: '#5F6B73',
  success: '#211913',
  warning: '#C98100',
  warningInk: '#8A5A00',
  danger: '#A61E33',
  overlay: '#211913A6',
  track: '#ECE3D6',
  vesselEmpty: '#FFFCF8',
  tabBar: '#FFFCF8',
  shadow: '#000000',
  rim: '#211913',
  headroom: '#14876C',
  vesselEdge: '#948572',
  fieldEdge: '#8E8273',
  cameraInk: '#FFFFFF',
  caloriesInk: '#BF4420',
  caloriesBar: '#E2683F',
  dashEdge: '#8E8273',
  heroStart: '#FFFCF8',
  heroEnd: '#FFFCF8',
  ringEnd: '#E2683F',
  ...GOOGLE_LIGHT,
};

/**
 * Blossom: champagne paper, raspberry accent, tickle-me-pink calorie fill.
 * The pink fill is only 2.4:1 on the card, so it is never text: calorie
 * numbers use `caloriesInk`, and the raspberry level line outlines the fill.
 */
export const blossom = {
  raspberry: '#C43670',
  ticklePink: '#F283AF',
  champagne: '#FBF4EB',
  blush: '#FBD9E5',
  cherryBlossom: '#FCC3D2',
};

export const blossomColors: ThemeColors = {
  bg: blossom.champagne,
  bgElevated: '#FFF9F3',
  surface: '#FFFDFA',
  surfaceAlt: blossom.blush,
  surfacePressed: blossom.cherryBlossom,
  border: '#F2D3DC',
  borderStrong: '#D99AB2',
  text: '#3B1427',
  textSecondary: '#68384F',
  textTertiary: '#8A5670',
  primary: blossom.raspberry,
  onPrimary: '#FFFFFF',
  primarySoft: blossom.blush,
  primaryInk: '#AE2E64',
  actionInk: '#781266',
  calories: blossom.ticklePink,
  protein: '#8A2F72',
  carbs: '#5E9B1F',
  fat: '#9A6640',
  water: '#2479C2',
  exercise: '#13876F',
  sleep: '#6A5BC0',
  weight: '#5F6B73',
  success: '#3B1427',
  warning: '#C98100',
  warningInk: '#8A5A00',
  danger: '#B3261E',
  overlay: '#3B1427A6',
  track: '#F7E6EA',
  vesselEmpty: '#FFFDFA',
  tabBar: '#FFFDFA',
  shadow: '#000000',
  rim: blossom.raspberry,
  headroom: '#13876F',
  vesselEdge: '#BC7290',
  fieldEdge: '#B2788F',
  cameraInk: '#FFFFFF',
  caloriesInk: '#B42F66',
  // 3.0:1 on the card, where the tickle-pink is 2.4:1: a calorie bar is drawn without the outline a cup has.
  caloriesBar: '#E46A9E',
  dashEdge: '#B2788F',
  heroStart: '#FFFDFA',
  heroEnd: '#FFFDFA',
  ringEnd: blossom.ticklePink,
  ...GOOGLE_LIGHT,
};

/**
 * The owner's five-colour palette, the source of Butter, Honey and Java: Transparent Yellow (a
 * pale butter), Sceptre Red (a deep oxblood wine), Cerulean Blue (a soft grey-blue), Potting Soil
 * (a warm brown) and Java Brown (nearly black). Butter and cerulean are the two lights against
 * three deep darks; nothing bright, nothing pink, nothing orange.
 */
export const ownerPalette = {
  transparentYellow: '#F5EFC6',
  sceptreRed: '#4D0E12',
  ceruleanBlue: '#A5BCD6',
  pottingSoil: '#4A2E27',
  javaBrown: '#231815',
};

/**
 * Butter: butter paper (Transparent Yellow), Java Brown ink, Potting Soil as the second voice,
 * Sceptre Red as the brand colour and the level line, Cerulean as the soft surface (tab bar, soft
 * cards); progress tracks are a neutral step of the butter paper, so an empty track never reads as a pale blue fill. The calorie fill is a deep raspberry lifted from Sceptre Red. Every data
 * fill and the amber sit between luminance 0.158 and 0.28, so the Sceptre Red line is 3:1 on each
 * and each is 3:1 on the butter card: the guide's full rule, with no exception.
 */
export const butterColors: ThemeColors = {
  bg: ownerPalette.transparentYellow,
  bgElevated: '#F8F3D3',
  surface: '#FCF9E6',
  surfaceAlt: ownerPalette.ceruleanBlue,
  surfacePressed: '#ECE4B8',
  border: '#E4DAB0',
  borderStrong: '#B9A27F',
  text: ownerPalette.javaBrown,
  // Potting Soil a step darker: 7:1 on the cerulean soft surface and tab bar as on the butter paper.
  textSecondary: '#3E2722',
  textTertiary: '#5E4339',
  primary: ownerPalette.sceptreRed,
  onPrimary: ownerPalette.transparentYellow,
  primarySoft: '#A5BCD666',
  primaryInk: ownerPalette.sceptreRed,
  actionInk: ownerPalette.sceptreRed,
  calories: '#C4475E',
  protein: '#9A5CAA',
  carbs: '#5E8A2A',
  fat: '#A27C5E',
  water: '#3F80B4',
  exercise: '#24877A',
  sleep: '#6D6FC4',
  weight: '#737880',
  success: ownerPalette.javaBrown,
  warning: '#C08410',
  warningInk: '#6E3F00',
  danger: '#8F1F0E',
  overlay: '#000000A6',
  // A neutral step of the butter paper (1.2:1 on the card, as the other looks' tracks): an empty track
  // reads as empty, and the water bar on it stays 3:1. Cerulean read as a pale blue fill (D1-F2).
  track: '#ECE5C2',
  vesselEmpty: '#FCF9E6',
  tabBar: ownerPalette.ceruleanBlue,
  shadow: '#000000',
  rim: ownerPalette.sceptreRed,
  headroom: '#24877A',
  vesselEdge: ownerPalette.pottingSoil,
  fieldEdge: '#958166',
  cameraInk: '#FFFFFF',
  caloriesInk: '#93263D',
  caloriesBar: '#C4475E',
  dashEdge: '#958166',
  heroStart: '#FCF9E6',
  heroEnd: '#FCF9E6',
  ringEnd: '#C4475E',
  ...GOOGLE_LIGHT,
};

/**
 * Honey: Butter with a gold calorie cup in place of the raspberry. The mark for "over" is a burnt
 * amber, 22 (CIEDE2000) from the gold, so the lip on a cup and the over part of a bar are told from
 * the gold at a glance (contrast.test.ts holds the new looks to at least 20). Fat is a touch cooler
 * than Butter's so it stays clear of both, and the over number has its own burnt-amber ink.
 */
export const honeyColors: ThemeColors = {
  ...butterColors,
  calories: '#B48820',
  fat: '#9E7A6A',
  warning: '#B85414',
  // Its own burnt-amber ink: Butter's would sit 7.9 from the honey number ink, so "over" would not change colour.
  warningInk: '#703406',
  caloriesInk: '#7A5512',
  caloriesBar: '#B48820',
  ringEnd: '#B48820',
};

/**
 * Java: the owner's palette in the dark. Java Brown is the ground, the cards one step toward
 * Potting Soil, Potting Soil the pressed surface and borders, Sceptre Red the soft cards
 * (surfaceAlt) and the tab bar, butter the ink and the level line, Cerulean the brand colour.
 * Its bar charts are drawn solid (chartFillOpacity.java is 1): that is what lets every fill sit in
 * the band where the butter line is 3:1 on it and it is 3:1 on the brown card, so the calorie cup
 * is a raspberry and not a pale rose.
 */
export const javaColors: ThemeColors = {
  bg: ownerPalette.javaBrown,
  bgElevated: '#2A1D19',
  surface: '#31221D',
  surfaceAlt: ownerPalette.sceptreRed,
  surfacePressed: ownerPalette.pottingSoil,
  border: ownerPalette.pottingSoil,
  borderStrong: '#7A5A4C',
  text: ownerPalette.transparentYellow,
  textSecondary: '#DCD0AE',
  textTertiary: '#BBAC8E',
  primary: ownerPalette.ceruleanBlue,
  onPrimary: ownerPalette.javaBrown,
  primarySoft: '#A5BCD62E',
  primaryInk: ownerPalette.ceruleanBlue,
  actionInk: ownerPalette.ceruleanBlue,
  calories: '#CC4F66',
  protein: '#A664B6',
  carbs: '#6A9438',
  fat: '#A0806E',
  water: '#4A8CC4',
  exercise: '#3A9682',
  sleep: '#7C78D0',
  weight: '#82868C',
  success: ownerPalette.transparentYellow,
  warning: '#B87800',
  warningInk: '#E9B04A',
  danger: '#FF6A3D',
  overlay: '#000000B3',
  track: ownerPalette.pottingSoil,
  vesselEmpty: '#31221D',
  tabBar: ownerPalette.sceptreRed,
  shadow: '#000000',
  rim: ownerPalette.transparentYellow,
  headroom: '#3A9682',
  vesselEdge: '#A08672',
  fieldEdge: '#8A6D5C',
  cameraInk: '#FFFFFF',
  caloriesInk: '#F27A90',
  caloriesBar: '#CC4F66',
  dashEdge: '#8A6D5C',
  heroStart: '#31221D',
  heroEnd: '#31221D',
  ringEnd: '#CC4F66',
  ...GOOGLE_DARK,
};

/** Every palette by theme name. Look one up with `paletteFor(name)`. */
export const PALETTES: Record<ThemeName, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
  blossom: blossomColors,
  butter: butterColors,
  honey: honeyColors,
  java: javaColors,
};

/** Palettes with a dark background: the status bar, the keyboard and the like follow this. */
export const THEME_IS_DARK: Record<ThemeName, boolean> = { dark: true, light: false, blossom: false, butter: false, honey: false, java: true };

/** The palette for a theme name; Light for a name this version does not know, so a screen always has colours. */
export function paletteFor(name: ThemeName): ThemeColors {
  return Object.prototype.hasOwnProperty.call(PALETTES, name) ? PALETTES[name] : lightColors;
}

/** True when the theme's background is dark (false for a name this version does not know, as `paletteFor` draws Light). */
export function isDarkTheme(name: ThemeName): boolean {
  return THEME_IS_DARK[name] === true;
}

/**
 * Opacity of a bar-chart cup's fill (the solid rim sits on top), read as `useTheme().chartFill`.
 * 42% is a clean tint on the light papers. On the dark surface 42% turns every data colour
 * brown, so dark uses 70%: the bar keeps its colour and the cream rim still reads on top of it.
 * Butter and Honey are light papers (42%); Java is a dark one with its own value (up to 1).
 */
export const chartFillOpacity: Record<ThemeName, number> = { dark: 0.7, light: 0.42, blossom: 0.42, butter: 0.42, honey: 0.42, java: 1 };

/**
 * A six-digit hex colour at an opacity, as '#RRGGBBAA'. For a tint that matches the bar charts
 * in every theme: `withOpacity(colors.calories, useTheme().chartFill)`.
 */
export function withOpacity(hex: string, opacity: number): string {
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return `${hex.slice(0, 7)}${a.toString(16).padStart(2, '0').toUpperCase()}`;
}

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/**
 * Radius rule: containers are cups (square `shoulder` on top, round base
 * below); labels (chips, segments, keys) keep small equal corners; nothing is
 * a pill and nothing is fully round. Use `cup(radius.card)` and friends for
 * containers. The plain sizes sm/md/lg/xl are small equal corners for old
 * callers; `pill` is no longer a pill (it equals `chip`).
 */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  /** @deprecated Nothing is a pill in Pour. Equals `chip`. */
  pill: 6,
  /** Top corners of every cup. */
  shoulder: 6,
  /** Cup bases. */
  card: 22,
  tile: 14,
  button: 16,
  buttonSm: 12,
  plus: 18,
  /** Equal corners for labels. */
  chip: 6,
  /** Progress tracks and bar fills. */
  track: 2,
  /** Sheets: a lid, rounded on top only. */
  sheet: 6,
} as const;

export interface CupCorners {
  borderTopLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomLeftRadius: number;
  borderBottomRightRadius: number;
}

/**
 * The cup corner: square shoulders on top, a round base below.
 *   cup(radius.card)              cards: 6 6 22 22
 *   cup(radius.button)            buttons: 6 6 16 16
 *   cup(radius.buttonSm, 5)       small buttons: 5 5 12 12
 *   cup(radius.plus, 5)           the + button: 5 5 18 18
 *   cup(radius.tile, 5)           tiles and avatars: 5 5 14 14
 * Spread it into a style: `{ ...cup(radius.card), backgroundColor: colors.surface }`.
 */
export function cup(base: number, shoulder: number = radius.shoulder): CupCorners {
  return { borderTopLeftRadius: shoulder, borderTopRightRadius: shoulder, borderBottomLeftRadius: base, borderBottomRightRadius: base };
}

/** A cup sized to a square box (icon buttons, avatars): base about a third of the side, shoulder 5 or 6. */
export function cupFor(size: number): CupCorners {
  return cup(Math.round(Math.min(radius.tile, size * 0.32)), size < 40 ? 5 : radius.shoulder);
}

/** Vessel base radius: height / 10, clamped between 11 and 20 (smaller for tiny cups so the base stays a curve, not a bowl). */
export function vesselBase(height: number, width: number = height): number {
  return Math.min(Math.max(11, height / 10), 20, width / 2.6);
}

/** The flat sheet shadow: the only shadow in the kit. */
export const sheetShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOpacity: 0.18,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: -2 },
  elevation: 12,
};

/**
 * Two families. Bricolage Grotesque (display) for headings and every numeral;
 * Hanken Grotesk (text) for body, labels, captions and buttons. Each weight is
 * its own family name, because Android does not synthesise weights.
 */
export const fonts = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  /** Bricolage: headings and big numbers. */
  displaySemibold: 'BricolageGrotesque_600SemiBold',
  display: 'BricolageGrotesque_700Bold',
  extrabold: 'BricolageGrotesque_800ExtraBold',
  /** Numerals (Bricolage), with fontVariant tabular-nums for changing numbers. */
  num: 'BricolageGrotesque_600SemiBold',
  numBold: 'BricolageGrotesque_700Bold',
} as const;

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'overline'
  | 'numXL'
  | 'numL'
  | 'numM'
  /** The small unit beside a number ("kcal", "g"): Hanken 600 13, textSecondary by default. */
  | 'unit';

export interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
  fontVariant?: 'tabular-nums'[];
}

export const typography: Record<TextVariant, TypeStyle> = {
  display: { fontFamily: fonts.extrabold, fontSize: 64, lineHeight: 60, letterSpacing: -2.24 },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.75 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.33 },
  h3: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, letterSpacing: -0.18 },
  title: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17 },
  // 12 px, the floor for any caption (rubric D6-41); the 14 px line is kept, so every block an overline heads keeps its height.
  overline: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 14, letterSpacing: 1.03, textTransform: 'uppercase' },
  numXL: { fontFamily: fonts.extrabold, fontSize: 60, lineHeight: 58, letterSpacing: -2.1, fontVariant: ['tabular-nums'] },
  numL: { fontFamily: fonts.numBold, fontSize: 30, lineHeight: 32, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  numM: { fontFamily: fonts.numBold, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
};

/** Content never stretches wider than this on tablets and web. */
export const MAX_CONTENT_WIDTH = 560;
