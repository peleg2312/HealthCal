import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/theme';
import { MiniCup, Text } from '@/ui';

/** A sign of life while files are read: a cup filling file by file, and which file it is on. */
export function ReadingView({ progress }: { progress: { index: number; total: number; name: string } | null }) {
  const { colors, spacing } = useTheme();
  const total = progress?.total ?? 1;
  const index = progress?.index ?? 0;
  return (
    <View testID="import-reading" accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.huge }}>
      <MiniCup progress={(index + 0.5) / total} color={colors.exercise} width={52} height={66} />
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <Text variant="h3" align="center">
          Reading your files
        </Text>
        <Text variant="body" color="textSecondary" align="center" numberOfLines={2}>
          {progress ? `${progress.name}${total > 1 ? ` · ${index + 1} of ${total}` : ''}` : 'Opening…'}
        </Text>
        <Text variant="caption" color="textSecondary" align="center">
          A large archive can take a few seconds.
        </Text>
      </View>
      <ActivityIndicator color={colors.textSecondary} />
    </View>
  );
}
