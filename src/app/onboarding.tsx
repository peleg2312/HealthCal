import { Redirect, router } from 'expo-router';
import { ArrowRight, BellRing, ChevronLeft, CloudUpload } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, Platform, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import type { ChoiceInput } from '@/features/onboarding/choiceInput';
import { FadeIn, focusNextEmptyField, focusStepHeading, StepProgress, StepSlide } from '@/features/onboarding/components';
import { deviceUnitsOnce } from '@/features/onboarding/deviceUnits';
import { buildPlan, convertUnits, draftFromProfile, effectiveBodyFat, stepsFor, toMetric, useOnboardingDraft, validateStep, type StepId } from '@/features/onboarding/model';
import { PlanReveal } from '@/features/onboarding/PlanReveal';
import { remindersPatch } from '@/features/onboarding/routine';
import { RestoreFailed } from '@/features/onboarding/SignInGate';
import { AboutStep, ActivityStep, BasicsStep, BodyFatStep, BodyStep, GoalStep, RoutineStep, SexStep, TargetStep, type StepProps } from '@/features/onboarding/steps';
import { today } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { round } from '@/lib/units';
import { useAuth } from '@/services/auth';
import { remindersSupported, requestReminderPermission } from '@/services/notifications';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useNow } from '@/store/clock';
import { live } from '@/store/selectors';
import { ThemeProvider, useTheme } from '@/theme';
import { Button, goBack, haptic, IconButton, Screen, Text, toast } from '@/ui';

const STEP_COMPONENTS: Record<Exclude<StepId, 'plan'>, (p: StepProps) => React.ReactElement> = {
  basics: BasicsStep,
  goal: GoalStep,
  sex: SexStep,
  about: AboutStep,
  body: BodyStep,
  bodyfat: BodyFatStep,
  activity: ActivityStep,
  target: TargetStep,
  routine: RoutineStep,
};

/** How long a chosen tile is seen as chosen before a single-choice step moves on by itself. */
const CHOICE_BEAT = 250;
/**
 * After a step moved on by itself, a Continue tap this soon was aimed at the
 * screen that just left. If the new question has no answer yet the tap does
 * nothing, so nobody is told off for a question they have not seen; if it
 * already has one, the tap works as usual.
 */
const STRAY_TAP = 450;

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
  return (
    <ChosenLook>
      <Flow onFinished={() => setOfferAccount(true)} />
    </ChosenLook>
  );
}

/**
 * Set-up asks no question about the look: the app follows the phone (or a look that came with a
 * backup or a sign-in), and Profile > Appearance offers every look. So set-up is drawn as the app
 * will be drawn once it ends, never in a look that changes at "Start tracking".
 */
function ChosenLook({ children }: { children: React.ReactNode }) {
  const preference = useStore((s) => s.settings.theme);
  const look = useStore((s) => s.settings.look);
  return (
    <ThemeProvider preference={preference} look={look} lead={false}>
      {children}
    </ThemeProvider>
  );
}

