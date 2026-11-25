import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { balancedLines, chipWidth } from '@/features/food/chipLines';
import { useTheme } from '@/theme';
import { Button, Chip, CupKey, haptic, PressableScale, Sheet, Text, toast } from '@/ui';

import { buildReportRow, REPORT_REASON_IDS, type ReportReason } from './report';
import type { CoachMessage } from './request';
import { markReported, sendCoachReport } from './reportSend';
import { REPORT_NOT_SENT, REPORT_REASON_LABEL, REPORT_REASONS, REPORT_SEND, REPORT_SENT, REPORT_TITLE, REPORT_WHAT_IS_SENT, REPORT_WITH_QUESTION } from './words';

/**
 * "Report this answer" (`coach-report-sheet`), opened from an AI answer's quiet Report control: the
 * reasons as one choice (`coach-report-reason-<id>`, none chosen at first, so Send waits for one), the
 * tick "Also send my question" (`coach-report-question`, off by default, shown when the answer has a
 * typed question), the line saying exactly what is sent and to whom, and Send (`coach-report-send`).
 * A sent report closes the sheet with "Report sent. Thank you." and marks the answer reported for this
 * run of the app; one that did not go says why in a toast and leaves the sheet open.
 */
export function ReportSheet({
  visible,
  message,
  question,
  onClose,
}: {
  visible: boolean;
  message: CoachMessage;
  /** The typed question the answer replied to, when it is still in the chat. */
  question: string | null;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const width = useWindowDimensions().width;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [withQuestion, setWithQuestion] = useState(false);
  const [sending, setSending] = useState(false);

  const close = () => {
    setReason(null);
    setWithQuestion(false);
    onClose();
  };

  const send = async () => {
    if (!reason || sending) return;
    const row = buildReportRow({ message, reason, question, withQuestion });
    if (!row) return close();
    setSending(true);
    const outcome = await sendCoachReport(row);
    setSending(false);
    if (outcome === 'sent') {
      haptic.success();
      markReported(message.id);
      close();
      toast(REPORT_SENT);
    } else {
      toast(REPORT_NOT_SENT[outcome].text);
    }
  };

  // The sheet's content width: the window (at most 560) less its 20 px sides.
  const lines = balancedLines(
    REPORT_REASON_IDS.map((id) => chipWidth(REPORT_REASONS[id].text)),
    Math.min(width, 560) - 40,
  );

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={REPORT_TITLE}
      footer={<Button testID="coach-report-send" title={REPORT_SEND} onPress={() => void send()} disabled={!reason} loading={sending} />}>
      <View testID="coach-report-sheet" style={{ gap: spacing.md }}>
        <Text variant="label" color="textSecondary" nativeID="coach-report-reason-label">
          {REPORT_REASON_LABEL}
        </Text>
        {/* Lines 12 apart and chips 8 apart, as on the water screen, so two chips' touch areas meet in the gap. */}
        <View accessibilityRole="radiogroup" accessibilityLabel={REPORT_REASON_LABEL} style={{ rowGap: 12 }}>
          {lines.map((line) => (
            <View key={line.join('|')} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }}>
              {line.map((i) => {
                const id = REPORT_REASON_IDS[i];
                return <Chip key={id} testID={`coach-report-reason-${id}`} label={REPORT_REASONS[id].text} selected={reason === id} onPress={() => setReason(id)} />;
              })}
            </View>
          ))}
        </View>
        {question ? (
          <PressableScale
            testID="coach-report-question"
            onPress={() => setWithQuestion((v) => !v)}
            feedback="select"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: withQuestion }}
            // react-native-web drops accessibilityState, so the browser is told directly.
            aria-checked={withQuestion}
            accessibilityLabel={REPORT_WITH_QUESTION}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, alignSelf: 'flex-start' }}>
            {/* A cup-cornered tick box, as the import's: ticked, it holds the done mark (the small filled ink cup in an
                ink outline), never a check, which means only a day on budget. */}
            <View
              style={{
                width: 22,
                height: 22,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                borderBottomLeftRadius: 7,
                borderBottomRightRadius: 7,
                borderWidth: 1.5,
                borderColor: withQuestion ? colors.text : colors.fieldEdge,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {withQuestion ? <CupKey color={colors.text} size={12} /> : null}
            </View>
            <Text variant="body">{REPORT_WITH_QUESTION}</Text>
          </PressableScale>
        ) : null}
        <Text variant="caption" color="textSecondary" testID="coach-report-what">
          {REPORT_WHAT_IS_SENT}
        </Text>
      </View>
    </Sheet>
  );
}
