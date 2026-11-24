import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';
import { MiniCup, Text } from '@/ui';

import { HEALTH_EXPORT_SKIPS } from './format';

/** A sign of life while files are read: a cup filling file by file, and which file it is on. */
export function ReadingView({ progress }: { progress: { index: number; total: number; name: string; share?: number } | null }) {
  const { colors, spacing } = useTheme();
  const total = progress?.total ?? 1;
  const index = progress?.index ?? 0;
  // A Health export is read piece by piece: the cup shows how much of it, and the line says so in numbers.
  const share = progress?.share;
  const big = share !== undefined;
  const level = big ? (index + share) / total : (index + 0.5) / total;
  const pct = big ? Math.floor(share * 100) : 0;
  return (
    <View testID="import-reading" accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.huge }}>
      <MiniCup progress={level} color={colors.exercise} width={52} height={66} animate={!big} />
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <Text variant="h3" align="center">
          {big ? 'Reading your Health export' : 'Reading your files'}
        </Text>
        <Text variant="body" color="textSecondary" align="center" numberOfLines={2} testID="import-reading-line">
          {progress ? `${progress.name}${total > 1 ? ` · ${index + 1} of ${total}` : ''}${big ? ` · ${pct}% read` : ''}` : 'Opening…'}
        </Text>
        <Text variant="caption" color="textSecondary" align="center">
          {big ? `A large export takes a minute or two. ${HEALTH_EXPORT_SKIPS}` : 'A large archive can take a few seconds.'}
        </Text>
      </View>
      <ActivityIndicator color={colors.textSecondary} />
    </View>
  );
}
