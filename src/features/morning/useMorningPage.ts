/**
 * Opens the morning page ("Yesterday", /morning) by itself on the first visit of a new day in
 * the morning. Rendered once, by Today (src/app/(tabs)/index.tsx), as `<MorningWatcher />`: a
 * component that draws nothing, so following the route and focus here re-renders only it, never
 * the whole of Today. The decision is the pure rule in ./rule; this hook only gathers its input
 * and acts on 'due'.
 *
 * When it looks:
 * - a cold start: Today's first appearance, when setup was already done in what the device held
 *   at the start (./launch; not after a sign-in or setup during this run);
 * - a return to the front (AppState; on web the page becoming visible) after five minutes or more
 *   away or on another calendar day (`backToTodayOnReturn`), never after a glance at the
 *   notification shade, a call or a quick tab switch; and not on a return on which a downloaded
 *   update is about to start (`yieldsToUpdate`): the restart is a cold start, which looks again;
 * - the person arriving on Today, when an earlier look that day found the app on another tab or a
 *   pushed screen and nothing else stood in the way (`waitsForToday`: someone who left the app on
 *   the diary last night gets the page when they come to Today, not over the diary).
 * The clock passing 04:00 while the app stays in front never opens it. Each look waits SETTLE_MS,
 * so a reminder's or a link's own screen (the reminder handler runs 600 ms into a cold start) is
 * on screen first, and then reads the clock, the store and where the app is, all inside the
 * timeout: nothing here reads the clock while rendering (the React Compiler would cache it). A
 * reminder or a link counts from the moment the look began (or for a cold start, from the app's
 * start), so a slow start-up cannot let the page rise over a reminder's action.
 *
 * Never over or right after something the person did ('acted' in ./rule): from the moment a look
 * begins until it decides (the sync wait included), a screen they open (the route leaving Today), a
 * sheet on screen (asked every POLL_MS while a look is pending) and a record of theirs written on this
 * device (./acted, from every store change) count as acting in this visit, and the page stands down;
 * a look on arriving at Today counts from the start of the look that waited for it, so a screen opened
 * on the way never leads to a page on the way back.
 *
 * When due: for someone signed in it first waits (at most SYNC_WAIT_MS) for a sync round that
 * ends after the look began, and decides again on what it pulled, so a page seen on another
 * device this morning is not shown again. Then it marks the day seen on this device (./seen, its
 * own key, not a store write), and, only when that pull landed, in the synced
 * `settings.morningSeenDay`: settings sync as one object, and writing them before the pull would
 * put this device's overnight-stale copy over a change made elsewhere. Then it pushes /morning,
 * with ?first=1 the very first time. In an automated browser or a test build it never opens
 * unless the test sets `window.__healthcalMorning = true` (./allowed). Nothing here throws.
 */
