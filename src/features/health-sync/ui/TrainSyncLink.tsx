import { router } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import React from 'react';

import { useTheme } from '@/theme';
import { Button, CupKey } from '@/ui';

import { useHealthSync } from '../store';
import { healthAdapter, useSyncOnFocus } from '../sync';

/**
 * Train's way into automatic sync, beside the Garmin file import and drawn as it is (the kit's small
 * ghost button with an icon; the amber key in the icon's place while something waits): "Sync
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
    <Button
      testID="train-health-sync"
      title={label}
      accessibilityLabel={spoken}
      variant="ghost"
      size="sm"
      full={false}
      icon={waiting || attention ? <CupKey color={colors.warning} size={8} /> : <RefreshCw size={16} color={colors.primaryInk} strokeWidth={2.2} />}
      onPress={() => router.push('/settings/health-sync' as never)}
    />
  );
}
