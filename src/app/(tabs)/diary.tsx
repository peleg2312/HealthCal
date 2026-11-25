import { router, useIsFocused, useLocalSearchParams, useNavigation } from 'expo-router';
import { Copy } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type ScrollView, type ScrollViewProps, useWindowDimensions, View } from 'react-native';

import { hasFoodLogged } from '@/features/drinks/via';
import { copyPreviousDay, copyPreviousMeal, findPreviousDay, findPreviousMeal } from '@/features/food/actions';
import { DaySummaryCard, EMPTY_DAY_NOTE, MealCard, MealMenuSheet, SUMMARY_CUP_NARROW } from '@/features/food/DiaryParts';
import { foodLatestDay } from '@/features/food/entryDay';
import { dayPhrase, kcal, param, parseDate } from '@/features/food/helpers';
import { markSaveHintDone, saveHintAllowed, saveHintMeal, useSaveHintDone } from '@/features/food/saveHint';
import { SaveMealSheet } from '@/features/food/SaveMealSheet';
import { currentKcal } from '@/features/food/usuals';
import { TabHeader, tabDay } from '@/components/TabHeader';
import { ShareDayButton } from '@/features/share';
import { DayRingStrip } from '@/features/today/DayRingStrip';
import { useBackToToday } from '@/features/today/useBackToToday';
import { useDaySwipe } from '@/features/today/useDaySwipe';
import { useReportViewedDay } from '@/features/today/viewedDay';
import { today } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { useToday } from '@/store/clock';
import { useDay, useLive } from '@/store/selectors';
import { useTheme, useVeryLargeText } from '@/theme';
import type { ISODate, MealType } from '@/types';
import { Button, Screen } from '@/ui';

/** How often and how many times the diary looks for the meal it was asked to show before giving up (two seconds). */
const MEAL_LOOK_MS = 100;
const MEAL_LOOKS = 20;

export default function DiaryScreen() {
  const { colors, spacing } = useTheme();
  // Under 360 px (up to very large text) the summary's cups are smaller, so at 320 x 640 Lunch's add is in the first view.
  // Very large text (150% and up, `VERY_LARGE_TEXT`): the cards sit 16 apart and each part takes its large layout; through
  // the phone's common steps the diary keeps its designed shape with larger text.
  const screenW = useWindowDimensions().width;
  const big = useVeryLargeText();
  const narrow = screenW < 360 && !big;
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const t = useToday();
  const date = parseDate(params.date, t);
  // The + sheet logs to the day being looked at.
  useReportViewedDay(date === t ? null : date);
  const setDate = (d: ISODate) => router.setParams({ date: d === today() ? undefined : d });
  // How far ahead the diary goes: a week, to plan meals (the strip then shows next week as well), the same limit
  // as every entry's date control (`ENTRY_DAYS_AHEAD`), so the two cannot drift apart.
  const latest = foodLatestDay(t);
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
  const empty = day.entries.length === 0;

  // The one-time "Save lunch as a meal" hint (src/features/food/saveHint.ts): on one card at most,
  // preferring the meal the diary was opened for (`?meal=`, kept here for the day after the param is
  // dropped), never for a meal that already is a saved meal.
  const [askedFor, setAskedFor] = useState<{ date: ISODate; meal: MealType } | null>(null);
  if (targetMeal && (askedFor?.date !== date || askedFor.meal !== targetMeal)) setAskedFor({ date, meal: targetMeal });
  const savedMeals = useLive('savedMeals');
  const hintDone = useSaveHintDone();
  const hintMeal = saveHintMeal(
    MEALS.map((m) => ({ meal: m.id, entries: day.byMeal[m.id] })),
    { done: hintDone, allowed: saveHintAllowed(), saved: savedMeals, prefer: askedFor?.date === date ? askedFor.meal : null },
  );
  // The save sheet the hint opens; the meal it was opened for is kept while the sheet slides away.
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveFor, setSaveFor] = useState<MealType>('lunch');
  const openSave = (m: MealType) => {
    setSaveFor(m);
    setSaveOpen(true);
  };

  return (
    <Screen tabs testID="diary-screen" scrollProps={{ ref: scrollRef } as ScrollViewProps} header={<TabHeader tab="diary" overline={tabDay(date)} overlineTight={tabDay(date, true)} title="Food diary" />}>
      {/* The diary shows more of the day: the strip and the cards sit 12 apart (16 with very large text), so at 360 x 740
          Breakfast and Lunch are whole in the first view, and at 320 x 640 Lunch's add is in it. */}
      <View testID="diary-swipe" {...swipe} style={{ gap: big ? spacing.lg : spacing.md }}>
      {/* The one date control, drawn slim (small cups) at every text size: the header's overline names the day, the strip
          picks one. */}
      <DayRingStrip today={t} selected={date} onSelect={setDate} testIDPrefix="diary" latest={latest} jumpTestID="diary-today" slim />

      {/* A day with nothing logged has no panel of its own: each meal's dashed slot is its add (the first one says what
          the search offers), and the whole of the last logged day can be copied from the summary card's last row. */}
      <DaySummaryCard
        day={day}
        // Nothing to share on a day with no food logged (drinks logged on Water do not count), as on Today's day one.
        // Under 360 px a 36 px cup (44 to touch), so the summary's figures keep one line with their unit.
        share={date <= t && hasFoodLogged(day.entries) ? <ShareDayButton date={date} testID="diary-share" size={narrow ? SUMMARY_CUP_NARROW : 44} /> : null}
        action={
          empty && previousDay ? (
            <Button
              testID="diary-copy-yesterday"
              size="sm"
              variant="secondary"
              full={false}
              icon={<Copy size={18} color={colors.text} strokeWidth={2.2} />}
              title={`Copy ${dayPhrase(previousDay.date)} · ${kcal(currentKcal(previousDay.entries))} kcal`}
              // Its words as drawn (label in name), then what it copies.
              accessibilityLabel={`Copy ${dayPhrase(previousDay.date)} · ${kcal(currentKcal(previousDay.entries))} kcal: everything from ${dayPhrase(previousDay.date)} to this day`}
              onPress={() => copyPreviousDay(date)}
              style={{ paddingHorizontal: 10 }}
            />
          ) : null
        }
      />

      {MEALS.map((m, i) => (
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
            waterEntries={day.waterEntries}
            previous={previousByMeal[m.id]}
            onMenu={() => setMenuMeal(m.id)}
            onRepeat={() => copyPreviousMeal(date, m.id)}
            hint={hintMeal === m.id ? { onSave: () => openSave(m.id), onClose: markSaveHintDone } : null}
            slotNote={empty && i === 0 ? EMPTY_DAY_NOTE : null}
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
      <SaveMealSheet visible={saveOpen} meal={saveFor} date={date} entries={day.byMeal[saveFor]} onClose={() => setSaveOpen(false)} />
      </View>
    </Screen>
  );
}
