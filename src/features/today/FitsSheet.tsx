import { router } from 'expo-router';
import { Check, Plus, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { lastPortions, servingText } from '@/features/food/helpers';
import { logFood } from '@/features/food/log';
import { customFoodIndex, resolveFood, resolveUsuals, usualFoods } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { useLive } from '@/store/selectors';
import { fonts, useTheme } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, CupKey, Divider, EmptyState, IconButton, Sheet, Text } from '@/ui';

import { fitCandidates, rankFits, type Fit } from './fits';

/** "1 cup" or "1.5 × 1 cup"; `shown` draws a serving label written in Hebrew isolated (display only, never for a screen reader). */
function portionLabel(f: Fit, shown = false): string {
  const q = f.quantity;
  const label = shown ? servingText(f.serving.label) : f.serving.label;
  return q === 1 ? label : `${Number.isInteger(q) ? q : q.toFixed(1)} × ${label}`;
}

const SOURCE_LABEL: Record<Fit['from'], string> = { usual: 'Usual', favourite: 'Favourite', recent: 'Recent' };

/**
 * "What fits": up to eight of the user's own foods that fit in the calories
 * left, each one tap from the diary. Opened from the coach's protein tip
 * (ranked by protein per kcal) and from the calories-left number on Today.
 */
export function FitsSheet({
  visible,
  onClose,
  date,
  meal,
  kcalLeft,
  proteinFirst,
  proteinLeft,
}: {
  visible: boolean;
  onClose: () => void;
  date: ISODate;
  meal: MealType;
  kcalLeft: number;
  proteinFirst: boolean;
  proteinLeft: number;
}) {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const todayDate = useToday();
  const entries = useLive('foodEntries');
  const favourites = useLive('favorites');
  const recents = useStore((s) => s.recentFoods);
  const customFoods = useLive('customFoods');
  // Foods added while the sheet is open turn into ticks; cleared when it closes.
  const [added, setAdded] = useState<{ key: string; kcal: number }[]>([]);

  const close = () => {
    setAdded([]);
    onClose();
  };

  // While the sheet is open, rank against the budget it opened with, so a row does not vanish the moment it is added.
  const budget = kcalLeft + added.reduce((s, a) => s + a.kcal, 0);
  const customById = customFoodIndex(customFoods);
  const candidates = fitCandidates({
    // Own foods as they are now: an edited one uses today's values, a deleted one is left out.
    usual: resolveUsuals(usualFoods(entries, meal, todayDate, { limit: 8, withFood: true }), customById).map((u) => u.last),
    favourites: favourites.map((f) => resolveFood(f.food, customById)).filter((f) => f !== null),
    recents: recents.map((f) => resolveFood(f, customById)).filter((f) => f !== null),
    lastByFood: lastPortions(entries),
  });
  const fits = rankFits(candidates, { kcalLeft: budget, proteinFirst });
  const mealName = MEAL_LABEL[meal].toLowerCase();
  const left = formatNumber(Math.max(0, Math.round(budget)));

  const search = () => {
    close();
    setTimeout(() => router.push(`/food/search?meal=${meal}&date=${date}` as never), 60);
  };

  const add = (f: Fit) => {
    // The serving the row priced (`fitCandidates` resolves the remembered portion), so what is added is what was shown.
    logFood({ food: f.food, serving: f.serving, quantity: f.quantity, meal, date });
    setAdded((a) => [...a, { key: f.key, kcal: f.kcal }]);
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="What fits"
      footer={
        fits.length ? (
          <Button testID="fits-search" title="Search all foods" variant="secondary" icon={<Search size={18} color={colors.text} />} onPress={search} />
        ) : undefined
      }>
      <Text variant="body" color="textSecondary" testID="fits-intro">
        {proteinFirst
          ? `Your foods with the most protein for their calories, within ${left} kcal left. ${Math.max(0, Math.round(proteinLeft))} g of protein to go.`
          : `Your foods that fit in ${left} kcal left.`}{' '}
        {`Adds to ${mealName}.`}
      </Text>
      {fits.length === 0 ? (
        <View testID="fits-empty">
          <EmptyState
            emoji={budget > 0 ? '🔎' : '🧭'}
            title={candidates.length === 0 ? 'No food history yet' : budget > 0 ? 'Nothing you usually eat fits' : date === todayDate ? 'No calories left today' : 'No calories left that day'}
            message={
              candidates.length === 0
                ? 'Foods you log, star or eat often show up here, sized to what you have left.'
                : budget > 0
                  ? `None of your recent or favourite foods fits in ${left} kcal at the portion you usually have.`
                  : 'Your budget for the day is used. Search if you want to log something anyway.'
            }
            action="Search foods"
            onAction={search}
          />
        </View>
      ) : (
        <View testID="fits-list">
          {fits.map((f, i) => {
            const isAdded = added.some((a) => a.key === f.key);
            return (
              <React.Fragment key={f.key}>
                {i > 0 ? <Divider inset={34} /> : null}
                <View testID={`fits-row-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: 8 }}>
                  {/* Emoji are content marks only: 17 px, no tile. */}
                  <Text style={{ fontSize: 17, lineHeight: 22, width: 22, textAlign: 'center' }}>{f.food.emoji || '🍽️'}</Text>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
                      {isolateRtl(f.food.name)}
                    </Text>
                    {/* A narrow phone has no room for a numbers column: they lead the line under the name. */}
                    {narrow ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 }}>
                        <Text variant="numM" style={{ fontSize: 15, lineHeight: 20 }}>
                          {formatNumber(Math.round(f.kcal))}
                          <Text variant="unit">{' kcal'}</Text>
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <CupKey color={colors.protein} size={8} />
                          <Text variant="caption" color="textSecondary">
                            {`${Math.round(f.protein)} g protein`}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    <Text variant="caption" color="textSecondary" numberOfLines={2}>
                      {`${portionLabel(f, true)} · ${SOURCE_LABEL[f.from]}`}
                    </Text>
                  </View>
                  {narrow ? null : (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                        {formatNumber(Math.round(f.kcal))}
                        <Text variant="unit">{' kcal'}</Text>
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <CupKey color={colors.protein} size={8} />
                        <Text variant="caption" color="textSecondary">
                          {`${Math.round(f.protein)} g protein`}
                        </Text>
                      </View>
                    </View>
                  )}
                  <IconButton
                    testID={`fits-add-${i}`}
                    accessibilityLabel={isAdded ? `${f.food.name} added` : `Add ${f.food.name}, ${portionLabel(f)}, ${Math.round(f.kcal)} kilocalories, to ${mealName}`}
                    tone={isAdded ? 'primary' : 'surface'}
                    size={44}
                    disabled={isAdded}
                    onPress={() => add(f)}>
                    {isAdded ? <Check size={20} color={colors.onPrimary} strokeWidth={2.6} /> : <Plus size={20} color={colors.text} strokeWidth={2.2} />}
                  </IconButton>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
