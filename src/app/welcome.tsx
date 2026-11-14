import { Redirect, router } from 'expo-router';
import { FileUp, HeartHandshake, ShieldCheck, TriangleAlert, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { ARRIVAL_POUR, CupMark, Note } from '@/features/onboarding/components';
import { formatNumber } from '@/lib/units';
import { pickAndImportBackup } from '@/services/export';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { AnimatedNumber, Button, FadeUp, Screen, Text, Vessel } from '@/ui';

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
  { key: 'honest', Icon: ShieldCheck, title: 'Honest numbers' },
  { key: 'fast', Icon: Zap, title: 'Fast logging' },
  { key: 'free', Icon: HeartHandshake, title: 'No paywalls, no ads' },
];

/** Cup height the labels and the promises beside them need, with the regular and the small type. */
const NEED = 206;
const NEED_SMALL = 178;
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
  const small = narrow || room < NEED;
  const need = small ? NEED_SMALL : NEED;
  // Up to 40 px of air around the cup, once there is room to spare.
  const air = Math.max(0, Math.min(40, room - NEED));
  return { height: Math.round(Math.min(wide ? 380 : 340, Math.max(need, room - air))), small };
}

/**
 * The idea in one picture, as the hero: a day as a cup. It pours in when the
 * screen opens while "eaten" counts up and "left" counts down with it; the
 * hatched headroom that exercise adds arrives when the pour lands. What the
 * app promises sits beside the full part of the cup, so cup and words are one
 * block. Shown once per session: coming back here does not pour again.
 */
function HeroCup({ height, narrow, small }: { height: number; narrow: boolean; small: boolean }) {
  const { colors, spacing } = useTheme();
  const width = Math.round(height * (narrow ? 0.32 : 0.4));
  const big = small ? 44 : 56;
  return (
    <View accessible accessibilityLabel="An example day: a budget of 2,160 kcal including 290 burned by exercise, 1,219 eaten, 941 left. Honest numbers. Fast logging. No paywalls, no ads.">
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
                    +290
                  </Text>
                  {' burned, added'}
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
        <View style={{ gap: small ? spacing.sm : spacing.md }}>
          {PROMISES.map((p, i) => (
            <FadeUp key={p.key} delay={POUR_DELAY + ARRIVAL_POUR / 2} index={i * 2} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <p.Icon size={18} color={colors.text} strokeWidth={1.9} />
              <Text variant={small ? 'label' : 'bodyStrong'} style={{ flex: 1 }}>
                {p.title}
              </Text>
            </FadeUp>
          ))}
        </View>
      </Vessel>
    </View>
  );
}

export default function Welcome() {
  const { colors, spacing } = useTheme();
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ tone: 'neutral' | 'warning'; text: string } | null>(null);
  // Height of the hero's place, known after the first layout; the cup mounts (and pours) once it is.
  const [room, setRoom] = useState<number | null>(null);
  const window = useWindowDimensions();
  if (onboarded) return <Redirect href="/" />;

  const narrow = window.width < 360;
  // The cup takes the room the words and the actions leave, measured, so the whole welcome
  // fits one screen whatever the footer holds.
  const fit = room === null ? null : fitHero(room - HERO_PAD - OVERLINE, narrow, window.width >= 400);

  const restore = async () => {
    setImporting(true);
    setImportNote(null);
    const r = await pickAndImportBackup({ forceProfile: true });
    setImporting(false);
    if (!r.ok) {
      if (!r.canceled) setImportNote({ tone: 'warning', text: `That file could not be restored. ${r.message}` });
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
      contentStyle={{ flexGrow: 1, gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.lg }}
      footer={
        <FadeUp delay={ACTIONS_AT} style={{ gap: spacing.sm }}>
          <Button title="Get started" testID="welcome-get-started" onPress={() => router.push('/onboarding')} />
          {isBackendConfigured ? (
            <Button title="I already have an account" variant="ghost" testID="welcome-sign-in" onPress={() => router.push('/auth?mode=signin')} />
          ) : null}
          <Button
            title="Restore from a backup file"
            variant="ghost"
            size="sm"
            testID="welcome-restore"
            loading={importing}
            icon={<FileUp size={16} color={colors.primaryInk} />}
            onPress={() => void restore()}
          />
        </FadeUp>
      }>
      <View style={{ gap: spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
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
        onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.height))}
        style={{ flex: 1, minHeight: OVERLINE + NEED_SMALL + HERO_PAD, justifyContent: 'center', paddingBottom: HERO_PAD }}>
        {fit ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="overline">An example day</Text>
            <HeroCup height={fit.height} narrow={narrow} small={fit.small} />
          </View>
        ) : null}
      </View>
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
