import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPendingInvite,
  loadPendingInvite,
  PENDING_INVITE_KEY,
  PENDING_INVITE_MAX_AGE_MS,
  readPendingInvite,
  resetPendingInviteForTests,
  savePendingInvite,
  shouldOpenPendingInvite,
  usePendingInviteStore,
} from './pendingInvite';

const NOW = Date.UTC(2026, 10, 14, 12);
const raw = (code: string, savedAt: number) => JSON.stringify({ code, savedAt });

describe('readPendingInvite', () => {
  it('keeps a real code for 7 days', () => {
    expect(readPendingInvite(raw('ABCD2345', NOW - 1000), NOW)).toEqual({ code: 'ABCD2345', savedAt: NOW - 1000 });
    expect(readPendingInvite(raw('ABCD2345', NOW - PENDING_INVITE_MAX_AGE_MS + 1), NOW)?.code).toBe('ABCD2345');
  });

  it('forgets it after 7 days', () => {
    expect(readPendingInvite(raw('ABCD2345', NOW - PENDING_INVITE_MAX_AGE_MS - 1), NOW)).toBeNull();
  });

  it('ignores nothing, broken JSON, an incomplete or look-alike code, and a time in the future', () => {
    expect(readPendingInvite(null, NOW)).toBeNull();
    expect(readPendingInvite('{', NOW)).toBeNull();
    expect(readPendingInvite(raw('ABCD', NOW), NOW)).toBeNull();
    expect(readPendingInvite(raw('ABCD2341', NOW), NOW)).toBeNull();
    expect(readPendingInvite(JSON.stringify({ code: 'ABCD2345' }), NOW)).toBeNull();
    expect(readPendingInvite(raw('ABCD2345', NOW + 10 * 60_000), NOW)).toBeNull();
  });

  it('accepts the code as it was typed or shown', () => {
    expect(readPendingInvite(raw('abcd 2345', NOW), NOW)?.code).toBe('ABCD2345');
  });
});

describe('shouldOpenPendingInvite', () => {
  const base = { code: 'ABCD2345', signedIn: true, onboarded: true, pathname: '/' };

  it('opens once signed in, set up and on an ordinary screen', () => {
    expect(shouldOpenPendingInvite(base)).toBe(true);
    expect(shouldOpenPendingInvite({ ...base, pathname: '/train' })).toBe(true);
  });

  it('waits for an account, for setup, and while on the sign-up or setup screens', () => {
    expect(shouldOpenPendingInvite({ ...base, code: null })).toBe(false);
    expect(shouldOpenPendingInvite({ ...base, signedIn: false })).toBe(false);
    expect(shouldOpenPendingInvite({ ...base, onboarded: false })).toBe(false);
    expect(shouldOpenPendingInvite({ ...base, pathname: '/auth' })).toBe(false);
    expect(shouldOpenPendingInvite({ ...base, pathname: '/onboarding' })).toBe(false);
    expect(shouldOpenPendingInvite({ ...base, pathname: '/welcome' })).toBe(false);
  });

  it('does nothing when the add screen is already open', () => {
    expect(shouldOpenPendingInvite({ ...base, pathname: '/friends/add' })).toBe(false);
  });
});

describe('saving, loading and clearing', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    resetPendingInviteForTests();
  });

  it('saves a code on the device and reads it back on the next start', async () => {
    await savePendingInvite('abcd-2345', NOW);
    expect(JSON.parse((await AsyncStorage.getItem(PENDING_INVITE_KEY))!)).toEqual({ code: 'ABCD2345', savedAt: NOW });
    resetPendingInviteForTests();
    await loadPendingInvite(NOW + 60_000);
    expect(usePendingInviteStore.getState().invite?.code).toBe('ABCD2345');
  });

  it('keeps nothing for an incomplete code', async () => {
    await savePendingInvite('ABC', NOW);
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('removes a stale code from the device when it is read', async () => {
    await AsyncStorage.setItem(PENDING_INVITE_KEY, raw('ABCD2345', NOW - PENDING_INVITE_MAX_AGE_MS - 1));
    await loadPendingInvite(NOW);
    expect(usePendingInviteStore.getState()).toEqual({ loaded: true, invite: null });
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });

  it('clears it once used', async () => {
    await savePendingInvite('ABCD2345', NOW);
    await clearPendingInvite();
    expect(usePendingInviteStore.getState().invite).toBeNull();
    expect(await AsyncStorage.getItem(PENDING_INVITE_KEY)).toBeNull();
  });
});
