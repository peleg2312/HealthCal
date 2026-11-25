/**
 * Android: keeps the placed widgets drawing what the app holds. Started from the root layout once
 * the app is ready (`startWidgetRefresh`): it draws every placed copy after a change in the store
 * (1.5 s after the last one, as the reminders are rebuilt), when the app leaves the front, and at
 * the next local midnight while the app stays open, so the widget shows the new day. Without the
 * app, the launcher's schedule (app.json's `updatePeriodMillis`) and the widget's own taps draw it.
 * A sign-out or an erase is a store change too: the widget then shows "Set up HealthCal".
 */
import { AppState } from 'react-native';
import { getWidgetInfo, requestWidgetUpdate, requestWidgetUpdateById } from 'react-native-android-widget';

import { useStore } from '@/store';
import { useHydration } from '@/store/persistence';

import { untilMidnight } from './midnight';
import { WIDGET_NAME } from './name';
import { currentDrawing } from './task';
import { todayWidget } from './TodayWidget';

const DEBOUNCE_MS = 1500;

function warn(where: string, e: unknown) {
  console.warn(`[widget] ${where}:`, e instanceof Error ? e.message : e);
}

/** Draw every placed widget from the store as it is now (nothing while the store is not loaded). */
export async function refreshWidgets(): Promise<void> {
  if (useHydration.getState().status !== 'ready') return;
  try {
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => todayWidget(currentDrawing(), info) });
  } catch (e) {
    warn('refresh', e);
  }
}

/** Draw every placed widget but `exceptId`, which the task has just drawn. */
export async function drawOtherWidgets(exceptId: number): Promise<void> {
  try {
    const placed = await getWidgetInfo(WIDGET_NAME);
    for (const info of placed) {
      if (info.widgetId === exceptId) continue;
      await requestWidgetUpdateById({ widgetName: WIDGET_NAME, widgetId: info.widgetId, renderWidget: (i) => todayWidget(currentDrawing(), i) });
    }
  } catch (e) {
    warn('other copies', e);
  }
}

/** Start following the store; returns the stop. */
export function startWidgetRefresh(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let midnight: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void refreshWidgets(), DEBOUNCE_MS);
  };
  const atMidnight = () => {
    midnight = setTimeout(() => {
      void refreshWidgets();
      atMidnight();
    }, untilMidnight(new Date()));
  };
  void refreshWidgets();
  atMidnight();
  const unsub = useStore.subscribe(soon);
  const app = AppState.addEventListener('change', (state) => {
    if (state !== 'active') void refreshWidgets();
  });
  return () => {
    unsub();
    app.remove();
    if (timer) clearTimeout(timer);
    if (midnight) clearTimeout(midnight);
  };
}
