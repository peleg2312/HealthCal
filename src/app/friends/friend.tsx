import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { CheerButton, Loading, WeekCups } from '@/features/friends/components';
import { feedKey, friendShows, localFeed, mealsOf } from '@/features/friends/feed';
import { FeedRow, itemRole, listRole } from '@/features/friends/FeedParts';
import { FriendMealSheet, type OpenMeal } from '@/features/friends/FriendMealSheet';
import { mealsOverview } from '@/features/friends/overview';
import { dayRef } from '@/features/friends/summary';
import { friendWeek, isCurrentWeek, sharesAnything } from '@/features/friends/week';
import {
  friendsSince,
  MANAGE,
  manageLine,
  manageTitle,
  nothingShownYet,
  REMOVE_FRIEND,
  removeConfirm,
  removedToast,
  removeNote,
  seesMyMealsOn,
  seesMyMealsTitle,
  theirMealsOn,
  theirMealsTitle,
  theyShowYou,
  weekOf,
} from '@/features/friends/words';
import { Figure } from '@/features/trackers/components';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { formatShortDate, toISODate } from '@/lib/dates';
import { cheerFriend, cheerMeal, refreshFriends, removeFriend, setFriendMealPrefs, useFriends } from '@/services/friends';
import { useToday } from '@/store/clock';
import { useProfile } from '@/store/selectors';
import { fonts, useLargeText, useTheme } from '@/theme';
import { Card, ConfirmSheet, Divider, EmptyState, goBack, Header, ListRow, PressableScale, Screen, SectionTitle, Sheet, Text, toast, Toggle } from '@/ui';

/** A switch in the Manage sheet: its words (what On does), and the kit's switch named by its title. */
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

/**
 * A friend's page: their week (figures, the week in cups and Cheer their day), what they show you (meals and
 * workouts together, newest first), and one "Manage" row whose sheet holds the rarer controls: the two meal
 * switches and, quiet and last, Remove. Room is left above the week for something the two do together and
 * under it for notes between them.
 */
export default function FriendScreen() {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  const profile = useProfile();
  const today = useToday();
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [openMeal, setOpenMeal] = useState<{ meal: OpenMeal; adding: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshFriends();
    }, []),
  );

  // mealWords: meals are named only where they work for this person (never on a server without them, nor under 18).
  const { me, friends, feed, mealWords } = mealsOverview(overview);
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
  const theirMeals = mealsOn ? mealsOf(localFeed({ feed, today, seeMeals: !!me?.mealSettings.see, friends }), friend.userId) : [];
  const shows = friendShows(theirMeals, friend, s.workouts ?? []);
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
    toast(res.ok ? removedToast(name, mealWords) : res.message);
    if (res.ok) goBack('/friends');
  };

  const cheerDay = <CheerButton testID="friends-cheer-day" cheered={friend.cheered.includes(dayCheer)} label={`${withoutMarks(name)}’s day`} onPress={() => void cheer(dayCheer)} />;
  const weekHead = (
    <View style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'flex-start' : 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <Text variant="overline" color="textSecondary" accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ flexShrink: 1 }}>
        {weekOf(name)}
      </Text>
      <View style={{ alignSelf: large ? 'flex-end' : 'center' }}>{cheerDay}</View>
    </View>
  );

  return (
    <Screen header={<Header title={name} subtitle={friendsSince(since)} />} testID="friend-screen">
      {/* Something the two of you do together goes here, above their week. */}
      {sharesAnything(s) ? (
        <Card testID="friend-week">
          {weekHead}
          {typeof s.minutes === 'number' || typeof s.streak === 'number' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md }}>
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
        <Card testID="friend-week-none">
          {weekHead}
          <Text variant="body" color="textSecondary" style={{ marginTop: spacing.sm }}>
            {`${isolateRtl(name)} is not sharing their week right now. You can still cheer their day.`}
          </Text>
        </Card>
      )}

      {/* Notes between the two of you go here, under their week. */}

      <View style={{ gap: spacing.md }}>
        <SectionTitle title={theyShowYou(name)} />
        <Card padding={0} testID="friend-shows">
          {shows.length ? (
            <View {...listRole} testID={theirMeals.length ? 'friend-meals' : undefined}>
              {shows.map((item, i) => {
                const nth = shows.slice(0, i).filter((x) => x.kind === item.kind).length;
                return (
                  <View key={feedKey(item)} {...itemRole}>
                    {i > 0 ? <Divider inset={spacing.lg} /> : null}
                    {item.kind === 'meal' ? (
                      <FeedRow
                        item={item}
                        units={profile.units}
                        today={today}
                        testID={`friend-meal-${nth}`}
                        onOpen={() => setOpenMeal({ meal: { owner: item, meal: item, cheered: item.cheered }, adding: false })}
                        onAdd={() => setOpenMeal({ meal: { owner: item, meal: item, cheered: item.cheered }, adding: true })}
                        onCheer={() => void cheerMeal(item.userId, item.ref).then((r) => !r.ok && toast(r.message))}
                      />
                    ) : (
                      <FeedRow item={item} units={profile.units} today={today} testID={`friend-workout-${nth}`} cheerTestID={`friends-cheer-${item.ref}`} onCheer={() => void cheer(item.ref)} />
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text variant="body" color="textSecondary" testID="friend-shows-none" style={{ padding: spacing.lg }}>
              {nothingShownYet(name)}
            </Text>
          )}
        </Card>
      </View>

      <Card padding={0}>
        <ListRow
          testID="friend-manage"
          style={{ paddingHorizontal: spacing.lg }}
          title={MANAGE}
          subtitle={manageLine(mealsOn)}
          left={<SlidersHorizontal size={20} color={colors.text} />}
          chevron
          onPress={() => setManageOpen(true)}
        />
      </Card>

      <Sheet visible={manageOpen} onClose={() => setManageOpen(false)} title={manageTitle(name)}>
        <View testID="friend-manage-sheet">
          {mealsOn ? (
            <View testID="friend-between">
              <SwitchRow
                testID="friend-share-meals"
                title={seesMyMealsTitle(name)}
                subtitle={seesMyMealsOn(name)}
                value={friend.shareMeals}
                onChange={(v) => void setPref({ shareMeals: v }, v ? `${name} can see meals you show` : `${name} is left out of every meal you show`)}
              />
              <Divider />
              <SwitchRow
                testID="friend-see-meals"
                title={theirMealsTitle(name)}
                subtitle={theirMealsOn(name)}
                value={friend.seeMeals}
                onChange={(v) => void setPref({ seeMeals: v }, v ? `${name}’s meals are in your feed` : `${name}’s meals are out of your feed`)}
              />
              <Divider />
            </View>
          ) : null}
          {/* Quiet and last: words in the danger colour, no filled or outlined button. */}
          <PressableScale
            testID="friends-remove"
            focusRing="inside"
            accessibilityLabel={`${REMOVE_FRIEND}. ${withoutMarks(removeNote(name, mealWords))}`}
            onPress={() => {
              setManageOpen(false);
              setConfirmRemove(true);
            }}
            style={{ minHeight: 56, paddingVertical: spacing.md, justifyContent: 'center' }}>
            <Text variant="bodyStrong" color="danger">
              {REMOVE_FRIEND}
            </Text>
            <Text variant="caption" color="textSecondary">
              {removeNote(name, mealWords)}
            </Text>
          </PressableScale>
        </View>
      </Sheet>

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
        message={removeConfirm(mealWords)}
        confirmLabel={REMOVE_FRIEND}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </Screen>
  );
}
