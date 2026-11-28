/**
 * Saved meals and recipes friends show the person (proposal 5b, seen from the other side): one card of compact rows
 * (the friend's cup, "Maya · Chicken bowl", the foods' heads under it), with Cheer and "Save to my meals" as 36 px
 * cups beside the row, never inside it. A row opens the meal's sheet (every food and portion, Add to my diary, Save to
 * my meals). They have no day, so they are kept apart from the feed by day.
 */
import { BookmarkPlus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { cheerMeal } from '@/services/friends';
import { fonts, useLargeText, useTheme } from '@/theme';
import type { FeedSavedMeal } from '@/types';
import { Card, Divider, IconButton, PressableScale, Text, toast } from '@/ui';

import { saveToMyMeals } from './borrow';
import { CheerCup, PersonMark } from './components';
import { itemRole, listRole } from './FeedParts';
import { mealFoodsLine } from './MealCard';
import { borrowedName, saveCupLabel } from './words';

/** "Save to my meals" as a 36 px cup (44 to touch); it shows no words, so it is named by what it saves. */
export function SaveCup({ what, onPress, testID }: { what: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <IconButton testID={testID} size={36} accessibilityLabel={saveCupLabel(what)} onPress={onPress}>
      <BookmarkPlus color={colors.text} size={18} />
    </IconButton>
  );
}

function SavedRow({ meal, withPerson, testID, onOpen }: { meal: FeedSavedMeal; withPerson: boolean; testID: string; onOpen: () => void }) {
  const { spacing } = useTheme();
  const large = useLargeText();
  const who = withoutMarks(meal.displayName);
  const what = borrowedName(who, meal.name);
  const detail = mealFoodsLine(meal.items);
  const spoken = `${withPerson ? `${who} · ` : ''}${meal.name}, ${detail}. Open the meal`;
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: large ? 'wrap' : 'nowrap', alignItems: 'center', columnGap: spacing.sm, paddingRight: spacing.lg, paddingBottom: large ? spacing.sm : 0 }}>
      <PressableScale
        testID={`${testID}-open`}
        onPress={onOpen}
        focusRing="inside"
        scaleTo={0.99}
        accessibilityLabel={spoken}
        style={{ flex: large ? undefined : 1, flexBasis: large ? '100%' : undefined, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm, paddingLeft: spacing.lg }}>
        {withPerson ? <PersonMark name={meal.displayName} avatar={meal.avatar} id={meal.userId} size={36} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" numberOfLines={large ? 4 : 2}>
            {withPerson ? (
              <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
                {`${isolateRtl(meal.displayName)} · `}
              </Text>
            ) : null}
            {isolateRtl(meal.name)}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={large ? 3 : 1} testID={`${testID}-detail`}>
            {detail}
          </Text>
        </View>
      </PressableScale>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: large ? 'auto' : 0 }}>
        <CheerCup testID={`${testID}-cheer`} cheered={meal.cheered} what={what} onPress={() => void cheerMeal(meal.userId, meal.ref).then((r) => !r.ok && toast(r.message))} />
        <SaveCup testID={`${testID}-save`} what={what} onPress={() => saveToMyMeals({ owner: meal.displayName, what: { name: meal.name }, items: meal.items, servings: meal.servings })} />
      </View>
    </View>
  );
}

/** The card: a level-2 title over the rows (a list on the web). */
export function FriendSavedMeals({ title, meals, withPerson, onOpen, testID }: { title: string; meals: FeedSavedMeal[]; withPerson: boolean; onOpen: (m: FeedSavedMeal) => void; testID: string }) {
  const { spacing } = useTheme();
  if (!meals.length) return null;
  return (
    <View style={{ gap: spacing.md }} testID={testID}>
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {title}
      </Text>
      <Card padding={0}>
        <View {...listRole}>
          {meals.map((m, i) => (
            <View key={`${m.userId}-${m.ref}`} {...itemRole}>
              {i > 0 ? <Divider inset={spacing.lg} /> : null}
              <SavedRow meal={m} withPerson={withPerson} testID={`${testID}-${i}`} onOpen={() => onOpen(m)} />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
