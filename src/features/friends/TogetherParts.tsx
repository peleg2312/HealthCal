/**
 * "Together this week" on Friends (proposal 3): one circle of 2 to 6 people and one cup. The card shows the
 * circle's total poured into one Vessel (`goalKind="reach"`: brim-full with the brim line once the goal is reached,
 * the one flash as it is crossed on screen), who is in it by name (you last) and the days to go; never one person's
 * figure, never an order. Its sheet holds the people (alphabetical, by name only), who was asked, last week's cup
 * said once, the goal to change, more friends to ask and, quiet and last, Leave. Starting a circle and joining one
 * say first, plainly, what counts and what the others see (a circle of two gives your figure away). Under 18 the
 * days-logged circle is never offered. Everything hides while the server has no circles (`togetherAvailable`).
 */
import { Lock, Users, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { withoutMarks } from '@/lib/bidi';
import { formatNumber } from '@/lib/units';
import { cheerTogether, inviteToTogether, leaveTogether, respondToTogether, setTogetherTarget, startTogether, type Friend } from '@/services/friends';
import { fonts, useLargeText, useTheme } from '@/theme';
import type { ISODate, TogetherCircle, TogetherInvite, TogetherKind } from '@/types';
import { Button, Card, Chip, ChipWrap, ConfirmSheet, decorative, Divider, figure, haptic, IconButton, ListRow, PressableScale, Segmented, Sheet, Text, toast, Vessel } from '@/ui';

import { idFor, PersonMark } from './components';
import { itemRole, listRole } from './FeedParts';
import { daysLeftInWeek, TOGETHER_RULES, togetherGoalChoices, togetherProgress } from './together';
import {
  ASK_MORE,
  askButton,
  askedLine,
  CHANGE_GOAL,
  CHEER_EVERYONE,
  cheeredEveryoneToast,
  circleDeclinedToast,
  circleInviteLine,
  circleInviteTitle,
  circleLine,
  circleNames,
  countsLine,
  declineCircleLabel,
  GOAL_FOR_WEEK,
  GOAL_FROM_THIS_WEEK,
  GOAL_NOTE,
  goalChoice,
  goalSavedToast,
  IN_THE_CIRCLE,
  JOIN,
  JOIN_TITLE,
  JOINED_TOAST,
  lastWeekLine,
  LEAVE_ANY_TIME,
  LEAVE_CIRCLE,
  LEAVE_CIRCLE_NOTE,
  NAMES_NOTE,
  OUT_OF_CIRCLE,
  SAVE_GOAL,
  SEEN_NOTE,
  startedToast,
  TOGETHER_OPEN,
  TOGETHER_REACHED,
  TOGETHER_START,
  TOGETHER_START_LINE,
  TOGETHER_TITLE,
  togetherKindWord,
  togetherSpoken,
  togetherUnit,
  WHAT_FILLS,
  WHO_TO_ASK,
  WHO_TO_ASK_NOTE,
} from './words';

const CUP_W = 56;
const CUP_H = 72;

/** The cup's data colour: workouts' for minutes, the calorie colour for days with food logged. */
function useKindColor(kind: TogetherKind): string {
  const { colors } = useTheme();
  return kind === 'minutes' ? colors.exercise : colors.calories;
}

/** What joining means, before anyone joins or starts: what counts, what the others see, and that leaving is quiet. */
function WhatCounts({ kind, testID }: { kind: TogetherKind; testID: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: spacing.sm }}>
      {decorative(<Lock size={14} color={colors.textSecondary} strokeWidth={2} style={{ marginTop: 4 }} />)}
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text variant="body" color="textSecondary">
          {countsLine(kind)}
        </Text>
        <Text variant="body" color="textSecondary">
          {SEEN_NOTE}
        </Text>
        <Text variant="body" color="textSecondary">
          {LEAVE_ANY_TIME}
        </Text>
      </View>
    </View>
  );
}

/** A small heading inside a sheet. */
function Overline({ children }: { children: string }) {
  return (
    <Text variant="overline" color="textSecondary" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
      {children}
    </Text>
  );
}

