import { router } from 'expo-router';
import { Activity, Camera, Check, Copy, Droplets, PenLine, Plus, Scale, ScanBarcode, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { matchServing } from '@/features/food/helpers';
import { logFood, logItems } from '@/features/food/log';
import { addWater } from '@/features/today/StatusRail';
import { usualFoods, usualLabel, type UsualFood } from '@/features/today/usuals';
import { addDays, formatShortDate, today } from '@/lib/dates';
import { MEAL_LABEL, mealForTime } from '@/lib/nutrition';
import { formatNumber, formatVolume } from '@/lib/units';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { live, useLive, useProfile } from '@/store/selectors';
import { useTheme } from '@/theme';
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

  const usual = usualFoods(entries, meal, todayDate);
  const prev = findPreviousMeal(entries, todayDate, meal, 7);
  const alreadyLogged = entries.some((e) => e.date === todayDate && e.meal === meal);
  const savedMeal = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] as SavedMeal | undefined;
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
    const target = href.replace('{food}', `meal=${mealForTime()}&date=${today()}`);
    // Let the sheet start closing before the next screen slides in.
    setTimeout(() => router.push(target as never), 60);
  };
  const mark = (key: string) => setDone((d) => [...d, key]);

  const food = '{food}';
  const actions = [
    { id: 'search', label: 'Search food', hint: 'Database and your recents', icon: Search, color: colors.calories, href: `/food/search?${food}` },
    { id: 'photo', label: 'Snap a meal', hint: 'AI estimates from a photo', icon: Camera, color: colors.fat, href: `/food/photo?${food}` },
    { id: 'scan', label: 'Scan barcode', hint: 'Packaged products', icon: ScanBarcode, color: colors.carbs, href: `/food/scan?${food}` },
    { id: 'describe', label: 'Describe it', hint: 'Type what you ate', icon: PenLine, color: colors.protein, href: `/food/photo?mode=text&${food}` },
    { id: 'activity', label: 'Log activity', hint: 'Sport, gym, walk', icon: Activity, color: colors.exercise, href: '/activity/pick' },
    { id: 'weight', label: 'Weigh in', hint: 'Weight and body fat', icon: Scale, color: colors.weight, href: '/weight' },
  ];

  const tile = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  } as const;

  const showUsual = usual.length > 0 || !!savedMeal;
  const showRepeat = !!prev && !alreadyLogged;

  return (
    <Sheet visible={visible} onClose={close} title="Log something">
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
                    logUsual(u, today());
                    mark(u.key);
                  }}
                  accessibilityLabel={isDone ? `${u.last.name} added` : `Add ${u.last.name}, ${usualLabel(u)}, to ${mealName}`}
                  style={[tile, { width: 132, padding: spacing.md, gap: 6, borderColor: isDone ? colors.success : colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 22, lineHeight: 28 }}>{u.last.emoji || '🍽️'}</Text>
                    <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDone ? colors.success : colors.primarySoft }}>
                      {isDone ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : <Plus size={14} color={colors.primary} strokeWidth={2.6} />}
                    </View>
                  </View>
                  <Text variant="label" numberOfLines={1}>
                    {u.last.name}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {usualLabel(u)}
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
                  logItems(savedMeal.items, mealForTime(), today(), `${savedMeal.name} added to ${MEAL_LABEL[mealForTime()].toLowerCase()}`);
                  mark('saved');
                }}
                accessibilityLabel={`Add saved meal ${savedMeal.name} to ${mealName}`}
                style={[tile, { width: 132, padding: spacing.md, gap: 6, borderColor: done.includes('saved') ? colors.success : colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 22, lineHeight: 28 }}>🍱</Text>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done.includes('saved') ? colors.success : colors.primarySoft }}>
                    {done.includes('saved') ? <Check size={14} color={colors.onPrimary} strokeWidth={3} /> : <Plus size={14} color={colors.primary} strokeWidth={2.6} />}
                  </View>
                </View>
                <Text variant="label" numberOfLines={1}>
                  {savedMeal.name}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {`${savedMeal.items.length} ${savedMeal.items.length === 1 ? 'item' : 'items'}, ${formatNumber(savedMeal.items.reduce((s, i) => s + i.nutrients.kcal, 0))} kcal`}
                </Text>
              </PressableScale>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {showRepeat && prev ? (
        <RepeatRow
          label={`Repeat ${whenPhrase(prev.date, todayDate)}'s ${mealName}`}
          entries={prev.entries}
          done={done.includes('repeat')}
          onPress={() => {
            const m = mealForTime();
            const date = today();
            const p = findPreviousMeal(live(useStore.getState().foodEntries), date, m, 7);
            if (p) copyEntries(p.entries, date, m, `Copied ${MEAL_LABEL[m].toLowerCase()} from ${whenPhrase(p.date, date)}`);
            mark('repeat');
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {actions.map((a, i) => (
          <PressableScale
            key={a.id}
            testID={`quick-${a.id}`}
            onPress={() => go(a.href)}
            accessibilityLabel={a.label}
            style={[
              tile,
              {
                flexBasis: i === 0 ? '100%' : '47%',
                flexGrow: 1,
                flexDirection: i === 0 ? 'row' : 'column',
                alignItems: i === 0 ? 'center' : 'flex-start',
                padding: 14,
                gap: i === 0 ? 14 : 10,
              },
            ]}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: `${a.color}22`, alignItems: 'center', justifyContent: 'center' }}>
              <a.icon size={20} color={a.color} />
            </View>
            <View>
              <Text variant="bodyStrong">{a.label}</Text>
              <Text variant="caption" color="textSecondary">
                {a.hint}
              </Text>
            </View>
          </PressableScale>
        ))}
        <View style={[tile, { flexBasis: '47%', flexGrow: 1, padding: 14, gap: 10 }]} testID="quick-water-tile">
          <PressableScale
            testID="quick-water"
            onPress={() => go('/water')}
            accessibilityLabel="Water, open hydration"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: `${colors.water}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Droplets size={20} color={colors.water} />
            </View>
            <Text variant="bodyStrong">Water</Text>
          </PressableScale>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {glasses.map((ml) => (
              <PressableScale
                key={ml}
                testID={`quick-water-${ml}`}
                feedback="none"
                hitSlop={4}
                onPress={() => addWater(today(), ml, profile.units)}
                accessibilityLabel={`Add ${formatVolume(ml, profile.units)} of water`}
                style={{ flex: 1, height: 38, borderRadius: radius.pill, backgroundColor: `${colors.water}22`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Plus size={12} color={colors.water} strokeWidth={2.8} />
                <Text variant="label" color="water" style={{ fontSize: 12 }} numberOfLines={1}>
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
  const names = entries.map((e) => e.name).join(', ');
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
        borderRadius: radius.lg,
        backgroundColor: colors.primarySoft,
        borderWidth: 1,
        borderColor: done ? colors.success : 'transparent',
      }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        {done ? <Check size={20} color={colors.success} strokeWidth={2.6} /> : <Copy size={18} color={colors.primary} />}
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
