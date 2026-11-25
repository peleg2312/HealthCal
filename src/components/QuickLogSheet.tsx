import { router } from 'expo-router';
import { Activity, Droplets, Plus, Repeat2, Scale, ScanBarcode, Search, type LucideIcon } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { AiGlyph, SourceMark, sourceMarkTop, type AiGlyphName } from '@/features/ai/mark';
import { AI_TILE_HINT } from '@/features/ai/words';
import { hasFoodLogged } from '@/features/drinks/via';
import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { displayFoodName } from '@/features/food/displayName';
import { favoriteMeals, quickLogMeal } from '@/features/food/favorites';
import { favoriteFoodTile, isEstimateFood, quickRowTitle, savedTileCaption } from '@/features/food/favoriteWords';
import { lastPortions, matchServing, portionFor, portionKcal, portionLabel, servingText, sourceInfo, sourceKindOf, type SourceKind } from '@/features/food/helpers';
import { formatPortion, mealServings, planSavedMeal } from '@/features/food/build';
import { logFood, logItems, logSavedMeal } from '@/features/food/log';
import { ONE_TAP_GUARD_MS, tooSoon } from '@/features/food/oneTap';
import { loadSearchTab } from '@/features/food/searchTab';
import { addWater } from '@/features/today/StatusRail';
import { quickLogDate, quickLogPastDate, useViewedDay } from '@/features/today/viewedDay';
import { currentKcal, customFoodIndex, resolveFood, resolveUsuals, usualFoods, usualLabel, type UsualFood } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatDayLabel, formatShortDate } from '@/lib/dates';
import { MEAL_LABEL, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { computeDayFromStore, live, useLive, useProfile } from '@/store/selectors';
import { cup, useLargeText, useTheme } from '@/theme';
import type { Food, FoodEntry, ISODate, SavedMeal } from '@/types';
import { Button, CupKey, PressableScale, Sheet, Text, toastToScreen, useShortWindow } from '@/ui';

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

/** A food or meal tile's width in the row of likely next logs; wider with large text, so a word fits a line. */
const TILE_W = 136;
const TILE_W_BIG = 216;

const whenPhrase = (date: ISODate, from: ISODate) => (date === addDays(from, -1) ? 'yesterday' : formatShortDate(date));

/** Log a favourite food in its last portion (or its default one), read at the moment of the tap. */
function logFavoriteFood(food: Food, date: ISODate) {
  const p = portionFor(food, lastPortions(live(useStore.getState().foodEntries)));
  logFood({ food, serving: p.serving, quantity: p.quantity, meal: mealForTime(), date });
}

/**
 * The sheet behind the centre + button. It leads with the likely next log (the
 * foods usually eaten at this meal, yesterday's meal, a saved meal) and then
 * the ways to log anything else. It stays mounted for the whole session, so the
 * meal and date come from the clock hooks while rendering and from the wall
 * clock again at the moment of each tap.
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
  // Keys logged while the sheet is open turn into ticks; cleared when it closes.
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
  // The meal's first usual food leads the row, so the food most likely logged next is whole in the first view
  // at every width (principle 1: two taps from anywhere); then the favourites, so a starred meal or food is in
  // the first view too: up to three favourite meals, newest star first; then up to three favourite foods,
  // newest first; then the other usual foods not already shown; then the meal changed last when it is not
  // already a tile. A food is shown once: the first usual food is never also a favourite tile.
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
  const lastMap = lastPortions(entries);
  // Started here because this sheet is mounted for the whole session: search's first frame is then on the tab chosen last.
  useEffect(() => {
    void loadSearchTab();
  }, []);
  // Under 360 px a half tile has no room for the icon beside its name ("Snap a" / "meal"): the icon goes above it.
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 360;
  // Large text (Profile's text size, or the phone's): the food tiles grow wider, every way in is a whole row,
  // and nothing is pinned (the likely next log leads the body instead), so no word is split and nothing is cut
  // by the bottom of the screen.
  const big = useLargeText();
  const tileW = big ? TILE_W_BIG : TILE_W;
  // A window too short for the pinned footer (about 380 px) and some body (`useShortWindow`, the kit's
  // `SHORT_WINDOW`: a phone held sideways, a browser zoomed to 400%): nothing is pinned, as with large text, so
  // every way in scrolls into reach (WCAG 1.4.10).
  const short = useShortWindow();
  const unpinned = big || short;
  const glasses = [...presets]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
    .slice(1, 3);

  const close = () => {
    clearTimeout(closeTimer);
    setDone([]);
    onClose();
  };
  // One tap, one log, then the sheet steps aside: a food or meal tile and either glass log at once, show their
  // tick for the guard's length and close, so the toast with Undo rests on the screen below, near the thumb and
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
  // The two AI ways in wear the AI's own glyphs (the cup with its drop) and say "AI estimate", so the AI
  // is recognised before the tap; every other tile keeps its lucide icon.
  const actions: { id: string; label: string; hint: string; icon?: LucideIcon; glyph?: AiGlyphName; color: string; href: string }[] = [
    { id: 'photo', label: 'Snap a meal', hint: AI_TILE_HINT.photo, glyph: 'photo', color: colors.calories, href: `/food/photo?${food}` },
    { id: 'scan', label: 'Scan barcode', hint: 'Packaged products', icon: ScanBarcode, color: colors.calories, href: `/food/scan?${food}` },
    { id: 'describe', label: 'Describe it', hint: AI_TILE_HINT.describe, glyph: 'describe', color: colors.calories, href: `/food/photo?mode=text&${food}` },
    { id: 'activity', label: 'Log activity', hint: 'Sport, gym, walk', icon: Activity, color: colors.exercise, href: '/activity/pick?{past}' },
    { id: 'weight', label: 'Weigh in', hint: 'Weight and body fat', icon: Scale, color: colors.weight, href: '/weight?{past}' },
  ];
  const tileIcon = (a: (typeof actions)[number], size: number) => (a.glyph ? <AiGlyph name={a.glyph} size={size} color={a.color} /> : a.icon ? <a.icon size={size} color={a.color} strokeWidth={1.9} /> : null);

  // Every tile is a small cup: square shoulders, round base, 1 px border, flat.
  const tile = {
    backgroundColor: colors.surface,
    ...cup(radius.tile, 5),
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  const showUsual = !!lead || !!savedMeal || favMeals.length > 0 || favFoods.length > 0;
  const mealTile = (m: SavedMeal, key: string, testID: string, favourite: boolean) => (
    <MealTile
      key={key}
      meal={m}
      width={tileW}
      testID={testID}
      favourite={favourite}
      mealName={mealName}
      done={done.includes(key)}
      onPress={() =>
        logThenClose(() => {
          // A recipe logs one serving as a single line; a plain meal logs its items.
          logSavedMeal(m, mealForTime(), quickLogDate());
          mark(key);
        })
      }
    />
  );
  const showRepeat = !!prev && !alreadyLogged;

  // A usual tile's source, for its mark and its spoken name: an entry that carries a range is an estimate
  // (it logs again as one); a favourite food's is the food's own. A bundled food with no record is "Typical
  // values" (`sourceKindOf`), never reference data.
  const entrySource = (e: FoodEntry): SourceKind => (e.kcalRange ? 'ai' : sourceKindOf(e));

  const usualTile = (u: UsualFood) => {
    const isDone = done.includes(u.key);
    const src = entrySource(u.last);
    return (
      <PressableScale
        key={u.key}
        testID={`quick-usual-${u.key}`}
        feedback="none"
        disabled={isDone}
        dimDisabled={false}
        onPress={() =>
          logThenClose(() => {
            logUsual(u, quickLogDate());
            mark(u.key);
          })
        }
        // The tile's words as drawn (WCAG 2.5.3, label in name), then its source in words and the meal.
        accessibilityLabel={isDone ? `${displayFoodName(u.last)}, ${usualLabel(u)}, added` : `Add ${displayFoodName(u.last)}, ${usualLabel(u)}, ${sourceInfo(src).label}, to ${mealName}`}
        style={[tile, { width: tileW, padding: spacing.md, gap: 4, borderColor: isDone ? colors.success : colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 17, lineHeight: 24 }}>{u.last.emoji || '🍽️'}</Text>
          <AddMark done={isDone} />
        </View>
        {/* Two lines, so a name like "Greek yogurt, plain, 2%" reads whole. The name never grows with the row
            (a taller neighbour would show the line after its ellipsis); the caption sits at the foot instead. */}
        <Text variant="label" numberOfLines={2}>
          {isolateRtl(displayFoodName(u.last))}
        </Text>
        {/* The serving label drawn isolated when it is written in Hebrew (display only). */}
        <TileCaption source={src}>{usualLabel({ ...u, last: { ...u.last, servingLabel: servingText(u.last.servingLabel) } })}</TileCaption>
      </PressableScale>
    );
  };

  const quickRow = showUsual ? (
    <View style={{ gap: spacing.sm }} testID="quick-usual">
      <Text variant="overline" color="textSecondary" testID="quick-usual-title">
        {quickRowTitle({ meal: mealName, favourites: favMeals.length + favFoods.length > 0, usual: !!lead, saved: !!savedMeal })}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl, flexGrow: 0 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
        {lead ? usualTile(lead) : null}
        {favMeals.map((m, i) => mealTile(m, `fav-meal:${m.id}`, `quick-fav-meal-${i}`, true))}
        {favFoods.map((f, i) => {
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
            <PressableScale
              key={key}
              testID={`quick-fav-food-${i}`}
              feedback="none"
              disabled={isDone}
              // Added, not unavailable: the success edge and the done mark say so, so the tile is not dimmed.
              dimDisabled={false}
              onPress={() =>
                logThenClose(() => {
                  logFavoriteFood(f, quickLogDate());
                  mark(key);
                })
              }
              // The source in words (principle 3): the mark alone says nothing to a screen reader.
              accessibilityLabel={isDone ? `${displayFoodName(f)}, ${caption}, added` : `${label}. ${sourceInfo(src).label}`}
              style={[tile, { width: tileW, padding: spacing.md, gap: 4, borderColor: isDone ? colors.success : colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, lineHeight: 24 }}>{f.emoji || '🍽️'}</Text>
                <AddMark done={isDone} />
              </View>
              <Text variant="label" numberOfLines={2}>
                {isolateRtl(displayFoodName(f))}
              </Text>
              <TileCaption source={src} testID={`quick-fav-food-${i}-caption`}>
                {caption}
              </TileCaption>
            </PressableScale>
          );
        })}
        {usualRest.map(usualTile)}
        {savedMeal ? mealTile(savedMeal, 'saved', 'quick-usual-saved', false) : null}
      </ScrollView>
    </View>
  ) : null;

  const repeatRow =
    showRepeat && prev ? (
      <RepeatRow
        label={`Repeat ${whenPhrase(prev.date, logDate)}'s ${mealName}`}
        entries={prev.entries}
        done={done.includes('repeat')}
        onPress={() => {
          const m = mealForTime();
          const date = quickLogDate();
          const p = findPreviousMeal(live(useStore.getState().foodEntries), date, m, 7);
          if (p) copyEntries(p.entries, date, m, `Copied ${MEAL_LABEL[m].toLowerCase()} from ${whenPhrase(p.date, date)}`);
          mark('repeat');
        }}
      />
    ) : null;

  // Search, in the pinned footer at its top: in thumb reach at every width (T2), between the ways in that scroll
  // above and the likely next logs under it. One 48 px row, so the tiles and the glasses keep the first view.
  const searchRow = (
    <PressableScale
      testID="quick-search"
      onPress={() => go(`/food/search?${food}`)}
      accessibilityLabel="Search food"
      style={[tile, { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 }]}>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Search size={22} color={colors.calories} strokeWidth={1.9} />
      </View>
      <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
        Search food
      </Text>
    </PressableScale>
  );

  // Water is a whole row: its name on the left (opens the water screen), the one-tap glasses on the right, the
  // kit's small secondary Button with the water edge, as Today's glass is. Under 360 px the row pads 12, the
  // name and the glasses sit 8 apart and the name's drop goes, so name and glasses stay on one line at 320 px.
  const waterRow = (
    <View
      style={[tile, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: narrow ? 12 : 14, paddingVertical: 10, gap: narrow ? 8 : 12 }]}
      testID="quick-water-tile">
      <PressableScale
        testID="quick-water"
        onPress={() => go('/water')}
        accessibilityLabel="Water, open hydration"
        style={{ flexDirection: 'row', alignItems: 'center', gap: narrow ? 10 : 14, minHeight: 44, flexGrow: 1 }}>
        {narrow ? null : (
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

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={viewed ? `Log to ${formatDayLabel(viewed)}` : 'Log something'}
      // The likely next log is pinned at the sheet's foot, nearest the + that opened it and the thumb (principle 1):
      // Search food over yesterday's meal, the usual and favourite tiles and Water's glasses, in the first view at
      // every width, whatever rows show; the other ways to log scroll above them under the title.
      // With large text the three would fill the screen: they lead the scrolling body instead, still first in view.
      footer={
        unpinned ? undefined : (
          <View testID="quick-pinned" style={{ gap: spacing.md, marginHorizontal: -spacing.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            {searchRow}
            {repeatRow}
            {quickRow}
            {waterRow}
          </View>
        )
      }>
      {unpinned ? (
        <View testID="quick-pinned" style={{ gap: spacing.md }}>
          {searchRow}
          {repeatRow}
          {quickRow}
          {waterRow}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {actions.map((a) => {
          // Weigh in is a whole row (icon, name, hint beside); the four before it are half-width tiles with the
          // icon beside the name and the hint under both (Search food is pinned in the footer).
          // With large text every one is a whole row, so "Describe it" never runs past its tile.
          const wide = big || a.id === 'weight';
          return (
            <PressableScale
              key={a.id}
              testID={`quick-${a.id}`}
              onPress={() => go(a.href)}
              // The name and its hint, as drawn (under 360 px the hint is read out only).
              accessibilityLabel={`${a.label}, ${a.hint}`}
              style={[
                tile,
                wide
                  ? { flexBasis: '100%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 64, gap: 14 }
                  : { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 4 },
              ]}>
              {wide ? (
                <>
                  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    {tileIcon(a, 22)}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong">{a.label}</Text>
                    <Text variant="caption" color="textSecondary">
                      {a.hint}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: narrow ? 'column' : 'row', alignItems: narrow ? 'flex-start' : 'center', gap: narrow ? 6 : 8, minHeight: 24 }}>
                    <View style={{ width: 20, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                      {tileIcon(a, 20)}
                    </View>
                    <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                      {a.label}
                    </Text>
                  </View>
                  {/* Under 360 px the icon sits above the name and the hint is read out only. */}
                  {narrow ? null : (
                    <Text variant="caption" color="textSecondary">
                      {a.hint}
                    </Text>
                  )}
                </>
              )}
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}

/** A food tile's foot: the source's mark leading its caption, as on the diary's rows. */
function TileCaption({ source, testID, children }: { source: SourceKind; testID?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 'auto' }}>
      <SourceMark source={source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(source) }} />
      <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

function RepeatRow({ label, entries, done, onPress }: { label: string; entries: FoodEntry[]; done: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  // What the tap stores: a bundled food at today's values for its grams (currentKcal, the rule copyEntries logs by).
  const kcal = currentKcal(entries);
  const names = entries.map((e) => isolateRtl(displayFoodName(e))).join(', ');
  return (
    <PressableScale
      testID="quick-repeat"
      feedback="none"
      disabled={done}
      // Added, not unavailable: the success edge and the done mark say so, so the row is not dimmed.
      dimDisabled={false}
      onPress={onPress}
      // Its line as drawn (label in name), then the foods under it.
      accessibilityLabel={`${label}, ${formatNumber(kcal)} kcal: ${entries.map((e) => displayFoodName(e)).join(', ')}${done ? '. Added' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: 14,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: done ? colors.success : 'transparent',
      }}>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {/* Done is the small filled ink cup (as a chosen row's), never a check: the check means only a day on budget. */}
        {done ? <CupKey color={colors.text} size={12} /> : <Repeat2 size={22} color={colors.text} strokeWidth={2} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong">{`${label}, ${formatNumber(kcal)} kcal`}</Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {names}
        </Text>
      </View>
    </PressableScale>
  );
}

/**
 * A saved meal as a one-tap tile: a favourite (`quick-fav-meal-<i>`) or the meal changed last
 * (`quick-usual-saved`). A saved estimate never shows an exact number: "3 items, ~640 kcal".
 */
function MealTile({ meal, width, testID, favourite, mealName, done, onPress }: { meal: SavedMeal; width: number; testID: string; favourite: boolean; mealName: string; done: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const servings = mealServings(meal);
  const plan = planSavedMeal(meal);
  const estimate = !!plan.range;
  const caption = savedTileCaption({ items: meal.items.length, servings, servingsText: formatPortion(servings), kcal: plan.kcal, estimate });
  return (
    <PressableScale
      testID={testID}
      feedback="none"
      disabled={done}
      dimDisabled={false}
      onPress={onPress}
      accessibilityLabel={
        // The tile's words as drawn (label in name: "Chicken and rice bowl, 3 items, ~592 kcal").
        done ? `${meal.name}, ${caption}, added` : `Add ${favourite ? 'favourite' : 'saved'} meal ${meal.name}, ${caption}, to ${mealName}`
      }
      style={{
        width,
        padding: spacing.md,
        gap: 4,
        backgroundColor: colors.surface,
        ...cup(radius.tile, 5),
        borderWidth: 1,
        borderColor: done ? colors.success : colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 17, lineHeight: 24 }}>🍱</Text>
        <AddMark done={done} />
      </View>
      <Text variant="label" numberOfLines={2}>
        {isolateRtl(meal.name)}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ marginTop: 'auto' }} testID={`${testID}-caption`}>
        {caption}
      </Text>
    </PressableScale>
  );
}

/**
 * The "+" on a food or meal tile: a tiny bordered cup whose "+" becomes the done mark once added, the small
 * filled ink cup (as a chosen row's), never a check, which means only a day on budget.
 */
function AddMark({ done }: { done: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 26,
        height: 26,
        ...cup(9, 4),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: done ? colors.text : colors.borderStrong,
        backgroundColor: 'transparent',
      }}>
      {done ? <CupKey color={colors.text} size={12} /> : <Plus size={15} color={colors.text} strokeWidth={2.4} />}
    </View>
  );
}
