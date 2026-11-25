/**
 * The web and the iPhone have no home-screen widget: nothing to keep drawn. Android's is
 * `refresh.android.ts`, which loads the widget library.
 */
export async function refreshWidgets(): Promise<void> {}

export async function drawOtherWidgets(_exceptId: number): Promise<void> {}

export function startWidgetRefresh(): () => void {
  return () => {};
}
