/**
 * The home-screen widget's fixed names. `WIDGET_NAME` is the `name` in app.json's
 * react-native-android-widget plugin and the generated class (app.healthcal.mobile.widget.TodayWidget):
 * keep it, because a renamed widget leaves the old generated class behind (`expo prebuild` without
 * `--clean`) and removes every placed copy from people's home screens.
 */
export const WIDGET_NAME = 'TodayWidget';

/** The widget's own click actions, handled by the task (`task.ts`). */
export const ADD_GLASS = 'ADD_GLASS';
export const UNDO_GLASS = 'UNDO_GLASS';

/** Where the two halves open the app: Today for the calories, Water for the water figures. */
export const TODAY_URI = 'healthcal://';
export const WATER_URI = 'healthcal://water';
