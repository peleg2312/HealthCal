import { Redirect, router } from 'expo-router';
import { FileUp, HeartHandshake, ShieldCheck, TriangleAlert, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/**
 * The idea in one picture, as the hero: a day as a cup. It pours in when the
 * screen opens while "eaten" counts up and "left" counts down with it; the
 * hatched headroom that exercise adds arrives when the pour lands. What the
 * app promises sits beside the full part of the cup, so cup and words are one
 * block. Shown once per session: coming back here does not pour again.
 */
function HeroCup({ height, narrow }: { height: number; narrow: boolean }) {
  const { colors, spacing } = useTheme();
  const width = Math.round(height * (narrow ? 0.32 : 0.4));
  const big = narrow ? 44 : 56;
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
                <Text variant="unit"> kcal left</Text>
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
        <View style={{ gap: narrow ? spacing.sm : spacing.md }}>
          {PROMISES.map((p, i) => (
            <FadeUp key={p.key} delay={POUR_DELAY + ARRIVAL_POUR / 2} index={i * 2} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <p.Icon size={18} color={colors.text} strokeWidth={1.9} />
              <Text variant={narrow ? 'label' : 'bodyStrong'} style={{ flex: 1 }}>
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
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (onboarded) return <Redirect href="/" />;

  const narrow = window.width < 360;
  // The cup takes what the words and the actions leave, so the whole welcome fits one screen on most phones.
  const room = window.height - insets.top - insets.bottom - (isBackendConfigured ? 500 : 444);
  const cupHeight = Math.round(Math.max(210, Math.min(320, room)));

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
      contentStyle={{ flexGrow: 1, justifyContent: 'space-between', gap: spacing.xl, paddingTop: spacing.md }}
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
            icon={<FileUp size={16} color={colors.primary} />}
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
      <View style={{ gap: spacing.md }}>
        <Text variant="overline">An example day</Text>
        <HeroCup height={cupHeight} narrow={narrow} />
      </View>
      {importNote ? (
        <Note
          tone={importNote.tone}
          testID="welcome-restore-note"
          icon={importNote.tone === 'warning' ? <TriangleAlert size={18} color={colors.warning} /> : <FileUp size={18} color={colors.textSecondary} />}>
          <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {importNote.text}
          </Text>
        </Note>
      ) : (
        // Keeps the cup in the optical centre: a little more room under it than over it.
        <View />
      )}
    </Screen>
  );
}
