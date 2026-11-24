import { useIsFocused } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Activity, BookOpen, ChartLine, Dumbbell, House, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cup, fonts, MAX_CONTENT_WIDTH, motion, useReducedMotion, useTheme } from '@/theme';
import { PressableScale, TAB_BAR_HEIGHT, Text, useToastDock } from '@/ui';

import { QuickLogSheet } from './QuickLogSheet';

const ICONS = { index: House, diary: BookOpen, train: Dumbbell, progress: ChartLine } as const;

/** The active tab's level line: a 28 x 3 rim bar hanging from the bar's top edge. */
const MARK_WIDTH = 28;

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
  useToastDock(insets.bottom + TAB_BAR_HEIGHT + 14, focused);

  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const Icon = ICONS[route.name as keyof typeof ICONS] ?? Activity;
    const label = descriptors[route.key].options.title ?? route.name;
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
        style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 9, gap: 3, height: TAB_BAR_HEIGHT }}>
        <Icon size={22} color={focused ? colors.text : colors.textTertiary} strokeWidth={focused ? 2.2 : 1.9} />
        <Text
          variant="caption"
          color={focused ? 'text' : 'textTertiary'}
          numberOfLines={1}
          style={{ fontSize: 11.5, lineHeight: 14, fontFamily: focused ? fonts.bold : fonts.semibold }}>
          {label}
        </Text>
      </PressableScale>
    );
  });

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
        <View style={{ width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 10, height: TAB_BAR_HEIGHT }}>
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
          <View style={{ flex: 1.1, alignItems: 'center' }}>
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
          </View>
          {tabs.slice(2)}
        </View>
      </View>
      <QuickLogSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
