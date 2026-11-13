/**
 * Design tokens. One source of truth for colour, type, spacing and radius.
 * Screens never hard-code a hex value; they read from `useTheme()`.
 */

export const palette = {
  lime: '#C6F26B',
  mint: '#3DE0A2',
  teal: '#12B8A6',
  sky: '#45B6FF',
  blue: '#3D7BFF',
  violet: '#9B8CFF',
  coral: '#FF7A8A',
  amber: '#FFC24B',
  orange: '#FF8B3D',
  rose: '#FF5D73',
};

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
  textTertiary: string;
  /** Brand accent and the text colour that sits on top of it. */
  primary: string;
  onPrimary: string;
  primarySoft: string;
  /** Semantic data colours, identical meaning in both themes. */
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  exercise: string;
  sleep: string;
  weight: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
  /** Empty track behind rings and bars. */
  track: string;
  tabBar: string;
  shadow: string;
  /** Gradient of the large summary card on Today. */
  heroStart: string;
  heroEnd: string;
  /** Second stop of the calorie ring gradient. */
  ringEnd: string;
}

export const darkColors: ThemeColors = {
  bg: '#0A0C10',
  bgElevated: '#0F1218',
  surface: '#151921',
  surfaceAlt: '#1C212B',
  surfacePressed: '#232936',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F4F6FA',
  textSecondary: '#A3ACBB',
  textTertiary: '#6B7485',
  primary: palette.lime,
  onPrimary: '#0B1205',
  primarySoft: 'rgba(198,242,107,0.14)',
  calories: palette.lime,
  protein: palette.coral,
  carbs: palette.amber,
  fat: palette.violet,
  water: palette.sky,
  exercise: palette.orange,
  sleep: '#7C8CFF',
  weight: palette.mint,
  success: palette.mint,
  warning: palette.amber,
  danger: palette.rose,
  overlay: 'rgba(4,6,10,0.72)',
  track: 'rgba(255,255,255,0.08)',
  tabBar: 'rgba(18,22,29,0.92)',
  shadow: '#000000',
  heroStart: '#171C25',
  heroEnd: '#11151C',
  ringEnd: palette.mint,
};

export const lightColors: ThemeColors = {
  bg: '#F5F6F8',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F4',
  surfacePressed: '#E4E7ED',
  border: 'rgba(12,18,28,0.07)',
  borderStrong: 'rgba(12,18,28,0.16)',
  text: '#0D1117',
  textSecondary: '#556070',
  textTertiary: '#8A94A3',
  primary: '#1F9D55',
  onPrimary: '#FFFFFF',
  primarySoft: 'rgba(31,157,85,0.12)',
  calories: '#1F9D55',
  protein: '#E8506A',
  carbs: '#E09A12',
  fat: '#7462E8',
  water: '#1E8FE0',
  exercise: '#E8701F',
  sleep: '#5B6BE8',
  weight: '#0FA58F',
  success: '#1F9D55',
  warning: '#D98A06',
  danger: '#DC3F57',
  overlay: 'rgba(12,18,28,0.45)',
  track: 'rgba(12,18,28,0.08)',
  tabBar: 'rgba(255,255,255,0.94)',
  shadow: '#5A6B85',
  heroStart: '#FFFFFF',
  heroEnd: '#F3F7F1',
  ringEnd: '#0FA58F',
};

/**
 * Blossom: a light theme built on a pink and champagne palette.
 *   Raspberry Rose #C43670 (primary)   Tickle Me Pink #F283AF (ring, accents)
 *   Champagne #FBF4EB (background)     Blush #FBD9E5 (soft surfaces)
 *   Cherry Blossom #FCC3D2 (pressed)   Sunset #F3CC97 (warm highlight)
 * The palette colours are used as given for surfaces and accents. Text and the
 * data colours that must stay readable on white (protein, carbs) are deeper
 * tones of the same hues.
 */
export const blossom = {
  raspberry: '#C43670',
  ticklePink: '#F283AF',
  champagne: '#FBF4EB',
  blush: '#FBD9E5',
  cherryBlossom: '#FCC3D2',
  sunset: '#F3CC97',
};

export const blossomColors: ThemeColors = {
  bg: blossom.champagne,
  bgElevated: '#FFFAF4',
  surface: '#FFFFFF',
  surfaceAlt: blossom.blush,
  surfacePressed: blossom.cherryBlossom,
  border: 'rgba(196,54,112,0.12)',
  borderStrong: 'rgba(196,54,112,0.28)',
  text: '#3B1226',
  textSecondary: '#7B4B60',
  textTertiary: '#9C7183',
  primary: blossom.raspberry,
  onPrimary: '#FFFFFF',
  primarySoft: 'rgba(196,54,112,0.12)',
  calories: blossom.raspberry,
  protein: '#E85D97',
  carbs: '#E5A04B',
  fat: '#9A7AE0',
  water: '#4A9FDD',
  exercise: '#F08A4B',
  sleep: '#8577E6',
  weight: '#2E9E97',
  success: '#2E9E6B',
  warning: '#DE8F2F',
  danger: '#D63A5E',
  overlay: 'rgba(59,18,38,0.45)',
  track: 'rgba(196,54,112,0.10)',
  tabBar: 'rgba(255,250,246,0.94)',
  shadow: '#B8527A',
  heroStart: '#FFFFFF',
  heroEnd: '#FDEAF0',
  ringEnd: blossom.ticklePink,
};

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

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  /** Numerals only: a semi-condensed face, so headline figures can be large without crowding. */
  num: 'BarlowSemiCondensed_600SemiBold',
  numBold: 'BarlowSemiCondensed_700Bold',
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
  | 'numM';

export const typography: Record<
  TextVariant,
  { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number }
> = {
  display: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1 },
  numXL: { fontFamily: fonts.numBold, fontSize: 56, lineHeight: 56, letterSpacing: -0.5 },
  numL: { fontFamily: fonts.numBold, fontSize: 34, lineHeight: 36, letterSpacing: -0.2 },
  numM: { fontFamily: fonts.num, fontSize: 23, lineHeight: 26, letterSpacing: 0 },
};

/** Content never stretches wider than this on tablets and web. */
export const MAX_CONTENT_WIDTH = 560;
