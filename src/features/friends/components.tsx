import { Copy, Flame, HandHeart, Lock, Share as ShareIcon, X } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import { formatShortDate, weekdayShort } from '@/lib/dates';
import { formatDistance } from '@/lib/units';
import type { CheerReceived, Friend, FriendRequest, FriendWorkout, SocialSharing } from '@/services/friends';
import { cupFor, fonts, useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Avatar, Button, Card, Chip, Divider, IconButton, MiniCup, PressableScale, Text, TextField, ToggleRow } from '@/ui';

import { formatCode, normalizeCode } from './summary';
import { dayLabel, friendWeek, initialsFor, isCurrentWeek, latestWorkout, personMark, sharesAnything, sharingSentence, type FriendDay } from './week';

/** Below this width (iPhone SE) the friend screens tighten up, as Today does. */
export function useNarrow(): boolean {
  return useWindowDimensions().width < 360;
}

/** Test ids carry a short, stable form of a user id. */
export const idFor = (userId: string) => userId.replace(/[^A-Za-z0-9-]/g, '').toLowerCase();

// ------------------------------------------------------------------ marks

/** A person: a cup tile with initials, or their emoji as a content mark in an outlined cup (never a filled emoji tile). */
export function PersonMark({ name, avatar, size = 44 }: { name: string; avatar: string; size?: number }) {
  const { colors } = useTheme();
  const mark = personMark(name, avatar);
  if (mark.kind === 'initials') return <Avatar initials={mark.text} size={size} />;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, ...cupFor(size), borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.56) }}>{mark.text}</Text>
    </View>
  );
}

/** Cheer, or the done state "Cheered". Instant: the store marks it at once and rolls it back if the server refuses. */
export function CheerButton({ cheered, onPress, label, testID }: { cheered: boolean; onPress: () => void; label: string; testID: string }) {
  const { colors } = useTheme();
  return (
    <Button
      testID={testID}
      title={cheered ? 'Cheered' : 'Cheer'}
      variant={cheered ? 'soft' : 'secondary'}
      size="sm"
      full={false}
      accessibilityLabel={cheered ? `You cheered ${label}` : `Cheer ${label}`}
      icon={<HandHeart size={16} color={cheered ? colors.primary : colors.text} strokeWidth={2.2} />}
      onPress={cheered ? undefined : onPress}
    />
  );
}

// ------------------------------------------------------------------ week

