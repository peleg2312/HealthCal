/**
 * The health-store adapter for this platform. Metro picks the file by its
 * extension: adapter.android.ts (Health Connect), adapter.ios.ts (Apple Health,
 * not built yet), and this one for everything else (the browser), so the native
 * module is only ever loaded on Android.
 */
export { unsupportedAdapter as adapter } from './unsupported';
