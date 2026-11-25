import { useFocusEffect } from 'expo-router';
import { EyeOff, Lock, Users } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { mealsOverview } from '@/features/friends/overview';
import { idFor, Loading, NameField, SharingRow } from '@/features/friends/components';
import type { MealSettings, MySharedMeal } from '@/features/friends/contract';
import { MEAL_TYPES } from '@/features/friends/meals';
import { cleanAvatar } from '@/features/friends/week';
import {
  ALWAYS_SHOW,
  AUDIENCE_NOTE,
  AUDIENCE_SAVE,
  AUDIENCE_TITLE,
  audienceLine,
  autoLine,
  daysLeft,
  KCAL_WITH_MEALS,
  LEAVE_CONFIRM,
  LEAVE_NOTE,
  LEAVE_TITLE,
  mealChip,
  MEALS_INTRO,
  myMealLine,
  myMealTitle,
  NEVER_SHARED,
  NOTHING_SHOWN,
  SEE_MEALS,
  SEE_MEALS_OFF,
  SETTINGS_SUBTITLE,
  SETTINGS_TITLE,
  SHOW_KCAL_OFF,
  SHOW_KCAL_ON,
  SHOWING_NOW,
  STOP,
  STOP_ALL,
  stoppedToast,
  STOPPED_ALL,
  UNDER_18,
  WHAT_YOU_SEE,
  WHO_SEES_MEALS,
  YOUR_MEALS,
  YOUR_WEEK,
} from '@/features/friends/words';
import { withoutMarks } from '@/lib/bidi';
import { leaveSocial, refreshFriends, setMealAudience, setMealSettings, setupSocial, showMeal, stopAllMeals, stopMeal, useFriends, type SocialSharing } from '@/services/friends';
import { useNow, useToday } from '@/store/clock';
import { useLargeText, useTheme } from '@/theme';
import type { MealType } from '@/types';
import { Button, Card, Chip, ChipWrap, ConfirmSheet, decorative, Divider, EmptyState, goBack, haptic, Header, ListRow, Screen, SectionTitle, Sheet, Text, toast } from '@/ui';

const WEEK_NAMES: Record<keyof SocialSharing, string> = { minutes: 'your active minutes', streak: 'your streak', workouts: 'your recent workouts' };