/** Seven small cups in the exercise colour, one per day of this week, filled by the friend's shared workouts. */
export function WeekCups({ days, today }: { days: FriendDay[]; today: ISODate }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((d) => (
        <View
          key={d.date}
          accessible
          accessibilityLabel={`${weekdayShort(d.date)}: ${d.future ? 'not yet' : d.minutes ? `${d.minutes} minutes` : 'no workout shared'}`}
          style={{ flex: 1, alignItems: 'center', gap: 5 }}>
          <MiniCup progress={d.progress} over={false} future={d.future} color={colors.exercise} width={30} height={26} />
          <Text variant="caption" color={d.date === today ? 'text' : 'textSecondary'} style={d.date === today ? { fontFamily: fonts.bold } : undefined}>
            {weekdayShort(d.date).slice(0, 1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function workoutTitle(w: FriendWorkout, units: UnitSystem): string {
  return w.distanceKm ? `${w.name} ${formatDistance(w.distanceKm, units)}` : w.name;
}

export function workoutMeta(w: FriendWorkout, today: ISODate): string {
  return [w.date ? dayLabel(w.date, today) : null, typeof w.minutes === 'number' ? `${w.minutes} min` : null].filter(Boolean).join(' · ');
}

/** One shared workout: the activity emoji as a small content mark, what and when, and Cheer beside it (siblings, never nested). */
export function WorkoutRow({ w, friend, today, units, onCheer }: { w: FriendWorkout; friend: Friend; today: ISODate; units: UnitSystem; onCheer: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 6 }}>
      <Text style={{ fontSize: 17, lineHeight: 22, width: 22, textAlign: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
        {w.emoji || '·'}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
          {workoutTitle(w, units)}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {workoutMeta(w, today)}
        </Text>
      </View>
      <CheerButton
        testID={`friends-cheer-${w.id}`}
        cheered={friend.cheered.includes(w.id)}
        label={`${friend.displayName}'s ${w.name.toLowerCase()}`}
        onPress={onCheer}
      />
    </View>
  );
}

/** The streak line under a name: a flame and the count. */
function StreakLine({ days }: { days: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Flame size={14} color={colors.caloriesInk} strokeWidth={2.2} />
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {days === 1 ? '1 day streak' : `${days} day streak`}
      </Text>
    </View>
  );
}

/**
 * A friend's week, as in the mock: who, their minutes and sessions, a row of
 * week cups, and their latest workout with Cheer. Every part shows only when
 * the friend shares it, so someone sharing less has a shorter card, not holes.
 */
export function FriendCard({ friend, today, units, onOpen, onCheer }: { friend: Friend; today: ISODate; units: UnitSystem; onOpen: () => void; onCheer: (ref: string) => void }) {
  const { spacing } = useTheme();
  const s = friend.summary;
  const days = friendWeek(s, today);
  const latest = latestWorkout(s);
  const current = isCurrentWeek(s, today);
  const hasMinutes = typeof s.minutes === 'number';
  const slug = idFor(friend.userId);
  const narrow = useNarrow();
  return (
    <Card padding={spacing.lg} testID={`friends-friend-${slug}`}>
      <PressableScale
        testID={`friends-card-${slug}`}
        onPress={onOpen}
        scaleTo={0.99}
        accessibilityLabel={`${friend.displayName}. ${hasMinutes ? `${s.minutes} active minutes ${current ? 'this week' : 'in their last shared week'}. ` : ''}${typeof s.streak === 'number' ? `${s.streak} day streak. ` : ''}Open details`}
        style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <PersonMark name={friend.displayName} avatar={friend.avatar} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="h3" numberOfLines={1}>
              {friend.displayName}
            </Text>
            {typeof s.streak === 'number' ? <StreakLine days={s.streak} /> : !sharesAnything(s) ? (
              <Text variant="caption" color="textSecondary" numberOfLines={2}>
                Not sharing their week right now
              </Text>
            ) : null}
          </View>
          {hasMinutes ? (
            <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
              <Text variant="numL" testID={`friends-minutes-${slug}`}>
                {s.minutes}
                <Text variant="unit"> min</Text>
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {current
                  ? `${s.sessions ?? 0} ${s.sessions === 1 ? 'session' : 'sessions'}${narrow ? '' : ' this week'}`
                  : s.week
                    ? `Week of ${formatShortDate(s.week)}`
                    : 'Last shared week'}
              </Text>
            </View>
          ) : null}
        </View>
        {days ? <WeekCups days={days} today={today} /> : null}
      </PressableScale>
      {latest ? (
        <>
          <View style={{ marginTop: spacing.md }}>
            <Divider />
          </View>
          <WorkoutRow w={latest} friend={friend} today={today} units={units} onCheer={() => onCheer(latest.id)} />
        </>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ invite

/** The user's own code, large and readable, with Share and Copy. On surfaceAlt, so text stays text or textSecondary. */
export function InviteCard({ code, sharing, onShare, onCopy }: { code: string; sharing: SocialSharing; onShare: () => void; onCopy: () => void }) {
  const { colors, spacing } = useTheme();
  const size = useNarrow() ? 34 : 44;
  const c = normalizeCode(code);
  return (
    <Card tone="alt" padding={spacing.xl} testID="friends-invite">
      <Text variant="overline" color="textSecondary">
        Your invite code
      </Text>
      <Text
        testID="friends-code"
        selectable
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={`Your invite code: ${c.split('').join(' ')}`}
        style={{ fontFamily: fonts.extrabold, fontSize: size, lineHeight: size + 8, letterSpacing: size / 30, marginTop: spacing.xs, fontVariant: ['tabular-nums'] }}>
        {c.slice(0, 4)}
        <Text color="textSecondary" style={{ fontFamily: fonts.extrabold, fontSize: size }}>
          {c.length > 4 ? '·' : ''}
        </Text>
        {c.slice(4)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Button testID="friends-share" title="Share link" size="md" full={false} icon={<ShareIcon size={18} color={colors.onPrimary} strokeWidth={2.2} />} onPress={onShare} />
        <Button
          testID="friends-copy"
          title="Copy code"
          variant="secondary"
          size="md"
          full={false}
          accessibilityLabel={`Copy code ${formatCode(c)}`}
          icon={<Copy size={18} color={colors.text} strokeWidth={2.2} />}
          onPress={onCopy}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.lg }}>
        <Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 3 }} />
        <Text variant="body" color="textSecondary" style={{ flex: 1, fontSize: 14, lineHeight: 20 }} testID="friends-never-shared">
          {sharingSentence(sharing)}
        </Text>
      </View>
    </Card>
  );
}

// ------------------------------------------------------------------ requests

/** Requests sent to the user: Accept, and a quiet decline (the other person is never told). */
export function IncomingRequests({ requests, busy, onAccept, onDecline }: { requests: FriendRequest[]; busy: string | null; onAccept: (r: FriendRequest) => void; onDecline: (r: FriendRequest) => void }) {
  const { colors, spacing } = useTheme();
  const narrow = useNarrow();
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.sm }} testID="friends-incoming">
      {requests.map((r, i) => (
        <React.Fragment key={r.userId}>
          {i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', flexWrap: narrow ? 'wrap' : 'nowrap', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm }}>
            <PersonMark name={r.displayName} avatar={r.avatar} />
            <View style={{ flex: 1, minWidth: narrow ? 160 : 0 }}>
              <Text variant="h3" numberOfLines={1}>
                {r.displayName}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={2}>
                Wants to be friends
              </Text>
            </View>
            {narrow ? <View style={{ flexBasis: 44, flexGrow: 1 }} /> : null}
            <IconButton testID={`friends-decline-${idFor(r.userId)}`} size={36} accessibilityLabel={`Decline ${r.displayName}'s request`} disabled={busy === r.userId} onPress={() => onDecline(r)}>
              <X size={18} color={colors.text} strokeWidth={2.2} />
            </IconButton>
            <Button testID={`friends-accept-${idFor(r.userId)}`} title="Accept" size="sm" full={false} loading={busy === r.userId} accessibilityLabel={`Accept ${r.displayName}`} onPress={() => onAccept(r)} />
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

/** Requests the user sent that are still waiting. One turned down looks the same, on purpose. */
export function OutgoingRequests({ requests, busy, onCancel }: { requests: FriendRequest[]; busy: string | null; onCancel: (r: FriendRequest) => void }) {
  const { spacing } = useTheme();
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-outgoing">
      {requests.map((r, i) => (
        <React.Fragment key={r.userId}>
          {i > 0 ? <Divider /> : null}
          <View testID={`friends-outgoing-${idFor(r.userId)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm }}>
            <PersonMark name={r.displayName} avatar={r.avatar} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
                {r.displayName}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                Waiting for them to accept
              </Text>
            </View>
            <Button
              testID={`friends-cancel-${idFor(r.userId)}`}
              title="Take back"
              variant="secondary"
              size="sm"
              full={false}
              loading={busy === r.userId}
              accessibilityLabel={`Take back your request to ${r.displayName}`}
              onPress={() => onCancel(r)}
            />
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

/** Cheers the user received: "Maya cheered your run", newest first. */
export function CheersList({ cheers, describe, when }: { cheers: CheerReceived[]; describe: (c: CheerReceived) => string; when: (c: CheerReceived) => string }) {
  const { colors, spacing } = useTheme();
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-cheers">
      {cheers.map((c, i) => (
        <React.Fragment key={`${c.fromUserId}-${c.ref}`}>
          {i > 0 ? <Divider inset={48} /> : null}
          <View testID={`friends-cheer-received-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm }}>
            <PersonMark name={c.displayName} avatar={c.avatar} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" numberOfLines={2}>
                <Text variant="bodyStrong">{c.displayName}</Text>
                {` cheered ${describe(c)}`}
              </Text>
              <Text variant="caption" color="textSecondary">
                {when(c)}
              </Text>
            </View>
            <HandHeart size={18} color={colors.textSecondary} strokeWidth={1.9} />
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ profile fields

const EMOJI_CHOICES = ['🏃', '🚴', '🏊', '🧘', '🏋️', '🥾'];

/** Initials (default, from the name) or one of a few activity emoji. */
export function AvatarPicker({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" color="textSecondary">
        How you appear
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} accessibilityRole="radiogroup">
        <Chip testID="friends-avatar-initials" label={`Initials ${initialsFor(name || 'Me')}`} selected={!value} onPress={() => onChange('')} />
        {EMOJI_CHOICES.map((e, i) => (
          <Chip key={e} testID={`friends-avatar-${i}`} label={e} selected={value === e} onPress={() => onChange(e)} style={{ minWidth: 44, justifyContent: 'center' }} />
        ))}
      </View>
    </View>
  );
}

/** The three sharing switches, each saying exactly what it shows, and the sentence about what is never shared. */
export function SharingSwitches({ sharing, onChange }: { sharing: SocialSharing; onChange: (key: keyof SocialSharing, on: boolean) => void }) {
  const { spacing } = useTheme();
  return (
    <View>
      <Text variant="label" color="textSecondary" style={{ marginBottom: spacing.xs }}>
        What friends see
      </Text>
      <ToggleRow testID="friends-share-minutes" title="Active minutes" subtitle="Weekly total and sessions. Workout lengths show with recent workouts" value={sharing.minutes} onChange={(v) => onChange('minutes', v)} />
      <Divider />
      <ToggleRow testID="friends-share-streak" title="Logging streak" subtitle="How many days in a row you have logged" value={sharing.streak} onChange={(v) => onChange('streak', v)} />
      <Divider />
      <ToggleRow testID="friends-share-workouts" title="Recent workouts" subtitle="Name, length and distance from the last two weeks" value={sharing.workouts} onChange={(v) => onChange('workouts', v)} />
      <NeverShared />
    </View>
  );
}

export function NeverShared() {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
      <Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 2 }} />
      <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
        Your calories, weight and food are never shared, whatever you choose here.
      </Text>
    </View>
  );
}

export function NameField({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) {
  return (
    <TextField
      testID={testID}
      label="The name friends see"
      value={value}
      onChangeText={onChange}
      maxLength={40}
      autoCapitalize="words"
      autoComplete="name"
      placeholder="Your first name"
      hint="Friends add you by your code. Nobody can search for this name."
    />
  );
}

// ------------------------------------------------------------------ states

export function Loading({ label = 'Loading friends' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View testID="friends-loading" accessibilityLabel={label} style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
      <ActivityIndicator color={colors.textSecondary} />
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}
