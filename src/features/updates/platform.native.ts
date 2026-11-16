/**
 * Android and iPhone: the one file that loads expo-updates (AGENTS.md: never call it anywhere
 * else). It answers null, so nothing is ever called, in a development build (where the calls
 * throw ERR_UPDATES_DISABLED), when the library is turned off, and when the native module is
 * missing from the installed app (loading it would throw).
 */
import type * as ExpoUpdates from 'expo-updates';

import type { UpdatesPort } from './port';

type Module = typeof ExpoUpdates;

function load(): Module | null {
  if (__DEV__) return null;
  try {
    // Loaded here and not at the top of the file: a missing native module throws while loading.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-updates') as Module;
    return m.isEnabled ? m : null;
  } catch (error) {
    console.warn('[updates] expo-updates could not be loaded', error);
    return null;
  }
}

export function platformPort(): UpdatesPort | null {
  const U = load();
  if (!U) return null;
  return {
    running: {
      embedded: U.isEmbeddedLaunch,
      emergency: U.isEmergencyLaunch,
      emergencyReason: U.emergencyLaunchReason,
      createdAt: U.createdAt,
      updateId: U.isEmbeddedLaunch ? null : U.updateId,
      runtimeVersion: U.runtimeVersion,
      channel: U.channel,
    },
    check: async () => {
      const r = await U.checkForUpdateAsync();
      return r.isAvailable || r.isRollBackToEmbedded;
    },
    fetch: async () => {
      const r = await U.fetchUpdateAsync();
      return r.isNew || r.isRollBackToEmbedded;
    },
    reload: (backgroundColor) => U.reloadAsync({ reloadScreenOptions: { backgroundColor, fade: true, spinner: { enabled: false } } }),
    pending: () => {
      const c = U.latestContext;
      return { pending: !!c?.isUpdatePending, id: c?.downloadedManifest?.id ?? null };
    },
    onChange: (listener) => {
      const sub = U.addUpdatesStateChangeListener(() => listener());
      return () => sub.remove();
    },
  };
}
