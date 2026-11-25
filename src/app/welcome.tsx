import { Redirect, router } from 'expo-router';
import { FileUp, HeartHandshake, Info, Shield, TriangleAlert, Zap } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View, type ScrollViewInstance, type ScrollViewProps } from 'react-native';

import { authDemo } from '@/features/auth/demo';
import { returnScreenOpen } from '@/features/auth/google';
import { GoogleButton } from '@/features/auth/GoogleButton';
import { useGoogleSignIn } from '@/features/auth/useGoogleSignIn';
import { googleProblemWords, WELCOME_RESTORE, WELCOME_SIGN_IN, WELCOME_SIGN_IN_LABEL } from '@/features/auth/words';
import { ARRIVAL_POUR, CupMark, Note } from '@/features/onboarding/components';
import { formatNumber } from '@/lib/units';
import { pickAndImportBackup } from '@/services/export';
import { VIEWER_BLOCKED } from '@/services/viewer';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useReducedMotion, useTextSize, useTheme } from '@/theme';
import { AnimatedNumber, Button, decorative, FadeUp, Screen, Text, Vessel } from '@/ui';

/** The cup starts pouring as the screen opens; everything else follows it. */
const POUR_DELAY = 120;
const HEADLINE_AT = 160;
const ACTIONS_AT = 420;
const POURED_AT = POUR_DELAY + ARRIVAL_POUR;

// Illustrative numbers, labelled as an example on screen.
const BUDGET = 2160;
const EATEN = 1219;
const BURNED = 290;

const PROMISES = [
  { key: 'honest', Icon: Shield, title: 'Honest numbers' },
  { key: 'fast', Icon: Zap, title: 'Fast logging' },
  { key: 'free', Icon: HeartHandshake, title: 'Free to log, no ads' },
];

/** Cup height the labels and the promises beside them need, with the regular and the small type. */
const NEED = 206;
const NEED_SMALL = 178;
/** The shortest cup, with its three labels and no promises beside it (a short screen with a full footer, 320 x 640). */
const NEED_TINY = 112;
/** The overline above the cup with its gap, and the extra air under the cup (it sits a little above centre). */
const OVERLINE = 26;
const HERO_PAD = 8;

/**
 * How the hero fits the room it is given (the height between the words and
 * the actions, measured, so it holds for every phone and every footer).
 * Roomy: the cup takes the room up to its largest size, with a little air
 * left. Short: smaller type, and the cup takes what there is. Only a screen
 * too short for the small cup scrolls.
 */
function fitHero(room: number, narrow: boolean, wide: boolean) {
  // Too short even for the small cup with its promises: a shorter cup with its labels only (the
  // promises are in its spoken label), so the first view ends above the footer.
  if (room < NEED_SMALL)
    return {
      height: Math.round(Math.max(NEED_TINY, room)),
      small: true,
      tiny: true,
    };
  const small = narrow || room < NEED;
  const need = small ? NEED_SMALL : NEED;
  // Up to 40 px of air around the cup, once there is room to spare.
  const air = Math.max(0, Math.min(40, room - NEED));
  return {
    height: Math.round(Math.min(wide ? 380 : 340, Math.max(need, room - air))),
    small,
    tiny: false,
  };
}

/**
 * The idea in one picture, as the hero: a day as a cup. It pours in when the
 * screen opens while "eaten" counts up and "left" counts down with it; the
 * hatched headroom that exercise adds arrives when the pour lands. What the
 * app promises sits beside the full part of the cup, so cup and words are one
 * block. Shown once per session: coming back here does not pour again.
 */
