/**
 * The health-store adapter for this platform. Metro picks the file by its
 * extension: adapter.android.ts (Health Connect), adapter.ios.ts (Apple Health)
 * and this one for everything else (the browser), so a native health module is
 * only ever loaded on the phone it belongs to, and never in the browser.
 */
export { unsupportedAdapter as adapter } from './unsupported';
