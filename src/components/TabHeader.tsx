import { router } from 'expo-router';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { FriendsEntry } from '@/features/friends/FriendsEntry';
import { formatShortDate, fromISODate } from '@/lib/dates';
import { useProfile } from '@/store/selectors';
import { cupFor, MAX_CONTENT_WIDTH, spacing as SPACING, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

export type TabName = 'today' | 'diary' | 'train' | 'progress';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A day as a tab overline: 'Sunday, Nov 15'. Today and the diary write it the same way. */
export function tabDay(date: string): string {
  return `${WEEKDAYS[fromISODate(date).getDay()]}, ${formatShortDate(date)}`;
}

/** The tab title's size: one line, the same on all four tabs. */
export function tabTitleSize(width: number): number {
  return width < 360 ? 22 : 26;
}

/** The room the title has on a window this wide: the content width less the gap and the two 44 px controls. */
export function tabTitleRoom(width: number): number {
  return Math.min(width, MAX_CONTENT_WIDTH) - 2 * SPACING.xl - SPACING.md - 44 - SPACING.sm - 44;
}

/**
 * The one header of the four tab screens, passed to `Screen` as its `header`, so it stays
 * put while the page scrolls and sits at the same place on every tab: an overline (the
 * date, the week, the range) over a one-line title on the left, and on the right always
 * the same two controls in the same order, Friends then the profile tile (which opens
 * Profile, where the settings live). Anything that belongs to one screen (a share button,
 * day arrows, a range picker) goes in that screen's content, under this header.
 */
export function TabHeader({ tab, overline, title, titleTestID }: { tab: TabName; overline: string; title: string; titleTestID?: string }) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  const size = tabTitleSize(useWindowDimensions().width);
  const initial = ((profile.name ?? '').trim() || 'Me').slice(0, 1).toUpperCase();
  return (
    <View testID="tab-header" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text variant="overline" numberOfLines={1}>
          {overline}
        </Text>
        <Text variant="h1" numberOfLines={1} testID={titleTestID} style={{ fontSize: size, lineHeight: size + 6, letterSpacing: -size * 0.025 }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <FriendsEntry testID={`${tab}-friends`} />
        <PressableScale
          testID={`${tab}-profile`}
          onPress={() => router.push('/profile')}
          accessibilityLabel="Profile and settings"
          style={{ width: 44, height: 44, ...cupFor(44), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h3">{initial}</Text>
        </PressableScale>
      </View>
    </View>
  );
}
