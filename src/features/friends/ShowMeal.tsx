/**
 * Showing a diary meal to friends, from that meal's menu: one row in the menu ("Show to friends", "You pick
 * who sees it", or who sees it now), and the step it opens in the same sheet (`useShowMealStep`, as the save
 * step is). The step shows exactly the card friends will see, then who sees it (friends as chips: the ones
 * picked last time are picked, nobody the first time), then Show calories (off), then what is never shown.
 * Nothing leaves the phone until the button that names who is pressed: the sheet is the consent. A meal
 * shown now can be changed or stopped here. Logging itself gets no new step.
 */
import { router } from 'expo-router';
import { EyeOff, Lock, Users } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { withoutMarks } from '@/lib/bidi';
import { refreshFriends, useFriends } from '@/services/friends';
import { useToday } from '@/store/clock';
import { fonts, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Button, Chip, ChipWrap, decorative, Divider, haptic, ListRow, Text, toast, Toggle } from '@/ui';

import { cleanSharedMealItems, mealsOverview, showMeal, stopMeal } from './api';
import { idFor } from './components';
import type { MySharedMeal } from './contract';
import { MealPreviewCard } from './MealCard';
import { buildSharedMeal } from './meals';
import {
  MENU_SHOW,
  MENU_SHOW_LINE,
  MENU_SHOW_NONE,
  NEVER_SHOWN,
  SHOW_FAILED,
  SHOW_KCAL,
  SHOW_KCAL_OFF,
  SHOW_KCAL_ON,
  showButton,
  showLine,
  shownTo,
  shownToast,
  showTitle,
  STOP_SHOWING,
  stoppedToast,
  WHAT_THEY_SEE,
  WHO_NOTE,
  WHO_SEES,
} from './words';

/** The meal shown now for this day and meal, if any. */
function shownNow(myMeals: readonly MySharedMeal[], date: ISODate, meal: MealType): MySharedMeal | null {
  return myMeals.find((m) => m.day === date && m.meal === meal) ?? null;
}

/**
 * The menu's row. Drawn only for someone with friends on, 18 or over, and food in the meal; with no friend
 * yet it says so and opens Friends. It loads friends once if they were never loaded this run.
 */
export function ShowToFriendsRow({ meal, date, entries, onOpen, onClose }: { meal: MealType; date: ISODate; entries: FoodEntry[]; onOpen: () => void; onClose: () => void }) {
  const { colors } = useTheme();
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  useEffect(() => {
    if (status === 'idle') void refreshFriends();
  }, [status]);
  const { me, friends, myMeals } = mealsOverview(overview);
  const hasFood = buildSharedMeal({ entries, day: date, meal, showKcal: false }).length > 0;
  if (!me || !me.mealsAllowed || !hasFood) return null;
  const shown = shownNow(myMeals, date, meal);
  const noFriends = friends.length === 0;
  return (
    <>
      <Divider inset={32} />
      <ListRow
        testID="meal-menu-show"
        title={MENU_SHOW}
        subtitle={noFriends ? MENU_SHOW_NONE : shown ? shownTo(shown.viewers.map((v) => v.displayName)) : MENU_SHOW_LINE}
        left={<Users size={20} color={colors.text} />}
        onPress={() => {
          if (noFriends) {
            onClose();
            router.push('/friends' as never);
            return;
          }
          onOpen();
        }}
      />
    </>
  );
}

