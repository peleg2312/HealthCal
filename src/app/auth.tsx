import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, KeyRound, Lock, MailCheck, Smartphone, TriangleAlert } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View, type TextInputInstance } from 'react-native';

import { clearGoogleProblem, finishGoogleCode, markReturnScreen, settleWebReturn, useGoogleFlow } from '@/features/auth/google';
import { GoogleButton, OrLine } from '@/features/auth/GoogleButton';
import { useGoogleSignIn } from '@/features/auth/useGoogleSignIn';
import { GOOGLE_WAITING, inboxGoogleHint, googleProblemWords, googleReturnFrom, paramsOfUrl, type GoogleProblem, type GoogleReturn as GoogleArrival } from '@/features/auth/words';
import { FadeIn } from '@/features/onboarding/components';
import { SignInGate } from '@/features/onboarding/SignInGate';
import { breakableEmail } from '@/features/settings/format';
import { sendPasswordReset, signIn, signUp, updatePassword, useAuth, validateEmail, validatePassword } from '@/services/auth';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, goBack, haptic, Header, IconButton, Screen, Text, TextField, toast } from '@/ui';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  signin: { title: 'Welcome back', subtitle: 'Your plan and logs come back on this device.', submit: 'Sign in' },
  signup: { title: 'Create your account', subtitle: 'Free. It backs up and syncs your data.', submit: 'Create account' },
  forgot: { title: 'Reset your password', subtitle: "We'll email you a link to choose a new one.", submit: 'Send reset link' },
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
  const params = useLocalSearchParams<{ mode?: string; code?: string; error_code?: string; error_description?: string }>();
  const [fromEmail] = useState<FromEmail>(() => fromEmailOf(params));
  const initial: Mode = params.mode === 'signup' ? 'signup' : params.mode === 'forgot' ? 'forgot' : 'signin';
  // Someone already signed in has nothing to do here.
  const [arrivedSignedIn, setArrivedSignedIn] = useState(() => !!useAuth.getState().session && params.mode !== 'reset');
  if (!isBackendConfigured) return <NotConfigured />;
  if (params.mode === 'reset') return <ResetPassword />;
  // Back from Google: the client may have finished the sign-in before this screen first drew, so this comes before `arrivedSignedIn`.
  if (params.mode === 'google') return <GoogleReturn params={params} />;
  if (arrivedSignedIn) return <SignInGate waitFirst={useAuth.getState().restoring} onCancelled={() => setArrivedSignedIn(false)} />;
  return <AuthForm initial={initial} fromEmail={initial === 'signin' ? fromEmail : null} />;
}

