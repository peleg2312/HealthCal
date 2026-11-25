import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Utensils } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { mealsOverview } from '@/features/friends/overview';
import { CheerButton, Loading, WeekCups, WorkoutRow } from '@/features/friends/components';
import { feedKey, localFeed, mealsOf } from '@/features/friends/feed';
import { itemRole, listRole } from '@/features/friends/FeedParts';
import { FriendMealSheet, type OpenMeal } from '@/features/friends/FriendMealSheet';
import { mealFoodsLine } from '@/features/friends/MealCard';
import { dayRef } from '@/features/friends/summary';
import { friendWeek, isCurrentWeek, sharesAnything } from '@/features/friends/week';
import {
  BETWEEN_YOU,
  friendsSince,
  mealsTheyShow,
  myMealTitle,
  RECENT_WORKOUTS,
  REMOVE_FRIEND,
  removeNote,
  seesMyMealsLine,
  seesMyMealsTitle,
  THEIR_MEALS_OFF,
  theirMealsTitle,
} from '@/features/friends/words';
import { Figure } from '@/features/trackers/components';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { formatShortDate, toISODate } from '@/lib/dates';
import { cheerFriend, cheerMeal, refreshFriends, removeFriend, setFriendMealPrefs, useFriends } from '@/services/friends';
import { useToday } from '@/store/clock';
import { useProfile } from '@/store/selectors';
import { fonts, useTheme } from '@/theme';
import { Button, Card, ConfirmSheet, Divider, EmptyState, goBack, Header, ListRow, Screen, SectionTitle, Text, toast, Toggle } from '@/ui';

/** A switch under "Between you": its words, and the kit's switch named by its title. */
function SwitchRow({ title, subtitle, value, onChange, testID }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
          {title}
        </Text>
        <Text variant="caption" color="textSecondary">
          {subtitle}
        </Text>
      </View>
      <Toggle testID={testID} value={value} onChange={onChange} accessibilityLabel={withoutMarks(title)} />
    </View>
  );
}

