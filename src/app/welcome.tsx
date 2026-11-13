import { Redirect, router } from 'expo-router';
import { HeartHandshake, ShieldCheck, Zap } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { BrandRings, FadeIn } from '@/features/onboarding/components';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import { Button, Screen, Text } from '@/ui';

export default function Welcome() {
  const { colors, spacing } = useTheme();
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  if (onboarded) return <Redirect href="/" />;

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
