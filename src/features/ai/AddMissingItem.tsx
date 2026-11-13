import { Plus, Sparkles } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { BUILTIN_FOODS } from '@/data/foods';
import { useTheme } from '@/theme';
import type { AiFoodItem } from '@/types';
import { Avatar, Divider, ListRow, Text, TextField } from '@/ui';

import { foodToItem, matchFoods } from './localMatch';

/**
 * Add something the analysis missed. Matches against the bundled reference
 * foods first (free and offline); asking the AI is offered only when live and
 * says that it uses an analysis.
 */
export function AddMissingItem({
  onAdd,
  onAskAi,
  aiBusy,
}: {
  onAdd: (item: AiFoodItem) => void;
  /** Undefined when AI is not available (sample mode). */
  onAskAi?: (text: string) => Promise<boolean>;
  aiBusy?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const matches = q.length >= 2 ? matchFoods(q, BUILTIN_FOODS, 3) : [];
  const add = (item: AiFoodItem) => {
    onAdd(item);
    setQuery('');
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <TextField
        testID="ai-add-item-input"
        placeholder="Add a missed item, e.g. 1 banana"
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
                {i > 0 ? <Divider inset={56} /> : null}
                <ListRow
                  testID={`ai-add-match-${i}`}
                  left={<Avatar emoji={food.emoji ?? '🍽️'} size={40} />}
                  title={food.name}
                  subtitle={`${item.grams} g · ${item.kcal} kcal · reference data`}
                  onPress={() => add(item)}
                  right={<Plus size={18} color={colors.primary} />}
                />
              </View>
            );
          })}
          {matches.length === 0 ? (
            <Text variant="caption" color="textSecondary" style={{ paddingVertical: spacing.sm }}>
              No match in the built-in foods.{onAskAi ? '' : ' Try a simpler name, such as “rice” or “apple”.'}
            </Text>
          ) : null}
          {onAskAi ? (
            <>
              {matches.length > 0 ? <Divider inset={56} /> : null}
              <ListRow
                testID="ai-add-ask-ai"
                left={
                  <Avatar color={colors.primary} size={40}>
                    <Sparkles size={18} color={colors.primary} />
                  </Avatar>
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
