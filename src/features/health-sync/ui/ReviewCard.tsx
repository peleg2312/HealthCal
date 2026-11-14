import React from 'react';
import { View } from 'react-native';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { fonts, useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Button, Card, Chip, CupKey, Text } from '@/ui';

import type { ReviewItem } from '../plan';

import { reviewLabels, reviewView } from './format';

/**
 * One workout in "Needs a look": what it is, where it came from, why it was
 * not added by itself, and the same choices the file import gives (add, skip,
 * replace the session it repeats), or the activity question when its type has
 * no match. The buttons are siblings of the text, never nested in a pressable.
 */
export function ReviewCard({
  item,
  units,
  hour12,
  todayDate,
  onAdd,
  onSkip,
  onReplace,
  onPick,
  onChoose,
}: {
  item: ReviewItem;
  units: UnitSystem;
  hour12: boolean;
  todayDate: ISODate;
  onAdd: (id: string) => void;
  onSkip: (id: string) => void;
  onReplace: (id: string) => void;
  /** One of the likely activities was tapped. */
  onPick: (id: string, activityId: string) => void;
  /** Open the full activity list. */
  onChoose: (id: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const v = reviewView(item, todayDate, units, hour12);
  const labels = reviewLabels(item, v);
  const asksActivity = item.kind === 'activity';
  const likely = item.alternatives.slice(0, 3).map((id) => ACTIVITY_BY_ID[id]).filter(Boolean);
  return (
    <Card testID={`health-review-${item.id}`} padding={16} style={{ gap: spacing.md }}>
      <View accessible accessibilityLabel={v.spoken} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {v.emoji ? <Text style={{ fontSize: 17, lineHeight: 22 }}>{v.emoji}</Text> : null}
            <Text variant="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.semibold, flexShrink: 1 }}>
              {v.title}
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            {v.meta}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <CupKey color={colors.textSecondary} size={8} variant={v.estimate || !v.added ? 'outline' : 'filled'} />
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {v.source}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          {v.added ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <CupKey color={colors.exercise} size={8} variant={v.estimate ? 'dashed' : 'filled'} />
              <Text variant="numM" tabular style={{ fontSize: 17, lineHeight: 22 }}>
                {v.added}
                <Text variant="unit"> kcal</Text>
              </Text>
            </View>
          ) : null}
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {v.detail}
          </Text>
        </View>
      </View>

      <Text variant="body" color="textSecondary" testID={`health-review-reason-${item.id}`}>
        {item.reason}
      </Text>

      {asksActivity && likely.length ? (
        <View role="group" aria-label={labels.likely} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {likely.map((a) => (
            <Chip key={a.id} testID={`health-review-pick-${a.id}-${item.id}`} label={a.name} onPress={() => onPick(item.id, a.id)} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {asksActivity ? (
          <Button
            testID={`health-review-choose-${item.id}`}
            title={likely.length ? 'Something else' : 'Choose activity'}
            accessibilityLabel={labels.choose}
            variant="secondary"
            size="sm"
            full={false}
            onPress={() => onChoose(item.id)}
          />
        ) : (
          <>
            {item.matchId ? (
              <Button
                testID={`health-review-replace-${item.id}`}
                title="Replace"
                accessibilityLabel={labels.replace}
                variant="secondary"
                size="sm"
                full={false}
                onPress={() => onReplace(item.id)}
              />
            ) : null}
            <Button
              testID={`health-review-add-${item.id}`}
              title={item.matchId ? 'Keep both' : 'Add'}
              accessibilityLabel={labels.add}
              variant={item.matchId ? 'ghost' : 'secondary'}
              size="sm"
              full={false}
              onPress={() => onAdd(item.id)}
            />
          </>
        )}
        <Button testID={`health-review-skip-${item.id}`} title="Skip" accessibilityLabel={labels.skip} variant="ghost" size="sm" full={false} onPress={() => onSkip(item.id)} />
      </View>
    </Card>
  );
}
