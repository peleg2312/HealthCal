/**
 * "Choose a drink" (`water-pick-sheet`): any drink, from the "Search" button beside "Add a drink" (an
 * empty search, whichever kind is showing), Juice's "Other juice" (opens on "juice") and Other's "Choose
 * a drink". The sheet only places what `sheetList` (./pick.ts) returns: with an empty search "Your
 * drinks" (the person's own, `yourDrinks`) and "All drinks" (the bundled drinks); with a query the
 * local drinks (three, then "Show all N"), the honest line when only foods or only alcohol matched, and
 * "Online products" (Open Food Facts, community data). Each row says what a glass adds and where its
 * numbers come from (`pickDetail`). A tap closes the sheet and hands the food to the screen, which puts
 * it where `placePick` says; the person then taps a glass, so the calories are seen before they are added.
 *
 * The online search runs only while the sheet is visible, from two characters, 450 ms after the typing
 * stops; an answer for an earlier query is dropped (and, if one ever arrives late, `sheetList` reads it
 * as still searching), and every opening starts with none, so "no online drinks" is said only of the
 * query as typed.
 *
 * Directly under the search field, "Or enter calories" (`water-pick-kcal-open`, in the sheet's first
 * view) opens an amount and a calories field (under the quick-add screen's limit), logged at once as
 * a quick entry "Other drink" (via the screen's `onEntered`, which goes through planDrink and
 * logDrink). The pinned button is there only while those fields are open, and says what it will do
 * before the tap ("Add 140 kcal to lunch"); the sheet never opens on a disabled button. The amount is held to
 * Water's "Other amount" rule (`drinkAmountCheck`): above 5 L the field says so and Add waits; above 2 L the
 * first press asks, under the fields, and a second press adds. Typed calories or a changed amount are not
 * dropped without asking ("Discard this drink?", the Sheet's `unsaved`).
 */
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react-native';
import React, { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions, View } from 'react-native';

import { resolveFood } from '@/features/food/usuals';
import { searchLocal, searchOnlineWithStatus } from '@/services/foodSearch';
import { onlineSearchAvailable } from '@/services/openFoodFacts';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { formatNumber, volumeToMl, volumeUnit, volumeValue } from '@/lib/units';
import { useTheme } from '@/theme';
import type { Food, UnitSystem } from '@/types';
import { Button, Divider, haptic, IconButton, NumberField, PressableScale, Sheet, Text, TextField } from '@/ui';
import { spokenUnits } from '@/lib/spokenUnits';

import { sheetList, type OnlineAnswer, type SheetItem } from './pick';
import { drinkAmountCheck, enteredKcalError } from './rules';

