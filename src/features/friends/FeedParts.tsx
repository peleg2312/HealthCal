/**
 * The Friends screen's parts: the row of people with Add at its end, the one-line cheers card, a shown
 * workout's card and the quiet card about what friends see of you. Every person is an initials cup; a
 * short level line inside a cup means something new since the last look. Nothing here shows a figure
 * beside another person's, so nothing reads as a league table.
 */
import { ChevronRight, Copy, HandHeart, Lock, UserPlus } from 'lucide-react-native';
import React from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { RowEmoji } from '@/features/food/components';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { cupFor, fonts, useLargeText, useTheme } from '@/theme';
import type { ISODate, UnitSystem } from '@/types';
import { Avatar, Button, Card, decorative, DECORATIVE, PressableScale, Text } from '@/ui';

import { CheerButton, idFor, PersonMark, workoutMeta, workoutTitle } from './components';
import type { FeedWorkout } from './contract';
import { formatCode } from './summary';
import { personMark } from './week';
import { ABOUT_YOU, ADD, ADD_FRIEND, cheersTitle, PRIVACY } from './words';

const CUP = 56;
const CELL = 72;

/** On the web a list and its items are a list to a screen reader (`role`), natively plain views. */
export const listRole = Platform.OS === 'web' ? ({ role: 'list' } as const) : null;
export const itemRole = Platform.OS === 'web' ? ({ role: 'listitem' } as const) : null;

/** One person in the row: their initials cup, the level line inside it when something is new, the name under it. */
function PersonCell({ name, avatar, isNew, onPress, testID }: { name: string; avatar: string; isNew: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityLabel={`${withoutMarks(name)}${isNew ? ', something new' : ''}. Open their page`} style={{ width: CELL, alignItems: 'center', gap: 6 }}>
      <View>
        <Avatar initials={personMark(name, avatar).text} size={CUP} />
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

/** The last cup of the row: an empty dashed cup with the add-person mark, "Add". */
function AddCell({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale testID="friends-add-open" onPress={onPress} accessibilityLabel={ADD_FRIEND} style={{ width: CELL, alignItems: 'center', gap: 6 }}>
      <View style={{ width: CUP, height: CUP, ...cupFor(CUP), borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dashEdge, alignItems: 'center', justifyContent: 'center' }}>
        <UserPlus size={22} color={colors.text} strokeWidth={1.9} {...DECORATIVE} />
      </View>
      <Text variant="caption" color="text" numberOfLines={1}>
        {ADD}
      </Text>
    </PressableScale>
  );
}

/** "Your friends · 3", then one row of people that scrolls sideways when it is long, "Add" always last. */
export function PeopleRow({ people, newIds, onOpen, onAdd }: { people: { userId: string; displayName: string; avatar: string }[]; newIds: ReadonlySet<string>; onOpen: (userId: string) => void; onAdd: () => void }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }} testID="friends-people">
      <Text variant="overline" color="textSecondary" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {`Your friends · ${people.length}`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20 - (CELL - CUP) / 2, gap: 4 }}>
        <View {...listRole} style={{ flexDirection: 'row', gap: 4 }}>
          {people.map((p) => (
            <View key={p.userId} {...itemRole}>
              <PersonCell name={p.displayName} avatar={p.avatar} isNew={newIds.has(p.userId)} onPress={() => onOpen(p.userId)} testID={`friends-person-${idFor(p.userId)}`} />
            </View>
          ))}
          <View {...itemRole}>
            <AddCell onPress={onAdd} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** One row for the cheers received: how many, and who cheered what; a tap opens the list. */
export function CheersLine({ count, summary, onPress }: { count: number; summary: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Card padding={0} testID="friends-cheers">
      <PressableScale
        testID="friends-cheers-open"
        onPress={onPress}
        focusRing="inside"
        accessibilityLabel={`${cheersTitle(count)}. ${withoutMarks(summary)}. See all`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 64 }}>
        <Avatar size={40}>{decorative(<HandHeart size={20} color={colors.primaryInk} strokeWidth={1.9} />)}</Avatar>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" style={{ fontFamily: fonts.semibold }}>
            {cheersTitle(count)}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {summary}
          </Text>
        </View>
        {decorative(<ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />)}
      </PressableScale>
    </Card>
  );
}

/** A friend's shared workout in the feed: who, the activity and distance, the day and length, and Cheer beside it. */
export function FeedWorkoutCard({ item, today, units, onCheer, testID }: { item: FeedWorkout; today: ISODate; units: UnitSystem; onCheer: () => void; testID: string }) {
  const { spacing } = useTheme();
  const large = useLargeText();
  const w = { id: item.ref, name: item.name, emoji: item.emoji, minutes: item.minutes, date: item.day, ...(item.distanceKm ? { distanceKm: item.distanceKm } : null) };
  return (
    <Card padding={spacing.lg} testID={testID}>
      <View style={{ flexDirection: large ? 'column' : 'row', alignItems: large ? 'stretch' : 'center', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: large ? undefined : 1, minWidth: 0 }}>
          <PersonMark name={item.displayName} avatar={item.avatar} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
              {isolateRtl(item.displayName)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <RowEmoji emoji={item.emoji || '·'} />
              <Text variant="body" style={{ flexShrink: 1 }}>
                {workoutTitle(w, units)}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary">
              {workoutMeta(w, today)}
            </Text>
          </View>
        </View>
        <View style={{ alignSelf: large ? 'flex-end' : 'center' }}>
          <CheerButton testID={`${testID}-cheer`} cheered={item.cheered} label={`${withoutMarks(item.displayName)}'s ${item.name.toLowerCase()}`} onPress={onCheer} />
        </View>
      </View>
    </Card>
  );
}

/** At the end of the screen: what friends see of you, then Privacy and your code. On surfaceAlt, in text and textSecondary. */
export function AboutYouCard({ line, code, onPrivacy, onCopy }: { line: string; code: string; onPrivacy: () => void; onCopy: () => void }) {
  const { colors, spacing } = useTheme();
  const shown = formatCode(code);
  return (
    <Card tone="alt" padding={spacing.lg} testID="friends-about-you">
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {decorative(<Lock size={18} color={colors.textSecondary} strokeWidth={1.9} style={{ marginTop: 2 }} />)}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ fontFamily: fonts.semibold }}>
            {ABOUT_YOU}
          </Text>
          <Text variant="body" color="textSecondary" testID="friends-never-shared" style={{ fontSize: 14, lineHeight: 20 }}>
            {line}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <Button testID="friends-privacy" title={PRIVACY} variant="secondary" size="sm" full={false} style={{ flexGrow: 1 }} icon={<Lock size={18} color={colors.text} />} onPress={onPrivacy} />
        <Button
          testID="friends-copy"
          title={`Code ${shown}`}
          variant="secondary"
          size="sm"
          full={false}
          style={{ flexGrow: 2 }}
          accessibilityLabel={`Copy code ${shown}`}
          icon={<Copy size={18} color={colors.text} />}
          onPress={onCopy}
        />
      </View>
    </Card>
  );
}
