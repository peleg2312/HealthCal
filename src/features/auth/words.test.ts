import { describe, expect, it } from 'vitest';

import { GOOGLE_SETTLE_CAP_MS, GOOGLE_TAP_CHECK_MS, googleOnFrom, googleSettled, keptGoogleOn, showGoogle, tapVerdict, type GoogleSettingState } from './googleSetting';
import {
  ACCOUNT_UPLOAD_LINE,
  AUTH_PRIVACY_LABEL,
  AUTH_TERMS_LABEL,
  AUTH_TERMS_LINE,
  GOOGLE_INBOX_HINT,
  GOOGLE_LABEL,
  GOOGLE_LINKED_TOAST,
  GOOGLE_OFF_NOW,
  GOOGLE_WAITING,
  inboxGoogleHint,
  tapOutcomeWords,
  googleProblemWords,
  googleReturnFrom,
  isGoogleReturnUrl,
  linkedToastFor,
  paramsOfUrl,
  problemFromError,
  problemIsToast,
  RESET_CHECKING,
  RESTORING,
  SIGN_IN,
  signInMethodLine,
  signUpDataLine,
  WELCOME_RESTORE,
  WELCOME_SIGN_IN,
  WELCOME_SIGN_IN_LABEL,
  type GoogleProblem,
} from './words';

const PROBLEMS: GoogleProblem[] = ['cancelled', 'declined', 'unverified', 'signupsOff', 'notFinished', 'offline', 'framed', 'unknown'];

describe('the words', () => {
  it("says each failure in the words of the sign-in reader's table", () => {
    expect(googleProblemWords('cancelled')).toBe('Google sign-in cancelled. Nothing changed.');
    expect(googleProblemWords('declined')).toBe('Google sign-in was not completed. Try again, or use your email.');
    expect(googleProblemWords('offline')).toBe('No connection. Check your internet and try again.');
    expect(googleProblemWords('notFinished')).toBe('That sign-in did not finish on this device. Try Continue with Google again.');
    expect(googleProblemWords('unverified')).toBe('Google has not confirmed this address yet. Confirm it with Google, or sign up with your email.');
    expect(googleProblemWords('signupsOff')).toBe('New accounts are paused right now. Try again later.');
    expect(GOOGLE_LINKED_TOAST).toBe('Signed in. Google now also opens this account.');
    expect(GOOGLE_INBOX_HINT).toBe('Used Google before? Go back and choose Continue with Google.');
    expect(GOOGLE_LABEL).toBe('Continue with Google');
  });

  it('is neutral: sentence case, no exclamation marks, no blame, and never "Email confirmed" while waiting', () => {
    const all = [...PROBLEMS.map(googleProblemWords), GOOGLE_LABEL, GOOGLE_INBOX_HINT, GOOGLE_LINKED_TOAST, ...Object.values(GOOGLE_WAITING)];
    for (const line of all) {
      expect(line, line).not.toMatch(/!/);
      expect(line, line).not.toMatch(/\b(failed|bad|should|great|error|oops|invalid)\b/i);
      expect(line[0], line).toBe(line[0].toUpperCase());
    }
    expect(Object.values(GOOGLE_WAITING).join(' ')).not.toMatch(/email confirmed/i);
    expect(GOOGLE_WAITING.title).toBe('Signing in with Google');
  });

  it('says a cancel in a toast and every other problem under the button', () => {
    expect(PROBLEMS.filter(problemIsToast)).toEqual(['cancelled']);
  });
});

