/**
 * Account's sync row: its key mark and its two lines as pure functions (tested in syncRow.test.ts).
 * The screen only places them (src/app/settings/account.tsx).
 *
 * The key says what the words say:
 * - 'done' (filled ink, the app's done mark): nothing waits and the last sync succeeded.
 * - 'waiting' (an ink outline): changes wait to upload, a sync is running, or no sync has run yet.
 * - 'stopped' (the amber key): sync is paused by an error, or the device is offline.
 */

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
export type SyncMark = 'done' | 'waiting' | 'stopped';

export interface SyncRowState {
  status: SyncStatus;
  /** Changes on this device that have not reached the account. */
  pending: number;
  /** True once a sync has succeeded (there is a time to say "Last synced" with). */
  synced: boolean;
}

export function syncMark({ status, pending, synced }: SyncRowState): SyncMark {
  if (status === 'offline' || status === 'error') return 'stopped';
  if (status === 'syncing' || pending > 0 || !synced) return 'waiting';
  return 'done';
}

/** The row's first line. `when` is how long ago the last sync was ("3 min ago"), or null when none has run. */
export function syncStatusLine(status: SyncStatus, error: string | null, when: string | null): string {
  if (status === 'syncing') return 'Syncing now';
  // Two lines beside the button at 360 px, neither ending on one word alone.
  if (status === 'offline') return 'Offline. Changes upload when you reconnect.';
  if (status === 'error') return `Sync paused: ${error ?? 'unknown error'}`;
  return when ? `Last synced ${when}` : 'Not synced yet';
}

/** The row's second line: what waits. Short, so it is one line beside the button at 360 px. */
export function syncPendingLine(pending: number): string {
  if (pending <= 0) return 'Everything on this device is backed up.';
  return `${pending} change${pending === 1 ? '' : 's'} to upload.`;
}

/**
 * The sync row as a picture, for a test build's demo view (`&syncDemo=<state>` beside
 * `?authDemo=signed-in`, read by ./demo.ts): one of each state the key mark can say.
 */
export const SYNC_DEMOS = ['synced', 'waiting', 'syncing', 'paused', 'offline'] as const;
export type SyncDemo = (typeof SYNC_DEMOS)[number];

export interface SyncDemoState {
  status: SyncStatus;
  error: string | null;
  pending: number;
  /** How long ago the last sync was, as the row says it; null for never. */
  when: string | null;
}

export const SYNC_DEMO_STATES: Record<SyncDemo, SyncDemoState> = {
  synced: { status: 'idle', error: null, pending: 0, when: '3 min ago' },
  waiting: { status: 'idle', error: null, pending: 3, when: '2 h ago' },
  syncing: { status: 'syncing', error: null, pending: 3, when: '2 h ago' },
  paused: { status: 'error', error: 'The server could not take the changes right now.', pending: 3, when: '2 h ago' },
  offline: { status: 'offline', error: null, pending: 3, when: '2 h ago' },
};
