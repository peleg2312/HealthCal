import { router, useLocalSearchParams } from 'expo-router';
import { Camera, PenLine, ScanBarcode, Search, Star, Utensils, X, Zap } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { BUILTIN_FOODS } from '@/data/foods';
import { FoodRow, MealPicker } from '@/features/food/components';
import { setFoodDraft } from '@/features/food/draft';
import { href, kcal, lastPortions, parseDate, parseMeal, portionFor, portionKcal, portionLabel } from '@/features/food/helpers';
import { logFood, logItems } from '@/features/food/log';
import { formatDayLabel } from '@/lib/dates';
import { nowISO } from '@/lib/id';
import { MEAL_LABEL, entriesTotal, sumNutrients } from '@/lib/nutrition';
import { searchLocal, searchOnlineWithStatus } from '@/services/foodSearch';
import { useStore } from '@/store';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { Food, MealType } from '@/types';
import { Avatar, Button, Chip, ChipRow, Divider, Header, IconButton, PressableScale, Screen, Text, TextField } from '@/ui';

type Tab = 'recent' | 'favorites' | 'mine' | 'meals';
type Online = { query: string; status: 'idle' | 'loading' | 'done'; items: Food[] };

const BUILTIN_BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

/** Freshest definition of a remembered food; null when it was an own food that has since been deleted. */
function resolveFood(f: Food, customById: Map<string, Food>): Food | null {
  if (f.source === 'custom') return customById.get(f.id) ?? null;
  return BUILTIN_BY_ID.get(f.id) ?? f;
}

