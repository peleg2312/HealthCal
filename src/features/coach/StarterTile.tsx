import React from 'react';
import { View } from 'react-native';

import { cup, useTheme } from '@/theme';
import { CupKey, PressableScale, Text } from '@/ui';

/**
 * A starter in the coach's first view (ruling L3): a cup-shaped tile with a small key on top (filled in
 * the data colour for a question answered on the phone, an outline in the primary for the AI), the
 * question in bold (never cut: it wraps) and a caption saying where its answer comes from. Two sit
 * side by side in a row, stretched to one height; the sign-in tile takes the whole row.
 */
export function StarterTile({
  testID,
  question,
  caption,
  keyColor,
  keyVariant,
  onPress,
}: {
  testID: string;
  question: string;
  caption: string;
  keyColor: string;
  keyVariant: 'filled' | 'outline';
  onPress: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${question}${/[?.!]$/.test(question) ? ' ' : '. '}${caption}`}
      feedback="select"
      scaleTo={0.97}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 88,
        ...cup(radius.card),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
        gap: spacing.sm,
        justifyContent: 'space-between',
      }}>
      <View style={{ gap: spacing.sm }}>
        <CupKey color={keyColor} variant={keyVariant} size={10} />
        <Text variant="bodyStrong">{question}</Text>
      </View>
      <Text variant="caption" color="textSecondary">
        {caption}
      </Text>
    </PressableScale>
  );
}

/** Two tiles side by side, 8 px apart, the same height. */
export function StarterRow({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm }}>
      {children}
    </View>
  );
}