function HeroCup({ height, narrow, small, tiny }: { height: number; narrow: boolean; small: boolean; tiny: boolean }) {
  const { colors, spacing } = useTheme();
  // A short cup keeps a usable width.
  const width = Math.round(Math.max(tiny ? 44 : 0, height * (narrow ? 0.32 : 0.4)));
  const big = tiny ? 34 : small ? 44 : 56;
  return (
    <View accessible accessibilityLabel={HERO_LABEL}>
      <Vessel
        value={EATEN}
        max={BUDGET}
        headroom={BURNED}
        color={colors.calories}
        width={width}
        height={height}
        duration={ARRIVAL_POUR}
        delay={POUR_DELAY}
        memoryKey="welcome-cup"
        labelGap={narrow ? 14 : 18}
        labels={[
          {
            key: 'burned',
            at: BUDGET - BURNED / 2,
            height: 24,
            tick: colors.exercise,
            content: (
              <FadeUp delay={POURED_AT} distance={0}>
                <Text variant="label" color="textSecondary" numberOfLines={1}>
                  <Text variant="numM" style={{ fontSize: 17 }}>
                    ~290
                  </Text>
                  {' added'}
                </Text>
              </FadeUp>
            ),
          },
          {
            key: 'left',
            at: EATEN + (BUDGET - BURNED - EATEN) / 2,
            height: big + 4,
            content: (
              <AnimatedNumber
                variant="numXL"
                color="caloriesInk"
                value={BUDGET - EATEN}
                from={BUDGET}
                duration={ARRIVAL_POUR}
                delay={POUR_DELAY}
                memoryKey="welcome-left"
                format={(n) => formatNumber(Math.round(n))}
                numberOfLines={1}
                style={{ fontSize: big, lineHeight: big + 2 }}>
                {/* The unit keeps its own spacing, not the big number's tight one. */}
                <Text variant="unit" style={{ letterSpacing: 0 }}>
                  {' kcal left'}
                </Text>
              </AnimatedNumber>
            ),
          },
          {
            key: 'eaten',
            at: EATEN,
            height: 24,
            tick: colors.rim,
            content: (
              <Text variant="label" color="textSecondary" numberOfLines={1}>
                <AnimatedNumber
                  variant="numM"
                  value={EATEN}
                  from={0}
                  duration={ARRIVAL_POUR}
                  delay={POUR_DELAY}
                  memoryKey="welcome-eaten"
                  format={(n) => formatNumber(Math.round(n))}
                  style={{ fontSize: 17 }}
                />
                {' eaten'}
              </Text>
            ),
          },
        ]}>
        {tiny ? null : (
          <View style={{ gap: small ? spacing.sm : spacing.md }}>
            {PROMISES.map((p, i) => (
              <FadeUp
                key={p.key}
                delay={POUR_DELAY + ARRIVAL_POUR / 2}
                index={i * 2}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}>
                {decorative(<p.Icon size={18} color={colors.text} strokeWidth={1.9} />)}
                <Text variant={small ? 'label' : 'bodyStrong'} style={{ flex: 1 }}>
                  {p.title}
                </Text>
              </FadeUp>
            ))}
          </View>
        )}
      </Vessel>
    </View>
  );
}

/** The example day's spoken label: the cup and its figures are one element. */
const HERO_LABEL = 'An example day: a budget of 2,160 kilocalories including about 290 added by workouts, 1,219 eaten, 941 left. Honest numbers. Fast logging. Free to log, no ads.';

/**
 * The hero at 130% text and more. The labels beside the cup are placed at the levels they describe, and
 * grown text no longer fits between those levels, so the figures stand in a column beside a cup of a fixed
 * size (each wraps whole if it must) and the three promises follow under it. The page scrolls if it needs to.
 */
