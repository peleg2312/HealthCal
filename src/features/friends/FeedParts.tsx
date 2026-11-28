/**
 * The Friends screen's parts: the row of people with Invite at its end, the cheers chip beside "Recent", and the
 * feed as one card per day of compact rows (one row per meal or workout: who and what (two lines at most), the foods'
 * heads or the length under it, Cheer and, on a meal, "+" as small cups at the end). Every person is an
 * initials cup in their own tint; a short level line inside a cup means something new since the last look.
 * Nothing here shows a figure beside another person's, so nothing reads as a league table.
 *
 * "Together this week" (`TogetherParts`) sits between the people row and "Recent", in the screen's own order.
 */
import { HandHeart, UserPlus } from 'lucide-react-native';
import React from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { MEAL_LABEL } from '@/lib/nutrition';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { cupFor, fonts, useLargeText, useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Button, Card, Divider, DECORATIVE, figure, PressableScale, Text } from '@/ui';

import { AddCup, CheerCup, idFor, PersonMark, workoutTitle } from './components';
import type { FeedItem } from './contract';
import { feedKey, type FeedDay } from './feed';
import { mealFoodsLine } from './MealCard';
import { dayLabel } from './week';
import { cheersChipLabel, cheersNotesLabel, cheersNotesTitle, INVITE, INVITE_OPEN, itemWhat, RECENT } from './words';

const CUP = 56;
const CELL = 72;

/** On the web a list and its items are a list to a screen reader (`role`), natively plain views. */
export const listRole = Platform.OS === 'web' ? ({ role: 'list' } as const) : null;
export const itemRole = Platform.OS === 'web' ? ({ role: 'listitem' } as const) : null;

/** One person in the row: their initials cup, the level line inside it when something is new, the name under it. */
function PersonCell({ userId, name, avatar, isNew, onPress, testID }: { userId: string; name: string; avatar: string; isNew: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel={`${withoutMarks(name)}${isNew ? ', something new' : ''}. Open their page`} style={{ width: CELL, alignItems: 'center', gap: 6 }}>
      <View>
        <PersonMark name={name} avatar={avatar} id={userId} size={CUP} />
        {isNew ? (
          // The level line, low inside the cup: something new since the last look. Never a number.
          <View testID={`${testID}-new`} pointerEvents="none" style={{ position: 'absolute', left: CUP / 2 - 12, width: 24, bottom: 10, height: 3, borderRadius: 1.5, backgroundColor: colors.rim }} />
        ) : null}
      </View>
      <Text variant="caption" color="text" numberOfLines={1} style={{ maxWidth: CELL, textAlign: 'center' }}>
        {isolateRtl(name)}
      </Text>
    </PressableScale>
  );
}

/** The last cup of the row: an empty dashed cup with the add-person mark, "Invite" (Add a friend: your invite and their code). */
function InviteCell({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale testID="friends-add-open" onPress={onPress} accessibilityLabel={`${INVITE}. ${INVITE_OPEN}`} style={{ width: CELL, alignItems: 'center', gap: 6 }}>
      <View style={{ width: CUP, height: CUP, ...cupFor(CUP), borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dashEdge, alignItems: 'center', justifyContent: 'center' }}>
        <UserPlus size={22} color={colors.text} strokeWidth={1.9} {...DECORATIVE} />
      </View>
      <Text variant="caption" color="text" numberOfLines={1}>
        {INVITE}
      </Text>
    </PressableScale>
  );
}

/** One row of people that scrolls sideways when it is long, "Invite" always last. The header's line counts them. */
export function PeopleRow({ people, newIds, onOpen, onAdd }: { people: { userId: string; displayName: string; avatar: string }[]; newIds: ReadonlySet<string>; onOpen: (userId: string) => void; onAdd: () => void }) {
  return (
    <View testID="friends-people">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20 - (CELL - CUP) / 2, gap: 4 }}>
        <View {...listRole} {...(Platform.OS === 'web' ? ({ 'aria-label': `Your friends, ${people.length}` } as object) : null)} style={{ flexDirection: 'row', gap: 4 }}>
          {people.map((p) => (
            <View key={p.userId} {...itemRole}>
              <PersonCell userId={p.userId} name={p.displayName} avatar={p.avatar} isNew={newIds.has(p.userId)} onPress={() => onOpen(p.userId)} testID={`friends-person-${idFor(p.userId)}`} />
            </View>
          ))}
          <View {...itemRole}>
            <InviteCell onPress={onAdd} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** "Recent", a level-2 heading, with the cheers and notes received as one chip at its end ("3 cheers for you", "2 cheers · 1 note") that opens the list. */
