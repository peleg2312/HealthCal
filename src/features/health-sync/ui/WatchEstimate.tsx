import React, { useMemo } from 'react';
import { View } from 'react-native';

import { bmr } from '@/lib/energy';
import { formatNumber } from '@/lib/units';
import { useToday } from '@/store/clock';
import { useLive, useProfile, type EnergyModel } from '@/store/selectors';
import { useTheme } from '@/theme';
import { CupKey, Text } from '@/ui';

import { exerciseNetByDate, maintenanceKcal, watchEstimate, type WatchEstimate as Estimate } from '../dayEnergy';
import { useHealthSync } from '../store';
import { healthAdapter } from '../sync';

/**
 * The watch's own count of calories burned a day (dayEnergy.ts), as Progress
 * shows it: null until sync is on and 5 of the last 7 full days are valid.
 * Kept on this phone only; it is added to no budget and informs no estimate.
 */
export function useWatchEstimate(model: EnergyModel): (Estimate & { learned: boolean }) | null {
  const enabled = useHealthSync((s) => s.enabled);
  const days = useHealthSync((s) => s.dayEnergy.days);
  const profile = useProfile();
  const activities = useLive('activities');
  const todayDate = useToday();
  return useMemo(() => {
    if (!enabled) return null;
    const est = watchEstimate(days, todayDate, exerciseNetByDate(activities), maintenanceKcal(model), bmr(profile).kcal, healthAdapter.store);
    return est ? { ...est, learned: model.usingAdaptive } : null;
  }, [enabled, days, todayDate, activities, model, profile]);
}

/**
 * Progress's energy card: the watch's estimate beside HealthCal's figure for the
 * same days (maintenance plus the workouts), to compare. It never colours the
 * difference and never says which is right.
 */
export function WatchEstimate({ model }: { model: EnergyModel }) {
  const { colors, spacing } = useTheme();
  const est = useWatchEstimate(model);
  if (!est) return null;
  return (
    <View testID="progress-energy-watch" style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={colors.calories} variant="outline" />
        <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
          {est.label}&apos;s estimate
        </Text>
      </View>
      <Text variant="numM" tabular testID="progress-energy-watch-value">
        {formatNumber(est.avg)}
        <Text variant="unit"> kcal a day</Text>
      </Text>
      <Text variant="caption" color="textSecondary">
        Average of {est.n} full days, workouts included. HealthCal&apos;s figure for the same days is {formatNumber(est.app)} kcal: your{' '}
        {est.learned ? 'learned' : 'formula'} estimate, which sets your targets, plus your workouts. Shown to compare; it does not change your budget.
      </Text>
    </View>
  );
}

/** The line "How this works" adds when the watch's estimate shows. */
export function WatchEstimateNote({ model }: { model: EnergyModel }) {
  const est = useWatchEstimate(model);
  if (!est) return null;
  return (
    <Text variant="caption" color="textSecondary" testID="progress-energy-watch-note">
      A watch&apos;s figure is its own estimate from heart rate and movement, and the two often differ. HealthCal does not use it for your targets: your logged days and
      weigh-ins show what you burn.
    </Text>
  );
}
