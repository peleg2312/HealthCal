/** The web and the iPhone have no home-screen widget (Android's is `pin.android.ts`). */
export const widgetAvailable = false;

export async function pinTodayWidget(): Promise<'asked' | 'unsupported'> {
  return 'unsupported';
}

export async function placedWidgets(): Promise<number> {
  return 0;
}
