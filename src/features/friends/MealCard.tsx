/**
 * A shown meal as friends see it: the person, "Lunch · Today · 3 foods", the foods one per line with their
 * portion and the mark of where their numbers come from, and calories only when the person switched them
 * on ("~" for an estimate). The same drawing is the show sheet's preview, so the preview is exactly the card.
 * No total, no budget, no time of day: food, not a score.
 */
import { Plus, Utensils } from 'lucide-react-native';
import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { RowEmoji } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { sourceInfo } from '@/features/food/helpers';
import { ideaFoodsPhrase } from '@/features/today/ideas';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { fonts, useLargeText, useTheme } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, Card, decorative, Divider, PressableScale, Text } from '@/ui';

import { CheerButton, PersonMark } from './components';
import type { SharedFoodSource, SharedMealItem } from './contract';
import { ADD_TO_DIARY, ADD_TO_DIARY_SHORT, friendSourceLabel, itemCaption, mealMeta } from './words';

/** A food's name as drawn: a bundled name's database capitals in lower case, any other as written. */
export function sharedName(item: Pick<SharedMealItem, 'name' | 'source'>): string {
  return displayFoodName({ name: item.name, source: item.source === 'builtin' || item.source === 'typical' ? 'builtin' : 'custom' });
}

/** A shown meal's foods in one line, by their heads: "Israeli salad, chicken breast and tahini dressing". */
export function mealFoodsLine(items: readonly Pick<SharedMealItem, 'name' | 'source'>[]): string {
  return ideaFoodsPhrase(items.map((i) => ({ name: i.name, source: i.source === 'builtin' || i.source === 'typical' ? ('builtin' as const) : ('custom' as const) })));
}

/** Where a shared food's numbers come from, in words: "Reference data", "Maya's own food", "AI estimate". */
export function sharedSourceWords(source: SharedFoodSource, owner: string): string {
  return friendSourceLabel(source, owner, sourceInfo(source).label);
}

/** One food on a shown meal: emoji, name, and at the end the source's mark, the portion and its calories when shown. */
export function SharedFoodRow({ item, showKcal, testID }: { item: SharedMealItem; showKcal: boolean; testID?: string }) {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const name = sharedName(item);
  const caption = itemCaption(item, showKcal);
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 4 }}>
      <RowEmoji emoji={item.emoji} />
      {/* The portion sits at the end of the name's line; a name too long for that line takes the row and the portion goes under it. */}
      <View style={{ flex: 1, minWidth: 0, flexDirection: large ? 'column' : 'row', flexWrap: 'wrap', alignItems: large ? 'flex-start' : 'baseline', columnGap: spacing.md, rowGap: 2 }}>
        <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold, flexShrink: 1, lineHeight: 24 }}>
          {isolateRtl(name)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginLeft: large ? 0 : 'auto', flexShrink: 1 }}>
          <SourceMark source={item.source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(item.source) }} />
          <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
            {caption}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** What a screen reader hears for a shown meal: who, which meal, then each food with its portion and source in words. */
export function mealSpoken(input: { name: string; meal: MealType; day: ISODate; today: ISODate; items: SharedMealItem[]; showKcal: boolean }): string {
  const foods = input.items.map((i) => `${withoutMarks(sharedName(i))}, ${withoutMarks(itemCaption(i, input.showKcal))}, ${sharedSourceWords(i.source, input.name)}`).join('; ');
  return `${withoutMarks(input.name)}, ${mealMeta(input.meal, input.day, input.today, input.items.length)}. ${foods}`;
}

/** The top of the card and its foods: the person, the meal's line, the fork-and-knife mark, the foods. */
export function MealCardBody({ name, avatar, meal, day, today, items, showKcal, testID }: { name: string; avatar: string; meal: MealType; day: ISODate; today: ISODate; items: SharedMealItem[]; showKcal: boolean; testID?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PersonMark name={name} avatar={avatar} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(name)}
          </Text>
          <Text variant="caption" color="textSecondary">
            {mealMeta(meal, day, today, items.length)}
          </Text>
        </View>
        {decorative(<Utensils size={20} color={colors.textSecondary} strokeWidth={1.9} />)}
      </View>
      <View testID={testID ? `${testID}-foods` : undefined}>
        {items.map((it, i) => (
          <SharedFoodRow key={`${i}-${it.name}`} item={it} showKcal={showKcal} testID={testID ? `${testID}-food-${i}` : undefined} />
        ))}
      </View>
    </View>
  );
}

/**
 * A friend's shown meal in the feed: the body opens the meal (view, then add); under a hairline, Cheer and
 * Add to my diary side by side (siblings of the body, never inside it).
 */
export function FeedMealCard({
  name,
  avatar,
  meal,
  day,
  today,
  items,
  showKcal,
  cheered,
  onOpen,
  onCheer,
  onAdd,
  testID,
}: {
  name: string;
  avatar: string;
  meal: MealType;
  day: ISODate;
  today: ISODate;
  items: SharedMealItem[];
  showKcal: boolean;
  cheered: boolean;
  onOpen: () => void;
  onCheer: () => void;
  onAdd: () => void;
  testID: string;
}) {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  // Under 360 px "Add to my diary" does not fit beside Cheer: the button says "Add to diary" there.
  const narrow = useWindowDimensions().width < 360;
  return (
    <Card padding={spacing.lg} testID={testID}>
      <PressableScale testID={`${testID}-open`} onPress={onOpen} scaleTo={0.99} accessibilityLabel={`${mealSpoken({ name, meal, day, today, items, showKcal })}. Open`}>
        <MealCardBody name={name} avatar={avatar} meal={meal} day={day} today={today} items={items} showKcal={showKcal} />
      </PressableScale>
      <View style={{ marginVertical: spacing.md }}>
        <Divider />
      </View>
      <View style={{ flexDirection: large ? 'column' : 'row', gap: spacing.sm }}>
        <View style={large ? undefined : { flex: 2 }}>
          <CheerButton testID={`${testID}-cheer`} cheered={cheered} label={`${name}'s ${meal === 'snack' ? 'snacks' : meal}`} onPress={onCheer} full />
        </View>
        <View style={large ? undefined : { flex: 3 }}>
          <Button
            testID={`${testID}-add`}
            title={narrow && !large ? ADD_TO_DIARY_SHORT : ADD_TO_DIARY}
            variant="secondary"
            size="sm"
            accessibilityLabel={`${narrow && !large ? ADD_TO_DIARY_SHORT : ADD_TO_DIARY}: ${withoutMarks(name)}'s ${meal === 'snack' ? 'snacks' : meal}`}
            icon={<Plus size={18} color={colors.text} strokeWidth={2.2} />}
            onPress={onAdd}
          />
        </View>
      </View>
    </Card>
  );
}

/** The show sheet's preview: the card exactly as friends see it, on the page's own surface, with no buttons. */
export function MealPreviewCard({ name, avatar, meal, day, today, items, showKcal }: { name: string; avatar: string; meal: MealType; day: ISODate; today: ISODate; items: SharedMealItem[]; showKcal: boolean }) {
  const { spacing } = useTheme();
  return (
    <Card padding={spacing.lg} testID="show-meal-preview" accessibilityLabel={`What they see: ${mealSpoken({ name, meal, day, today, items, showKcal })}`} {...(Platform.OS === 'web' ? ({ role: 'group' } as const) : null)}>
      <MealCardBody name={name} avatar={avatar} meal={meal} day={day} today={today} items={items} showKcal={showKcal} testID="show-meal-preview" />
    </Card>
  );
}
