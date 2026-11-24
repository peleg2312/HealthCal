/**
 * The coach's session: what lives while the app runs and never on the device's storage. The unsent
 * words in the field (`draft`), the typed question on its way to the AI (`busyFor`, from `startedAt`),
 * a question waiting for the consent sheet (`pending`), the answer that just arrived (`arrived`, read
 * once by the screen for its haptic, its scroll and its announcement) and whether an answer arrived
 * while the coach was closed (`unread`, the level line on the header's Coach cup).
 *
 * The request is held here, not by the screen: closing the coach with the X while a question is on its
 * way lets it finish, and the answer is written to the chat (./history.ts) as before. What a typed
 * question sends is unchanged: `buildCoachRequest` (./request.ts) with, only while "Share my week" is on,
 * `buildCoachNote` (./note.ts). A phone answer never comes here.
 */
import { Platform } from 'react-native';
import { create } from 'zustand';

import { planNow, refreshPlanAfterLimit } from '@/features/plan/cache';
import { today } from '@/lib/dates';
import { useStore } from '@/store';

import { coachAgeAllowed } from './age';
import { clearCoachConsent, coachAgreed, COACH_CONSENT_VERSION, loadCoachConsent, useCoachConsent } from './consent';
import { addCoachMessages, useCoachHistory } from './history';
import { aiAnswerMessage, noticeMessage, questionMessage } from './messages';
import { buildCoachNote } from './note';
import { buildCoachRequest, CoachError, postCoach, type CoachConnection, type CoachMessage } from './request';
import { coachConnection } from './send';
import { MESSAGE_MAX, type CoachNoticeKind } from './words';

export interface CoachSessionState {
  /** The words in the field, kept when the coach closes. */
  draft: string;
  /** The id of the typed question on its way to the AI, or null. */
  busyFor: string | null;
  /** When that question left (ms), for the "taking longer" words. */
  startedAt: number | null;
  /** An answer or notice arrived while the coach was not on screen. */
  unread: boolean;
  /** The coach screen is mounted. */
  mounted: boolean;
  /** The question waiting for the consent sheet (and its message id, when it is already in the chat). */
  pending: { text: string; id?: string } | null;
  /** The newest message the session wrote as an answer, until the screen has placed it. */
  arrived: { id: string; kind: 'answer' | 'notice' } | null;
}

const EMPTY: CoachSessionState = { draft: '', busyFor: null, startedAt: null, unread: false, mounted: false, pending: null, arrived: null };

export const useCoachSession = create<CoachSessionState>(() => ({ ...EMPTY }));

export function setCoachDraft(text: string): void {
  useCoachSession.setState({ draft: text.slice(0, MESSAGE_MAX) });
}

/** Where the draft waits while a page reload takes the person through sign-in (the web's Google redirect). */
const DRAFT_KEY = 'healthcal.coachDraft';

function pageSession(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' && 'sessionStorage' in globalThis ? (globalThis as { sessionStorage: Storage }).sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Send with nobody signed in (fix X11): the words stay in the field (the session's draft) while sign-in
 * opens, and on the web also in the page's session storage, which a full-page sign-in (Google's
 * redirect) keeps. Nothing is sent.
 */
export function keepDraftForSignIn(): void {
  const draft = useCoachSession.getState().draft.trim();
  if (!draft) return;
  try {
    pageSession()?.setItem(DRAFT_KEY, draft);
  } catch {
    // Storage blocked: the in-memory draft still holds the words for a sign-in in the same page.
  }
}

const RETURN_KEY = 'healthcal.coachReturn';
let returnToCoach = false;

/**
 * The coach sends the person to sign-in (its Send, its sign-in tile or a notice's "Sign in"): the words
 * are kept, and a mark is left so that a sign-in that succeeds comes back to the coach, not to Today.
 * The mark lives in this page's memory and, on the web, in the page's session storage, so it survives
 * Google's full-page redirect.
 */
export function leaveCoachForSignIn(): void {
  keepDraftForSignIn();
  returnToCoach = true;
  try {
    pageSession()?.setItem(RETURN_KEY, '1');
  } catch {
    // Storage blocked: the in-memory mark still serves a sign-in in the same page.
  }
}

/** Whether a sign-in began in the coach: a plain look that changes nothing. */
export function returnsToCoach(): boolean {
  if (returnToCoach) return true;
  try {
    return !!pageSession()?.getItem(RETURN_KEY);
  } catch {
    return false;
  }
}

/** Whether a sign-in began in the coach. Asked once: the answer clears the mark. */
export function takeReturnToCoach(): boolean {
  let kept = returnToCoach;
  returnToCoach = false;
  try {
    const store = pageSession();
    if (store?.getItem(RETURN_KEY)) {
      kept = true;
      store.removeItem(RETURN_KEY);
    }
  } catch {
    // Nothing more to read.
  }
  return kept;
}

/** Back in the coach: an empty field takes the words kept for sign-in, once. */
export function restoreDraftAfterSignIn(): void {
  let kept: string | null = null;
  try {
    const store = pageSession();
    kept = store?.getItem(DRAFT_KEY) ?? null;
    store?.removeItem(DRAFT_KEY);
  } catch {
    kept = null;
  }
  if (kept && !useCoachSession.getState().draft.trim()) setCoachDraft(kept);
}

/** The screen mounts (true) and unmounts (false). Mounting reads the unread answer (it is in the chat already). */
export function markCoachMounted(on: boolean): void {
  useCoachSession.setState(on ? { mounted: true, unread: false, arrived: null } : { mounted: false });
}

