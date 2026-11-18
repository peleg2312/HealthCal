/**
 * "Choose a drink" (`water-pick-sheet`): any drink for Juice's "Other juice" and Other's "Choose a
 * drink". Offline only: with an empty search the bundled non-alcoholic drinks and the milks
 * (`sheetDrinks`), with a query `searchLocal` (own foods, recents, favourites, bundled) without
 * alcohol (`withoutAlcohol`). Each row says what a glass adds and where its numbers come from
 * (`pickCaption`). A tap closes the sheet and makes that drink the kind's selected choice (the
 * screen remembers it); the person then taps a glass, so the calories are seen before they are added.
 *
 * Directly under the search field, "Or enter calories" (`water-pick-kcal-open`, in the sheet's first
 * view) opens an amount and a calories field (under the quick-add screen's limit), logged at once as
 * a quick entry "Other drink" (via the screen's `onEntered`, which goes through planDrink and
 * logDrink). The pinned button is there only while those fields are open, and says what it will do
 * before the tap ("Add 140 kcal to lunch"); the sheet never opens on a disabled button.
 */
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react-native';
import React, { useDeferredValue, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { resolveFood } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { searchLocal } from '@/services/foodSearch';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { formatNumber, volumeUnit, volumeValue } from '@/lib/units';
import { useTheme } from '@/theme';
import type { Food, UnitSystem } from '@/types';
import { Button, Divider, IconButton, NumberField, PressableScale, Sheet, Text, TextField } from '@/ui';

import { enteredKcalError, pickCaption, sheetDrinks, withoutAlcohol } from './rules';

export function DrinkPickSheet({
  visible,
  initialQuery,
  glassMl,
  units,
  onPick,
  onEntered,
  where,
  onClose,
}: {
  visible: boolean;
  /** "juice" for Juice's "Other juice", '' for Other. */
  initialQuery: string;
  glassMl: number;
  units: UnitSystem;
  onPick: (food: Food) => void;
  /** Amount in the person's units and calories typed in; the screen logs them. */
  onEntered: (amountShown: number, kcal: number) => void;
  /** Where entered calories go: "lunch", "yesterday's lunch" (mealOnDay). */
  where: string;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const glassShown = Math.round(volumeValue(glassMl, units));
  const [query, setQuery] = useState(initialQuery);
  const [amount, setAmount] = useState<number | null>(glassShown);
  const [kcalTyped, setKcalTyped] = useState<number | null>(null);
  const [entering, setEntering] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQuery(initialQuery);
      setAmount(glassShown);
      setKcalTyped(null);
      setEntering(false);
    }
  }

  const recentFoods = useStore((s) => s.recentFoods);
  const favoriteIds = useStore((s) => s.favoriteFoodIds);
  const customFoods = useLive('customFoods');
  const customById = useMemo(() => new Map(customFoods.map((f) => [f.id, f as Food])), [customFoods]);
  const recents = useMemo(() => recentFoods.map((f) => resolveFood(f, customById)).filter((f): f is Food => !!f).slice(0, 30), [recentFoods, customById]);
  const q = query.trim();
  // A slow search never holds up typing: the list follows a beat behind.
  const localQ = useDeferredValue(q);
  // Each drink with the search name the query found, when that was not its stored name (a Hebrew name).
  const rows: { food: Food; matched?: string }[] = useMemo(() => {
    if (!localQ) return sheetDrinks().map((food) => ({ food }));
    const hits = searchLocal(localQ, { customFoods, recentFoods: recents, favoriteIds }, 30);
    const kept = new Set(withoutAlcohol(hits.map((h) => h.food)).map((f) => f.id));
    return hits.filter((h) => kept.has(h.food.id)).map((h) => ({ food: h.food, matched: h.matched }));
  }, [localQ, customFoods, recents, favoriteIds]);
  const kcalError = enteredKcalError(kcalTyped);
  const canAdd = !!(amount && amount > 0 && kcalTyped && kcalTyped > 0 && !kcalError);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose a drink"
      footer={
        entering ? (
          <Button
            testID="water-pick-kcal-add"
            title={canAdd && kcalTyped ? `Add ${formatNumber(Math.round(kcalTyped))} kcal to ${where}` : `Add to ${where}`}
            disabled={!canAdd}
            onPress={() => {
              if (canAdd && amount && kcalTyped) onEntered(amount, kcalTyped);
            }}
          />
        ) : undefined
      }>
      <View testID="water-pick-sheet" style={{ gap: spacing.md }}>
        <TextField
          testID="water-pick-search"
          placeholder={width < 340 ? 'Search' : 'Search drinks'}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search drinks"
          left={<Search size={18} color={colors.textTertiary} />}
          right={
            query ? (
              <IconButton testID="water-pick-clear" accessibilityLabel="Clear search" tone="clear" size={32} onPress={() => setQuery('')}>
                <X size={16} color={colors.textSecondary} />
              </IconButton>
            ) : null
          }
        />
        <PressableScale
          testID="water-pick-kcal-open"
          onPress={() => setEntering((v) => !v)}
          scaleTo={0.985}
          accessibilityRole="button"
          accessibilityState={{ expanded: entering }}
          accessibilityLabel="Or enter calories"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
          <Text variant="bodyStrong" color="primaryInk" style={{ flex: 1 }}>
            Or enter calories
          </Text>
          {entering ? <ChevronUp size={20} color={colors.textSecondary} strokeWidth={1.9} /> : <ChevronDown size={20} color={colors.textSecondary} strokeWidth={1.9} />}
        </PressableScale>
        {entering ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <NumberField
              testID="water-pick-ml"
              label="Amount"
              suffix={volumeUnit(units)}
              decimals={0}
              value={amount}
              onChange={setAmount}
              style={{ flex: 1 }}
              accessibilityLabel={`Amount in ${volumeUnit(units)}`}
            />
            <NumberField
              testID="water-pick-kcal"
              label="Calories"
              suffix="kcal"
              placeholder="e.g. 120"
              decimals={0}
              value={kcalTyped}
              onChange={setKcalTyped}
              error={kcalError}
              style={{ flex: 1 }}
              accessibilityLabel="Calories in kcal"
            />
          </View>
        ) : null}
        <Divider />
        <Text testID="water-pick-hint" variant="caption" color="textSecondary">
          Tap a drink to choose it, then tap a glass to add it.
        </Text>
        <View>
          {rows.length === 0 && localQ !== q ? null : rows.length === 0 ? (
            // Judged only once the list has caught up with the typing: while it lags, nothing, never a false "No drink matches".
            <Text testID="water-pick-none" variant="body" color="textSecondary" style={{ paddingVertical: spacing.md }}>
              No drink matches “{isolateRtl(q)}”. Try another word, or enter the calories above.
            </Text>
          ) : (
            rows.map(({ food, matched }, i) => (
              <View key={food.id}>
                {i > 0 ? <Divider inset={36} /> : null}
                <PressableScale
                  testID={`water-pick-${food.id}`}
                  onPress={() => onPick(food)}
                  scaleTo={0.985}
                  accessibilityLabel={`${food.name}${matched ? `, ${matched}` : ''}, ${pickCaption(food, glassMl, units)}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 8 }}>
                  <View style={{ width: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 17, lineHeight: 24 }}>{food.emoji ?? '🥤'}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {isolateRtl(food.name)}
                    </Text>
                    {/* The name the query found, as on food search (FoodRow): one line under the name. */}
                    {matched ? (
                      <Text variant="caption" color="textSecondary" numberOfLines={1} testID={`water-pick-${food.id}-matched`}>
                        {isolateRtl(matched)}
                      </Text>
                    ) : null}
                    <Text variant="caption" color="textSecondary">
                      {pickCaption(food, glassMl, units)}
                    </Text>
                  </View>
                </PressableScale>
              </View>
            ))
          )}
        </View>
      </View>
    </Sheet>
  );
}