describe('reading a return', () => {
  it('finds the code and the flow id on a phone link and on a web address', () => {
    expect(googleReturnFrom(paramsOfUrl('healthcal://auth?mode=google&code=abc-123'))).toEqual({ kind: 'code', code: 'abc-123', flowId: null });
    expect(googleReturnFrom(paramsOfUrl('https://healthcal.expo.app/auth?mode=google&sb_flow_id=f1&code=c1'))).toEqual({ kind: 'code', code: 'c1', flowId: 'f1' });
  });

  it("turns Google's and Supabase's errors into the right problem, from the query or the fragment", () => {
    const of = (url: string) => googleReturnFrom(paramsOfUrl(url));
    expect(of('healthcal://auth?mode=google&error=access_denied&error_description=The+user+denied+the+request')).toEqual({ kind: 'error', problem: 'declined' });
    expect(of('https://x/auth?mode=google#error=access_denied&error_code=provider_email_needs_verification&error_description=Unverified+email+with+google')).toEqual({ kind: 'error', problem: 'unverified' });
    expect(of('https://x/auth?mode=google&error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance')).toEqual({ kind: 'error', problem: 'signupsOff' });
    expect(of('https://x/auth?mode=google&error=invalid_request&error_code=flow_state_expired')).toEqual({ kind: 'error', problem: 'notFinished' });
    expect(of('https://x/auth?mode=google&error=server_error')).toEqual({ kind: 'error', problem: 'unknown' });
  });

  it('reads a return with nothing as closed (the Back button or Cancel)', () => {
    expect(googleReturnFrom(paramsOfUrl('healthcal://auth?mode=google'))).toEqual({ kind: 'none' });
  });

  it('knows its own return link, and nothing else', () => {
    expect(isGoogleReturnUrl('healthcal://auth?mode=google&code=1')).toBe(true);
    expect(isGoogleReturnUrl('exp://192.168.1.4:8081/--/auth?mode=google&code=1')).toBe(true);
    expect(isGoogleReturnUrl('healthcal://auth?mode=reset&code=1')).toBe(false);
    expect(isGoogleReturnUrl('healthcal://friends/add?invite=ABCD2345')).toBe(false);
    expect(isGoogleReturnUrl('healthcal://oauth?mode=google')).toBe(false);
    expect(isGoogleReturnUrl(null)).toBe(false);
  });

  it('reads exchange errors: a used or foreign code, no connection, paused sign-ups', () => {
    expect(problemFromError('code challenge does not match previously saved code verifier', 'bad_code_verifier')).toBe('notFinished');
    expect(problemFromError('PKCE code verifier not found in storage.')).toBe('notFinished');
    expect(problemFromError('Failed to fetch')).toBe('offline');
    expect(problemFromError('Signups not allowed for this instance')).toBe('signupsOff');
    expect(problemFromError('something else')).toBe('unknown');
  });
});

describe('the linked toast', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  it('is said once, at the sign-in that joined Google to an email account', () => {
    expect(linkedToastFor([{ provider: 'email', created_at: '2026-01-01T00:00:00Z' }, { provider: 'google', created_at: '2026-11-23T11:59:00Z' }], now)).toBe(GOOGLE_LINKED_TOAST);
    // Later Google sign-ins on the same account: the link is old news.
    expect(linkedToastFor([{ provider: 'email', created_at: '2026-01-01T00:00:00Z' }, { provider: 'google', created_at: '2026-11-20T08:00:00Z' }], now)).toBeNull();
    // A Google-only account, an email-only account, nothing.
    expect(linkedToastFor([{ provider: 'google', created_at: '2026-11-23T11:59:00Z' }], now)).toBeNull();
    expect(linkedToastFor([{ provider: 'email', created_at: '2026-11-23T11:59:00Z' }], now)).toBeNull();
    expect(linkedToastFor(undefined, now)).toBeNull();
  });
});

describe('is Google on', () => {
  it('reads the settings answer', () => {
    expect(googleOnFrom({ external: { email: true, google: true } })).toBe(true);
    expect(googleOnFrom({ external: { email: true, google: false } })).toBe(false);
    expect(googleOnFrom({ external: { email: true } })).toBe(false);
    expect(googleOnFrom({ message: 'Invalid API key' })).toBeNull();
    expect(googleOnFrom(null)).toBeNull();
  });

  it("shows the button on the fresh answer, else the kept one, else not at all", () => {
    expect(keptGoogleOn('1')).toBe(true);
    expect(keptGoogleOn('0')).toBe(false);
    expect(keptGoogleOn(null)).toBeNull();
    expect(showGoogle(null, null)).toBe(false);
    expect(showGoogle(null, true)).toBe(true);
    expect(showGoogle(false, true)).toBe(false);
    expect(showGoogle(true, false)).toBe(true);
  });

  const none: GoogleSettingState = { fresh: null, kept: null, keptRead: false, freshDone: false, capped: false };

  it('holds the part the button sits in until an answer is known, both reads are over, or the cap passed', () => {
    expect(googleSettled(none)).toBe(false);
    // Nothing kept, the ask still under way: keep waiting.
    expect(googleSettled({ ...none, keptRead: true })).toBe(false);
    expect(googleSettled({ ...none, freshDone: true })).toBe(false);
    // A kept answer, either way, is enough to draw at once.
    expect(googleSettled({ ...none, keptRead: true, kept: true })).toBe(true);
    expect(googleSettled({ ...none, keptRead: true, kept: false })).toBe(true);
    // A fresh answer, before the kept one is read.
    expect(googleSettled({ ...none, fresh: true })).toBe(true);
    expect(googleSettled({ ...none, fresh: false })).toBe(true);
    // Nothing kept and the ask failed: no button, drawn now.
    expect(googleSettled({ ...none, keptRead: true, freshDone: true })).toBe(true);
    // The cap.
    expect(googleSettled({ ...none, capped: true })).toBe(true);
    expect(GOOGLE_SETTLE_CAP_MS).toBe(1500);
  });

  it('on a tap, says Google is off only when an answer says so', () => {
    expect(GOOGLE_TAP_CHECK_MS).toBe(2000);
    expect(tapVerdict(true, null)).toBe('go');
    expect(tapVerdict(false, null)).toBe('off');
    // No answer this launch: the tap's own answer decides; none at all carries on as before.
    expect(tapVerdict(null, false)).toBe('off');
    expect(tapVerdict(null, true)).toBe('go');
    expect(tapVerdict(null, null)).toBe('go');
  });
});

