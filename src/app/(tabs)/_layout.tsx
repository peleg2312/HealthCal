import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Easing } from 'react-native';

import { TabBar } from '@/components/TabBar';
import { useStore } from '@/store';
import { motion, useReducedMotion, useTheme } from '@/theme';

export default function TabsLayout() {
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  if (!onboarded) return <Redirect href="/welcome" />;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        // Tabs cross-fade (a quiet page change on every platform); reduced motion switches at once.
        animation: reduce ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: motion.duration.enter + 40, easing: Easing.bezier(...motion.easing.enter) } },
        // The leaving tab is gone before the new one is half in, so the two never read as a double exposure.
        sceneStyleInterpolator: ({ current }) => ({
          sceneStyle: { opacity: current.progress.interpolate({ inputRange: [-1, -0.6, 0, 0.6, 1], outputRange: [0, 0, 1, 0, 0] }) },
        }),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="diary" options={{ title: 'Diary' }} />
      <Tabs.Screen name="train" options={{ title: 'Train' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
    </Tabs>
  );
}
