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
  /** Brand accent (persimmon, raspberry in Blossom) and the text colour that sits on top of it. */
  primary: string;
  onPrimary: string;
  primarySoft: string;
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
  /** Calorie colour for text and large numbers (the calorie fill is too light to read in light and Blossom). */
  caloriesInk: string;
  /** @deprecated No gradients in Pour. Equals `surface`; kept so old callers do not break. */
  heroStart: string;
  /** @deprecated No gradients in Pour. Equals `surface`. */
  heroEnd: string;
  /** @deprecated No gradients in Pour. Equals `calories`. */
  ringEnd: string;
}

export const darkColors: ThemeColors = {
  // Warm black, not chocolate: neutral surfaces, the warmth lives in text and the persimmon accent.
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
  calories: '#FF9466',
  protein: '#F28BB8',
  carbs: '#C9D45A',
  fat: '#B8946E',
  water: '#6FB4F7',
  exercise: '#4FCDA3',
  sleep: '#B9A3F5',
  weight: '#B7C3C6',
  success: '#F6EEE3',
  warning: '#F5B83D',
  warningInk: '#F5B83D',
  danger: '#FA5863',
  overlay: '#070606B8',
  track: '#2A2927',
  vesselEmpty: '#1F1E1C',
  tabBar: '#1A1918',
  shadow: '#000000',
  rim: '#F6EEE3',
  headroom: '#4FCDA3',
  vesselEdge: '#75706A',
  caloriesInk: '#FF9466',
  heroStart: '#1F1E1C',
  heroEnd: '#1F1E1C',
  ringEnd: '#FF9466',
};

export const lightColors: ThemeColors = {
  bg: '#F4EEE5',
  bgElevated: '#FAF6F0',
  surface: '#FFFCF8',
  surfaceAlt: '#EEE6DA',
  surfacePressed: '#E4D9CA',
  border: '#E2D8CA',
  borderStrong: '#B9AB99',
  text: '#211913',
  textSecondary: '#5C5046',
  textTertiary: '#73665A',
  primary: '#BF4420',
  onPrimary: '#FFFFFF',
  primarySoft: '#BF44201A',
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
  caloriesInk: '#BF4420',
  heroStart: '#FFFCF8',
  heroEnd: '#FFFCF8',
  ringEnd: '#E2683F',
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
  textSecondary: '#6E3D54',
  textTertiary: '#8A5670',
  primary: blossom.raspberry,
  onPrimary: '#FFFFFF',
  primarySoft: blossom.blush,
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
  caloriesInk: '#B42F66',
  heroStart: '#FFFDFA',
  heroEnd: '#FFFDFA',
  ringEnd: blossom.ticklePink,
};

/**
 * Opacity of a bar-chart cup's fill (the solid rim sits on top), read as `useTheme().chartFill`.
 * 42% is a clean tint on the light papers. On the dark surface 42% turns every data colour
 * brown, so dark uses 70%: the bar keeps its colour and the cream rim still stands 3:1 off it.
 */
export const chartFillOpacity: Record<'dark' | 'light' | 'blossom', number> = { dark: 0.7, light: 0.42, blossom: 0.42 };

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
  overline: { fontFamily: fonts.bold, fontSize: 11.5, lineHeight: 14, letterSpacing: 1.03, textTransform: 'uppercase' },
  numXL: { fontFamily: fonts.extrabold, fontSize: 60, lineHeight: 58, letterSpacing: -2.1, fontVariant: ['tabular-nums'] },
  numL: { fontFamily: fonts.numBold, fontSize: 30, lineHeight: 32, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  numM: { fontFamily: fonts.numBold, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
};

/** Content never stretches wider than this on tablets and web. */
export const MAX_CONTENT_WIDTH = 560;
