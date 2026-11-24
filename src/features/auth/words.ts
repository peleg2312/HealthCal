/**
 * "Continue with Google": every fixed string and every rule that turns a return address or an
 * error into words. Pure, so it is tested without a browser (words.test.ts). The screens only
 * place these lines (src/app/auth.tsx, src/app/welcome.tsx, GoogleButton.tsx).
 */

/** One label everywhere: it both signs in and creates an account (Google's own wording). */
export const GOOGLE_LABEL = 'Continue with Google';

/**
 * The waiting view while a Google return is exchanged for a session. Never "Email confirmed".
 * `lead` over `body` is the pattern of every wait (`WaitLines`): what is happening, then what comes of it.
 */
export const GOOGLE_WAITING = {
  title: 'Signing in with Google',
  subtitle: 'Account and sync',
  lead: 'Finishing your sign-in',
  body: 'Your plan and logs come next.',
} as const;

/**
 * Under "Check your inbox", after an email sign-up and after "Forgot password?", for everyone alike
 * (it reveals nothing about the address): an address used only with Google gets no mail.
 */
export const GOOGLE_INBOX_HINT = 'Used Google before? Go back and choose Continue with Google.';

/** The line under "Check your inbox": only while Google is offered on this screen. */
export function inboxGoogleHint(googleShown: boolean): string | null {
  return googleShown ? GOOGLE_INBOX_HINT : null;
}

/** Said in place of the button when a tap finds Google switched off since the screen was drawn. */
export const GOOGLE_OFF_NOW = 'Google sign-in is not available right now. Use your email.';

/** What a tap leads to: the Google flow, or the button gone with GOOGLE_OFF_NOW in its place. */
export function tapOutcomeWords(verdict: 'go' | 'off'): string | null {
  return verdict === 'off' ? GOOGLE_OFF_NOW : null;
}

/**
 * The waits that are not Google's, in the same pattern: a strong line, then a secondary one.
 * A reset link signs the device in within a few seconds or is called expired (RECOVERY_GRACE_MS in the screen).
 */
export const RESET_CHECKING = { title: 'Checking your reset link', body: 'This takes a few seconds.' } as const;
/** Signed in, the first sync still running: what happened, then what is happening. */
export const RESTORING = { title: 'Signed in', body: 'Bringing your plan and logs to this device.' } as const;

/**
 * At the end of the sign-in and sign-up forms, over the two links: what an account agrees to.
 * Worded for both forms (signing in uses an account as much as creating one does).
 */
export const AUTH_TERMS_LINE = 'Using an account means you accept the Terms of use and the Privacy page.';
export const AUTH_TERMS_LABEL = 'Terms of use';
export const AUTH_PRIVACY_LABEL = 'Privacy';

/** Under the sign-up form, above the terms line: what happens to the data, with a plan on this device and without. */
export function signUpDataLine(setUp: boolean): string {
  return setUp ? 'Everything you have logged on this device is uploaded to your new account.' : 'Your data is private to your account. You can export or delete it at any time.';
}

/** One name for one action: welcome, Account and the sign-in form all say "Sign in". */
export const SIGN_IN = 'Sign in';
/** Under Account's three ways in, signed out: true for a new account and for one signed in to. */
export const ACCOUNT_UPLOAD_LINE = 'What you have logged so far goes to your account.';

/** Welcome's quiet row under the two full-width ways in. */
export const WELCOME_SIGN_IN = SIGN_IN;
export const WELCOME_SIGN_IN_LABEL = 'Sign in to an existing account';
export const WELCOME_RESTORE = 'Restore a backup';

/**
 * The line under Account's title: how this account signs in, from its identities (Supabase lists one
 * per way in). Google alone, email alone, both, or plainly "Signed in" when the list is missing or
 * holds a way this app does not offer.
 */
export function signInMethodLine(identities: readonly { provider?: string | null }[] | null | undefined): string {
  const ways = new Set((identities ?? []).map((i) => i.provider));
  const google = ways.has('google');
  const email = ways.has('email');
  if (google && email) return 'Signed in with Google or email';
  if (google) return 'Signed in with Google';
  if (email) return 'Signed in with email';
  return 'Signed in';
}

/** After a Google sign-in that joined an existing email account. */
export const GOOGLE_LINKED_TOAST = 'Signed in. Google now also opens this account.';

export type GoogleProblem = 'cancelled' | 'declined' | 'unverified' | 'signupsOff' | 'notFinished' | 'offline' | 'framed' | 'unknown';

