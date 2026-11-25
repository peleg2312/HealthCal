import { router } from 'expo-router';
import { CookingPot, Repeat2, Scale } from 'lucide-react-native';
import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { AiGlyph } from '@/features/ai/mark';
import { hasFoodLogged } from '@/features/drinks/via';
import { copyEntries, findPreviousMeal } from '@/features/food/actions';
import { foodNameHead } from '@/features/food/addedTo';
import { displayFoodName } from '@/features/food/displayName';
import { currentKcal } from '@/features/food/usuals';
import { targetsLine } from '@/features/morning/plan';
import { ShareDayButton } from '@/features/share';
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatShortDate } from '@/lib/dates';
import { MEAL_LABEL, MEALS, mealForTime } from '@/lib/nutrition';
import { spokenUnits } from '@/lib/spokenUnits';
import { formatNumber } from '@/lib/units';
import { useStore } from '@/store';
import { useNow } from '@/store/clock';
import { useLive, useProfile, type DaySummary } from '@/store/selectors';
import { useLargeText, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Button, Card, figure, Text } from '@/ui';

import { coachTip, isLateEvening, rhythmFromReminders, type ClosedDay } from './coach';
import { FirstLogInvite } from './FirstLogInvite';
import { NOW_WORDS, nowPlan, repeatFoodsLine, repeatSpoken, repeatTitle, type NowAction, type NowPlan } from './now';

/** "yesterday" or "Nov 10", from the day being shown (never the wall clock). */
export function relativeTo(date: ISODate, from: ISODate): string {
  return date === addDays(from, -1) ? 'yesterday' : formatShortDate(date);
}

export interface NowState {
  plan: NowPlan;
  /** The meal the card's Repeat copies, with its day; null when the card offers no Repeat. */
  repeat: { meal: MealType; date: ISODate; entries: FoodEntry[] } | null;
}

/**
 * What the Now card says and offers this hour (`nowPlan`, `@/features/today/now`), from the coach's tip with the
 * water tip left out, the meal of the hour, the late evening by the person's own meal times, today's weigh-in and the
 * meals there are to repeat. Today reads it once and hands it to the card and to Meals, which tags the card's meal
 * "Now" and leaves its Repeat to the card.
 */
export function useNowState(day: DaySummary, yesterday: ClosedDay | null): NowState {
  const profile = useProfile();
  const now = useNow();
  const entries = useLive('foodEntries');
  const weights = useLive('weights');
  const reminders = useStore((s) => s.settings.reminders);
  const rhythm = rhythmFromReminders(reminders);
  const tip = coachTip(day, profile.units, now, rhythm, yesterday, { water: false });
  const previous = Object.fromEntries(MEALS.map((m) => [m.id, findPreviousMeal(entries, day.date, m.id, 7)])) as Record<MealType, { date: ISODate; entries: FoodEntry[] } | null>;
  const plan = nowPlan({
    tip,
    mealNow: mealForTime(now),
    late: isLateEvening(now, rhythm),
    foodLogged: hasFoodLogged(day.entries),
    over: day.remaining < 0,
    logged: new Set(MEALS.filter((m) => hasFoodLogged(day.byMeal[m.id])).map((m) => m.id)),
    repeatable: new Set(MEALS.filter((m) => previous[m.id]).map((m) => m.id)),
    weighed: weights.some((w) => w.date === day.date),
    targets: targetsLine({ budget: day.budget, proteinG: day.macros.proteinG }),
  });
  const r = plan.actions.find((a): a is Extract<NowAction, { kind: 'repeat' }> => a.kind === 'repeat');
  const prev = r ? previous[r.meal] : null;
  return { plan, repeat: r && prev ? { meal: r.meal, ...prev } : null };
}

/**
 * The Now card, under the day card: the one thing for this hour. A level line across its top (as the active tab
 * wears), its heading ("Dinner · now"), "Ask the coach" in its top corner (the coach's worded way in, in the first
 * view's lower part), one sentence from the coach, what Repeat would add, and one or two actions. It stays in one
 * place all day: only its words and actions change. Day one holds the first-log invite instead, with What fits in
 * the corner. Today only: a past day has no hour.
 */
