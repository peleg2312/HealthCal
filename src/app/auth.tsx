import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff, Lock, MailCheck, Smartphone, TriangleAlert } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { destinationAfterSignIn, waitForRestore } from '@/features/onboarding/afterSignIn';
import { BrandRings, FadeIn, Note } from '@/features/onboarding/components';
import { sendPasswordReset, signIn, signUp, useAuth, validateEmail, validatePassword } from '@/services/auth';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, goBack, haptic, Header, IconButton, Screen, Text, TextField } from '@/ui';

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
  const [arrivedSignedIn] = useState(() => !!useAuth.getState().session);
  if (!isBackendConfigured) return <NotConfigured />;
  if (arrivedSignedIn) return <Redirect href={destinationAfterSignIn()} />;
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
  const [restoring, setRestoring] = useState(false);
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
      setRestoring(true);
      await waitForRestore();
      router.replace(destinationAfterSignIn());
    } catch {
      setFormError('Something went wrong on our side. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const confirm = done === 'confirm';
    return (
      <Screen
        testID="auth-done"
        header={
          <Header
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
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <MailCheck size={34} color={colors.primary} />
          </View>
          <Text variant="h1" align="center" accessibilityRole="header">
            Check your inbox
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {confirm
              ? `We sent a confirmation link to ${email.trim()}. Open it on this device, then sign in. Your data stays on this device in the meantime.`
              : `If an account exists for ${email.trim()}, a link to choose a new password is on its way. It can take a minute; check spam too.`}
          </Text>
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen
      testID="auth-screen"
      header={<Header onBack={() => (mode === 'forgot' && initial !== 'forgot' ? switchMode('signin') : goBack('/welcome'))} />}
      contentStyle={{ gap: spacing.xxl, paddingTop: spacing.lg }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title={restoring ? 'Restoring your data' : copy.submit} testID="auth-submit" onPress={submit} loading={busy} />
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
      <FadeIn key={mode} style={{ gap: spacing.sm }}>
        <Text variant="h1" accessibilityRole="header">
          {copy.title}
        </Text>
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
              <Text variant="label" color="primary" accessibilityRole="button" onPress={() => switchMode('forgot')} testID="auth-forgot" style={{ alignSelf: 'flex-end', paddingVertical: spacing.sm }}>
                Forgot password?
              </Text>
            ) : null}
          </View>
        ) : null}

        {formError ? (
          <Note tone="warning" icon={<TriangleAlert size={18} color={colors.warning} />} testID="auth-error">
            <Text variant="body" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          </Note>
        ) : null}

        {restoring ? (
          <Text variant="caption" color="textSecondary" align="center" testID="auth-restoring">
            Signed in. Bringing your plan and logs to this device...
          </Text>
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

/** This build has no backend: say so plainly and point back to the app, which works fully offline. */
function NotConfigured() {
  const { colors, spacing } = useTheme();
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  return (
    <Screen
      testID="auth-not-configured"
      header={<Header onBack={() => goBack(onboarded ? '/' : '/welcome')} />}
      contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
      footer={<Button title={onboarded ? 'Back to today' : 'Set up on this device'} testID="auth-continue-local" onPress={() => router.replace(onboarded ? '/' : '/onboarding')} />}>
      <View style={{ alignItems: 'center' }}>
        <BrandRings size={150} />
        <View style={{ position: 'absolute', top: 75 - 20 }}>
          <Smartphone size={40} color={colors.text} />
        </View>
      </View>
      <FadeIn style={{ gap: spacing.sm }}>
        <Text variant="h1" align="center" accessibilityRole="header">
          Accounts aren't set up in this build
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          HealthCal works fully on this device: logging, targets, trends and export. Your data is saved here and never leaves it.
        </Text>
      </FadeIn>
    </Screen>
  );
}
