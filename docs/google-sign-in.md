# Turning on "Continue with Google"

The button is in the app's code, and it stays hidden until your Supabase project says Google is on
(the app asks `GET <project>/auth/v1/settings` once per launch and shows the button when it answers
`external.google: true`). That holds only for a copy of the app that has this code: until the lead
has published the version with the button (the web deploy and the over-the-air update for the
Android and iPhone apps), turning Google on changes nothing anyone can see. The lead publishes it;
you do not need to. Once it is published, everything below happens in two dashboards, Google Cloud
and Supabase: no new phone build and no change to Expo, EAS, Google Play or App Store Connect.

What the app does with it: the web app goes to Google and comes back to `/auth?mode=google`; the
Android and iPhone apps open Google in the phone's own browser and come back through the app's link
`healthcal://auth?mode=google`. Only the default scopes are asked for (`openid`, email, profile).
Nothing from the Google profile (name, picture) is copied into HealthCal. Someone who already has a
HealthCal account with the same, confirmed email address lands in that same account (Supabase links
them), with their plan and logs, and their password keeps working.

## What is secret

| Value | Where it comes from | Secret? | Where it goes |
|---|---|---|---|
| Client ID (`….apps.googleusercontent.com`) | Google Cloud, step 7 | No | Supabase's Google provider page, step 8 |
| **Client secret** | Google Cloud, the dialog shown when the client is created (step 7) | **Yes** | Pasted by you into Supabase's Google provider page, and nowhere else: not in chat, not in the repository, not in an `EXPO_PUBLIC_*` value, not in `eas.json` |
| Callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) | Supabase's Google provider page, step 1 | No | Google Cloud, step 6 |

**Your project reference** (`<project-ref>` above) is the first part of your project's address,
`https://<project-ref>.supabase.co`, and it is also in the dashboard's own address while your project
is open (`https://supabase.com/dashboard/project/<project-ref>/...`). HealthCal's is the one in
`eas.json` (`EXPO_PUBLIC_SUPABASE_URL`). The dashboard also shows it under the project's settings;
the exact name of that page could not be confirmed in Supabase's documentation.

## Before you start

- A public home page and a privacy policy (linking the terms) on a domain you can verify. Google
  needs them before the app can leave Testing mode (step 4). For the first try in Testing mode they
  are not needed yet.
- Optional, paid: a Supabase custom domain. Without one Google's screen says "to continue to
  `<project-ref>.supabase.co`" instead of HealthCal's own address. Brand verification (step 3)
  shows the app name and logo either way.

The order matters: Google shows a new client's secret in full **only once**, in the dialog that
opens when the client is created (Google's help page "Manage OAuth Clients",
https://support.google.com/cloud/answer/15549257: "you will only be able to view and download the
full client secret once, at the time of its creation"; later the console shows only its last four
characters). So open Supabase first, keep that tab open, and paste the secret into it straight from
Google's dialog.

## First, in Supabase: open the Google provider page and keep it open

1. In the Supabase dashboard, open your project, then **Authentication**, **Sign In / Providers**,
   **Google**. (Supabase's guide, https://supabase.com/docs/guides/auth/social-login/auth-google,
   calls it "the Google provider page on the Dashboard" and in one place writes "Authentication >
   Providers > Google"; the menu name "Sign In / Providers" could not be confirmed there. If your
   dashboard says "Providers", it is the same page.) The page shows the **Callback URL (for
   OAuth)**, `https://<project-ref>.supabase.co/auth/v1/callback`. Copy it, and leave this tab open.

## Then, in Google Cloud (https://console.cloud.google.com, "Google Auth Platform")

