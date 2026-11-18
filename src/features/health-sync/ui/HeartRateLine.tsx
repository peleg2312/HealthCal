import React from 'react';

import type { ActivityEntry } from '@/types';
import { Text } from '@/ui';

import { heartRateText } from './format';

/**
 * A workout's average and highest heart rate, from the watch (a synced workout,
 * heart.ts) or a Garmin file: "Heart rate: average 142 bpm, highest 171 bpm".
 * Shown on the workout only: never added to calories, never shown to friends.
 * Draws nothing when the workout has no heart rate.
 */
export function HeartRateLine({ entry }: { entry: Pick<ActivityEntry, 'avgHeartRate' | 'maxHeartRate'> }) {
  const line = heartRateText(entry.avgHeartRate, entry.maxHeartRate);
  if (!line) return null;
  return (
    <Text variant="caption" color="textSecondary" testID="log-activity-heart-rate">
      {line}
    </Text>
  );
}
