import { Redirect, router } from 'expo-router';
import { ArrowRight, BellRing, ChevronLeft, CloudUpload } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { FadeIn, StepProgress } from '@/features/onboarding/components';
import { buildPlan, draftFromProfile, effectiveBodyFat, stepsFor, toMetric, useOnboardingDraft, validateStep, type StepId } from '@/features/onboarding/model';
import { PlanReveal } from '@/features/onboarding/PlanReveal';
import { remindersPatch } from '@/features/onboarding/routine';
import { RestoreFailed } from '@/features/onboarding/SignInGate';
import { AboutStep, ActivityStep, BasicsStep, BodyFatStep, BodyStep, GoalStep, RoutineStep, TargetStep, type StepProps } from '@/features/onboarding/steps';
import { today } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { round } from '@/lib/units';
import { useAuth } from '@/services/auth';
import { remindersSupported, requestReminderPermission } from '@/services/notifications';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Button, goBack, haptic, IconButton, Screen, Text, toast } from '@/ui';

const STEP_COMPONENTS: Record<Exclude<StepId, 'plan'>, (p: StepProps) => React.ReactElement> = {
  basics: BasicsStep,
  goal: GoalStep,
  about: AboutStep,
  body: BodyStep,
  bodyfat: BodyFatStep,
  activity: ActivityStep,
  target: TargetStep,
  routine: RoutineStep,
};

export default function Onboarding() {
  // Decided once on arrival, so finishing here does not bounce the account offer away.
  const [arrivedOnboarded] = useState(() => !!useStore.getState().profile?.onboardedAt);
  const [offerAccount, setOfferAccount] = useState(false);
  // Signed in, but the account could not be read: its plan may exist, so do not let set-up replace it.
  const blockedByRestore = useAuth((s) => !!s.session && s.restoreFailed);
  const onboardedNow = useStore((s) => !!s.profile?.onboardedAt);

  if (arrivedOnboarded) return <Redirect href="/" />;
  if (offerAccount) return <AccountOffer />;
  if (blockedByRestore && !onboardedNow) return <RestoreFailed />;
  return <Flow onFinished={() => setOfferAccount(true)} />;
}

