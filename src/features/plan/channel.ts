/**
 * Where Plus can be bought from this copy of the app (ruling R15).
 *
 * The build-time value EXPO_PUBLIC_BILLING_CHANNEL says which channel the copy was made for: `web` or
 * unset (the web app, the APK, the sideloaded iPhone build) may send the person to the payment
 * company's page; a store build (`play`, `appstore`) never shows that checkout or a link to it.
 */
import { inFramedViewer } from '@/services/viewer';

export const PLAN_NAME = 'Plus';
export const PLAN_FULL_NAME = 'HealthCal Plus';
export const PLAN_ROUTE = '/settings/plan';

/** Pure: whether a channel value allows the web checkout. */
export function channelAllowsCheckout(channel: string | undefined): boolean {
  const c = (channel ?? '').trim().toLowerCase();
  return c === '' || c === 'web';
}

/** Ruling R15: this copy may show the checkout and links to it. */
export function checkoutShown(): boolean {
  return channelAllowsCheckout(process.env.EXPO_PUBLIC_BILLING_CHANNEL);
}

/** The hosted preview's frame blocks links out, so the checkout cannot open here. */
export function checkoutBlockedHere(): boolean {
  return inFramedViewer();
}
