import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import type { ActivityEntry } from '@/types';
import { CupKey, Text } from '@/ui';

import { syncedFrom } from '../origins';

/**
 * "From Garmin Connect · measured" under a session that automatic sync added,
 * in the same words and key as the row's own line for a Garmin file import.
 * Renders nothing for any other session. It sits directly under a SessionRow
 * (tucked up into the row's bottom padding, aligned with its text).
 */
export function SyncedFromLine({ entry }: { entry: Pick<ActivityEntry, 'id' | 'source' | 'externalId' | 'measured'> }) {
  const { colors } = useTheme();
  const from = syncedFrom(entry);
  if (!from) return null;
  return (
    <View testID={`session-source-${entry.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -9, paddingBottom: 11, paddingLeft: 18 + 24 + 12, paddingRight: 18 }}>
      <CupKey color={colors.textSecondary} variant={entry.measured ? 'filled' : 'outline'} size={8} />
      <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
        {entry.measured ? `From ${from} · measured` : `From ${from}`}
      </Text>
    </View>
  );
}
