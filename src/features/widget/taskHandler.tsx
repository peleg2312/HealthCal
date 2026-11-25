/**
 * The widget's headless entry, registered by `register.android.ts` while the bundle loads: the
 * launcher's events and the widget's taps arrive here, in the app's own JavaScript (started without
 * a screen when the app is closed). It runs `handleWidgetTask` with the real drawing and, after a
 * glass or an Undo, draws the other placed copies too. It imports only the store, `@/lib`, the theme
 * tokens and pure helpers, never the UI kit or a screen (imports.test.ts holds it to that).
 */
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { useHydration } from '@/store/persistence';

import { drawOtherWidgets } from './refresh';
import { handleWidgetTask, type WidgetDrawing } from './task';
import { todayWidget } from './TodayWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const started = Date.now();
  // Cold: the store was not loaded yet, so this task loads it (the app was closed, or is starting).
  const cold = useHydration.getState().status !== 'ready';
  try {
    const outcome = await handleWidgetTask(
      { action: props.widgetAction, clickAction: props.clickAction, clickActionData: props.clickActionData },
      (d: WidgetDrawing) => props.renderWidget(todayWidget(d, props.widgetInfo)),
    );
    if (outcome === 'glass' || outcome === 'undone') await drawOtherWidgets(props.widgetInfo.widgetId);
    console.log(`[widget] ${props.widgetAction}${props.clickAction ? ` ${props.clickAction}` : ''}: ${outcome} in ${Date.now() - started} ms${cold ? ' (cold)' : ''}`);
  } catch (e) {
    console.warn('[widget] task failed:', e instanceof Error ? e.message : e);
  }
}
