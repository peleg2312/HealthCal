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

async function pull(userId: string): Promise<void> {
  if (!supabase) return;
  let cursor = useStore.getState().lastPulledAt ?? '1970-01-01T00:00:00Z';
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
    cursor = rows[rows.length - 1].server_updated_at;
    useStore.getState().mergeRemote({
      records: rows
        .filter((r) => (COLLECTIONS as string[]).includes(r.collection))
        .map((r) => ({ collection: r.collection, record: { ...r.data, id: r.id, updatedAt: r.updated_at, deleted: r.deleted } })),
      pulledAt: cursor,
    });
    if (rows.length < PULL_PAGE) break;
  }

  const { data: prof, error: profErr } = await supabase.from('profiles').select('data,settings').eq('user_id', userId).maybeSingle();
  if (profErr) throw new Error(profErr.message);
  if (prof) {
    useStore.getState().mergeRemote({
      records: [],
      profile: (prof.data as Profile | null) ?? null,
      settings: (prof.settings as Settings | null) ?? null,
      pulledAt: cursor,
    });
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
  let lastPending = pendingChanges(useStore.getState());
  const unsub = useStore.subscribe((state) => {
    const pending = pendingChanges(state);
    if (pending > 0 && pending !== lastPending) {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void syncNow(), 2500);
    }
    lastPending = pending;
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
export async function attachUser(userId: string): Promise<void> {
  const s = useStore.getState();
  if (s.ownerId === userId) {
    await syncNow();
    return;
  }
  if (s.ownerId === null) {
    s.setOwner(userId);
    s.markAllDirty();
  } else {
    s.resetAll();
    useStore.getState().setOwner(userId);
  }
  await syncNow();
}
