import { RotateCcw } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { withoutMarks } from '@/lib/bidi';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/**
 * The second way back after a delete (the toast's Undo is the first, and it leaves on a timer): one quiet
 * row in the list the record was removed from, naming what was removed ("Almonds removed from lunch") with
 * a ghost "Restore" button at its end. No card, no tint, no warning colour: nothing went wrong. The list
 * that shows it decides how long it stays (for example until the screen is left) and calls `store.restore`
 * in `onRestore`. The button is 36 px tall and 44 px to touch, and its spoken name carries the label, so two
 * rows never share one name.
 *
 * testID: the Restore button is `testID`, the row around it `${testID}-row`.
 */
export function RestoreRow({ label, onRestore, testID }: { label: string; onRestore: () => void; testID?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      testID={testID ? `${testID}-row` : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" color="textSecondary" numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Button
        testID={testID}
        title="Restore"
        variant="ghost"
        size="sm"
        full={false}
        accessibilityLabel={`Restore, ${withoutMarks(label)}`}
        icon={<RotateCcw size={16} color={colors.primaryInk} strokeWidth={2.2} />}
        onPress={onRestore}
      />
    </View>
  );
}
