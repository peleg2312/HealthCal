import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { PenLine, ScanBarcode, Search, Utensils, X, Zap } from 'lucide-react-native';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import { AiGlyph } from '@/features/ai/mark';
import { AmountEditor } from '@/features/food/AmountEditor';
import { FoodRow, MealPicker } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { setFoodDraft } from '@/features/food/draft';
import { amountLabel, href, kcal, lastPortions, matchServing, parseDate, parseMeal, portionFor, portionKcal, portionLabel, stepAmount } from '@/features/food/helpers';
import { deleteEntry, logFood, setEntryAmount } from '@/features/food/log';
import { FavoriteStar } from '@/features/food/FavoriteStar';
import { toggleFoodFavorite } from '@/features/food/favoriteActions';
import { favoriteFoodsInVisit, isFavoriteMeal, mealToSave } from '@/features/food/favorites';
import { favoriteActionLabel, favoriteLabel, FAVOURITE_GROUPS, FAVOURITES_EMPTY } from '@/features/food/favoriteWords';
import { LogSavedMealSheet } from '@/features/food/SavedMealParts';
import { SaveCurrentMealRow, SavedMealRow, useVisitOrder } from '@/features/food/SavedMealRow';
import { loadSearchTab, openingTab, rememberSearchTab, useSearchTab, type SearchTab } from '@/features/food/searchTab';
import { resolveFood, usualFoods } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { formatDayLabel } from '@/lib/dates';
import { MEAL_LABEL, entriesTotal } from '@/lib/nutrition';
import { searchLocal, searchOnlineWithStatus } from '@/services/foodSearch';
import { useToday } from '@/store/clock';
import { favoriteRecordId, useStore } from '@/store';
import { useDay, useLive } from '@/store/selectors';
import { cup, motion, useTheme } from '@/theme';
import type { Food, FoodEntry, MealType, SavedMeal } from '@/types';
import { AnimatedNumber, Button, Chip, ChipRow, Divider, EmptyState, Header, IconButton, PressableScale, Screen, Sheet, Text, TextField } from '@/ui';

type Tab = SearchTab;
type Online = { query: string; status: 'idle' | 'loading' | 'done'; items: Food[] };

