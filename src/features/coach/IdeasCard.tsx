import { Plus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { ideaRow, PLATE_NOTE, overLine, type MealIdeas } from '@/features/today/ideas';
import { isolateRtl } from '@/lib/bidi';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import type { MealType } from '@/types';
import { Button, Divider, IconButton, Text } from '@/ui';

import { FEW_LEFT_ANSWER, IDEA_ADDED, ideaAddLabel, ideasHead, SEE_ALL_FITS } from './words';

/**
 * "Ideas for dinner" answered live (the newest phone answer of today): what is left, then up to three
 * meals that fit (`mealIdeas`, the same as What fits), each with an add cup beside it (a sibling, never
 * inside a pressable) that logs it to today through `logItems` with one Undo; a row once added reads
 * "Added". Over the budget one neutral line; under 150 kcal left the plain line. "See all that fits"
 * opens What fits.
 */
export function IdeasCard({
  ideas,
  meal,
  kcalLeft,
  isAdded,
  onAdd,
  onFits,
}: {
  ideas: MealIdeas;
  meal: MealType;
  kcalLeft: number;
  isAdded: (key: string) => boolean;
  onAdd: (index: number) => void;
  onFits: () => void;
}) {
  const { colors, spacing } = useTheme();
  const body =
    ideas.state === 'over' ? (
      <Text variant="body">{overLine(ideas.overBy, true)}</Text>
    ) : ideas.state === 'few' || ideas.ideas.length === 0 ? (
      <Text variant="body">{FEW_LEFT_ANSWER}</Text>
    ) : (
      <View>
        {ideas.ideas.map((idea, i) => {
          const row = ideaRow(idea.kcal, isAdded(`idea:${idea.key}`), kcalLeft);
          return (
            <React.Fragment key={idea.key}>
              {i > 0 ? <Divider /> : null}
              <View testID={`coach-idea-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm }}>
                {idea.emoji ? <Text style={{ fontSize: 17, lineHeight: 22, width: 22, textAlign: 'center' }}>{idea.emoji}</Text> : null}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {isolateRtl(idea.name)}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {`${formatNumber(Math.round(idea.kcal))} kcal · P ${Math.round(idea.protein)} g`}
                  </Text>
                  {row.kind === 'dim' ? (
                    <Text variant="caption" color="textSecondary">
                      {row.caption}
                    </Text>
                  ) : null}
                </View>
                {row.kind === 'added' ? (
                  <View style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Text variant="caption" color="textSecondary" testID={`coach-idea-added-${i}`}>
                      {IDEA_ADDED}
                    </Text>
                  </View>
                ) : (
                  // The same outlined "+" cup as a food row's in search and a saved meal's: it adds at once, with Undo.
                  <IconButton testID={`coach-idea-add-${i}`} accessibilityLabel={ideaAddLabel(idea.name, meal)} size={44} tone="surface" onPress={() => onAdd(i)}>
                    <Plus size={20} color={colors.text} strokeWidth={2.2} />
                  </IconButton>
                )}
              </View>
            </React.Fragment>
          );
        })}
        {ideas.plates ? (
          <Text variant="caption" color="textSecondary" style={{ marginTop: spacing.xs }}>
            {PLATE_NOTE}
          </Text>
        ) : null}
      </View>
    );
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="bodyStrong">{ideasHead(kcalLeft, meal)}</Text>
      {body}
      <Button testID="coach-local-fits" title={SEE_ALL_FITS} variant="ghost" size="sm" full={false} onPress={onFits} style={{ alignSelf: 'flex-start', marginLeft: -spacing.sm }} />
    </View>
  );
}
