/**
 * "Show to friends" for a saved meal or recipe, from /food/meals (proposal 5b): a cup beside the card's edit and
 * delete (`ShowSavedCup`), drawn only for someone with friends on, 18 or over, on a server that has saved meals shown,
 * with a friend who can be picked; and its sheet (`ShowSavedMealSheet`): exactly the foods friends will see, who
 * sees it (chips, the people picked last time), Show calories (off by default), what is never shown, and Stop while
 * it is shown. Nothing leaves the phone until the button that names who; the door is `buildSharedSavedMeal`.
 */
import { EyeOff, Lock, Users } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { RowEmoji } from '@/features/food/components';
import { LangIconButton } from '@/features/food/langName';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { cleanSharedMealItems, refreshFriends, showSavedMeal, stopMeal, useFriends } from '@/services/friends';
import { sharedSavedRef } from '@/services/friendsWire';
import { fonts, useTheme } from '@/theme';
import type { SavedMeal } from '@/types';
import { Button, Chip, ChipWrap, decorative, Divider, haptic, Sheet, Text, toast, Toggle } from '@/ui';

import { idFor } from './components';
import { sharedName } from './MealCard';
import { mealsOverview } from './overview';
import { buildSharedSavedMeal } from './savedShare';
import { canShowSaved } from './together';
import {
  itemCaption,
  NOBODY_TO_PICK,
  savedMealLine,
  savedShownToast,
  savedStoppedToast,
  SHOW_KCAL,
  SHOW_KCAL_OFF,
  SHOW_KCAL_ON,
  SHOW_SAVED_NEVER,
  showButton,
  showSavedTitle,
  STOP_SHOWING,
  WHAT_THEY_SEE,
  WHO_NOTE,
  WHO_SEES,
} from './words';

/** Whether "Show to friends" is offered on saved meals now; loads friends once if they were never loaded this run. */
export function useCanShowSaved(): boolean {
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  useEffect(() => {
    if (status === 'idle') void refreshFriends();
  }, [status]);
  return canShowSaved(overview);
}

/** The cup on a saved meal's card: the people mark, named by what it does ("Show Chicken bowl to friends"). */
export function ShowSavedCup({ meal, testID, onPress }: { meal: SavedMeal; testID: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <LangIconButton testID={testID} accessibilityLabel={withoutMarks(showSavedTitle(meal.name))} tone="clear" onPress={onPress}>
      <Users size={18} color={colors.textSecondary} />
    </LangIconButton>
  );
}

/** The sheet for one saved meal. */
export function ShowSavedMealSheet({ meal, onClose }: { meal: SavedMeal | null; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const overview = useFriends((s) => s.overview);
  const { me, friends } = mealsOverview(overview);
  const pickable = friends.filter((f) => f.shareMeals);
  const shown = meal && me ? ((overview?.mySavedMeals ?? []).find((m) => m.ref === sharedSavedRef(me.shareKey, meal.id)) ?? null) : null;
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showKcal, setShowKcal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Each time it opens: who sees it now (shown already), else who was picked last time.
  const key = meal ? meal.id : null;
  if (key !== openFor && (key === null || me)) {
    setOpenFor(key);
    if (meal && me) {
      const ids = new Set(pickable.map((f) => f.userId));
      setPicked(new Set((shown ? shown.viewers.map((v) => v.userId) : me.audience).filter((id) => ids.has(id))));
      setShowKcal(shown ? shown.showKcal : me.mealSettings.kcal);
      setBusy(false);
    }
  }

  if (!meal || !me) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const built = buildSharedSavedMeal({ meal, showKcal });
  // Exactly what friends will see: the server's own cleaning of what this phone sends.
  const items = cleanSharedMealItems(built.items, showKcal);
  const names = pickable.filter((f) => picked.has(f.userId)).map((f) => f.displayName);

  const show = async () => {
    if (!picked.size || !built.items.length) return;
    setBusy(true);
    const res = await showSavedMeal({ savedMealId: meal.id, name: built.name, items: built.items, servings: built.servings, showKcal, viewers: [...picked] });
    setBusy(false);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    onClose();
    toast(savedShownToast(meal.name, names));
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
    toast(savedStoppedToast(meal.name), {
      label: 'Undo',
      onPress: () => {
        const again = buildSharedSavedMeal({ meal, showKcal: before.showKcal });
        void showSavedMeal({ savedMealId: meal.id, name: again.name, items: again.items, servings: again.servings, showKcal: before.showKcal, viewers: before.viewers }).then((r) => !r.ok && toast(r.message));
      },
    });
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={showSavedTitle(meal.name)}
      subtitle={savedMealLine(items.length, built.servings ?? undefined)}
      footer={<Button testID="show-saved-confirm" title={showButton(names)} icon={<Users color={colors.onPrimary} />} disabled={!picked.size || !items.length} loading={busy} onPress={() => void show()} />}>
      <View style={{ gap: spacing.md }} testID="show-saved">
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline" color="textSecondary">
            {WHAT_THEY_SEE}
          </Text>
          <View>
            {items.map((it, i) => (
              <React.Fragment key={`${i}-${it.name}`}>
                {i > 0 ? <Divider inset={34} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingVertical: 6 }}>
                  <RowEmoji emoji={it.emoji} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body" style={{ fontFamily: fonts.semibold }}>
                      {isolateRtl(sharedName(it))}
                    </Text>
                    <Text variant="caption" color="textSecondary">
                      {itemCaption(it, showKcal)}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline" color="textSecondary">
            {WHO_SEES}
          </Text>
          <ChipWrap>
            {pickable.map((f) => (
              <Chip
                key={f.userId}
                testID={`show-saved-who-${idFor(f.userId)}`}
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
            {pickable.length ? WHO_NOTE : NOBODY_TO_PICK}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
              {SHOW_KCAL}
            </Text>
            <Text variant="caption" color="textSecondary">
              {showKcal ? SHOW_KCAL_ON : SHOW_KCAL_OFF}
            </Text>
          </View>
          <Toggle testID="show-saved-kcal" value={showKcal} onChange={setShowKcal} accessibilityLabel={SHOW_KCAL} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {decorative(<Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 3 }} />)}
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }} testID="show-saved-never">
            {SHOW_SAVED_NEVER}
          </Text>
        </View>
        {shown ? (
          <Button testID="show-saved-stop" title={STOP_SHOWING} variant="ghost" size="sm" full={false} icon={<EyeOff size={18} color={colors.actionInk} />} disabled={busy} onPress={() => void stop()} style={{ alignSelf: 'center' }} />
        ) : null}
      </View>
    </Sheet>
  );
}