/** Friends settings and privacy: the name friends see, your week, your meals, what is showing now, what you see, and turning friends off. */
export default function FriendsSettingsScreen() {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const status = useFriends((s) => s.status);
  const overview = useFriends((s) => s.overview);
  const today = useToday();
  const now = useNow();
  const { me, friends, myMeals } = mealsOverview(overview);
  const [name, setName] = useState(me?.displayName ?? '');
  const [nameFor, setNameFor] = useState(me?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshFriends();
    }, []),
  );

  // The name field follows the card when it loads or changes elsewhere, unless the person is typing a new one.
  if (me && me.displayName !== nameFor) {
    setNameFor(me.displayName);
    if (name === nameFor) setName(me.displayName);
  }

  const header = <Header title={SETTINGS_TITLE} subtitle={SETTINGS_SUBTITLE} />;
  if (!me) {
    return (
      <Screen header={header} testID="friends-settings">
        {status === 'idle' || status === 'loading' ? (
          <Loading />
        ) : (
          <Card testID="friends-settings-off">
            {status === 'unavailable' || status === 'signed-out' ? (
              <EmptyState title="Friends need an account" message="With an account, choose here what friends see." action="Open Friends" onAction={() => goBack('/friends')} />
            ) : (
              <EmptyState title="Friends are off" message="Turn friends on to choose what they see." action="Open Friends" onAction={() => goBack('/friends')} />
            )}
          </Card>
        )}
      </Screen>
    );
  }

  const saveCard = async (patch: Partial<{ displayName: string; sharing: SocialSharing }>, said: string) => {
    // People show as initials: an emoji mark chosen before that rule is dropped with the next save.
    const res = await setupSocial({ displayName: patch.displayName ?? me.displayName, avatar: cleanAvatar(me.avatar), sharing: patch.sharing ?? me.sharing });
    toast(res.ok ? said : res.message);
    return res.ok;
  };
  const saveMeals = async (patch: Partial<MealSettings>, said: string) => {
    const res = await setMealSettings(patch);
    if (res.ok) haptic.select();
    toast(res.ok ? said : res.message);
  };
  const audienceNames = friends.filter((f) => me.audience.includes(f.userId)).map((f) => f.displayName);
  const namesOf = (m: MySharedMeal) => m.viewers.map((v) => v.displayName);

  const stopOne = async (m: MySharedMeal) => {
    const res = await stopMeal(m.ref);
    if (!res.ok) {
      toast(res.message);
      return;
    }
    haptic.tap();
    toast(stoppedToast(m.meal), {
      label: 'Undo',
      onPress: () => void showMeal({ day: m.day, meal: m.meal, items: m.items, showKcal: m.showKcal, viewers: m.viewers.map((v) => v.userId) }).then((r) => !r.ok && toast(r.message)),
    });
  };
  const stopAll = async () => {
    setConfirmStopAll(false);
    const res = await stopAllMeals();
    if (res.ok) haptic.tap();
    toast(res.ok ? STOPPED_ALL : res.message);
  };
  const leave = async () => {
    setConfirmLeave(false);
    const res = await leaveSocial();
    toast(res.ok ? 'Friends turned off. Your card, friendships, cheers and meals were removed.' : res.message);
    // Back to Friends, which shows its set-up again (never a second Friends screen on top of the first).
    if (res.ok) goBack('/friends');
  };
  const toggleAuto = (m: MealType) => {
    const on = me.mealSettings.auto.includes(m);
    const auto = MEAL_TYPES.filter((x) => (x === m ? !on : me.mealSettings.auto.includes(x)));
    void saveMeals({ auto }, on ? `${mealChip(m)} no longer shown by itself` : `${mealChip(m)} shown each day as you log it`);
  };

  return (
    <Screen header={header} testID="friends-settings">
      <View style={{ gap: spacing.sm }}>
        <NameField testID="friends-settings-name" value={name} onChange={setName} />
        {name.trim() && name.trim() !== me.displayName ? (
          <Button
            testID="friends-settings-name-save"
            title="Save name"
            size="sm"
            full={false}
            loading={savingName}
            onPress={async () => {
              setSavingName(true);
              const ok = await saveCard({ displayName: name.trim() }, `Friends now see you as ${name.trim()}`);
              if (!ok) setName(me.displayName);
              setSavingName(false);
            }}
          />
        ) : null}
      </View>

      <View style={{ gap: spacing.md }}>
        <SectionTitle title={YOUR_WEEK} />
        <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-settings-week">
          {(
            [
              ['minutes', 'Active minutes', 'Weekly total and sessions'],
              ['streak', 'Logging streak', 'Days in a row you logged'],
              ['workouts', 'Recent workouts', 'Name, length and distance, last two weeks'],
            ] as const
          ).map(([key, title, subtitle], i) => (
            <React.Fragment key={key}>
              {i > 0 ? <Divider /> : null}
              <SharingRow
                testID={`friends-share-${key}`}
                title={title}
                subtitle={subtitle}
                value={me.sharing[key]}
                onChange={(on) => void saveCard({ sharing: { ...me.sharing, [key]: on } }, on ? `Friends now see ${WEEK_NAMES[key]}` : `Friends no longer see ${WEEK_NAMES[key]}`)}
              />
            </React.Fragment>
          ))}
        </Card>
      </View>

      {me.mealsAllowed ? (
        <>
          <View style={{ gap: spacing.md }}>
            <SectionTitle title={YOUR_MEALS} />
            <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-settings-meals">
              <View style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md }}>
                {decorative(<Users size={18} color={colors.textSecondary} strokeWidth={1.9} style={{ marginTop: 1 }} />)}
                <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  {MEALS_INTRO}
                </Text>
              </View>
              <Divider />
              <ListRow
                testID="friends-settings-audience"
                title={WHO_SEES_MEALS}
                subtitle={audienceLine(audienceNames)}
                onPress={() => {
                  setPicked(new Set(me.audience));
                  setAudienceOpen(true);
                }}
              />
              <Divider />
              <SharingRow testID="friends-settings-kcal" title={KCAL_WITH_MEALS} subtitle={me.mealSettings.kcal ? SHOW_KCAL_ON : SHOW_KCAL_OFF} value={me.mealSettings.kcal} onChange={(v) => void saveMeals({ kcal: v }, v ? 'Calories shown with the next meal you show' : 'Calories left out of the next meal you show')} />
              <Divider />
              <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
                <View>
                  <Text variant="bodyStrong">{ALWAYS_SHOW}</Text>
                  <Text variant="caption" color="textSecondary" testID="friends-settings-auto-line">
                    {autoLine(me.mealSettings.auto)}
                  </Text>
                </View>
                {/* Two by two, each chip half the row (one a row with large text), so no chip is left alone on a line. */}
                <View style={{ gap: spacing.sm }}>
                  {(large ? MEAL_TYPES.map((m) => [m]) : [MEAL_TYPES.slice(0, 2), MEAL_TYPES.slice(2)]).map((row) => (
                    <View key={row[0]} style={{ flexDirection: 'row', gap: spacing.sm }}>
                      {row.map((m) => (
                        <View key={m} style={{ flex: 1 }}>
                          <Chip testID={`friends-settings-auto-${m}`} label={mealChip(m)} selected={me.mealSettings.auto.includes(m)} onPress={() => toggleAuto(m)} style={{ justifyContent: 'center' }} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </Card>
          </View>

          <View style={{ gap: spacing.md }}>
            <SectionTitle title={SHOWING_NOW} action={myMeals.length ? `${myMeals.length} ${myMeals.length === 1 ? 'meal' : 'meals'}` : undefined} />
            <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-settings-showing">
              {myMeals.length ? (
                myMeals.map((m, i) => (
                  <React.Fragment key={m.ref}>
                    {i > 0 ? <Divider /> : null}
                    <View testID={`friends-showing-${m.ref.slice(0, 8)}`} style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'stretch' : 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm }}>
                      <View style={{ flex: large ? undefined : 1, minWidth: 0 }}>
                        <Text variant="bodyStrong">{myMealTitle(m.meal, m.day, today)}</Text>
                        <Text variant="caption" color="textSecondary">
                          {myMealLine(namesOf(m), m.cheers, daysLeft(m.expiresAt, now.getTime()))}
                        </Text>
                      </View>
                      <View style={{ alignSelf: large ? 'flex-end' : 'center' }}>
                        <Button testID={`friends-showing-stop-${m.ref.slice(0, 8)}`} title={STOP} variant="secondary" size="sm" full={false} accessibilityLabel={`Stop showing ${withoutMarks(myMealTitle(m.meal, m.day, today))}`} onPress={() => void stopOne(m)} />
                      </View>
                    </View>
                  </React.Fragment>
                ))
              ) : (
                <Text variant="body" color="textSecondary" style={{ paddingVertical: spacing.md }} testID="friends-showing-none">
                  {NOTHING_SHOWN}
                </Text>
              )}
            </Card>
            {myMeals.length ? (
              <Button testID="friends-stop-all" title={STOP_ALL} variant="ghost" size="sm" full={false} style={{ alignSelf: 'center' }} icon={<EyeOff size={18} color={colors.actionInk} />} onPress={() => setConfirmStopAll(true)} />
            ) : null}
          </View>

          <View style={{ gap: spacing.md }}>
            <SectionTitle title={WHAT_YOU_SEE} />
            <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-settings-see">
              <SharingRow testID="friends-settings-see-meals" title={SEE_MEALS} subtitle={SEE_MEALS_OFF} value={me.mealSettings.see} onChange={(v) => void saveMeals({ see: v }, v ? 'Friends’ meals are in your feed' : 'Friends’ meals are out of your feed')} />
            </Card>
          </View>
        </>
      ) : (
        <Card tone="alt" testID="friends-settings-under-18">
          <Text variant="body" color="text">
            {UNDER_18}
          </Text>
        </Card>
      )}

      <Card tone="alt" testID="friends-settings-never">
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {decorative(<Lock size={16} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 3 }} />)}
          <Text variant="body" color="textSecondary" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
            {NEVER_SHARED}
          </Text>
        </View>
      </Card>

      <View style={{ gap: spacing.md }}>
        <SectionTitle title={LEAVE_TITLE} />
        <Card testID="friends-settings-leave">
          <View style={{ gap: spacing.md }}>
            <Text variant="body" color="textSecondary">
              {LEAVE_NOTE}
            </Text>
            <Button testID="friends-leave" title={LEAVE_TITLE} variant="danger" size="md" onPress={() => setConfirmLeave(true)} />
          </View>
        </Card>
      </View>

      <Sheet
        visible={audienceOpen}
        onClose={() => setAudienceOpen(false)}
        title={AUDIENCE_TITLE}
        footer={
          <Button
            testID="friends-audience-save"
            title={AUDIENCE_SAVE}
            onPress={async () => {
              const res = await setMealAudience([...picked]);
              setAudienceOpen(false);
              toast(res.ok ? `Who sees your meals: ${audienceLine(friends.filter((f) => picked.has(f.userId)).map((f) => f.displayName))}` : res.message);
            }}
          />
        }>
        <View style={{ gap: spacing.md }} testID="friends-audience">
          <Text variant="caption" color="textSecondary">
            {AUDIENCE_NOTE}
          </Text>
          <ChipWrap>
            {friends
              .filter((f) => f.shareMeals)
              .map((f) => (
                <Chip
                  key={f.userId}
                  testID={`friends-audience-${idFor(f.userId)}`}
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
        </View>
      </Sheet>
      <ConfirmSheet
        visible={confirmStopAll}
        title="Stop showing all meals?"
        message="Every meal you show leaves your friends’ feeds now. You can show a meal again from its menu in the diary."
        confirmLabel={STOP_ALL}
        onConfirm={() => void stopAll()}
        onCancel={() => setConfirmStopAll(false)}
      />
      <ConfirmSheet visible={confirmLeave} title="Turn friends off?" message={LEAVE_CONFIRM} confirmLabel={LEAVE_TITLE} destructive onConfirm={() => void leave()} onCancel={() => setConfirmLeave(false)} />
    </Screen>
  );
}
