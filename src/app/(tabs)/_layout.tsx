import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '@/components/TabBar';
import { useStore } from '@/store';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  const { colors } = useTheme();
  if (!onboarded) return <Redirect href="/welcome" />;
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="diary" options={{ title: 'Diary' }} />
      <Tabs.Screen name="train" options={{ title: 'Train' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
    </Tabs>
  );
}