describe('the words around a tap and the sent view', () => {
  it('says Google is off in plain words, and nothing when the tap goes on', () => {
    expect(GOOGLE_OFF_NOW).toBe('Google sign-in is not available right now. Use your email.');
    expect(tapOutcomeWords('off')).toBe(GOOGLE_OFF_NOW);
    expect(tapOutcomeWords('go')).toBeNull();
  });

  it('carries the Google line under "Check your inbox" only while Google is offered', () => {
    expect(inboxGoogleHint(true)).toBe('Used Google before? Go back and choose Continue with Google.');
    expect(inboxGoogleHint(false)).toBeNull();
  });
});

describe('the words of this round: the waits, the terms line, how an account signs in', () => {
  const NEW = [
    RESET_CHECKING.title,
    RESET_CHECKING.body,
    RESTORING.title,
    RESTORING.body,
    GOOGLE_WAITING.lead,
    GOOGLE_WAITING.body,
    AUTH_TERMS_LINE,
    AUTH_TERMS_LABEL,
    AUTH_PRIVACY_LABEL,
    signUpDataLine(true),
    signUpDataLine(false),
    ACCOUNT_UPLOAD_LINE,
    SIGN_IN,
    WELCOME_SIGN_IN,
    WELCOME_SIGN_IN_LABEL,
    WELCOME_RESTORE,
  ];

  it('are sentence case, with no exclamation mark, no ellipsis and none of the banned words', () => {
    for (const line of NEW) {
      expect(line, line).toMatch(/^[A-Z]/);
      expect(line, line).not.toMatch(/!|\.\.\.|…/);
      expect(line, line).not.toMatch(/\b(oops|sorry|unfortunately|should|must|only|great|failed|bad)\b/i);
    }
  });

  it('says what an account agrees to with the names of the two pages, in words that fit sign-in and sign-up alike', () => {
    expect(AUTH_TERMS_LINE).toBe('Using an account means you accept the Terms of use and the Privacy page.');
    expect(AUTH_TERMS_LINE).toContain(AUTH_TERMS_LABEL);
    expect(AUTH_TERMS_LINE).toContain(AUTH_PRIVACY_LABEL);
    // On "Welcome back" nobody is creating anything.
    expect(AUTH_TERMS_LINE).not.toMatch(/creat/i);
  });

  it('gives the three waits one pattern: a strong line with no full stop over one short sentence', () => {
    const waits = [
      { title: GOOGLE_WAITING.lead, body: GOOGLE_WAITING.body },
      { title: RESET_CHECKING.title, body: RESET_CHECKING.body },
      { title: RESTORING.title, body: RESTORING.body },
    ];
    expect(waits.map((w) => w.title)).toEqual(['Finishing your sign-in', 'Checking your reset link', 'Signed in']);
    expect(waits.map((w) => w.body)).toEqual(['Your plan and logs come next.', 'This takes a few seconds.', 'Bringing your plan and logs to this device.']);
    for (const w of waits) {
      expect(w.title, w.title).not.toMatch(/[.!?]$/);
      expect(w.body, w.body).toMatch(/^[A-Z][^.!?]*\.$/);
      expect(w.title).not.toBe(w.body);
    }
  });

  it('has one name for signing in, on welcome and on Account', () => {
    expect(SIGN_IN).toBe('Sign in');
    expect(WELCOME_SIGN_IN).toBe(SIGN_IN);
  });

  it('says what happens to the data under the sign-up form, with a plan on this device and without', () => {
    expect(signUpDataLine(true)).toBe('Everything you have logged on this device is uploaded to your new account.');
    expect(signUpDataLine(false)).toBe('Your data is private to your account. You can export or delete it at any time.');
    expect(ACCOUNT_UPLOAD_LINE).toBe('What you have logged so far goes to your account.');
  });

  it('names how the account signs in: Google, email, both, or plainly signed in', () => {
    expect(signInMethodLine([{ provider: 'google' }])).toBe('Signed in with Google');
    expect(signInMethodLine([{ provider: 'email' }])).toBe('Signed in with email');
    expect(signInMethodLine([{ provider: 'email' }, { provider: 'google' }])).toBe('Signed in with Google or email');
    expect(signInMethodLine([])).toBe('Signed in');
    expect(signInMethodLine(null)).toBe('Signed in');
    expect(signInMethodLine(undefined)).toBe('Signed in');
    // A way in this app does not offer is not named.
    expect(signInMethodLine([{ provider: 'apple' }])).toBe('Signed in');
    expect(signInMethodLine([{ provider: null }, { provider: 'google' }])).toBe('Signed in with Google');
  });
});
