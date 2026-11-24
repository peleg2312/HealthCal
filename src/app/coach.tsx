import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { plusLimitOf } from '@/features/ai/limit';
import { coachAgeAllowed } from '@/features/coach/age';
import { CoachBubble } from '@/features/coach/CoachBubble';
import { CoachMark } from '@/features/coach/CoachMark';
import { CoachSheet } from '@/features/coach/CoachSheet';
import { agreeToCoach, coachAgreed, loadCoachConsent, setCoachShare, useCoachConsent } from '@/features/coach/consent';
import { composerLines, composerMode, sendActive } from '@/features/coach/composer';
import { firstSentence } from '@/features/coach/format';
import { addCoachMessages, clearCoachHistory, coachOwner, loadCoachHistory, removeCoachMessages, restoreCoachMessages, useCoachHistory } from '@/features/coach/history';
import { IdeasCard } from '@/features/coach/IdeasCard';
import { ideasAnswer, trainingAnswer } from '@/features/coach/local';
import { localAnswerMessage, questionMessage } from '@/features/coach/messages';
import { questionFor, REPORT_DEMO } from '@/features/coach/report';
import { shownAnswer, type CoachMessage } from '@/features/coach/request';
import { askCoach, clearCoachArrived, dropCoachPending, leaveCoachForSignIn, markCoachMounted, restoreDraftAfterSignIn, setCoachDraft, takeReturnToCoach, useCoachSession } from '@/features/coach/session';
import { SendCup } from '@/features/coach/SendCup';
import { coachHello, coachStarters, followUps, helloLine, messageDay, shareLine, weekNumbers, type FollowUp } from '@/features/coach/starters';
import { StarterRow, StarterTile } from '@/features/coach/StarterTile';
import { TrainingCard } from '@/features/coach/TrainingCard';
import { WAIT_SHOW_AFTER_MS } from '@/features/coach/waiting';
import { WaitingRow } from '@/features/coach/WaitingRow';
import {
  ABOUT_OPEN_LABEL,
  AI_TILE_CAPTION,
  CHAT_CLEARED,
  coachPlansLink,
  COACH_TITLE,
  COUNT_FROM,
  countLine,
  DAY_TODAY,
  DAY_YESTERDAY,
  DISCLAIMER,
  FOLLOW_SHARE,
  INPUT_LABEL,
  INPUT_PLACEHOLDER_NARROW,
  INPUT_PLACEHOLDER_NO_BACKEND,
  INPUT_PLACEHOLDER_NO_BACKEND_SHORT,
  INPUT_PLACEHOLDER_SIGN_IN,
  LOCAL_TRAINING_QUESTION,
  localIdeasQuestion,
  MESSAGE_MAX,
  NOTICE,
  PHONE_TILE_CAPTION,
  SEND_LABEL,
  SEND_OFF_LABEL,
  SEND_SIGN_IN_LABEL,
  SIGN_IN_CAPTION,
  SIGN_IN_STARTER,
} from '@/features/coach/words';
import { hasFoodLogged } from '@/features/drinks/via';
import { mealOnDay } from '@/features/food/addedTo';
import { logItems } from '@/features/food/log';
import { checkoutShown, PLAN_ROUTE, planVisible, usePlan } from '@/features/plan';
import { FitsSheet } from '@/features/today/FitsSheet';
import { greetingTitle } from '@/features/today/greetingTitle';
import { mealIdeas, type MealIdea } from '@/features/today/ideas';
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatShortDate, greeting, today } from '@/lib/dates';
import { mealForTime } from '@/lib/nutrition';
import { useAuth } from '@/services/auth';
import { isBackendConfigured } from '@/services/supabase';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useDay, useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { AnimatedItem, AnimatedList, Chip, FadeUp, haptic, Header, IconButton, isReducedMotion, Screen, Text, TextField, toast, useReducedMotion } from '@/ui';

