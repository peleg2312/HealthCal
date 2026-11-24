/**
 * Profile > App, "Text size": the app's own text size, 100% to 200%, on this device (@/theme textSize).
 * Two cups, Smaller and Larger, either side of the size, so the row still fits at 200% on a 320 px phone;
 * the size is announced when it changes. It places words from `TEXT_SIZE_WORDS` only.
 */
import { Minus, Plus, Type } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { IconTile } from '@/features/settings/components';
import { setTextSize, TEXT_SIZES, textSizeLabel, useTextSize, useTheme } from '@/theme';
import { IconButton, Text } from '@/ui';

export const TEXT_SIZE_WORDS = {
  title: 'Text size',
  /** Under the title: what it changes and how it adds to the phone's own setting. */
  hint: "Every screen's text, on this device. Your phone's text size still applies, up to twice the size in all.",
  smaller: 'Smaller text',
  larger: 'Larger text',
} as const;

/** "Text size, 150%": the size as a screen reader hears it after a change. */
export function textSizeSpoken(scale: number): string {
  return `${TEXT_SIZE_WORDS.title}, ${textSizeLabel(scale)}`;
}

export function TextSizeRow() {
  const { colors, spacing } = useTheme();
  const size = useTextSize();
  const i = Math.max(0, TEXT_SIZES.indexOf(size));
  const step = (d: number) => setTextSize(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + d))]);
  return (
    <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconTile color={colors.weight}>
          <Type size={20} color={colors.weight} />
        </IconTile>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{TEXT_SIZE_WORDS.title}</Text>
          <Text variant="caption" color="textSecondary">
            {TEXT_SIZE_WORDS.hint}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton testID="profile-text-size-smaller" accessibilityLabel={TEXT_SIZE_WORDS.smaller} disabled={i === 0} onPress={() => step(-1)}>
          <Minus size={20} strokeWidth={2.2} color={i === 0 ? colors.textTertiary : colors.text} />
        </IconButton>
        <Text
          testID="profile-text-size"
          variant="title"
          align="center"
          tabular
          accessibilityLabel={textSizeSpoken(size)}
          accessibilityLiveRegion="polite"
          aria-live="polite"
          style={{ flex: 1 }}>
          {textSizeLabel(size)}
        </Text>
        <IconButton testID="profile-text-size-larger" accessibilityLabel={TEXT_SIZE_WORDS.larger} disabled={i === TEXT_SIZES.length - 1} onPress={() => step(1)}>
          <Plus size={20} strokeWidth={2.2} color={i === TEXT_SIZES.length - 1 ? colors.textTertiary : colors.text} />
        </IconButton>
      </View>
    </View>
  );
}
