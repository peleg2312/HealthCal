import { router, useLocalSearchParams } from 'expo-router';
import { Info, SendHorizontal, Trash2 } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, useWindowDimensions, View } from 'react-native';

import { coachAgeAllowed } from '@/features/coach/age';
import { CoachBubble } from '@/features/coach/CoachBubble';
import { CoachSheet } from '@/features/coach/CoachSheet';
import { agreeToCoach, clearCoachConsent, coachAgreed, COACH_CONSENT_VERSION, loadCoachConsent, setCoachShare, useCoachConsent } from '@/features/coach/consent';
import {
  addCoachMessages,
  clearCoachHistory,
  coachOwner,
  loadCoachHistory,
  removeCoachMessages,
  restoreCoachMessages,
  useCoachHistory,
} from '@/features/coach/history';
import { ideasAnswer, trainingAnswer } from '@/features/coach/local';
import { aiAnswerMessage, localAnswerMessage, noticeMessage, questionMessage } from '@/features/coach/messages';
import { buildCoachNote } from '@/features/coach/note';
import { buildCoachRequest, CoachError, postCoach, type CoachMessage } from '@/features/coach/request';
import { coachConnection } from '@/features/coach/send';
import {
  CHAT_CLEARED,
  CLEAR_CHAT,
  COACH_LINE,
  COACH_LINE_SHARING,
  COACH_SUBTITLE,
  COACH_TITLE,
  EMPTY_BODY,
  EMPTY_TITLE,
  INPUT_PLACEHOLDER,
  INPUT_PLACEHOLDER_NARROW,
  LOCAL_TRAINING_QUESTION,
  localIdeasQuestion,
  MESSAGE_MAX,
  NOTICE,
  TYPING,
  type CoachNoticeKind,
} from '@/features/coach/words';
import { FitsSheet, useMealIdeas } from '@/features/today/FitsSheet';
import { today } from '@/lib/dates';
import { mealForTime } from '@/lib/nutrition';
import { useStore } from '@/store';
import { useNow, useToday } from '@/store/clock';
import { useDay, useLive } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import { Card, Chip, Header, IconButton, Screen, Text, TextField, toast } from '@/ui';

/**
 * The coach (`/coach`): a chat with an AI coach, cheap and capped (supabase/functions/coach-chat),
 * and two questions answered on this phone from the person's own data, free and at once. What a
 * typed question sends is `buildCoachRequest` (typed questions and AI answers only) and, while
 * "Share my week" is on, `buildCoachNote`; the phone's answers never leave it. The chat is kept on
 * this phone (./history.ts), cleared with "Clear chat" and whenever the profile goes away.
 *
 * Layout: the header, one fixed line with the info cup, the conversation (it scrolls), the two phone
 * buttons above the footer (one row where they fit, two lines on a phone under 360 px, never a cut
 * label), and the footer with the field and the send button, which rides on the keyboard the way
 * every Screen footer does.
 */
/** Test-hook builds only (a development build, or EXPO_PUBLIC_E2E): `?consentDemo=1` opens the consent sheet, so a build without accounts can show it. */
const CONSENT_HOOK = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1';

