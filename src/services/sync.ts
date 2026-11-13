/**
 * Sync engine. Local-first: writes land in the store immediately and are
 * flagged dirty; this module pushes them and merges remote changes back.
 * Conflict rule is last-write-wins on the record's client `updatedAt`,
 * enforced on the server inside `push_records`.
 */
import { create } from 'zustand';

import { COLLECTIONS, pendingChanges, useStore } from '@/store';
import type { Collection, Profile, Settings, SyncedRecord } from '@/types';

import { supabase } from './supabase';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncState {
  status: SyncStatus;
  error: string | null;
  lastRunAt: string | null;
}

export const useSyncState = create<SyncState>(() => ({ status: 'idle', error: null, lastRunAt: null }));

const PUSH_CHUNK = 200;
const PULL_PAGE = 1000;

interface RemoteRow {
  collection: Collection;
  id: string;
  data: SyncedRecord;
  deleted: boolean;
  updated_at: string;
  server_updated_at: string;
}

function recordDate(r: SyncedRecord): string | null {
  const d = (r as { date?: unknown }).date;
  return typeof d === 'string' ? d : null;
}

async function push(userId: string): Promise<void> {
  if (!supabase) return;
  const s = useStore.getState();
  const rows: { collection: Collection; id: string; date: string | null; data: SyncedRecord; deleted: boolean; updated_at: string }[] = [];
  for (const c of COLLECTIONS) {
    for (const id of Object.keys(s.dirty[c])) {
      const rec = (s[c] as Record<string, SyncedRecord>)[id];
      if (!rec) continue;
      rows.push({ collection: c, id, date: recordDate(rec), data: rec, deleted: !!rec.deleted, updated_at: rec.updatedAt });
    }
  }
  for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
    const chunk = rows.slice(i, i + PUSH_CHUNK);
    const { error } = await supabase.rpc('push_records', { p_records: chunk });
    if (error) throw new Error(error.message);
    useStore.getState().clearDirty({ ids: chunk.map((r) => ({ collection: r.collection, id: r.id, updatedAt: r.updated_at })) });
  }

  const profile = s.profileDirty ? s.profile : null;
  const settings = s.settingsDirty ? s.settings : null;
  if (profile || settings) {
    const { error } = await supabase.rpc('push_profile', {
      p_profile: profile,
      p_profile_updated_at: profile?.updatedAt ?? null,
      p_settings: settings,
      p_settings_updated_at: settings?.updatedAt ?? null,
    });
    if (error) throw new Error(error.message);
    useStore.getState().clearDirty({ ids: [], profileAt: profile?.updatedAt, settingsAt: settings?.updatedAt });
  }
  void userId;
}

/**
 * Rows committed by a slower transaction can carry a server timestamp slightly
 * older than one already seen, so every pull re-reads a short window before the
 * stored cursor. Merging is idempotent, so the overlap costs only a few rows.
 */
const PULL_OVERLAP_MS = 60_000;

const laterOf = (a: string | null, b: string): string => (a && Date.parse(a) > Date.parse(b) ? a : b);

