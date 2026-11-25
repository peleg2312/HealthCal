/**
 * Android: asks the launcher to place the widget (Profile's "Home screen widget" row). The launcher
 * shows its own dialog; `true` from the library means the launcher took the request, not that the
 * person added it. A launcher that cannot place widgets from an app answers false.
 */
import { getWidgetInfo, requestPinWidget } from 'react-native-android-widget';

import { WIDGET_NAME } from './name';

export const widgetAvailable = true;

/** 'asked': the launcher's own dialog is showing. 'unsupported': this home screen cannot add it from the app. */
export async function pinTodayWidget(): Promise<'asked' | 'unsupported'> {
  try {
    return (await requestPinWidget({ widgetName: WIDGET_NAME })) ? 'asked' : 'unsupported';
  } catch (e) {
    console.warn('[widget] pin:', e instanceof Error ? e.message : e);
    return 'unsupported';
  }
}

/** How many copies of the widget are on the home screen now. */
export async function placedWidgets(): Promise<number> {
  try {
    return (await getWidgetInfo(WIDGET_NAME)).length;
  } catch {
    return 0;
  }
}
