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
      },
    })
  : null;

// Token refresh should only run while the app is in the foreground.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const FUNCTIONS_URL = isBackendConfigured ? `${url.replace(/\/$/, '')}/functions/v1` : '';
