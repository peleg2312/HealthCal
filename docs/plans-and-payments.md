# Plans and payments

HealthCal has a free plan and one paid plan, Plus. Everything that runs on the phone, the account, backup, sync, friends, export and the coach's two phone answers are free for good. Plus raises only what costs money each time it runs: the AI food estimate and the AI coach.

Everything here is **off** until you switch it on. With it off, every account keeps today's allowance and the app shows no plan anywhere (except to someone who still holds a paid plan: they always see it and can manage or cancel it).

## What each plan gets

| | Free | Plus |
|---|---|---|
| AI estimate units a day (a quick estimate is 1, a careful one 5) | 5 | 40 |
| AI coach questions a day | 5 | 30 |
| Coach memory sent with a question | last 3 question-and-answer pairs | last 6 pairs |

The days are counted in UTC (they start again at midnight UTC); the app says the time in the person's own clock. A careful estimate costs 5 units, so on the free plan it uses the whole day's 5; the app says so before it is tapped.

## Before real money

Do these before the first real payment. None of them is code.

1. **A support address and the seller's legal name** on the Terms and Privacy pages (`/legal/terms`, `/legal/privacy`): the contact constant in the app is empty until you give an address, and the pages show no contact line until then. The consumer rules and the payment company's review both ask for a name and a way to reach you.
2. **A written yes from the payment company for this exact product**: "software: calorie and training tracker; the paid plan is AI food photo estimates and an AI fitness chat; no medical advice, no human coaching". Polar's acceptable-use page lists "medical and health advice" as prohibited and puts AI tools under closer review, so ask before you build on it.
3. **Supabase on a plan that does not pause.** A free Supabase project pauses after a week without traffic; a paused project cannot receive the payment company's events or tell the app that someone paid.
4. Try the whole path in the provider's **sandbox** first (below, "Trying it in a sandbox").

## Switching plans on, in this order

Plans are switched on by secrets in Supabase: Dashboard > your project > Edge Functions > Secrets (`scripts/ops/provision-supabase.mjs` prints the exact page). Nothing needs a new app release.