import * as Linking from 'expo-linking';
import { router, useIsFocused, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { backToTodayOnReturn, type Away } from '@/features/today/backToToday';
import { useUpdatesStatus } from '@/features/updates/updates';
import { addDays, toISODate, today } from '@/lib/dates';
import { lastReminderResponseAt } from '@/services/notifications';
import { syncNow, useSyncState } from '@/services/sync';
import { useStore } from '@/store';
import { useHydration } from '@/store/persistence';
import type { ISODate, SyncedRecord } from '@/types';
import { sheetOnScreen } from '@/ui';

import { wroteByPerson } from './acted';
import { morningAllowed } from './allowed';
import { launch } from './launch';
import { isPlainLink, laterDay, linkToToday, morningVerdict, pulledSince, reminderSince, waitsForToday, yieldsToUpdate, type MorningInput } from './rule';
import { loadSeenDay, markSeenDay } from './seen';

/** How long a look waits for the app to settle before deciding. */
export const SETTLE_MS = 900;
/** A link that arrived this long before a look began, or after, is why the app came to the front. */
const LINK_WINDOW_MS = 3000;
/** For someone signed in, the longest wait for this morning's sync before deciding without it. */
export const SYNC_WAIT_MS = 8000;
/** How often a pending look asks whether a sheet is on screen (a sheet opened and closed again is acting too). */
const POLL_MS = 100;

type LookKind = 'cold' | 'return' | 'today';

/** The link the app was started with: the page's address at the start on web, the launch link natively. */
async function startLink(): Promise<string | null> {
  if (Platform.OS === 'web') return launch.webAddress;
  try {
    return await Linking.getInitialURL();
  } catch {
    return null;
  }
}

function countOn<T extends SyncedRecord & { date: ISODate }>(map: Record<string, T> | undefined, date: ISODate): number {
  let n = 0;
  for (const r of Object.values(map ?? {})) if (r && !r.deleted && r.date === date) n += 1;
  return n;
}

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Runs a sync and waits for it (at most SYNC_WAIT_MS); true when a whole round ended after `since`. */
async function pullFirst(since: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const finished = await Promise.race([
      syncNow().then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), SYNC_WAIT_MS);
      }),
    ]);
    const st = useSyncState.getState();
    return finished && pulledSince(st.status, st.lastRunAt, since);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useMorningPage(): void {
  const hydrated = useHydration((h) => h.status === 'ready');
  const focused = useIsFocused();
  const pathname = usePathname();
  const onToday = focused && pathname === '/';

  // Where the app is, for the timeout to read: kept current by an effect, never read in render.
  const onTodayRef = useRef(false);
  // A look that found the app elsewhere waits for Today on that day (the day it was armed), counting the
  // person's acting from the start of that look.
  const armedDay = useRef<ISODate | null>(null);
  const armedFrom = useRef(0);
  const lookRef = useRef<((kind: LookKind, actedFrom?: number) => void) | null>(null);
  // When the person last did something in the app (./acted, a screen, a sheet): read by the looks, never in render.
  const actedAt = useRef<number | null>(null);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    // A screen or tab opened; arriving back on Today is not acting (it is what a waiting look waits for).
    if (pathname !== '/') actedAt.current = Date.now();
  }, [pathname]);
  useEffect(() => {
    onTodayRef.current = onToday;
    if (!onToday || armedDay.current === null) return;
    const day = armedDay.current;
    armedDay.current = null;
    if (day === today()) lookRef.current?.('today', armedFrom.current);
  }, [onToday]);

  const coldDone = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let deciding = false;
    // A pending look that began as a cold start stays one if a return replaces it.
    let pendingKind: LookKind | null = null;
    let pendingStart = 0;
    let lastLink: { url: string; at: number } | null = null;
    // When and on which day the app left the front (the first non-active state counts).
    let away: Away | null = AppState.currentState !== 'active' ? { at: Date.now(), day: today() } : null;
    // Started without being in front (launched in the background): the cold look waits for the front.
    let coldOnActive = false;
    // While a look is pending or deciding: a sheet on screen counts as acting.
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (sheetOnScreen()) actedAt.current = Date.now();
      }, POLL_MS);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    // A log, an edit or a delete of the person's own (never a pull of older records or a health store's).
    const unsubscribe = useStore.subscribe((next, prev) => {
      const now = Date.now();
      if (wroteByPerson(next, prev, now)) actedAt.current = now;
    });

    const decide = async (kind: LookKind, lookStartedAt: number, actedFrom: number) => {
      if (deciding) return;
      deciding = true;
      try {
        const cold = kind === 'cold';
        // A start-up link counts only when it led to Today itself; a link elsewhere lands there ('elsewhere').
        const linkedCold = cold ? linkToToday(await startLink()) : false;
        const localSeen = await loadSeenDay();
        if (!alive) return;

        const read = () => {
          const now = Date.now();
          const clock = new Date(now);
          // The day and the minutes from one reading of the clock, so 23:59:59.9 cannot mix two days.
          const day = toISODate(clock);
          const s = useStore.getState();
          const yesterday = addDays(day, -1);
          const onboardedAt = s.profile?.onboardedAt;
          const recentLink = lastLink !== null && lastLink.at >= lookStartedAt - LINK_WINDOW_MS && !isPlainLink(lastLink.url);
          const input: MorningInput = {
            today: day,
            minutes: minutesOf(clock),
            allowed: morningAllowed(),
            enabled: s.settings.morningSummary !== false,
            onboardedDay: onboardedAt ? toISODate(new Date(onboardedAt)) : null,
            seenDay: laterDay(localSeen, s.settings.morningSeenDay),
            yesterday: {
              food: countOn(s.foodEntries, yesterday),
              activities: countOn(s.activities, yesterday),
              water: countOn(s.water, yesterday),
            },
            onToday: onTodayRef.current,
            sheetOpen: sheetOnScreen(),
            reminderAt: lastReminderResponseAt(),
            // A cold start: any reminder answered since the app started. Otherwise from just before this look.
            reminderFrom: cold ? reminderSince(launch.at) : reminderSince(lookStartedAt),
            linked: linkedCold || recentLink,
            actedAt: actedAt.current,
            actedFrom,
          };
          return { input, day, verdict: morningVerdict(input) };
        };

        const settled = (r: ReturnType<typeof read>): boolean => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[morning]', kind, r.verdict.reason);
          if (r.verdict.open) return true;
          if (waitsForToday(r.input)) {
            armedDay.current = r.day;
            armedFrom.current = actedFrom;
          }
          return false;
        };

        let r = read();
        if (!settled(r)) return;

        // Signed in: decide on what this morning's pull brings (another device may have shown it already).
        const signedIn = useStore.getState().ownerId !== null;
        let pulled = false;
        if (signedIn) {
          pulled = await pullFirst(lookStartedAt);
          if (!alive) return;
          r = read();
          if (!settled(r)) return;
        }

        const s = useStore.getState();
        const first = localSeen === undefined && s.settings.morningSeenDay === undefined;
        // Marked before the page opens, so nothing can show it twice on this device.
        markSeenDay(r.day);
        if (signedIn && pulled) s.setSettings({ morningSeenDay: r.day });
        router.push((first ? '/morning?first=1' : '/morning') as never);
      } catch (e) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[morning]', e);
      } finally {
        deciding = false;
        stopPoll();
      }
    };

    const look = (kind: LookKind, waitedFrom?: number) => {
      if (deciding) return;
      const startedAt = Date.now();
      const asKind: LookKind = kind === 'cold' || pendingKind === 'cold' ? 'cold' : kind;
      if (timer) clearTimeout(timer);
      if (pendingKind === null) pendingStart = startedAt;
      pendingKind = asKind;
      const from = pendingStart;
      // A cold start counts from the launch; a look on arriving at Today from the look that waited for it.
      const actedFrom = asKind === 'cold' ? Math.min(launch.at, from) : (waitedFrom ?? from);
      startPoll();
      timer = setTimeout(() => {
        timer = null;
        pendingKind = null;
        void decide(asKind, from, actedFrom);
      }, SETTLE_MS);
    };
    lookRef.current = look;

    let appState: { remove: () => void } | null = null;
    let links: { remove: () => void } | null = null;
    try {
      appState = AppState.addEventListener('change', (next) => {
        if (next !== 'active') {
          // iOS passes through 'inactive' on the way to 'background': the first one counts.
          if (!away) away = { at: Date.now(), day: today() };
          return;
        }
        const was = away;
        away = null;
        if (coldOnActive) {
          coldOnActive = false;
          look('cold');
          return;
        }
        const now = Date.now();
        if (!backToTodayOnReturn(was, now, today())) return;
        if (yieldsToUpdate(useUpdatesStatus.getState().pending, was, now)) {
          if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[morning]', 'return', 'update');
          return;
        }
        look('return');
      });
    } catch {
      appState = null;
    }
    try {
      links = Linking.addEventListener('url', ({ url }) => {
        lastLink = { url, at: Date.now() };
      });
    } catch {
      links = null;
    }

    if (!coldDone.current) {
      coldDone.current = true;
      // Setup done in what the device held at the start: not a sign-in or a setup during this run.
      if (launch.onboarded === true) {
        if (away) coldOnActive = true;
        else look('cold');
      }
    }

    return () => {
      alive = false;
      lookRef.current = null;
      if (timer) clearTimeout(timer);
      stopPoll();
      unsubscribe();
      appState?.remove();
      links?.remove();
    };
  }, [hydrated]);
}

/** Draws nothing: Today renders it so the morning page's route and focus subscriptions re-render only this. */
export function MorningWatcher(): null {
  useMorningPage();
  return null;
}
