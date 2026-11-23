import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/hanken-grotesk';
import * as Linking from 'expo-linking';
import { Redirect, router, Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { AppState, Platform, Pressable, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { finishGoogleReturn } from '@/features/auth/google';
import { isGoogleReturnUrl } from '@/features/auth/words';
import { startCoach } from '@/features/coach/history';
import { startPlan } from '@/features/plan/start';
import { usePendingInvite } from '@/features/friends/usePendingInvite';
import { startHealthSync } from '@/features/health-sync/sync';
import { startUpdates, useReportScreen } from '@/features/updates/updates';
import { handleAuthLink, initAuth } from '@/services/auth';
import { refreshReminders } from '@/services/notifications';
import { startFriends } from '@/services/friends';
import { startAutoSync, syncNow } from '@/services/sync';
import { useStore } from '@/store';
import { startDaySnapshots } from '@/store/daySnapshot';
import { startPersistence, useHydration, wipePersisted } from '@/store/persistence';
import { ThemeProvider, useReducedMotion, useTheme } from '@/theme';
import { ToastHost } from '@/ui';
// Read once at the start, before the router draws a screen or changes the address (the morning page's start facts).
import '@/features/morning/launch';
import '@/features/layout/leftToRight';

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
    <View style={{ flex: 1, backgroundColor: '#F4EEE5', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <RNText style={{ fontSize: 40 }}>🗄️</RNText>
      <RNText style={{ color: '#211913', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Could not load your saved data</RNText>
      <RNText style={{ color: '#5C5046', fontSize: 15, textAlign: 'center' }}>
        Try again first. Starting fresh clears what is saved on this device; anything backed up to your account comes back when you sign in.
      </RNText>
      <Pressable
        testID="load-retry"
        accessibilityRole="button"
        onPress={() => void startPersistence()}
        style={{ marginTop: 12, backgroundColor: '#BF4420', paddingHorizontal: 28, height: 50, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</RNText>
      </Pressable>
      <Pressable
        testID="load-start-fresh"
        accessibilityRole="button"
        onPress={() => void wipePersisted().then(() => startPersistence())}
        style={{ paddingHorizontal: 28, height: 50, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#5C5046', fontSize: 15, fontWeight: '600' }}>Start fresh on this device</RNText>
      </Pressable>
    </View>
  );
}

/**
 * Task screens (search, quick add, import, add a friend, the morning page) rise from the bottom like a sheet;
 * everything else keeps the platform's push. On web the native stack does not animate, so
 * `Screen`'s fade-up is the page change there. Reduced motion turns every transition off.
 */
const TASK_SCREENS = ['food/search', 'food/quick', 'food/scan', 'food/photo', 'activity/import', 'friends/add', 'morning'] as const;

/**
 * The only screens someone without a finished setup may open. Every other screen reads the
 * profile (budget, units, goals), so a link opened before setup goes to the welcome screen
 * instead of a screen that cannot draw. The tabs have the same rule in their own layout.
 */
const OPEN_WITHOUT_PROFILE = new Set(['welcome', 'auth', 'onboarding', 'friends/add', 'settings/data', 'settings/about', 'legal/terms', 'legal/privacy', '+not-found', '_sitemap']);

function ProfileGate({ name, children }: { name: string; children: React.ReactNode }) {
  const onboarded = useStore((s) => !!s.profile?.onboardedAt);
  if (!onboarded && !OPEN_WITHOUT_PROFILE.has(name)) return <Redirect href="/welcome" />;
  return <>{children}</>;
}

function Navigation() {
  const { colors, dark } = useTheme();
  const reduce = useReducedMotion();
  // Which screen is in front, for over-the-air updates (they restart only on a tab).
  useReportScreen();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenLayout={({ children, route }) => <ProfileGate name={route.name}>{children}</ProfileGate>}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: reduce ? 'none' : 'slide_from_right',
        }}>
        <Stack.Screen name="(tabs)" options={{ animation: reduce ? 'none' : 'fade' }} />
        <Stack.Screen name="welcome" options={{ animation: reduce ? 'none' : 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: reduce ? 'none' : 'fade', gestureEnabled: false }} />
        {TASK_SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} options={{ animation: reduce ? 'none' : 'slide_from_bottom', animationDuration: 320 }} />
        ))}
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
  // What failed, in the app's own words: shown small so a screenshot of this screen is enough to
  // find the fault, and written to the device log. It is code text, never anything the person entered.
  const detail = `${error?.name && error.name !== 'Error' ? `${error.name}: ` : ''}${String(error?.message ?? error)}`.replace(/\s+/g, ' ').slice(0, 400);
  const where = String(error?.stack ?? '')
    .split('\n')
    .slice(1, 4)
    .map((l) => l.trim().replace(/^at\s+/, '').replace(/\s*\(.*$/, ''))
    .filter(Boolean)
    .join(' < ')
    .slice(0, 160);
  useEffect(() => {
    console.error('[HealthCal] screen error:', detail, where);
  }, [detail, where]);
  return (
    <View style={{ flex: 1, backgroundColor: '#F4EEE5', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <RNText style={{ fontSize: 40 }}>🛠️</RNText>
      <RNText style={{ color: '#211913', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Something went wrong on this screen</RNText>
      <RNText style={{ color: '#5C5046', fontSize: 15, textAlign: 'center' }}>Your data is safe on this device. Try again, and if it keeps happening, restart the app.</RNText>
      <RNText testID="error-detail" selectable style={{ color: '#73665A', fontSize: 12, textAlign: 'center' }}>
        {detail}
        {where ? `\n${where}` : ''}
      </RNText>
      <Pressable
        testID="error-retry"
        accessibilityRole="button"
        onPress={retry}
        style={{ marginTop: 12, backgroundColor: '#BF4420', paddingHorizontal: 28, height: 50, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>Try again</RNText>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const hydration = useHydration((h) => h.status);
  const hydrated = hydration === 'ready';
  const theme = useStore((s) => s.settings.theme);
  // A newer look (Butter, Honey, Java) beside the stored preference; it applies while theme holds its fallback.
  const look = useStore((s) => s.settings.look);
  // Until setup is finished nobody has picked a look, so the app shows its lead one.
  const firstRun = useStore((s) => !s.profile?.onboardedAt);
  const ready = (fontsLoaded || !!fontError) && hydrated;
  // An invite code kept through sign-up opens the add-friend screen once the person is set up.
  usePendingInvite(ready);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    initAuth();
    const stopSync = startAutoSync();
    startFriends();
    startHealthSync();
    // The coach's chat and agreement go whenever the profile goes away (erase, sign out, account switch).
    startCoach();
    // The plan's device copy: asked at sign-in and on a return after five minutes, wiped with the account.
    startPlan();
    startUpdates();
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
    // Back from Google in the system browser (healthcal://auth?mode=google&code=...), also on a cold start:
    // the code is exchanged once however many times the link arrives (src/features/auth/google.ts).
    if (isGoogleReturnUrl(link)) {
      void finishGoogleReturn(link);
      return;
    }
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
        <ThemeProvider preference={theme} look={look} lead={firstRun}>
          <Navigation />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
