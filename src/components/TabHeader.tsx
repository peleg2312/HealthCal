import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { CoachEntry } from '@/features/coach/CoachEntry';
import { useCoachMovedToast } from '@/features/coach/movedToast';
import { FriendsEntry } from '@/features/friends/FriendsEntry';
import { formatShortDate, fromISODate } from '@/lib/dates';
import { useProfile } from '@/store/selectors';
import { cupFor, MAX_CONTENT_WIDTH, spacing as SPACING, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

export type TabName = 'today' | 'diary' | 'train' | 'progress';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The header's three cups (Coach, Friends, profile): 36 px visible, 4 px apart. Each is 40 px wide and
 * 44 px tall to touch: at 40 px from centre to centre a 44 px wide area would overlap its neighbour's,
 * so a tap between two cups would go to whichever was drawn last. This is the one stated exception to
 * the 44 px target (the alternative, wider gaps, takes the person's name out of Today's greeting).
 */
export const HEADER_CUP = 36;
const CUP_GAP = 4;
export const HEADER_SLOP = { top: 4, bottom: 4, left: CUP_GAP / 2, right: CUP_GAP / 2 };

/**
 * A day as a tab overline: 'Sunday, Nov 15', or with `short` 'Sun, Nov 15' for a window under
 * 360 px. Today and the diary write it the same way.
 */
export function tabDay(date: string, short = false): string {
  const day = WEEKDAYS[fromISODate(date).getDay()];
  return `${short ? day.slice(0, 3) : day}, ${formatShortDate(date)}`;
}

/** The tab title's size: one line, the same on all four tabs. */
export function tabTitleSize(width: number): number {
  return width < 360 ? 22 : 26;
}

/** The room the title has on a window this wide: the content width less the gap and the three cups (222 at 390, 192 at 360, 152 at 320). */
export function tabTitleRoom(width: number): number {
  return Math.min(width, MAX_CONTENT_WIDTH) - 2 * SPACING.xl - SPACING.md - (3 * HEADER_CUP + 2 * CUP_GAP);
}

let coachPreloaded = false;

/**
 * On the web each route's code is its own file, fetched on the first visit, so the first tap on the
 * Coach cup showed a blank page while the coach's code arrived, and the first visit to a tab faded
 * the last one out, showed a blank page for about 250 ms and then faded the tab in. Once a tab has
 * settled (the browser is idle, or 1.5 s), the coach's code and the four tabs' are fetched ahead,
 * once a run, so the first frame after the tap is the coach, and a tab's cross-fade has a page to
 * fade to. Natively every route is already in the bundle.
 */
function preloadCoach(): () => void {
  if (Platform.OS !== 'web' || coachPreloaded || typeof window === 'undefined') return () => {};
  const run = () => {
    if (coachPreloaded) return;
    coachPreloaded = true;
    import('@/app/coach').catch(() => {
      // Offline or a failed fetch: the tap loads it as before.
      coachPreloaded = false;
    });
    // The tabs, so a first visit cross-fades into a drawn page; a failed fetch loads on the tap as before.
    import('@/app/(tabs)/index').catch(() => {});
    import('@/app/(tabs)/diary').catch(() => {});
    import('@/app/(tabs)/train').catch(() => {});
    import('@/app/(tabs)/progress').catch(() => {});
  };
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) {
    const id = idle(run, { timeout: 1500 });
    return () => (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }
  const t = setTimeout(run, 1500);
  return () => clearTimeout(t);
}

/**
 * The one header of the four tab screens, passed to `Screen` as its `header`, so it stays
 * put while the page scrolls and sits at the same place on every tab: an overline (the
 * date, the week, the range) over a one-line title on the left, and on the right always
 * the same three cups in the same order, Coach, Friends, then the profile tile (which opens
 * Profile, where the settings live). Anything that belongs to one screen (a share button,
 * day arrows, a range picker) goes in that screen's content, under this header.
 * `overlineShort`, when given, is used on a window under 360 px. `titleSize`, when given, draws the
 * title smaller than the tab's size (Today steps from 26 to 24 px to keep a name, `todayTitle`); the
 * line height stays the tab's, so the header is 68 px on every tab.
 */
export function TabHeader({
  tab,
  overline,
  overlineShort,
  title,
  titleSize,
  titleTestID,
}: {
  tab: TabName;
  overline: string;
  overlineShort?: string;
  title: string;
  titleSize?: number;
  titleTestID?: string;
}) {
  const { colors, spacing } = useTheme();
  const profile = useProfile();
  // Once per device, on the first arrival on a tab: where the coach went (./movedToast).
  useCoachMovedToast();
  useEffect(preloadCoach, []);
  const width = useWindowDimensions().width;
  const base = tabTitleSize(width);
  const size = titleSize ?? base;
  const initial = ((profile.name ?? '').trim() || 'Me').slice(0, 1).toUpperCase();
  return (
    <View testID="tab-header" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm }}>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text variant="overline" numberOfLines={1}>
          {overlineShort && width < 360 ? overlineShort : overline}
        </Text>
        <Text variant="h1" numberOfLines={1} testID={titleTestID} style={{ fontSize: size, lineHeight: base + 6, letterSpacing: -size * 0.025 }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: CUP_GAP }}>
        <CoachEntry testID={`${tab}-coach-open`} size={HEADER_CUP} hitSlop={HEADER_SLOP} />
        <FriendsEntry testID={`${tab}-friends`} size={HEADER_CUP} hitSlop={HEADER_SLOP} />
        <PressableScale
          testID={`${tab}-profile`}
          onPress={() => router.push('/profile')}
          accessibilityLabel="Profile and settings"
          hitSlop={HEADER_SLOP}
          style={{ width: HEADER_CUP, height: HEADER_CUP, ...cupFor(HEADER_CUP), backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h3">{initial}</Text>
        </PressableScale>
      </View>
    </View>
  );
}