/** Pick friends as chips, at most `max` (the chips past it wait until one is let go). */
function FriendChips({ friends, picked, onChange, max, testID }: { friends: Friend[]; picked: ReadonlySet<string>; onChange: (next: Set<string>) => void; max: number; testID: string }) {
  return (
    <ChipWrap>
      {friends.map((f) => (
        <Chip
          key={f.userId}
          testID={`${testID}-${idFor(f.userId)}`}
          label={f.displayName}
          accessibilityLabel={withoutMarks(f.displayName)}
          selected={picked.has(f.userId)}
          onPress={() => {
            const next = new Set(picked);
            if (next.has(f.userId)) next.delete(f.userId);
            else if (next.size < max) next.add(f.userId);
            onChange(next);
          }}
        />
      ))}
    </ChipWrap>
  );
}

/** The circle's cup and figures: one element to a screen reader, its units in full. */
function CircleCup({ circle }: { circle: TogetherCircle }) {
  const { spacing } = useTheme();
  const color = useKindColor(circle.kind);
  const { reached } = togetherProgress(circle);
  return (
    <View testID="together-cup" {...figure(togetherSpoken(circle.kind, circle.total, circle.target, reached))} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg }}>
      <Vessel
        value={circle.total}
        max={Math.max(1, circle.target)}
        goalKind="reach"
        color={color}
        width={CUP_W}
        height={CUP_H}
        memoryKey={`together-${circle.id}-${circle.week}`}
        onReached={() => haptic.success()}
      />
      <View style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
        <Text variant="numL" tabular testID="together-total">
          {formatNumber(circle.total)}
          <Text variant="unit" color="textSecondary">{` of ${formatNumber(circle.target)} ${togetherUnit(circle.kind)}`}</Text>
        </Text>
        {reached ? (
          <Text variant="caption" color="textSecondary" testID="together-reached">
            {TOGETHER_REACHED}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The circle on Friends: the title, who and the week, the cup, then Cheer everyone and the circle's sheet. */
function CircleCard({ circle, today, friendIds, onOpen }: { circle: TogetherCircle; today: ISODate; friendIds: ReadonlySet<string>; onOpen: () => void }) {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const others = circle.members.filter((m) => !m.me).map((m) => m.displayName);
  const { reached } = togetherProgress(circle);
  const cheerable = circle.members.some((m) => !m.me && friendIds.has(m.userId));
  const [busy, setBusy] = useState(false);
  const cheer = async () => {
    setBusy(true);
    const res = await cheerTogether(circle, today);
    setBusy(false);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    toast(cheeredEveryoneToast(res.value.sent));
  };
  return (
    <Card testID="together-card" style={{ gap: spacing.md }}>
      <View>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
          {TOGETHER_TITLE}
        </Text>
        <Text variant="caption" color="textSecondary" testID="together-line">
          {circleLine(others, daysLeftInWeek(circle.week, today), reached)}
        </Text>
      </View>
      <CircleCup circle={circle} />
      <View style={{ flexDirection: large ? 'column' : 'row', gap: spacing.sm }}>
        {cheerable ? (
          <Button testID="together-cheer" title={CHEER_EVERYONE} variant="secondary" size="sm" full={large} style={large ? undefined : { flex: 1 }} loading={busy} onPress={() => void cheer()} />
        ) : null}
        <Button testID="together-open" title={TOGETHER_OPEN} variant="ghost" size="sm" full={large} style={large ? undefined : { flex: 1 }} icon={<Users color={colors.actionInk} />} onPress={onOpen} />
      </View>
    </Card>
  );
}

/** The circle's sheet: who is in it, who was asked, last week, the goal, more friends to ask, and Leave. */
function CircleSheet({ circle, friends, visible, onClose, onLeave }: { circle: TogetherCircle; friends: Friend[]; visible: boolean; onClose: () => void; onLeave: () => void }) {
  const { spacing } = useTheme();
  const others = circle.members.filter((m) => !m.me).map((m) => m.displayName);
  const choices = [...new Set([...togetherGoalChoices(circle.kind, circle.members.length, circle.lastWeek?.total), circle.target])].sort((a, b) => a - b);
  const [goal, setGoal] = useState(circle.target);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const key = visible ? `${circle.id}|${circle.target}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    setGoal(circle.target);
    setAsk(new Set());
  }
  const inIt = new Set([...circle.members.map((m) => m.userId), ...circle.asked]);
  const room = TOGETHER_RULES.maxPeople - inIt.size;
  const askable = friends.filter((f) => !inIt.has(f.userId));
  const asked = circle.asked.map((id) => friends.find((f) => f.userId === id)?.displayName).filter((n): n is string => !!n);
  const pickedNames = askable.filter((f) => ask.has(f.userId)).map((f) => f.displayName);

  const saveGoal = async () => {
    setBusy('goal');
    const res = await setTogetherTarget(circle.id, goal);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    toast(goalSavedToast(circle.kind, goal));
  };
  const askMore = async () => {
    setBusy('ask');
    const res = await inviteToTogether(circle.id, [...ask]);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    setAsk(new Set());
    toast(startedToast(pickedNames));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={TOGETHER_TITLE} subtitle={circleNames(others)}>
      <View testID="together-sheet" style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <Overline>{IN_THE_CIRCLE}</Overline>
          <View {...listRole}>
            {circle.members.map((m, i) => (
              <View key={m.userId} {...itemRole}>
                {i > 0 ? <Divider inset={48} /> : null}
                <View testID={`together-member-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: 6 }}>
                  <PersonMark name={m.displayName} avatar={m.avatar} id={m.me ? undefined : m.userId} size={36} />
                  <Text variant="bodyStrong" style={{ flex: 1, fontFamily: fonts.semibold }}>
                    {m.me ? 'You' : m.displayName}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <Text variant="body" color="textSecondary" testID="together-names-note">
            {NAMES_NOTE}
          </Text>
          {asked.length ? (
            <Text variant="body" color="textSecondary" testID="together-asked">
              {askedLine(asked)}
            </Text>
          ) : null}
          {circle.lastWeek ? (
            <Text variant="body" color="textSecondary" testID="together-last-week">
              {lastWeekLine(circle.kind, circle.lastWeek.total, circle.lastWeek.target)}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Overline>{CHANGE_GOAL}</Overline>
          <Segmented
            testID="together-goal"
            role="radiogroup"
            accessibilityLabel={CHANGE_GOAL}
            options={choices.map((c) => ({ value: String(c), label: goalChoice(circle.kind, c) }))}
            value={String(goal)}
            onChange={(v) => setGoal(Number(v))}
          />
          <Text variant="body" color="textSecondary">
            {GOAL_FROM_THIS_WEEK}
          </Text>
          <Button testID="together-goal-save" title={SAVE_GOAL} variant="secondary" size="sm" full={false} style={{ alignSelf: 'flex-start' }} disabled={goal === circle.target} loading={busy === 'goal'} onPress={() => void saveGoal()} />
        </View>

        {askable.length && room > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Overline>{ASK_MORE}</Overline>
            <FriendChips friends={askable} picked={ask} onChange={setAsk} max={room} testID="together-ask" />
            <Button testID="together-ask-send" title={askButton(pickedNames)} variant="secondary" size="sm" full={false} style={{ alignSelf: 'flex-start' }} disabled={!ask.size} loading={busy === 'ask'} onPress={() => void askMore()} />
          </View>
        ) : null}

        <Divider />
        {/* Quiet and last: words in the danger colour, confirmed before anything happens. */}
        <PressableScale
          testID="together-leave"
          focusRing="inside"
          accessibilityLabel={`${LEAVE_CIRCLE}. ${LEAVE_CIRCLE_NOTE}`}
          onPress={onLeave}
          style={{ minHeight: 56, paddingVertical: spacing.sm, justifyContent: 'center' }}>
          <Text variant="bodyStrong" color="danger">
            {LEAVE_CIRCLE}
          </Text>
          <Text variant="caption" color="textSecondary">
            {LEAVE_CIRCLE_NOTE}
          </Text>
        </PressableScale>
      </View>
    </Sheet>
  );
}