const WORDS: Record<GoogleProblem, string> = {
  cancelled: 'Google sign-in cancelled. Nothing changed.',
  declined: 'Google sign-in was not completed. Try again, or use your email.',
  unverified: 'Google has not confirmed this address yet. Confirm it with Google, or sign up with your email.',
  signupsOff: 'New accounts are paused right now. Try again later.',
  notFinished: 'That sign-in did not finish on this device. Try Continue with Google again.',
  offline: 'No connection. Check your internet and try again.',
  // The hosted preview's frame cannot leave for Google's page (src/services/viewer.ts says the same for files and the camera).
  framed: "This preview cannot open Google's sign-in. Open HealthCal in its own browser tab or in the app to do this.",
  unknown: 'Google sign-in did not work this time. Try again, or use your email.',
};

/** The words for a problem. A cancel is said in a toast; every other one under the button. */
export function googleProblemWords(problem: GoogleProblem): string {
  return WORDS[problem];
}

/** A cancel is not an error: it goes in a toast and leaves the form as it was. */
export const problemIsToast = (problem: GoogleProblem): boolean => problem === 'cancelled';

/** What a return to /auth?mode=google carries. */
export type GoogleReturn =
  | { kind: 'code'; code: string; flowId: string | null }
  | { kind: 'error'; problem: GoogleProblem }
  /** Nothing at all: the person closed the page or came back with the Back button. */
  | { kind: 'none' };

type Params = Record<string, string | string[] | undefined | null>;
const one = (v: string | string[] | undefined | null): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** The problem an error on the return address stands for (Supabase passes Google's and its own errors through). */
export function problemFromReturnError(error: string, code: string, description: string): GoogleProblem {
  const all = `${error} ${code} ${description}`.toLowerCase();
  if (/provider_email_needs_verification|unverified email|email_not_confirmed|not verified/.test(all)) return 'unverified';
  if (/signup_disabled|signups not allowed/.test(all)) return 'signupsOff';
  if (/access_denied|denied|consent/.test(all)) return 'declined';
  if (/flow_state|bad_code_verifier|code verifier|expired|invalid_grant|bad_oauth_state/.test(all)) return 'notFinished';
  return 'unknown';
}

/** Read a return from its query and fragment parameters, merged (Supabase may use either for an error). */
export function googleReturnFrom(params: Params): GoogleReturn {
  const error = one(params.error);
  const code = one(params.error_code);
  const description = one(params.error_description);
  if (error || code || description) return { kind: 'error', problem: problemFromReturnError(error, code, description) };
  const authCode = one(params.code);
  if (authCode) return { kind: 'code', code: authCode, flowId: one(params.sb_flow_id) || null };
  return { kind: 'none' };
}

/** The parameters of a URL's query and fragment together (`healthcal://auth?mode=google&code=...`, or a web address). */
export function paramsOfUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  const hash = hashAt === -1 ? '' : url.slice(hashAt + 1);
  for (const part of [hash, query]) {
    for (const [k, v] of new URLSearchParams(part)) if (!(k in out)) out[k] = v;
  }
  return out;
}

/** True for the app's own Google return link (`…/auth?mode=google…`), on a phone or on the web. */
export function isGoogleReturnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/)[0];
  return /(^|[/:])auth\/?$/.test(path) && paramsOfUrl(url).mode === 'google';
}

/** The problem an error from the code exchange or from starting the flow stands for. */
export function problemFromError(message: string | null | undefined, code?: string | null): GoogleProblem {
  const all = `${message ?? ''} ${code ?? ''}`.toLowerCase();
  if (/network|failed to fetch|fetch failed|load failed|offline|timed? ?out/.test(all)) return 'offline';
  if (/signups not allowed|signup_disabled/.test(all)) return 'signupsOff';
  if (/unverified|email_not_confirmed|needs_verification/.test(all)) return 'unverified';
  if (/verifier|flow_state|bad_code|expired|invalid|not found|pkce/.test(all)) return 'notFinished';
  return 'unknown';
}

interface IdentityLike {
  provider?: string | null;
  created_at?: string | null;
}

/**
 * The toast after a Google sign-in that joined an account first made with email and password:
 * only when the account has both ways in and the Google one is new (made within the last 10
 * minutes), so it is said once, at the sign-in that linked them, not at every later one.
 */
export function linkedToastFor(identities: readonly IdentityLike[] | null | undefined, now: number): string | null {
  const list = identities ?? [];
  const google = list.find((i) => i.provider === 'google');
  if (!google || !list.some((i) => i.provider === 'email')) return null;
  const made = google.created_at ? Date.parse(google.created_at) : NaN;
  if (!Number.isFinite(made) || now - made > 10 * 60_000) return null;
  return GOOGLE_LINKED_TOAST;
}
