import React from 'react';
import { View } from 'react-native';

import { spokenUnits } from '@/lib/spokenUnits';
import { useTheme } from '@/theme';
import { CupKey, SectionTitle, Text } from '@/ui';

import { ADJUST_TITLE, WELL_TITLE, type ReviewItem } from './review';

/**
 * "What went well" (variant 'well', filled keys) or "What to improve" (variant 'adjust', outline
 * keys; the one calorie item over the band carries the filled amber over-target mark; "The whole day
 * is logged" a neutral key, since it is about the diary rather than calories). Bare rows on
 * the page, each one fact with its numbers, in the text colour: the key is the only colour. Rows
 * are plain text, never pressable. Nothing is drawn without items.
 */
export function ReviewList({ variant, items }: { variant: 'well' | 'adjust'; items: ReviewItem[] }) {
  const { colors, spacing, typography } = useTheme();
  if (items.length === 0) return null;
  // A data colour means one data kind: "The whole day is logged" is about the diary, not calories, so its
  // key is neutral (it would otherwise sit beside the amber over-target key in the same colour family).
  const keyColor = (item: ReviewItem) => (item.mark === 'warning' ? colors.warning : item.kind === 'logged' ? colors.textSecondary : colors[item.color]);
  const testID = variant === 'well' ? 'morning-well' : 'morning-adjust';
  return (
    <View testID={testID}>
      <SectionTitle title={variant === 'well' ? WELL_TITLE : ADJUST_TITLE} testID={testID} />
      <View style={{ marginTop: spacing.md, gap: spacing.md }}>
        {items.map((item) => {
          // A row can start with "about": the list shows it as a sentence.
          const text = item.text.charAt(0).toUpperCase() + item.text.slice(1);
          return (
            <View key={item.kind} testID={`${testID}-${item.kind}`} accessible accessibilityLabel={spokenUnits(text)} style={{ flexDirection: 'row', gap: spacing.md }}>
              {/* The key sits on the first line of the text. */}
              <View style={{ height: typography.body.lineHeight, justifyContent: 'center' }}>
                <CupKey color={keyColor(item)} variant={item.mark === 'outline' ? 'outline' : 'filled'} />
              </View>
              <Text variant="body" color="text" style={{ flex: 1, minWidth: 0 }}>
                {text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
