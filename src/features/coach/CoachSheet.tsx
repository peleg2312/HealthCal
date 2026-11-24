import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { toISODate } from '@/lib/dates';
import { useStore } from '@/store';
import { useNow } from '@/store/clock';
import { useTheme } from '@/theme';
import { usePlan } from '@/features/plan';
import { Button, Card, CupKey, PressableScale, Sheet, Text, ToggleRow } from '@/ui';

import { coachNote } from './note';
import { pairsToSend } from './request';
import {
  ABOUT_DONE,
  ABOUT_TITLE,
  ABOUT_WITHDRAW_HINT,
  CLEAR_CHAT,
  COACH_FACTS,
  CONSENT_AGREE,
  CONSENT_DETAILS,
  CONSENT_DETAILS_HIDE,
  CONSENT_LEAD,
  CONSENT_INTRO,
  CONSENT_NOT_NOW,
  CONSENT_NOT_NOW_HINT,
  CONSENT_TITLE,
  NOTE_APPLE,
  NOTE_EMPTY,
  SEE_WHAT_IS_SENT,
  SHARE_HINT,
  SHARE_LABEL,
  sentWithLine,
} from './words';

/**
 * "What the coach sees" (`mode="review"`, from the coach header's info cup and from About)
 * and the consent asked before the first typed question (`mode="ask"`): the same facts, the "Share
 * my week" switch (`coach-share`) and, under it, the exact text that would go with a question now
 * (`coach-note-preview`, built by `buildCoachNote` at this moment: the same function the send uses).
 * In "ask" the switch is the sheet's own until the person agrees; in "review" it is the stored one.
 *
 * Layered (fix X12): the sheet opens on two sentences that are true and complete by themselves
 * (`CONSENT_LEAD`), the switch with "See what is sent", and the two buttons, all in view at 360 x 740 and
 * 320 x 640 without scrolling; one row, "Details" (`coach-details`), opens the facts exactly as worded
 * (`COACH_FACTS`, with the share hint and the closing hint) in `coach-details-body`. "What the coach
 * sees" opens with the details open. "See what is sent" opens the preview as a sheet of its
 * own over this one (`coach-note-sheet`, closed with `coach-note-done`, the drag or the backdrop), so the
 * whole note is in view at its top on a phone, with no scrolling by hand: the kit's Sheet keeps its
 * scroller to itself, so a preview placed lower in this sheet could not be brought into view natively.
 * The inner sheet is drawn inside this sheet's content, so on iPhone it is presented from this one.
 */
