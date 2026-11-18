/**
 * The app is written in English and laid out left to right. On an Android phone whose own language is
 * Hebrew or Arabic, React Native would otherwise mirror every screen (the tabs in reverse order, English
 * text against the right edge, the week strip running backwards): seen on the Android 15 emulator set
 * to he-IL, phone test run 44337190400 of 18 November 2026.
 *
 * `allowRTL(false)` is remembered by the phone and read when the app starts, so it holds from the next
 * start after this code first runs: once after an update, and once after a fresh install (the first
 * start of a new install still mirrors, because expo-localization's default allows it before any
 * JavaScript runs; `["expo-localization", { "supportsRTL": false }]` in app.json removes that at the
 * next native build). An iPhone never mirrors an app that ships no right-to-left language, and the
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
