/**
 * The app is written in English and laid out left to right. On an Android phone whose own language is
 * Hebrew or Arabic, React Native would otherwise mirror every screen (the tabs in reverse order, English
 * text against the right edge, the week strip running backwards): seen on the Android 15 emulator set
 * to he-IL, phone test run 44337190400 of 18 November 2026.
 *
 * `allowRTL(false)` is remembered by the phone and read when the app lays out its first screen. This
 * file runs when the root layout is loaded, before that, and on the same emulator a fresh install of a
 * build with this file was left to right from its first start (run 44354679253: the status bar mirrored,
 * the app not). Should a phone read the setting earlier than this code runs, it holds from the next
 * start; `["expo-localization", { "supportsRTL": false }]` in app.json would settle it natively at the
 * next native build. An iPhone never mirrors an app that ships no right-to-left language, and the
 * browser has no such switch, so both are untouched.
 *
 * Text a person or a product wrote in Hebrew still reads right to left inside its own line
 * (`isolateRtl`, `@/lib/bidi`); this is only about which side the layout starts from.
 */
import { I18nManager, Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
  } catch (e) {
    console.warn('layout direction', e);
  }
}