1. **Deploy** the `billing` function and the three plan migrations (`provision-supabase.mjs` does both).
2. **Choose a payment provider and set it up** ("What a payment provider needs", below). Its file must be in `supabase/functions/billing/` first: today the test provider and Polar are built, and Polar's file has not yet been run against Polar ("Polar, step by step", below).
3. **Set the grace for earlier accounts**: `PLANS_GRACE_BEFORE` (today's date) and `PLANS_GRACE_UNTIL` (at least 30 days ahead). Without them, everyone who uses the app today drops from 40 and 30 to 5 and 5 the moment plans go on, with no warning. The app tells people in the grace "Your earlier allowance stays until Jan 31."
4. **Set `BILLING_PROVIDER`** to the provider's name, with its own secrets. Leave `BILLING_ENVIRONMENT` unset (live).
5. **Set `PLANS` to `on`.** Plans are on only when `PLANS=on` AND `BILLING_PROVIDER` names a provider the code knows with its secrets present: `PLANS=on` alone changes nothing, so nobody is cut to the free numbers while there is nothing to buy. The AI functions read the same two secrets, so all three functions agree.
6. **Run `node scripts/ops/verify-backend.mjs --via-management`.** It warns (without failing) when plans are on and the provider offers nothing to buy, and when plans are on with a provider and no grace is set.

## Switching plans off, or changing provider

**Payers keep being charged.** Setting `PLANS` to `off` changes the daily numbers back to 40 and 30 for everyone; it does not stop a single subscription at the payment company. A person who pays would then pay for nothing extra. So, before switching off:

1. In the payment company's dashboard, cancel every live subscription and refund what you owe (in full, or pro rata for the unused part, as your terms say).
2. Wait for the events to arrive (the app then shows them as Free), then set `PLANS` to `off`.

Never remove or change `BILLING_PROVIDER` while subscriptions from that provider are live: with no provider the app cannot open the provider's portal or end a plan before an account is deleted (it can only release it, below), and the old provider's events are no longer received. Cancel them first, as above. Running two providers at once is later work.

While a person still holds a paid or canceling plan, the app shows the Plan row, the plan screen and "Manage or cancel" even with plans off, so they can always cancel from inside the app.

## The grace for earlier accounts

An account created before `PLANS_GRACE_BEFORE` keeps today's allowance (40 estimate units, 30 questions, 3 pairs of memory) until `PLANS_GRACE_UNTIL`. Both must be set; either one missing means no grace at all. A date is read as the start of that day in UTC (`2027-01-31` is 31 January 00:00 UTC), or give a full instant. `provision-supabase.mjs` and `verify-backend.mjs` both warn when plans are on with a provider and no grace.

## The secrets, with their defaults

Names only here: never write a value into the repository or a chat.

| Secret | Default | What it does |
|---|---|---|
| `PLANS` | off | `on` switches plans on, together with a known `BILLING_PROVIDER`. Anything else keeps today's limits for everyone. |
| `BILLING_PROVIDER` | none | Which payment provider the server talks to. None, unknown, or missing its own secrets: plans are off, nothing can be bought and the payment webhook answers "not set up". `test` is for tests only (below). |
| `BILLING_ENVIRONMENT` | live | `sandbox` while you try the provider's sandbox. A plan counts only when it was bought in this environment, so **a sandbox or test purchase never gives Plus on a live setting**. Set it back (delete it) before real money. |
| `AI_DAILY_LIMIT` | 40 | Estimate units a day: everyone while plans are off; Plus while they are on. **0 means none** (no estimates for anyone, free included), as before plans. |
| `AI_FREE_DAILY_LIMIT` | 5 | Estimate units a day on the free plan (never above `AI_DAILY_LIMIT`). |
| `COACH_DAILY_LIMIT` | 30 | Coach questions a day: everyone while plans are off; Plus while they are on. |
| `COACH_FREE_DAILY_LIMIT` | 5 | Coach questions a day on the free plan (never above `COACH_DAILY_LIMIT`). |
| `AI_GLOBAL_DAILY_LIMIT` | 3000 | The whole project's units a day for everything that is not Plus (the spending ceiling). **0 means no estimates at all**, as before plans (the coach keeps its own ceiling). |
| `COACH_GLOBAL_LIMIT` | 1000 | The ceiling a free or plans-off coach question stops at (counted in the same daily row as the estimates). |
| `AI_GLOBAL_PAID_EXTRA` | two thirds of `AI_GLOBAL_DAILY_LIMIT` (2,000) | How far above everything free traffic can reach a Plus estimate may go. |
| `COACH_GLOBAL_PAID_EXTRA` | one sixth of the higher of `AI_GLOBAL_DAILY_LIMIT` and `COACH_GLOBAL_LIMIT` (500) | The same for a Plus coach question. Taken from what free traffic can reach, so with `AI_GLOBAL_DAILY_LIMIT=0` a Plus question still has room (167) above the free coach ceiling. |
| `PLANS_GRACE_BEFORE` | none | A date (`2026-11-24`) or instant. Accounts created before it keep today's allowance... |
| `PLANS_GRACE_UNTIL` | none | ...until this date. Both must be set for a grace. |
| `BILLING_SITE_URL` | none | Your own web address, if the web app has one besides `https://healthcal.expo.app` (https only). A checkout may only return to the app's own addresses. |
| `BILLING_ALLOW_LOCALHOST` | off | `on` lets a checkout return to `http://localhost` (development only). |
| `BILLING_TEST_SECRET` | none | The test provider's signing secret, at least 16 characters. The test provider also needs `BILLING_ENVIRONMENT=sandbox`; without both it is refused. |
| `POLAR_ACCESS_TOKEN` | none | Polar only: the organization access token (from the same environment as `BILLING_ENVIRONMENT`: a sandbox token for the sandbox, a live one for live). At least 16 characters. **Secret.** |
| `POLAR_WEBHOOK_SECRET` | none | Polar only: the webhook endpoint's `whsec_...` secret. At least 16 characters. **Secret.** |
| `POLAR_PRODUCT_MONTH`, `POLAR_PRODUCT_YEAR` | none | Polar only: the ids (UUIDs) of the monthly and yearly Plus products. At least one; each one given must be a UUID. Not secret, but typed in the same place. |

An empty value, or one that is not a whole number (a typo, a decimal, a negative number), means the default, never 0. `0` is read as 0 only for `AI_DAILY_LIMIT`, `AI_GLOBAL_DAILY_LIMIT` (both: **0 switches estimates off** for everyone), `AI_FREE_DAILY_LIMIT` (no estimates on the free plan) and the two extras (no room above free traffic). The coach's own numbers must be above 0 (as before plans); a 0 there means the default.

## What the AI can cost at most

Both AI functions count in one shared row a day: an estimate adds its units (1 or 5), a coach question adds 1. Calls that are not Plus stop at 3,000 (`AI_GLOBAL_DAILY_LIMIT`; free coach questions at 1,000). A Plus call may go above everything free calls can reach (the higher of those two ceilings): Plus estimates to 3,000 + 2,000 = 5,000, Plus questions to 3,000 + 500 = 3,500. So a busy free day never blocks someone who pays.

The most the row can hold in one day is therefore **5,000 units with plans on** (3,000 with plans off). No unit costs more than about $0.0013 at the measured prices (the longest coach question in Hebrew is $0.0013; a careful photo estimate is $0.006 for 5 units, $0.0012 a unit; a quick one is $0.0004). So the true worst case is **about $6.50 a day, about $200 in a 30-day month, with plans on** (about $3.90 a day with plans off), reached only if every unit of both ceilings is used, every day, on the most expensive kind of call. Lower `AI_GLOBAL_DAILY_LIMIT` and the extras follow it, but the coach's own 1,000 stays: at 400 the extras are 267 and 167 (the coach's is a sixth of the higher free ceiling, the coach's own 1,000) and the row stops at 1,000 + 267 = 1,267 units (the higher of the two free ceilings plus the Plus extra), about $1.65 a day; lower `COACH_GLOBAL_LIMIT` to 400 as well and it stops at 667 units, about $0.87 a day. `dailyUnitCeiling` in `plans.ts` holds the arithmetic.

## Payments that fail, refunds and chargebacks

- **A failed renewal** keeps Plus for 7 days after the failed charge, never for the whole unpaid period. Polar moves a subscription to its next period before it charges for it, so its file reports the paid-through time as the start of the unpaid period and the grace as 7 days after `past_due_at` (or after the period's start when Polar does not say). A provider that gives no failure time gets the server's rule: 7 days after the period end. The status answer carries that date (`paymentGraceUntil`) and the app says it in neutral words.
- **Cancelling** keeps Plus to the end of the paid period.
- **A refund in full, or a chargeback**: Plus ends at once (`revoked`). **A partial refund** changes nothing.
- **Two subscriptions for one person** (a double checkout from two devices): keep the provider's "one subscription per customer" setting on. If two are live anyway, the provider's file keeps the newest and ends the other with a refund.
- **A person who no longer exists** (for example the account was deleted while a checkout was open, then paid): the server ends that subscription at the provider as soon as it hears of it (a webhook or a refresh), refunds its last payment (Polar's file posts the refund), and keeps a tombstone (`orphan_ended`: source, customer id, subscription id) in `billing_events`. It does this **only** when the subscription's customer carries an external id that is one of this project's user ids (a UUID) and Supabase's auth service answers that this user does not exist.
- **A subscription the server cannot match to a person** is never ended. That is: no external id (a checkout link you made by hand in the provider's dashboard), an external id that is not a user id of this project, or a moment when the auth service cannot answer. The event is recorded with what is known: a live one gets an `unmatched` tombstone (source, customer id, subscription id) for you to look at in the dashboard. When the auth service could not answer but the person is there, their row is written as usual.
- **Never point a second Supabase project at the same provider organisation's live webhooks** (a staging copy, a test project). That project does not know the live accounts, would hear "this user does not exist" for every real payer, and would end and refund their subscriptions. A staging project uses the provider's sandbox, with its own organisation and its own webhook.

## Deleting an account

The app first asks the server to end every paid plan of that person at the provider (`cancel-now`, no further charge) and deletes only when that worked. The database refuses the delete (`plan_active`) while a paid plan row is still open, so an older copy of the app, which deletes directly, cannot leave a subscription running.

After the subscriptions are ended, the same call also removes the person at the payment company: Polar's file deletes the customer by the account's id with `anonymize=true` (Polar hashes the email and name and clears the billing address; it keeps the anonymised record for past orders, as tax law asks). If that step fails, the deletion still goes ahead: the answer says `customerRemoved: false` and a `customer_kept` tombstone keeps Polar's customer id (or `external:<account id>`), so you can delete that customer by hand in Polar's dashboard.

When the payment company cannot be reached, or the plan came from a provider that is no longer set up, the app offers to delete anyway (`cancel-now` with `force`): the plan is released (marked revoked) so the account can go, a tombstone keeps the source and the provider's ids, and the app tells the person that the plan must also be cancelled at the payment company. Look for tombstones of type `released` in `billing_events` and cancel those subscriptions by hand.

## Trying it in a sandbox

1. Set `BILLING_ENVIRONMENT=sandbox` and the provider's sandbox keys, then `BILLING_PROVIDER` and `PLANS=on`.
2. Buy with the provider's test card, cancel in its portal, try a failed renewal and a refund, and delete a test account with a plan.
3. Before real money: delete `BILLING_ENVIRONMENT` (live), put the live keys in, and check that a sandbox purchase from step 2 no longer shows as Plus.

## What the server stores

Only whether a plan is active and until when. No card, no address, no price paid; the payment company keeps those.

- `billing_entitlements`: one row per person and source: the provider's customer and subscription ids, the product, the period (month or year), the state (active, trialing, in_grace, past_due, canceling, expired, revoked), the paid-through time, a failed renewal's grace end, whether it ends at the period end, sandbox or live, when the subscription started, and the provider's own time for that state.
- `billing_events`: the ids of payment events already handled, so a repeated event is applied once, and the tombstones with the source and the provider's ids: `released` (a plan let go so an account could be deleted), `orphan_ended` (ended and refunded, its person gone), `unmatched` (a live subscription no person could be matched to, left alone) and `customer_kept` (a customer record the provider could not delete). When an account is deleted these stay, without the person.
- `billing_calls`: the last hour of `refresh` and `checkout` calls per person (the rate limits below); they go with the account.
- `ai_reports`: "Report this answer" in the coach: the answer as shown (up to 2,000 characters), the question only if the person ticked it (up to 500), a kind and one reason from a fixed list (`unsafe`, `wrong`, `offensive`, `off_topic`, `other`), and the time. At most 20 a day per person. Read them in the dashboard's table editor; nobody else can.

The app never reads the plan tables: it asks the `billing` function. A signed-in person can neither read nor write a plan, their own included (row-level security with no policy, and no table privileges for the app's roles; proved by `supabase/tests/billing.sql` and by `verify-backend.mjs` on the live project). The plan is never in the profile, the settings or a synced collection, and never in the export.

A plan is active when its state is active, trialing, in_grace, canceling or past_due, it was bought in this `BILLING_ENVIRONMENT`, and its grace end (or, without one, its paid-through time, plus 7 days for a failed renewal) is still ahead.

## How a payment reaches the server

1. The app asks the `billing` function for a checkout. The server makes it at the provider for the signed-in, confirmed account; the person's id comes from their sign-in, never from the browser. At most 10 checkouts an hour per person.
2. The person pays on the provider's own page and comes back to the app, which asks the server to look again (`refresh`) every 2 seconds for up to 30 seconds. The server asks the provider at most once every 2 seconds and 60 times an hour per person, and otherwise answers from its table.
3. The provider sends an event to `https://<project>.supabase.co/functions/v1/billing/webhook`. The server checks its signature over the exact bytes received (an event without one is refused before it is read), skips an event it has handled, then asks the provider for the person's current state and overwrites the row. So the order and repeats of events do not matter. If the provider cannot be asked, the event is forgotten and answered with an error, and the provider's retry handles it. A read that finds nothing marks the row expired at the row's own provider time (never the server's clock), and a read that fails changes nothing.

## What a payment provider needs

You create, in the provider's dashboard (names only; the provider shows the values):

- an account (sandbox first, then live, with your business and payout details), and the written yes above;
- one product, Plus, with two prices: monthly and yearly. The app shows the price the provider returns, so the price shown is the price charged; no price is written in the app. Say whether the price includes tax (the app adds "plus tax where it applies" when it does not);
- "one subscription per customer" on (Polar: leave "Allow multiple subscriptions" off);
- a webhook (notification destination) pointing at the address above, and its signing secret;
- the customer portal switched on (cancel, change card);
- a reminder email before a yearly renewal with the amount and how to cancel (California asks for it; do it for everyone);
- as the return address after paying: `https://healthcal.expo.app/settings/plan?checkout=done` for the web, and `healthcal://settings/plan?checkout=done` for the phones.

Then type the provider's API key and webhook secret into Supabase's secrets, set `BILLING_PROVIDER`, and run `node scripts/ops/verify-backend.mjs`.

### Adding a provider (for the developer)

A provider is one file, `supabase/functions/billing/<name>Provider.ts`, flat beside `index.ts` (the deploy uploads only the folder's own files), exporting `create<Name>Provider(env)` that returns a `BillingProvider` (`billing.ts`). Add its name to `PROVIDER_NAMES` and its required secrets to `providerNameFrom` in `plans.ts` (all three copies, which must stay identical), and its case in `providers.ts`. `testProvider.ts` is the reference. It must:

- `id`: its `source` from `SOURCES` in `plans.ts`;
- `offers()`: the prices on sale now, each `{ id, plan: 'plus', period: 'month' | 'year', amount (minor units), currency (ISO 4217), taxIncluded (true, false or null) }`, cached for a few minutes;
- `createCheckout({ userId, email, offer, returnUrl })`: a hosted checkout carrying the user id (external customer id, custom data or reference) and returning `{ url }`;
- `portalUrl({ userId, customerId, returnUrl })`: a one-time link to its customer portal;
- `cancelNow({ userId, customerId, subscriptionId, refund })`: end **every** subscription the provider holds for that person now, no further charge; with `refund: true` (an orphan, always) also refund each one's last payment where the provider allows it; `userId` may be null (find them by `customerId`); nothing to end is not an error;
- optionally `forgetCustomer({ userId, customerId })`: remove (anonymise) the person's customer record after an account deletion; nothing to remove is not an error;
- `readState({ userId, customerId })`: the person's current subscription as a `ProviderState`, or null when there is none. The mapping: a refund in full of the current period or a chargeback is `revoked` (read the provider's order or refund record, not only the subscription's status, which can stay "active"); a partial refund changes nothing; a failed renewal is `past_due` with the provider's grace in `graceUntil` when it has one; cancelled at period end is `canceling`; `environment` is `sandbox` or `live`; `startedAt` is when the current subscription began; with several live subscriptions, return the newest and end the others with a refund; `updatedAt` is the provider's own time;
- `signaturePresent(headers)` and `verifyWebhook(rawBody, headers, now)`: the signature check over the raw body with its timestamp tolerance, returning `{ id, type, userId, customerId }` or null.

Its tests go beside it (`<name>Provider.test.ts`) with payloads recorded from the provider's documentation. No browser test ever calls a provider. A real provider's file is marked "not yet run against the provider" until it has run against the owner's sandbox keys.

## The test provider

`BILLING_PROVIDER=test` is a provider with no company and no money: it signs its events with HMAC-SHA256 (header `healthcal-test-signature: t=<unix seconds>,v1=<hex of HMAC(secret, "<t>.<raw body>")>`, 300 seconds either way) and keeps its subscriptions in the function's memory. It runs only with `BILLING_TEST_SECRET` (16 characters or more) and `BILLING_ENVIRONMENT=sandbox`. The unit tests and the stand-in backend (`scripts/dev/mock-backend.cjs`) use it with a fixed secret. Never set it on a live project: anyone with its secret could grant Plus.

## Polar, step by step

> **This file has not yet been run against Polar.** `supabase/functions/billing/polarProvider.ts` was written from Polar's documentation of 23 November 2026 (API version 2026-10) and tested here against payloads copied from that documentation, never against Polar itself, because there is no Polar account yet. Do every step below in Polar's **sandbox** first; the list at the end says what that first run must show.

Polar (polar.sh) is a merchant of record: it is the seller on the receipt, charges the tax, handles refunds and chargebacks, and pays you out (through Stripe Connect Express; Israel is on its list of payout countries, https://polar.sh/docs/merchant-of-record/supported-countries.md).

**0. Ask first, in writing.** Polar's acceptable use policy (https://polar.sh/legal/acceptable-use-policy, effective 1 October 2026) prohibits "Medical and Health advice" and puts "AI Content Generation tools (text, image, video, voice)" and chatbot generators under "closer review" that "may not be accepted". Before building on it, email Polar's support and get a written answer to: *"HealthCal is a calorie and training tracker (software). Its paid plan, Plus, raises the daily number of AI food estimates (from a photo or a description) and of questions to an AI fitness coach. It gives no medical advice and no human coaching. Can we sell Plus through Polar?"* Keep the reply. If the answer is no, stop here: the app stays on its free plan and nothing else needs to change.

**1. A sandbox account.** Go to https://sandbox.polar.sh/start and sign up. The sandbox is a separate server with its own accounts, organizations and tokens; nothing there touches real money, and a token from one never works on the other (https://polar.sh/docs/integrate/sandbox.md). Create an **organization** (for example "HealthCal").

**2. Organization settings.**
- Settings > Subscriptions: leave **Allow multiple subscriptions** off (one subscription per customer; https://polar.sh/docs/features/subscriptions/introduction.md). If two get through anyway, the server keeps the newer one and ends the other with a refund.
- Settings > Subscriptions > Grace period for benefit revocation: any value; HealthCal does not use Polar's benefits. A failed renewal keeps Plus for 7 days after the failed charge (the server's own rule, counted from Polar's `past_due_at`), and Polar itself retries the card for up to 21 days before it ends the subscription (https://polar.sh/docs/features/subscriptions/failed-payments.md).
- Settings > Payments > Default tax behavior: **Exclusive** if you want "$3.99 plus tax" everywhere, **Inclusive** if you want the shown price to be the whole price. With the default, Location-based, the app cannot know in advance and says "plus tax where it applies" (https://polar.sh/docs/features/tax-inclusive-pricing.md).
- Customer portal: leave it on. Cancel at the end of the period is always offered there.

**3. Two products, in US dollars.** Products > New product:
- "HealthCal Plus, monthly": recurring, **every month**, fixed price **$3.99** (USD).
- "HealthCal Plus, yearly": recurring, **every year**, fixed price **$29.99** (USD).

No trial (or set one on the product; the server shows it as "trialing"). Copy each product's **ID** (a UUID, shown on the product page). The app shows the price Polar returns, so changing a price later is done in Polar only. A price in a second currency on the same product is allowed; the app shows the US dollar one.

**4. An access token.** Settings > Access Tokens > Create token (https://polar.sh/docs/integrate/oat.md). Name it "HealthCal billing", choose an expiry date and put a reminder in your calendar a week before it (an expired token makes every payment action answer "The payment service did not answer"), and tick exactly these scopes: `products:read`, `checkouts:write`, `subscriptions:read`, `subscriptions:write`, `orders:read`, `refunds:write`, `disputes:read`, `customer_sessions:write`, `customers:write` (to delete a customer when an account is deleted). Copy it once; Polar shows it only then.

**5. The webhook.** Settings > Webhooks > Add Endpoint (https://polar.sh/docs/integrate/webhooks/endpoints.md):
- URL: `{SUPABASE_URL}/functions/v1/billing/webhook`, that is `https://<your project ref>.supabase.co/functions/v1/billing/webhook`, exactly, with no trailing slash (Polar does not follow redirects).
- Format: **Raw**.
- If it asks for an API version, choose **2026-10** (the version the file speaks).
- Events: `subscription.created`, `subscription.updated` (Polar's catch-all for cancel, uncancel, renewal, past due, revoke), `order.paid`, `order.refunded`, `refund.updated`. Every event makes the server read the person's whole state again, so extra events only cost a few calls; disputes have no event of their own and are seen on the next read.
- Copy the secret (Copy Secret). It starts with `whsec_`.

**6. The secrets in Supabase, and nowhere else.** Supabase Dashboard > your project > Edge Functions > Secrets. Type each value there yourself; never paste a token or a secret into a chat, an email, a file or this repository.

| Name | Value |
|---|---|
| `POLAR_ACCESS_TOKEN` | the token from step 4 (**secret**) |
| `POLAR_WEBHOOK_SECRET` | the `whsec_...` secret from step 5 (**secret**) |
| `POLAR_PRODUCT_MONTH` | the monthly product's ID |
| `POLAR_PRODUCT_YEAR` | the yearly product's ID |
| `BILLING_ENVIRONMENT` | `sandbox` (the file then talks to `https://sandbox-api.polar.sh`) |
| `BILLING_PROVIDER` | `polar` |
| `PLANS` | `on` (set it last) |

Plans switch on only when all the Polar values are there and well formed; a missing one keeps everything off.

**7. A sandbox purchase.** Sign in to the app with a test account, open Profile > Plan and subscribe. On Polar's page pay with Stripe's test card **4242 4242 4242 4242**, any future expiry date, any CVC (https://polar.sh/docs/integrate/sandbox.md; never test with a real card on live, Polar treats that as card testing). In the sandbox Polar emails only members of your organization, so use your own address for the test account. Then try, each from a fresh test account where it matters: "Manage or cancel" and cancel in Polar's portal (the app shows Plus until the period end); refund the order in full from Polar's dashboard (Plus ends); a partial refund (nothing changes); a second checkout from another device for the same account; deleting an account with a plan (Profile > Account), then checking in Polar's dashboard that the customer is gone or anonymised; and signing up again with the same email as a new account after that deletion and subscribing (a new customer must be made, and the old one must not come back).

**8. Going live.** Polar reviews an account before its first payout. In the live dashboard (polar.sh, not the sandbox), Finance > Account lists what it needs: a product, a working checkout, identity verification (KYC) of the owner, a payout account, a product description, a reachable website and a verified support email; the first review can take up to 14 days, and Polar may ask for a 100% discount code to try the paid path itself (https://polar.sh/docs/merchant-of-record/account-reviews.md). Then repeat steps 2 to 6 in the live dashboard (new products, a new token, a new webhook, new IDs: nothing from the sandbox carries over), **delete** `BILLING_ENVIRONMENT` in Supabase (live is the default), and check that a sandbox purchase no longer shows as Plus.

**9. Keep the API version current.** The file sends `Polar-Version: 2026-10`. Polar releases a version every quarter and keeps each about nine months: 2026-10 becomes Deprecated in early January 2027 and is **removed in early April 2027**, after which every call fails (https://polar.sh/docs/api-reference/2026-10/versioning.md). Before then a developer changes `POLAR_API_VERSION` in `polarProvider.ts`, checks the new version's reference for changed fields, tries it in the sandbox, and moves the webhook endpoint to the same version.

**A subscription whose account no longer exists** is revoked at Polar as soon as the server hears of it, its last payment is refunded, and a tombstone (`orphan_ended`) is kept. This happens only when the customer's external id is one of this project's account ids and Supabase says that account is gone; a customer with no external id (a checkout link made in Polar's dashboard) is never touched (an `unmatched` tombstone is kept instead). Never send this organisation's live webhooks to a second Supabase project.

### What was checked and what was not

Every rule of the plans and of Polar's file is unit-tested (`plans.test.ts`, `billing.test.ts`, `polarProvider.test.ts`, run by `npx vitest run`), against Polar answers written from its documentation and OpenAPI document of 23 November 2026, and the SQL (tables, privileges, the call counts, the tombstones, `delete_my_account`) is tested on a local PostgreSQL (`bash scripts/dev/test-sql.sh`). Nothing has run on Supabase's own function runtime (Deno on Supabase), and nothing has ever talked to Polar, sandbox or live. The first sandbox run, in the order below, is the first real test.

**What only the first sandbox run can show** (in this order): that the token and the base address work at all (a status with two offers and their prices); that a checkout opens with the right product and comes back to `https://healthcal.expo.app/settings/plan?checkout=done` and to `healthcal://settings/plan?checkout=done` on a phone (whether Polar accepts an app's own address as a return address is not documented); that the webhook's signature verifies with the dashboard's secret; that the subscription is found by the account's id; the portal link; cancel at period end; a full and a partial refund; deleting an account with a plan, and that the customer is then deleted and anonymised (and what a new account with the same email gets); the second subscription; a failed renewal (Polar's sandbox may have no way to cause one); and a dispute (likewise).

## The plan service's contract (for the app)

`POST /functions/v1/billing` with the person's access token (`Authorization: Bearer <token>`, `apikey: <anon key>`) and a JSON body of at most 4 KB, `{ "action": ... }` (no action means `status`). Unknown fields are ignored; the person is always the token's. Every answer is JSON; a refusal is `{ "error": <code>, "message": <words>, ... }`. The types are `StatusAnswer`, `CancelAnswer` and `BILLING_MESSAGES` in `supabase/functions/billing/billing.ts`.

| Action | Body | 200 answer | Refusals |
|---|---|---|---|
| `status` | `{}` | the status (below) | |
| `refresh` | `{ "action": "refresh" }` | the status, after asking the provider again (at most once every 2 s and 60 times an hour per person; otherwise from the table) | 502 `provider_failed` |
| `checkout` | `{ "action": "checkout", "offerId": "...", "returnUrl": "..." }` | `{ "url": "<provider checkout>" }` | in this order: 409 `plans_off`, 503 `not_configured`, 400 `offer_unknown` (a malformed id), 409 `already_subscribed`, 400 `return_url_invalid`, 429 `checkout_limit` (10 an hour), 502 `provider_failed`, 400 `offer_unknown` (an id the provider does not sell) |
| `portal` | `{ "action": "portal", "returnUrl": "..." }` | `{ "url": "<provider portal>" }` | 503 `not_configured`, 400 `return_url_invalid`, 404 `nothing_to_manage`, 409 `cancel_elsewhere` (+ `source`), 502 `provider_failed` |
| `cancel-now` | `{ "action": "cancel-now" }`, or with `"force": true` | `{ "cancelled": true, "released": true, "ended": bool, "customerRemoved": bool or null }`: nothing paid keeps running, the account may be deleted (`ended`: this call ended a subscription; `customerRemoved`: the customer record at the payment company was deleted (true), could not be (false, recorded; delete anyway), or was not tried (null)). With force, when it could not be ended: `{ "cancelled": false, "released": true, "ended": false, "customerRemoved": null }`: the account may be deleted, and the person must also cancel at the payment company | without force: 503 `not_configured`, 409 `cancel_elsewhere` (+ `source`), 502 `provider_failed`: do not delete; offer "Delete anyway" (force). 500 `store_failed` with or without force |

Any action: 405 `method_not_allowed`, 401 `unauthorized`, 403 `unconfirmed`, 413 `body_too_large`, 400 `bad_body`, 400 `unknown_action`, 500 `store_failed`, 500 `internal`, 503 `not_configured` (the server itself is missing its Supabase settings).

`delete_my_account` (the database function the app calls to delete) answers the PostgREST error with message `plan_active` (code P0001) while a paid plan row is open: call `cancel-now` first.

The status:

```json
{
  "plansOn": true, "plan": "plus", "state": "canceling",
  "periodEnd": "2026-12-23T12:00:00.000Z", "cancelAtPeriodEnd": true,
  "source": "polar", "period": "year", "startedAt": "2026-11-23T12:00:00.000Z",
  "graceUntil": null, "paymentGraceUntil": null,
  "limits": { "estimates": 40, "questions": 30, "memoryPairs": 6 },
  "planLimits": {
    "free": { "estimates": 5, "questions": 5, "memoryPairs": 3 },
    "plus": { "estimates": 40, "questions": 30, "memoryPairs": 6 }
  },
  "offers": [
    { "id": "...", "plan": "plus", "period": "month", "amount": 399, "currency": "USD", "taxIncluded": false },
    { "id": "...", "plan": "plus", "period": "year", "amount": 2999, "currency": "USD", "taxIncluded": false }
  ],
  "canCheckout": false, "canManage": true
}
```

`state` is `none` with no row in this environment; `startedAt` is when the current subscription began (the 14-day withdrawal window counts from it); `graceUntil` is the earlier-account grace's end while it applies; `paymentGraceUntil` a failed renewal's grace end (state `past_due` or `in_grace`: the provider's, or period end + 7 days). `planLimits` are the free and Plus numbers from the server's own configuration, as they are with plans on (no earlier-account grace), so the plan screen's two cards hard-code nothing. While plans are off (`PLANS` not `on`, or no known provider): `plansOn: false`, `offers: []`, `canCheckout: false`, and today's limits (40, 30, 3) in `limits`; `planLimits` is still sent with the configured free and Plus numbers (what plans would give once on, not anyone's numbers now); `plan`, `state`, `periodEnd` and `canManage` still come from the person's rows, so a payer still sees and manages the plan. `canManage` and the portal use only rows of this `BILLING_ENVIRONMENT`.

A return address must be `https://healthcal.expo.app/...`, `BILLING_SITE_URL`'s origin, `healthcal://...`, or `http://localhost` / `http://127.0.0.1` when `BILLING_ALLOW_LOCALHOST=on` or the provider is `test`; never with a user name or password in it; at most 512 characters.

The limit answers of `analyze-food` and `coach-chat` (HTTP 429) keep their `error`, `message` and `remaining: 0`, and add: `limit` (the person's daily number), `plan` (`free` or `plus`; `null` while plans are off), `plansOn`, `resetsAt` (the next midnight UTC, ISO), `cost` (the units the refused call needed: 1, or 5 for a careful estimate) and, while the earlier-account grace applies, `graceUntil`. `analyze-food`'s project-ceiling answer also adds `shared: true`; the coach's is `error: "shared_limit"` as before.

## Later

- Several payment providers at once (`BILLING_PROVIDERS` as a list, so an old provider's subscribers are still read while a new one sells).
- A daily reconcile run that re-reads every open row from its provider, so a lost renewal event never drops a payer to Free.
- Store billing (Google Play and the App Store, through RevenueCat): it needs a native module and its own build channel.
- Sign in with Apple, which Apple asks for once an App Store build offers Google.
- Static HTML copies of the Terms and Privacy pages for crawlers.

## Proofs

- `supabase/functions/billing/plans.test.ts`: the limits for every plan, plans on only with a known provider (R1), the environment rule (R2), the 7-day fallback (R8), the ceilings above free traffic and 0 meaning none (R9), the grace and its edges, `activePlan` at its edges, the secrets and their defaults, the limit answers' fields with `cost`, and that the three copies of `plans.ts` are the same.
- `supabase/functions/billing/billing.test.ts`: every action, the return-address rule, the body caps, the check order of a checkout (R13), the call limits (R10), `cancel-now` with and without force (R4), rows from two sources (R3), a blank and a failed provider read (R7), the webhook (no signature, a wrong one, an expired one, a repeat, an unknown person, a person who is gone with a live subscription (R6), an order that does not matter, a failed re-read), the test provider's signature, a whole purchase, and the `--dev` rule of the provisioning script.
- `supabase/functions/coach-chat/coach.test.ts`: the coach's memory by plan, a Plus question's ceiling, and its limit words.
- `supabase/tests/billing.sql` (run by `bash scripts/dev/test-sql.sh`): no one but the service role reads or writes the plan tables; one row per source (R3); the call counts (R10); the report cap's lock (R13); `delete_my_account` refusing while a paid plan is open and going ahead once it is closed (R5); a report is filed for oneself only and never read back.
- `scripts/ops/verify-backend.mjs`: the same on the live project, plus the webhook refusing a missing or wrong signature, and the warnings above.
