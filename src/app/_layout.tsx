import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useSyncExternalStore } from 'react';
import { AppState, Pressable, Text as RNText, View } from 'react-native';
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
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
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

/**
 * Last-resort screen if a route throws while rendering. It uses plain React
 * Native elements on purpose: the theme or fonts may be what failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0C10', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <RNText style={{ fontSize: 40 }}>🛠️</RNText>
      <RNText style={{ color: '#F4F6FA', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Something went wrong on this screen</RNText>
      <RNText style={{ color: '#A3ACBB', fontSize: 15, textAlign: 'center' }}>Your data is safe on this device. Try again, and if it keeps happening, restart the app.</RNText>
      {__DEV__ ? <RNText style={{ color: '#6B7485', fontSize: 12, textAlign: 'center' }}>{error.message}</RNText> : null}
      <Pressable
        testID="error-retry"
        accessibilityRole="button"
        onPress={retry}
        style={{ marginTop: 12, backgroundColor: '#C6F26B', paddingHorizontal: 28, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#0B1205', fontSize: 16, fontWeight: '700' }}>Try again</RNText>
      </Pressable>
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
