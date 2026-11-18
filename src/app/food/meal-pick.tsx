import { router } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import { BUILTIN_FOODS } from '@/data/foods';
import { savedItemFromFood, setItemAmount } from '@/features/food/build';
import { FoodRow } from '@/features/food/components';
import { amountLabel, kcal, lastPortions, portionFor, portionKcal, portionLabel, stepAmount } from '@/features/food/helpers';
import { addDraftItem, removeDraftItem, updateDraftItem, useMealDraft, type DraftRow } from '@/features/food/mealDraft';
import { RequireProfile } from '@/features/food/RequireProfile';
import { ItemAmountSheet } from '@/features/food/SavedMealParts';
import { isolateRtl } from '@/lib/bidi';
import { searchLocal, searchOnlineWithStatus } from '@/services/foodSearch';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { Food } from '@/types';
import { Button, Divider, EmptyState, Header, IconButton, Screen, Text, TextField, goBack, haptic, toast } from '@/ui';

const BUILTIN_BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

export default function MealPickRoute() {
  return (
    <RequireProfile>
      <MealPick />
    </RequireProfile>
  );
}

/**
 * Food picker for the meal builder. Same lists and search as /food/search, but
 * a tap adds the food to the meal being built instead of the diary.
 */
function MealPick() {
  const { colors, spacing } = useTheme();
  // At 320 px the search field holds about 26 characters, as on food search.
  const narrow = useWindowDimensions().width < 360;
  const active = useMealDraft((s) => s.active);
  const name = useMealDraft((s) => s.name);
  const rows = useMealDraft((s) => s.rows);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [online, setOnline] = useState<{ query: string; items: Food[] }>({ query: '', items: [] });
  const [startCount] = useState(() => useMealDraft.getState().rows.length);

  const recentFoods = useStore((s) => s.recentFoods);
  const favoriteIds = useStore((s) => s.favoriteFoodIds);
  const customFoods = useLive('customFoods');
  const entries = useLive('foodEntries');
  const lastMap = useMemo(() => lastPortions(entries), [entries]);
  const customById = useMemo(() => new Map(customFoods.map((f) => [f.id, f as Food])), [customFoods]);
  const recents = useMemo(
    () =>
      recentFoods
        .map((f) => (f.source === 'custom' ? (customById.get(f.id) ?? null) : (BUILTIN_BY_ID.get(f.id) ?? f)))
        .filter((f): f is Food => !!f)
        .slice(0, 30),
    [recentFoods, customById],
  );
  const q = query.trim();
  // A slow search never holds up typing: the local list follows a beat behind (the online search uses `q`).
  const localQ = useDeferredValue(q);
  const local = useMemo(
    () => (localQ ? searchLocal(localQ, { customFoods, recentFoods: recents, favoriteIds }, 30) : []),
    [localQ, customFoods, recents, favoriteIds],
  );

  const latest = useRef('');
  useEffect(() => {
    latest.current = q;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      const result = await searchOnlineWithStatus(q);
      if (latest.current === q) setOnline({ query: q, items: result.items });
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  const loading = q.length >= 2 && online.query !== q;
  const localIds = new Set(local.map((h) => h.food.id));
  const onlineItems = q.length >= 2 && online.query && q.startsWith(online.query) ? online.items.filter((f) => !localIds.has(f.id)).slice(0, 15) : [];

  // The latest row in the meal for each food: its list row shows a stepper.
  const rowByFood = new Map<string, DraftRow>();
  for (const r of rows) if (r.item.food) rowByFood.set(r.item.food.id, r);
  const editingRow = editing ? rows.find((r) => r.key === editing) : undefined;
  const added = rows.length - startCount;
  const total = rows.reduce((s, r) => s + r.item.nutrients.kcal, 0);

  const add = (food: Food) => {
    const p = portionFor(food, lastMap);
    addDraftItem(savedItemFromFood(food, p.serving, p.quantity));
    haptic.success();
  };
  const removeRow = (r: DraftRow) => {
    const undo = removeDraftItem(r.key);
    haptic.tap();
    toast(`Removed ${isolateRtl(r.item.name)}`, { label: 'Undo', onPress: undo });
  };

  const row = (food: Food, testID: string, matched?: string) => {
    const r = rowByFood.get(food.id);
    const p = portionFor(food, lastMap);
    return (
      <FoodRow
        key={testID}
        testID={testID}
        food={food}
        subtitle={r ? portionLabel(r.item.servingLabel, r.item.quantity) : portionLabel(p.serving.label, p.quantity)}
        kcalValue={r ? r.item.nutrients.kcal : portionKcal(food, p)}
        onPress={() => (r ? setEditing(r.key) : add(food))}
        onQuickAdd={() => add(food)}
        matched={matched}
        amount={
          r
            ? {
                label: amountLabel(r.item.servingLabel, r.item.quantity),
                onStep: (dir) => {
                  const q2 = stepAmount(r.item.quantity, r.item.servingLabel, dir);
                  if (q2 <= 0) return removeRow(r);
                  haptic.select();
                  updateDraftItem(r.key, setItemAmount(r.item, { label: r.item.servingLabel, grams: r.item.quantity > 0 ? r.item.grams / r.item.quantity : r.item.grams }, q2));
                },
                onOpen: () => setEditing(r.key),
              }
            : undefined
        }
      />
    );
  };

  if (!active) {
    return (
      <Screen header={<Header title="Add to meal" subtitle="No meal open" />}>
        <EmptyState emoji="🍱" title="No meal open" message="Start a new meal or recipe from Saved meals, then add foods to it here." action="Saved meals" onAction={() => router.replace('/food/meals' as never)} />
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      <Header title={`Add to ${isolateRtl(name.trim()) || 'new meal'}`} subtitle="Foods go into the meal, not the diary" />
      <TextField
        testID="meal-pick-input"
        placeholder={narrow ? 'Search foods and brands' : 'Search foods, brands, your foods'}
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search foods"
        left={<Search size={18} color={colors.textTertiary} />}
        right={
          query ? (
            <IconButton testID="meal-pick-clear" accessibilityLabel="Clear search" tone="clear" size={32} onPress={() => setQuery('')}>
              <X size={16} color={colors.textSecondary} />
            </IconButton>
          ) : null
        }
      />
    </View>
  );

  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Text variant="title" tabular testID="meal-pick-count">
          {rows.length} {rows.length === 1 ? 'item' : 'items'} · {kcal(total)} kcal
        </Text>
        <Text variant="caption" color="textSecondary">
          {added > 0 ? `${added} added just now` : 'Tap a food to add it'}
        </Text>
      </View>
      <Button testID="meal-pick-done" title="Done" size="md" full={false} onPress={() => goBack('/food/meal-edit')} />
    </View>
  );

  return (
    <Screen header={header} footer={footer} testID="meal-pick-screen">
      {!q ? (
        recents.length ? (
          <View style={{ gap: spacing.xs }}>
            <Text variant="label" color="textSecondary">
              Recent
            </Text>
            <List>{recents.map((f, i) => row(f, `pick-recent-${i}`))}</List>
          </View>
        ) : (
          <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.lg }}>
            Search above for each part of the meal.
          </Text>
        )
      ) : (
        <>
          {local.length ? (
            <List>{local.map((h, i) => row(h.food, `pick-result-${i}`, h.matched))}</List>
          ) : localQ === q ? (
            // Judged only once the list has caught up with the typing: while it lags, nothing, never a false "No matches".
            <Text variant="body" color="textSecondary" testID="meal-pick-none">
              No matches in your foods or the reference list.
            </Text>
          ) : null}
          {q.length >= 2 ? (
            <View style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">Online products</Text>
                  <Text variant="caption" color="textSecondary">
                    Community data from Open Food Facts
                  </Text>
                </View>
                {loading ? <ActivityIndicator color={colors.textSecondary} /> : null}
              </View>
              {onlineItems.length ? <List>{onlineItems.map((f, i) => row(f, `pick-online-${i}`))}</List> : null}
            </View>
          ) : null}
        </>
      )}
      <ItemAmountSheet
        key={editing ?? 'none'}
        item={editingRow?.item ?? null}
        onChange={(item) => editingRow && updateDraftItem(editingRow.key, item)}
        onRemove={() => {
          if (editingRow) removeRow(editingRow);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

function List({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 ? <Divider inset={36} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}