export function RecentTitle({ cheers, notes = 0, onCheers }: { cheers: number; notes?: number; onCheers: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.sm, marginTop: 4 }}>
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {RECENT}
      </Text>
      {cheers + notes > 0 ? (
        <View testID="friends-cheers" style={{ marginLeft: 'auto' }}>
          <Button
            testID="friends-cheers-open"
            title={cheersNotesTitle(cheers, notes)}
            variant="secondary"
            size="sm"
            full={false}
            accessibilityLabel={notes ? cheersNotesLabel(cheers, notes) : cheersChipLabel(cheers)}
            icon={<HandHeart color={colors.text} />}
            onPress={onCheers}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A feed row's two lines: "Maya · Lunch" and the foods' heads, or "Maya · Running 7.2 km" and "42 min". */
function rowLines(item: FeedItem, units: UnitSystem): { what: string; detail: string } {
  if (item.kind === 'meal') return { what: MEAL_LABEL[item.meal], detail: mealFoodsLine(item.items) };
  const w = { id: item.ref, name: item.name, emoji: item.emoji, minutes: item.minutes, date: item.day, ...(item.distanceKm ? { distanceKm: item.distanceKm } : null) };
  return { what: workoutTitle(w, units), detail: typeof item.minutes === 'number' ? `${item.minutes} min` : '' };
}

/**
 * One meal or workout: the person's cup, who and what, one line under it (cut to one line; the meal's sheet has
 * every food and portion), then Cheer and, on a meal, "+" as 36 px cups (siblings of the row, never inside it).
 * A meal's row opens its sheet; a workout's opens the friend's page. With large text the cups go under the words.
 */
export function FeedRow({
  item,
  units,
  testID,
  onOpen,
  onCheer,
  onAdd,
  today,
  cheerTestID,
}: {
  item: FeedItem;
  units: UnitSystem;
  testID: string;
  onOpen?: () => void;
  onCheer: () => void;
  onAdd?: () => void;
  /** On a friend's own page: no cup and no name, and the day after what ("Breakfast · Today"). */
  today?: ISODate;
  /** The Cheer cup's own test id, where it keeps an older one (`<testID>-cheer` by default). */
  cheerTestID?: string;
}) {
  const { spacing } = useTheme();
  const large = useLargeText();
  const lines = rowLines(item, units);
  const what = today ? `${lines.what} · ${dayLabel(item.day, today)}` : lines.what;
  const { detail } = lines;
  const who = withoutMarks(item.displayName);
  const target = itemWhat(who, item.kind === 'meal' ? { kind: 'meal', meal: item.meal } : { kind: 'workout', name: item.name });
  const drawn = today ? withoutMarks(what) : `${who} · ${withoutMarks(what)}`;
  const spoken = `${drawn}${detail ? `, ${withoutMarks(detail)}` : ''}${onOpen ? `. ${item.kind === 'meal' ? 'Open the meal' : `Open ${who}’s page`}` : ''}`;
  const words = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="body" numberOfLines={large ? 4 : 2}>
        {today ? null : (
          <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(item.displayName)}
          </Text>
        )}
        {today ? what : ` · ${what}`}
      </Text>
      {detail ? (
        <Text variant="caption" color="textSecondary" numberOfLines={large ? 3 : 1} testID={`${testID}-detail`}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
  const body = { flex: large ? undefined : 1, flexBasis: large ? ('100%' as const) : undefined, minWidth: 0, flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm, paddingLeft: spacing.lg };
  const main = onOpen ? (
    <PressableScale testID={`${testID}-open`} onPress={onOpen} focusRing="inside" scaleTo={0.99} accessibilityLabel={spoken} style={body}>
      {today ? null : <PersonMark name={item.displayName} avatar={item.avatar} id={item.userId} size={36} />}
      {words}
    </PressableScale>
  ) : (
    <View style={body} {...figure(spoken)}>
      {today ? null : <PersonMark name={item.displayName} avatar={item.avatar} id={item.userId} size={36} />}
      {words}
    </View>
  );
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: large ? 'wrap' : 'nowrap', alignItems: 'center', columnGap: spacing.sm, paddingRight: spacing.lg, paddingBottom: large ? spacing.sm : 0 }}>
      {main}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginLeft: large ? 'auto' : 0 }}>
        <CheerCup testID={cheerTestID ?? `${testID}-cheer`} cheered={item.cheered} what={target} onPress={onCheer} />
        {item.kind === 'meal' && onAdd ? <AddCup testID={`${testID}-add`} what={target} onPress={onAdd} /> : null}
      </View>
    </View>
  );
}

/** One day of the feed: its name as a small heading ("Today", "Yesterday", "Thursday") over one card of rows. */
export function FeedDayCard({ day, today, children, testID }: { day: FeedDay; today: ISODate; children: (item: FeedItem, index: number) => React.ReactNode; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <Text variant="label" color="textSecondary" accessibilityRole="header" {...({ 'aria-level': 3 } as object)}>
        {dayLabel(day.day, today)}
      </Text>
      <Card padding={0}>
        <View {...listRole}>
          {day.items.map((item, i) => (
            <View key={feedKey(item)} {...itemRole}>
              {i > 0 ? <Divider inset={spacing.lg} /> : null}
              {children(item, i)}
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