function AuthForm({ initial, fromEmail, googleError = null }: { initial: Mode; fromEmail: FromEmail; googleError?: string | null }) {
  const { colors, spacing } = useTheme();
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [done, setDone] = useState<null | 'confirm' | 'reset'>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  // On a phone the Google flow ends here with a session; on the web the page leaves for Google and comes back to /auth?mode=google.
  const google = useGoogleSignIn({ onSignedIn: () => setSignedIn(true), initialError: googleError });
  // Opened from the confirmation email in the browser that asked for it: the backend client signs in by itself.
  const signedInByLink = useAuth((s) => !!s.session) && !!fromEmail && !signedIn && done === null;

  // Arriving from the confirmation email says so, in the title and the line under it.
  const arrival = mode === 'signin' && fromEmail ? fromEmail : null;
  const copy =
    arrival === 'confirmed'
      ? { ...COPY.signin, title: 'Email confirmed', subtitle: 'Sign in to finish. Your plan then syncs here.' }
      : arrival === 'failed'
        ? { ...COPY.signin, subtitle: 'That link no longer works. Sign in, or sign up again for a new one.' }
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
    const confirm = done === 'confirm';
    const googleHint = inboxGoogleHint(google.shown);
    return (
      <Screen
        testID="auth-done"
        header={
          <Header
            title="Check your inbox"
            subtitle="Account and sync"
            onBack={() => {
              setDone(null);
              switchMode('signin');
            }}
          />
        }
        contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
        footer={
          <Button
            title={confirm ? 'I confirmed, sign in' : 'Back to sign in'}
            testID="auth-done-continue"
            onPress={() => {
              setDone(null);
              switchMode('signin');
            }}
          />
        }>
        <FadeIn style={{ alignItems: 'center', gap: spacing.lg }}>
          <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
            <MailCheck size={40} color={colors.text} strokeWidth={1.6} />
          </View>
          {/* Two lines: where the link went, and what to do with it. */}
          <View style={{ gap: spacing.xs }}>
            <Text variant="bodyStrong" align="center" testID="auth-done-sent">
              {confirm ? `We sent a link to ${breakableEmail(email.trim())}.` : `If ${breakableEmail(email.trim())} has an account, a link is on its way.`}
            </Text>
            <Text variant="body" color="textSecondary" align="center" testID="auth-done-next">
              {confirm ? 'Open it to confirm your email, then sign in here.' : 'Open it on this device to choose a new password.'}
            </Text>
          </View>
          {/* An address used only with Google gets no mail (a sign-up link or a reset link): the same line for everyone, so it says nothing about the address. */}
          {googleHint ? (
            <Text variant="caption" color="textSecondary" align="center" testID="auth-done-google">
              {googleHint}
            </Text>
          ) : null}
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen
      testID="auth-screen"
      header={<Header title={copy.title} subtitle="Account and sync" onBack={() => (mode === 'forgot' && initial !== 'forgot' ? switchMode('signin') : goBack('/welcome'))} />}
      contentStyle={{ gap: spacing.xl }}
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
            <FormError message={google.error} testID="auth-google-error" />
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
              placeholder="you@example.com"
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
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
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
                  hint={mode === 'signup' ? 'A short phrase is easy to remember.' : undefined}
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
                    style={{ alignSelf: 'flex-end', paddingVertical: spacing.sm, textDecorationLine: 'underline' }}>
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

          {mode === 'signup' ? (
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
              <Lock size={16} color={colors.textTertiary} />
              <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
                {useStore.getState().profile?.onboardedAt
                  ? 'Everything you have logged on this device is uploaded to your new account.'
                  : 'Your data is private to your account. You can export or delete it at any time.'}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

/** A server's answer about the form, right under the fields it is about: a field error's colour, with a mark for those who cannot tell colours apart. */
function FormError({ message, testID }: { message: string | null; testID: string }) {
  const { colors, spacing } = useTheme();
  if (!message) return null;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }} testID={testID}>
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
  const { colors, spacing } = useTheme();
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
  return (
    <Screen
      testID="auth-google-waiting"
      header={<Header title={GOOGLE_WAITING.title} subtitle={GOOGLE_WAITING.subtitle} onBack={() => goBack('/welcome')} />}
      contentStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="body" color="textSecondary" align="center" accessibilityLiveRegion="polite">
        {GOOGLE_WAITING.body}
      </Text>
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
  const recovery = useAuth((s) => s.recovery);
  const ready = useAuth((s) => s.ready);
  const [waited, setWaited] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ password?: string | null; confirm?: string | null }>({});
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
    if (!waited) {
      return (
        <Screen
          testID="auth-reset-checking"
          header={<Header title="New password" subtitle="Checking your link" onBack={() => goBack('/welcome')} />}
          contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <Text variant="body" color="textSecondary" align="center">
            Checking your reset link...
          </Text>
        </Screen>
      );
    }
    return (
      <Screen
        testID="auth-reset-expired"
        header={<Header title="Link no longer works" subtitle="Password reset" onBack={() => goBack('/welcome')} />}
        contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
        footer={
          <View style={{ gap: spacing.sm }}>
            <Button title="Send a new link" testID="auth-reset-resend" onPress={() => router.replace('/auth?mode=forgot')} />
            <Button title="Back to sign in" variant="ghost" size="md" testID="auth-reset-signin" onPress={() => router.replace('/auth?mode=signin')} />
          </View>
        }>
        <FadeIn style={{ alignItems: 'center', gap: spacing.lg }}>
          <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={40} color={colors.warningInk} strokeWidth={1.6} />
          </View>
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
          placeholder="At least 8 characters"
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
          hint="A short phrase is easy to remember."
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
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <Smartphone size={40} color={colors.text} strokeWidth={1.6} />
        </View>
      </View>
      <FadeIn>
        <Text variant="body" color="textSecondary" align="center">
          HealthCal works fully on this device: logging, targets, trends and export. Your data is saved here and never leaves it.
        </Text>
      </FadeIn>
    </Screen>
  );
}
