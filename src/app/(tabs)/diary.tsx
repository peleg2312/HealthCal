import { router, useIsFocused, useLocalSearchParams, useNavigation } from 'expo-router';
import { Copy, Search } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type ScrollView, type ScrollViewProps, View } from 'react-native';

import { copyPreviousDay, copyPreviousMeal, findPreviousDay, findPreviousMeal } from '@/features/food/actions';
import { DaySummaryCard, MealCard, MealMenuSheet } from '@/features/food/DiaryParts';
import { dayPhrase, href, kcal, param, parseDate } from '@/features/food/helpers';
import { TabHeader, tabDay } from '@/components/TabHeader';
import { ShareDayButton } from '@/features/share';
import { DayRingStrip } from '@/features/today/DayRingStrip';
import { useBackToToday } from '@/features/today/useBackToToday';
import { useDaySwipe } from '@/features/today/useDaySwipe';
import { useReportViewedDay } from '@/features/today/viewedDay';
import { addDays, today } from '@/lib/dates';
import { MEALS, entriesTotal, mealForTime } from '@/lib/nutrition';
import { useToday } from '@/store/clock';
import { useDay, useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, Card, Screen, Text } from '@/ui';

/** How far ahead the diary goes: a week, to plan meals (the strip then shows next week as well). */
const PLAN_AHEAD_DAYS = 7;
/** How often and how many times the diary looks for the meal it was asked to show before giving up (two seconds). */
const MEAL_LOOK_MS = 100;
const MEAL_LOOKS = 20;

export default function DiaryScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const t = useToday();
  const date = parseDate(params.date, t);
  // The + sheet logs to the day being looked at.
  useReportViewedDay(date === t ? null : date);
  const setDate = (d: ISODate) => router.setParams({ date: d === today() ? undefined : d });
  const latest = addDays(t, PLAN_AHEAD_DAYS);
  // A quick sideways flick on the page moves one day, never past today (planning ahead is a tap
  // in the strip), and says so with a toast; the strip itself pages weeks.
  const swipe = useDaySwipe({ date, onChange: setDate, latest: t });
  // Back in front after five minutes or more away, or on another day: today again. This route's own
  // params, so it also works while another tab is in front.
  const navigation = useNavigation();
  useBackToToday(() => navigation.setParams({ date: undefined, meal: undefined } as never));

  // Arriving with ?meal= (a meal row on Today) scrolls that meal into view once, then drops the param.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const mealY = useRef<Partial<Record<MealType, number>>>({});
  const targetMeal = MEALS.find((m) => m.id === param(params.meal))?.id;
  // Only while in front: a timer still running after the person went back would bring the diary back.
  const focused = useIsFocused();
  useEffect(() => {
    if (!targetMeal || !focused) return;
    // The cards need their layout for this day first. On a phone the diary's first mount can take
    // well over a frame or two, so this waits until the meal has been measured (up to two seconds)
    // instead of giving up after one look: giving up left the person at the top of the diary with
    // the meal they tapped below the screen.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      const y = mealY.current[targetMeal];
      if (y === undefined && ++tries < MEAL_LOOKS) {
        timer = setTimeout(look, MEAL_LOOK_MS);
        return;
      }
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: true });
      router.setParams({ meal: undefined });
    };
    timer = setTimeout(look, MEAL_LOOK_MS);
    return () => clearTimeout(timer);
  }, [targetMeal, date, spacing.sm, focused]);

  const day = useDay(date);
  const allEntries = useLive('foodEntries');
  const previousByMeal = useMemo(() => {
    const out = {} as Record<MealType, ReturnType<typeof findPreviousMeal>>;
    for (const m of MEALS) out[m.id] = findPreviousMeal(allEntries, date, m.id);
    return out;
  }, [allEntries, date]);
  const previousDay = useMemo(() => findPreviousDay(allEntries, date), [allEntries, date]);

  const [menuMeal, setMenuMeal] = useState<MealType | null>(null);
  const isToday = date === t;
  const empty = day.entries.length === 0;

  return (
    <Screen tabs testID="diary-screen" scrollProps={{ ref: scrollRef } as ScrollViewProps} header={<TabHeader tab="diary" overline={tabDay(date)} title="Food diary" />}>
      <View testID="diary-swipe" {...swipe} style={{ gap: spacing.lg }}>
      {/* The one date control, the same as Today's: the header's overline names the day, the strip picks one. */}
      <DayRingStrip today={t} selected={date} onSelect={setDate} testIDPrefix="diary" latest={latest} jumpTestID="diary-today" />

      <DaySummaryCard day={day} share={date <= t ? <ShareDayButton date={date} testID="diary-share" /> : null} />

      {empty ? (
        <Card testID="diary-empty" tone="alt">
          <Text variant="h3">{date > t ? 'Nothing planned yet' : 'Nothing logged for this day'}</Text>
          <Text variant="body" color="textSecondary" style={{ marginTop: 4 }}>
            {previousDay
              ? `Ate the same as ${dayPhrase(previousDay.date)}? Copy it in one tap, then adjust.`
              : 'Search for a food, scan a barcode or snap a photo to start.'}
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {previousDay ? (
              <Button
                testID="diary-copy-yesterday"
                size="md"
                icon={<Copy size={18} color={colors.onPrimary} />}
                title={`Copy ${dayPhrase(previousDay.date)} · ${kcal(entriesTotal(previousDay.entries).kcal)} kcal`}
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
        <View
          key={m.id}
          onLayout={(e) => {
            mealY.current[m.id] = e.nativeEvent.layout.y;
          }}>
          <MealCard
            meal={m.id}
            label={m.label}
            emoji={m.emoji}
            date={date}
            entries={day.byMeal[m.id]}
            previous={previousByMeal[m.id]}
            onMenu={() => setMenuMeal(m.id)}
            onRepeat={() => copyPreviousMeal(date, m.id)}
          />
        </View>
      ))}

      <MealMenuSheet
        meal={menuMeal}
        date={date}
        entries={menuMeal ? day.byMeal[menuMeal] : []}
        previous={menuMeal ? previousByMeal[menuMeal] : null}
        onClose={() => setMenuMeal(null)}
        onRepeat={() => menuMeal && copyPreviousMeal(date, menuMeal)}
      />
      </View>
    </Screen>
  );
}
