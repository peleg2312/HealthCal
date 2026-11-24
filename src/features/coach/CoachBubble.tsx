import { Flag, Info, LifeBuoy } from 'lucide-react-native';
import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { limitInfoFrom, type LimitInfo } from '@/features/ai/limit';
import { usedUpNow } from '@/features/plan/allowance';
import { PlanCup } from '@/features/plan/PlanCup';
import { startsRtl } from '@/lib/bidi';
import { spokenUnits } from '@/lib/spokenUnits';
import { useNow } from '@/store/clock';
import { cup, useTheme } from '@/theme';
import { Button, Card, CupKey, FadeUp, PressableScale, Text } from '@/ui';

import { AnswerText } from './AnswerText';
import { CoachMark } from './CoachMark';
import { reportable } from './report';
import { useReportedAnswers } from './reportSend';
import { ReportSheet } from './ReportSheet';
import { shownAnswer, type CoachMessage } from './request';
import { AI_MARK, coachLimitText, LOCAL_MARK, NOTICE, REFER_LINE, REPORT_OPEN, REPORT_OPEN_LABEL, REPORTED, SIGN_IN, TRY_AGAIN } from './words';

/** The notice's text starts after its 16 px mark and an 8 px gap. */
const NOTICE_INDENT = 24;
/** A small ghost button's own side padding (src/ui/Button.tsx). */
const GHOST_SM_PAD = 12;

/**
 * The notice's mark. At the person's own daily limit, while the notice still speaks of today's
 * allowance (`usedUpNow`: written today, not yet reset), it is that allowance used up: the plan's
 * small cup, full. Otherwise (an older notice kept in the chat, the shared ceiling, plans off) the
 * plain info mark. Its own component, so only a notice reads the clock.
 */
function NoticeMark({ limit, at }: { limit: LimitInfo | null; at: number }) {
  const { colors } = useTheme();
  const now = useNow();
  return usedUpNow(limit, at, now) ? (
    <PlanCup size="small" level={1} goalKind="limit" animate={false} testID="coach-limit-cup" style={{ marginTop: 1 }} />
  ) : (
    <Info size={16} color={colors.textSecondary} strokeWidth={1.9} style={{ marginTop: 3 }} />
  );
}

/**
 * One message of the chat, each kind looking like what it is (spec section 3.2):
 * - the person's words: a tinted bubble on the right (primarySoft over the page, ink text);
 * - an answer from the phone: a card with the level line across its top, its live content (the
 *   training chart, the idea rows) or its stored text, and the mark "From your data, on this phone";
 * - the AI's answer: unboxed text under the small coach cup and "AI coach", laid out by
 *   `answerBlocks` (./format.ts), with the emergency line when the server flags it and a quiet
 *   "Report" under it (`coach-report-<i>`, then `coach-reported-<i>`);
 * - the app's own line (a notice): a quiet caption row with its one action.
 * A message that starts with a Hebrew letter is laid out right to left. Actions are siblings of the
 * text, never a pressable card.
 */
