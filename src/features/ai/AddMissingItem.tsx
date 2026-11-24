import { Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import type { AiFoodItem, Food } from '@/types';
import { Divider, ListRow, Text, TextField } from '@/ui';

import { RowEmoji } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';

import { foodToItem, matchFoods } from './localMatch';
import { AiGlyph } from './mark';

/**
 * Add something the analysis missed. Matches against the bundled reference
 * foods first (free and offline); asking the AI is offered only when live and
 * says that it uses an analysis.
 */
export function AddMissingItem({
  foods,
  onAdd,
  onAskAi,
  aiBusy,
}: {
  /** Foods to match against: the person's own first, then the bundled reference. */
  foods: Food[];
  onAdd: (item: AiFoodItem, food?: Food) => void;
  /** Undefined when AI is not available (sample mode). */
  onAskAi?: (text: string) => Promise<boolean>;
  aiBusy?: boolean;
}) {
  const { colors, spacing } = useTheme();
  // A 320 px phone cuts the example mid-word; it keeps the words that matter.
  const narrow = useWindowDimensions().width < 360;
  const [query, setQuery] = useState('');
  const q = query.trim();
  const matches = q.length >= 2 ? matchFoods(q, foods, 3) : [];
  const add = (item: AiFoodItem, food?: Food) => {
    onAdd(item, food);
    setQuery('');
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <TextField
        testID="ai-add-item-input"
        placeholder={narrow ? 'Add a missed item' : 'Add a missed item, e.g. 1 banana'}
        value={query}
        onChangeText={setQuery}
        returnKeyType="done"
        left={<Plus size={18} color={colors.textTertiary} />}
        accessibilityLabel="Add a missing item"
      />
      {q.length >= 2 ? (
        <View>
          {matches.map((food, i) => {
            const item = foodToItem(food, q);
            return (
              <View key={food.id}>
                {i > 0 ? <Divider inset={36} /> : null}
                <ListRow
                  testID={`ai-add-match-${i}`}
                  left={<RowEmoji emoji={food.emoji} />}
                  title={displayFoodName(food)}
                  subtitle={`${item.grams} g · ${item.kcal} kcal · ${food.source === 'custom' ? 'your food' : 'reference data'}`}
                  onPress={() => add(item, food)}
                  right={<Plus size={20} color={colors.text} strokeWidth={2.2} />}
                />
              </View>
            );
          })}
          {matches.length === 0 ? (
            <Text variant="caption" color="textSecondary" style={{ paddingVertical: spacing.sm }}>
              No match in your foods or the built-in foods.{onAskAi ? '' : ' Try a simpler name, such as “rice” or “apple”.'}
            </Text>
          ) : null}
          {onAskAi ? (
            <>
              {matches.length > 0 ? <Divider inset={36} /> : null}
              <ListRow
                testID="ai-add-ask-ai"
                left={
                  <View style={{ width: 24, alignItems: 'center' }}>
                    <AiGlyph name="estimate" size={19} color={colors.text} />
                  </View>
                }
                title={aiBusy ? 'Estimating…' : `Estimate “${q}” with AI`}
                subtitle="Uses one of today's analyses"
                onPress={aiBusy ? undefined : () => void onAskAi(q).then((ok) => ok && setQuery(''))}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
