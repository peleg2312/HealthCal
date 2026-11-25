/**
 * Android: registers the home-screen widget's task while the bundle loads. Imported by the root
 * `index.ts` before `expo-router/entry`, because a headless start (a widget tap with the app closed)
 * never evaluates a route file. The library is loaded on Android only: `register.ts` is the rest.
 */
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './taskHandler';

registerWidgetTaskHandler(widgetTaskHandler);
