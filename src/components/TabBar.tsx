import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { Activity, BarChart3, BookOpenText, Dumbbell, Home, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { QuickLogSheet } from './QuickLogSheet';

const ICONS = { index: Home, diary: BookOpenText, train: Dumbbell, progress: BarChart3 } as const;

/** Floating tab bar with a centre action that opens the quick-log sheet. */
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

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
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 6,
            height: 68,
            shadowColor: colors.shadow,
            shadowOpacity: 0.28,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
            ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px)' } as object) : null),
          }}>
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