function Flow({ onFinished }: { onFinished: () => void }) {
  const { colors, spacing } = useTheme();
  const draft = useOnboardingDraft((s) => s.draft);
  const stepIndex = useOnboardingDraft((s) => s.step);
  const set = useOnboardingDraft((s) => s.set);
  const setStep = useOnboardingDraft((s) => s.setStep);
  const [showErrors, setShowErrors] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const finishing = useRef(false);
  const [asking, setAsking] = useState(false);

  // A finished profile can arrive from a late sync while the answers are being given:
  // that plan is the person's real one, so leave rather than replace it.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (finishing.current || !s.profile?.onboardedAt || prev.profile?.onboardedAt) return;
        finishing.current = true;
        useOnboardingDraft.getState().reset();
        toast('Your plan was loaded from your account');
        router.replace('/');
      }),
    [],
  );

  // A profile restored by sync without finishing onboarding pre-fills the answers.
  useEffect(() => {
    const { profile } = useStore.getState();
    const state = useOnboardingDraft.getState();
    if (profile && state.step === 0 && !state.draft.name && !state.draft.goal) state.reset(draftFromProfile(profile));
  }, []);

  const steps = stepsFor(draft.goal);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const errors = showErrors ? validateStep(step, draft) : {};
  const plan = step === 'plan' ? buildPlan(draft) : null;

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setShowErrors(false);
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const next = () => {
    const errs = validateStep(step, draft);
    if (Object.keys(errs).length > 0) {
      setShowErrors(true);
      haptic.warn();
      return;
    }
    if (index < steps.length - 1) go(index + 1);
  };

  const back = () => {
    if (index === 0) goBack('/welcome');
    else go(index - 1);
  };

  /** The routine step's two equal answers: both save the times, only one turns reminders on. */
  const answerReminders = async (turnOn: boolean) => {
    const errs = validateStep('routine', draft);
    if (Object.keys(errs).length > 0) {
      setShowErrors(true);
      haptic.warn();
      return;
    }
    let on = false;
    if (turnOn) {
      if (!remindersSupported) {
        on = true;
      } else {
        setAsking(true);
        const permission = await requestReminderPermission();
        setAsking(false);
        on = permission === 'granted';
        if (!on) toast('Notifications are blocked for HealthCal. Your times are saved; allow notifications in the phone settings to get reminders.');
      }
    }
    set({ remindersOn: on });
    go(index + 1);
  };

  const finish = () => {
    const built = buildPlan(draft);
    if (!built || finishing.current) return;
    finishing.current = true;
    const store = useStore.getState();
    // Never replace a plan that is already finished (one restored by sync, say).
    if (store.profile?.onboardedAt) {
      useOnboardingDraft.getState().reset();
      router.replace('/');
      return;
    }
    store.setProfile({ ...built.profile, onboardedAt: nowISO() });
    if (draft.remindersOn !== null) store.setReminders(remindersPatch(draft.routine, draft.remindersOn));
    // The first weigh-in starts the trend; reuse today's record if one was synced down.
    const existing = live(store.weights).find((w) => w.date === today());
    const m = toMetric(draft);
    const tape = draft.bodyFatMode === 'tape' && effectiveBodyFat(draft) !== undefined;
    store.upsert('weights', {
      ...(existing ? { id: existing.id } : {}),
      date: today(),
      kg: built.profile.weightKg,
      ...(built.profile.bodyFatPct !== undefined ? { bodyFatPct: built.profile.bodyFatPct } : {}),
      ...(tape && m.neckCm !== null ? { neckCm: round(m.neckCm, 1) } : {}),
      ...(tape && m.waistCm !== null ? { waistCm: round(m.waistCm, 1) } : {}),
      ...(tape && draft.sex === 'female' && m.hipCm !== null ? { hipCm: round(m.hipCm, 1) } : {}),
    });
    haptic.success();
    useOnboardingDraft.getState().reset();
    if (isBackendConfigured && !useAuth.getState().session) onFinished();
    else router.replace('/');
  };

  const Body = step === 'plan' ? null : STEP_COMPONENTS[step];

  return (
    <Screen
      testID="onboarding-screen"
      scrollProps={{ ref: scrollRef } as ScrollViewProps}
      contentStyle={{ paddingTop: spacing.lg }}
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
          <IconButton accessibilityLabel={index === 0 ? 'Back to welcome' : 'Previous question'} onPress={back} testID="onb-back">
            <ChevronLeft size={22} color={colors.text} />
          </IconButton>
          <StepProgress index={index} total={steps.length} />
          <Text variant="label" color="textSecondary" tabular style={{ minWidth: 40, textAlign: 'right' }} testID="onb-step-count">
            {`${index + 1} of ${steps.length}`}
          </Text>
        </View>
      }
      footer={
        step === 'plan' ? (
          <Button title="Start tracking" testID="onb-finish" onPress={finish} disabled={!plan} iconRight={<ArrowRight size={18} color={colors.onPrimary} />} />
        ) : step === 'routine' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Not now" variant="secondary" testID="onb-reminders-skip" disabled={asking} onPress={() => void answerReminders(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Turn on reminders"
                variant="secondary"
                testID="onb-reminders-on"
                loading={asking}
                disabled={!Object.values(draft.routine.nudges).some(Boolean)}
                icon={<BellRing size={18} color={colors.text} />}
                onPress={() => void answerReminders(true)}
              />
            </View>
          </View>
        ) : (
          <Button title="Continue" testID="onb-next" onPress={next} />
        )
      }>
      <StepTransition key={step} direction={direction}>
        {Body ? <Body draft={draft} set={set} errors={errors} submit={next} /> : plan ? <PlanReveal plan={plan} /> : null}
      </StepTransition>
    </Screen>
  );
}

function StepTransition({ direction, children }: { direction: 1 | -1; children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [direction * 28, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** Shown once after finishing, only when accounts exist and nobody is signed in. Never required. */
function AccountOffer() {
  const { colors, spacing } = useTheme();
  return (
    <Screen
      testID="onb-account-offer"
      contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxl }}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title="Create a free account" testID="onb-account-create" onPress={() => router.replace('/auth?mode=signup')} />
          <Button title="Not now" variant="ghost" testID="onb-account-skip" onPress={() => router.replace('/')} />
        </View>
      }>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <CloudUpload size={36} color={colors.primary} />
        </View>
      </View>
      <FadeIn style={{ gap: spacing.sm }}>
        <Text variant="h1" align="center" accessibilityRole="header">
          Back up and sync your plan
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          A free account keeps your logs safe and in step across your phone, tablet and the web. Everything already works on this device without one.
        </Text>
      </FadeIn>
    </Screen>
  );
}
