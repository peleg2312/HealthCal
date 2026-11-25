/**
 * The app's entry (package.json `main`). The home-screen widget's task is registered first, while
 * the bundle loads, because a widget tap with the app closed starts the app's JavaScript without a
 * screen, and no route file runs then. On Android `register` resolves to register.android.ts; on the
 * web and the iPhone it is an empty module and the widget library is never loaded. Then the app
 * itself, which must be imported last (Expo Router's custom entry point).
 */
import './src/features/widget/register';
import 'expo-router/entry';
