import { Flag } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { limitInfoFrom } from '@/features/ai/limit';
import { startsRtl } from '@/lib/bidi';
import { cup, useTheme } from '@/theme';
import { Button, CupKey, PressableScale, Text } from '@/ui';

import { reportable } from './report';
import { useReportedAnswers } from './reportSend';
import { ReportSheet } from './ReportSheet';
import { shownAnswer, type CoachMessage } from './request';
import { AI_MARK, coachLimitText, LOCAL_MARK, NOTICE, REFER_LINE, REPORT_OPEN, REPORT_OPEN_LABEL, REPORTED, SEE_WHAT_FITS, SIGN_IN, TRY_AGAIN } from './words';

/**
 * A message drawn as a cup card: the person's on the right on surfaceAlt, the coach's across the column
 * on surface, each answer with its mark ("AI" or "From your data, on this phone"). A message that starts
 * with a Hebrew letter is laid out right to left. Its actions (open What fits, try again, sign in)
 * are buttons beside the card's text, never a pressable card.
 *
 * An AI answer (and nothing else) carries a quiet "Report" control at the right of its mark
 * (`coach-report-<i>`), which opens "Report this answer" (./ReportSheet.tsx); once sent, the control
 * reads "Reported" (`coach-reported-<i>`) for the rest of this run of the app.
 */
export function CoachBubble({
  message,
  testID,
  onLayout,
  onFits,
  onRetry,
  onSignIn,
  onPlans,
  report,
}: {
  message: CoachMessage;
  testID: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** The ideas answer's "See what fits" (only on the newest one). */
  onFits?: () => void;
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
  const canReport = !!report && reportable(message);
  const width = useWindowDimensions().width;
  const mine = message.role === 'user';
  // A limit notice with plans on is worded from the limit answer's fields; anything else is NOTICE's words.
  const limit = message.source === 'notice' && (message.notice === 'daily_limit' || message.notice === 'shared_limit') ? limitInfoFrom(message.limit ? { plansOn: true, ...message.limit } : null) : null;
  const text =
    message.source === 'notice' ? (limit ? coachLimitText(limit) : NOTICE[message.notice].text) : message.source === 'ai' ? shownAnswer(message) : message.text;
  const rtl = startsRtl(text);
  const mark = message.source === 'ai' ? AI_MARK : message.source === 'local' && message.role === 'assistant' ? LOCAL_MARK : null;
  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={{
        // The coach's answers take the column's width; the person's own message sits at the right,
        // at most about two thirds of the screen, so the two read apart at a glance.
        alignSelf: mine ? 'flex-end' : 'stretch',
        maxWidth: mine ? Math.round(Math.min(width, 560) * 0.68) : undefined,
        ...cup(radius.card),
        backgroundColor: mine ? colors.surfaceAlt : colors.surface,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.sm,
      }}>
      {mark ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CupKey color={message.source === 'ai' ? colors.primary : colors.exercise} size={8} variant={message.source === 'ai' ? 'dashed' : 'filled'} />
          <Text variant="caption" color="textSecondary" testID={message.source === 'ai' ? 'coach-mark-ai' : 'coach-mark-local'} style={{ flex: 1 }}>
            {mark}
          </Text>
          {canReport && report ? (
            reported ? (
              <Text variant="caption" color="textSecondary" testID={`coach-reported-${report.index}`}>
                {REPORTED}
              </Text>
            ) : (
              // Quiet: a small flag and a word in the mark's colour. Its box is 44 px tall for the touch, and its
              // negative margins keep the mark's row at the mark's own height (the card's 12 px padding holds the rest).
              <PressableScale
                testID={`coach-report-${report.index}`}
                accessibilityRole="button"
                accessibilityLabel={REPORT_OPEN_LABEL}
                onPress={() => setReporting(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, marginVertical: -12, paddingLeft: spacing.sm }}>
                <Flag size={18} color={colors.textSecondary} strokeWidth={1.9} />
                <Text variant="caption" color="textSecondary">
                  {REPORT_OPEN}
                </Text>
              </PressableScale>
            )
          ) : null}
        </View>
      ) : null}
      {/* An array child: the kit leaves a right-to-left message's direction alone (it marks a lone string as left to right). */}
      <Text variant="body" color={message.source === 'notice' ? 'textSecondary' : 'text'} style={rtl ? { writingDirection: 'rtl', textAlign: 'right' } : null} selectable>
        {[text]}
      </Text>
      {message.source === 'ai' && message.refer ? (
        <Text variant="caption" color="text" testID="coach-refer">
          {REFER_LINE}
        </Text>
      ) : null}
      {onFits || onRetry || onSignIn ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {onFits ? <Button testID="coach-local-fits" title={SEE_WHAT_FITS} variant="secondary" size="sm" full={false} onPress={onFits} /> : null}
          {onRetry ? <Button testID="coach-retry" title={TRY_AGAIN} variant="secondary" size="sm" full={false} onPress={onRetry} /> : null}
          {onSignIn ? <Button testID="coach-sign-in" title={SIGN_IN} variant="secondary" size="sm" full={false} onPress={onSignIn} /> : null}
        </View>
      ) : null}
      {onPlans ? <Button testID="coach-limit-plans" title={onPlans.label} variant="ghost" size="sm" full={false} onPress={onPlans.onPress} style={{ alignSelf: 'flex-start' }} /> : null}
      {canReport && report ? <ReportSheet visible={reporting} message={message} question={report.question} onClose={() => setReporting(false)} /> : null}
    </View>
  );
}
