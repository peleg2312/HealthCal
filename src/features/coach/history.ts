/**
 * The chat, kept on this phone only: its own key, with its owner, the last 60 messages. Never synced,
 * never in the export, never on the server (which keeps no words).
 *
 * THE OWNER is the profile the chat belongs to (`coachOwner`): the moment its profile was set up,
 * which every device of one account shares. A stored chat whose owner is not the profile now on the
 * phone is dropped when it is read, so one person never sees another's chat on a shared phone.
 *
 * THE WIPE. Whenever the profile goes away (erase this device, sign out, delete the account, the
 * switch to another account, a fresh start after storage could not be read) the chat and the coach's
 * agreement go with it: one subscription started at app start from the root layout (`startCoach`),
 * as health-sync's memory is, because the coach screen may never be mounted. A start that finds no
 * profile (the recovery screen's fresh start) clears it too.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { useStore, type StoreState } from '@/store';

import { clearCoachConsent } from './consent';
import type { CoachMessage } from './request';

export const COACH_HISTORY_KEY = 'healthcal-coach-history';
export const HISTORY_MAX = 60;

/** Whose chat this is: the profile's setup moment, or null with no finished profile. */
export function coachOwner(s: Pick<StoreState, 'profile'>): string | null {
  const at = s.profile?.onboardedAt;
  return at ? `profile:${at}` : null;
}

const ROLES = new Set(['user', 'assistant']);
const SOURCES = new Set(['typed', 'local', 'ai', 'notice']);

function isMessage(m: unknown): m is CoachMessage {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ROLES.has(String(r.role)) || !SOURCES.has(String(r.source)) || typeof r.at !== 'number') return false;
  if (r.source === 'notice') return typeof r.notice === 'string' && typeof r.replyTo === 'string';
  if (typeof r.text !== 'string') return false;
  if (r.role === 'assistant') return typeof r.replyTo === 'string';
  return r.source === 'typed' || r.source === 'local';
}

/** The stored chat for `owner`: empty when it is missing, broken, or someone else's. */
export function readHistory(raw: string | null, owner: string | null): CoachMessage[] {
  if (!raw || !owner) return [];
  try {
    const v = JSON.parse(raw) as { owner?: unknown; messages?: unknown } | null;
    if (!v || v.owner !== owner || !Array.isArray(v.messages)) return [];
    return v.messages.filter(isMessage).slice(-HISTORY_MAX);
  } catch {
    return [];
  }
}

export function writeHistory(owner: string, messages: readonly CoachMessage[]): string {
  return JSON.stringify({ owner, messages: messages.slice(-HISTORY_MAX) });
}

/** The last `HISTORY_MAX`, never starting with an answer whose question was cut off. */
export function capHistory(messages: readonly CoachMessage[]): CoachMessage[] {
  let out = messages.slice(-HISTORY_MAX);
  while (out.length && out[0].role === 'assistant') out = out.slice(1);
  return out;
}

// ------------------------------------------------------------ device store

type State = { loaded: boolean; owner: string | null; messages: CoachMessage[] };
export const useCoachHistory = create<State>(() => ({ loaded: false, owner: null, messages: [] }));

let loading: Promise<void> | null = null;
let loadingFor: string | null = null;

/** Read the chat for the profile now on the phone (again when the profile changed). */
export function loadCoachHistory(): Promise<void> {
  const owner = coachOwner(useStore.getState());
  const cur = useCoachHistory.getState();
  if (cur.loaded && cur.owner === owner) return Promise.resolve();
  if (loading && loadingFor === owner) return loading;
  loadingFor = owner;
  const run = (async () => {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(COACH_HISTORY_KEY);
    } catch {
      raw = null;
    }
    if (coachOwner(useStore.getState()) !== owner) return;
    const now = useCoachHistory.getState();
    const stored = readHistory(raw, owner);
    const ids = new Set(stored.map((m) => m.id));
    // Messages added meanwhile (a button tapped while this was reading) are kept after the stored ones.
    const extra = now.owner === owner ? now.messages.filter((m) => !ids.has(m.id)) : [];
    useCoachHistory.setState({ loaded: true, owner, messages: capHistory([...stored, ...extra]) });
  })();
  loading = run;
  void run.finally(() => {
    if (loading === run) {
      loading = null;
      loadingFor = null;
    }
  });
  return run;
}

async function persist(): Promise<void> {
  const { owner, messages } = useCoachHistory.getState();
  if (!owner) return;
  if (messages.length === 0) await AsyncStorage.removeItem(COACH_HISTORY_KEY).catch(() => {});
  else await AsyncStorage.setItem(COACH_HISTORY_KEY, writeHistory(owner, messages)).catch(() => {});
}

/** Add messages to the chat of the profile now on the phone. Nothing is kept without a profile. */
export function addCoachMessages(...messages: CoachMessage[]): void {
  const owner = coachOwner(useStore.getState());
  if (!owner) return;
  const cur = useCoachHistory.getState();
  const base = cur.owner === owner ? cur.messages : [];
  const loaded = cur.owner === owner && cur.loaded;
  useCoachHistory.setState({ loaded, owner, messages: capHistory([...base, ...messages]) });
  // Saved once the stored chat has been read and merged, so an early tap never writes over it.
  void loadCoachHistory().then(persist);
}

/** Take messages out of the chat (a failed send's line, before it is tried again). */
export function removeCoachMessages(ids: readonly string[]): void {
  const drop = new Set(ids);
  const cur = useCoachHistory.getState();
  useCoachHistory.setState({ messages: cur.messages.filter((m) => !drop.has(m.id)) });
  void persist();
}

/** Put a chat back as it was (the Undo of "Clear chat"). */
export function restoreCoachMessages(owner: string | null, messages: CoachMessage[]): void {
  if (!owner || owner !== coachOwner(useStore.getState())) return;
  useCoachHistory.setState({ loaded: true, owner, messages: capHistory(messages) });
  void persist();
}

/** "Clear chat": the messages only; the agreement and the switch stay. */
export async function clearCoachHistory(): Promise<void> {
  useCoachHistory.setState({ messages: [] });
  await AsyncStorage.removeItem(COACH_HISTORY_KEY).catch(() => {});
}

/** The profile went away (or the agreement was withdrawn): the chat and the coach's agreement both go. */
export async function clearCoach(): Promise<void> {
  loading = null;
  loadingFor = null;
  useCoachHistory.setState({ loaded: false, owner: null, messages: [] });
  await Promise.all([AsyncStorage.removeItem(COACH_HISTORY_KEY).catch(() => {}), clearCoachConsent()]);
}

let started: (() => void) | null = null;

/**
 * Call once at app start, after the stored data was read (the root layout). Returns the way to stop,
 * for tests. Clears at once when there is no profile, then whenever the profile goes away.
 */
export function startCoach(): () => void {
  if (started) return started;
  if (!useStore.getState().profile) void clearCoach();
  const unsub = useStore.subscribe((state, before) => {
    if (before.profile && !state.profile) void clearCoach();
  });
  started = () => {
    unsub();
    started = null;
  };
  return started;
}
