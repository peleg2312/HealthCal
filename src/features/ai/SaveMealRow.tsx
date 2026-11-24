/**
 * The AI review's "Also save as a meal" in its footer, above the one button: a switch, off on every
 * visit, and while it is on the name of the saved meal (prefilled with the dish). The footer is where
 * the decision is made and always in view; inside the review the switch would sit far below the items.
 *
 * One row in both states, so turning it on never makes the footer taller than a field and the button:
 * off, the words "Also save as a meal" beside the switch; on, the name field takes the words' place
 * (field left, switch right), with the save mark at its start; a screen reader hears the field as
 * "Meal name for Saved meals" ("Meal name" is its placeholder while it is empty), never the switch's
 * name. So the review's items keep their room over the footer at 360 x 740 and 320 x 640.
 *
 * Only the switch is a control for a screen reader; the words beside it take a finger's tap as well
 * (`ai-save-meal-words`, a sibling, never a pressable around the switch), so a tap on "Also save as a
 * meal" is never lost. The field never takes focus by itself (that would raise the keyboard over the review).
 */
import { Save } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { SAVE_NAME_MAX, SAVE_NAME_PLACEHOLDER, SAVE_TOGGLE } from '@/features/food/saveWords';
import { useTheme } from '@/theme';
import { FadeUp, PressableScale, Text, TextField, Toggle } from '@/ui';

/** The name field's screen-reader name: its placeholder's words first, then where the meal goes. */
const SAVE_NAME_LABEL = `${SAVE_NAME_PLACEHOLDER} for Saved meals`;

export function SaveMealRow({ on, onChange, name, onName }: { on: boolean; onChange(v: boolean): void; name: string; onName(t: string): void }) {
  const { colors, spacing } = useTheme();
  return (
    <View testID="ai-save-meal-row" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 }}>
      {on ? (
        <FadeUp style={{ flex: 1, minWidth: 0 }}>
          <TextField
            testID="ai-save-meal-name"
            value={name}
            onChangeText={onName}
            // Its own name, apart from the switch's ("Also save as a meal"): two controls never share one.
            accessibilityLabel={SAVE_NAME_LABEL}
            placeholder={SAVE_NAME_PLACEHOLDER}
            left={<Save size={18} color={colors.textSecondary} strokeWidth={1.9} />}
            maxLength={SAVE_NAME_MAX}
            returnKeyType="done"
            autoCapitalize="sentences"
          />
        </FadeUp>
      ) : (
        <PressableScale
          testID="ai-save-meal-words"
          onPress={() => onChange(true)}
          feedback="none"
          scaleTo={1}
          hitSlop={4}
          accessible={false}
          focusable={false}
          importantForAccessibility="no-hide-descendants"
          style={{ flex: 1, minWidth: 0, minHeight: 36, justifyContent: 'center' }}>
          <Text variant="body" numberOfLines={1}>
            {SAVE_TOGGLE}
          </Text>
        </PressableScale>
      )}
      <Toggle testID="ai-save-meal" value={on} onChange={onChange} accessibilityLabel={SAVE_TOGGLE} />
    </View>
  );
}