/** Start a circle: what fills it (days logged only for 18 and over), who to ask, the goal, and what joining means. */
function StartSheet({ visible, friends, adult, onClose }: { visible: boolean; friends: Friend[]; adult: boolean; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const [kind, setKind] = useState<TogetherKind>('minutes');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState(1);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) {
      setKind('minutes');
      setPicked(new Set());
      setChoice(1);
      setBusy(false);
    }
  }
  const choices = togetherGoalChoices(kind, picked.size + 1);
  const target = choices[Math.min(choice, choices.length - 1)];
  const names = friends.filter((f) => picked.has(f.userId)).map((f) => f.displayName);

  const start = async () => {
    if (!picked.size) return;
    setBusy(true);
    const res = await startTogether({ kind, target, invite: [...picked] });
    setBusy(false);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    onClose();
    toast(startedToast(names));
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={TOGETHER_START}
      subtitle={TOGETHER_START_LINE}
      footer={<Button testID="together-start-confirm" title={askButton(names)} icon={<Users color={colors.onPrimary} />} disabled={!picked.size} loading={busy} onPress={() => void start()} />}>
      <View testID="together-start-sheet" style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <Overline>{WHAT_FILLS}</Overline>
          {adult ? (
            <Segmented
              testID="together-kind"
              role="radiogroup"
              accessibilityLabel={WHAT_FILLS}
              options={(['minutes', 'days'] as const).map((k) => ({ value: k, label: togetherKindWord(k) }))}
              value={kind}
              onChange={(v) => setKind(v as TogetherKind)}
            />
          ) : (
            <Text variant="bodyStrong" testID="together-kind-minutes">
              {togetherKindWord('minutes')}
            </Text>
          )}
        </View>
        <View style={{ gap: spacing.sm }}>
          <Overline>{WHO_TO_ASK}</Overline>
          <FriendChips friends={friends} picked={picked} onChange={setPicked} max={TOGETHER_RULES.maxPeople - 1} testID="together-who" />
          <Text variant="body" color="textSecondary">
            {WHO_TO_ASK_NOTE}
          </Text>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Overline>{GOAL_FOR_WEEK}</Overline>
          <Segmented
            testID="together-start-goal"
            role="radiogroup"
            accessibilityLabel={GOAL_FOR_WEEK}
            options={choices.map((c, i) => ({ value: String(i), label: goalChoice(kind, c) }))}
            value={String(Math.min(choice, choices.length - 1))}
            onChange={(v) => setChoice(Number(v))}
          />
          <Text variant="body" color="textSecondary">
            {GOAL_NOTE}
          </Text>
        </View>
        <WhatCounts kind={kind} testID="together-start-counts" />
      </View>
    </Sheet>
  );
}

