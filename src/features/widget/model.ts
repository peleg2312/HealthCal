/**
 * What the home-screen widget shows, from the store's state and the date: a pure function, so every
 * figure is tested (model.test.ts) and the drawing (`TodayWidget.tsx`) only places them. The numbers
 * are the ones Today shows for the same day (`computeDayFromStore`): calories left of the budget (or
 * above it), eaten of the budget, the day's water against its goal, the one-tap glass of
 * `defaultGlass`. Before set-up is finished there is nothing to count.
 */
import { defaultGlass, waterOfGoal } from '@/features/today/volume';
import { formatNumber } from '@/lib/units';
import type { Store } from '@/store';
import { computeDayFromStore } from '@/store/selectors';
import { themeNameFor, type ThemeName } from '@/theme/resolve';
import type { ISODate } from '@/types';

import type { RecentGlass } from './glass';
import type { WidgetTexts } from './layout';
import {
  addedCaption,
  eatenLine,
  glassLabel,
  glassSpoken,
  kcalSpoken,
  kcalWord,
  messageSpoken,
  rootSpoken,
  SETUP_LINE,
  SETUP_TITLE,
  UNDO_WORD,
  undoSpoken,
  waterCaption,
  waterSpoken,
  widgetDate,
} from './words';

/** The look of each drawing: the library shows `light` while the phone is light and `dark` while it is dark. */
export interface WidgetThemes {
  light: ThemeName;
  dark: ThemeName;
}

export interface WidgetDay {
  kind: 'day';
  date: ISODate;
  /** "Wed, Nov 25". */
  dateLine: string;
  kcal: {
    /** "941", the distance from the budget, never signed. */
    figure: string;
    word: 'left' | 'above';
    over: boolean;
    /** "1,219 eaten of 2,160". */
    eatenLine: string;
    eaten: number;
    budget: number;
    /** Workout calories in the budget, drawn as hatched headroom at the top of the cup. */
    headroom: number;
    spoken: string;
  };
  water: {
    /** "1.48 of 3.3 L". */
    line: string;
    caption: string;
    reached: boolean;
    ml: number;
    goalMl: number;
    spoken: string;
  };
  glass: { ml: number; label: string; spoken: string };
  /** The glass just logged from the widget, while it can be undone: its caption replaces the water caption. */
  added: { id: string; caption: string; undoSpoken: string } | null;
  spoken: string;
  themes: WidgetThemes;
}

/** A drawing with no figures: before set-up, or when the data cannot be read or a glass not saved. It opens the app. */
export interface WidgetMessage {
  kind: 'message';
  title: string;
  line: string;
  spoken: string;
  themes: WidgetThemes;
}

export type WidgetFigures = WidgetDay | WidgetMessage;

/** The looks for the stored settings: the person's look, which follows the phone only on "Match my phone". */
export function widgetThemes(s: Pick<Store, 'settings' | 'profile'>): WidgetThemes {
  // Until set-up is finished the app shows its lead look on a light phone, and so does the widget.
  const lead = !s.profile?.onboardedAt;
  return { light: themeNameFor(s.settings, 'light', lead), dark: themeNameFor(s.settings, 'dark', lead) };
}

/** A drawing with two lines of words and no figures. */
export function widgetMessage(s: Pick<Store, 'settings' | 'profile'>, title: string, line: string): WidgetMessage {
  return { kind: 'message', title, line, spoken: messageSpoken(title, line), themes: widgetThemes(s) };
}

/**
 * The widget's figures for `date` (today, read by the caller in its handler), with the glass the
 * widget may still undo (`recentWidgetGlass`).
 */
export function widgetModel(s: Store, date: ISODate, recent: RecentGlass | null = null): WidgetFigures {
  const day = computeDayFromStore(s, date);
  if (!day || !s.profile) return widgetMessage(s, SETUP_TITLE, SETUP_LINE);
  const units = s.profile.units;
  const over = day.remaining < 0;
  const eaten = Math.round(day.eaten.kcal);
  const headroom = Math.max(0, day.exerciseAdded);
  const kcalHeard = kcalSpoken(day.remaining, eaten, day.budget, headroom);
  const line = waterOfGoal(day.waterMl, day.waterGoalMl, units);
  const reached = day.waterGoalMl > 0 && day.waterMl >= day.waterGoalMl;
  const waterHeard = waterSpoken(line, reached);
  const ml = defaultGlass(s.settings.waterPresets);
  const added = recent && recent.date === date ? { id: recent.id, caption: addedCaption(recent.ml, units), undoSpoken: undoSpoken(recent.ml, units) } : null;
  return {
    kind: 'day',
    date,
    dateLine: widgetDate(date),
    kcal: {
      figure: formatNumber(Math.abs(day.remaining)),
      word: kcalWord(over),
      over,
      eatenLine: eatenLine(eaten, day.budget),
      eaten,
      budget: day.budget,
      headroom,
      spoken: kcalHeard,
    },
    water: { line, caption: waterCaption(reached), reached, ml: day.waterMl, goalMl: day.waterGoalMl, spoken: waterHeard },
    glass: { ml, label: glassLabel(ml, units), spoken: glassSpoken(ml, units) },
    added,
    spoken: rootSpoken(date, kcalHeard, waterHeard),
    themes: widgetThemes(s),
  };
}

/** The words the drawing draws for a day, as drawn (the date in capitals): what `widgetLayout` measures. */
export function widgetTexts(f: WidgetDay): WidgetTexts {
  return {
    date: f.dateLine.toUpperCase(),
    figure: f.kcal.figure,
    word: f.kcal.word,
    eaten: f.kcal.eatenLine,
    water: f.water.line,
    caption: f.added ? f.added.caption : f.water.caption,
    glass: f.glass.label,
    undo: f.added ? UNDO_WORD : null,
  };
}
