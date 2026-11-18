import React, { useState } from 'react';
import { View } from 'react-native';

import { isolateRtl } from '@/lib/bidi';
import { formatShortDate, toISODate } from '@/lib/dates';
import { setupSocial, type Friend, type SocialMe, type SocialSharing } from '@/services/friends';
import { useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Figure } from '@/features/trackers/components';
import { Button, Divider, Sheet, Text, toast } from '@/ui';

import { CheerButton, NameField, PersonMark, SharingSwitches, WeekCups, WorkoutRow } from './components';
import { dayRef } from './summary';
import { cleanAvatar, friendWeek, isCurrentWeek, sharesAnything } from './week';

/** A friend's detail: since when, their week, every shared workout with Cheer, a cheer for the day, and Remove. */
export function FriendSheet({
  friend,
  today,
  units,
  onClose,
  onCheer,
  onRemove,
}: {
  friend: Friend | null;
  today: ISODate;
  units: UnitSystem;
  onClose: () => void;
  onCheer: (friend: Friend, ref: string) => void;
  onRemove: (friend: Friend) => void;
}) {
  const { spacing } = useTheme();
  const f = friend;
  const s = f?.summary ?? {};
  const days = friendWeek(s, today);
  const current = isCurrentWeek(s, today);
  const workouts = s.workouts ?? [];
  const since = f?.since ? toISODate(new Date(f.since)) : null;
  const dayCheer = dayRef(today);
  return (
    <Sheet
      visible={!!f}
      onClose={onClose}
      title={f?.displayName}
      footer={f ? <Button testID="friends-remove" title="Remove friend" variant="danger" onPress={() => onRemove(f)} /> : null}>
      {f ? (
        <View style={{ gap: spacing.lg }} testID="friends-detail">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <PersonMark name={f.displayName} avatar={f.avatar} />
            <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
              {since ? `Friends since ${formatShortDate(since)}` : 'Friends'}
            </Text>
          </View>
          {typeof s.minutes === 'number' || typeof s.streak === 'number' ? (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              {/* Figures, not Stat: their labels take a second line in a third of a narrow sheet instead of ending in "…". */}
              {typeof s.minutes === 'number' ? <Figure label={current ? 'Active this week' : 'Last shared week'} value={String(s.minutes)} unit="min" /> : null}
              {typeof s.sessions === 'number' ? <Figure label="Sessions" value={String(s.sessions)} /> : null}
              {typeof s.streak === 'number' ? <Figure label="Logging streak" value={String(s.streak)} unit={s.streak === 1 ? 'day' : 'days'} /> : null}
            </View>
          ) : null}
          {days ? <WeekCups days={days} today={today} /> : null}
          {workouts.length ? (
            <View>
              <Text variant="overline" color="textSecondary" style={{ marginBottom: spacing.xs }}>
                Recent workouts
              </Text>
              {workouts.map((w, i) => (
                <React.Fragment key={w.id}>
                  {i > 0 ? <Divider inset={34} /> : null}
                  <WorkoutRow w={w} friend={f} today={today} units={units} onCheer={() => onCheer(f, w.id)} />
                </React.Fragment>
              ))}
            </View>
          ) : null}
          {!sharesAnything(s) ? (
            <Text variant="body" color="textSecondary">
              {/* One string, the name isolated: a friend named in Hebrew must not turn the sentence right to left. */}
              {`${isolateRtl(f.displayName)} is not sharing their week right now. You can still cheer their day.`}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text variant="body" style={{ flex: 1 }}>
              {`Cheer ${isolateRtl(f.displayName)}'s day`}
            </Text>
            <CheerButton testID="friends-cheer-day" cheered={f.cheered.includes(dayCheer)} label={`${f.displayName}'s day`} onPress={() => onCheer(f, dayCheer)} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Settings for friends: the name friends see, the three switches (each change is saved at once and says so), and Turn friends off. */
export function SettingsSheet({ me, visible, onClose, onLeave }: { me: SocialMe; visible: boolean; onClose: () => void; onLeave: () => void }) {
  const { spacing } = useTheme();
  const [name, setName] = useState(me.displayName);
  const [sharing, setSharing] = useState<SocialSharing>(me.sharing);
  const [saving, setSaving] = useState(false);

  const save = async (patch: Partial<{ displayName: string; sharing: SocialSharing }>, said: string, undo: () => void) => {
    // People show as initials: an emoji mark chosen before that rule is dropped with the next save.
    const res = await setupSocial({ displayName: patch.displayName ?? me.displayName, avatar: cleanAvatar(me.avatar), sharing: patch.sharing ?? me.sharing });
    if (res.ok) toast(said);
    else {
      undo();
      toast(res.message);
    }
  };

  const NAMES: Record<keyof SocialSharing, string> = { minutes: 'your active minutes', streak: 'your streak', workouts: 'your recent workouts' };

  return (
    <Sheet visible={visible} onClose={onClose} title="Friends settings">
      <View style={{ gap: spacing.lg }} testID="friends-settings">
        <Text variant="caption" color="textSecondary">
          Changes apply at once. Friends see them the next time they open Friends.
        </Text>
        <View style={{ gap: spacing.sm }}>
          <NameField testID="friends-settings-name" value={name} onChange={setName} />
          {name.trim() && name.trim() !== me.displayName ? (
            <Button
              testID="friends-settings-name-save"
              title="Save name"
              size="sm"
              full={false}
              loading={saving}
              onPress={async () => {
                setSaving(true);
                await save({ displayName: name.trim() }, `Friends now see you as ${name.trim()}`, () => setName(me.displayName));
                setSaving(false);
              }}
            />
          ) : null}
        </View>
        <SharingSwitches
          sharing={sharing}
          onChange={(key, on) => {
            const before = sharing;
            const next = { ...sharing, [key]: on };
            setSharing(next);
            void save({ sharing: next }, on ? `Friends now see ${NAMES[key]}` : `Friends no longer see ${NAMES[key]}`, () => setSharing(before));
          }}
        />
        <Divider />
        <View style={{ gap: spacing.sm }}>
          <Text variant="bodyStrong">Turn friends off</Text>
          <Text variant="caption" color="textSecondary">
            Removes your card, every friendship and every cheer. Your own data on this device is not touched.
          </Text>
          <Button testID="friends-leave" title="Turn friends off" variant="danger" size="md" onPress={onLeave} />
        </View>
      </View>
    </Sheet>
  );
}
