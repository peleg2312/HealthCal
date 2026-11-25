import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronRight, ChevronUp, PenLine, Plus, Pointer, ScanBarcode, Search, Utensils, X, Zap } from 'lucide-react-native';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, type TextInput, useWindowDimensions, View } from 'react-native';

import { PourWait } from '@/components/PourWait';

import { AiGlyph } from '@/features/ai/mark';
import { searchAiTile } from '@/features/ai/words';
import { AmountEditor } from '@/features/food/AmountEditor';
import { foodNameHead } from '@/features/food/addedTo';
import { FoodRow, MealPicker } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { setFoodDraft } from '@/features/food/draft';
import { amountLabel, href, kcal, lastPortions, matchServing, parseDate, parseMeal, portionFor, portionKcal, portionLabel, sourceInfo, sourceKindOf, stepAmount } from '@/features/food/helpers';
import { deleteEntry, logFood, logSavedMeal, setEntryAmount } from '@/features/food/log';
import { useOneTap } from '@/features/food/oneTap';
import { FavoriteStar } from '@/features/food/FavoriteStar';
import { toggleFoodFavorite } from '@/features/food/favoriteActions';
import { favoriteFoodsInVisit, isFavoriteMeal, mealToSave } from '@/features/food/favorites';
import { favoriteActionLabel, FAVOURITE_GROUPS, FAVOURITES_EMPTY } from '@/features/food/favoriteWords';
import { FAVOURITES_EMPTY_WITH_HINT, HOLD_HINT, markHoldHintDone, useHoldHint } from '@/features/food/holdHint';
import { LangIconButton, useLangName } from '@/features/food/langName';
import { LogSavedMealSheet } from '@/features/food/SavedMealParts';
import { SaveCurrentMealRow, SavedMealRow, useVisitOrder } from '@/features/food/SavedMealRow';
import { loadSearchTab, openingTab, parseSearchTab, rememberSearchTab, SEARCH_CHIPS, usualEmpty, useSearchTab, type SearchTab } from '@/features/food/searchTab';
import { resolveFood, usualFoods } from '@/features/food/usuals';
import { refocusAfterAdd, visitAdds } from '@/features/food/visitAdds';
import { VisitAddsSheet } from '@/features/food/VisitAddsSheet';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { formatDayLabel } from '@/lib/dates';
import { MEAL_LABEL, entriesTotal } from '@/lib/nutrition';
import { searchLocal, searchOnlineWithStatus } from '@/services/foodSearch';
import { onlineSearchAvailable } from '@/services/openFoodFacts';
import { useToday } from '@/store/clock';
import { favoriteRecordId, useStore } from '@/store';
import { useDay, useLive } from '@/store/selectors';
import { cup, motion, useLargeText, useTheme } from '@/theme';
import type { Food, FoodEntry, MealType, SavedMeal } from '@/types';
import { AnimatedNumber, Button, Chip, ChipRow, CupKey, decorative, Divider, EmptyState, Header, IconButton, PressableScale, Screen, Sheet, Text, TextField, useGrownText } from '@/ui';

type Tab = SearchTab;
type Online = { query: string; status: 'idle' | 'loading' | 'done'; items: Food[] };