export function markCoachRead(): void {
  if (useCoachSession.getState().unread) useCoachSession.setState({ unread: false });
}

/** The screen placed the arrived answer (scrolled, announced). */
export function clearCoachArrived(): void {
  if (useCoachSession.getState().arrived) useCoachSession.setState({ arrived: null });
}

/** The consent sheet was closed without agreeing: the question stays in the field, nothing is written. */
export function dropCoachPending(): void {
  useCoachSession.setState({ pending: null });
}

/** For tests: back to an empty session. */
export function resetCoachSessionForTests(): void {
  useCoachSession.setState({ ...EMPTY });
}

/** What the session needs from the outside world; replaced in tests. */
export interface CoachDeps {
  connection: () => Promise<CoachConnection | null>;
  post: (body: ReturnType<typeof buildCoachRequest>, c: CoachConnection) => ReturnType<typeof postCoach>;
}

const realDeps: CoachDeps = {
  connection: coachConnection,
  post: (body, c) => postCoach(fetch, body, c),
};

let deps: CoachDeps = realDeps;
/** For tests: the connection and the post. `null` restores the real ones. */
export function setCoachDepsForTests(d: CoachDeps | null): void {
  deps = d ?? realDeps;
}

function written(m: CoachMessage, kind: 'answer' | 'notice'): void {
  addCoachMessages(m);
  const s = useCoachSession.getState();
  useCoachSession.setState({ arrived: { id: m.id, kind }, unread: s.mounted ? s.unread : true });
}

/**
 * Ask the AI: `id` when the question is already in the chat (Try again, or after the consent sheet).
 * 'sent': the question went (its answer or notice is written when it comes back). 'consent': nothing
 * written, the consent sheet must ask first (`pending` holds the question). 'notice': the question and
 * the app's own line were written at once (no account, under 18). 'none': empty, or a question is
 * already on its way.
 */
/** True from the first line of an ask until it has either set `busyFor` or returned: two taps in one tick send once. */
let asking = false;

export async function askCoach(question: string, id?: string): Promise<'sent' | 'consent' | 'notice' | 'none'> {
  // A synchronous guard, taken before the first await: `busyFor` is set only after the connection and
  // the consent are read, so a double tap (on Send or on "Try again") would otherwise pass both checks.
  if (asking) return 'none';
  asking = true;
  try {
    return await askOnce(question, id);
  } finally {
    asking = false;
  }
}

async function askOnce(question: string, id?: string): Promise<'sent' | 'consent' | 'notice' | 'none'> {
  const q = question.trim().slice(0, MESSAGE_MAX);
  if (!q || useCoachSession.getState().busyFor) return 'none';
  const existing = id ? useCoachHistory.getState().messages.find((m) => m.id === id) : undefined;
  const said = existing ?? questionMessage(q, 'typed');
  const answerWith = (kind: CoachNoticeKind): 'notice' => {
    if (!existing) addCoachMessages(said);
    useCoachSession.setState({ draft: '' });
    written(noticeMessage(said, kind), 'notice');
    return 'notice';
  };
  // 18 and over, asked now from the date of birth and today's date; anything else counts as under 18.
  if (!coachAgeAllowed(useStore.getState().profile?.birthDate, today())) return answerWith('under18');
  const connection = await deps.connection();
  if (!connection) return answerWith('account');
  await loadCoachConsent();
  if (!coachAgreed(useCoachConsent.getState())) {
    useCoachSession.setState({ pending: { text: q, id: existing?.id } });
    return 'consent';
  }
  if (useCoachSession.getState().busyFor) return 'none';
  if (!existing) addCoachMessages(said);
  useCoachSession.setState({ draft: '', busyFor: said.id, startedAt: Date.now(), pending: null });
  // What was in the chat before this question: the request takes typed pairs from it, nothing else.
  const before = useCoachHistory.getState().messages.filter((m) => m.id !== said.id);
  // The week, only while sharing is on, built now from what the phone holds.
  const note = useCoachConsent.getState().share ? buildCoachNote(useStore.getState(), today(), Platform.OS) : null;
  void (async () => {
    try {
      // The plan's coach memory (ruling R17): 3 pairs while the plan is not known, 6 on Plus, never more.
      const pairs = planNow().limits.memoryPairs;
      const a = await deps.post(buildCoachRequest({ message: q, messages: before, note, consentVersion: COACH_CONSENT_VERSION, pairs }), connection);
      useCoachSession.setState({ busyFor: null, startedAt: null });
      written(aiAnswerMessage(said, a), 'answer');
    } catch (e) {
      useCoachSession.setState({ busyFor: null, startedAt: null });
      const kind = e instanceof CoachError ? e.kind : 'failed';
      if (kind === 'consent_outdated') {
        // The server asks for the current wording: ask again, then send this question.
        await clearCoachConsent();
        useCoachSession.setState({ pending: { text: q, id: said.id } });
      } else {
        const limit = e instanceof CoachError ? e.limit : null;
        const n = noticeMessage(said, kind);
        written(limit && n.source === 'notice' ? { ...n, limit } : n, 'notice');
        // The server decides the limit: ask it for the plan again, so the link and the memory are current.
        if (kind === 'daily_limit' || kind === 'shared_limit') void refreshPlanAfterLimit();
      }
    }
  })();
  return 'sent';
}