/** A friend's page: their week, the meals they show you, their recent workouts, your two switches for them, and Remove. */
export default function FriendScreen() {
  const { colors, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  const profile = useProfile();
  const today = useToday();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [openMeal, setOpenMeal] = useState<{ meal: OpenMeal; adding: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshFriends();
    }, []),
  );

  const { me, friends, feed } = mealsOverview(overview);
  const friend = friends.find((f) => f.userId === id) ?? null;

  if (!friend) {
    const loading = !overview && (status === 'idle' || status === 'loading');
    return (
      <Screen header={<Header title="Friend" subtitle="Friends" />} testID="friend-screen">
        {loading ? (
          <Loading />
        ) : (
          <Card testID="friend-missing">
            <EmptyState title="Not a friend right now" message="They may have been removed. Your friends are listed on Friends." action="Back to Friends" onAction={() => goBack('/friends')} />
          </Card>
        )}
      </Screen>
    );
  }

  const name = friend.displayName;
  const s = friend.summary;
  const days = friendWeek(s, today);
  const current = isCurrentWeek(s, today);
  const since = friend.since ? formatShortDate(toISODate(new Date(friend.since))) : null;
  const mealsOn = !!me?.mealsAllowed;
  const meals = mealsOn ? mealsOf(localFeed({ feed, today, seeMeals: !!me?.mealSettings.see, friends }), friend.userId) : [];
  const workouts = s.workouts ?? [];
  const dayCheer = dayRef(today);

  const cheer = async (ref: string) => {
    const res = await cheerFriend(friend.userId, ref);
    if (!res.ok) toast(res.message);
  };
  const setPref = async (prefs: { shareMeals?: boolean; seeMeals?: boolean }, said: string) => {
    const res = await setFriendMealPrefs(friend.userId, prefs);
    toast(res.ok ? said : res.message);
  };
  const remove = async () => {
    setConfirmRemove(false);
    const res = await removeFriend(friend.userId);
    toast(res.ok ? `${name} is no longer a friend. Cheers and meals between you were removed too.` : res.message);
    if (res.ok) goBack('/friends');
  };

  return (
    <Screen header={<Header title={name} subtitle={friendsSince(since)} />} testID="friend-screen">
      {sharesAnything(s) ? (
        <Card testID="friend-week">
          {typeof s.minutes === 'number' || typeof s.streak === 'number' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {/* Figures, not Stat: their labels take a second line in a third of a narrow card instead of ending in "…". */}
              {typeof s.minutes === 'number' ? <Figure testID="friend-minutes" label={current ? 'This week' : 'Last shared week'} value={String(s.minutes)} unit="min" basis={90} /> : null}
              {typeof s.sessions === 'number' ? <Figure label="Sessions" value={String(s.sessions)} basis={80} /> : null}
              {typeof s.streak === 'number' ? <Figure label="Logging streak" value={String(s.streak)} unit={s.streak === 1 ? 'day' : 'days'} basis={90} /> : null}
            </View>
          ) : null}
          {days ? (
            <View style={{ marginTop: spacing.lg }}>
              <WeekCups days={days} today={today} />
            </View>
          ) : null}
        </Card>
      ) : (
        <Card tone="alt" testID="friend-week-none">
          <Text variant="body" color="textSecondary">
            {`${isolateRtl(name)} is not sharing their week right now. You can still cheer their day.`}
          </Text>
        </Card>
      )}

      {meals.length ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title={mealsTheyShow(name)} action={String(meals.length)} />
          <Card padding={0} testID="friend-meals">
            <View {...listRole}>
              {meals.map((m, i) => (
                <View key={feedKey(m)} {...itemRole}>
                  {i > 0 ? <Divider inset={spacing.lg} /> : null}
                  <ListRow
                    testID={`friend-meal-${i}`}
                    style={{ paddingHorizontal: spacing.lg }}
                    title={myMealTitle(m.meal, m.day, today)}
                    subtitle={mealFoodsLine(m.items)}
                    left={<Utensils size={20} color={colors.text} />}
                    onPress={() => setOpenMeal({ meal: { owner: m, meal: m, cheered: m.cheered }, adding: false })}
                  />
                </View>
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title={RECENT_WORKOUTS} />
        <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friend-workouts">
          <View {...listRole}>
            {workouts.map((w, i) => (
              <View key={w.id} {...itemRole}>
                {i > 0 ? <Divider inset={34} /> : null}
                <WorkoutRow w={w} friend={friend} today={today} units={profile.units} onCheer={() => void cheer(w.id)} />
              </View>
            ))}
          </View>
          {workouts.length ? <Divider /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}>
            <Text variant="body" style={{ flex: 1 }}>
              {`Cheer ${isolateRtl(name)}’s day`}
            </Text>
            <View>
              <CheerButton testID="friends-cheer-day" cheered={friend.cheered.includes(dayCheer)} label={`${withoutMarks(name)}’s day`} onPress={() => void cheer(dayCheer)} />
            </View>
          </View>
        </Card>
      </View>

      {mealsOn ? (
        <View style={{ gap: spacing.md }}>
          <SectionTitle title={BETWEEN_YOU} />
          <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friend-between">
            <SwitchRow
              testID="friend-share-meals"
              title={seesMyMealsTitle(name)}
              subtitle={seesMyMealsLine(name)}
              value={friend.shareMeals}
              onChange={(v) => void setPref({ shareMeals: v }, v ? `${name} can see meals you show` : `${name} is left out of every meal you show`)}
            />
            <Divider />
            <SwitchRow
              testID="friend-see-meals"
              title={theirMealsTitle(name)}
              subtitle={THEIR_MEALS_OFF}
              value={friend.seeMeals}
              onChange={(v) => void setPref({ seeMeals: v }, v ? `${name}’s meals are in your feed` : `${name}’s meals are out of your feed`)}
            />
          </Card>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Button testID="friends-remove" title={REMOVE_FRIEND} variant="danger" onPress={() => setConfirmRemove(true)} />
        <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
          {removeNote(name)}
        </Text>
      </View>

      <FriendMealSheet
        open={openMeal?.meal ?? null}
        startAdding={!!openMeal?.adding}
        onClose={() => setOpenMeal(null)}
        onCheer={(o) => {
          void cheerMeal(o.owner.userId, o.meal.ref).then((r) => !r.ok && toast(r.message));
          setOpenMeal((cur) => (cur ? { ...cur, meal: { ...cur.meal, cheered: true } } : cur));
        }}
      />
      <ConfirmSheet
        visible={confirmRemove}
        title={`Remove ${name}?`}
        message="You stop seeing each other's week and meals, and the cheers between you are removed. They are not told, and you can add each other again with a code."
        confirmLabel={REMOVE_FRIEND}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </Screen>
  );
}