/**
 * The coach (`/coach`, a task screen that rises from the bottom; spec r14): a greeting from the coach's
 * cup with one true line from the person's week and four starter tiles beside the field, then the chat.
 * Two questions are answered on this phone from the person's own data, free and at once (drawn live
 * as cards: the training chart, the idea rows that log with one tap). A typed question (or an AI
 * starter) goes to the AI coach through `askCoach` (@/features/coach/session), which holds the request,
 * so closing the coach while it is on its way loses nothing; what it sends is unchanged:
 * `buildCoachRequest` and, while "Share my week" is on, `buildCoachNote`. The phone's answers never
 * leave it. The chat is kept on this phone (@/features/coach/history), cleared from "What the coach
 * sees" and whenever the profile goes away.
 *
 * `?ask=training|ideas` answers that phone question on arrival (Train's overview "Ask the coach").
 * Test-hook builds only (a development build, or EXPO_PUBLIC_E2E): `?consentDemo=1` opens the consent
 * sheet, `?reportDemo=1` shows one typed question with an AI answer (never stored), and `?waitDemo=1`
 * (or `long`, past 10 s) one typed question with the waiting row, so a build without accounts shows them.
 */
const CONSENT_HOOK = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1';

/** A phone answer asked again by `?ask=` within this long of the same one is not asked twice. */
const ASK_AGAIN_MS = 10 * 60_000;
/** The answer's first line rests this far under the header. */
const TOP_GAP = 12;
/**
 * The hero's two sizes (fix X6): on a window 700 px tall or more, the 56 x 72 cup and the greeting at
 * the tab title's 26 px; under it, ruling L2's 44 x 56 cup and h2 (22 px).
 */
const TALL = 700;
/** The room the hero needs over the starters: with the cup, and with the greeting and the line alone. */
const HERO_FULL = { tall: 214, short: 190 } as const;
const HERO_TEXT = 100;
/** The greeting at the tab title's size: its font size, line height and tracking (TabHeader's). */
const HELLO_TALL = { fontSize: 26, lineHeight: 32, letterSpacing: -0.65 } as const;
/**
 * The field's inner width from which "Typed questions need the app with an account" fits on its one
 * line (334 px drawn, measured in the browser, plus 4): a tablet or a desktop window. A phone's field
 * (192 px inner at 320, 232 at 360, 262 at 390) shows "Typing needs an account" (178 px). "Sign in to
 * ask the AI coach" is 188 px and fits all three.
 */
const NO_BACKEND_ROOM = 338;

/** Ruling L1's greeting, cut to fit the screen's width at the hero's size. */
function heroTitle(g: string, name: string, width: number, size: number): string {
  // 8 px kept back: the hero is set a little looser than the tab title `titleWidth` measures.
  return greetingTitle(g, name, Math.min(width, 560) - 40 - 8, size, true);
}

/** Hide from sight, keep for screen readers (the web's live announcement). */
const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const;

