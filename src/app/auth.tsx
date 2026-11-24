import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, Info, KeyRound, MailCheck, Smartphone, TriangleAlert } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, type TextInputInstance } from 'react-native';

import { WaitLines } from '@/components/PourWait';
import { authDemo, demoEmail, type AuthDemo } from '@/features/auth/demo';
import { clearGoogleProblem, finishGoogleCode, markReturnScreen, settleWebReturn, useGoogleFlow } from '@/features/auth/google';
import { GoogleButton, OrLine } from '@/features/auth/GoogleButton';
import { foldPush, lastWordsTogether, nameTogether } from '@/features/auth/lines';
import { useGoogleSignIn } from '@/features/auth/useGoogleSignIn';
import {
  AUTH_PRIVACY_LABEL,
  AUTH_TERMS_LABEL,
  AUTH_TERMS_LINE,
  GOOGLE_LABEL,
  GOOGLE_WAITING,
  inboxGoogleHint,
  googleProblemWords,
  googleReturnFrom,
  paramsOfUrl,
  RESET_CHECKING,
  signUpDataLine,
  type GoogleProblem,
  type GoogleReturn as GoogleArrival,
} from '@/features/auth/words';
import { FadeIn, Note } from '@/features/onboarding/components';
import { Restoring, SignInGate } from '@/features/onboarding/SignInGate';
import { breakableEmail } from '@/features/settings/format';
import { sendPasswordReset, signIn, signUp, updatePassword, useAuth, validateEmail, validatePassword } from '@/services/auth';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTextSize, useTheme } from '@/theme';
import { Avatar, Button, goBack, haptic, Header, IconButton, PressableScale, Screen, Text, TextField, toast } from '@/ui';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  signin: {
    title: 'Welcome back',
    subtitle: 'Your plan and logs come back on this device.',
    submit: 'Sign in',
  },
  signup: {
    title: 'Create your account',
    subtitle: 'Free. It backs up and syncs your data.',
    submit: 'Create account',
  },
  forgot: {
    title: 'Reset your password',
    subtitle: "We'll email you a link to choose a new one.",
    submit: 'Send reset link',
  },
};

/**
 * How this screen was opened from an email. The sign-up confirmation link comes back to
 * /auth?mode=signin: with `code` once the address is confirmed (on web the backend client then
 * signs in by itself when this browser asked for the link), or with `error_code` when the link
 * expired or was used. Read once on arrival, before the client tidies the address.
 */
type FromEmail = 'confirmed' | 'failed' | null;
function fromEmailOf(params: Record<string, string | string[] | undefined>): FromEmail {
  const hash = typeof window !== 'undefined' && typeof window.location?.hash === 'string' ? window.location.hash : '';
  if (params.error_code || params.error_description || /error_code=/.test(hash)) return 'failed';
  if (params.code) return 'confirmed';
  return null;
}

export default function Auth() {
  const params = useLocalSearchParams<{
    mode?: string;
    code?: string;
    error_code?: string;
    error_description?: string;
  }>();
  const [fromEmail] = useState<FromEmail>(() => fromEmailOf(params));
  const initial: Mode = params.mode === 'signup' ? 'signup' : params.mode === 'forgot' ? 'forgot' : 'signin';
  // Someone already signed in has nothing to do here.
  const [arrivedSignedIn, setArrivedSignedIn] = useState(() => !!useAuth.getState().session && params.mode !== 'reset');
  // A test build's picture of one view, with no backend (src/features/auth/demo.ts); never in a release.
  const demo = authDemo();
  if (demo) return <DemoView demo={demo} />;
  if (!isBackendConfigured) return <NotConfigured />;
  if (params.mode === 'reset') return <ResetPassword />;
  // Back from Google: the client may have finished the sign-in before this screen first drew, so this comes before `arrivedSignedIn`.
  if (params.mode === 'google') return <GoogleReturn params={params} />;
  if (arrivedSignedIn) return <SignInGate waitFirst={useAuth.getState().restoring} onCancelled={() => setArrivedSignedIn(false)} />;
  return <AuthForm initial={initial} fromEmail={initial === 'signin' ? fromEmail : null} />;
}