export function NowCard({
  day,
  state,
  firstDay,
  onFits,
}: {
  day: DaySummary;
  state: NowState;
  firstDay: boolean;
  onFits: (proteinFirst: boolean) => void;
}) {
  const { colors, spacing } = useTheme();
  // Large text: the heading row and the actions wrap at their words (never smaller text).
  const large = useLargeText();
  // Under 360 px the actions leave their glyphs out, so the two keep one row (as the + sheet's Repeat drops its arrows).
  const bare = useWindowDimensions().width < 360;
  const now = useNow();
  const { plan, repeat } = state;

  const fitsButton = (proteinFirst: boolean, variant: 'secondary' | 'ghost') => (
    // A pot, not the AI mark: these ideas are worked out on the phone from the person's own meals and fixed plates.
    <Button
      key="fits"
      testID="today-ideas"
      title={NOW_WORDS.fits}
      accessibilityLabel={NOW_WORDS.fitsSpoken}
      variant={variant}
      size="sm"
      full={false}
      icon={bare && !firstDay ? undefined : <CookingPot size={18} color={variant === 'ghost' ? colors.actionInk : colors.text} strokeWidth={2.2} />}
      onPress={() => onFits(proteinFirst)}
      style={{ maxWidth: '100%', ...(variant === 'ghost' ? { paddingHorizontal: 8 } : null) }}
    />
  );

  const button = (a: NowAction, i: number) => {
    const variant = i === 0 ? ('secondary' as const) : ('ghost' as const);
    const ink = variant === 'ghost' ? colors.actionInk : colors.text;
    const style = { maxWidth: '100%' as const, ...(variant === 'ghost' ? { paddingHorizontal: 8 } : null) };
    switch (a.kind) {
      case 'repeat': {
        if (!repeat) return null;
        // What the tap stores: a bundled food at today's values (currentKcal, the rule copyEntries logs by).
        const kcal = formatNumber(currentKcal(repeat.entries));
        const when = relativeTo(repeat.date, day.date);
        const meal = MEAL_LABEL[repeat.meal].toLowerCase();
        return (
          <Button
            key="repeat"
            testID="today-now-repeat"
            title={repeatTitle(kcal)}
            accessibilityLabel={repeatSpoken(kcal, when, repeat.meal)}
            variant={variant}
            size="sm"
            full={false}
            icon={bare ? undefined : <Repeat2 size={18} color={ink} strokeWidth={2.2} />}
            onPress={() => copyEntries(repeat.entries, day.date, repeat.meal, `Copied ${meal} from ${when}`)}
            style={style}
          />
        );
      }
      case 'share':
        return <ShareDayButton key="share" date={day.date} title={NOW_WORDS.share} variant={variant} icon={!bare} />;
      case 'weigh':
        return (
          <Button
            key="weigh"
            testID="today-now-weigh"
            title={NOW_WORDS.weigh}
            accessibilityLabel={NOW_WORDS.weighSpoken}
            variant={variant}
            size="sm"
            full={false}
            icon={bare ? undefined : <Scale size={18} color={ink} strokeWidth={2.2} />}
            onPress={() => router.push('/weight?log=1' as never)}
            style={style}
          />
        );
      case 'fits':
        return fitsButton(a.proteinFirst, variant);
      case 'link':
        return (
          <Button key="link" testID="today-coach-action" title={a.label} variant={variant} size="sm" full={false} onPress={() => router.push(a.href as never)} style={style} />
        );
    }
  };

  // The corner: "Ask the coach" (with the coach's glyph: it leads to the AI coach), or What fits on day one, where the
  // invite is the one thing to do. A small ghost button pulled up into the heading's row, so the row stays 24 px tall.
  const corner = firstDay ? (
    fitsButton(false, 'ghost')
  ) : (
    <Button
      testID="today-coach-ask"
      title={NOW_WORDS.ask}
      variant="ghost"
      size="sm"
      full={false}
      icon={<AiGlyph name="coach" size={18} color={colors.actionInk} strokeWidth={2.2} />}
      onPress={() => router.push('/coach' as never)}
      style={{ maxWidth: '100%', paddingHorizontal: 8 }}
    />
  );

  const title = firstDay ? 'Nothing logged yet today.' : plan.title;
  const body = firstDay ? 'Logging the first thing takes a few seconds.' : plan.body;
  const foods = repeat && !firstDay ? repeatFoodsLine(relativeTo(repeat.date, day.date), repeat.entries.map((e) => isolateRtl(foodNameHead(displayFoodName(e))))) : null;
  const web = Platform.OS === 'web';

  return (
    <Card
      testID="today-now"
      padding={0}
      // The level line across its top, as the active tab and the chosen segment wear it: the card for this hour.
      style={{ borderTopWidth: 3, borderTopColor: colors.rim, paddingTop: 10, paddingHorizontal: spacing.lg, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: large ? 'wrap' : 'nowrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.sm, minHeight: 24 }}>
        <Text
          variant="overline"
          color="textSecondary"
          testID="today-now-heading"
          accessibilityRole="header"
          {...(web ? ({ 'aria-level': 2 } as object) : null)}
          style={{ flexShrink: 1 }}>
          {bare ? plan.headingShort : plan.heading}
        </Text>
        <View style={large ? { marginVertical: 2, marginLeft: -8 } : { marginVertical: -6, marginRight: -8 }}>{corner}</View>
      </View>
      {/* Takes no touch: the corner button's 44 px touch area reaches over its first line's top. */}
      <View pointerEvents="none" style={{ marginTop: 2 }}>
        <Text variant="body" testID="today-now-line" {...figure(spokenUnits(`${title}${body ? ` ${body}` : ''}`))}>
          <Text variant="bodyStrong">{title}</Text>
          {body ? <Text variant="body" color="textSecondary">{` ${body}`}</Text> : null}
        </Text>
      </View>
      {foods ? (
        // What Repeat adds, by each food's head; every food in full is in the button's toast and the diary.
        <Text variant="caption" color="textSecondary" testID="today-now-foods" numberOfLines={large ? undefined : 1} style={{ marginTop: 2 }}>
          {foods}
        </Text>
      ) : null}
      {firstDay ? (
        <View style={{ marginTop: 12 }}>
          {/* Compact (a 44 px button, the three foods in one row that scrolls sideways): the meal's suggested share is in
              its row in Meals, under the card. */}
          <FirstLogInvite meal={mealForTime(now)} date={day.date} budget={day.budget} narrow overline={false} />
        </View>
      ) : plan.actions.length ? (
        <View testID="today-now-actions" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: spacing.md, marginTop: 10 }}>
          {plan.actions.map((a, i) => button(a, i))}
        </View>
      ) : null}
    </Card>
  );
}