function Flow({ onFinished }: { onFinished: () => void }) {
  const { colors, spacing } = useTheme();
  const draft = useOnboardingDraft((s) => s.draft);
  const stepIndex = useOnboardingDraft((s) => s.step);
  const set = useOnboardingDraft((s) => s.set);
  const setStep = useOnboardingDraft((s) => s.setStep);
  const now = useNow();
  const [showErrors, setShowErrors] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  // The first step arrives with the screen's own fade-up; later ones slide.
  const [moved, setMoved] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const finishing = useRef(false);
  const beat = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedByItselfAt = useRef(0);
  const [asking, setAsking] = useState(false);
  // A new question takes the focus to its heading once it is on screen (set by every move between questions).
  const focusArrival = useRef(false);
  // A screen reader on a phone presses a tile as a finger does, so whether one is on is asked here: with one, a
  // choice never moves on by itself (on the web its activation already reads as 'keys', ./choiceInput).
  const reader = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (live) reader.current = on;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (on: boolean) => {
      reader.current = on;
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

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

  // Before the first answer: a profile restored by sync without finishing onboarding pre-fills the
  // answers, and the units start as the phone itself is set (once; a restored profile's own units win).
  useEffect(() => {
    const { profile } = useStore.getState();
    const state = useOnboardingDraft.getState();
    if (state.step !== 0 || state.draft.name || state.draft.goal) return;
    let draft = profile ? draftFromProfile(profile) : state.draft;
    const phone = profile?.units ? null : deviceUnitsOnce();
    if (phone) draft = convertUnits(draft, phone);
    if (draft !== state.draft) state.reset(draft);
  }, []);

  useEffect(
    () => () => {
      if (beat.current) clearTimeout(beat.current);
    },
    [],
  );

  const steps = stepsFor(draft.goal);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const questions = steps.length - 1;

  // The question that just arrived is drawn: its heading takes the focus (WCAG 2.4.3), so a keyboard or a screen
  // reader goes on from the new question, never from the start of the page or a control that has gone.
  useEffect(() => {
    if (!focusArrival.current) return;
    focusArrival.current = false;
    if (Platform.OS === 'web') focusStepHeading();
    else {
      const t = setTimeout(focusStepHeading, 300);
      return () => clearTimeout(t);
    }
  }, [step]);
  const errors = showErrors ? validateStep(step, draft, now) : {};
  const plan = step === 'plan' ? buildPlan(draft, now) : null;

  /** Where the flow stands right now, read from the store: handlers and timers must not use a render's copy. */
  const where = () => {
    const s = useOnboardingDraft.getState();
    const list = stepsFor(s.draft.goal);
    const at = Math.min(s.step, list.length - 1);
    return { draft: s.draft, list, at, id: list[at] };
  };

  const go = (to: number) => {
    if (beat.current) clearTimeout(beat.current);
    beat.current = null;
    const { at } = where();
    setDirection(to > at ? 1 : -1);
    setMoved(true);
    setShowErrors(false);
    focusArrival.current = true;
    setStep(to);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const tryNext = (quiet = false): boolean => {
    const { draft: d, list, at, id } = where();
    if (Object.keys(validateStep(id, d)).length > 0) {
      if (quiet) return false;
      setShowErrors(true);
      haptic.warn();
      return false;
    }
    if (at < list.length - 1) go(at + 1);
    return true;
  };

  const next = () => {
    // With a field in hand and another still empty, Continue means "the next field", not "check the step".
    if (focusNextEmptyField()) return;
    tryNext(Date.now() - movedByItselfAt.current < STRAY_TAP);
  };

  /** An answer that needs something typed was tapped: a wait started by the tile before it is off. */
  const hold = () => {
    if (beat.current) clearTimeout(beat.current);
    beat.current = null;
  };

  /**
   * A single-choice answer was tapped: let it be seen, then move on. Back, Continue and another tap all cancel the wait.
   * Only for a finger or a mouse: chosen with a keyboard or a screen reader, the answer is only chosen and Continue
   * moves on (WCAG 3.2.2), so nobody is taken to another question by choosing and the focus stays on the answer.
   */
  const advance = (how: ChoiceInput) => {
    hold();
    if (how === 'keys' || reader.current) return;
    const from = where().id;
    beat.current = setTimeout(() => {
      beat.current = null;
      if (where().id !== from) return;
      // Quiet: moving on by itself never raises an error, it just stays.
      if (tryNext(true)) movedByItselfAt.current = Date.now();
    }, CHOICE_BEAT);
  };

  const back = () => {
    const { at } = where();
    if (at === 0) {
      hold();
      goBack('/welcome');
    } else go(at - 1);
  };

  // Android's own back button goes one question back, like the chevron (and like "Change
  // answers" on the plan); on the first question it leaves, as before.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = useOnboardingDraft.getState();
      const at = Math.min(s.step, stepsFor(s.draft.goal).length - 1);
      if (at === 0) return false;
      if (beat.current) clearTimeout(beat.current);
      beat.current = null;
      setDirection(-1);
      setMoved(true);
      setShowErrors(false);
      focusArrival.current = true;
      s.setStep(at - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return true;
    });
    return () => sub.remove();
  }, []);

  /** The routine step's two equal answers: both save the times, only one turns reminders on. */
  const answerReminders = async (turnOn: boolean) => {
    const errs = validateStep('routine', where().draft);
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
    const { at, id } = where();
    if (id === 'routine') go(at + 1);
  };

  const finish = () => {
    const d = where().draft;
    const built = buildPlan(d);
    if (!built || finishing.current) return;
    finishing.current = true;
    const store = useStore.getState();
    // Never replace a plan that is already finished (one restored by sync, say).
    if (store.profile?.onboardedAt) {
      useOnboardingDraft.getState().reset();
      router.replace('/');
      return;
    }
    // No look is stored: the app keeps following the phone until the person picks one in Profile.
    store.setProfile({ ...built.profile, onboardedAt: nowISO() });
    if (d.remindersOn !== null) store.setReminders(remindersPatch(d.routine, d.remindersOn));
    // The first weigh-in starts the trend; reuse today's record if one was synced down.
    const existing = live(store.weights).find((w) => w.date === today());
    const m = toMetric(d);
    const tape = d.bodyFatMode === 'tape' && effectiveBodyFat(d) !== undefined;
    store.upsert('weights', {
      ...(existing ? { id: existing.id } : {}),
      date: today(),
      kg: built.profile.weightKg,
      ...(built.profile.bodyFatPct !== undefined ? { bodyFatPct: built.profile.bodyFatPct } : {}),
      ...(tape && m.neckCm !== null ? { neckCm: round(m.neckCm, 1) } : {}),
      ...(tape && m.waistCm !== null ? { waistCm: round(m.waistCm, 1) } : {}),
      ...(tape && d.sex === 'female' && m.hipCm !== null ? { hipCm: round(m.hipCm, 1) } : {}),
    });
    haptic.success();
    useOnboardingDraft.getState().reset();
    if (isBackendConfigured && !useAuth.getState().session) onFinished();
    else router.replace('/');
  };

  const Body = step === 'plan' ? null : STEP_COMPONENTS[step];
  const arrived = step === 'plan';

  return (
    <Screen
      testID="onboarding-screen"
      scrollProps={{ ref: scrollRef } as ScrollViewProps}
      contentStyle={{ paddingTop: arrived ? spacing.xxl : spacing.lg }}
      header={
        // The plan is an arrival, not a tenth question: no back chevron, no progress, no count.
        arrived ? undefined : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
            <IconButton accessibilityLabel={index === 0 ? 'Back to welcome' : 'Previous question'} onPress={back} testID="onb-back">
              <ChevronLeft size={22} color={colors.text} />
            </IconButton>
            <StepProgress index={index} total={questions} />
            <Text variant="label" color="textSecondary" tabular style={{ minWidth: 48, textAlign: 'right' }} testID="onb-step-count">
              {`${index + 1} of ${questions}`}
            </Text>
          </View>
        )
      }
      footer={
        arrived ? (
          <Button title="Start tracking" testID="onb-finish" onPress={finish} disabled={!plan} iconRight={<ArrowRight size={18} color={colors.onPrimary} />} />
        ) : step === 'routine' ? (
          <View style={{ gap: spacing.sm }}>
            {/* A browser cannot send reminders: said with the offer, so the button is not read as turning them on here. */}
            {!remindersSupported ? (
              <Text variant="caption" color="textSecondary" testID="onb-reminders-web">
                Reminders arrive in the phone app. A browser cannot send them; these choices are saved for your phone.
              </Text>
            ) : null}
            <Button
              title={remindersSupported ? 'Turn on reminders' : 'Turn on in the phone app'}
              variant="primary"
              testID="onb-reminders-on"
              loading={asking}
              disabled={!Object.values(draft.routine.nudges).some(Boolean)}
              icon={<BellRing size={18} color={colors.onPrimary} />}
              onPress={() => void answerReminders(true)}
            />
            <Button title="Not now" variant="ghost" testID="onb-reminders-skip" disabled={asking} onPress={() => void answerReminders(false)} />
          </View>
        ) : (
          <Button title="Continue" testID="onb-next" onPress={next} />
        )
      }>
      {Body ? (
        <StepSlide key={step} direction={direction} disabled={!moved}>
          <Body draft={draft} set={set} errors={errors} submit={next} advance={advance} hold={hold} />
        </StepSlide>
      ) : plan ? (
        <PlanReveal plan={plan} now={now} onChangeAnswers={back} />
      ) : null}
    </Screen>
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
        <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
          <CloudUpload size={40} color={colors.text} strokeWidth={1.6} />
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