export default function CoachScreen() {
  const { colors, spacing } = useTheme();
  const { width, height: windowH } = useWindowDimensions();
  const reduce = useReducedMotion();
  const todayDate = useToday();
  const now = useNow();
  const meal = mealForTime(now);
  const day = useDay(todayDate);
  const activities = useLive('activities');
  const entries = useLive('foodEntries');
  const savedMeals = useLive('savedMeals');
  const profile = useStore((s) => s.profile);
  const owner = useStore((s) => coachOwner(s));
  const history = useCoachHistory();
  const session = useAuth((s) => s.session);
  const plan = usePlan();
  const params = useLocalSearchParams<{ consentDemo?: string; reportDemo?: string; waitDemo?: string; ask?: string }>();
  const draft = useCoachSession((s) => s.draft);
  const busyFor = useCoachSession((s) => s.busyFor);
  const startedAt = useCoachSession((s) => s.startedAt);
  const pending = useCoachSession((s) => s.pending);
  const busy = busyFor !== null;

  const stored = history.owner === owner ? history.messages : [];
  // The demo answer is dated now (the clock hook's minute), so it reads as part of today's chat.
  const waitDemo = CONSENT_HOOK && (params.waitDemo === '1' || params.waitDemo === 'long') ? params.waitDemo : null;
  const messages: CoachMessage[] =
    CONSENT_HOOK && params.reportDemo === '1'
      ? [...stored, ...REPORT_DEMO.map((m) => ({ ...m, at: now.getTime() }))]
      : waitDemo
        ? [...stored, { ...REPORT_DEMO[0], at: now.getTime() }]
        : stored;
  const share = useCoachConsent((s) => s.share);
  const consent = useCoachConsent((s) => s.consent);
  const agreed = coachAgreed({ consent });
  // "Sees your week" only once the coach has been agreed to and sharing is on: before the agreement nothing is sent.
  const seesWeek = share && agreed;
  const ageOk = coachAgeAllowed(profile?.birthDate, todayDate);
  const signedIn = !!session;
  const demo = CONSENT_HOOK && (params.reportDemo === '1' || !!waitDemo);
  // In the demos the composer reads as it would for a signed-in person, like the header (an AI answer is on screen).
  const mode = demo ? 'send' : composerMode({ backend: isBackendConfigured, signedIn });
  // Test-hook demos show an AI answer: the header says what a signed-in person would see (fix X10).


  const [sheet, setSheet] = useState<'ask' | 'review' | null>(() => (CONSENT_HOOK && params.consentDemo === '1' ? 'ask' : null));
  // The consent sheet shows whenever a question waits for it (a send, or the server asking for the current wording).
  const sheetMode = pending ? 'ask' : sheet;
  const focused = useIsFocused();
  /** The consent sheet's own switch until the person agrees; null reads the stored one. */
  const [askShareSet, setAskShare] = useState<boolean | null>(null);
  const askShare = askShareSet ?? share;
  const [fitsOpen, setFitsOpen] = useState(false);
  /** Ideas added from the chat this session (keyed `idea:<key>`), with the entries they wrote. */
  const [added, setAdded] = useState<{ key: string; kcal: number; ids: string[] }[]>([]);
  /** The waiting row shows 300 ms after a send: the question it waits for. */
  const [waitFor, setWaitFor] = useState<string | null>(null);
  /** Ruling L6: the AI answer under which "Let the coach see my week" is offered, once per opening. */
  const [shareChipFor, setShareChipFor] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [chatH, setChatH] = useState(0);
  const [startersH, setStartersH] = useState(0);
  /** The field's inner width, for its height in lines on the web (`composerLines`). */
  const [fieldW, setFieldW] = useState(0);
  /** The answer that arrived while this screen was open: its blocks fade up (ruling L5). */
  const [fresh, setFresh] = useState<string | null>(null);

  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  /** Where each message sits in the scroll content (its wrapper's y), for the scroll to an answer. */
  const tops = useRef(new Map<string, number>());
  const toEnd = useRef<'jump' | 'smooth' | null>('jump');
  const scrollTo = useRef<string | null>(null);
  const dragged = useRef(false);
  const asked = useRef(false);
  /** Ruling L6's chip is offered once per opening of the chat. */
  const shareChipTaken = useRef(false);

  useEffect(() => {
    void loadCoachHistory();
    void loadCoachConsent();
  }, [owner]);

  useEffect(() => {
    markCoachMounted(true);
    return () => markCoachMounted(false);
  }, []);

  // Back from sign-in (fix X11): words kept through a full-page sign-in come back into an empty field. Never sent by themselves.
  useEffect(() => {
    if (signedIn) restoreDraftAfterSignIn();
  }, [signedIn]);

  // The coach is in front again: a sign-in that was left (or has just brought the person back) is over.
  useEffect(() => {
    if (focused) takeReturnToCoach();
  }, [focused]);

  // The waiting row, 300 ms after a send.
  useEffect(() => {
    if (!busyFor) return;
    const t = setTimeout(() => setWaitFor(busyFor), WAIT_SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [busyFor]);

  const placeAt = (y: number) => {
    scrollTo.current = null;
    toEnd.current = null;
    const animated = !isReducedMotion();
    requestAnimationFrame(() => scroller.current?.scrollTo({ y: Math.max(0, y - TOP_GAP), animated }));
  };

  // An answer (or the app's line) arrived while the coach is open: the haptic, the scroll to its first
  // line, the announcement, and its blocks fading up. Read from the session as it changes (a subscription).
  useEffect(
    () =>
      useCoachSession.subscribe((s, before) => {
        const arrived = s.arrived;
        if (!arrived || arrived === before.arrived) return;
        clearCoachArrived();
        const m = useCoachHistory.getState().messages.find((x) => x.id === arrived.id);
        if (!m) return;
        if (arrived.kind === 'notice') haptic.warn();
        else haptic.tap();
        if (m.source === 'ai') {
          setFresh(m.id);
          if (!shareChipTaken.current && !useCoachConsent.getState().share) {
            shareChipTaken.current = true;
            setShareChipFor(m.id);
          }
          const sentence = firstSentence(shownAnswer(m));
          if (Platform.OS === 'web') {
            setAnnounce(sentence);
            setTimeout(() => setAnnounce(''), 1000);
          } else AccessibilityInfo.announceForAccessibility(sentence);
        }
        if (dragged.current) return;
        scrollTo.current = m.id;
        const y = tops.current.get(m.id);
        if (y !== undefined) placeAt(y);
      }),
    [],
  );

  // ------------------------------------------------------------------ what the chat holds today
  const isToday = (m: CoachMessage) => messageDay(m.at) === todayDate;
  const anyToday = messages.some(isToday);
  const newest = messages.length ? messages[messages.length - 1] : null;

  // The newest of each kind carries the plain testID (the ones a test or a person reaches for).
  const lastIndex = (f: (m: CoachMessage) => boolean) => {
    for (let i = messages.length - 1; i >= 0; i--) if (f(messages[i])) return i;
    return -1;
  };
  const lastLocal = lastIndex((m) => m.role === 'assistant' && m.source === 'local');
  const lastAi = lastIndex((m) => m.source === 'ai');
  const lastNotice = lastIndex((m) => m.source === 'notice');
  const lastQuestion = lastIndex((m) => m.role === 'user' && m.source === 'typed');
  const idFor = (m: CoachMessage, i: number): string => {
    if (m.role === 'user') return i === lastQuestion ? 'coach-question' : `coach-question-${i}`;
    if (m.source === 'local') return i === lastLocal ? 'coach-local-answer' : `coach-local-answer-${i}`;
    if (m.source === 'ai') return i === lastAi ? 'coach-answer' : `coach-answer-${i}`;
    return i === lastNotice ? 'coach-notice' : `coach-notice-${i}`;
  };

  // ------------------------------------------------------------------ the ideas, ranked against what was left when the first was added
  const liveIds = new Set(entries.map((e) => e.id));
  const stillAdded = added.filter((a) => a.ids.some((id) => liveIds.has(id)));
  const isAdded = (key: string) => stillAdded.some((a) => a.key === key);
  const ideasBudget = day.remaining + stillAdded.reduce((s, a) => s + a.kcal, 0);
  const ideas = mealIdeas({ entries, savedMeals, meal, date: todayDate, today: todayDate, kcalLeft: ideasBudget, proteinGap: false });

  const addIdea = (idea: MealIdea) => {
    // Always today (the coach has no other day); the toast is What fits' own wording.
    const where = mealOnDay(meal, todayDate, today());
    const written = logItems(idea.items, meal, todayDate, idea.kind === 'past' ? `Added to ${where}` : `${isolateRtl(idea.name)} added to ${where}`);
    if (written.length) setAdded((a) => [...a, { key: `idea:${idea.key}`, kcal: idea.kcal, ids: written.map((e) => e.id) }]);
  };

  // ------------------------------------------------------------------ actions
  // The tiles, chips and the send cup give their own haptic (the kit's press), so these add none.
  const answerHere = (topic: 'training' | 'ideas') => {
    const q = questionMessage(topic === 'training' ? LOCAL_TRAINING_QUESTION : localIdeasQuestion(meal), 'local');
    const a = localAnswerMessage(q, topic, topic === 'training' ? trainingAnswer(activities, today()) : ideasAnswer(ideas, meal, ideasBudget));
    addCoachMessages(q, a);
    dragged.current = false;
    toEnd.current = null;
    scrollTo.current = a.id;
  };

  /** Every way from the coach to sign-in: the words are kept and a successful sign-in comes back here. */
  const toSignIn = () => {
    leaveCoachForSignIn();
    router.push('/auth?mode=signin' as never);
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    if (mode === 'off') return;
    if (mode === 'sign-in') {
      // The words stay in the field; sign-in opens; the next Send, signed in, goes the normal way (fix X11).
      Keyboard.dismiss();
      toSignIn();
      return;
    }
    if (busy) return;
    dragged.current = false;
    toEnd.current = 'smooth';
    void askCoach(q).then((r) => {
      // The consent sheet rises with the keyboard down.
      if (r === 'consent') Keyboard.dismiss();
    });
  };

  /** An AI starter (ruling L4): sent at once when the coach is agreed to; otherwise the path of a typed send, with the words in the field. */
  const starter = (q: string) => {
    if (busy) return;
    if (!agreed) setCoachDraft(q);
    send(q);
  };

  const agree = async () => {
    const p = useCoachSession.getState().pending;
    setSheet(null);
    setAskShare(null);
    dropCoachPending();
    await agreeToCoach(askShare);
    if (p) {
      dragged.current = false;
      toEnd.current = 'smooth';
      void askCoach(p.text, p.id);
    }
  };

  const clear = () => {
    const snapshot = { owner: history.owner, messages: [...stored] };
    void clearCoachHistory();
    toast(CHAT_CLEARED, { label: 'Undo', onPress: () => restoreCoachMessages(snapshot.owner, snapshot.messages) });
  };

  const retryFor = (m: CoachMessage, i: number) => {
    if (busy || m.source !== 'notice' || i !== messages.length - 1 || !NOTICE[m.notice].retry) return undefined;
    const q = messages.find((x) => x.id === m.replyTo);
    if (!q || q.role !== 'user') return undefined;
    return () => {
      removeCoachMessages([m.id]);
      dragged.current = false;
      toEnd.current = 'smooth';
      void askCoach(q.text, q.id);
    };
  };

  // `?ask=training|ideas`: that phone question once, on arrival, unless it was just answered.
  useEffect(() => {
    if (asked.current || !history.loaded) return;
    const topic = params.ask === 'training' || params.ask === 'ideas' ? params.ask : null;
    if (!topic) return;
    asked.current = true;
    if (!justAnswered(topic)) answerHere(topic);
    router.setParams({ ask: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.loaded, params.ask]);

  // ------------------------------------------------------------------ the first view
  const week = weekNumbers(activities, todayDate);
  const foodToday = hasFoodLogged(day.entries);
  const name = profile?.name ?? '';
  const tall = windowH >= TALL;
  const hello = heroTitle(greeting(now), name, width, tall ? HELLO_TALL.fontSize : 22) || coachHello(greeting(now), name);
  const line = helloLine({ sessions: week.sessions, minutes: week.minutes, kcalLeft: profile ? day.remaining : null, foodToday });
  const proteinShare = day.macros.proteinG > 0 ? day.eaten.protein / day.macros.proteinG : 1;
  const aiStarters = coachStarters({ workoutToday: activities.some((a) => a.date === todayDate), proteinShare, hour: now.getHours() });
  const aiAllowed = signedIn && ageOk;
  const room = chatH - startersH;
  const showMark = windowH >= 600 && (chatH === 0 || room >= HERO_FULL[tall ? 'tall' : 'short']);
  const showLine = chatH === 0 || room >= HERO_TEXT;

  const follow: FollowUp[] = anyToday ? followUps(newest, todayDate, { busy: busy || !!waitDemo, offerShare: !!newest && newest.id === shareChipFor && !seesWeek && signedIn }) : [];

  // ------------------------------------------------------------------ the chat's rows, with a divider before each day
  const rows: React.ReactNode[] = [];
  let lastDay: ISODate | null = null;
  messages.forEach((m, i) => {
    const d = messageDay(m.at);
    if (d !== lastDay) {
      lastDay = d;
      rows.push(
        <Text key={`day-${d}`} variant="caption" color="textTertiary" align="center" testID={`coach-day-${d}`} style={{ marginTop: rows.length ? spacing.xl : spacing.sm, marginBottom: 0 }}>
          {d === todayDate ? DAY_TODAY : d === addDays(todayDate, -1) ? DAY_YESTERDAY : formatShortDate(d)}
        </Text>,
      );
    }
    const prev = i > 0 ? messages[i - 1] : null;
    const gap = !prev || messageDay(prev.at) !== d ? spacing.md : m.role === 'user' ? spacing.xl : spacing.md;
    const live =
      m.source === 'local' && m.role === 'assistant' && i === lastLocal && isToday(m) ? (
        m.topic === 'training' ? (
          <TrainingCard activities={activities} today={todayDate} />
        ) : (
          <IdeasCard ideas={ideas} meal={meal} kcalLeft={ideasBudget} isAdded={isAdded} onAdd={(k) => ideas.ideas[k] && addIdea(ideas.ideas[k])} onFits={() => setFitsOpen(true)} />
        )
      ) : undefined;
    rows.push(
      <View
        key={m.id}
        style={{ marginTop: gap }}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          tops.current.set(m.id, y);
          if (scrollTo.current === m.id) placeAt(y);
        }}>
        <AnimatedItem>
          <CoachBubble
            message={m}
            testID={idFor(m, i)}
            live={live}
            arrive={m.id === fresh}
            onRetry={retryFor(m, i)}
            onSignIn={m.source === 'notice' && m.notice === 'account' && i === lastNotice ? toSignIn : undefined}
            onPlans={
              // One quiet link, on the newest limit notice of the free plan, where the plan is shown at all (R14, R15, R19).
              m.source === 'notice' && m.notice === 'daily_limit' && m.limit?.plan === 'free' && i === lastNotice && planVisible(plan) && checkoutShown()
                ? { label: coachPlansLink(plusLimitOf(plan, 'questions')), onPress: () => router.push(PLAN_ROUTE as never) }
                : undefined
            }
            report={m.source === 'ai' ? { index: i, question: questionFor(m, messages) } : undefined}
          />
        </AnimatedItem>
      </View>,
    );
  });

  const header = (
    <Header
      title={COACH_TITLE}
      subtitle={shareLine(demo ? { signedIn: true, ageOk: true, agreed, share } : { signedIn, ageOk, agreed, share })}
      close
      right={
        <IconButton testID="coach-about" accessibilityLabel={ABOUT_OPEN_LABEL} onPress={() => setSheet('review')}>
          <Info size={20} color={colors.text} strokeWidth={1.9} />
        </IconButton>
      }
    />
  );

  const canSend = sendActive(mode, draft, busy);
  const placeholder =
    mode === 'off'
      ? fieldW > 0 && fieldW - 28 >= NO_BACKEND_ROOM
        ? INPUT_PLACEHOLDER_NO_BACKEND
        : INPUT_PLACEHOLDER_NO_BACKEND_SHORT
      : mode === 'sign-in'
        ? INPUT_PLACEHOLDER_SIGN_IN
        : INPUT_PLACEHOLDER_NARROW;
  const webEnter =
    Platform.OS === 'web'
      ? {
          onKeyPress: (e: { nativeEvent: { key?: string; shiftKey?: boolean }; preventDefault?: () => void }) => {
            // Enter sends with a keyboard and a mouse; on a touch screen Return makes a new line, as in the apps.
            if (e.nativeEvent.key !== 'Enter' || e.nativeEvent.shiftKey || !finePointer()) return;
            e.preventDefault?.();
            haptic.tap();
            send(draft);
          },
        }
      : null;
  const footer = (
    <View style={{ gap: spacing.xs }}>
      {draft.length >= COUNT_FROM ? (
        <Text variant="caption" color="textSecondary" align="right" testID="coach-count">
          {countLine(draft.length)}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
        <TextField
          testID="coach-input"
          accessibilityLabel={INPUT_LABEL}
          placeholder={placeholder}
          value={draft}
          onChangeText={setCoachDraft}
          maxLength={MESSAGE_MAX}
          multiline
          // The web's text area does not grow by itself: its lines from the words (rows 1, so it starts as one line).
          lines={Platform.OS === 'web' ? composerLines(draft, fieldW - 28) : 1}
          scrollEnabled
          onLayout={(e) => setFieldW(Math.round(e.nativeEvent.layout.width))}
          {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
          {...(webEnter as object)}
          style={{ flex: 1, maxHeight: 5 * 22 + 24 + 3 }}
        />
        <SendCup
          testID="coach-send"
          active={canSend}
          accessibilityLabel={mode === 'off' ? SEND_OFF_LABEL : mode === 'sign-in' ? SEND_SIGN_IN_LABEL : SEND_LABEL}
          onPress={() => send(draft)}
        />
      </View>
    </View>
  );

  return (
    <Screen header={header} footer={footer} scroll={false} testID="coach-screen">
      <ScrollView
        ref={scroller}
        testID="coach-chat"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setChatH(Math.round(e.nativeEvent.layout.height))}
        onScrollBeginDrag={() => {
          dragged.current = true;
        }}
        // A short conversation sits at the bottom, by the field and the thumb, as in every messaging app (fix X7).
        contentContainerStyle={{ flexGrow: 1, justifyContent: anyToday ? 'flex-end' : undefined, paddingTop: spacing.sm, paddingBottom: spacing.lg }}
        onContentSizeChange={() => {
          if (toEnd.current) {
            const animated = toEnd.current === 'smooth' && !reduce;
            toEnd.current = null;
            scroller.current?.scrollToEnd({ animated });
          }
        }}>
        <AnimatedList key={owner ?? 'none'}>{rows}</AnimatedList>

        {anyToday ? null : (
          <>
            {/* The hero: the coach's cup, the greeting, one true line; centred in the room above the starters. */}
            <View testID="coach-hello" style={{ flexGrow: 1, minHeight: spacing.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg }}>
              {showMark ? <CoachMark size={tall ? 'heroTall' : 'hero'} level={0.6} animate memoryKey={`coach-hero-${now.getTime()}`} testID="coach-hero-mark" style={{ marginBottom: tall ? spacing.md : spacing.xs }} /> : null}
              <Text variant="h2" align="center" numberOfLines={1} accessibilityRole="header" style={tall ? HELLO_TALL : null}>
                {hello}
              </Text>
              {showLine ? (
                // The week and today on a line each, centred (one sentence for a screen reader).
                <Text variant="body" color="textSecondary" align="center" numberOfLines={2} testID="coach-hello-line" accessibilityLabel={line} style={{ maxWidth: 320 }}>
                  {line.split(' · ').join('\n')}
                </Text>
              ) : null}
            </View>

            <View testID="coach-empty" style={{ gap: spacing.sm }} onLayout={(e) => setStartersH(Math.round(e.nativeEvent.layout.height))}>
              <StarterRow testID="coach-group-phone">
                <StarterTile
                  testID="coach-local-training"
                  question={LOCAL_TRAINING_QUESTION}
                  caption={PHONE_TILE_CAPTION}
                  keyColor={colors.exercise}
                  keyVariant="filled"
                  onPress={() => answerHere('training')}
                />
                <StarterTile
                  testID="coach-local-ideas"
                  question={localIdeasQuestion(meal)}
                  caption={PHONE_TILE_CAPTION}
                  keyColor={colors.calories}
                  keyVariant="filled"
                  onPress={() => answerHere('ideas')}
                />
              </StarterRow>
              {aiAllowed ? (
                <StarterRow testID="coach-group-ai">
                  {aiStarters.map((q, i) => (
                    <StarterTile key={q} testID={`coach-ai-starter-${i}`} question={q} caption={AI_TILE_CAPTION} keyColor={colors.primary} keyVariant="outline" onPress={() => starter(q)} />
                  ))}
                </StarterRow>
              ) : !signedIn && isBackendConfigured ? (
                <StarterRow testID="coach-group-ai">
                  <StarterTile
                    testID="coach-sign-in-starter"
                    question={SIGN_IN_STARTER}
                    caption={SIGN_IN_CAPTION}
                    keyColor={colors.primary}
                    keyVariant="outline"
                    onPress={toSignIn}
                  />
                </StarterRow>
              ) : null}
              <Text variant="caption" color="textSecondary" align="center" testID="coach-disclaimer" style={{ marginTop: spacing.xs }}>
                {DISCLAIMER}
              </Text>
            </View>
          </>
        )}

        {(busy && waitFor === busyFor) || waitDemo ? (
          <View style={{ marginTop: spacing.md }}>
            <WaitingRow shared={seesWeek} startedAt={waitDemo === 'long' ? 1 : waitDemo ? null : startedAt} />
          </View>
        ) : null}

        {follow.length ? (
          <FadeUp index={1} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md, marginTop: spacing.md }} testID="coach-follow">
            {follow.map((f) =>
              f === 'share' ? (
                <Chip key={f} testID="coach-follow-share" label={FOLLOW_SHARE} onPress={() => setSheet('review')} />
              ) : f === 'training' ? (
                <Chip key={f} testID="coach-local-training" label={LOCAL_TRAINING_QUESTION} onPress={() => answerHere('training')} />
              ) : (
                <Chip key={f} testID="coach-local-ideas" label={localIdeasQuestion(meal)} onPress={() => answerHere('ideas')} />
              ),
            )}
          </FadeUp>
        ) : null}

        {Platform.OS === 'web' ? (
          <Text testID="coach-announce" style={HIDDEN} {...({ 'aria-live': 'polite' } as object)}>
            {announce}
          </Text>
        ) : null}
      </ScrollView>

      <CoachSheet
        // Only the coach screen in front shows a sheet: the question held for the consent lives in the session,
        // which a second copy of this screen left under sign-in also reads, and its sheet would rise as well.
        visible={sheetMode !== null && focused}
        mode={sheetMode ?? 'review'}
        share={sheetMode === 'ask' ? askShare : share}
        onShare={(on) => (sheetMode === 'ask' ? setAskShare(on) : void setCoachShare(on))}
        onAgree={() => void agree()}
        onClear={sheetMode === 'review' && stored.length > 0 ? clear : undefined}
        onClose={() => {
          setSheet(null);
          setAskShare(null);
          dropCoachPending();
        }}
      />
      <FitsSheet
        visible={fitsOpen}
        onClose={() => setFitsOpen(false)}
        date={todayDate}
        meal={meal}
        kcalLeft={day.remaining}
        proteinFirst={false}
        proteinLeft={day.macros.proteinG - day.eaten.protein}
      />
    </Screen>
  );
}

/** The newest message is this phone answer, written under 10 minutes ago (`?ask=` does not ask it again). */
function justAnswered(topic: 'training' | 'ideas'): boolean {
  const last = useCoachHistory.getState().messages.at(-1);
  return !!last && last.source === 'local' && last.role === 'assistant' && last.topic === topic && Date.now() - last.at < ASK_AGAIN_MS;
}

/** A mouse or trackpad (not a touch screen): there Enter sends. */
function finePointer(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
}
