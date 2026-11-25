import { Undo2 } from 'lucide-react-native';
import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import type { MealType } from '@/types';
import { Button, Divider, RestoreRow, Sheet, Text, useGrownText } from '@/ui';

import { entryRemovedToast, mealOnDay } from './addedTo';
import { RowEmoji } from './components';
import { displayFoodName } from './displayName';
import { kcal } from './helpers';
import { deleteEntry } from './log';
import { undoAddLabel, visitAddCaption, VISIT_ADDS_TITLE, type VisitAdd } from './visitAdds';

/**
 * "Added in this search" (`search-added-sheet`): everything this visit of food search added, newest first, each
 * with its own Undo (`search-added-undo-<i>`), so an add can be taken back after its toast has gone. An add taken
 * back stays in its place as the kit's Restore row (`search-added-restore-<i>`), so nothing moves under the finger
 * and the Undo can be undone. Opened from the running count in search's footer (`search-added-open`).
 */
export function VisitAddsSheet({
  visible,
  adds,
  meal,
  today,
  onClose,
  onCloseSearch,
}: {
  visible: boolean;
  adds: VisitAdd[];
  meal: MealType;
  today: string;
  onClose: () => void;
  onCloseSearch: () => void;
}) {
  const { colors, spacing } = useTheme();
  const live = adds.filter((a) => !a.removed);
  const total = live.reduce((sum, a) => sum + a.entry.nutrients.kcal, 0);
  const web = Platform.OS === 'web';
  const grown = useGrownText();
  const stack = useWindowDimensions().width < 360 || grown;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={VISIT_ADDS_TITLE}
      subtitle={`${live.length} added · ${kcal(total)} kcal`}
      footer={
        // Side by side from 360 px at the designed text size; stacked under it, or as soon as text grows, so neither is cut.
        <View style={{ flexDirection: stack ? 'column' : 'row', gap: stack ? spacing.sm : spacing.md }}>
          <Button testID="search-added-back" title="Keep adding" variant="secondary" style={stack ? undefined : { flex: 1 }} onPress={onClose} />
          <Button testID="search-added-close" title="Close search" style={stack ? undefined : { flex: 1 }} onPress={onCloseSearch} />
        </View>
      }>
      {/* A list on the web, as search's own lists are. */}
      <View testID="search-added-sheet" {...(web ? { role: 'list' as const } : null)}>
        {adds.map(({ entry, removed }, i) => (
          <View key={entry.id} {...(web ? { role: 'listitem' as const } : null)}>
            {i > 0 ? <Divider inset={36} /> : null}
            {removed ? (
              <RestoreRow
                testID={`search-added-restore-${i}`}
                label={entryRemovedToast(isolateRtl(displayFoodName(entry)), mealOnDay(entry.meal, entry.date, today))}
                onRestore={() => useStore.getState().restore('foodEntries', entry.id)}
              />
            ) : (
              <View testID={`search-added-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 8 }}>
                <RowEmoji emoji={entry.emoji} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {isolateRtl(displayFoodName(entry))}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {visitAddCaption(entry, meal)}
                  </Text>
                </View>
                <Button
                  testID={`search-added-undo-${i}`}
                  title="Undo"
                  variant="ghost"
                  size="sm"
                  full={false}
                  accessibilityLabel={withoutMarks(undoAddLabel(entry))}
                  icon={<Undo2 size={18} color={colors.actionInk} />}
                  onPress={() => deleteEntry(entry)}
                />
              </View>
            )}
          </View>
        ))}
      </View>
    </Sheet>
  );
}
