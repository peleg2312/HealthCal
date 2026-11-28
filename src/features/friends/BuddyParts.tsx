/**
 * Logging together (proposal 4) and kind notes (proposal 6) on a friend's page.
 *
 * Logging together: one card above their week. Asked by them: Accept or a quiet decline. Together: the week as seven
 * small cups (full when both of you logged food that day, half when one of you did, empty when neither; a day still
 * to come or before the pair is a dashed cup), how many days together this week (and that a missed day was kept),
 * and the run. Never what or how much anyone ate, never whose day it was. Asked by you: waiting, with Take back.
 * Neither: a quiet row that opens what it is and "Ask <name>". Stopping is in the Manage sheet.
 *
 * Notes: under their week, the three fixed notes as buttons; one a day to each friend (the buttons say when it is
 * used up), five a day in all. No free text, nothing automatic.
 */
import { Handshake, Lock, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { withoutMarks } from '@/lib/bidi';
import { weekdayShort } from '@/lib/dates';
import { inviteBuddy, respondToBuddy, sendNote, stopBuddy, type Friend } from '@/services/friends';
import { fonts, useTheme } from '@/theme';
import type { Buddy, BuddyInvite, NoteKind, NoteSent } from '@/types';
import { Button, Card, CupKey, decorative, figure, haptic, IconButton, ListRow, MiniCup, Sheet, Text, toast } from '@/ui';

import { buddyCup, buddyDaysTogether, NOTE_KINDS, TOGETHER_RULES } from './together';
import {
  ACCEPT,
  BUDDY_EXPLAIN,
  BUDDY_TITLE,
  BUDDY_WAITING,
  buddyAcceptedToast,
  buddyAsk,
  BUDDY_ASK_LINE,
  buddyAskButton,
  buddyAskedTitle,
  buddyAskedToast,
  buddyDaySpoken,
  buddyDeclinedToast,
  buddyInviteTitle,
  buddyRunLine,
  buddyStoppedToast,
  buddyWeekLine,
  buddyWith,
  NOTE_WORDS,
  noteButtonLabel,
  NOTES_DAY_FULL,
  noteSentLine,
  noteSentToast,
  notesLine,
  noteTo,
  TAKE_BACK,
} from './words';

/** The week of a pair as seven small cups, one image to a screen reader per day. */
function BuddyWeek({ week }: { week: Extract<Buddy, { status: 'together' }>['week'] }) {
  const { colors } = useTheme();
  return (
    <View testID="buddy-week" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {week.map((d, i) => {
        const cup = buddyCup(d.count);
        return (
          <View key={d.day} testID={`buddy-day-${i}`} {...figure(buddyDaySpoken(weekdayShort(d.day), d.count))} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
            <MiniCup
              progress={cup === 'full' ? 1 : cup === 'half' ? 0.5 : 0}
              future={cup === 'none'}
              goalKind="reach"
              color={colors.calories}
              width={30}
              height={26}
              index={i}
              memoryKey={`buddy-${d.day}-${d.count}`}
            />
            <Text variant="caption" color="textSecondary">
              {weekdayShort(d.day).slice(0, 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** The card's title, a level-2 heading, with who it is with at its end. */
function BuddyHead({ name }: { name: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.md }}>
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {BUDDY_TITLE}
      </Text>
      <Text variant="caption" color="textSecondary">
        {buddyWith(name)}
      </Text>
    </View>
  );
}

/**
 * Logging together with this friend, in whichever state it is. Drawn only while the server has it; with three
 * pairs already (asks included) the row that offers a new one is left out.
 */
export function BuddyCard({ friend, buddy, invite, pairs }: { friend: Friend; buddy: Buddy | null; invite: BuddyInvite | null; pairs: number }) {
  const { colors, spacing } = useTheme();
  const name = friend.displayName;
  const [explain, setExplain] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const ask = async () => {
    setBusy('ask');
    const res = await inviteBuddy(friend.userId);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    setExplain(false);
    toast(res.value === 'accepted' ? buddyAcceptedToast(name) : buddyAskedToast(name));
  };
  const answer = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    const res = await respondToBuddy(friend.userId, accept);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    if (accept) haptic.success();
    else haptic.tap();
    setExplain(false);
    toast(accept ? buddyAcceptedToast(name) : buddyDeclinedToast(name));
  };
  const takeBack = async () => {
    setBusy('stop');
    const res = await stopBuddy(friend.userId);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.tap();
    toast(buddyStoppedToast(name));
  };

  // The explanation, shared by the ask and the accept: what each day shows and what never does.
  const explainSheet = (
    <Sheet
      visible={explain}
      onClose={() => setExplain(false)}
      title={invite ? buddyInviteTitle(name) : buddyAsk(name)}
      subtitle={BUDDY_ASK_LINE}
      footer={
        invite ? (
          <Button testID="buddy-accept-confirm" title={ACCEPT} loading={busy === 'accept'} onPress={() => void answer(true)} />
        ) : (
          <Button testID="buddy-ask-confirm" title={buddyAskButton(name)} accessibilityLabel={withoutMarks(buddyAskButton(name))} loading={busy === 'ask'} onPress={() => void ask()} />
        )
      }>
      <View testID="buddy-explain" style={{ flexDirection: 'row', gap: spacing.sm }}>
        {decorative(<Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 4 }} />)}
        <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
          {BUDDY_EXPLAIN}
        </Text>
      </View>
    </Sheet>
  );

  if (invite) {
    return (
      <Card testID="buddy-invite" padding={spacing.lg} style={{ paddingVertical: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 64 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0 }}>
            <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
              {buddyInviteTitle(name)}
            </Text>
            <Text variant="caption" color="textSecondary">
              {BUDDY_ASK_LINE}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' }}>
            <IconButton testID="buddy-decline" size={36} accessibilityLabel={`Decline, ${withoutMarks(buddyInviteTitle(name))}`} disabled={!!busy} onPress={() => void answer(false)}>
              <X size={18} color={colors.text} strokeWidth={2.2} />
            </IconButton>
            <Button testID="buddy-accept" title={ACCEPT} size="sm" full={false} accessibilityLabel={`${ACCEPT}, ${withoutMarks(buddyInviteTitle(name))}`} onPress={() => setExplain(true)} />
          </View>
        </View>
        {explainSheet}
      </Card>
    );
  }

  if (buddy?.status === 'together') {
    const both = buddyDaysTogether(buddy.week);
    return (
      <Card testID="buddy-card" style={{ gap: spacing.md }}>
        <BuddyHead name={name} />
        <BuddyWeek week={buddy.week} />
        <View>
          <Text variant="body" testID="buddy-week-line">
            {buddyWeekLine(both, buddy.kept)}
          </Text>
          <Text variant="caption" color="textSecondary" testID="buddy-run">
            {buddyRunLine(buddy.run)}
          </Text>
        </View>
      </Card>
    );
  }

  if (buddy?.status === 'asked') {
    return (
      <Card testID="buddy-asked" padding={spacing.lg} style={{ paddingVertical: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 56 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 0 }}>
            <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
              {buddyAskedTitle(name)}
            </Text>
            <Text variant="caption" color="textSecondary">
              {BUDDY_WAITING}
            </Text>
          </View>
          <View style={{ marginLeft: 'auto' }}>
            <Button testID="buddy-take-back" title={TAKE_BACK} variant="secondary" size="sm" full={false} accessibilityLabel={`${TAKE_BACK}, ${withoutMarks(buddyAskedTitle(name))}`} loading={busy === 'stop'} onPress={() => void takeBack()} />
          </View>
        </View>
      </Card>
    );
  }

  if (pairs >= TOGETHER_RULES.maxBuddies) return null;
  return (
    <Card padding={0} testID="buddy-offer">
      <ListRow testID="buddy-ask" style={{ paddingHorizontal: spacing.lg }} title={buddyAsk(name)} subtitle={BUDDY_ASK_LINE} left={<Handshake size={20} color={colors.text} />} chevron onPress={() => setExplain(true)} />
      {explainSheet}
    </Card>
  );
}

/**
 * Send this friend one of the three notes. Once today's is sent, its button wears the done mark and the others
 * wait, with a line that says so; after five notes today, all wait.
 */
export function NotesCard({ friend, sent }: { friend: Friend; sent: NoteSent[] }) {
  const { colors, spacing } = useTheme();
  const name = friend.displayName;
  const toThem = sent.find((n) => n.toUserId === friend.userId) ?? null;
  const dayFull = !toThem && sent.length >= TOGETHER_RULES.notesPerDay;
  const [busy, setBusy] = useState<NoteKind | null>(null);
  const send = async (kind: NoteKind) => {
    setBusy(kind);
    const res = await sendNote(friend.userId, kind);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    toast(noteSentToast(name));
  };
  return (
    <Card testID="notes-card" style={{ gap: spacing.md }}>
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {noteTo(name)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {NOTE_KINDS.map((kind) => {
          const isSent = toThem?.kind === kind;
          return (
            <Button
              key={kind}
              testID={`note-${kind}`}
              title={NOTE_WORDS[kind]}
              variant="secondary"
              size="sm"
              full={false}
              accessibilityLabel={noteButtonLabel(kind, withoutMarks(name), isSent)}
              icon={isSent ? <CupKey color={colors.text} size={12} /> : undefined}
              disabled={!!toThem || dayFull || (!!busy && busy !== kind)}
              loading={busy === kind}
              onPress={() => void send(kind)}
            />
          );
        })}
      </View>
      <Text variant="body" color="textSecondary" testID="notes-line">
        {toThem ? noteSentLine(toThem.kind) : dayFull ? NOTES_DAY_FULL : notesLine(name)}
      </Text>
    </Card>
  );
}