function LargeTextHero() {
  const { colors, spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={HERO_LABEL} style={{ gap: spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.lg,
        }}>
        <Vessel value={EATEN} max={BUDGET} headroom={BURNED} color={colors.calories} width={64} height={160} duration={ARRIVAL_POUR} delay={POUR_DELAY} memoryKey="welcome-cup" />
        <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
          <Text variant="label" color="textSecondary">
            <Text variant="numM">~290</Text>
            {' added'}
          </Text>
          <AnimatedNumber
            variant="numXL"
            color="caloriesInk"
            value={BUDGET - EATEN}
            from={BUDGET}
            duration={ARRIVAL_POUR}
            delay={POUR_DELAY}
            memoryKey="welcome-left"
            format={(n) => formatNumber(Math.round(n))}>
            <Text variant="unit" style={{ letterSpacing: 0 }}>
              {' kcal left'}
            </Text>
          </AnimatedNumber>
          <Text variant="label" color="textSecondary">
            <AnimatedNumber variant="numM" value={EATEN} from={0} duration={ARRIVAL_POUR} delay={POUR_DELAY} memoryKey="welcome-eaten" format={(n) => formatNumber(Math.round(n))} />
            {' eaten'}
          </Text>
        </View>
      </View>
      <View style={{ gap: spacing.md }}>
        {PROMISES.map((p) => (
          <View
            key={p.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}>
            {decorative(<p.Icon size={18} color={colors.text} strokeWidth={1.9} />)}
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {p.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Welcome() {
  const { colors, spacing } = useTheme();
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{
    tone: 'neutral' | 'warning';
    text: string;
  } | null>(null);
  // On a phone the Google flow ends with a session: the sign-in screen's waiting view then hands over to the sign-in gate.
  // (On Android the app's own link may already have opened that screen.) On the web the page leaves for Google.
  // (A test build's `?authDemo=declined` draws the note of a sign-in that was not completed, as a picture.)
  const google = useGoogleSignIn({
    onSignedIn: () => !returnScreenOpen() && router.push('/auth?mode=google'),
    initialError: authDemo() === 'declined' ? googleProblemWords('declined') : null,
  });
  // The actions are drawn once, when this visit knows whether Google is offered (the kept answer, the
  // fresh one, or 1.5 s at most), so "Continue with Google" never pops in under a finger reaching for
  // "Get started". Their entrance keeps its place in the sequence when that is known at once.
  const [actionsAt] = useState(() => (google.ready ? ACTIONS_AT : 0));
  // Height of the hero's place, measured with the actions in place (`final`); the cup mounts (and pours) once it is.
  const [room, setRoom] = useState<{ height: number; final: boolean } | null>(null);
  const ready = google.ready;
  useEffect(() => {
    if (!ready) return;
    // The footer's arrival may leave the hero's height as it was (a page that scrolls): then no new layout comes.
    const t = setTimeout(() => setRoom((r) => (r && !r.final ? { ...r, final: true } : r)), 120);
    return () => clearTimeout(t);
  }, [ready]);
  const window = useWindowDimensions();
  const reduce = useReducedMotion();
  const largeText = useTextSize() >= 1.3;
  // A note that appears is seen. The notes are the last thing on the page and the pinned actions can
  // cover them on a short screen, so the page scrolls to its end when one appears or changes (at once
  // under reduced motion): then, and again when the page's height settles, since the hero gives up its
  // room a moment later (it is measured). The page's own scroll area, handed over through `scrollProps`.
  const scroll = useRef<ScrollViewInstance>(null);
  const noteWords = [google.notice, google.error, importNote?.text].filter(Boolean).join('|');
  useEffect(() => {
    if (!noteWords) return;
    // After this frame's layout, so the end of the page is where the new note ends.
    const frame = requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: !reduce }));
    return () => cancelAnimationFrame(frame);
  }, [noteWords, reduce]);
  if (onboarded) return <Redirect href="/" />;

  const narrow = window.width < 360;
  // Accounts are offered with a backend (a test build's demo view draws them without one).
  const accounts = isBackendConfigured || authDemo() !== null;
  // The cup takes the room the words and the actions leave, measured, so the whole welcome
  // fits one screen whatever the footer holds.
  const fit = room === null || !room.final ? null : fitHero(room.height - HERO_PAD - OVERLINE, narrow, window.width >= 400);

  const restore = async () => {
    setImporting(true);
    setImportNote(null);
    const r = await pickAndImportBackup({ forceProfile: true });
    setImporting(false);
    if (!r.ok) {
      // The hosted preview's frame cannot open files at all: say that alone, not that a file failed.
      if (!r.canceled)
        setImportNote({
          tone: 'warning',
          text: r.message === VIEWER_BLOCKED.files ? r.message : `That file could not be restored. ${r.message}`,
        });
      return;
    }
    // A backup with a finished plan opens straight onto Today.
    if (useStore.getState().profile?.onboardedAt) {
      router.replace('/');
      return;
    }
    const n = r.added + r.updated;
    setImportNote({
      tone: 'neutral',
      text:
        n > 0
          ? `Imported ${n} ${n === 1 ? 'record' : 'records'}, but the file has no finished plan. Set up your plan with Get started and they will be there.`
          : 'Nothing new was in that file, and it has no finished plan. Choose another backup, or set up with Get started.',
    });
  };

  return (
    <Screen
      testID="welcome-screen"
      // The screen runs its own entrance: the cup first, then the headline, then the actions.
      enter={false}
      scrollProps={
        {
          ref: scroll,
          onContentSizeChange: () => (noteWords ? scroll.current?.scrollToEnd({ animated: !reduce }) : undefined),
        } as ScrollViewProps
      }
      contentStyle={{
        flexGrow: 1,
        gap: spacing.xl,
        paddingTop: spacing.lg,
        paddingBottom: spacing.lg,
      }}
      footer={
        ready ? (
          <FadeUp delay={actionsAt} style={{ gap: spacing.sm }}>
            <Button title="Get started" testID="welcome-get-started" onPress={() => router.push('/onboarding')} />
            {/* The second option, never the primary: shown only once the backend says Google is on. */}
            {accounts && google.shown ? <GoogleButton testID="welcome-google" onPress={google.press} busy={google.busy} /> : null}
            {/*
              Two full-width ways in at most, then one quiet row: the hero keeps its room. With accounts the
              row holds "Sign in" beside the restore; the two stack, Sign in first, if large text makes one wrap.
            */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: spacing.sm,
              }}>
              {accounts ? (
                <Button
                  title={WELCOME_SIGN_IN}
                  accessibilityLabel={WELCOME_SIGN_IN_LABEL}
                  variant="ghost"
                  size="sm"
                  full={false}
                  testID="welcome-sign-in"
                  style={{ flexGrow: 1, flexBasis: 96, minWidth: 96 }}
                  onPress={() => router.push('/auth?mode=signin')}
                />
              ) : null}
              <Button
                title={WELCOME_RESTORE}
                variant="ghost"
                size="sm"
                full={false}
                testID="welcome-restore"
                loading={importing}
                // Under 340 px the row has no room for the mark beside the words.
                icon={accounts && window.width < 340 ? undefined : <FileUp size={16} color={colors.primaryInk} />}
                style={{
                  flexGrow: 1,
                  flexBasis: accounts ? 148 : '100%',
                  minWidth: 148,
                }}
                onPress={() => void restore()}
              />
            </View>
          </FadeUp>
        ) : undefined
      }>
      <View style={{ gap: spacing.xl }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
          <CupMark size={24} />
          <Text variant="h3" testID="welcome-wordmark">
            HealthCal
          </Text>
        </View>
        <FadeUp delay={HEADLINE_AT} style={{ gap: spacing.sm }}>
          <Text
            variant="display"
            accessibilityRole="header"
            testID="welcome-headline"
            style={narrow ? { fontSize: 34, lineHeight: 36, letterSpacing: -1.1 } : { fontSize: 42, lineHeight: 44, letterSpacing: -1.5 }}>
            {narrow ? 'Your day fills up like a cup.' : 'Your day fills up\nlike a cup.'}
          </Text>
          <Text variant="body" color="textSecondary" style={{ maxWidth: 340 }}>
            Calorie tracking you can trust, built from your own body.
          </Text>
        </FadeUp>
      </View>
      {/* The hero's place: everything between the words and the actions. A little more air under the cup than over it. */}
      <View
        testID="welcome-hero"
        onLayout={(e) =>
          setRoom({
            height: Math.round(e.nativeEvent.layout.height),
            final: ready,
          })
        }
        style={{
          flex: 1,
          minHeight: OVERLINE + NEED_TINY + HERO_PAD,
          justifyContent: 'center',
          paddingBottom: HERO_PAD,
        }}>
        {largeText ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="overline">An example day</Text>
            <LargeTextHero />
          </View>
        ) : fit ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="overline">An example day</Text>
            <HeroCup height={fit.height} narrow={narrow} small={fit.small} tiny={fit.tiny} />
          </View>
        ) : null}
      </View>
      {google.notice ? (
        <Note tone="neutral" testID="welcome-google-off" icon={<Info size={18} color={colors.textSecondary} />}>
          <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {google.notice}
          </Text>
        </Note>
      ) : null}
      {google.error ? (
        // On the card surface: neutral in every look (a sign-in that was not completed is not an alarm).
        <Note tone="neutral" surface="card" testID="welcome-google-error" icon={<Info size={18} color={colors.text} />}>
          <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {google.error}
          </Text>
        </Note>
      ) : null}
      {importNote ? (
        <Note
          tone={importNote.tone}
          testID="welcome-restore-note"
          icon={importNote.tone === 'warning' ? <TriangleAlert size={18} color={colors.warningInk} /> : <FileUp size={18} color={colors.textSecondary} />}>
          <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {importNote.text}
          </Text>
        </Note>
      ) : null}
    </Screen>
  );
}