export default function FoodSearchScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const date = parseDate(params.date);
  const [meal, setMeal] = useState<MealType>(() => parseMeal(params.meal));
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('recent');
  const [onlineResult, setOnlineResult] = useState<{ query: string; items: Food[]; failed: boolean; unavailable: boolean }>({ query: '', items: [], failed: false, unavailable: false });
  const [openedAt] = useState(() => nowISO());

  const recentFoods = useStore((s) => s.recentFoods);
  const favoriteIds = useStore((s) => s.favoriteFoodIds);
  const customFoods = useLive('customFoods');
  const savedMeals = useLive('savedMeals');
  const entries = useLive('foodEntries');

  const lastMap = useMemo(() => lastPortions(entries), [entries]);
  const customById = useMemo(() => new Map(customFoods.map((f) => [f.id, f as Food])), [customFoods]);
  const recents = useMemo(
    () => recentFoods.map((f) => resolveFood(f, customById)).filter((f): f is Food => !!f).slice(0, 30),
    [recentFoods, customById],
  );
  const favorites = useMemo(() => {
    const byId = new Map<string, Food>();
    for (const f of recentFoods) byId.set(f.id, f);
    for (const [id, f] of BUILTIN_BY_ID) byId.set(id, f);
    for (const [id, f] of customById) byId.set(id, f);
    return favoriteIds.map((id) => (byId.has(id) ? resolveFood(byId.get(id)!, customById) : null)).filter((f): f is Food => !!f);
  }, [favoriteIds, recentFoods, customById]);
  const mine = useMemo(() => [...customFoods].sort((a, b) => a.name.localeCompare(b.name)), [customFoods]);

  const q = query.trim();
  const local = useMemo(
    () => (q ? searchLocal(q, { customFoods, recentFoods: recents, favoriteIds }, 30) : []),
    [q, customFoods, recents, favoriteIds],
  );

  // Online products arrive after a pause in typing; stale answers are dropped.
  const latest = useRef('');
  useEffect(() => {
    latest.current = q;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      const result = await searchOnlineWithStatus(q);
      if (latest.current === q) setOnlineResult({ query: q, ...result });
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  const online: Online = {
    query: q,
    status: q.length < 2 ? 'idle' : onlineResult.query === q ? 'done' : 'loading',
    // While a refined query loads, keep showing the previous answer.
    items: q.length < 2 ? [] : onlineResult.query && q.startsWith(onlineResult.query) ? onlineResult.items : [],
  };
  const localIds = new Set(local.map((h) => h.food.id));
  const onlineItems = online.items.filter((f) => !localIds.has(f.id)).slice(0, 15);

  // Running count of everything added to this day since the screen opened (Undo lowers it).
  const added = entries.filter((e) => e.date === date && e.loggedAt >= openedAt);
  const addedKcal = entriesTotal(added).kcal;

  const open = (food: Food) => {
    setFoodDraft(food);
    router.push(href('/food/detail', { meal, date }) as never);
  };
  const quickAdd = (food: Food) => {
    const p = portionFor(food, lastMap);
    logFood({ food, serving: p.serving, quantity: p.quantity, meal, date });
  };
  const go = (path: string, extra: Record<string, string> = {}) => router.push(href(path, { meal, date, ...extra }) as never);

  const row = (food: Food, testID: string, trailing?: React.ReactNode) => {
    const p = portionFor(food, lastMap);
    return (
      <FoodRow
        key={`${testID}`}
        testID={testID}
        food={food}
        subtitle={portionLabel(p.serving.label, p.quantity)}
        kcalValue={portionKcal(food, p)}
        onPress={() => open(food)}
        onQuickAdd={() => quickAdd(food)}
        trailing={trailing}
      />
    );
  };

  const escapes = (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <ActionTile testID="search-scan" icon={<ScanBarcode size={22} color={colors.primary} />} label="Scan barcode" onPress={() => go('/food/scan')} />
      <ActionTile testID="search-photo" icon={<Camera size={22} color={colors.primary} />} label="Photo or describe" onPress={() => go('/food/photo', { mode: 'photo' })} />
      <ActionTile testID="search-quick" icon={<Zap size={22} color={colors.primary} />} label="Quick add" onPress={() => go('/food/quick')} />
      <ActionTile testID="search-create" icon={<PenLine size={22} color={colors.primary} />} label="Create food" onPress={() => go('/food/custom', q ? { name: q } : {})} />
    </View>
  );

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      <Header title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} subtitle={formatDayLabel(date)} />
      <TextField
        testID="food-search-input"
        placeholder="Search foods, brands, your foods"
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
            <IconButton testID="food-search-clear" accessibilityLabel="Clear search" tone="clear" size={32} onPress={() => setQuery('')}>
              <X size={16} color={colors.textSecondary} />
            </IconButton>
          ) : null
        }
      />
    </View>
  );

  const footer =
    added.length > 0 ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text variant="title" testID="search-added-count">
            {added.length} added
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {kcal(addedKcal)} kcal · {formatDayLabel(date)}
          </Text>
        </View>
        <Button testID="search-done" title="Done" size="md" full={false} onPress={() => router.canGoBack() ? router.back() : router.replace(href('/diary', { date }) as never)} />
      </View>
    ) : undefined;

  return (
    <Screen header={header} footer={footer} testID="food-search-screen">
      <MealPicker value={meal} onChange={setMeal} testIDPrefix="search-meal" />

      {!q ? (
        <>
          {escapes}
          <ChipRow>
            <Chip testID="search-tab-recent" label="Recent" selected={tab === 'recent'} onPress={() => setTab('recent')} />
            <Chip testID="search-tab-favorites" label={`Favourites${favorites.length ? ` ${favorites.length}` : ''}`} selected={tab === 'favorites'} onPress={() => setTab('favorites')} />
            <Chip testID="search-tab-mine" label={`My foods${mine.length ? ` ${mine.length}` : ''}`} selected={tab === 'mine'} onPress={() => setTab('mine')} />
            <Chip testID="search-tab-meals" label={`Saved meals${savedMeals.length ? ` ${savedMeals.length}` : ''}`} selected={tab === 'meals'} onPress={() => setTab('meals')} />
          </ChipRow>
          {tab === 'recent' ? (
            recents.length ? (
              <List>{recents.map((f, i) => row(f, `recent-${i}`))}</List>
            ) : (
              <Hint title="Your recent foods live here" message="Everything you log shows up here so the next time takes one tap. Start by searching above." />
            )
          ) : null}
          {tab === 'favorites' ? (
            favorites.length ? (
              <List>{favorites.map((f, i) => row(f, `favorite-${i}`))}</List>
            ) : (
              <Hint
                icon={<Star size={22} color={colors.textTertiary} />}
                title="No favourites yet"
                message="Open any food and tap the star to keep it here."
              />
            )
          ) : null}
          {tab === 'mine' ? (
            <>
              {mine.length ? (
                <List>
                  {mine.map((f, i) =>
                    row(
                      f,
                      `mine-${i}`,
                      <IconButton
                        testID={`mine-${i}-edit`}
                        accessibilityLabel={`Edit ${f.name}`}
                        tone="clear"
                        size={40}
                        onPress={() => go('/food/custom', { id: f.id })}>
                        <PenLine size={17} color={colors.textSecondary} />
                      </IconButton>,
                    ),
                  )}
                </List>
              ) : (
                <Hint title="Foods you create" message="Add a food from its nutrition label once, then log it like any other." />
              )}
              <Button testID="search-create-food" variant="secondary" size="md" title="Create a food" icon={<PenLine size={18} color={colors.text} />} onPress={() => go('/food/custom')} />
            </>
          ) : null}
          {tab === 'meals' ? (
            savedMeals.length ? (
              <List>
                {savedMeals.map((m, i) => {
                  const total = sumNutrients(m.items.map((it) => it.nutrients)).kcal;
                  return (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <PressableScale
                        testID={`saved-meal-${i}`}
                        onPress={() => go('/food/meals')}
                        scaleTo={0.985}
                        accessibilityLabel={`${m.name}, ${m.items.length} items`}
                        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm }}>
                        <Avatar size={42}>
                          <Utensils size={20} color={colors.textSecondary} />
                        </Avatar>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {m.name}
                          </Text>
                          <Text variant="caption" color="textSecondary" numberOfLines={1}>
                            {m.items.length} {m.items.length === 1 ? 'item' : 'items'} · {kcal(total)} kcal
                          </Text>
                        </View>
                      </PressableScale>
                      <Button
                        testID={`saved-meal-${i}-log`}
                        title="Log"
                        size="sm"
                        variant="secondary"
                        full={false}
                        onPress={() => logItems(m.items, meal, date, `${m.name} added to ${MEAL_LABEL[meal].toLowerCase()}`)}
                      />
                    </View>
                  );
                })}
              </List>
            ) : (
              <Hint title="No saved meals yet" message="In the diary, open a meal's menu and choose Save as a meal. Then log it here in one tap." />
            )
          ) : null}
        </>
      ) : (
        <>
          {local.length > 0 ? (
            <List testID="search-local-results">{local.map((h, i) => row(h.food, `result-${i}`))}</List>
          ) : (
            <View testID="search-no-local" style={{ gap: 4, paddingVertical: spacing.sm }}>
              <Text variant="title">No matches in your foods or the reference list</Text>
              <Text variant="body" color="textSecondary">
                Try fewer words, check the online products below, or add it another way.
              </Text>
            </View>
          )}

          {q.length >= 2 ? (
            <View style={{ gap: spacing.xs }} testID="search-online">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">Online products</Text>
                  <Text variant="caption" color="textSecondary">
                    Community data from Open Food Facts. Check against the label.
                  </Text>
                </View>
                {online.status === 'loading' ? <ActivityIndicator color={colors.textSecondary} /> : null}
              </View>
              {onlineItems.length > 0 ? (
                <List>{onlineItems.map((f, i) => row(f, `online-${i}`))}</List>
              ) : online.status === 'done' ? (
                <Text variant="body" color="textTertiary" testID="search-online-empty" style={{ paddingVertical: spacing.sm }}>
                  {onlineResult.unavailable
                    ? 'Searching packaged products by name works in the phone app. Here in the browser you can still scan or type a barcode, or create the food yourself.'
                    : onlineResult.failed
                      ? 'Could not reach the online product database. Your own and bundled foods still work, and you can try again in a moment.'
                      : 'No online products match that search.'}
                </Text>
              ) : (
                <Text variant="body" color="textTertiary" style={{ paddingVertical: spacing.sm }}>
                  Searching Open Food Facts…
                </Text>
              )}
            </View>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <Text variant="label" color="textSecondary">
              {local.length === 0 && online.status === 'done' && onlineItems.length === 0 ? 'Add it another way' : "Can't find it?"}
            </Text>
            {escapes}
          </View>
        </>
      )}
    </Screen>
  );
}

function List({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const items = React.Children.toArray(children);
  return (
    <View testID={testID}>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 ? <Divider inset={54} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

function Hint({ title, message, icon }: { title: string; message: string; icon?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: 6 }}>
      {icon}
      <Text variant="title" align="center">
        {title}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {message}
      </Text>
    </View>
  );
}

function ActionTile({ icon, label, onPress, testID }: { icon: React.ReactNode; label: string; onPress: () => void; testID: string }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.96}
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: 84,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: spacing.sm,
      }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Text variant="caption" align="center" numberOfLines={2}>
        {label}
      </Text>
    </PressableScale>
  );
}