export function CoachBubble({
  message,
  testID,
  onLayout,
  live,
  arrive = false,
  onRetry,
  onSignIn,
  onPlans,
  report,
}: {
  message: CoachMessage;
  testID: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** A phone answer's live card content (the newest of today); else its stored text is shown. */
  live?: React.ReactNode;
  /** An AI answer that has just arrived: its blocks fade up one after another (ruling L5). */
  arrive?: boolean;
  /** "Try again" on the newest failure that may work a second time. */
  onRetry?: () => void;
  onSignIn?: () => void;
  /** The free plan's quiet link at the limit (`coach-limit-plans`, a ghost link, never a filled button). */
  onPlans?: { label: string; onPress: () => void };
  /** On an AI answer: its index in the chat (for the testIDs) and the typed question it replied to. */
  report?: { index: number; question: string | null };
}) {
  const { colors, radius, spacing } = useTheme();
  const [reporting, setReporting] = useState(false);
  const reported = useReportedAnswers((s) => s.ids.includes(message.id));

  if (message.role === 'user') {
    const rtl = startsRtl(message.text);
    return (
      <View
        testID={testID}
        onLayout={onLayout}
        style={{ alignSelf: 'flex-end', maxWidth: '80%', ...cup(radius.buttonSm, 5), backgroundColor: colors.primarySoft, paddingVertical: 10, paddingHorizontal: 14 }}>
        {/* An array child: the kit leaves a right-to-left message's direction alone (it marks a lone string as left to right). */}
        <Text variant="body" color="text" style={rtl ? { writingDirection: 'rtl', textAlign: 'right' } : null} selectable>
          {[message.text]}
        </Text>
      </View>
    );
  }

  if (message.source === 'local') {
    return (
      <Card testID={testID} onLayout={onLayout} padding={16} accessibilityLabel={live ? spokenUnits(message.text) : undefined} style={{ gap: spacing.md }}>
        {/* The chat's signature: the level line across the card's top. */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.rim }} />
        {live ?? (
          <Text variant="body" selectable>
            {[message.text]}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CupKey color={colors.exercise} size={8} />
          <Text variant="caption" color="textSecondary" testID="coach-mark-local">
            {LOCAL_MARK}
          </Text>
        </View>
      </Card>
    );
  }

  if (message.source === 'ai') {
    const canReport = !!report && reportable(message);
    return (
      <View testID={testID} onLayout={onLayout} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <CoachMark size="small" />
          <Text variant="caption" color="textSecondary" testID="coach-mark-ai">
            {AI_MARK}
          </Text>
        </View>
        <AnswerText text={shownAnswer(message)} arrive={arrive} />
        {message.refer ? (
          <Card tone="alt" testID="coach-refer" padding={12} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <LifeBuoy size={16} color={colors.warningInk} strokeWidth={1.9} style={{ marginTop: 2 }} />
            <Text variant="body" color="text" style={{ flex: 1 }}>
              {REFER_LINE}
            </Text>
          </Card>
        ) : null}
        {canReport && report ? (
          <FadeUp disabled={!arrive} delay={240}>
            {reported ? (
              <View style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <Text variant="caption" color="textSecondary" testID={`coach-reported-${report.index}`}>
                  {REPORTED}
                </Text>
              </View>
            ) : (
              <PressableScale
                testID={`coach-report-${report.index}`}
                accessibilityRole="button"
                accessibilityLabel={REPORT_OPEN_LABEL}
                onPress={() => setReporting(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start', paddingRight: spacing.sm }}>
                <Flag size={16} color={colors.textSecondary} strokeWidth={1.9} />
                <Text variant="caption" color="textSecondary">
                  {REPORT_OPEN}
                </Text>
              </PressableScale>
            )}
            <ReportSheet visible={reporting} message={message} question={report.question} onClose={() => setReporting(false)} />
          </FadeUp>
        ) : null}
      </View>
    );
  }

  // A notice: the app's own line, quiet, with at most one action under it.
  const limit = message.notice === 'daily_limit' || message.notice === 'shared_limit' ? limitInfoFrom(message.limit ? { plansOn: true, ...message.limit } : null) : null;
  const text = limit ? coachLimitText(limit) : NOTICE[message.notice].text;
  return (
    <View testID={testID} onLayout={onLayout} style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <NoticeMark limit={limit} at={message.at} />
        <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
          {text}
        </Text>
      </View>
      {onRetry || onSignIn || onPlans ? (
        // Under the notice's text: a ghost link that leads the row has no edge, so its label (not its padding) starts on the text's left edge.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingLeft: onRetry || onSignIn ? NOTICE_INDENT : NOTICE_INDENT - GHOST_SM_PAD }}>
          {onRetry ? <Button testID="coach-retry" title={TRY_AGAIN} variant="secondary" size="sm" full={false} onPress={onRetry} /> : null}
          {onSignIn ? <Button testID="coach-sign-in" title={SIGN_IN} variant="secondary" size="sm" full={false} onPress={onSignIn} /> : null}
          {onPlans ? <Button testID="coach-limit-plans" title={onPlans.label} variant="ghost" size="sm" full={false} onPress={onPlans.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}
