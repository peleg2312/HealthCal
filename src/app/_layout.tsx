import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initAuth } from '@/services/auth';
import { refreshReminders } from '@/services/notifications';
import { startAutoSync, syncNow } from '@/services/sync';
import { useStore } from '@/store';
import { ThemeProvider, useTheme } from '@/theme';
import { ToastHost } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);
  return hydrated;
}

function Navigation() {
  const { colors, dark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const hydrated = useStoreHydrated();
  const theme = useStore((s) => s.settings.theme);
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    initAuth();
    const stopSync = startAutoSync();
    // Reminder text carries live numbers ("620 ml left"), so it is rebuilt whenever data changes.
    void refreshReminders();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubStore = useStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refreshReminders(), 1500);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncNow();
        void refreshReminders();
      }
    });
    return () => {
      stopSync();
      unsubStore();
      appState.remove();
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider preference={theme}>
          <Navigation />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