export function DrinkPickSheet({
  visible,
  initialQuery,
  glassMl,
  units,
  yours,
  onPick,
  onEntered,
  where,
  onClose,
}: {
  visible: boolean;
  /** "juice" for Juice's "Other juice", '' for Other and for the "Search" button. */
  initialQuery: string;
  /** "Your drinks" (`yourDrinks`), shown with an empty search. */
  yours: readonly Food[];
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
  // The amount (ml) asked about with "Tap Add again" (`drinkAmountCheck`); another amount is asked afresh.
  const [askedMl, setAskedMl] = useState<number | null>(null);
  const askId = `water-pick-ask-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const [showAll, setShowAll] = useState(false);
  const [online, setOnline] = useState<OnlineAnswer | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQuery(initialQuery);
      setShowAll(false);
      setOnline(null);
      setAmount(glassShown);
      setKcalTyped(null);
      setEntering(false);
      setAskedMl(null);
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
  // The local hits as the search gave them: sheetList keeps the drinks and picks the line for the rest.
  const local = useMemo(() => (localQ ? searchLocal(localQ, { customFoods, recentFoods: recents, favoriteIds }, 30) : []), [localQ, customFoods, recents, favoriteIds]);
  const list = sheetList({ query, localQuery: localQ, local, yours, online, onlineAvailable: onlineSearchAvailable, showAll, glassMl, units });
  const exclude = list.exclude.join('|');
  useEffect(() => {
    if (!visible || !list.searchOnline || !onlineSearchAvailable) return;
    const typed = q;
    let live = true;
    const timer = setTimeout(async () => {
      const r = await searchOnlineWithStatus(typed, { exclude: exclude ? exclude.split('|') : [] });
      // The sheet closed or the query changed meanwhile: this answer is stale and dropped.
      if (!live) return;
      setOnline({ query: typed, status: r.unavailable ? 'unavailable' : r.failed ? 'failed' : 'done', items: r.items });
    }, 450);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [visible, q, list.searchOnline, exclude]);
  const changeQuery = (text: string) => {
    setQuery(text);
    setShowAll(false);
  };
  const kcalError = enteredKcalError(kcalTyped);
  const amountMl = amount && amount > 0 ? volumeToMl(amount, units) : 0;
  const amountCheck = amountMl > 0 ? drinkAmountCheck(amountMl, units) : null;
  const askLine = amountCheck?.state === 'ask' && askedMl === amountMl ? amountCheck.line : null;
  const canAdd = !!(amount && amount > 0 && kcalTyped && kcalTyped > 0 && !kcalError && amountCheck?.state !== 'over');
  // Something typed and not added: closing by the backdrop, a drag, Escape or back asks first.
  const unsaved = entering && (kcalTyped !== null || amount !== glassShown);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose a drink"
      unsaved={unsaved ? 'Discard this drink?' : null}
      footer={
        entering ? (
          <Button
            testID="water-pick-kcal-add"
            title={canAdd && kcalTyped ? `Add ${formatNumber(Math.round(kcalTyped))} kcal to ${where}` : `Add to ${where}`}
            disabled={!canAdd}
            onPress={() => {
              if (!(canAdd && amount && kcalTyped)) return;
              // More than 2 L: asked once, under the fields; the same amount added again goes in.
              if (amountCheck?.state === 'ask' && askedMl !== amountMl) {
                setAskedMl(amountMl);
                haptic.warn();
                if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(amountCheck.line);
                return;
              }
              onEntered(amount, kcalTyped);
            }}
          />
        ) : undefined
      }>
      <View testID="water-pick-sheet" style={{ gap: spacing.md }}>
        <TextField
          testID="water-pick-search"
          placeholder={width < 340 ? 'Search' : 'Search drinks'}
          value={query}
          onChangeText={changeQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search drinks"
          left={<Search size={18} color={colors.textTertiary} />}
          right={
            query ? (
              <IconButton testID="water-pick-clear" accessibilityLabel="Clear search" tone="clear" size={32} onPress={() => changeQuery('')}>
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
          <View>
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
                // Above 5 L: the field's own error, and Add waits. Above 2 L, once Add was pressed: the question
                // under the fields, tied to this field.
                error={amountCheck?.state === 'over' ? amountCheck.line : null}
                accessibilityHint={askLine ?? undefined}
                {...((Platform.OS === 'web' && askLine ? { 'aria-describedby': askId } : {}) as object)}
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
            {/* Kept mounted while the fields are open (a polite live region), so the question is read as it appears. */}
            <View accessibilityLiveRegion="polite" {...(Platform.OS === 'web' ? { 'aria-live': 'polite' } : null)}>
              {askLine ? (
                <Text testID="water-pick-ask" nativeID={askId} variant="body" color="textSecondary" style={{ marginTop: 6 }}>
                  {askLine}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        <Divider />
        {/* With a query the hint goes: the keyboard leaves room for about three rows. */}
        {list.hint ? (
          <Text testID="water-pick-hint" variant="caption" color="textSecondary">
            Tap a drink to choose it, then tap a glass to add it.
          </Text>
        ) : null}
        <View>
          {list.items.map((item, i) => (
            <SheetLine key={item.key} item={item} first={i === 0} onPick={onPick} onShowAll={() => setShowAll(true)} />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

/** One item of `sheetList`, drawn as it says: a heading, a drink row, "Show all N" or a line of text. */
function SheetLine({ item, first, onPick, onShowAll }: { item: SheetItem; first: boolean; onPick: (food: Food) => void; onShowAll: () => void }) {
  const { spacing } = useTheme();
  if (item.type === 'heading') {
    return (
      <View testID={item.testID} style={{ paddingTop: first ? 0 : spacing.lg, paddingBottom: spacing.xs, gap: 2 }}>
        <Text variant="label" color="textSecondary">
          {item.text}
        </Text>
        {item.caption ? (
          <Text variant="caption" color="textSecondary">
            {item.caption}
          </Text>
        ) : null}
      </View>
    );
  }
  if (item.type === 'message') {
    return (
      <Text testID={item.testID} variant="body" color="textSecondary" style={{ paddingVertical: spacing.md }}>
        {item.text}
      </Text>
    );
  }
  if (item.type === 'more') {
    return (
      <PressableScale
        testID={item.testID}
        onPress={onShowAll}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={spokenUnits(item.label)}
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="bodyStrong" color="primaryInk">
          {item.text}
        </Text>
      </PressableScale>
    );
  }
  return (
    <View>
      {item.divider ? <Divider inset={36} /> : null}
      <PressableScale
        testID={item.testID}
        onPress={() => onPick(item.food)}
        scaleTo={0.985}
        accessibilityLabel={spokenUnits(item.label)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 8 }}>
        <View style={{ width: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, lineHeight: 24 }}>{item.food.emoji ?? '🥤'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {item.name}
          </Text>
          {/* The name the query found, as on food search (FoodRow): one line under the name. */}
          {item.matched ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1} testID={item.matchedTestID}>
              {item.matched}
            </Text>
          ) : null}
          <Text variant="caption" color="textSecondary">
            {item.detail}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}
