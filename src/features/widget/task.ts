/**
 * The widget's task: what happens when the launcher asks the widget to draw (placed, resized, the
 * scheduled refresh) or when a part of it is tapped. It runs in the app's own JavaScript (a headless
 * task when the app is closed), loads the store with the app's own loader and writes only through
 * the store. Tested with a fake drawing (task.test.ts); `taskHandler.tsx` hands it the real one.
 *
 * 1. Load: `startPersistence()` (single flight, so the app opening at the same moment shares the
 *    load). Data that cannot be read draws "Open HealthCal" and writes nothing.
 * 2. A glass (`ADD_GLASS`): on today (read here, in the handler), only after set-up, at most one per
 *    drawing and never within the one-tap guard (`acceptGlassTap`). Saved on the phone before the
 *    task ends (`flushPersistence`); a save that failed draws "Not saved" with no number, honestly.
 * 3. Undo (`UNDO_GLASS`): the glass the drawing offered, while it can be undone (`undoWidgetGlass`).
 * 4. Draw the figures (`widgetModel`). The task never syncs: the glass is marked for the next sync
 *    the app runs, and nothing here writes synced settings before a visit's first pull.
 */
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import { flushPersistence, startPersistence, useHydration } from '@/store/persistence';

import { acceptGlassTap, logWidgetGlass, recentWidgetGlass, undoWidgetGlass } from './glass';
import { widgetMessage, widgetModel, type WidgetFigures } from './model';
import { ADD_GLASS, UNDO_GLASS } from './name';
import { NOT_SAVED_LINE, NOT_SAVED_TITLE, OPEN_LINE, OPEN_TITLE } from './words';

export type WidgetAction = 'WIDGET_ADDED' | 'WIDGET_UPDATE' | 'WIDGET_RESIZED' | 'WIDGET_DELETED' | 'WIDGET_CLICK';

export interface WidgetTask {
  action: WidgetAction;
  clickAction?: string;
  clickActionData?: Record<string, unknown>;
}

/** One drawing: its figures and its own token, which the glass carries so a second tap on the same picture is known. */
export interface WidgetDrawing {
  figures: WidgetFigures;
  token: string;
}

/** What the task did, for the log and the tests. */
export type WidgetOutcome = 'drawn' | 'glass' | 'glass-ignored' | 'undone' | 'undo-refused' | 'not-saved' | 'unreadable' | 'deleted';

let drawings = 0;

/** A new drawing of `figures` with a token of its own. */
export function drawingOf(figures: WidgetFigures, now: number = Date.now()): WidgetDrawing {
  drawings += 1;
  return { figures, token: `${now.toString(36)}.${drawings}` };
}

/** The widget as it is now, read from the store (which must be loaded). */
export function currentDrawing(now: number = Date.now()): WidgetDrawing {
  const s = useStore.getState();
  const date = today();
  return drawingOf(widgetModel(s, date, recentWidgetGlass(s.water, date, now)), now);
}

/** A glass size from the click data: a whole number of ml from 1 to 2,000, else null. */
export function glassMl(data: Record<string, unknown> | undefined): number | null {
  const ml = Number(data?.ml);
  return Number.isFinite(ml) && ml >= 1 && ml <= 2000 ? Math.round(ml) : null;
}

/** Run one task and draw its result with `draw`. */
export async function handleWidgetTask(task: WidgetTask, draw: (d: WidgetDrawing) => void, clock: () => number = Date.now): Promise<WidgetOutcome> {
  if (task.action === 'WIDGET_DELETED') return 'deleted';
  await startPersistence();
  if (useHydration.getState().status !== 'ready') {
    draw(drawingOf(widgetMessage(useStore.getState(), OPEN_TITLE, OPEN_LINE), clock()));
    return 'unreadable';
  }

  let outcome: WidgetOutcome = 'drawn';
  if (task.action === 'WIDGET_CLICK' && task.clickAction === ADD_GLASS) {
    const now = clock();
    const date = today();
    const s = useStore.getState();
    const ml = glassMl(task.clickActionData);
    const token = typeof task.clickActionData?.drawing === 'string' ? task.clickActionData.drawing : null;
    if (!s.profile?.onboardedAt || ml === null || !acceptGlassTap(token, now)) {
      outcome = 'glass-ignored';
    } else {
      logWidgetGlass(date, ml, now);
      await flushPersistence();
      if (useHydration.getState().saveFailed) {
        draw(drawingOf(widgetMessage(useStore.getState(), NOT_SAVED_TITLE, NOT_SAVED_LINE), now));
        return 'not-saved';
      }
      outcome = 'glass';
    }
  } else if (task.action === 'WIDGET_CLICK' && task.clickAction === UNDO_GLASS) {
    const id = typeof task.clickActionData?.id === 'string' ? task.clickActionData.id : '';
    if (id && undoWidgetGlass(id, today(), clock())) {
      await flushPersistence();
      outcome = 'undone';
    } else {
      outcome = 'undo-refused';
    }
  }
  draw(currentDrawing(clock()));
  return outcome;
}