/** An invitation: who asks, the goal and who is in it; Join opens the step that says what joining means. */
function InviteCard({ invite, onJoin, onDecline, busy }: { invite: TogetherInvite; onJoin: () => void; onDecline: () => void; busy: boolean }) {
  const { colors, spacing } = useTheme();
  const from = invite.from.displayName;
  return (
    <Card testID={`together-invite-${idFor(invite.id)}`} padding={spacing.lg} style={{ paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: spacing.sm, minHeight: 64 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0 }}>
          <PersonMark name={from} avatar={invite.from.avatar} id={invite.from.userId} size={36} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
              {circleInviteTitle(from)}
            </Text>
            <Text variant="caption" color="textSecondary">
              {circleInviteLine(invite.kind, invite.target, invite.members.map((m) => m.displayName))}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' }}>
          <IconButton testID="together-invite-decline" size={36} accessibilityLabel={declineCircleLabel(withoutMarks(from))} disabled={busy} onPress={onDecline}>
            <X size={18} color={colors.text} strokeWidth={2.2} />
          </IconButton>
          <Button testID="together-invite-join" title={JOIN} size="sm" full={false} accessibilityLabel={`${JOIN}, ${withoutMarks(circleInviteTitle(from))}`} onPress={onJoin} />
        </View>
      </View>
    </Card>
  );
}

