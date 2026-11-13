import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Copy, Search } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { copyPreviousDay, copyPreviousMeal, findPreviousDay, findPreviousMeal } from '@/features/food/actions';
import { DaySummaryCard, MealCard, MealMenuSheet, WeekStrip } from '@/features/food/DiaryParts';
import { href, kcal, parseDate } from '@/features/food/helpers';
import { addDays, formatDayLabel, formatLongDate, today } from '@/lib/dates';
import { MEALS, entriesTotal, mealForTime } from '@/lib/nutrition';
import { useDay, useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, Card, Chip, IconButton, Screen, Text } from '@/ui';

export default function DiaryScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = parseDate(params.date);
  const setDate = (d: ISODate) => router.setParams({ date: d === today() ? undefined : d });

  const day = useDay(date);
  const allEntries = useLive('foodEntries');
  const logged = useMemo(() => new Set(allEntries.map((e) => e.date)), [allEntries]);
  const previousByMeal = useMemo(() => {
    const out = {} as Record<MealType, ReturnType<typeof findPreviousMeal>>;
    for (const m of MEALS) out[m.id] = findPreviousMeal(allEntries, date, m.id);
    return out;
  }, [allEntries, date]);
  const previousDay = useMemo(() => findPreviousDay(allEntries, date), [allEntries, date]);

  const [menuMeal, setMenuMeal] = useState<MealType | null>(null);
  const isToday = date === today();
  const empty = day.entries.length === 0;

  return (
    <Screen tabs testID="diary-screen">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="label" color="textSecondary" numberOfLines={1}>
            {isToday ? formatLongDate(date) : date > today() ? 'Planning ahead' : 'Diary'}
          </Text>
          <Text variant="h1" numberOfLines={1} testID="diary-date-title">
            {isToday ? 'Food diary' : formatDayLabel(date)}
          </Text>
        </View>
        {!isToday ? <Chip testID="diary-today" label="Today" onPress={() => setDate(today())} /> : null}
        <IconButton testID="diary-prev" accessibilityLabel="Previous day" onPress={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={20} color={colors.text} />
        </IconButton>
        <IconButton testID="diary-next" accessibilityLabel="Next day" onPress={() => setDate(addDays(date, 1))}>
          <ChevronRight size={20} color={colors.text} />
        </IconButton>
      </View>

      <WeekStrip date={date} logged={logged} onSelect={setDate} />

      <DaySummaryCard day={day} />

      {empty ? (
        <Card testID="diary-empty" tone="alt">
          <Text variant="title">{date > today() ? 'Nothing planned yet' : 'Nothing logged for this day'}</Text>
          <Text variant="body" color="textSecondary" style={{ marginTop: 4 }}>
            {previousDay
              ? `Ate the same as ${formatDayLabel(previousDay.date).toLowerCase()}? Copy it in one tap, then adjust.`
              : 'Search for a food, scan a barcode or snap a photo to start.'}
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {previousDay ? (
              <Button
                testID="diary-copy-yesterday"
                size="md"
                icon={<Copy size={18} color={colors.onPrimary} />}
                title={`Copy ${formatDayLabel(previousDay.date).toLowerCase()} · ${kcal(entriesTotal(previousDay.entries).kcal)} kcal`}
                onPress={() => copyPreviousDay(date)}
              />
            ) : null}
            <Button
              testID="diary-search"
              size="md"
              variant={previousDay ? 'secondary' : 'primary'}
              icon={<Search size={18} color={previousDay ? colors.text : colors.onPrimary} />}
              title="Search foods"
              onPress={() => router.push(href('/food/search', { meal: isToday ? mealForTime() : 'breakfast', date }) as never)}
            />
          </View>
        </Card>
      ) : null}

      {MEALS.map((m) => (
        <MealCard
          key={m.id}
          meal={m.id}
          label={m.label}
          emoji={m.emoji}
          date={date}
          entries={day.byMeal[m.id]}
          previous={previousByMeal[m.id]}
          onMenu={() => setMenuMeal(m.id)}
          onRepeat={() => copyPreviousMeal(date, m.id)}
        />
      ))}

      <MealMenuSheet
        meal={menuMeal}
        date={date}
        entries={menuMeal ? day.byMeal[menuMeal] : []}
        previous={menuMeal ? previousByMeal[menuMeal] : null}
        onClose={() => setMenuMeal(null)}
        onRepeat={() => menuMeal && copyPreviousMeal(date, menuMeal)}
      />
    </Screen>
  );
}
