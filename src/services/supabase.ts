import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * The app is fully usable without a backend (data stays on the device).
 * Accounts, cross-device sync and AI food analysis switch on once these two
 * public values are present in the environment.
 */
export const isBackendConfigured = /^https?:\/\//.test(url) && anonKey.length > 20;

export const supabase: SupabaseClient | null = isBackendConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        // PKCE: a link can only complete a sign-in in the browser or app that started it.
        // With the default flow, anyone could hand a victim a link carrying the sender's own
        // session, and the victim's on-device data would then upload to the sender's account.
        flowType: 'pkce',
      },
    })
  : null;

// A password-reset link signs in while the client starts up, and the client says so
// exactly once. The app's own listener is added after the first render, which can be
// later than that, so the fact is noted here, in the same tick the client is created.
let recoveryLink = false;
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recoveryLink = true;
});

/** True when this start of the app signed in through a password-reset link. */
export const openedFromRecoveryLink = (): boolean => recoveryLink;

// Token refresh should only run while the app is in the foreground.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const FUNCTIONS_URL = isBackendConfigured ? `${url.replace(/\/$/, '')}/functions/v1` : '';

/** Public anon key, sent with calls to edge functions that are not tied to a signed-in user. */
export const SUPABASE_ANON_KEY = isBackendConfigured ? anonKey : '';
