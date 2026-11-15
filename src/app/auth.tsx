import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, KeyRound, Lock, MailCheck, Smartphone, TriangleAlert } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { FadeIn, Note } from '@/features/onboarding/components';
import { SignInGate } from '@/features/onboarding/SignInGate';
import { breakableEmail } from '@/features/settings/format';
import { sendPasswordReset, signIn, signUp, updatePassword, useAuth, validateEmail, validatePassword } from '@/services/auth';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, goBack, haptic, Header, IconButton, Screen, Text, TextField, toast } from '@/ui';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; submit: string }> = {
  signin: { title: 'Welcome back', subtitle: 'Sign in to pick up your plan and logs on this device.', submit: 'Sign in' },
  signup: { title: 'Create your account', subtitle: 'Free, and only used to back up and sync your data. No marketing email.', submit: 'Create account' },
  forgot: { title: 'Reset your password', subtitle: "Enter your account email and we'll send a link to choose a new password.", submit: 'Send reset link' },
};

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initial: Mode = params.mode === 'signup' ? 'signup' : params.mode === 'forgot' ? 'forgot' : 'signin';
  // Someone already signed in has nothing to do here.
  const [arrivedSignedIn, setArrivedSignedIn] = useState(() => !!useAuth.getState().session && params.mode !== 'reset');
  if (!isBackendConfigured) return <NotConfigured />;
  if (params.mode === 'reset') return <ResetPassword />;
  if (arrivedSignedIn) return <SignInGate waitFirst={useAuth.getState().restoring} onCancelled={() => setArrivedSignedIn(false)} />;
  return <AuthForm initial={initial} />;
}

function AuthForm({ initial }: { initial: Mode }) {
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

  const copy = COPY[mode];

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

  if (signedIn) {
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
          <Text variant="body" color="textSecondary" align="center">
            {confirm
              ? `We sent a confirmation link to ${breakableEmail(email.trim())}. Open it on this device, then sign in. Your data stays on this device in the meantime.`
              : `If an account exists for ${breakableEmail(email.trim())}, a link to choose a new password is on its way. It can take a minute; check spam too.`}
          </Text>
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen
      testID="auth-screen"
      header={<Header title={copy.title} subtitle="Account and sync" onBack={() => (mode === 'forgot' && initial !== 'forgot' ? switchMode('signin') : goBack('/welcome'))} />}
      contentStyle={{ gap: spacing.xxl }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title={copy.submit} testID="auth-submit" onPress={submit} loading={busy} />
          {mode !== 'forgot' ? (
            <Button
              title={mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
              variant="ghost"
              size="md"
              testID="auth-switch-mode"
              disabled={busy}
              onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            />
          ) : null}
        </View>
      }>
      {/* The title is the header's; what the form is for is the line under it here. */}
      <FadeIn key={mode}>
        <Text variant="body" color="textSecondary">
          {copy.subtitle}
        </Text>
      </FadeIn>

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
              hint={mode === 'signup' ? 'At least 8 characters. A short phrase is easy to remember.' : undefined}
              right={
                <IconButton
                  tone="clear"
                  size={36}
                  accessibilityLabel={show ? 'Hide password' : 'Show password'}
                  testID="auth-password-toggle"
                  onPress={() => setShow((s) => !s)}>
                  {show ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
                </IconButton>
              }
            />
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
        ) : null}

        {formError ? (
          <Note tone="warning" icon={<TriangleAlert size={18} color={colors.warningInk} />} testID="auth-error">
            <Text variant="body" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          </Note>
        ) : null}

      </View>

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
        <Screen testID="auth-reset-checking" header={<Header title="New password" subtitle="Checking your link" onBack={() => goBack('/welcome')} />} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
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
            A link works once, for about an hour, and only on the device that asked for it. If you opened it somewhere else, or it is older, send a new one.
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
          You are signed in from the reset link. Pick a password for next time; your plan and logs then load as usual.
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
          hint="At least 8 characters. A short phrase is easy to remember."
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
        {formError ? (
          <Note tone="warning" icon={<TriangleAlert size={18} color={colors.warningInk} />} testID="auth-reset-error">
            <Text variant="body" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          </Note>
        ) : null}
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
      footer={
        <Button
          title={onboarded ? 'Back to today' : 'Set up on this device'}
          testID="auth-continue-local"
          onPress={() => router.replace(onboarded ? '/' : '/onboarding')}
        />
      }>
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