export default function CoachScreen() {
  const { colors, radius, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const todayDate = useToday();
  const now = useNow();
  const meal = mealForTime(now);
  const day = useDay(todayDate);
  const ideas = useMealIdeas(todayDate, meal);
  const activities = useLive('activities');
  const owner = useStore((s) => coachOwner(s));
  const history = useCoachHistory();
  const messages = history.owner === owner ? history.messages : [];
  const share = useCoachConsent((s) => s.share);
  const consent = useCoachConsent((s) => s.consent);
  // "sees your week" only once the coach has been agreed to and sharing is on: before the agreement nothing is sent.
  const seesWeek = share && coachAgreed({ consent });

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { consentDemo } = useLocalSearchParams<{ consentDemo?: string }>();
  const [sheet, setSheet] = useState<'ask' | 'review' | null>(() => (CONSENT_HOOK && consentDemo === '1' ? 'ask' : null));
  const [askShare, setAskShare] = useState(false);
  /** The question waiting for the consent sheet (and the message it already is, when it was sent before). */
  const [pending, setPending] = useState<{ text: string; id?: string } | null>(null);
  const [fitsOpen, setFitsOpen] = useState(false);

  useEffect(() => {
    void loadCoachHistory();
    void loadCoachConsent();
  }, [owner]);

  // Scrolling: to the end when the person asks, and to the first line of a new answer when it arrives.
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const toEnd = useRef(true);
  const [answerTop, setAnswerTop] = useState<string | null>(null);

  const answerHere = (topic: 'training' | 'ideas') => {
    const q = questionMessage(topic === 'training' ? LOCAL_TRAINING_QUESTION : localIdeasQuestion(meal), 'local');
    const a = localAnswerMessage(q, topic, topic === 'training' ? trainingAnswer(activities, today()) : ideasAnswer(ideas, meal, day.remaining));
    addCoachMessages(q, a);
    setAnswerTop(a.id);
  };

  /** Ask the AI: `id` when the question is already in the chat (Try again, or after the consent sheet). */
  const ask = async (question: string, id?: string) => {
    const q = question.trim().slice(0, MESSAGE_MAX);
    if (!q || busy) return;
    const existing = id ? useCoachHistory.getState().messages.find((m) => m.id === id) : undefined;
    const said = existing ?? questionMessage(q, 'typed');
    const answerWith = (kind: CoachNoticeKind) => {
      if (!existing) addCoachMessages(said);
      addCoachMessages(noticeMessage(said, kind));
      setText('');
      toEnd.current = true;
    };
    // 18 and over, asked now from the date of birth and today's date; anything else counts as under 18.
    if (!coachAgeAllowed(useStore.getState().profile?.birthDate, today())) return answerWith('under18');
    const connection = await coachConnection();
    if (!connection) return answerWith('account');
    await loadCoachConsent();
    if (!coachAgreed(useCoachConsent.getState())) {
      setPending({ text: q, id: existing?.id });
      setAskShare(useCoachConsent.getState().share);
      setSheet('ask');
      return;
    }
    if (!existing) addCoachMessages(said);
    setText('');
    setBusy(true);
    toEnd.current = true;
    // What was in the chat before this question: the request takes typed pairs from it, nothing else.
    const before = useCoachHistory.getState().messages.filter((m) => m.id !== said.id);
    // The week, only while sharing is on, built now from what the phone holds.
    const note = useCoachConsent.getState().share ? buildCoachNote(useStore.getState(), today(), Platform.OS) : null;
    try {
      const a = await postCoach(fetch, buildCoachRequest({ message: q, messages: before, note, consentVersion: COACH_CONSENT_VERSION }), connection);
      const reply = aiAnswerMessage(said, a);
      addCoachMessages(reply);
      setAnswerTop(reply.id);
    } catch (e) {
      const kind = e instanceof CoachError ? e.kind : 'failed';
      if (kind === 'consent_outdated') {
        // The server asks for the current wording: ask again, then send this question.
        await clearCoachConsent();
        setPending({ text: q, id: said.id });
        setAskShare(false);
        setSheet('ask');
      } else {
        addCoachMessages(noticeMessage(said, kind));
        toEnd.current = true;
      }
    } finally {
      setBusy(false);
    }
  };

  const send = () => void ask(text);

  const agree = async () => {
    const p = pending;
    setSheet(null);
    setPending(null);
    await agreeToCoach(askShare);
    if (p) void ask(p.text, p.id);
  };

  const clear = () => {
    const snapshot = { owner: history.owner, messages: [...messages] };
    void clearCoachHistory();
    toast(CHAT_CLEARED, { label: 'Undo', onPress: () => restoreCoachMessages(snapshot.owner, snapshot.messages) });
  };

  // The newest of each kind carries the plain testID (the ones a test or a person reaches for).
  const lastIndex = (f: (m: CoachMessage) => boolean) => {
    for (let i = messages.length - 1; i >= 0; i--) if (f(messages[i])) return i;
    return -1;
  };
  const lastLocal = lastIndex((m) => m.role === 'assistant' && m.source === 'local');
  const lastIdeas = lastIndex((m) => m.role === 'assistant' && m.source === 'local' && m.topic === 'ideas');
  const lastAi = lastIndex((m) => m.source === 'ai');
  const lastNotice = lastIndex((m) => m.source === 'notice');
  const lastQuestion = lastIndex((m) => m.role === 'user' && m.source === 'typed');

  const idFor = (m: CoachMessage, i: number): string => {
    if (m.role === 'user') return i === lastQuestion ? 'coach-question' : `coach-question-${i}`;
    if (m.source === 'local') return i === lastLocal ? 'coach-local-answer' : `coach-local-answer-${i}`;
    if (m.source === 'ai') return i === lastAi ? 'coach-answer' : `coach-answer-${i}`;
    return i === lastNotice ? 'coach-notice' : `coach-notice-${i}`;
  };

  const retryFor = (m: CoachMessage, i: number) => {
    if (busy || m.source !== 'notice' || i !== messages.length - 1 || !NOTICE[m.notice].retry) return undefined;
    const q = messages.find((x) => x.id === m.replyTo);
    if (!q || q.role !== 'user') return undefined;
    return () => {
      removeCoachMessages([m.id]);
      void ask(q.text, q.id);
    };
  };

  const header = (
    <Header
      title={COACH_TITLE}
      subtitle={COACH_SUBTITLE}
      right={
        messages.length > 0 ? (
          <IconButton testID="coach-clear" accessibilityLabel={CLEAR_CHAT} onPress={clear}>
            <Trash2 size={20} color={colors.text} strokeWidth={1.9} />
          </IconButton>
        ) : undefined
      }
    />
  );

  const footer = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <TextField
        testID="coach-input"
        accessibilityLabel="Your question for the coach"
        placeholder={narrow ? INPUT_PLACEHOLDER_NARROW : INPUT_PLACEHOLDER}
        value={text}
        onChangeText={setText}
        maxLength={MESSAGE_MAX}
        returnKeyType="send"
        onSubmitEditing={send}
        submitBehavior="submit"
        blurOnSubmit={false}
        style={{ flex: 1 }}
      />
      <IconButton testID="coach-send" accessibilityLabel="Send" tone="primary" size={50} disabled={busy || !text.trim()} onPress={send}>
        <SendHorizontal size={20} color={colors.onPrimary} strokeWidth={2.2} />
      </IconButton>
    </View>
  );

  return (
    <Screen header={header} footer={footer} scroll={false} testID="coach-screen">
      <View style={{ paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Text variant="caption" color="textSecondary" testID="coach-line" style={{ flexShrink: 1 }}>
          {seesWeek ? COACH_LINE_SHARING : COACH_LINE}
        </Text>
        <IconButton size={44} tone="clear" testID="coach-about" accessibilityLabel="What the coach sees" onPress={() => setSheet('review')}>
          <Info size={20} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
      </View>

      <ScrollView
        ref={scroller}
        testID="coach-chat"
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: spacing.sm, gap: spacing.md }}
        onContentSizeChange={() => {
          if (toEnd.current) {
            toEnd.current = false;
            scroller.current?.scrollToEnd({ animated: false });
          }
        }}>
        {messages.length === 0 ? (
          <Card tone="alt" testID="coach-empty" style={{ gap: spacing.xs }}>
            <Text variant="bodyStrong">{EMPTY_TITLE}</Text>
            <Text variant="caption" color="textSecondary">
              {EMPTY_BODY}
            </Text>
          </Card>
        ) : null}
        {messages.map((m, i) => (
          <CoachBubble
            key={m.id}
            message={m}
            testID={idFor(m, i)}
            onLayout={
              m.id === answerTop
                ? (e) => {
                    // A new answer: its first line at the top of what is visible.
                    const y = e.nativeEvent.layout.y;
                    setAnswerTop(null);
                    toEnd.current = false;
                    requestAnimationFrame(() => scroller.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: false }));
                  }
                : undefined
            }
            onFits={i === lastIdeas ? () => setFitsOpen(true) : undefined}
            onRetry={retryFor(m, i)}
            onSignIn={m.source === 'notice' && m.notice === 'account' && i === lastNotice ? () => router.push('/auth?mode=signin' as never) : undefined}
          />
        ))}
        {busy ? (
          <View
            testID="coach-typing"
            accessibilityLiveRegion="polite"
            style={{ alignSelf: 'flex-start', ...cup(radius.card), borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <Text variant="body" color="textSecondary">
              {TYPING}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* The two questions answered on this phone, above the field: they wrap rather than cut a label (12 px between lines, so each keeps its 44 px tap area). */}
      <View testID="coach-local-row" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md, paddingVertical: spacing.sm }}>
        <Chip testID="coach-local-training" label={LOCAL_TRAINING_QUESTION} onPress={() => answerHere('training')} />
        <Chip testID="coach-local-ideas" label={localIdeasQuestion(meal)} onPress={() => answerHere('ideas')} />
      </View>

      <CoachSheet
        visible={sheet !== null}
        mode={sheet ?? 'review'}
        share={sheet === 'ask' ? askShare : share}
        onShare={(on) => (sheet === 'ask' ? setAskShare(on) : void setCoachShare(on))}
        onAgree={() => void agree()}
        onClose={() => {
          setSheet(null);
          setPending(null);
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
