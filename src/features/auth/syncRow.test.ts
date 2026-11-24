import { describe, expect, it } from 'vitest';

import { SYNC_DEMO_STATES, SYNC_DEMOS, syncMark, syncPendingLine, syncStatusLine, type SyncStatus } from './syncRow';

describe("the sync row's key says what its words say", () => {
  it('is the done mark only when nothing waits and the last sync succeeded', () => {
    expect(syncMark({ status: 'idle', pending: 0, synced: true })).toBe('done');
    // Changes wait, a sync runs, or none has run yet: not done.
    expect(syncMark({ status: 'idle', pending: 3, synced: true })).toBe('waiting');
    expect(syncMark({ status: 'idle', pending: 0, synced: false })).toBe('waiting');
    expect(syncMark({ status: 'idle', pending: 3, synced: false })).toBe('waiting');
    expect(syncMark({ status: 'syncing', pending: 0, synced: true })).toBe('waiting');
    expect(syncMark({ status: 'syncing', pending: 3, synced: false })).toBe('waiting');
  });

  it('is the amber key only when sync is paused or the device is offline, whatever waits', () => {
    for (const status of ['error', 'offline'] as SyncStatus[]) {
      for (const pending of [0, 1, 12]) for (const synced of [true, false]) expect(syncMark({ status, pending, synced })).toBe('stopped');
    }
    for (const status of ['idle', 'syncing'] as SyncStatus[]) {
      for (const pending of [0, 1, 12]) for (const synced of [true, false]) expect(syncMark({ status, pending, synced })).not.toBe('stopped');
    }
  });

  it('never shows the done mark beside words that say something waits', () => {
    for (const status of ['idle', 'syncing', 'offline', 'error'] as SyncStatus[]) {
      for (const pending of [0, 1, 3]) {
        for (const when of ['3 min ago', null]) {
          const mark = syncMark({ status, pending, synced: !!when });
          const words = `${syncStatusLine(status, 'a reason', when)} ${syncPendingLine(pending)}`;
          if (mark === 'done') expect(words).toMatch(/^Last synced 3 min ago Everything on this device is backed up\.$/);
          else expect(words).toMatch(/to upload|Syncing now|Not synced yet|Offline|Sync paused/);
        }
      }
    }
  });
});

describe('the words of the sync row', () => {
  it('says the state in the first line', () => {
    expect(syncStatusLine('syncing', null, '2 h ago')).toBe('Syncing now');
    expect(syncStatusLine('offline', null, '2 h ago')).toBe('Offline. Changes upload when you reconnect.');
    expect(syncStatusLine('error', 'The server said no.', '2 h ago')).toBe('Sync paused: The server said no.');
    expect(syncStatusLine('error', null, null)).toBe('Sync paused: unknown error');
    expect(syncStatusLine('idle', null, 'just now')).toBe('Last synced just now');
    expect(syncStatusLine('idle', null, null)).toBe('Not synced yet');
  });

  it('says what waits in a line short enough to sit beside the button at 360 px', () => {
    expect(syncPendingLine(0)).toBe('Everything on this device is backed up.');
    expect(syncPendingLine(1)).toBe('1 change to upload.');
    expect(syncPendingLine(3)).toBe('3 changes to upload.');
    // The status column beside the 116 px button is about 23 letters wide at 360 px.
    expect(syncPendingLine(128).length).toBeLessThanOrEqual(23);
  });
});

describe('the sync row as pictures', () => {
  it('has one demo state for each thing the key can say, and both kinds of stopped', () => {
    const marks = SYNC_DEMOS.map((d) => syncMark({ status: SYNC_DEMO_STATES[d].status, pending: SYNC_DEMO_STATES[d].pending, synced: !!SYNC_DEMO_STATES[d].when }));
    expect(Object.fromEntries(SYNC_DEMOS.map((d, i) => [d, marks[i]]))).toEqual({ synced: 'done', waiting: 'waiting', syncing: 'waiting', paused: 'stopped', offline: 'stopped' });
  });
});
