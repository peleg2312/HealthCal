import { router } from 'expo-router';
import { Activity, ChevronRight, Droplets, Plus, Repeat2, Scale, ScanBarcode, Search, type LucideIcon } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { AiGlyph, SourceMark, sourceMarkTop, type AiGlyphName } from '@/features/ai/mark';
import { hasFoodLogged } from '@/features/drinks/via';
import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { foodNameHead } from '@/features/food/addedTo';
import { displayFoodName } from '@/features/food/displayName';
import { favoriteMeals, quickLogMeal } from '@/features/food/favorites';
import { favoriteFoodTile, isEstimateFood, savedTileCaption } from '@/features/food/favoriteWords';
import { lastPortions, matchServing, portionFor, portionKcal, portionLabel, servingText, sourceInfo, sourceKindOf, type SourceKind } from '@/features/food/helpers';
import { formatPortion, mealServings, planSavedMeal } from '@/features/food/build';
import { logFood, logItems, logSavedMeal } from '@/features/food/log';
import { ONE_TAP_GUARD_MS, tooSoon } from '@/features/food/oneTap';
import { AI_TAG, likelyRows, QUICK_WAYS, quickRowTitle, quickSheetLine, quickSheetTitle, seeAllLabel, seeAllSpoken, wideWaySpoken, type QuickWayId } from '@/features/food/quickSheet';
import { loadSearchTab } from '@/features/food/searchTab';
import { addWater } from '@/features/today/StatusRail';
import { quickLogDate, quickLogPastDate, useViewedDay } from '@/features/today/viewedDay';
import { currentKcal, customFoodIndex, resolveFood, resolveUsuals, usualFoods, usualLabel, type UsualFood } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatShortDate } from '@/lib/dates';
import { MEAL_LABEL, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { computeDayFromStore, live, useDay, useLive, useProfile } from '@/store/selectors';
import { cup, useLargeText, useTheme } from '@/theme';
import type { Food, FoodEntry, ISODate, SavedMeal } from '@/types';
import { Button, CupKey, PressableScale, Sheet, Text, toastToScreen } from '@/ui';

/** Re-log a usual food in its last portion. Entries with a food definition go through logFood so recents stay fresh. */
function logUsual(u: UsualFood, date: ISODate) {
  const meal = mealForTime();
  const e = u.last;
  if (e.food && e.quantity > 0) {
    logFood({ food: e.food, serving: matchServing(e.food, e.servingLabel, e.grams / e.quantity), quantity: e.quantity, meal, date });
  } else {
    logItems([e], meal, date);
  }
}

// The + sheet is mounted once for the session, so its one-tap guard and its closing timer live here, read and
// written only at a tap (never while rendering).
let lastOneTap = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
function oneTapThenClose(log: () => void, close: () => void) {
  const now = Date.now();
  if (tooSoon(lastOneTap, now)) return;
  lastOneTap = now;
  // The sheet closes in a moment: its toast is shown once, by the screen below, after the sheet has gone.
  toastToScreen(log);
  clearTimeout(closeTimer);
  closeTimer = setTimeout(close, ONE_TAP_GUARD_MS);
}

const whenPhrase = (date: ISODate, from: ISODate) => (date === addDays(from, -1) ? 'yesterday' : formatShortDate(date));

/** Log a favourite food in its last portion (or its default one), read at the moment of the tap. */
function logFavoriteFood(food: Food, date: ISODate) {
  const p = portionFor(food, lastPortions(live(useStore.getState().foodEntries)));
  logFood({ food, serving: p.serving, quantity: p.quantity, meal: mealForTime(), date });
}

/** One of the likely next logs, in the sheet's order: a usual food, a favourite food, or a saved meal (favourite or changed last). */
type Likely =
  | { kind: 'usual'; u: UsualFood }
  | { kind: 'food'; food: Food; index: number }
  | { kind: 'meal'; meal: SavedMeal; key: string; testID: string; favourite: boolean };

/**
 * The sheet behind the centre + button, in one view at 360 x 740, 390 x 844 and 320 x 640 at the designed text size:
 * the title says where the food goes ("Add to dinner") and the line under it the day and what is left of its budget;
 * then four small ways in (Photo and Describe with the AI's glyph and tag, Activity, Weigh in), Search food with Scan
 * at its end, Repeat with its calories, the three most likely foods or meals as rows with "See all N", and Water's
 * glasses. Nothing is pinned: everything is in view. With large text every way in is a whole row with its hint and
 * the likely next log leads the body, which scrolls (as on a short window, where the kit's sheet scrolls whole).
 * It stays mounted for the whole session, so the meal and date come from the clock hooks while rendering and
 * from the wall clock again at the moment of each tap.
 */
export function QuickLogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const profile = useProfile();
  const now = useNow();
  const todayDate = useToday();
  const meal = mealForTime(now);
  const mealName = MEAL_LABEL[meal].toLowerCase();
  const entries = useLive('foodEntries');
  const saved = useLive('savedMeals');
  const presets = useStore((s) => s.settings.waterPresets);
  // Keys logged while the sheet is open turn into done marks; cleared when it closes.
  const [done, setDone] = useState<string[]>([]);

  // Resolved against the user's own foods as they are now: an edited food logs today's values, a deleted one is not offered.
  const customFoods = useLive('customFoods');
  const customIdx = customFoodIndex(customFoods);
  const usualAll = resolveUsuals(usualFoods(entries, meal, todayDate, { limit: 8 }), customIdx);
  // The day the screen behind the sheet shows (a past day on Today, the diary's date), else today.
  const viewed = useViewedDay((s) => s.date);
  const logDate = viewed ?? todayDate;
  const prev = findPreviousMeal(entries, logDate, meal, 7);
  const alreadyLogged = hasFoodLogged(entries.filter((e) => e.date === logDate && e.meal === meal));
  // The likely next logs, in one order (principle 1: two taps from anywhere): the meal's first usual food; then the
  // favourites, so a starred meal or food is in view too: up to three favourite meals, newest star first; then up to
  // three favourite foods, newest first; then the other usual foods not already shown; then the meal changed last
  // when it is not already shown. A food is shown once: the first usual food is never also a favourite. The first
  // three are rows; "See all N" opens food search for the rest.
  const favMeals = favoriteMeals(saved).slice(0, 3);
  const savedMeal = quickLogMeal(saved, favMeals.map((m) => m.id));
  const favoriteIds = useStore((s) => s.favoriteFoodIds);
  const favoriteRecords = useLive('favorites');
  const favById = new Map(favoriteRecords.map((r) => [r.food?.id, r.food]));
  const usualId = (u: UsualFood) => u.food?.id ?? u.last.foodId ?? '';
  const lead: UsualFood | undefined = usualAll[0];
  const favFoods = favoriteIds
    .map((id) => (favById.get(id) ? resolveFood(favById.get(id)!, customIdx) : null))
    .filter((f): f is Food => !!f && (!lead || f.id !== usualId(lead)))
    .slice(0, 3);
  const favFoodIds = new Set(favFoods.map((f) => f.id));
  const usualRest = usualAll
    .slice(1)
    .filter((u) => !favFoodIds.has(usualId(u)))
    .slice(0, 3);
  const likelyAll: Likely[] = [
    ...(lead ? [{ kind: 'usual' as const, u: lead }] : []),
    ...favMeals.map((m, i) => ({ kind: 'meal' as const, meal: m, key: `fav-meal:${m.id}`, testID: `quick-fav-meal-${i}`, favourite: true })),
    ...favFoods.map((f, i) => ({ kind: 'food' as const, food: f, index: i })),
    ...usualRest.map((u) => ({ kind: 'usual' as const, u })),
    ...(savedMeal ? [{ kind: 'meal' as const, meal: savedMeal, key: 'saved', testID: 'quick-usual-saved', favourite: false }] : []),
  ];
  const likely = likelyRows(likelyAll);
  const lastMap = lastPortions(entries);
  // Started here because this sheet is mounted for the whole session: search's first frame is then on the tab chosen last.
  useEffect(() => {
    void loadSearchTab();
  }, []);
  // Under 360 px the ways in are a quarter of 280 px: their icons are a step smaller, so a word keeps one line.
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 360;
  // Large text (Profile's text size, or the phone's): every way in is a whole row with its hint, and the likely next
  // log leads the body, which scrolls, so no word is split and nothing is cut by the bottom of the screen. A window
  // too short for the sheet (`SHORT_WINDOW`: a phone held sideways, a browser zoomed to 400%) is scrolled whole by
  // the kit's sheet itself (WCAG 1.4.10).
  const big = useLargeText();
  const glasses = [...presets]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
    .slice(1, 3);

  const close = () => {
    clearTimeout(closeTimer);
    setDone([]);
    onClose();
  };
  // One tap, one log, then the sheet steps aside: a food or meal row and either glass log at once, show their done
  // mark for the guard's length and close, so the toast with Undo rests on the screen below, near the thumb and
  // clear of the sheet's controls. Every one-tap control shares one guard (`oneTapThenClose`), and a press inside
  // that window (the second tap of a double tap) is ignored, so it never logs twice nor reaches the screen under
  // the closing sheet.
  const logThenClose = (log: () => void) => oneTapThenClose(log, close);
  const go = (href: string) => {
    close();
    // Read at the moment of the tap, never from a render that may be hours old.
    const target = href.replace('{food}', `meal=${mealForTime()}&date=${quickLogDate()}`).replace('{past}', `date=${quickLogPastDate()}`);
    // Let the sheet start closing before the next screen slides in.
    setTimeout(() => router.push(target as never), 60);
  };
  const mark = (key: string) => setDone((d) => [...d, key]);

  const food = '{food}';
  // The two AI ways in wear the AI's own glyphs (the cup with its drop) and its small "AI" tag, so the AI is
  // recognised before the tap; every other way keeps its lucide icon.
  const ways: Record<QuickWayId, { icon?: LucideIcon; glyph?: AiGlyphName; color: string; href: string }> = {
    photo: { glyph: 'photo', color: colors.calories, href: `/food/photo?${food}` },
    describe: { glyph: 'describe', color: colors.calories, href: `/food/photo?mode=text&${food}` },
    activity: { icon: Activity, color: colors.exercise, href: '/activity/pick?{past}' },
    weight: { icon: Scale, color: colors.weight, href: '/weight?{past}' },
    scan: { icon: ScanBarcode, color: colors.calories, href: `/food/scan?${food}` },
  };
  const wayIcon = (id: QuickWayId, size: number) => {
    const w = ways[id];
    return w.glyph ? <AiGlyph name={w.glyph} size={size} color={w.color} /> : w.icon ? <w.icon size={size} color={w.color} strokeWidth={1.9} /> : null;
  };

  // Every tile is a small cup: square shoulders, round base, 1 px border, flat.
  const tile = {
    backgroundColor: colors.surface,
    ...cup(radius.tile, 5),
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  // A usual row's source, for its mark and its spoken name: an entry that carries a range is an estimate (it logs
  // again as one); a favourite food's is the food's own. A bundled food with no record is "Typical values"
  // (`sourceKindOf`), never reference data.
  const entrySource = (e: FoodEntry): SourceKind => (e.kcalRange ? 'ai' : sourceKindOf(e));

  const likelyRow = (item: Likely, first: boolean) => {
    if (item.kind === 'meal') {
      const m = item.meal;
      return (
        <MealRow
          key={item.key}
          meal={m}
          first={first}
          big={big}
          narrow={narrow}
          testID={item.testID}
          favourite={item.favourite}
          mealName={mealName}
          done={done.includes(item.key)}
          onPress={() =>
            logThenClose(() => {
              // A recipe logs one serving as a single line; a plain meal logs its items.
              logSavedMeal(m, mealForTime(), quickLogDate());
              mark(item.key);
            })
          }
        />
      );
    }
    if (item.kind === 'food') {
      const f = item.food;
      const key = `fav-food:${f.id}`;
      const isDone = done.includes(key);
      const p = portionFor(f, lastMap);
      const src = sourceKindOf(f);
      // An AI food, or one last logged as an estimate, never shows an exact number: "150 g, ~248 kcal".
      const { caption, label } = favoriteFoodTile({
        name: displayFoodName(f),
        portion: portionLabel(p.serving.label, p.quantity),
        kcal: portionKcal(f, p),
        estimate: isEstimateFood(f, lastMap.get(f.id)),
        meal: mealName,
      });
      return (
        <LikelyRow
          key={key}
          testID={`quick-fav-food-${item.index}`}
          first={first}
          big={big}
          narrow={narrow}
          emoji={f.emoji}
          name={displayFoodName(f)}
          caption={caption}
          captionTestID={`quick-fav-food-${item.index}-caption`}
          source={src}
          done={isDone}
          // The source in words (principle 3): the mark alone says nothing to a screen reader.
          accessibilityLabel={isDone ? `${displayFoodName(f)}, ${caption}, added` : `${label}. ${sourceInfo(src).label}`}
          onPress={() =>
            logThenClose(() => {
              logFavoriteFood(f, quickLogDate());
              mark(key);
            })
          }
        />
      );
    }
    const u = item.u;
    const isDone = done.includes(u.key);
    const src = entrySource(u.last);
    return (
      <LikelyRow
        key={u.key}
        testID={`quick-usual-${u.key}`}
        first={first}
        big={big}
        narrow={narrow}
        emoji={u.last.emoji}
        name={displayFoodName(u.last)}
        // The serving label drawn isolated when it is written in Hebrew (display only).
        caption={usualLabel({ ...u, last: { ...u.last, servingLabel: servingText(u.last.servingLabel) } })}
        source={src}
        done={isDone}
        // The row's words as drawn (WCAG 2.5.3, label in name), then its source in words and the meal.
        accessibilityLabel={isDone ? `${displayFoodName(u.last)}, ${usualLabel(u)}, added` : `Add ${displayFoodName(u.last)}, ${usualLabel(u)}, ${sourceInfo(src).label}, to ${mealName}`}
        onPress={() =>
          logThenClose(() => {
            logUsual(u, quickLogDate());
            mark(u.key);
          })
        }
      />
    );
  };

  const shownKinds = {
    usual: likely.shown.some((l) => l.kind === 'usual'),
    favourites: likely.shown.some((l) => l.kind === 'food' || (l.kind === 'meal' && l.favourite)),
    saved: likely.shown.some((l) => l.kind === 'meal' && !l.favourite),
  };
  const likelyBlock =
    likely.shown.length > 0 ? (
      <View style={{ gap: spacing.sm }} testID="quick-usual">
        {/* The overline and, when there are more than three, "See all N" at its end, laid out at 24 px (the small
            button's 36 px with -6 margins), so the rows under it never move. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 24 }}>
          <Text variant="overline" color="textSecondary" testID="quick-usual-title" style={{ flex: 1, minWidth: 0 }}>
            {quickRowTitle({ meal: mealName, ...shownKinds })}
          </Text>
          {likely.more ? (
            <Button
              testID="quick-see-all"
              title={seeAllLabel(likely.total)}
              accessibilityLabel={seeAllSpoken(likely.total, mealName)}
              variant="ghost"
              size="sm"
              full={false}
              iconRight={<ChevronRight size={18} color={colors.actionInk} strokeWidth={2.2} />}
              onPress={() => go(`/food/search?${food}`)}
              style={{ marginVertical: -6, marginLeft: 8, marginRight: -6, paddingHorizontal: 6 }}
            />
          ) : null}
        </View>
        <View style={[tile, { paddingLeft: 12, paddingRight: 6 }]}>{likely.shown.map((l, i) => likelyRow(l, i === 0))}</View>
      </View>
    ) : null;

  // Shown while the meal is empty, and kept with its done mark once tapped (the sheet stays open), so nothing
  // under the finger moves and the sheet's top does not drop.
  const showRepeat = !!prev && (!alreadyLogged || done.includes('repeat'));
  const repeatRow =
    showRepeat && prev ? (
      <RepeatRow
        label={`Repeat ${whenPhrase(prev.date, logDate)}'s ${mealName}`}
        entries={prev.entries}
        big={big}
        narrow={narrow}
        // Done while what it copied is there: its toast's Undo makes it a Repeat again.
        done={done.includes('repeat') && alreadyLogged}
        onPress={() => {
          const m = mealForTime();
          const date = quickLogDate();
          const p = findPreviousMeal(live(useStore.getState().foodEntries), date, m, 7);
          if (p) copyEntries(p.entries, date, m, `Copied ${MEAL_LABEL[m].toLowerCase()} from ${whenPhrase(p.date, date)}`);
          mark('repeat');
        }}
      />
    ) : null;

  // Search food, one row with Scan at its right end (two siblings in one cup, never one inside the other): one tap
  // for either. With large text Scan is a whole row among the ways in, so "Search food" keeps the row to itself.
  const searchRow = (
    <View style={[tile, { flexDirection: 'row', alignItems: 'stretch' }]} testID="quick-search-row">
      <PressableScale
        testID="quick-search"
        onPress={() => go(`/food/search?${food}`)}
        accessibilityLabel="Search food"
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingLeft: 14, paddingRight: 8, paddingVertical: big ? 10 : 0 }}>
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Search size={22} color={colors.calories} strokeWidth={1.9} />
        </View>
        <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
          Search food
        </Text>
      </PressableScale>
      {big ? null : (
        <>
          <View style={{ width: 1, marginVertical: 10, backgroundColor: colors.border }} />
          <PressableScale
            testID="quick-scan"
            onPress={() => go(ways.scan.href)}
            accessibilityLabel={QUICK_WAYS.scan.spoken}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: narrow ? 12 : 16 }}>
            {wayIcon('scan', 22)}
            <Text variant="label">{QUICK_WAYS.scan.label}</Text>
          </PressableScale>
        </>
      )}
    </View>
  );

  // Water is a whole row: its name on the left (opens the water screen), the one-tap glasses on the right, the
  // kit's small secondary Button with the water edge, as Today's glass is. Under 360 px, and under 390 px for the
  // longer glasses in fluid ounces ("16 fl oz"), the row pads 12, the name and the glasses sit 8 apart and the
  // name's drop goes, so name and glasses stay on one line and the sheet keeps to one view.
  const compactWater = narrow || (profile.units === 'imperial' && winW < 390);
  const waterRow = (
    <View
      style={[tile, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: compactWater ? 12 : 14, paddingVertical: big ? 10 : narrow ? 2 : 4, gap: compactWater ? 8 : 12 }]}
      testID="quick-water-tile">
      <PressableScale
        testID="quick-water"
        onPress={() => go('/water')}
        accessibilityLabel="Water, open hydration"
        style={{ flexDirection: 'row', alignItems: 'center', gap: compactWater ? 10 : 14, minHeight: 44, flexGrow: 1 }}>
        {compactWater ? null : (
          <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
            <Droplets size={22} color={colors.water} strokeWidth={1.9} />
          </View>
        )}
        <Text variant="bodyStrong">Water</Text>
      </PressableScale>
      {/* 8 apart: each glass's touch area reaches 4 px past its edge (the small Button's slop), so the two areas
          meet in the middle of the gap and neither takes the other's taps. */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {glasses.map((ml) => (
          <Button
            key={ml}
            testID={`quick-water-${ml}`}
            title={formatVolume(ml, profile.units)}
            // The glass's words as drawn ("250 ml"; label in name), then what it does.
            accessibilityLabel={`Add ${formatVolume(ml, profile.units)} of water`}
            variant="secondary"
            tint={colors.water}
            size="sm"
            full={false}
            icon={<Plus size={18} color={colors.water} strokeWidth={2.2} />}
            onPress={() =>
              logThenClose(() => {
                // With the day's goal, so the toast names the new total as Today's glass does ("250 ml added to Water · 1.48 of 3.3 L").
                const day = quickLogPastDate();
                addWater(day, ml, profile.units, computeDayFromStore(useStore.getState(), day)?.waterGoalMl);
              })
            }
          />
        ))}
      </View>
    </View>
  );

  // The four small ways in: an icon over one word, the AI's two with its tag. Each is a quarter of the row.
  const waysRow = (
    <View style={{ flexDirection: 'row', gap: spacing.sm }} testID="quick-ways">
      {(['photo', 'describe', 'activity', 'weight'] as const).map((id) => (
        <PressableScale
          key={id}
          testID={`quick-${id}`}
          onPress={() => go(ways[id].href)}
          // The drawn word first (label in name), then what the hint said before it was left off the screen.
          accessibilityLabel={QUICK_WAYS[id].spoken}
          scaleTo={0.96}
          style={[tile, { flex: 1, minWidth: 0, minHeight: narrow ? 56 : 64, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: narrow ? 8 : 10, paddingBottom: narrow ? 6 : 8, paddingHorizontal: 2 }]}>
          {ways[id].glyph ? <AiTag narrow={narrow} /> : null}
          {wayIcon(id, narrow ? 20 : 22)}
          {/* Two lines at most: one word per line under wider text spacing (WCAG 1.4.12), never cut. */}
          <Text variant="label" align="center" numberOfLines={2}>
            {QUICK_WAYS[id].label}
          </Text>
        </PressableScale>
      ))}
    </View>
  );

  // With large text: every way in is a whole row (icon, name, hint under it), Scan barcode among them.
  const wideWays = (
    <View style={{ gap: 10 }} testID="quick-ways">
      {(['photo', 'scan', 'describe', 'activity', 'weight'] as const).map((id) => (
        <PressableScale
          key={id}
          testID={`quick-${id}`}
          onPress={() => go(ways[id].href)}
          // The name and its hint, as drawn.
          accessibilityLabel={wideWaySpoken(id)}
          style={[tile, { flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 64, gap: 14 }]}>
          <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>{wayIcon(id, 22)}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong">{QUICK_WAYS[id].wide}</Text>
            <Text variant="caption" color="textSecondary">
              {QUICK_WAYS[id].hint}
            </Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );

  return (
    <Sheet visible={visible} onClose={close} title={quickSheetTitle(mealName, logDate, todayDate)}>
      {/* One view, nothing pinned: the blocks 12 apart (the sheet body's own gap). */}
      <DayLine date={logDate} today={todayDate} />
      {big ? (
        <>
          {searchRow}
          {repeatRow}
          {likelyBlock}
          {waterRow}
          {wideWays}
        </>
      ) : (
        <>
          {waysRow}
          {searchRow}
          {repeatRow}
          {likelyBlock}
          {waterRow}
        </>
      )}
    </Sheet>
  );
}

/**
 * The line under the title: the day and what is left of its budget ("Today · 941 kcal left"), in food search's
 * header words. Its own component, so the day is worked out only while the sheet is open (a sheet that is not
 * visible draws none of its content).
 */
function DayLine({ date, today }: { date: ISODate; today: ISODate }) {
  const remaining = useDay(date).remaining;
  return (
    <Text variant="caption" color="textSecondary" testID="quick-day-line">
      {quickSheetLine(date, today, remaining)}
    </Text>
  );
}

/**
 * The small "AI" tag at a way in's top right corner, beside the AI's glyph (the accent ink on its soft fill). Under
 * 360 px it hugs the corner, so it stays clear of the glyph in a quarter of 280 px.
 */
function AiTag({ narrow }: { narrow: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <View
      // The tile's name says "AI estimate": the tag is drawn only.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...({ 'aria-hidden': true } as object)}
      style={{ position: 'absolute', top: narrow ? 3 : 4, right: narrow ? 3 : 4, paddingHorizontal: narrow ? 2 : 4, paddingVertical: 1, borderRadius: radius.chip, backgroundColor: colors.primarySoft }}>
      <Text variant="overline" color="primaryInk" style={{ letterSpacing: 0.4 }}>
        {AI_TAG}
      </Text>
    </View>
  );
}

/** A likely food as a whole row: its emoji, its name and, under it, its source's mark and its portion and calories; "+" at the end. */
function LikelyRow({
  testID,
  first,
  big,
  narrow,
  emoji,
  name,
  caption,
  captionTestID,
  source,
  done,
  accessibilityLabel,
  onPress,
}: {
  testID: string;
  first: boolean;
  big: boolean;
  narrow: boolean;
  emoji?: string;
  name: string;
  caption: string;
  captionTestID?: string;
  source: SourceKind | null;
  done: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID={testID}
      feedback="none"
      disabled={done}
      // Added, not unavailable: the done mark says so, so the row is not dimmed.
      dimDisabled={false}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      scaleTo={0.98}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: narrow ? 46 : 48, paddingVertical: 5, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Text style={{ fontSize: 17, lineHeight: 22, minWidth: 22 }}>{emoji || '🍽️'}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" numberOfLines={big ? 3 : 1}>
          {isolateRtl(name)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          {source ? <SourceMark source={source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(source) }} /> : null}
          <Text variant="caption" color="textSecondary" numberOfLines={big ? 3 : 1} style={{ flexShrink: 1 }} testID={captionTestID}>
            {caption}
          </Text>
        </View>
      </View>
      <AddMark done={done} />
    </PressableScale>
  );
}

/**
 * A saved meal as a likely row: a favourite (`quick-fav-meal-<i>`) or the meal changed last (`quick-usual-saved`).
 * A saved estimate never shows an exact number: "3 items, ~640 kcal".
 */
function MealRow({ meal, first, big, narrow, testID, favourite, mealName, done, onPress }: { meal: SavedMeal; first: boolean; big: boolean; narrow: boolean; testID: string; favourite: boolean; mealName: string; done: boolean; onPress: () => void }) {
  const servings = mealServings(meal);
  const plan = planSavedMeal(meal);
  const estimate = !!plan.range;
  const caption = savedTileCaption({ items: meal.items.length, servings, servingsText: formatPortion(servings), kcal: plan.kcal, estimate });
  return (
    <LikelyRow
      testID={testID}
      first={first}
      big={big}
      narrow={narrow}
      emoji="🍱"
      name={meal.name}
      caption={caption}
      captionTestID={`${testID}-caption`}
      source={null}
      done={done}
      // The row's words as drawn (label in name: "Chicken and rice bowl, 3 items, ~592 kcal").
      accessibilityLabel={done ? `${meal.name}, ${caption}, added` : `Add ${favourite ? 'favourite' : 'saved'} meal ${meal.name}, ${caption}, to ${mealName}`}
      onPress={onPress}
    />
  );
}

function RepeatRow({ label, entries, big, narrow, done, onPress }: { label: string; entries: FoodEntry[]; big: boolean; narrow: boolean; done: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  // What the tap stores: a bundled food at today's values for its grams (currentKcal, the rule copyEntries logs by).
  const kcal = currentKcal(entries);
  // Each food by its name's head ("Israeli salad", "Pasta"), so the list's commas part foods only.
  const names = entries.map((e) => isolateRtl(foodNameHead(displayFoodName(e)))).join(', ');
  return (
    <PressableScale
      testID="quick-repeat"
      feedback="none"
      disabled={done}
      // Added, not unavailable: the success edge and the done mark say so, so the row is not dimmed.
      dimDisabled={false}
      onPress={onPress}
      // Its words as drawn (label in name), then every food in full.
      accessibilityLabel={`${label}, ${formatNumber(kcal)} kcal: ${entries.map((e) => displayFoodName(e)).join(', ')}${done ? '. Added' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: narrow ? 52 : 56,
        paddingVertical: narrow ? 5 : 7,
        paddingLeft: 14,
        paddingRight: 10,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: done ? colors.success : 'transparent',
      }}>
      {/* Under 360 px the arrows go, so "Repeat yesterday's dinner" keeps its line whole (as Water's drop goes). */}
      {narrow ? null : (
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Repeat2 size={22} color={colors.text} strokeWidth={2} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={big ? undefined : 1}>
          {label}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={big ? 2 : 1}>
          {`${formatNumber(kcal)} kcal · ${names}`}
        </Text>
      </View>
      <AddMark done={done} />
    </PressableScale>
  );
}

/**
 * The "+" at a row's end: a small bordered cup whose "+" becomes the done mark once added, the small filled ink cup
 * (as a chosen row's), never a check, which means only a day on budget. The row is the control; this only shows it.
 */
function AddMark({ done }: { done: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 30,
        height: 30,
        ...cup(10, 4),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: done ? colors.text : colors.borderStrong,
        backgroundColor: 'transparent',
      }}>
      {done ? <CupKey color={colors.text} size={12} /> : <Plus size={16} color={colors.text} strokeWidth={2.4} />}
    </View>
  );
}
