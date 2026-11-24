import { useIsFocused } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Activity, BookOpen, ChartLine, Dumbbell, House, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cup, fonts, LARGE_TEXT, MAX_CONTENT_WIDTH, motion, useReducedMotion, useTextGrowth, useTheme } from '@/theme';
import { PressableScale, setTabBarExtra, TAB_BAR_HEIGHT, Text, useToastDock } from '@/ui';

import { QuickLogSheet } from './QuickLogSheet';

const ICONS = { index: House, diary: BookOpen, train: Dumbbell, progress: ChartLine } as const;

/** The active tab's level line: a 28 x 3 rim bar hanging from the bar's top edge. */
const MARK_WIDTH = 28;
/** The label's line box at 100%, and the room over the icon. */
const LABEL_LINE = 14;
const ICON_TOP = 9;
/** With large text: the + cup's own width (its 56 px cup and 2 px either side), and the row's side padding. */
const PLUS_W_LARGE = 60;
const PAD_LARGE = 4;
/** The tab labels' size: 12 px, the caption floor. */
const LABEL_SIZE = 12;
/** With large text, a tab's side padding, and a label letter's width at the designed size (Hanken Grotesk bold at 12 px). */
const TAB_PAD_LARGE = 3;
const LABEL_LETTER = 6.05;
/** The band the + cup has over the four tabs when they cannot hold their labels whole beside it (the cup still rises 14 px above it). */
const PLUS_BAND = 40;

/**
 * The active-tab mark: one level line that slides from tab to tab. It waits
 * for the tabs' layout, jumps into place the first time, and jumps instead of
 * sliding when reduced motion is on.
 */
function useSlidingMark(index: number, centres: Record<number, number>) {
  const reduce = useReducedMotion();
  // Animated values live in state, not refs: they are read while rendering.
  const [x] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));
  // Whether the pill has been put in place once; only read and written inside the effect.
  const [placed] = useState(() => new Set<'pill'>());
  const centre = centres[index];
  useEffect(() => {
    if (centre === undefined) return;
    const to = centre - MARK_WIDTH / 2;
    if (!placed.has('pill') || reduce) {
      x.setValue(to);
      opacity.setValue(1);
      placed.add('pill');
      return;
    }
    // A level line moving to its new place: ease-out, no overshoot.
    const anim = Animated.timing(x, { toValue: to, duration: motion.duration.slide, easing: Easing.bezier(...motion.easing.move), useNativeDriver: Platform.OS !== 'web' });
    anim.start();
    return () => anim.stop();
  }, [centre, reduce, x, opacity, placed]);
  return { x, opacity };
}

