import { Copy, HandHeart, Lock, Share as ShareIcon, X } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { PourWait } from '@/components/PourWait';

import { weekdayShort } from '@/lib/dates';
import { formatDistance } from '@/lib/units';
import type { CheerReceived, Friend, FriendRequest, FriendWorkout, SocialSharing } from '@/services/friends';
import { fonts, useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Avatar, Button, Card, Divider, figure, IconButton, MiniCup, Text, TextField, Toggle } from '@/ui';

import { formatCode, normalizeCode } from './summary';
import { dayLabel, personMark, sharingSentence, type FriendDay } from './week';

/** Below this width (iPhone SE) the friend screens tighten up, as Today does. */
export function useNarrow(): boolean {
  return useWindowDimensions().width < 360;
}

/** Test ids carry a short, stable form of a user id. */
export const idFor = (userId: string) => userId.replace(/[^A-Za-z0-9-]/g, '').toLowerCase();

// ------------------------------------------------------------------ marks

/** A person: a cup tile with their initials, always (never an emoji). */
export function PersonMark({ name, avatar, size = 44 }: { name: string; avatar: string; size?: number }) {
  return <Avatar initials={personMark(name, avatar).text} size={size} />;
}

/** Cheer, or the done state "Cheered". Instant: the store marks it at once and rolls it back if the server refuses. */
export function CheerButton({ cheered, onPress, label, testID, full = false }: { cheered: boolean; onPress: () => void; label: string; testID: string; full?: boolean }) {
  const { colors } = useTheme();
  return (
    <Button
      testID={testID}
      title={cheered ? 'Cheered' : 'Cheer'}
      variant={cheered ? 'soft' : 'secondary'}
      size="sm"
      full={full}
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
          {...figure(`${weekdayShort(d.date)}: ${d.future ? 'not yet' : d.minutes ? `${d.minutes} minutes` : 'no workout shared'}`)}
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
    // Cheer sits beside the workout; a name too long for that line takes the row and Cheer goes under it, at the right.
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 56, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>
        <Text style={{ fontSize: 17, lineHeight: 22, minWidth: 22, textAlign: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
          {w.emoji || '·'}
        </Text>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
            {workoutTitle(w, units)}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {workoutMeta(w, today)}
          </Text>
        </View>
      </View>
      <View style={{ marginLeft: 'auto' }}>
        <CheerButton
          testID={`friends-cheer-${w.id}`}
          cheered={friend.cheered.includes(w.id)}
          label={`${friend.displayName}'s ${w.name.toLowerCase()}`}
          onPress={onCheer}
        />
      </View>
    </View>
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
        {...figure(`Your invite code: ${c.split('').join(' ')}`)}
        style={{ fontFamily: fonts.extrabold, fontSize: size, lineHeight: size + 8, letterSpacing: size / 30, marginTop: spacing.xs, fontVariant: ['tabular-nums'] }}>
        {c.slice(0, 4)}
        <Text color="textSecondary" style={{ fontFamily: fonts.extrabold, fontSize: size }}>
          {c.length > 4 ? '·' : ''}
        </Text>
        {c.slice(4)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Button testID="friends-share" title="Share link" size="md" full={false} style={{ flexGrow: 1 }} icon={<ShareIcon size={18} color={colors.onPrimary} strokeWidth={2.2} />} onPress={onShare} />
        <Button
          testID="friends-copy"
          title="Copy code"
          variant="secondary"
          size="md"
          full={false}
          style={{ flexGrow: 1 }}
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
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-incoming">
      {requests.map((r, i) => (
        <React.Fragment key={r.userId}>
          {i > 0 ? <Divider /> : null}
          {/* The buttons sit beside the name; a name too long for that line takes the row and the buttons go
              under it, at the right, so a name is never squeezed into a narrow column and split mid-word. */}
          <View
            testID={`friends-incoming-${idFor(r.userId)}`}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 64, paddingVertical: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>
              <PersonMark name={r.displayName} avatar={r.avatar} size={36} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={3} style={{ fontFamily: fonts.semibold }}>
                  {r.displayName}
                </Text>
                <Text variant="caption" color="textSecondary">
                  Wants to be friends
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' }}>
              <IconButton testID={`friends-decline-${idFor(r.userId)}`} size={36} accessibilityLabel={`Decline ${r.displayName}'s request`} disabled={busy === r.userId} onPress={() => onDecline(r)}>
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </IconButton>
              <Button testID={`friends-accept-${idFor(r.userId)}`} title="Accept" size="sm" full={false} loading={busy === r.userId} accessibilityLabel={`Accept ${r.displayName}`} onPress={() => onAccept(r)} />
            </View>
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
          {/* "Take back" sits beside the name; a name too long for that line takes the row and the button goes under it, at the right. */}
          <View testID={`friends-outgoing-${idFor(r.userId)}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>
              <PersonMark name={r.displayName} avatar={r.avatar} size={36} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={3} style={{ fontFamily: fonts.semibold }}>
                  {r.displayName}
                </Text>
                <Text variant="caption" color="textSecondary">
                  Waiting for them to accept
                </Text>
              </View>
            </View>
            <View style={{ marginLeft: 'auto' }}>
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
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

/** Cheers the user received: "Maya cheered your run", newest first (the cheers sheet). */
export function CheersList({ cheers, describe, when }: { cheers: CheerReceived[]; describe: (c: CheerReceived) => string; when: (c: CheerReceived) => string }) {
  const { colors, spacing } = useTheme();
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-cheers-list">
      {cheers.map((c, i) => (
        <React.Fragment key={`${c.fromUserId}-${c.ref}`}>
          {i > 0 ? <Divider inset={48} /> : null}
          <View testID={`friends-cheer-received-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm }}>
            <PersonMark name={c.displayName} avatar={c.avatar} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body">
                <Text variant="bodyStrong">{c.displayName}</Text>
                {` cheered ${describe(c)}`}
              </Text>
              {when(c) ? (
                <Text variant="caption" color="textSecondary">
                  {when(c)}
                </Text>
              ) : null}
            </View>
            <HandHeart size={18} color={colors.textSecondary} strokeWidth={1.9} />
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ profile fields

/**
 * A sharing switch as the kit's ToggleRow lays it out, but with its whole sentence: what a switch
 * shares is the point of the row, so it wraps to a third line in the set-up card rather than end in "…".
 */
export function SharingRow({ title, subtitle, value, onChange, testID }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
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
      <Toggle testID={testID} value={value} onChange={onChange} accessibilityLabel={title} />
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
      <SharingRow testID="friends-share-minutes" title="Active minutes" subtitle="Weekly total and sessions. Workout lengths show with recent workouts" value={sharing.minutes} onChange={(v) => onChange('minutes', v)} />
      <Divider />
      <SharingRow testID="friends-share-streak" title="Logging streak" subtitle="How many days in a row you have logged" value={sharing.streak} onChange={(v) => onChange('streak', v)} />
      <Divider />
      <SharingRow testID="friends-share-workouts" title="Recent workouts" subtitle="Name, length and distance from the last two weeks" value={sharing.workouts} onChange={(v) => onChange('workouts', v)} />
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
        Your weight and your day’s total are never shared, whatever you choose here. A meal leaves the phone when you show it.
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
  return (
    <View testID="friends-loading" accessibilityLabel={label} style={{ alignItems: 'center', paddingVertical: 48, gap: 12 }}>
      {/* The app's waiting cup (never a bare spinner), beside the words that say what is happening. */}
      <PourWait />
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}