async function pull(userId: string): Promise<void> {
  if (!supabase) return;
  // The profile comes first: if the connection drops part-way through a long
  // history, the app still knows this is an existing account and not a new user.
  const { data: prof, error: profErr } = await supabase.from('profiles').select('data,settings').eq('user_id', userId).maybeSingle();
  if (profErr) throw new Error(profErr.message);
  if (prof) {
    useStore.getState().mergeRemote({
      records: [],
      profile: (prof.data as Profile | null) ?? null,
      settings: (prof.settings as Settings | null) ?? null,
      pulledAt: useStore.getState().lastPulledAt ?? '1970-01-01T00:00:00Z',
    });
  }

  const stored = useStore.getState().lastPulledAt;
  let cursor = stored ? new Date(Date.parse(stored) - PULL_OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
  // Page through everything newer than the cursor, oldest first.
  for (;;) {
    const { data, error } = await supabase
      .from('records')
      .select('collection,id,data,deleted,updated_at,server_updated_at')
      .eq('user_id', userId)
      .gt('server_updated_at', cursor)
      .order('server_updated_at', { ascending: true })
      .limit(PULL_PAGE);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteRow[];
    if (rows.length === 0) break;
    let batch = rows;
    if (rows.length === PULL_PAGE) {
      // A batch upload shares one server timestamp. If the page ends inside such a
      // group, leave the whole group for the next page so none of it is skipped.
      const lastTs = rows[rows.length - 1].server_updated_at;
      const cut = rows.findIndex((r) => r.server_updated_at === lastTs);
      if (cut > 0) batch = rows.slice(0, cut);
    }
    cursor = batch[batch.length - 1].server_updated_at;
    useStore.getState().mergeRemote({
      records: batch
        .filter((r) => (COLLECTIONS as string[]).includes(r.collection))
        .map((r) => ({ collection: r.collection, record: { ...r.data, id: r.id, updatedAt: r.updated_at, deleted: r.deleted } })),
      pulledAt: laterOf(useStore.getState().lastPulledAt, cursor),
    });
    if (rows.length < PULL_PAGE) break;
  }
}

let running: Promise<void> | null = null;
let rerun = false;

/** Push then pull. Safe to call often: overlapping calls collapse into one follow-up run. */
export function syncNow(): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    let rounds = 0;
    try {
      do {
        rerun = false;
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId || useStore.getState().ownerId !== userId) return;
        useSyncState.setState({ status: 'syncing', error: null });
        await push(userId);
        await pull(userId);
        useSyncState.setState({ status: 'idle', error: null, lastRunAt: new Date().toISOString() });
        // Something edited while this run was in flight (an Undo, a second change to the
        // same record) is still pending: go round again instead of waiting for the next trigger.
        if (pendingChanges(useStore.getState()) > 0 && rounds < 3) rerun = true;
        rounds += 1;
      } while (rerun);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const offline = /network|fetch|timeout|offline/i.test(message);
      useSyncState.setState({ status: offline ? 'offline' : 'error', error: offline ? null : message });
    } finally {
      running = null;
    }
  })();
  return running;
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** Start watching the store and push changes a few seconds after the user stops editing. */
export function startAutoSync(): () => void {
  let last = useStore.getState();
  const unsub = useStore.subscribe((state) => {
    // Compare what is pending by identity: editing the same record twice keeps the
    // count at one but still needs another upload.
    const changed = state.dirty !== last.dirty || (state.profileDirty && state.profile !== last.profile) || (state.settingsDirty && state.settings !== last.settings);
    last = state;
    if (changed && pendingChanges(state) > 0) {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), 2500);
    }
  });
  return () => {
    unsub();
    if (debounce) clearTimeout(debounce);
  };
}

/**
 * Attach the local data to a signed-in user.
 *  - Data created without an account is adopted and uploaded.
 *  - Data that belongs to a different account is cleared before pulling.
 */
export async function attachUser(userId: string, options: { discardOtherAccount?: boolean } = {}): Promise<'ok' | 'failed' | 'blocked'> {
  const s = useStore.getState();
  if (s.ownerId !== userId) {
    // Entries of another account that never reached the server would be erased by
    // switching. Stop and let the user decide instead of losing them silently.
    if (s.ownerId !== null && pendingChanges(s) > 0 && !options.discardOtherAccount) return 'blocked';
    if (s.ownerId === null) {
      s.setOwner(userId);
      s.markAllDirty();
    } else {
      s.resetAll();
      useStore.getState().setOwner(userId);
    }
  }
  await syncNow();
  useStore.getState().rebuildRecents();
  const status = useSyncState.getState().status;
  return status === 'error' || status === 'offline' ? 'failed' : 'ok';
}