/**
 * Docked tab bar: a full-width tabBar surface with a 1 px top border. The
 * active tab is in the text colour with a rim bar hanging from the top edge;
 * the centre + is a cup (primary, 5 5 18 18) rising 14 px out of the bar and
 * opens the quick-log sheet.
 */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // Centre x of each tab inside the row, by route index, from layout.
  const [centres, setCentres] = useState<Record<number, number>>({});
  const mark = useSlidingMark(state.index, centres);
  // The bar docks the toast itself, from the moment it shows: a toast raised on a screen without a tab
  // bar (signing in) moves above the bar at once, before the tab's own screen has mounted.
  const focused = useIsFocused();
  const winW = useWindowDimensions().width;

  // Large text (the app's size or the phone's, `useTextGrowth`): the tab row stays TAB_BAR_HEIGHT tall, so the
  // room over the icon gives way to the taller label, and each tab is as wide as its label needs, the room left
  // shared out evenly, so "Today", "Diary" and "Train" keep their words whole beside "Progress". Where the four
  // labels and the + cannot share one row (320 px from 175%), the + moves to a band of its own over the four tabs
  // (`PLUS_BAND`, the bar that much taller; tab screens pad for it through `setTabBarExtra`), so every label stays
  // whole. At 100% the five places are as before: four equal tabs and the + at 1.1.
  const growth = useTextGrowth();
  const large = growth > LARGE_TEXT;
  const labelLine = Math.round(LABEL_LINE * growth);
  const iconTop = large ? Math.max(2, ICON_TOP - (labelLine - LABEL_LINE)) : ICON_TOP;
  const labels = state.routes.map((route) => descriptors[route.key].options.title ?? route.name);
  const longest = Math.max(...labels.map((l) => l.length));
  const labelsW = labels.reduce((sum, l) => sum + l.length * LABEL_LETTER * growth + 2 * TAB_PAD_LARGE, 0);
  const band = large && labelsW + PLUS_W_LARGE > Math.min(winW, MAX_CONTENT_WIDTH) - 2 * PAD_LARGE;
  const extra = band ? PLUS_BAND : 0;
  useEffect(() => {
    setTabBarExtra(extra);
  }, [extra]);
  useEffect(() => () => setTabBarExtra(0), []);
  useToastDock(insets.bottom + TAB_BAR_HEIGHT + 14 + extra, focused);

  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const Icon = ICONS[route.name as keyof typeof ICONS] ?? Activity;
    const label = labels[index];
    return (
      <PressableScale
        key={route.key}
        testID={`tab-${route.name}`}
        feedback="select"
        scaleTo={0.94}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        // react-native-web reads the aria prop, not accessibilityState, for the selected tab.
        aria-selected={focused}
        accessibilityLabel={label}
        onPress={() => navigateToTab(route.key)}
        onLayout={(e) => {
          const { x, width } = e.nativeEvent.layout;
          const c = x + width / 2;
          setCentres((cur) => (cur[index] === c ? cur : { ...cur, [index]: c }));
        }}
        style={[
          { alignItems: 'center', justifyContent: 'flex-start', paddingTop: iconTop, gap: 3, height: TAB_BAR_HEIGHT },
          large ? { flexGrow: 1, flexShrink: label.length === longest ? 1 : 0, flexBasis: 'auto', minWidth: 44, paddingHorizontal: TAB_PAD_LARGE } : { flex: 1 },
        ]}>
        <Icon size={22} color={focused ? colors.text : colors.textTertiary} strokeWidth={focused ? 2.2 : 1.9} />
        <Text
          variant="caption"
          color={focused ? 'text' : 'textTertiary'}
          numberOfLines={1}
          style={[{ fontSize: LABEL_SIZE, lineHeight: LABEL_LINE, fontFamily: focused ? fonts.bold : fonts.semibold }, large ? { maxWidth: '100%' } : null]}>
          {label}
        </Text>
      </PressableScale>
    );
  });

  const plus = (
    <PressableScale
      testID="tab-add"
      feedback="press"
      scaleTo={0.94}
      dip={motion.distance.dip}
      accessibilityLabel="Log something"
      onPress={() => setOpen(true)}
      style={{
        width: 56,
        height: 50,
        marginTop: -14,
        ...cup(radius.plus, 5),
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Plus size={22} color={colors.onPrimary} strokeWidth={2.2} />
    </PressableScale>
  );

  return (
    <>
      <View
        pointerEvents="box-none"
        testID="tab-bar"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.tabBar,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
        }}>
        {band ? <View style={{ height: PLUS_BAND, alignItems: 'center' }}>{plus}</View> : null}
        <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: large ? PAD_LARGE : 10, height: TAB_BAR_HEIGHT }}>
          <Animated.View
            pointerEvents="none"
            testID="tab-pill"
            style={{
              position: 'absolute',
              left: 0,
              top: -1,
              width: MARK_WIDTH,
              height: 3,
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
              backgroundColor: colors.rim,
              opacity: mark.opacity,
              transform: [{ translateX: mark.x }],
            }}
          />
          {tabs.slice(0, 2)}
          {band ? null : <View style={large ? { width: PLUS_W_LARGE, flexShrink: 0, alignItems: 'center' } : { flex: 1.1, alignItems: 'center' }}>{plus}</View>}
          {tabs.slice(2)}
        </View>
      </View>
      <QuickLogSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
