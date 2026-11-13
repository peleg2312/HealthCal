import { Redirect, router } from 'expo-router';
import { FileUp, HeartHandshake, ShieldCheck, TriangleAlert, Zap } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { BrandRings, FadeIn, Note } from '@/features/onboarding/components';
import { pickAndImportBackup } from '@/services/export';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, Screen, Text } from '@/ui';

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
      icon: <ShieldCheck size={20} color={colors.weight} />,
      color: colors.weight,
      title: 'Honest numbers',
      text: 'Targets from your own body data, estimates shown as estimates.',
    },
    {
      icon: <Zap size={20} color={colors.carbs} />,
      color: colors.carbs,
      title: 'Fast logging',
      text: 'Recents, favourites and one-tap repeats are always close.',
    },
    {
      icon: <HeartHandshake size={20} color={colors.protein} />,
      color: colors.protein,
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
            icon={<FileUp size={16} color={colors.textSecondary} />}
            onPress={() => void restore()}
          />
        </View>
      }>
      <View style={{ alignItems: 'center', gap: spacing.xxl }}>
        <BrandRings size={208} />
        <FadeIn delay={150} style={{ alignItems: 'center', gap: spacing.sm }}>
          <Text variant="display" align="center" accessibilityRole="header" style={{ fontSize: 40, lineHeight: 46 }}>
            HealthCal
          </Text>
          <Text variant="h3" color="textSecondary" align="center" style={{ maxWidth: 320 }}>
            Calorie tracking you can trust, built from your own body.
          </Text>
        </FadeIn>
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
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${p.color}22`, alignItems: 'center', justifyContent: 'center' }}>
              {p.icon}
            </View>
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