/** One view of this screen as a picture, for a test build with no backend behind it. */
function DemoView({ demo }: { demo: AuthDemo }) {
  if (demo === 'waiting') return <GoogleWaiting />;
  if (demo === 'checking') return <ResetChecking />;
  if (demo === 'restoring') return <Restoring />;
  if (demo === 'inbox') return <Inbox confirm email={demoEmail()} googleHint={inboxGoogleHint(true)} onBack={() => goBack('/welcome')} />;
  return <AuthForm initial={demo === 'signup' ? 'signup' : 'signin'} fromEmail={null} googleError={demo === 'declined' ? googleProblemWords('declined') : null} />;
}

/**
 * A new password's rule, "At least 8 characters", is its field's placeholder. From 150% text it no longer fits
 * a 320 px field, so it moves into the hint under the field, whole (`passwordRule`).
 */
const PASSWORD_RULE = 'At least 8 characters';
function passwordRule(largeText: boolean, hint: string): { placeholder?: string; hint: string } {
  return largeText ? { hint: `${PASSWORD_RULE}. ${hint}` } : { placeholder: PASSWORD_RULE, hint };
}

function AuthForm({ initial, fromEmail, googleError = null }: { initial: Mode; fromEmail: FromEmail; googleError?: string | null }) {
  const { colors, spacing } = useTheme();
  const largeText = useTextSize() >= 1.5;
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string | null;
    password?: string | null;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [done, setDone] = useState<null | 'confirm' | 'reset'>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  // Where the terms block sits and how tall the first view is, from layout: the block is never cut by the bottom of the first view (foldPush).
  const [fold, setFold] = useState(0);
  const [termsTop, setTermsTop] = useState(0);
  const [termsHeight, setTermsHeight] = useState(0);
  // The links' touch area reaches LINK_REACH px under their words, so the block counts as that much taller: a link in the first view is 44 px to touch.
  const termsPush = foldPush(termsTop, termsHeight + LINK_REACH, fold);
  // On a phone the Google flow ends here with a session; on the web the page leaves for Google and comes back to /auth?mode=google.
  const google = useGoogleSignIn({
    onSignedIn: () => setSignedIn(true),
    initialError: googleError,
  });
  // Opened from the confirmation email in the browser that asked for it: the backend client signs in by itself.
  const signedInByLink = useAuth((s) => !!s.session) && !!fromEmail && !signedIn && done === null;

  // Arriving from the confirmation email says so, in the title and the line under it.
  const arrival = mode === 'signin' && fromEmail ? fromEmail : null;
  const copy =
    arrival === 'confirmed'
      ? {
          ...COPY.signin,
          title: 'Email confirmed',
          subtitle: 'Sign in to finish. Your plan then syncs here.',
        }
      : arrival === 'failed'
        ? {
            ...COPY.signin,
            subtitle: 'That link no longer works. Sign in, or sign up again for a new one.',
          }
        : COPY[mode];

  const switchMode = (m: Mode) => {
    setMode(m);
    setFieldErrors({});
    setFormError(null);
    setPassword('');
    setShow(false);
    router.setParams({ mode: m });
  };

  const submit = async () => {
    if (busy) return;
    const emailErr = validateEmail(email);
    // Sign in only checks that a password was typed: old accounts may predate the length rule.
    const passErr = mode === 'forgot' ? null : mode === 'signup' ? validatePassword(password) : password ? null : 'Enter your password.';
    setFieldErrors({ email: emailErr, password: passErr });
    setFormError(null);
    if (emailErr || passErr) {
      haptic.warn();
      return;
    }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const r = await sendPasswordReset(email);
        if (!r.ok) return setFormError(r.message);
        setDone('reset');
        return;
      }
      const r = mode === 'signup' ? await signUp(email, password) : await signIn(email, password);
      if (!r.ok) {
        haptic.warn();
        return setFormError(r.message);
      }
      if (r.needsEmailConfirmation) {
        setDone('confirm');
        return;
      }
      haptic.success();
      setSignedIn(true);
    } catch {
      setFormError('Something went wrong on our side. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  if (signedIn || signedInByLink) {
    return (
      <SignInGate
        onCancelled={() => {
          setSignedIn(false);
          setPassword('');
          setFormError('Sign-in cancelled. Everything on this device is as it was.');
        }}
      />
    );
  }

  if (done) {
    const back = () => {
      setDone(null);
      switchMode('signin');
    };
    return <Inbox confirm={done === 'confirm'} email={email} googleHint={inboxGoogleHint(google.shown)} onBack={back} />;
  }

  return (
    <Screen
      testID="auth-screen"
      header={<Header title={copy.title} subtitle="Account and sync" onBack={() => (mode === 'forgot' && initial !== 'forgot' ? switchMode('signin') : goBack('/welcome'))} />}
      contentStyle={{ gap: spacing.xl }}
      scrollProps={{
        onLayout: (e) => setFold(Math.round(e.nativeEvent.layout.height)),
      }}
      footer={<Button title={copy.submit} testID="auth-submit" onPress={submit} loading={busy} />}>
      {/* The title is the header's; what the form is for is the line under it here. */}
      <FadeIn key={mode}>
        <Text variant="body" color="textSecondary">
          {copy.subtitle}
        </Text>
      </FadeIn>

      {/*
        Nothing a person can tap or type in is drawn until this visit knows whether Google is
        offered (the kept answer, the fresh one, or 1.5 s at most), so the button never pushes the
        email field down under someone's finger. Only a tap that finds Google switched off changes it.
      */}
      {google.ready && google.shown && mode !== 'forgot' ? (
        // The other way in, above the email form; never the primary (the footer holds that).
        <View style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.sm }}>
            <GoogleButton testID="auth-google" onPress={google.press} busy={google.busy} disabled={busy} />
            {/* Not a field error and nothing went wrong: the same neutral note welcome uses, never red, on the card surface in every look. */}
            {google.error ? (
              <Note tone="neutral" surface="card" testID="auth-google-error" icon={<Info size={18} color={colors.text} />}>
                <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
                  {google.error}
                </Text>
              </Note>
            ) : null}
          </View>
          <OrLine testID="auth-or" />
        </View>
      ) : null}
      {google.ready && google.notice && mode !== 'forgot' ? (
        <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite" testID="auth-google-off">
          {google.notice}
        </Text>
      ) : null}

      {google.ready ? (
        <>
          <View style={{ gap: spacing.lg }}>
            <TextField
              label="Email"
              testID="auth-email-input"
              // From 150% text the example no longer fits a 320 px field; the label says what goes in.
              placeholder={largeText ? undefined : 'you@example.com'}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (fieldErrors.email) setFieldErrors((e) => ({ ...e, email: null }));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              inputMode="email"
              textContentType={mode === 'signup' ? 'username' : 'emailAddress'}
              returnKeyType={mode === 'forgot' ? 'send' : 'next'}
              onSubmitEditing={() => (mode === 'forgot' ? void submit() : passwordRef.current?.focus())}
              editable={!busy}
              error={fieldErrors.email}
            />
            {mode !== 'forgot' ? (
              <View style={{ gap: spacing.sm }}>
                <TextField
                  // TextField forwards unknown props (React 19 passes ref as a prop) to its TextInput.
                  {...({ ref: passwordRef } as object)}
                  label="Password"
                  testID="auth-password-input"
                  {...(mode === 'signup' ? passwordRule(largeText, 'A short phrase is easy to remember.') : { placeholder: largeText ? undefined : 'Your password' })}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (fieldErrors.password) setFieldErrors((e) => ({ ...e, password: null }));
                  }}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'signup' ? 'newPassword' : 'password'}
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  editable={!busy}
                  error={fieldErrors.password}
                  right={
                    <IconButton tone="clear" size={36} accessibilityLabel={show ? 'Hide password' : 'Show password'} testID="auth-password-toggle" onPress={() => setShow((s) => !s)}>
                      {show ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
                    </IconButton>
                  }
                />
                {/* An error from the server sits right under the fields it is about, not in a box of its own. */}
                <FormError message={formError} testID="auth-error" />
                {mode === 'signin' ? (
                  <Text
                    variant="label"
                    color="text"
                    accessibilityRole="button"
                    onPress={() => switchMode('forgot')}
                    testID="auth-forgot"
                    style={{
                      alignSelf: 'flex-end',
                      paddingVertical: spacing.sm,
                      textDecorationLine: 'underline',
                    }}>
                    Forgot password?
                  </Text>
                ) : null}
              </View>
            ) : (
              <FormError message={formError} testID="auth-error" />
            )}
          </View>

          {mode !== 'forgot' ? (
            // The other way in, below the form: the footer holds the one action.
            <Button
              title={mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              variant="ghost"
              size="md"
              testID="auth-switch-mode"
              disabled={busy}
              onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            />
          ) : null}

          {/*
            The end of the form is one quiet, centred block of captions: what happens to the data (sign-up),
            what an account agrees to, and the two pages as underlined ink links. The only bold link on the
            form is the one above, which switches form.
          */}
          {mode === 'signup' ? (
            <Text variant="caption" color="textSecondary" align="center" testID="auth-data-line">
              {signUpDataLine(!!useStore.getState().profile?.onboardedAt)}
            </Text>
          ) : null}

          {mode !== 'forgot' ? (
            // Last on the page. The sentence and its links are seen together or not at all: when the bottom of
            // the first view would cut the block, it starts just under it (the padding; the block's own place
            // and height are measured without it, so the rule cannot chase itself).
            <View onLayout={(e) => setTermsTop(Math.round(e.nativeEvent.layout.y))} style={{ paddingTop: termsPush }}>
              <View onLayout={(e) => setTermsHeight(Math.round(e.nativeEvent.layout.height))} style={{ alignItems: 'center', gap: spacing.sm }}>
                <Text variant="caption" color="textSecondary" align="center" testID="auth-terms-line">
                  {AUTH_TERMS_LINE}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <LegalLink label={AUTH_TERMS_LABEL} to="/legal/terms" testID="auth-terms" />
                  <Text variant="caption" color="textSecondary" style={{ marginHorizontal: spacing.md }} accessibilityElementsHidden importantForAccessibility="no">
                    ·
                  </Text>
                  <LegalLink label={AUTH_PRIVACY_LABEL} to="/legal/privacy" testID="auth-privacy" />
                </View>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** How far a legal link's touch area reaches above and below its 17 px line of caption: 14 + 17 + 14 is the 44 px target. */
const LINK_REACH = 14;

/**
 * One of the two pages under the terms line: an underlined ink link in caption weight, like "Forgot
 * password?". Its touch area reaches LINK_REACH px past its words above and below without moving
 * anything (the kit turns `hitSlop` into a real area on the web too).
 */
function LegalLink({ label, to, testID }: { label: string; to: '/legal/terms' | '/legal/privacy'; testID: string }) {
  return (
    <PressableScale testID={testID} accessibilityRole="link" accessibilityLabel={label} hitSlop={{ top: LINK_REACH, bottom: LINK_REACH, left: 6, right: 6 }} onPress={() => router.push(to as never)}>
      <Text variant="caption" color="text" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * "Check your inbox", after a sign-up that needs its address confirmed (`confirm`) and after
 * "Forgot password?": a cup tile, where the link went, and what to do with it.
 */
function Inbox({ confirm, email, googleHint, onBack }: { confirm: boolean; email: string; googleHint: string | null; onBack: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Screen
      testID="auth-done"
      header={<Header title="Check your inbox" subtitle="Account and sync" onBack={onBack} />}
      contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
      footer={<Button title={confirm ? 'I confirmed, sign in' : 'Back to sign in'} testID="auth-done-continue" onPress={onBack} />}>
      <FadeIn style={{ alignItems: 'center', gap: spacing.lg }}>
        <Avatar size={72}>
          <MailCheck size={30} color={colors.text} strokeWidth={1.9} />
        </Avatar>
        {/* Two lines: where the link went, and what to do with it. */}
        <View style={{ gap: spacing.xs }}>
          <Text variant="bodyStrong" align="center" testID="auth-done-sent">
            {confirm ? `We sent a link to ${breakableEmail(email.trim())}.` : `If ${breakableEmail(email.trim())} has an account, a link is on its way.`}
          </Text>
          <Text variant="body" color="textSecondary" align="center" testID="auth-done-next">
            {lastWordsTogether(confirm ? 'Open it to confirm your email, then sign in here.' : 'Open it on this device to choose a new password.')}
          </Text>
        </View>
        {/* An address used only with Google gets no mail (a sign-up link or a reset link): the same line for everyone, so it says nothing about the address. */}
        {googleHint ? (
          // The button's name stays on one line, so the hint never ends on "Google." alone.
          <Text variant="caption" color="textSecondary" align="center" testID="auth-done-google" accessibilityLabel={googleHint}>
            {nameTogether(googleHint, GOOGLE_LABEL)}
          </Text>
        ) : null}
      </FadeIn>
    </Screen>
  );
}

/** A server's answer about the form, right under the fields it is about: a field error's colour, with a mark for those who cannot tell colours apart. */
function FormError({ message, testID }: { message: string | null; testID: string }) {
  const { colors, spacing } = useTheme();
  if (!message) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'flex-start',
      }}
      testID={testID}>
      <View style={{ paddingTop: 1 }}>
        <TriangleAlert size={16} color={colors.danger} strokeWidth={2.2} />
      </View>
      <Text variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}

/**
 * Back from Google at /auth?mode=google: with a code (the sign-in finishes here, then the sign-in
 * gate), with Google's or Supabase's error (the form, with the words under the Google button), or
 * with nothing (closed: a toast, then the form). Never says "Email confirmed". On the web the client
 * exchanged the code as the page loaded and `settleWebReturn` reports it; on a phone the code is
 * exchanged once (`finishGoogleCode`, single-flight: the browser session, the app's link handler
 * and this screen may all deliver the same link).
 */
function GoogleReturn({ params }: { params: Record<string, string | string[] | undefined> }) {
  // Read once on arrival, before the client tidies the address (an error may sit in the fragment).
  const [arrival] = useState<GoogleArrival>(() => {
    const hash = Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.location?.hash === 'string' ? paramsOfUrl(window.location.hash) : {};
    return googleReturnFrom({ ...hash, ...params });
  });
  const session = useAuth((s) => !!s.session);
  const status = useGoogleFlow((s) => s.status);
  const problem = useGoogleFlow((s) => s.problem);
  const [formAgain, setFormAgain] = useState(false);

  useEffect(() => {
    markReturnScreen(true);
    if (arrival.kind === 'code') {
      if (Platform.OS === 'web') void settleWebReturn();
      else void finishGoogleCode(arrival.code, arrival.flowId);
    } else if (arrival.kind === 'none' && status !== 'working' && status !== 'done' && !useAuth.getState().session) {
      toast(googleProblemWords('cancelled'));
    }
    return () => markReturnScreen(false);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Held once seen: the flow's own state goes back to idle as soon as the form has the words.
  const [failedWith, setFailedWith] = useState<GoogleProblem | null>(arrival.kind === 'error' ? arrival.problem : null);
  if (!failedWith && status === 'failed' && problem) setFailedWith(problem);
  useEffect(() => {
    if (failedWith) clearGoogleProblem();
  }, [failedWith]);

  if (formAgain) return <AuthForm initial="signin" fromEmail={null} />;
  if (failedWith) return <AuthForm initial="signin" fromEmail={null} googleError={failedWith === 'cancelled' ? null : googleProblemWords(failedWith)} />;
  if (session) return <SignInGate onCancelled={() => setFormAgain(true)} />;
  if (arrival.kind === 'none' && status !== 'working') return <AuthForm initial="signin" fromEmail={null} />;
  return <GoogleWaiting />;
}

/** While a Google return becomes a session: the waiting cup over what is happening and what comes of it (the pattern of every wait). */
function GoogleWaiting() {
  return (
    <Screen
      testID="auth-google-waiting"
      header={<Header title={GOOGLE_WAITING.title} subtitle={GOOGLE_WAITING.subtitle} onBack={() => goBack('/welcome')} />}
      contentStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <WaitLines title={GOOGLE_WAITING.lead} body={GOOGLE_WAITING.body} cupTestID="auth-google-waiting-cup" />
    </Screen>
  );
}

/** While a reset link signs the device in (4 s at most): the same pattern. */
function ResetChecking() {
  return (
    <Screen
      testID="auth-reset-checking"
      header={<Header title="New password" subtitle="Password reset" onBack={() => goBack('/welcome')} />}
      contentStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <WaitLines title={RESET_CHECKING.title} body={RESET_CHECKING.body} cupTestID="auth-reset-checking-cup" />
    </Screen>
  );
}

/** How long a reset link may take to sign the device in before it is called expired. */
const RECOVERY_GRACE_MS = 4000;

/**
 * Arrived from a password-reset email. The link signs the device in with a
 * short-lived recovery session (`useAuth().recovery`); choosing a password
 * then continues exactly as after a sign-in.
 */
function ResetPassword() {
  const { colors, spacing } = useTheme();
  const largeText = useTextSize() >= 1.5;
  const recovery = useAuth((s) => s.recovery);
  const ready = useAuth((s) => s.ready);
  const [waited, setWaited] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{
    password?: string | null;
    confirm?: string | null;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [doneReset, setDoneReset] = useState(false);
  const confirmRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setWaited(true), RECOVERY_GRACE_MS);
    return () => clearTimeout(t);
  }, [ready]);

  if (doneReset) return <SignInGate onCancelled={() => router.replace('/auth?mode=signin')} />;

  if (!recovery) {
    if (!waited) return <ResetChecking />;
    return (
      <Screen
        testID="auth-reset-expired"
        header={<Header title="Link no longer works" subtitle="Password reset" onBack={() => goBack('/welcome')} />}
        contentStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          gap: spacing.xxl,
        }}
        footer={
          <View style={{ gap: spacing.sm }}>
            <Button title="Send a new link" testID="auth-reset-resend" onPress={() => router.replace('/auth?mode=forgot')} />
            <Button title="Back to sign in" variant="ghost" size="md" testID="auth-reset-signin" onPress={() => router.replace('/auth?mode=signin')} />
          </View>
        }>
        <FadeIn style={{ alignItems: 'center', gap: spacing.lg }}>
          <Avatar size={72}>
            <KeyRound size={30} color={colors.warningInk} strokeWidth={1.9} />
          </Avatar>
          <Text variant="body" color="textSecondary" align="center">
            A link works once, for about an hour, on the device that asked for it. Send a new one.
          </Text>
        </FadeIn>
      </Screen>
    );
  }

  const submit = async () => {
    if (busy) return;
    const pErr = validatePassword(password);
    const cErr = !pErr && confirm !== password ? 'The two passwords do not match.' : null;
    setErrors({ password: pErr, confirm: cErr });
    setFormError(null);
    if (pErr || cErr) {
      haptic.warn();
      return;
    }
    setBusy(true);
    try {
      const r = await updatePassword(password);
      if (!r.ok) {
        haptic.warn();
        return setFormError(r.message);
      }
      haptic.success();
      toast('Password updated');
      setDoneReset(true);
    } catch {
      setFormError('Something went wrong on our side. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const eye = (
    <IconButton tone="clear" size={36} accessibilityLabel={show ? 'Hide passwords' : 'Show passwords'} testID="auth-reset-toggle" onPress={() => setShow((s) => !s)}>
      {show ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
    </IconButton>
  );

  return (
    <Screen
      testID="auth-reset"
      header={<Header title="Choose a new password" subtitle="Password reset" onBack={() => goBack('/welcome')} />}
      contentStyle={{ gap: spacing.xxl }}
      footer={<Button title="Save new password" testID="auth-reset-submit" onPress={submit} loading={busy} />}>
      <FadeIn>
        <Text variant="body" color="textSecondary">
          Pick a password for next time. Your plan and logs then load as usual.
        </Text>
      </FadeIn>
      <View style={{ gap: spacing.lg }}>
        <TextField
          label="New password"
          testID="auth-reset-password"
          {...passwordRule(largeText, 'A short phrase is easy to remember.')}
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password) setErrors((e) => ({ ...e, password: null }));
          }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          editable={!busy}
          error={errors.password}
          right={eye}
        />
        <TextField
          {...({ ref: confirmRef } as object)}
          label="Confirm new password"
          testID="auth-reset-confirm"
          placeholder="Type it again"
          value={confirm}
          onChangeText={(t) => {
            setConfirm(t);
            if (errors.confirm) setErrors((e) => ({ ...e, confirm: null }));
          }}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          editable={!busy}
          error={errors.confirm}
        />
        <FormError message={formError} testID="auth-reset-error" />
      </View>
    </Screen>
  );
}

/** This build has no backend: say so plainly and point back to the app, which works fully offline. */
function NotConfigured() {
  const { colors, spacing } = useTheme();
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  return (
    <Screen
      testID="auth-not-configured"
      header={<Header title="Accounts" subtitle="Not set up in this build" onBack={() => goBack(onboarded ? '/' : '/welcome')} />}
      contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
      footer={<Button title={onboarded ? 'Back to today' : 'Set up on this device'} testID="auth-continue-local" onPress={() => router.replace(onboarded ? '/' : '/onboarding')} />}>
      <FadeIn style={{ alignItems: 'center', gap: spacing.lg }}>
        <Avatar size={72}>
          <Smartphone size={30} color={colors.text} strokeWidth={1.9} />
        </Avatar>
        <Text variant="body" color="textSecondary" align="center">
          HealthCal works fully on this device: logging, targets, trends and export. Your data is saved here and never leaves it.
        </Text>
      </FadeIn>
    </Screen>
  );
}