The page names below (Branding, Audience, Data Access, Clients, "Create client", "Web
application", "Authorized JavaScript origins", "Authorized redirect URIs") are the ones in
Supabase's guide above and Google's help page above.

2. Create a project, for example "HealthCal".
3. **Branding**: app name "HealthCal", a support email, the home page, privacy policy and terms
   URLs, and the authorized domains: `healthcal.expo.app` and `<project-ref>.supabase.co`. A logo is
   optional (adding one starts brand verification).
4. **Audience**: user type **External**. It starts in **Testing**: only the test users you list can
   sign in (at most 100). Add your own Google address as a test user. Later, to let everyone in, press
   **Publish app** and send the branding for verification (it can take a few business days); that is
   when the public home page and privacy policy must exist.
5. **Data Access**: `openid` (add it by hand), `…/auth/userinfo.email` and `…/auth/userinfo.profile`.
   No sensitive scopes, so no security review.
6. **Clients**, **Create client**, application type **Web application**:
   - Authorized JavaScript origins: `https://healthcal.expo.app` (and `http://localhost:8081` only
     while you test locally).
   - Authorized redirect URIs: the callback URL you copied in step 1,
     `https://<project-ref>.supabase.co/auth/v1/callback`.
   - Do **not** add `healthcal://` here: Google only ever returns to Supabase, and Supabase returns
     to the app.
7. Press **Create**. A dialog shows the **Client ID** and the **Client secret**. Do not close it yet.

## Back in Supabase, before you close Google's dialog

8. In the Google provider page from step 1: switch Google on, paste the **Client ID** and the
   **Client secret** from Google's dialog, and save. Only then close Google's dialog. Leave "Skip
   nonce check" off (named in Supabase's guide) and "Allow users without an email" off (this
   name could not be confirmed in Supabase's guide).
   If the dialog was closed before the secret was copied: open the client in Google's **Clients**
   page and press **Add secret** (Google's help page above); a new secret is shown once, in the same
   way. Paste that one into Supabase. A client holds at most two secrets; delete the unused one.
9. **URL Configuration** (under Authentication): Site URL `https://healthcal.expo.app`. Redirect
   URLs must include `healthcal://**` and `https://healthcal.expo.app/**`
   (`scripts/ops/provision-supabase.mjs` adds them when run with
   `--site-url https://healthcal.expo.app`; check they are listed).
10. Leave "Allow manual linking" off and "Confirm email" on.
11. Check it is on: once the version with the button is published, the button appears on the
    welcome screen and on the sign-in screen by itself (the app reads the setting at its next
    start). Anyone can also check `https://<project-ref>.supabase.co/auth/v1/settings` with the anon
    key as the `apikey` header: it should show `"google": true`.

## Turning it off again

Switch the provider off in the page from step 1: the button disappears at each device's next start
(a device that cannot reach the project keeps its last answer until it can; a tap on a button still
on screen checks first and says "Google sign-in is not available right now. Use your email.").

**Never switch it off without telling the people who use it first.** Someone who joined with Google
has no HealthCal password. With Google off they can still get in: on the sign-in screen they choose
"Forgot password?", enter their Google address, and set a password from the email that arrives;
after that they sign in with their email and that password. Tell them this before you switch it off
(an email to your users, or a note in the app's next update). Someone who had an email account and
later also used Google keeps their password and is not affected.

## Try it

Sign in with your test user on the web app, then on an Android phone and an iPhone. On the iPhone
the system asks "HealthCal wants to use supabase.co to sign in": that is the phone's own browser,
which Google requires (an in-app web view would be refused). Check once that a Google account can
use the AI photo estimate (it needs a confirmed address; Google's addresses arrive confirmed).

## Later: Sign in with Apple, before an App Store submission

Apple's App Review guideline 4.8 asks an app that offers a third-party sign-in such as Google to
also offer an equivalent private option, in practice Sign in with Apple. It does not apply now: the
iPhone build is installed outside the App Store, and the web and Android apps are outside Apple's
rules. It applies before the first App Store submission (and, to be safe, before external TestFlight
testing). It needs a native module (`expo-apple-authentication`), the "Sign in with Apple"
capability, a paid Apple Developer membership, a new iPhone build and the Apple provider in Supabase,
so it is a separate step with its own build.

## Testing without Google

`scripts/dev/mock-backend.cjs` stands in for Google and Supabase: `/auth/v1/settings` (Google on;
`POST /__google {"on": false}` turns it off, `{"signupDisabled": true}` pauses new accounts), a
"Choose an account" page at `/auth/v1/authorize`, and the one-time code exchange. `/__state` lists
each user's identities. `scripts/dev/e2e-backend.cjs` runs the cases in its "Google sign-in" block.
