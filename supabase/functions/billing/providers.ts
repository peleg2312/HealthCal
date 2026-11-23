/**
 * Which payment provider the billing function talks to: the secret BILLING_PROVIDER, read through
 * plans.ts `providerNameFrom`, the same rule that decides whether plans are on (so a provider the
 * billing function cannot build never switches plans on). Unset, unknown or missing its secrets means
 * no provider (the plan screen offers nothing to buy and the webhook answers 503 not_configured).
 *
 * Adding a real provider (docs/plans-and-payments.md, "Adding a provider"): write
 * `supabase/functions/billing/<name>Provider.ts` beside this file (flat: the deploy uploads only the
 * folder's own files) exporting `create<Name>Provider(env)` that returns a `BillingProvider`
 * (billing.ts) with its own `id` from SOURCES (plans.ts), add its name to PROVIDER_NAMES and its
 * required secrets to `providerNameFrom` (plans.ts, all three copies), add its case below, and give
 * it its own secrets (API key, webhook secret) read from `env`. testProvider.ts is the reference.
 */
import { APP_SITE, type BillingProvider } from './billing.ts';
import { providerNameFrom } from './plans.ts';
import { createPolarProvider, polarOptionsFrom } from './polarProvider.ts';
import { createTestMemory, createTestProvider, type TestProviderMemory } from './testProvider.ts';

/** One memory per running function instance: the test provider's whole "dashboard". */
let testMemory: TestProviderMemory | null = null;

export function providerFrom(env: (name: string) => string | undefined): BillingProvider | null {
  const name = providerNameFrom(env);
  if (name === null) {
    const asked = (env('BILLING_PROVIDER') ?? '').trim().toLowerCase();
    if (asked && asked !== 'off' && asked !== 'none') console.warn('billing: BILLING_PROVIDER is unknown or missing its secrets', asked.slice(0, 40));
    return null;
  }
  switch (name) {
    case 'test': {
      // No default secret on a deployed function: the fixed test secret would let anyone grant Plus.
      // providerNameFrom has checked it is there, long enough, and that the environment is sandbox.
      const secret = env('BILLING_TEST_SECRET') ?? '';
      testMemory ??= createTestMemory();
      return createTestProvider({
        secret,
        checkoutUrl: env('BILLING_TEST_CHECKOUT_URL') || `${APP_SITE}/settings/plan`,
        portalUrl: env('BILLING_TEST_PORTAL_URL') || `${APP_SITE}/settings/plan`,
        memory: testMemory,
      });
    }
    case 'polar': {
      // POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET, POLAR_PRODUCT_MONTH and/or POLAR_PRODUCT_YEAR
      // (plans.ts `polarSettingsFrom` has checked them); BILLING_ENVIRONMENT=sandbox talks to
      // Polar's sandbox, anything else to its live API. Not yet run against Polar.
      const options = polarOptionsFrom(env);
      return options ? createPolarProvider(options) : null;
    }
  }
}
