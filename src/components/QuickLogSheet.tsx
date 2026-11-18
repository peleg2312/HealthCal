import { router } from 'expo-router';
import { Activity, Camera, Check, Droplets, PenLine, Plus, Repeat2, Scale, ScanBarcode, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { hasFoodLogged } from '@/features/drinks/via';
import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { matchServing, servingText } from '@/features/food/helpers';
import { formatPortion, mealServings, planSavedMeal } from '@/features/food/build';
import { logFood, logItems, logSavedMeal } from '@/features/food/log';
import { addWater } from '@/features/today/StatusRail';
import { quickLogDate, quickLogPastDate, useViewedDay } from '@/features/today/viewedDay';
import { customFoodIndex, resolveUsuals, usualFoods, usualLabel, type UsualFood } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatDayLabel, formatShortDate } from '@/lib/dates';
import { MEAL_LABEL, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { live, useLive, useProfile } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import type { FoodEntry, ISODate, SavedMeal } from '@/types';
import { PressableScale, Sheet, Text } from '@/ui';

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

const whenPhrase = (date: ISODate, from: ISODate) => (date === addDays(from, -1) ? 'yesterday' : formatShortDate(date));

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
  const usual = resolveUsuals(usualFoods(entries, meal, todayDate, { limit: 8 }), customFoodIndex(customFoods)).slice(0, 4);
  // The day the screen behind the sheet shows (a past day on Today, the diary's date), else today.
  const viewed = useViewedDay((s) => s.date);
  const logDate = viewed ?? todayDate;
  const prev = findPreviousMeal(entries, logDate, meal, 7);
  const alreadyLogged = hasFoodLogged(entries.filter((e) => e.date === logDate && e.meal === meal));
  const savedMeal = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] as SavedMeal | undefined;
  const savedServings = savedMeal ? mealServings(savedMeal) : 1;
  // Under 360 px a half tile has no room for the icon beside its name ("Snap a" / "meal"): the icon goes above it.
  const narrow = useWindowDimensions().width < 360;
  const glasses = [...presets]
    .filter((p) => p > 0)
    .sort((a, b) => a - b)
    .slice(1, 3);

  const close = () => {
    setDone([]);
    onClose();
  };
  const go = (href: string) => {
    close();
    // Read at the moment of the tap, never from a render that may be hours old.
    const target = href.replace('{food}', `meal=${mealForTime()}&date=${quickLogDate()}`).replace('{past}', `date=${quickLogPastDate()}`);
    // Let the sheet start closing before the next screen slides in.
    setTimeout(() => router.push(target as never), 60);
  };
  const mark = (key: string) => setDone((d) => [...d, key]);

  const food = '{food}';
  const actions = [
    { id: 'search', label: 'Search food', hint: 'Database and your recents', icon: Search, color: colors.calories, href: `/food/search?${food}` },
    { id: 'photo', label: 'Snap a meal', hint: 'Photo, AI estimate', icon: Camera, color: colors.calories, href: `/food/photo?${food}` },
    { id: 'scan', label: 'Scan barcode', hint: 'Packaged products', icon: ScanBarcode, color: colors.calories, href: `/food/scan?${food}` },
    { id: 'describe', label: 'Describe it', hint: 'Type what you ate', icon: PenLine, color: colors.calories, href: `/food/photo?mode=text&${food}` },
    { id: 'activity', label: 'Log activity', hint: 'Sport, gym, walk', icon: Activity, color: colors.exercise, href: '/activity/pick?{past}' },
    { id: 'weight', label: 'Weigh in', hint: 'Weight and body fat', icon: Scale, color: colors.weight, href: '/weight?{past}' },
  ];

  // Every tile is a small cup: square shoulders, round base, 1 px border, flat.
  const tile = {
    backgroundColor: colors.surface,
    ...cup(radius.tile, 5),
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  const showUsual = usual.length > 0 || !!savedMeal;
  const showRepeat = !!prev && !alreadyLogged;

  return (
    <Sheet visible={visible} onClose={close} title={viewed ? `Log to ${formatDayLabel(viewed)}` : 'Log something'}>
      {showUsual ? (
        <View style={{ gap: spacing.sm }} testID="quick-usual">
          <Text variant="overline" color="textSecondary">
            {usual.length ? `Usual for ${mealName}` : 'Saved meal'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl, flexGrow: 0 }} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
            {usual.map((u) => {
              const isDone = done.includes(u.key);
              return (
                <PressableScale
                  key={u.key}
                  testID={`quick-usual-${u.key}`}
                  feedback="none"
                  disabled={isDone}
                  onPress={() => {
                    logUsual(u, quickLogDate());
                    mark(u.key);
                  }}
                  accessibilityLabel={isDone ? `${u.last.name} added` : `Add ${u.last.name}, ${usualLabel(u)}, to ${mealName}`}
                  style={[tile, { width: 136, padding: spacing.md, gap: 4, borderColor: isDone ? colors.success : colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 17, lineHeight: 24 }}>{u.last.emoji || '🍽️'}</Text>
                    <AddMark done={isDone} />
                  </View>
                  {/* Two lines, so a name like "Greek yogurt, plain, 2%" reads whole. The name never grows with the row
                      (a taller neighbour would show the line after its ellipsis); the caption sits at the foot instead. */}
                  <Text variant="label" numberOfLines={2}>
                    {isolateRtl(u.last.name)}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ marginTop: 'auto' }}>
                    {/* The serving label drawn isolated when it is written in Hebrew (display only). */}
                    {usualLabel({ ...u, last: { ...u.last, servingLabel: servingText(u.last.servingLabel) } })}
                  </Text>
                </PressableScale>
              );
            })}
            {savedMeal ? (
              <PressableScale
                key="saved"
                testID="quick-usual-saved"
                feedback="none"
                disabled={done.includes('saved')}
                onPress={() => {
                  // A recipe logs one serving as a single line; a plain meal logs its items.
                  logSavedMeal(savedMeal, mealForTime(), quickLogDate());
                  mark('saved');
                }}
                accessibilityLabel={`Add saved meal ${savedMeal.name} to ${mealName}`}
                style={[tile, { width: 136, padding: spacing.md, gap: 4, borderColor: done.includes('saved') ? colors.success : colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 17, lineHeight: 24 }}>🍱</Text>
                  <AddMark done={done.includes('saved')} />
                </View>
                <Text variant="label" numberOfLines={2}>
                  {isolateRtl(savedMeal.name)}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ marginTop: 'auto' }}>
                  {savedServings > 1
                    ? `1 of ${formatPortion(savedServings)} servings, ${formatNumber(planSavedMeal(savedMeal).kcal)} kcal`
                    : `${savedMeal.items.length} ${savedMeal.items.length === 1 ? 'item' : 'items'}, ${formatNumber(planSavedMeal(savedMeal).kcal)} kcal`}
                </Text>
              </PressableScale>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {showRepeat && prev ? (
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
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {actions.map((a) => {
          // Search and Weigh in are whole rows (icon, name, hint beside); the four between are half-width tiles
          // with the icon beside the name and the hint under both, so the sheet fits a 360 x 740 phone whole.
          const wide = a.id === 'search' || a.id === 'weight';
          return (
            <PressableScale
              key={a.id}
              testID={`quick-${a.id}`}
              onPress={() => go(a.href)}
              accessibilityLabel={wide || !narrow ? a.label : `${a.label}. ${a.hint}`}
              style={[
                tile,
                wide
                  ? { flexBasis: '100%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', padding: 14, minHeight: 64, gap: 14 }
                  : { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 4 },
              ]}>
              {wide ? (
                <>
                  <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <a.icon size={22} color={a.color} strokeWidth={1.9} />
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
                      <a.icon size={20} color={a.color} strokeWidth={1.9} />
                    </View>
                    <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                      {a.label}
                    </Text>
                  </View>
                  {/* Under 360 px the icon sits above the name and the hint is read out only, so the sheet still fits. */}
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
        {/* Water is a whole row too: its name on the left (opens the water screen), the one-tap glasses on the right. */}
        <View style={[tile, { flexBasis: '100%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 14, paddingVertical: 10, gap: 12 }]} testID="quick-water-tile">
          <PressableScale
            testID="quick-water"
            onPress={() => go('/water')}
            accessibilityLabel="Water, open hydration"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, flexGrow: 1 }}>
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Droplets size={22} color={colors.water} strokeWidth={1.9} />
            </View>
            <Text variant="bodyStrong">Water</Text>
          </PressableScale>
          {/* 12 apart: each glass's touch area reaches 6 px past its edge (4 of slop and the border), so the two
              areas meet in the middle of the gap and neither takes the other's taps. */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {glasses.map((ml) => (
              <PressableScale
                key={ml}
                testID={`quick-water-${ml}`}
                feedback="none"
                hitSlop={4}
                onPress={() => addWater(quickLogPastDate(), ml, profile.units)}
                accessibilityLabel={`Add ${formatVolume(ml, profile.units)} of water`}
                style={{ minWidth: 30 + formatVolume(ml, profile.units).length * 7, paddingHorizontal: 10, height: 36, ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.water, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Plus size={14} color={colors.water} strokeWidth={2.6} />
                <Text variant="label" color="text" style={{ fontSize: 12.5 }} numberOfLines={1}>
                  {formatVolume(ml, profile.units)}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

function RepeatRow({ label, entries, done, onPress }: { label: string; entries: FoodEntry[]; done: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const kcal = entries.reduce((s, e) => s + e.nutrients.kcal, 0);
  const names = entries.map((e) => isolateRtl(e.name)).join(', ');
  return (
    <PressableScale
      testID="quick-repeat"
      feedback="none"
      disabled={done}
      onPress={onPress}
      accessibilityLabel={done ? `${label}, added` : `${label}, ${Math.round(kcal)} kilocalories`}
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
        {done ? <Check size={22} color={colors.success} strokeWidth={2.4} /> : <Repeat2 size={22} color={colors.text} strokeWidth={2} />}
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

/** The "+" on a usual-food tile: a tiny bordered cup that turns into a tick once added. */
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
        borderWidth: done ? 0 : 1.5,
        borderColor: colors.borderStrong,
        backgroundColor: done ? colors.success : 'transparent',
      }}>
      {done ? <Check size={15} color={colors.surface} strokeWidth={3} /> : <Plus size={15} color={colors.text} strokeWidth={2.4} />}
    </View>
  );
}