export function CoachSheet({
  visible,
  mode,
  share,
  onShare,
  onAgree,
  onClose,
  onClear,
}: {
  visible: boolean;
  mode: 'ask' | 'review';
  share: boolean;
  onShare: (on: boolean) => void;
  onAgree?: () => void;
  onClose: () => void;
  /** Review mode with messages in the chat: "Clear chat" above Done (it closes the sheet first). */
  onClear?: () => void;
}) {
  const { colors, spacing } = useTheme();
  const ask = mode === 'ask';
  const [preview, setPreview] = useState(false);
  /** The facts under "Details": closed on the consent's first layer, open in "What the coach sees" (fix X12). */
  const [detailsSet, setDetails] = useState<boolean | null>(null);
  const detailsOpen = detailsSet ?? !ask;
  const plan = usePlan();
  // The preview is the note as it would be sent now: built when the sheet draws, from the clock hook's minute.
  const now = useNow();
  const profile = useStore((s) => s.profile);
  const foodEntries = useStore((s) => s.foodEntries);
  const activities = useStore((s) => s.activities);
  const weights = useStore((s) => s.weights);
  const water = useStore((s) => s.water);
  const sleep = useStore((s) => s.sleep);
  const days = useStore((s) => s.days);
  const note = preview ? coachNote({ profile, foodEntries, activities, weights, water, sleep, days }, toISODate(now)) : null;

  const close = () => {
    setPreview(false);
    setDetails(null);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={ask ? CONSENT_TITLE : ABOUT_TITLE}
      footer={
        <View style={{ gap: 10 }}>
          {ask ? (
            <>
              <Button testID="coach-consent-agree" title={CONSENT_AGREE} onPress={onAgree ?? close} />
              <Button testID="coach-consent-not-now" title={CONSENT_NOT_NOW} variant="secondary" onPress={close} />
            </>
          ) : (
            <>
              {onClear ? (
                <Button
                  testID="coach-clear"
                  title={CLEAR_CHAT}
                  variant="secondary"
                  onPress={() => {
                    close();
                    onClear();
                  }}
                />
              ) : null}
              <Button testID="coach-about-done" title={ABOUT_DONE} onPress={close} />
            </>
          )}
        </View>
      }>
      <View testID={ask ? 'coach-consent' : 'coach-about-sheet'} style={{ gap: spacing.sm }}>
        {/* The first layer (fix X12): two sentences true by themselves, the switch, then the details on one row. */}
        <View testID="coach-consent-lead" style={{ gap: spacing.sm }}>
          {CONSENT_LEAD.map((line, i) => (
            <Text key={i} variant="body" color={i === 0 ? 'text' : 'textSecondary'}>
              {line}
            </Text>
          ))}
        </View>
        <Card tone="alt" padding={0} style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xs }}>
          <ToggleRow testID="coach-share" title={SHARE_LABEL} value={share} onChange={onShare} />
        </Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <PressableScale
            testID="coach-note-preview"
            accessibilityLabel={SEE_WHAT_IS_SENT}
            onPress={() => setPreview(true)}
            hitSlop={6}
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
              {SEE_WHAT_IS_SENT}
            </Text>
          </PressableScale>
          <PressableScale
            testID="coach-details"
            accessibilityRole="button"
            accessibilityLabel={detailsOpen ? CONSENT_DETAILS_HIDE : CONSENT_DETAILS}
            accessibilityState={{ expanded: detailsOpen }}
            {...({ 'aria-expanded': detailsOpen } as object)}
            onPress={() => setDetails(!detailsOpen)}
            hitSlop={6}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: spacing.sm }}>
            <Text variant="label" color="text">
              {CONSENT_DETAILS}
            </Text>
            {detailsOpen ? <ChevronUp size={18} color={colors.textSecondary} strokeWidth={1.9} /> : <ChevronDown size={18} color={colors.textSecondary} strokeWidth={1.9} />}
          </PressableScale>
        </View>
        {detailsOpen ? (
          <View testID="coach-details-body" style={{ gap: spacing.sm }}>
            {ask ? (
              <Text variant="body" color="textSecondary">
                {CONSENT_INTRO}
              </Text>
            ) : null}
            <Text variant="caption" color="textSecondary">
              {SHARE_HINT}
            </Text>
            {COACH_FACTS.map((p, i) => (
              <View key={p.title} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginTop: i === 0 ? spacing.xs : 0 }}>
                <CupKey color={colors.primary} variant="outline" size={9} style={{ marginTop: 6 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{p.title}</Text>
                  <Text variant="caption" color="textSecondary">
                    {p.body}
                  </Text>
                </View>
              </View>
            ))}
            <Text variant="caption" color="textSecondary">
              {ask ? CONSENT_NOT_NOW_HINT : ABOUT_WITHDRAW_HINT}
            </Text>
          </View>
        ) : null}
      </View>
      {/* "What is sent": the first of the facts' titles, the same words. */}
      <Sheet visible={preview} onClose={() => setPreview(false)} title={COACH_FACTS[0].title} footer={<Button testID="coach-note-done" title={ABOUT_DONE} onPress={() => setPreview(false)} />}>
        <Text variant="caption" color="textSecondary" testID="coach-note-with" style={{ marginBottom: spacing.md }}>
          {sentWithLine(pairsToSend(plan.limits.memoryPairs))}
        </Text>
        {note ? (
          <Card tone="alt" testID="coach-note-box" style={{ gap: spacing.sm }}>
            {/* The note exactly as sent: an array child, so the kit adds no mark to it. */}
            <Text variant="caption" color="text" testID="coach-note-text" selectable>
              {[note.text || NOTE_EMPTY]}
            </Text>
            {note.appleNote ? (
              <Text variant="caption" color="textSecondary" testID="coach-note-apple">
                {NOTE_APPLE}
              </Text>
            ) : null}
          </Card>
        ) : null}
      </Sheet>
    </Sheet>
  );
}