/** The show step's parts, for the meal menu to draw in its own sheet: title, line, body, footer. */
export function useShowMealStep({ open, meal, date, entries, onClose }: { open: boolean; meal: MealType | null; date: ISODate; entries: FoodEntry[]; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const todayDate = useToday();
  const overview = useFriends((s) => s.overview);
  const { me, friends, myMeals } = mealsOverview(overview);
  const shown = meal ? shownNow(myMeals, date, meal) : null;
  const pickable = friends.filter((f) => f.shareMeals);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showKcal, setShowKcal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Each time the step opens: who sees it now (a meal shown now), else who was picked last time, else nobody.
  const key = open && meal ? `${meal}|${date}` : null;
  if (key !== openFor && (key === null || me)) {
    setOpenFor(key);
    if (key && me) {
      const ids = new Set(pickable.map((f) => f.userId));
      const start = shown ? shown.viewers.map((v) => v.userId) : me.audience;
      setPicked(new Set(start.filter((id) => ids.has(id))));
      setShowKcal(shown ? shown.showKcal : me.mealSettings.kcal);
      setBusy(false);
    }
  }

  if (!open || !meal || !me) return { title: '', subtitle: '', body: null, footer: null };

  const built = buildSharedMeal({ entries, day: date, meal, showKcal });
  // Exactly what friends will see: the server's own cleaning of what this phone sends.
  const items = cleanSharedMealItems(built, showKcal);
  const names = pickable.filter((f) => picked.has(f.userId)).map((f) => f.displayName);

  const show = async () => {
    if (!picked.size || !built.length) return;
    setBusy(true);
    const res = await showMeal({ day: date, meal, items: built, showKcal, viewers: [...picked] });
    setBusy(false);
    if (!res.ok) {
      haptic.warn();
      toast(res.message || SHOW_FAILED);
      return;
    }
    haptic.success();
    onClose();
    toast(shownToast(meal, names));
  };

  const stop = async () => {
    if (!shown) return;
    const before = { viewers: shown.viewers.map((v) => v.userId), showKcal: shown.showKcal };
    setBusy(true);
    const res = await stopMeal(shown.ref);
    setBusy(false);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.tap();
    onClose();
    // Everything reversible: Undo shows the same foods to the same people again.
    toast(stoppedToast(meal), {
      label: 'Undo',
      onPress: () => {
        const again = buildSharedMeal({ entries, day: date, meal, showKcal: before.showKcal });
        if (again.length) void showMeal({ day: date, meal, items: again, showKcal: before.showKcal, viewers: before.viewers }).then((r) => !r.ok && toast(r.message));
      },
    });
  };

  const body = (
    <View style={{ gap: spacing.lg }} testID="show-meal">
      <View style={{ gap: spacing.sm }}>
        <Text variant="overline" color="textSecondary">
          {WHAT_THEY_SEE}
        </Text>
        <MealPreviewCard name={me.displayName} avatar={me.avatar} meal={meal} day={date} today={todayDate} items={items} showKcal={showKcal} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text variant="overline" color="textSecondary">
          {WHO_SEES}
        </Text>
        <ChipWrap>
          {pickable.map((f) => (
            <Chip
              key={f.userId}
              testID={`show-meal-who-${idFor(f.userId)}`}
              label={f.displayName}
              accessibilityLabel={withoutMarks(f.displayName)}
              selected={picked.has(f.userId)}
              onPress={() =>
                setPicked((p) => {
                  const next = new Set(p);
                  if (next.has(f.userId)) next.delete(f.userId);
                  else next.add(f.userId);
                  return next;
                })
              }
            />
          ))}
        </ChipWrap>
        <Text variant="caption" color="textSecondary">
          {WHO_NOTE}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
            {SHOW_KCAL}
          </Text>
          <Text variant="caption" color="textSecondary">
            {showKcal ? SHOW_KCAL_ON : SHOW_KCAL_OFF}
          </Text>
        </View>
        <Toggle testID="show-meal-kcal" value={showKcal} onChange={setShowKcal} accessibilityLabel={SHOW_KCAL} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {decorative(<Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 3 }} />)}
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }} testID="show-meal-never">
          {NEVER_SHOWN}
        </Text>
      </View>
      {shown ? (
        <Button testID="show-meal-stop" title={STOP_SHOWING} variant="ghost" size="sm" full={false} icon={<EyeOff size={18} color={colors.actionInk} />} disabled={busy} onPress={() => void stop()} style={{ alignSelf: 'center' }} />
      ) : null}
    </View>
  );

  const footer = <Button testID="show-meal-confirm" title={showButton(names)} icon={<Users size={20} color={colors.onPrimary} />} disabled={!picked.size || !built.length} loading={busy} onPress={() => void show()} />;

  return { title: showTitle(meal), subtitle: showLine(date, todayDate, built.length), body, footer };
}