export default function FoodSearchScreen() {
  const { colors, radius, spacing } = useTheme();
  // A 320 px phone cannot fit the long hint; it keeps the words that matter.
  const narrow = useWindowDimensions().width < 360;
  const big = useLargeText();
  const grown = useGrownText();
  const params = useLocalSearchParams<{ meal?: string; date?: string; tab?: string }>();
  const todayDate = useToday();
  const date = parseDate(params.date, todayDate);
  const [meal, setMeal] = useState<MealType>(() => parseMeal(params.meal));
  const [query, setQuery] = useState('');
  // null until the user picks a tab: then the tab the address asks for (`?tab=`, the + sheet's "See all N": this visit
  // only, never remembered), else the tab chosen last on this device, else Usual when there is history for this meal
  // (`openingTab`). A tap is remembered on the device (`healthcal.searchTab`).
  const [pickedTab, setPickedTab] = useState<Tab | null>(null);
  const askedTab = parseSearchTab(params.tab);
  const rememberedTab = useSearchTab((s) => s.tab);
  useEffect(() => {
    void loadSearchTab();
  }, []);
  const setTab = (t: Tab) => {
    setPickedTab(t);
    rememberSearchTab(t);
  };
  const [amountEntryId, setAmountEntryId] = useState<string | null>(null);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const [onlineResult, setOnlineResult] = useState<{ query: string; items: Food[]; failed: boolean; unavailable: boolean }>({ query: '', items: [], failed: false, unavailable: false });
  // Entries that already existed when the screen opened. Compared by id, not by time: a clock
  // that was wrong when an entry was logged must not make old entries count as added here.
  const [existing] = useState(() => new Set(Object.keys(useStore.getState().foodEntries)));
  // "Added in this search": the sheet that lists this visit's adds, each with its own Undo.
  const [showAdds, setShowAdds] = useState(false);
  const allEntries = useStore((s) => s.foodEntries);

  // The lists keep their order while this screen is in front, so a row never moves under the finger: an add
  // makes its food the most recent and adds to its usual count, which would otherwise move it (and the done mark
  // of the row under the finger) up the list before the next tap. Read again each time the screen comes into view.
  const [visitRecentFoods, setVisitRecentFoods] = useState(() => useStore.getState().recentFoods);
  const [visitEntryIds, setVisitEntryIds] = useState(() => new Set(Object.keys(useStore.getState().foodEntries)));
  // Where the search field's focus is, for putting it back after a one-tap add (`refocusAfterAdd`).
  const fieldFocus = useRef({ focused: false, blurredAt: 0 });
  // Declared here: the header's short line shows it.
  const left = Math.round(useDay(date).remaining);
  const favoriteIds = useStore((s) => s.favoriteFoodIds);
  // Every favourite record, removed ones too: a food unstarred in the Favourites tab keeps its row on this visit.
  const favoriteRecords = useStore((s) => s.favorites);
  // The favourite foods when the screen came into view (`favoriteFoodsInVisit`).
  const [visitFoodIds, setVisitFoodIds] = useState<string[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      const now = useStore.getState();
      setVisitFoodIds(now.favoriteFoodIds);
      setVisitRecentFoods(now.recentFoods);
      setVisitEntryIds(new Set(Object.keys(now.foodEntries)));
    }, []),
  );
  const customFoods = useLive('customFoods');
  const savedMeals = useLive('savedMeals');
  const entries = useLive('foodEntries');

  const lastMap = useMemo(() => lastPortions(entries), [entries]);
  const customById = useMemo(() => new Map(customFoods.map((f) => [f.id, f as Food])), [customFoods]);
  const recents = useMemo(
    () => visitRecentFoods.map((f) => resolveFood(f, customById)).filter((f): f is Food => !!f).slice(0, 30),
    [visitRecentFoods, customById],
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
      usualFoods(
        entries.filter((e) => visitEntryIds.has(e.id)),
        meal,
        todayDate,
        { limit: 12, withFood: true },
      )
        .map((u) => (u.food ? resolveFood(u.food, customById) : null))
        .filter((f): f is Food => !!f),
    [entries, visitEntryIds, meal, todayDate, customById],
  );
  // Saved meals in the order fixed when the screen came into view (favourites first): a star changes only
  // its icon until the next visit. The Favourites tab keeps a meal unstarred on this visit, so it can be starred again.
  const { ordered, starredAtVisit } = useVisitOrder(savedMeals);
  const favMeals = ordered.filter((m) => isFavoriteMeal(m) || starredAtVisit.has(m.id));
  // Favourites opens from memory only while it lists something (what this visit lists, so an unstar there never
  // moves the tab); Usual opens by itself only for a meal with history (a tap opens it empty too).
  const tab: Tab = openingTab(pickedTab, rememberedTab, { usual: usuals.length > 0, favorites: favMeals.length + favorites.length > 0 }, askedTab);
  // What is starred now (a food unstarred on this visit keeps its row, not its count).
  const favCount = favorites.filter((f) => favoriteIds.includes(f.id)).length + savedMeals.filter(isFavoriteMeal).length;
  // The empty Favourites tab's one-line tip about the long press, until it is dealt with on this device.
  const holdHint = useHoldHint(favMeals.length + favorites.length === 0);
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
  // the previous list stays, never the empty state for a query that has matches.
  const noLocal = localQ === q && local.length === 0;
  // What the screen draws follows the deferred query: on the first letter the tab's list stays drawn until that
  // letter's results are ready, so no frame shows an empty list or "Can't find it?" before a search has run.
  // Clearing the field shows the tabs at once.
  const listQ = q ? localQ : '';

  // Online products arrive after a pause in typing; stale answers are dropped. Where online search cannot run
  // (a browser without the backend), nothing is asked and the line says so at once and holds while typing
  // goes on: no "Searching" frame between keystrokes for a search that will not run (rubric D3-07).
  const latest = useRef('');
  useEffect(() => {
    latest.current = q;
    if (q.length < 2 || !onlineSearchAvailable) return;
    const t = setTimeout(async () => {
      const result = await searchOnlineWithStatus(q);
      if (latest.current === q) setOnlineResult({ query: q, ...result });
    }, 450);
    return () => clearTimeout(t);
  }, [q]);
  const online: Online = {
    query: q,
    status: q.length < 2 ? 'idle' : !onlineSearchAvailable || onlineResult.query === q ? 'done' : 'loading',
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
  // After a one-tap add the focus goes back to the search field with its words selected, so the next letter typed
  // starts the next search and the phone's keyboard stays up (`refocusAfterAdd` says when, and why the words stay).
  const focusSearchWords = () => {
    const node = inputRef.current as unknown as { focus?: () => void; select?: () => void; setSelection?: (start: number, end: number) => void } | null;
    if (!node) return;
    node.focus?.();
    if (typeof node.select === 'function') node.select();
    else node.setSelection?.(0, query.length);
  };
  const quickAdd = (food: Food) => {
    const p = portionFor(food, lastMap);
    logFood({ food, serving: p.serving, quantity: p.quantity, meal, date });
  };
  // A press handler's one-tap add, then the focus back in the field when `refocusAfterAdd` says so (read before the
  // add: the "+" it was on leaves with it).
  const addThenRefocus = (log: () => void) => {
    const back = refocusAfterAdd({
      typed: q.length > 0,
      fieldFocused: fieldFocus.current.focused,
      blurredMsAgo: msSince(fieldFocus.current.blurredAt),
      byKeyboard: pressedWithKeyboard(),
    });
    log();
    if (back) focusSearchWords();
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
        // A food added on this visit opens its entry (Edit entry), so changing or moving what was just logged is
        // the row, the meal and done; any other row opens a new food detail.
        onPress={() => (e ? router.push(href('/food/detail', { entryId: e.id, meal: e.meal, date: e.date }) as never) : open(food))}
        onQuickAdd={() => addThenRefocus(() => quickAdd(food))}
        // Press and hold stars it (or unstars it), with a toast and Undo; the row does not open. The empty
        // Favourites tab's tip about it is then learnt (./holdHint).
        onLongPress={() => {
          markHoldHintDone();
          toggleFoodFavorite(food);
        }}
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
  const aiTile = searchAiTile(q);
  // With large text, two tiles a line, so no word is split inside a quarter of the screen.
  const escapes = (
    <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', gap: spacing.sm }}>
      <ActionTile testID="search-scan" icon={<ScanBarcode size={18} color={colors.text} strokeWidth={1.9} />} label="Barcode" a11y="Scan barcode" onPress={() => go('/food/scan')} />
      {/* "Estimate" under the AI's estimate cup with nothing typed (Photo and Describe are both behind it); "Describe" once words are typed, carrying them. */}
      <ActionTile testID="search-photo" icon={<AiGlyph name={aiTile.glyph} size={18} color={colors.text} />} label={aiTile.label} a11y={aiTile.a11y} onPress={() => go('/food/photo', aiTile.params)} />
      <ActionTile testID="search-quick" icon={<Zap size={18} color={colors.text} strokeWidth={1.9} />} label="Quick add" a11y="Quick add" onPress={() => go('/food/quick')} />
      <ActionTile testID="search-create" icon={<PenLine size={18} color={colors.text} strokeWidth={1.9} />} label="Create" a11y="Create food" onPress={() => go('/food/custom', q ? { name: q } : {})} />
    </View>
  );


  // Each chip's words, with its count when it holds something ("Favourites 3").
  const chipLabel: Record<Tab, string> = {
    usual: 'Usual',
    recent: 'Recent',
    favorites: `Favourites${favCount ? ` ${favCount}` : ''}`,
    mine: `My foods${mine.length ? ` ${mine.length}` : ''}`,
    meals: `Saved meals${savedMeals.length ? ` ${savedMeals.length}` : ''}`,
  };

  const header = (
    <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
      {/* The day and what is left of its budget: one short line, so the list starts higher (logging speed). */}
      <Header title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} subtitle={`${formatDayLabel(date)} · ${kcal(Math.abs(left))} kcal ${left < 0 ? 'above budget' : 'left'}`} close />
      <TextField
        ref={inputRef}
        testID="food-search-input"
        // A one-line placeholder fits its field whole: the short one with large text, and as soon as text grows at all,
        // a reader's own text spacing included (`useGrownText`, WCAG 1.4.12), where the longer ones are cut mid-word.
        placeholder={big || grown ? 'Search foods' : narrow ? 'Search foods and brands' : 'Search foods, brands, your foods'}
        value={query}
        onChangeText={setQuery}
        onFocus={() => {
          fieldFocus.current = { focused: true, blurredAt: 0 };
        }}
        onBlur={() => {
          fieldFocus.current = { focused: false, blurredAt: Date.now() };
        }}
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

  // The best match's Add, pinned at the foot while words are typed: the same one tap as the first row's "+",
  // in thumb reach and riding on the keyboard (Screen keeps its footer above it). Once that food is added it
  // stays in place as a tick, so a quick second tap neither logs it twice nor lands on Done above it.
  const top = q && local.length > 0 && localQ === q ? local[0].food : null;
  const oneTap = useOneTap();
  const addTop = oneTap(() => {
    if (top) quickAdd(top);
  });
  const topAdded = top ? addedByFood.get(top.id) : undefined;
  const topPortion = top ? portionFor(top, lastMap) : null;
  const topBar =
    top && topPortion ? (
      <BestMatchAdd
        name={foodNameHead(displayFoodName(top))}
        kcalValue={topAdded ? topAdded.nutrients.kcal : portionKcal(top, topPortion)}
        added={!!topAdded}
        // What it shows first, as drawn ("Add Chicken breast, 227 kcal"; WCAG 2.5.3, label in name), then the whole
        // name where the button shows its head, the portion, the source in words and the meal.
        spoken={`Add ${foodNameHead(displayFoodName(top))}, ${kcal(portionKcal(top, topPortion))} kcal: ${foodNameHead(displayFoodName(top)) === displayFoodName(top) ? '' : `${displayFoodName(top)}, `}${portionLabel(topPortion.serving.label, topPortion.quantity)}, ${sourceInfo(sourceKindOf(top)).label}, to ${MEAL_LABEL[meal].toLowerCase()}`}
        onPress={() => addThenRefocus(addTop)}
      />
    ) : null;
  // Once something is added: the running count and Done, above the best match's Add (so that one never moves).
  // The budget is in the header's short line. The count opens what this visit added, each with its own Undo.
  const adds = visitAdds(allEntries, existing, date);
  const closeSearch = () => (router.canGoBack() ? router.back() : router.replace(href('/diary', { date }) as never));
  const countRow =
    added.length > 0 ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
        <PressableScale
          testID="search-added-open"
          onPress={() => setShowAdds(true)}
          scaleTo={0.98}
          accessibilityRole="button"
          // Its words as drawn, then what it opens (label in name).
          accessibilityLabel={`${added.length} added, ${kcal(addedKcal)} kcal. Show what was added, to undo any`}
          style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="title" testID="search-added-count" tabular style={{ flexShrink: 1 }}>
            {/* Under 360 px the count takes two lines by design ("2 added" over "325 kcal"), never broken mid-phrase. */}
            {`${added.length} added${narrow ? '\n' : ' · '}`}
            <AnimatedNumber variant="title" value={addedKcal} format={kcal} duration={motion.duration.pourSmall} />
            {' kcal'}
          </Text>
          <ChevronUp size={18} color={colors.text} strokeWidth={2.2} />
        </PressableScale>
        <Button testID="search-done" title="Close search" size="md" full={false} onPress={closeSearch} />
      </View>
    ) : null;
  const footer =
    countRow || topBar ? (
      <View style={{ gap: spacing.sm }}>
        {countRow}
        {topBar}
      </View>
    ) : undefined;

  return (
    <Screen header={header} footer={footer} testID="food-search-screen">
      <MealPicker value={meal} onChange={setMeal} testIDPrefix="search-meal" />

      {!listQ ? (
        <>
          {escapes}
          {/* One fixed set in one fixed order on every visit (SEARCH_CHIPS): a chip with nothing behind it opens its empty state. */}
          <ChipRow>
            {SEARCH_CHIPS.map((t) => (
              <Chip key={t} testID={`search-tab-${t}`} label={chipLabel[t]} selected={tab === t} onPress={() => setTab(t)} />
            ))}
          </ChipRow>
          {tab === 'usual' ? (
            usuals.length ? (
              <View style={{ gap: spacing.xs }}>
                <Text variant="caption" color="textSecondary" testID="search-usual-note">
                  Most logged at {MEAL_LABEL[meal].toLowerCase()}, last 30 days
                </Text>
                <List>{usuals.map((f, i) => row(f, `usual-${i}`))}</List>
              </View>
            ) : (
              <View testID="search-usual-empty">
                <Hint {...usualEmpty(MEAL_LABEL[meal].toLowerCase())} />
              </View>
            )
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
                        <SavedMealRow key={m.id} meal={m} testID={`favorite-meal-${i}`} onReview={() => setLogging(m)} onLog={() => logSavedMeal(m, meal, date)} onHold={markHoldHintDone} />
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
                    {/* Each food carries the meals' star, 12 px before its "+" (as a meal does), so both groups are unstarred and added the same way. */}
                    <List>
                      {favorites.map((f, i) => {
                        const on = favoriteIds.includes(f.id);
                        return row(
                          f,
                          `favorite-${i}`,
                          <FavoriteStar testID={`favorite-${i}-favorite`} on={on} name={displayFoodName(f)} onPress={() => toggleFoodFavorite(f)} style={{ marginRight: 4 }} />,
                        );
                      })}
                    </List>
                  </View>
                ) : null}
              </View>
            ) : (
              // Nothing starred yet: the long press is taught once, in one line over the empty state (./holdHint), and
              // the empty state then names the star only, so the long press is said once.
              <View>
                {holdHint ? (
                  <View
                    testID="search-fav-hint"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingLeft: 14, paddingRight: 4, ...cup(radius.tile, 5), backgroundColor: colors.surfaceAlt }}>
                    {decorative(<Pointer size={17} color={colors.text} strokeWidth={1.9} />)}
                    <Text variant="label" style={{ flex: 1, minWidth: 0 }} testID="search-fav-hint-text">
                      {narrow || big ? HOLD_HINT.short : HOLD_HINT.text}
                    </Text>
                    <PressableScale
                      testID="search-fav-hint-close"
                      onPress={markHoldHintDone}
                      scaleTo={0.97}
                      feedback="select"
                      accessibilityLabel={HOLD_HINT.doneA11y}
                      style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="label" color="textSecondary">
                        {HOLD_HINT.done}
                      </Text>
                    </PressableScale>
                  </View>
                ) : null}
                <Hint title={FAVOURITES_EMPTY.title} message={holdHint ? FAVOURITES_EMPTY_WITH_HINT : FAVOURITES_EMPTY.message} />
                {/* The action that fills it: the foods to star, one tap away (usual for this meal, else recent), or,
                    with nothing logged yet, the search field to find one. */}
                <View style={{ alignItems: 'center' }}>
                  <Button
                    testID="search-fav-empty-show"
                    variant="ghost"
                    size="sm"
                    full={false}
                    title={usuals.length ? 'Show your usual foods' : recents.length ? 'Show your recent foods' : 'Find a food to star'}
                    iconRight={usuals.length || recents.length ? <ChevronRight size={16} color={colors.text} strokeWidth={2.2} /> : undefined}
                    icon={usuals.length || recents.length ? undefined : <Search size={16} color={colors.text} strokeWidth={2.2} />}
                    onPress={() => (usuals.length ? setTab('usual') : recents.length ? setTab('recent') : inputRef.current?.focus())}
                  />
                </View>
              </View>
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
                      <LangIconButton
                        testID={`mine-${i}-edit`}
                        accessibilityLabel={`Edit ${displayFoodName(f)}`}
                        tone="clear"
                        size={40}
                        onPress={() => go('/food/custom', { id: f.id })}>
                        <PenLine size={17} color={colors.textSecondary} />
                      </LangIconButton>,
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
                  <SavedMealRow key={m.id} meal={m} testID={`saved-meal-${i}`} onReview={() => setLogging(m)} onLog={() => logSavedMeal(m, meal, date)} onHold={markHoldHintDone} />
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
            {/* A row's tap reviews it before logging, so changing or deleting a meal has its own way in: the saved meals screen. */}
            {savedMeals.length ? <Button testID="search-edit-meals" variant="ghost" size="md" title="Edit or delete saved meals" icon={<PenLine size={18} color={colors.text} />} onPress={() => go('/food/meals')} /> : null}
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
              {/* The one way that takes the words as typed leads, named as the AI and wearing its glyph, apart from
                  the four look-alike tiles further down. */}
              <Button
                testID="search-no-local-ai"
                variant="secondary"
                size="md"
                title={narrow || big ? 'Get an AI estimate' : 'Describe it for an AI estimate'}
                // Its words as drawn, then the words it takes along (label in name; apart from the tile's "Describe …").
                accessibilityLabel={`${narrow || big ? 'Get an AI estimate' : 'Describe it for an AI estimate'}: ${q.trim()}`}
                icon={<AiGlyph name="describe" size={20} color={colors.text} />}
                onPress={() => go('/food/photo', aiTile.params)}
                style={{ marginTop: spacing.sm }}
              />
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
                {online.status === 'loading' ? <PourWait size="inline" label="Searching online products" /> : null}
              </View>
              {onlineItems.length > 0 ? (
                <List>{onlineItems.map((f, i) => row(f, `online-${i}`))}</List>
              ) : online.status === 'done' ? (
                // Reading text: textSecondary, 7:1 on every page (WCAG 1.4.6); textTertiary is for captions.
                <Text variant="body" color="textSecondary" testID="search-online-empty" style={{ paddingVertical: spacing.sm }}>
                  {!onlineSearchAvailable || onlineResult.unavailable
                    ? 'Search them by name in the phone app.'
                    : onlineResult.failed
                      ? 'Could not reach the online products. Your own and bundled foods still work.'
                      : 'No online products match that search.'}
                </Text>
              ) : (
                <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.sm }}>
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
      <VisitAddsSheet
        visible={showAdds && adds.length > 0}
        adds={adds}
        meal={meal}
        today={todayDate}
        onClose={() => setShowAdds(false)}
        onCloseSearch={() => {
          setShowAdds(false);
          closeSearch();
        }}
      />
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
                // One action, one name: a diary entry is deleted ("Delete <food>", as its trash can in the diary says).
                title="Delete"
                accessibilityLabel={`Delete ${withoutMarks(displayFoodName(amountEntry))}`}
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

/** Milliseconds since `at` (a press handler's clock; never read while rendering). */
function msSince(at: number): number {
  return Date.now() - at;
}

/**
 * Web: whether the press now being handled came from a keyboard (the control it is on shows the focus ring,
 * `:focus-visible`, which a tap or a click never sets). Always false on a phone.
 */
function pressedWithKeyboard(): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const el = document.activeElement as (Element & { matches?: (selector: string) => boolean }) | null;
  try {
    return !!el && el.tagName !== 'INPUT' && !!el.matches?.(':focus-visible');
  } catch {
    return false;
  }
}

/** Search's rows as a list on the web (`role="list"`, each row a `listitem`), so a screen reader says how many there are. */
function List({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const items = React.Children.toArray(children);
  const web = Platform.OS === 'web';
  return (
    <View testID={testID} {...(web ? { role: 'list' as const } : null)}>
      {items.map((c, i) => (
        <View key={i} {...(web ? { role: 'listitem' as const } : null)}>
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
  const big = useLargeText();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={{
        // Two a line with large text (the row wraps), four otherwise.
        ...(big ? { flexBasis: '45%', flexGrow: 1 } : { flex: 1 }),
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
      {/* Two lines at most: one word per line under wider text spacing (WCAG 1.4.12), never cut ("Quick add"). */}
      <Text variant="label" align="center" numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16 }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * The best match's one-tap Add at the foot of search (`search-add-top`): a plus, the food's name and what one
 * tap adds; once added, the done mark (the small filled ink cup, never a check, which means only a day on
 * budget) in the same place, taking no press (the row above has the amount). A name in Hebrew or Arabic is
 * spoken in its own language (`useLangName`).
 */
function BestMatchAdd({ name, kcalValue, added, spoken, onPress }: { name: string; kcalValue: number; added: boolean; spoken: string; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const lang = useLangName(added ? `${name} added, ${kcal(kcalValue)} kcal` : spoken);
  // As soon as text grows at all, a reader's own text spacing included (`useGrownText`, WCAG 1.4.12), the name
  // takes a second line and the button grows, rather than being cut after a few letters; at the designed size, one line.
  const grown = useGrownText();
  return (
    <PressableScale
      testID="search-add-top"
      onPress={onPress}
      disabled={added}
      dimDisabled={false}
      feedback="none"
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={lang.label}
      {...lang.props}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 50,
        paddingHorizontal: 14,
        paddingVertical: grown ? spacing.sm : 0,
        ...cup(radius.button),
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: added ? colors.success : colors.borderStrong,
      }}>
      {lang.hidden}
      {added ? (
        <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
          <CupKey color={colors.text} size={12} />
        </View>
      ) : (
        <Plus size={20} color={colors.text} strokeWidth={2.2} />
      )}
      <Text variant="bodyStrong" numberOfLines={grown ? 2 : 1} style={{ flex: 1, minWidth: 0 }}>
        {added ? `${isolateRtl(name)} added` : `Add ${isolateRtl(name)}`}
      </Text>
      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
        {kcal(kcalValue)}
        <Text variant="unit">{' kcal'}</Text>
      </Text>
    </PressableScale>
  );
}
