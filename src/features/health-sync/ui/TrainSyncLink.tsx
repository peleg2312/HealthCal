import { router } from 'expo-router';
import React from 'react';

import { useTheme } from '@/theme';
import { CupKey, PressableScale, Text } from '@/ui';

import { useHealthSync } from '../store';
import { healthAdapter, useSyncOnFocus } from '../sync';

/**
 * Train's way into automatic sync, beside the Garmin file import: "Sync
 * automatically" while it is off, "Workout sync" once it is on, and a small
 * count ("Sync, 2 to look at") when workouts wait in "Needs a look". Mounting it is also what makes
 * Train sync when the tab is opened. Where there is no health store (the
 * browser, an iPad without Apple Health) or this install may not use it (an iPhone copy signed without the
 * HealthKit entitlement) the link still leads to the screen that says so.
 */
export function TrainSyncLink() {
  const { colors } = useTheme();
  useSyncOnFocus();
  const enabled = useHealthSync((s) => s.enabled);
  const waiting = useHealthSync((s) => s.review.length);
  const attention = useHealthSync((s) => s.enabled && s.lastError !== null);
  // Short enough to sit beside "Import workouts" on a phone; the spoken label says it in full.
  const label = !enabled ? (healthAdapter.store ? 'Sync automatically' : 'Automatic sync') : waiting ? `Sync, ${waiting} to look at` : attention ? 'Check sync' : 'Workout sync';
  const spoken = !enabled
    ? 'Automatic workout sync'
    : waiting
      ? `Workout sync, ${waiting} ${waiting === 1 ? 'workout needs' : 'workouts need'} a look`
      : attention
        ? 'Workout sync: the last sync did not finish'
        : 'Workout sync';
  return (
    <PressableScale
      testID="train-health-sync"
      accessibilityLabel={spoken}
      accessibilityRole="link"
      onPress={() => router.push('/settings/health-sync' as never)}
      hitSlop={6}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {waiting || attention ? <CupKey color={colors.warning} size={8} /> : null}
      <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }} testID="train-health-sync-label">
        {label}
      </Text>
    </PressableScale>
  );
}
