import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { router } from 'expo-router';
import { Activity, BarChart3, BookOpenText, Camera, Droplets, Dumbbell, Home, PenLine, Plus, ScanBarcode, Scale, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { today } from '@/lib/dates';
import { mealForTime } from '@/lib/nutrition';
import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';
import { PressableScale, Sheet, Text } from '@/ui';

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

function QuickLogSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, radius } = useTheme();
  const go = (href: string) => {
    onClose();
    // Let the sheet start closing before the next screen slides in.
    setTimeout(() => router.push(href as never), 60);
  };
  const food = `meal=${mealForTime()}&date=${today()}`;
  const actions = [
    { id: 'search', label: 'Search food', hint: 'Database and your recents', icon: Search, color: colors.calories, href: `/food/search?${food}` },
    { id: 'photo', label: 'Snap a meal', hint: 'AI estimates from a photo', icon: Camera, color: colors.fat, href: `/food/photo?${food}` },
    { id: 'scan', label: 'Scan barcode', hint: 'Packaged products', icon: ScanBarcode, color: colors.carbs, href: `/food/scan?${food}` },
    { id: 'describe', label: 'Describe it', hint: 'Type what you ate', icon: PenLine, color: colors.protein, href: `/food/photo?mode=text&${food}` },
    { id: 'activity', label: 'Log activity', hint: 'Sport, gym, walk', icon: Activity, color: colors.exercise, href: '/activity/pick' },
    { id: 'water', label: 'Add water', hint: 'Drinks and hydration', icon: Droplets, color: colors.water, href: '/water' },
    { id: 'weight', label: 'Weigh in', hint: 'Weight and body fat', icon: Scale, color: colors.weight, href: '/weight' },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Log something">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {actions.map((a, i) => (
          <PressableScale
            key={a.id}
            testID={`quick-${a.id}`}
            onPress={() => go(a.href)}
            accessibilityLabel={a.label}
            style={{
              flexBasis: i === 0 ? '100%' : '47%',
              flexGrow: 1,
              flexDirection: i === 0 ? 'row' : 'column',
              alignItems: i === 0 ? 'center' : 'flex-start',
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 14,
              gap: i === 0 ? 14 : 10,
            }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: `${a.color}22`, alignItems: 'center', justifyContent: 'center' }}>
              <a.icon size={20} color={a.color} />
            </View>
            <View>
              <Text variant="bodyStrong">{a.label}</Text>
              <Text variant="caption" color="textSecondary">
                {a.hint}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}