/** The join step: what counts, what the others see, then Join. */
function JoinSheet({ invite, onClose }: { invite: TogetherInvite | null; onClose: () => void }) {
  const { spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const join = async () => {
    if (!invite) return;
    setBusy(true);
    const res = await respondToTogether(invite.id, true);
    setBusy(false);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.success();
    onClose();
    toast(JOINED_TOAST);
  };
  return (
    <Sheet
      visible={!!invite}
      onClose={onClose}
      title={JOIN_TITLE}
      subtitle={invite ? circleInviteLine(invite.kind, invite.target, []) : ''}
      footer={invite ? <Button testID="together-join-confirm" title={JOIN} loading={busy} onPress={() => void join()} /> : null}>
      {invite ? (
        <View testID="together-join-sheet" style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.sm }}>
            <Overline>{IN_THE_CIRCLE}</Overline>
            <Text variant="body">{circleNames(invite.members.map((m) => m.displayName))}</Text>
          </View>
          <WhatCounts kind={invite.kind} testID="together-join-counts" />
        </View>
      ) : null}
    </Sheet>
  );
}

/**
 * Everything of "Together this week" on Friends, under the people row: invitations first, then the circle, or a
 * quiet row that starts one. Drawn only while the server has circles and the person has a friend.
 */
export function TogetherSection({
  circles,
  invites,
  friends,
  adult,
  today,
}: {
  circles: TogetherCircle[];
  invites: TogetherInvite[];
  friends: Friend[];
  adult: boolean;
  today: ISODate;
}) {
  const { colors, spacing } = useTheme();
  const circle = circles[0] ?? null;
  const [sheet, setSheet] = useState<'circle' | 'start' | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [joining, setJoining] = useState<TogetherInvite | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const friendIds = new Set(friends.map((f) => f.userId));

  const decline = async (inv: TogetherInvite) => {
    setBusy(inv.id);
    const res = await respondToTogether(inv.id, false);
    setBusy(null);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.tap();
    toast(circleDeclinedToast(inv.from.displayName));
  };
  const leave = async () => {
    setConfirmLeave(false);
    if (!circle) return;
    const res = await leaveTogether(circle.id);
    if (!res.ok) {
      haptic.warn();
      toast(res.message);
      return;
    }
    haptic.tap();
    toast(OUT_OF_CIRCLE);
  };

  return (
    <View style={{ gap: spacing.lg }} testID="together">
      {invites.map((inv) => (
        <InviteCard key={inv.id} invite={inv} busy={busy === inv.id} onJoin={() => setJoining(inv)} onDecline={() => void decline(inv)} />
      ))}
      {circle ? (
        <CircleCard circle={circle} today={today} friendIds={friendIds} onOpen={() => setSheet('circle')} />
      ) : (
        <Card padding={0} testID="together-start-card">
          <ListRow
            testID="together-start-open"
            style={{ paddingHorizontal: spacing.lg }}
            title={TOGETHER_START}
            subtitle={TOGETHER_START_LINE}
            left={<Users size={20} color={colors.text} />}
            chevron
            onPress={() => setSheet('start')}
          />
        </Card>
      )}
      {circle ? (
        <CircleSheet
          circle={circle}
          friends={friends}
          visible={sheet === 'circle'}
          onClose={() => setSheet(null)}
          onLeave={() => {
            setSheet(null);
            setConfirmLeave(true);
          }}
        />
      ) : null}
      <StartSheet visible={sheet === 'start'} friends={friends} adult={adult} onClose={() => setSheet(null)} />
      <JoinSheet invite={joining} onClose={() => setJoining(null)} />
      <ConfirmSheet visible={confirmLeave} title={`${LEAVE_CIRCLE}?`} message={LEAVE_CIRCLE_NOTE} confirmLabel={LEAVE_CIRCLE} destructive onConfirm={() => void leave()} onCancel={() => setConfirmLeave(false)} />
    </View>
  );
}
