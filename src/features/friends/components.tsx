import { Copy, HandHeart, Lock, Mail, Plus, Share as ShareIcon, UserPlus, X } from 'lucide-react-native';
import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { PourWait } from '@/components/PourWait';

import { weekdayShort } from '@/lib/dates';
import { formatDistance } from '@/lib/units';
import { useFriends, type CheerReceived, type FriendRequest, type FriendWorkout, type SocialSharing } from '@/services/friends';
import { cupFor, fonts, useTheme } from '@/theme';
import type { ISODate, NoteReceived, UnitSystem } from '@/types';
import { Avatar, Button, Card, CupKey, decorative, Divider, figure, IconButton, MiniCup, Text, TextField, Toggle } from '@/ui';

import { friendTints, tintFor } from './avatar';

import { formatCode, normalizeCode } from './summary';
import { personMark, sharingSentence, type FriendDay } from './week';
import { addCupLabel, cheerCupLabel, ENTER_THEIR_CODE, INVITE_LINE, INVITE_TITLE, neverSharedLine, noteReceived } from './words';

/** Below this width (iPhone SE) the friend screens tighten up, as Today does. */
export function useNarrow(): boolean {
  return useWindowDimensions().width < 360;
}

/** Test ids carry a short, stable form of a user id. */
export const idFor = (userId: string) => userId.replace(/[^A-Za-z0-9-]/g, '').toLowerCase();

// ------------------------------------------------------------------ marks

/**
 * A person: a cup tile with their initials, always (never an emoji). With their user id the tile wears their own
 * soft tint (one of the theme's six, the same on every screen: `friendTints` over the person's friends, so the first
 * six friends differ, else `avatarTintKey`), initials in `avatarInk`; without one (the person's own preview) it is
 * the plain cup.
 */
export function PersonMark({ name, avatar, id, size = 44 }: { name: string; avatar: string; id?: string; size?: number }) {
  const { colors } = useTheme();
  const friends = useFriends((s) => s.overview?.friends);
  const tint = tintFor(id, friendTints(friends ?? []));
  const initials = personMark(name, avatar).text;
  if (!tint) return <Avatar initials={initials} size={size} />;
  return (
    <View testID={`person-mark-${tint}`} style={{ width: size, height: size, ...cupFor(size), backgroundColor: colors[tint], alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="h3" color="avatarInk" style={{ fontSize: size * 0.38, lineHeight: size * 0.5 }}>
        {initials}
      </Text>
    </View>
  );
}

/**
 * Cheer as a 36 px cup (44 to touch) in a feed row or a friend's list: the cheer mark, or once cheered the done
 * mark (the small filled ink cup, never a check). It shows no words, so its name says what it cheers.
 */
export function CheerCup({ cheered, what, onPress, testID }: { cheered: boolean; what: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <IconButton testID={testID} size={36} accessibilityLabel={cheerCupLabel(what, cheered)} onPress={cheered ? undefined : onPress}>
      {cheered ? <CupKey color={colors.text} size={12} /> : <HandHeart color={colors.text} size={18} />}
    </IconButton>
  );
}

/** "+" as a 36 px cup on a friend's meal: opens the meal's add step ("Add Maya's lunch to my diary"). */
export function AddCup({ what, onPress, testID }: { what: string; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <IconButton testID={testID} size={36} accessibilityLabel={addCupLabel(what)} onPress={onPress}>
      <Plus color={colors.text} size={18} />
    </IconButton>
  );
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

// ------------------------------------------------------------------ invite

/**
 * The empty Friends screen's card: inviting is the main action. "Invite a friend", one line, the user's own code
 * large and readable, Share link and Copy code, "Enter their code" (Add a friend, which also shows the QR code),
 * and what friends see. On the card surface (a tool, not a notice).
 */
export function InviteCard({ code, sharing, onShare, onCopy, onEnter }: { code: string; sharing: SocialSharing; onShare: () => void; onCopy: () => void; onEnter: () => void }) {
  const { colors, spacing } = useTheme();
  const size = useNarrow() ? 34 : 40;
  const c = normalizeCode(code);
  return (
    <Card padding={spacing.lg} testID="friends-empty">
      <View testID="friends-invite" style={{ gap: spacing.xs }}>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
          {INVITE_TITLE}
        </Text>
        <Text variant="body" color="textSecondary">
          {INVITE_LINE}
        </Text>
      </View>
      <Text variant="overline" color="textSecondary" style={{ marginTop: spacing.lg }}>
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
        <Button testID="friends-share" title="Share link" size="md" full={false} style={{ flexGrow: 1 }} icon={<ShareIcon color={colors.onPrimary} />} onPress={onShare} />
        <Button
          testID="friends-copy"
          title="Copy code"
          variant="secondary"
          size="md"
          full={false}
          style={{ flexGrow: 1 }}
          accessibilityLabel={`Copy code ${formatCode(c)}`}
          icon={<Copy color={colors.text} />}
          onPress={onCopy}
        />
      </View>
      <Button testID="friends-enter-code" title={ENTER_THEIR_CODE} variant="ghost" size="sm" full={false} style={{ alignSelf: 'center', marginTop: spacing.sm }} icon={<UserPlus color={colors.actionInk} />} onPress={onEnter} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
        {decorative(<Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 3 }} />)}
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
              <PersonMark name={r.displayName} avatar={r.avatar} id={r.userId} size={36} />
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
              <PersonMark name={r.displayName} avatar={r.avatar} id={r.userId} size={36} />
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
            <PersonMark name={c.displayName} avatar={c.avatar} id={c.fromUserId} size={36} />
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

/** Notes the user received: "Maya sent “Walk later?”", newest first (in the cheers sheet, above the cheers). */
export function NotesList({ notes, when }: { notes: NoteReceived[]; when: (n: NoteReceived) => string }) {
  const { colors, spacing } = useTheme();
  return (
    <Card padding={spacing.lg} style={{ paddingVertical: spacing.xs }} testID="friends-notes-list">
      <View {...(Platform.OS === 'web' ? ({ role: 'list' } as object) : null)}>
        {notes.map((n, i) => (
          <View key={n.id} {...(Platform.OS === 'web' ? ({ role: 'listitem' } as object) : null)}>
            {i > 0 ? <Divider inset={48} /> : null}
            <View testID={`friends-note-received-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm }}>
              <PersonMark name={n.displayName} avatar={n.avatar} id={n.userId} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body">
                  <Text variant="bodyStrong">{n.displayName}</Text>
                  {` ${noteReceived(n.kind)}`}
                </Text>
                {when(n) ? (
                  <Text variant="caption" color="textSecondary">
                    {when(n)}
                  </Text>
                ) : null}
              </View>
              {decorative(<Mail size={18} color={colors.textSecondary} strokeWidth={1.9} />)}
            </View>
          </View>
        ))}
      </View>
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

/** The three sharing switches, each saying exactly what it shows, and the sentence about what is never shared (`meals`: name meals, where they work). */
export function SharingSwitches({ sharing, onChange, meals = true }: { sharing: SocialSharing; onChange: (key: keyof SocialSharing, on: boolean) => void; meals?: boolean }) {
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
      <NeverShared meals={meals} />
    </View>
  );
}

export function NeverShared({ meals = true }: { meals?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
      <Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 2 }} />
      <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {neverSharedLine(meals)}
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
