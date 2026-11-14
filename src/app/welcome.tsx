import { Redirect, router } from 'expo-router';
import { FileUp, HeartHandshake, ShieldCheck, TriangleAlert, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { FadeIn, Note } from '@/features/onboarding/components';
import { pickAndImportBackup } from '@/services/export';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, Screen, Text, Vessel } from '@/ui';

/**
 * The idea in one picture: a day as a cup, with exercise adding hatched
 * headroom on top, what is eaten poured in, and what is left visible above
 * the level line. Illustrative numbers, labelled as an example.
 */
function DemoCup() {
  const { colors } = useTheme();
  const budget = 2160;
  const eaten = 1219;
  const burned = 290;
  return (
    <View accessible accessibilityLabel="Example day: 2,160 kcal budget including 290 burned by exercise, 1,219 eaten, 941 left">
      <Vessel
        value={eaten}
        max={budget}
        headroom={burned}
        color={colors.calories}
        width={76}
        height={180}
        labels={[
          {
            key: 'burned',
            at: budget - burned / 2,
            height: 22,
            tick: colors.exercise,
            content: (
              <Text variant="label" color="textSecondary">
                <Text variant="numM" style={{ fontSize: 17 }}>+290</Text> burned, added
              </Text>
            ),
          },
          {
            key: 'left',
            at: eaten + (budget - burned - eaten) / 2,
            height: 40,
            content: (
              <Text variant="numL" color="caloriesInk">
                941<Text variant="unit"> kcal left</Text>
              </Text>
            ),
          },
          {
            key: 'eaten',
            at: eaten,
            height: 22,
            tick: colors.rim,
            content: (
              <Text variant="label" color="textSecondary">
                <Text variant="numM" style={{ fontSize: 17 }}>1,219</Text> eaten
              </Text>
            ),
          },
        ]}>
        <Text variant="caption" color="textTertiary">
          An example day
        </Text>
      </Vessel>
    </View>
  );
}

export default function Welcome() {
  const { colors, spacing } = useTheme();
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ tone: 'neutral' | 'warning'; text: string } | null>(null);
  if (onboarded) return <Redirect href="/" />;

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

  const points = [
    {
      icon: <ShieldCheck size={22} color={colors.text} strokeWidth={1.9} />,
      title: 'Honest numbers',
      text: 'Targets from your own body data, estimates shown as estimates.',
    },
    {
      icon: <Zap size={22} color={colors.text} strokeWidth={1.9} />,
      title: 'Fast logging',
      text: 'Recents, favourites and one-tap repeats are always close.',
    },
    {
      icon: <HeartHandshake size={22} color={colors.text} strokeWidth={1.9} />,
      title: 'No paywalls, no ads',
      text: 'Every feature included, and your data exports in full.',
    },
  ];

  return (
    <Screen
      testID="welcome-screen"
      contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: spacing.xxxl, paddingTop: spacing.xxl }}
      footer={
        <View style={{ gap: spacing.sm }}>
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
        </View>
      }>
      <View style={{ gap: spacing.xxl }}>
        <FadeIn delay={50} style={{ gap: spacing.sm }}>
          <Text variant="display" accessibilityRole="header" style={{ fontSize: 44, lineHeight: 46, letterSpacing: -1.5 }}>
            HealthCal
          </Text>
          <Text variant="h3" color="textSecondary" style={{ maxWidth: 340 }}>
            Your day fills up like a cup. Calorie tracking you can trust, built from your own body.
          </Text>
        </FadeIn>
        <DemoCup />
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
      ) : null}
      <View style={{ gap: spacing.lg }}>
        {points.map((p, i) => (
          <FadeIn key={p.title} delay={300 + i * 90} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <View style={{ width: 28, alignItems: 'center' }}>{p.icon}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title">{p.title}</Text>
              <Text variant="caption" color="textSecondary">
                {p.text}
              </Text>
            </View>
          </FadeIn>
        ))}
      </View>
    </Screen>
  );
}