export default function FoodSearchScreen() {
  const { colors, spacing } = useTheme();
  // A 320 px phone cannot fit the long hint; it keeps the words that matter.
  const narrow = useWindowDimensions().width < 360;
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const todayDate = useToday();
  const date = parseDate(params.date, todayDate);
  const [meal, setMeal] = useState<MealType>(() => parseMeal(params.meal));
  const [query, setQuery] = useState('');
  // null until the user picks a tab: then the tab chosen last on this device, else Usual when there is
  // history for this meal (`openingTab`). A tap is remembered on the device (`healthcal.searchTab`).
  const [pickedTab, setPickedTab] = useState<Tab | null>(null);
  const rememberedTab = useSearchTab((s) => s.tab);
  useEffect(() => {
    void loadSearchTab();
  }, []);
  const setTab = (t: Tab) => {
    setPickedTab(t);
    rememberSearchTab(t);
  };
  const [amountEntryId, setAmountEntryId] = useState<string | null>(null);
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const [onlineResult, setOnlineResult] = useState<{ query: string; items: Food[]; failed: boolean; unavailable: boolean }>({ query: '', items: [], failed: false, unavailable: false });
  // Entries that already existed when the screen opened. Compared by id, not by time: a clock
  // that was wrong when an entry was logged must not make old entries count as added here.
  const [existing] = useState(() => new Set(Object.keys(useStore.getState().foodEntries)));

  const recentFoods = useStore((s) => s.recentFoods);
  // Declared here: the header's short line shows it.
  const left = Math.round(useDay(date).remaining);
  const favoriteIds = useStore((s) => s.favoriteFoodIds);
  // Every favourite record, removed ones too: a food unstarred in the Favourites tab keeps its row on this visit.
  const favoriteRecords = useStore((s) => s.favorites);
  // The favourite foods when the screen came into view (`favoriteFoodsInVisit`).
  const [visitFoodIds, setVisitFoodIds] = useState<string[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      setVisitFoodIds(useStore.getState().favoriteFoodIds);
    }, []),
  );
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
    // Each favourite carries its own definition; favoriteFoodIds gives the newest-first order, and the order
    // fixed on this visit keeps a food unstarred here listed (with its outline star) until the next visit.
    const listed = favoriteFoodsInVisit(favoriteIds, visitFoodIds);
    return listed
      .map((id) => {
        const food = favoriteRecords[favoriteRecordId(id)]?.food;
        return food ? resolveFood(food, customById) : null;
      })
      .filter((f): f is Food => !!f);
  }, [favoriteRecords, favoriteIds, visitFoodIds, customById]);
  const usuals = useMemo(
    () =>
      usualFoods(entries, meal, todayDate, { limit: 12, withFood: true })
        .map((u) => (u.food ? resolveFood(u.food, customById) : null))
        .filter((f): f is Food => !!f),
    [entries, meal, todayDate, customById],
  );
  // Saved meals in the order fixed when the screen came into view (favourites first): a star changes only
  // its icon until the next visit. The Favourites tab keeps a meal unstarred on this visit, so it can be starred again.
  const { ordered, starredAtVisit } = useVisitOrder(savedMeals);
  const favMeals = ordered.filter((m) => isFavoriteMeal(m) || starredAtVisit.has(m.id));
  // Favourites opens from memory only while it lists something (what this visit lists, so an unstar there never
  // moves the tab); the Usual tab only exists for a meal with history: after switching to a meal without, fall back.
  const tab: Tab = openingTab(pickedTab, rememberedTab, { usual: usuals.length > 0, favorites: favMeals.length + favorites.length > 0 });
  // What is starred now (a food unstarred on this visit keeps its row, not its count).
  const favCount = favorites.filter((f) => favoriteIds.includes(f.id)).length + savedMeals.filter(isFavoriteMeal).length;
  // "Save lunch as a meal": the meal shown on this day, while it holds two foods or more that are not a saved meal yet.
  const toSave = mealToSave(entries, meal, date, savedMeals);
  const mine = useMemo(() => [...customFoods].sort((a, b) => a.name.localeCompare(b.name)), [customFoods]);

  const q = query.trim();
  // The local list follows the typing a beat behind when a search is slow (an older phone), so a
  // keystroke never waits for it; the online search below still uses the query as typed.
  const localQ = useDeferredValue(q);
  const local = useMemo(
    () => (localQ ? searchLocal(localQ, { customFoods, recentFoods: recents, favoriteIds }, 30) : []),
    [localQ, customFoods, recents, favoriteIds],
  );
  // "No matches" is judged only once the local list has caught up with the typing; while it lags,
  // the previous list stays (or nothing shows), never the empty state for a query that has matches.
  const noLocal = localQ === q && local.length === 0;

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
  const added = entries.filter((e) => e.date === date && !existing.has(e.id));
  const addedKcal = entriesTotal(added).kcal;
  // Latest entry added from this screen for each food in the current meal: its row shows a stepper.
  const addedByFood = new Map<string, FoodEntry>();
  for (const e of added) {
    if (!e.foodId || e.meal !== meal || !e.food) continue;
    const prev = addedByFood.get(e.foodId);
    if (!prev || e.loggedAt > prev.loggedAt) addedByFood.set(e.foodId, e);
  }
  const amountEntry = amountEntryId ? added.find((e) => e.id === amountEntryId) : undefined;

  const open = (food: Food) => {
    setFoodDraft(food);
    router.push(href('/food/detail', { meal, date }) as never);
  };
  const quickAdd = (food: Food) => {
    const p = portionFor(food, lastMap);
    logFood({ food, serving: p.serving, quantity: p.quantity, meal, date });
  };
  const go = (path: string, extra: Record<string, string> = {}) => router.push(href(path, { meal, date, ...extra }) as never);

  const row = (food: Food, testID: string, trailing?: React.ReactNode, matched?: string) => {
    const p = portionFor(food, lastMap);
    const e = addedByFood.get(food.id);
    return (
      <FoodRow
        key={`${testID}`}
        testID={testID}
        food={food}
        subtitle={e ? portionLabel(e.servingLabel, e.quantity) : portionLabel(p.serving.label, p.quantity)}
        kcalValue={e ? e.nutrients.kcal : portionKcal(food, p)}
        onPress={() => open(food)}
        onQuickAdd={() => quickAdd(food)}
        // Press and hold stars it (or unstars it), with a toast and Undo; the row does not open.
        onLongPress={() => toggleFoodFavorite(food)}
        longPressLabel={favoriteActionLabel(favoriteIds.includes(food.id))}
        trailing={trailing}
        matched={matched}
        amount={
          e
            ? {
                label: amountLabel(e.servingLabel, e.quantity),
                onStep: (dir) => setEntryAmount(e, stepAmount(e.quantity, e.servingLabel, dir)),
                onOpen: () => setAmountEntryId(e.id),
              }
            : undefined
        }
      />
    );
  };

  // One compact row of four (a short word under each icon, the full name for a screen reader), so the list starts higher.
  const escapes = (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <ActionTile testID="search-scan" icon={<ScanBarcode size={18} color={colors.text} strokeWidth={1.9} />} label="Barcode" a11y="Scan barcode" onPress={() => go('/food/scan')} />
      <ActionTile testID="search-photo" icon={<AiGlyph name="photo" size={18} color={colors.text} />} label="Photo" a11y="Photo or describe" onPress={() => go('/food/photo', { mode: 'photo' })} />
      <ActionTile testID="search-quick" icon={<Zap size={18} color={colors.text} strokeWidth={1.9} />} label="Quick add" a11y="Quick add" onPress={() => go('/food/quick')} />
      <ActionTile testID="search-create" icon={<PenLine size={18} color={colors.text} strokeWidth={1.9} />} label="Create" a11y="Create food" onPress={() => go('/food/custom', q ? { name: q } : {})} />
    </View>
  );

  const meals = <Chip testID="search-tab-meals" label={`Saved meals${savedMeals.length ? ` ${savedMeals.length}` : ''}`} selected={tab === 'meals'} onPress={() => setTab('meals')} />;

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      {/* The day and what is left of its budget: one short line, so the list starts higher (logging speed). */}
      <Header title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} subtitle={`${formatDayLabel(date)} · ${kcal(Math.abs(left))} kcal ${left < 0 ? 'over' : 'left'}`} close />
      <TextField
        testID="food-search-input"
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
            <IconButton testID="food-search-clear" accessibilityLabel="Clear search" tone="clear" size={32} onPress={() => setQuery('')}>
              <X size={16} color={colors.textSecondary} />
            </IconButton>
          ) : null
        }
      />
    </View>
  );

  // Only once something is added: the running count and Done. The budget is in the header's short line.
  const footer =
    added.length > 0 ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <Text variant="title" testID="search-added-count" tabular style={{ flex: 1 }}>
          {`${added.length} added · `}
          <AnimatedNumber variant="title" value={addedKcal} format={kcal} duration={motion.duration.pourSmall} />
          {' kcal'}
        </Text>
        <Button testID="search-done" title="Done" size="md" full={false} onPress={() => (router.canGoBack() ? router.back() : router.replace(href('/diary', { date }) as never))} />
      </View>
    ) : undefined;

  return (
    <Screen header={header} footer={footer} testID="food-search-screen">
      <MealPicker value={meal} onChange={setMeal} testIDPrefix="search-meal" />

      {!q ? (
        <>
          {escapes}
          <ChipRow>
            {usuals.length ? <Chip testID="search-tab-usual" label="Usual" selected={tab === 'usual'} onPress={() => setTab('usual')} /> : null}
            <Chip testID="search-tab-recent" label="Recent" selected={tab === 'recent'} onPress={() => setTab('recent')} />
            <Chip testID="search-tab-favorites" label={`Favourites${favCount ? ` ${favCount}` : ''}`} selected={tab === 'favorites'} onPress={() => setTab('favorites')} />
            {/* Saved meals move ahead of My foods once there are any, so the chip shows without scrolling the row. */}
            {savedMeals.length ? meals : null}
            <Chip testID="search-tab-mine" label={`My foods${mine.length ? ` ${mine.length}` : ''}`} selected={tab === 'mine'} onPress={() => setTab('mine')} />
            {savedMeals.length ? null : meals}
          </ChipRow>
          {tab === 'usual' && usuals.length ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="caption" color="textSecondary" testID="search-usual-note">
                Most logged at {MEAL_LABEL[meal].toLowerCase()}, last 30 days
              </Text>
              <List>{usuals.map((f, i) => row(f, `usual-${i}`))}</List>
            </View>
          ) : null}
          {tab === 'recent' ? (
            recents.length ? (
              <List>{recents.map((f, i) => row(f, `recent-${i}`))}</List>
            ) : (
              <Hint title="Your recent foods live here" message="Everything you log shows up here so the next time takes one tap. Start by searching above." />
            )
          ) : null}
          {tab === 'favorites' ? (
            favMeals.length || favorites.length ? (
              // Meals first, then foods; the two overlines only when both are there.
              <View style={{ gap: spacing.lg }}>
                {favMeals.length ? (
                  <View style={{ gap: spacing.xs }}>
                    {favorites.length ? (
                      <Text variant="overline" color="textSecondary" testID="search-fav-meals-label">
                        {FAVOURITE_GROUPS.meals}
                      </Text>
                    ) : null}
                    <List>
                      {favMeals.map((m, i) => (
                        <SavedMealRow key={m.id} meal={m} testID={`favorite-meal-${i}`} onOpen={() => go('/food/meals')} onLog={() => setLogging(m)} />
                      ))}
                    </List>
                  </View>
                ) : null}
                {favorites.length ? (
                  <View style={{ gap: spacing.xs }}>
                    {favMeals.length ? (
                      <Text variant="overline" color="textSecondary" testID="search-fav-foods-label">
                        {FAVOURITE_GROUPS.foods}
                      </Text>
                    ) : null}
                    {/* Each food carries the meals' star, 12 px before its "+" (as Log), so both groups are unstarred the same way. */}
                    <List>
                      {favorites.map((f, i) => {
                        const on = favoriteIds.includes(f.id);
                        return row(
                          f,
                          `favorite-${i}`,
                          <FavoriteStar testID={`favorite-${i}-favorite`} on={on} label={favoriteLabel(displayFoodName(f), on)} onPress={() => toggleFoodFavorite(f)} style={{ marginRight: 4 }} />,
                        );
                      })}
                    </List>
                  </View>
                ) : null}
              </View>
            ) : (
              <Hint title={FAVOURITES_EMPTY.title} message={FAVOURITES_EMPTY.message} />
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
                        accessibilityLabel={`Edit ${displayFoodName(f)}`}
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
            <>
            {toSave ? <SaveCurrentMealRow meal={meal} date={date} today={todayDate} entries={toSave} /> : null}
            {savedMeals.length ? (
              <List>
                {ordered.map((m, i) => (
                  <SavedMealRow key={m.id} meal={m} testID={`saved-meal-${i}`} onOpen={() => go('/food/meals')} onLog={() => setLogging(m)} />
                ))}
              </List>
            ) : (
              <Hint title="No saved meals yet" message="Build a meal you eat often, or a recipe that makes several servings. You can also save a meal from the diary's meal menu." />
            )}
            <Button
              testID="search-new-meal"
              variant="secondary"
              size="md"
              title="New meal or recipe"
              icon={<Utensils size={18} color={colors.text} />}
              onPress={() => go('/food/meal-edit')}
            />
            </>
          ) : null}
        </>
      ) : (
        <>
          {local.length > 0 ? (
            <List testID="search-local-results">{local.map((h, i) => row(h.food, `result-${i}`, undefined, h.matched))}</List>
          ) : noLocal ? (
            <View testID="search-no-local" style={{ gap: 4, paddingVertical: spacing.sm }}>
              <Text variant="h3">No matches in your foods or the reference list</Text>
              <Text variant="body" color="textSecondary">
                Try fewer words, check the online products below, or add it another way.
              </Text>
            </View>
          ) : null}

          {q.length >= 2 ? (
            <View style={{ gap: spacing.xs }} testID="search-online">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">Online products</Text>
                  <Text variant="caption" color="textSecondary">
                    Community data from Open Food Facts
                  </Text>
                </View>
                {online.status === 'loading' ? <ActivityIndicator color={colors.textSecondary} /> : null}
              </View>
              {onlineItems.length > 0 ? (
                <List>{onlineItems.map((f, i) => row(f, `online-${i}`))}</List>
              ) : online.status === 'done' ? (
                <Text variant="body" color="textTertiary" testID="search-online-empty" style={{ paddingVertical: spacing.sm }}>
                  {onlineResult.unavailable
                    ? 'Product search by name works in the phone app. Here, scan or type a barcode, or create the food.'
                    : onlineResult.failed
                      ? 'Could not reach the online products. Your own and bundled foods still work.'
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
              {noLocal && online.status === 'done' && onlineItems.length === 0 ? 'Add it another way' : "Can't find it?"}
            </Text>
            {escapes}
          </View>
        </>
      )}
      <LogSavedMealSheet key={logging?.id ?? 'none'} meal={logging} mealType={meal} date={date} onClose={() => setLogging(null)} />
      <Sheet
        visible={!!amountEntry}
        onClose={() => setAmountEntryId(null)}
        title={amountEntry ? isolateRtl(displayFoodName(amountEntry)) : undefined}
        footer={
          amountEntry ? (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                testID="search-amount-remove"
                variant="secondary"
                full={false}
                title="Remove"
                onPress={() => {
                  setAmountEntryId(null);
                  deleteEntry(amountEntry);
                }}
              />
              <Button testID="search-amount-done" style={{ flex: 1 }} title={`Done · ${kcal(amountEntry.nutrients.kcal)} kcal`} onPress={() => setAmountEntryId(null)} />
            </View>
          ) : null
        }>
        {amountEntry?.food ? (
          // 6 px of room above the serving chips, so the top of their 44 px touch area is not cut off by the sheet's scroll edge.
          <View style={{ paddingTop: 6 }}>
            <AmountEditor
              key={amountEntry.id}
              food={amountEntry.food}
              value={{
                serving: matchServing(amountEntry.food, amountEntry.servingLabel, amountEntry.quantity > 0 ? amountEntry.grams / amountEntry.quantity : amountEntry.grams),
                quantity: amountEntry.quantity,
              }}
              onChange={(v) => setEntryAmount(amountEntry, v.quantity, v.serving)}
              testIDPrefix="search-amount"
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function List({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const items = React.Children.toArray(children);
  return (
    <View testID={testID}>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 ? <Divider inset={36} /> : null}
          {c}
        </View>
      ))}
    </View>
  );
}

function Hint({ title, message }: { title: string; message: string; icon?: React.ReactNode }) {
  return <EmptyState title={title} message={message} />;
}

/** A compact action tile: the icon over one short word, 52 px tall; `a11y` is its full name ("Scan barcode"). */
function ActionTile({ icon, label, a11y, onPress, testID }: { icon: React.ReactNode; label: string; a11y: string; onPress: () => void; testID: string }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{
        flex: 1,
        minHeight: 52,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        paddingVertical: 7,
        // Narrow side padding, so "Quick add" fits whole in a quarter of a 320 px screen.
        paddingHorizontal: 2,
      }}>
      {icon}
      <Text variant="label" align="center" numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 16 }}>
        {label}
      </Text>
    </PressableScale>
  );
}
