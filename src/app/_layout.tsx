import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold } from '@expo-google-fonts/barlow-semi-condensed';
import * as Linking from 'expo-linking';
import { router, Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState, Platform, Pressable, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { handleAuthLink, initAuth } from '@/services/auth';
import { refreshReminders } from '@/services/notifications';
import { startAutoSync, syncNow } from '@/services/sync';
import { useStore } from '@/store';
import { startDaySnapshots } from '@/store/daySnapshot';
import { startPersistence, useHydration, wipePersisted } from '@/store/persistence';
import { ThemeProvider, useTheme } from '@/theme';
import { ToastHost } from '@/ui';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Shown when the last save did not reach the device, so the user knows before
 * more is lost. It floats above the tab bar, clear of the status bar and the
 * home indicator, instead of sitting at the very top under the notch.
 */
function StorageWarning() {
  const failed = useHydration((h) => h.saveFailed);
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  if (!failed) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 100, alignItems: 'center' }}>
      <View accessibilityRole="alert" style={{ maxWidth: 520, backgroundColor: colors.warning, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 }}>
        <RNText style={{ color: '#201400', fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
          Changes are not being saved on this device (storage may be full). Export a backup from Profile, Your data.
        </RNText>
      </View>
    </View>
  );
}

/** Saved data could not be read. Never leave a blank screen: offer a retry and a clean start. */
function LoadFailed() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0C10', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <RNText style={{ fontSize: 40 }}>🗄️</RNText>
      <RNText style={{ color: '#F4F6FA', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Could not load your saved data</RNText>
      <RNText style={{ color: '#A3ACBB', fontSize: 15, textAlign: 'center' }}>
        Try again first. Starting fresh clears what is saved on this device; anything backed up to your account comes back when you sign in.
      </RNText>
      <Pressable
        testID="load-retry"
        accessibilityRole="button"
        onPress={() => void startPersistence()}
        style={{ marginTop: 12, backgroundColor: '#C6F26B', paddingHorizontal: 28, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#0B1205', fontSize: 16, fontWeight: '700' }}>Try again</RNText>
      </Pressable>
      <Pressable
        testID="load-start-fresh"
        accessibilityRole="button"
        onPress={() => void wipePersisted().then(() => startPersistence())}
        style={{ paddingHorizontal: 28, height: 50, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#A3ACBB', fontSize: 15, fontWeight: '600' }}>Start fresh on this device</RNText>
      </Pressable>
    </View>
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
      <StorageWarning />
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
    BarlowSemiCondensed_600SemiBold,
    BarlowSemiCondensed_700Bold,
  });
  const hydration = useHydration((h) => h.status);
  const hydrated = hydration === 'ready';
  const theme = useStore((s) => s.settings.theme);
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    initAuth();
    const stopSync = startAutoSync();
    const stopSnapshots = startDaySnapshots();
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
      stopSnapshots();
      unsubStore();
      appState.remove();
      if (timer) clearTimeout(timer);
    };
  }, [ready]);

  useEffect(() => {
    void startPersistence();
  }, []);

  // On a phone a password-reset link opens the app with a one-time code. The browser build
  // reads the code from its own address bar, so this is only needed natively.
  const link = Linking.useURL();
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !link) return;
    void handleAuthLink(link).then((ok) => {
      if (ok) router.replace('/auth?mode=reset');
    });
  }, [link, ready]);

  useEffect(() => {
    // The recovery screen must not stay hidden behind the splash image.
    if (hydration === 'error') SplashScreen.hideAsync().catch(() => {});
  }, [hydration]);

  if (hydration === 'error') return <LoadFailed />;
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
