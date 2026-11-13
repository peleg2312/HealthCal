import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Activity, BarChart3, BookOpenText, Dumbbell, Home, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { QuickLogSheet } from './QuickLogSheet';

const ICONS = { index: Home, diary: BookOpenText, train: Dumbbell, progress: BarChart3 } as const;

const PILL_WIDTH = 60;
const PILL_HEIGHT = 50;
const BAR_HEIGHT = 68;
const BAR_BORDER = 1;

/** The user's reduced-motion setting (on web, the prefers-reduced-motion media query). */
function webReducedMotionQuery(): MediaQueryList | null {
  return Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => webReducedMotionQuery()?.matches ?? false);
  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'web') {
      const mq = webReducedMotionQuery();
      if (!mq) return;
      const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
      mq.addEventListener?.('change', onChange);
      return () => mq.removeEventListener?.('change', onChange);
    }
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * The active-tab highlight: one pill that springs from tab to tab. It waits
 * for the tabs' layout, jumps into place the first time, and jumps instead of
 * sliding when reduced motion is on.
 */
function useSlidingPill(index: number, centres: Record<number, number>) {
  const reduce = useReducedMotion();
  // Animated values live in state, not refs: they are read while rendering.
  const [x] = useState(() => new Animated.Value(0));
  const [opacity] = useState(() => new Animated.Value(0));
  // Whether the pill has been put in place once; only read and written inside the effect.
  const [placed] = useState(() => new Set<'pill'>());
  const centre = centres[index];
  useEffect(() => {
    if (centre === undefined) return;
    // Tab layout x counts from the bar's outer edge; an absolute `left: 0` sits inside its border.
    const to = centre - PILL_WIDTH / 2 - BAR_BORDER;
    if (!placed.has('pill') || reduce) {
      x.setValue(to);
      opacity.setValue(1);
      placed.add('pill');
      return;
    }
    const anim = Animated.spring(x, { toValue: to, speed: 18, bounciness: 6, useNativeDriver: Platform.OS !== 'web' });
    anim.start();
    return () => anim.stop();
  }, [centre, reduce, x, opacity, placed]);
  return { x, opacity };
}

/** Floating tab bar with a centre action that opens the quick-log sheet. */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // Centre x of each tab inside the bar, by route index, from layout.
  const [centres, setCentres] = useState<Record<number, number>>({});
  const pill = useSlidingPill(state.index, centres);

  const tabs = state.routes.map((route, index) => {
    const focused = state.index === index;
    const Icon = ICONS[route.name as keyof typeof ICONS] ?? Activity;
    const label = descriptors[route.key].options.title ?? route.name;
    return (
      <PressableScale
        key={route.key}
        testID={`tab-${route.name}`}
        feedback="select"
        scaleTo={0.92}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => navigateToTab(route.key)}
        onLayout={(e) => {
          const { x, width } = e.nativeEvent.layout;
          const c = x + width / 2;
          setCentres((cur) => (cur[index] === c ? cur : { ...cur, [index]: c }));
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 56 }}>
        <Icon size={22} color={focused ? colors.primary : colors.textTertiary} strokeWidth={focused ? 2.4 : 2} />
        <Text variant="caption" color={focused ? 'text' : 'textTertiary'} style={{ fontSize: 10.5 }}>
          {label}
        </Text>
      </PressableScale>
    );
  });

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 16, alignItems: 'center' }}>
        <View
          style={{
            width: '100%',
            maxWidth: MAX_CONTENT_WIDTH - 32,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.tabBar,
            borderRadius: radius.xl,
            borderWidth: BAR_BORDER,
            borderColor: colors.border,
            paddingHorizontal: 6,
            height: BAR_HEIGHT,
            shadowColor: colors.shadow,
            shadowOpacity: 0.28,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
            ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)' } as object) : null),
          }}>
          <Animated.View
            pointerEvents="none"
            testID="tab-pill"
            style={{
              position: 'absolute',
              left: 0,
              top: (BAR_HEIGHT - 2 * BAR_BORDER - PILL_HEIGHT) / 2,
              width: PILL_WIDTH,
              height: PILL_HEIGHT,
              borderRadius: radius.md,
              backgroundColor: colors.primarySoft,
              opacity: pill.opacity,
              transform: [{ translateX: pill.x }],
            }}
          />
          {tabs.slice(0, 2)}
          <View style={{ width: 72, alignItems: 'center' }}>
            <PressableScale
              testID="tab-add"
              feedback="press"
              scaleTo={0.9}
              accessibilityLabel="Log something"
              onPress={() => setOpen(true)}
              style={{
                width: 54,
                height: 54,
                borderRadius: 27,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: colors.primary,
                shadowOpacity: 0.45,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 4 },
                elevation: 8,
              }}>
              <Plus size={26} color={colors.onPrimary} strokeWidth={2.8} />
            </PressableScale>
          </View>
          {tabs.slice(2)}
        </View>
      </View>
      <QuickLogSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
