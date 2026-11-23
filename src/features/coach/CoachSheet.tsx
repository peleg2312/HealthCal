import React, { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { toISODate } from '@/lib/dates';
import { useStore } from '@/store';
import { useNow } from '@/store/clock';
import { useTheme } from '@/theme';
import { Button, Card, PressableScale, Sheet, Text, ToggleRow } from '@/ui';

import { coachNote } from './note';
import {
  ABOUT_DONE,
  ABOUT_TITLE,
  ABOUT_WITHDRAW_HINT,
  COACH_FACTS,
  CONSENT_AGREE,
  CONSENT_INTRO,
  CONSENT_NOT_NOW,
  CONSENT_NOT_NOW_HINT,
  CONSENT_TITLE,
  HIDE_WHAT_IS_SENT,
  NOTE_APPLE,
  NOTE_EMPTY,
  SEE_WHAT_IS_SENT,
  SHARE_HINT,
  SHARE_LABEL,
} from './words';

/**
 * "What the coach sees" (`mode="review"`, from the info cup beside the coach's line and from About)
 * and the consent asked before the first typed question (`mode="ask"`): the same facts, the "Share
 * my week" switch (`coach-share`) and, under it, the exact text that would go with a question now
 * (`coach-note-preview`, built by `buildCoachNote` at this moment: the same function the send uses).
 * In "ask" the switch is the sheet's own until the person agrees; in "review" it is the stored one.
 *
 * Order: the switch, the line saying what it shares and "See what is sent" come first, above the
 * longer facts, so the choice is in the first view of the sheet at 320, 360 and 390 px wide (the
 * consent cannot be given without seeing it). Opening the preview scrolls it into view (on the web;
 * natively the kit's Sheet keeps its scroller to itself, and the preview sits right under the link).
 */
export function CoachSheet({
  visible,
  mode,
  share,
  onShare,
  onAgree,
  onClose,
}: {
  visible: boolean;
  mode: 'ask' | 'review';
  share: boolean;
  onShare: (on: boolean) => void;
  onAgree?: () => void;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const ask = mode === 'ask';
  const [preview, setPreview] = useState(false);
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
  // The preview box, scrolled into view once when it opens (react-native-web's View is the DOM element).
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const reveal = useRef(false);
  const showPreview = () => {
    reveal.current = !preview;
    setPreview((p) => !p);
  };
  const revealBox = () => {
    if (!reveal.current || Platform.OS !== 'web') return;
    reveal.current = false;
    const el = box.current as unknown as { scrollIntoView?: (o: { block: string }) => void } | null;
    requestAnimationFrame(() => el?.scrollIntoView?.({ block: 'nearest' }));
  };

  const close = () => {
    setPreview(false);
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
            <Button testID="coach-about-done" title={ABOUT_DONE} onPress={close} />
          )}
        </View>
      }>
      <View testID={ask ? 'coach-consent' : 'coach-about-sheet'} style={{ gap: spacing.sm }}>
        {ask ? (
          <Text variant="body" color="textSecondary">
            {CONSENT_INTRO}
          </Text>
        ) : null}
        <Card tone="alt" padding={0} style={{ paddingHorizontal: spacing.lg }}>
          <ToggleRow testID="coach-share" title={SHARE_LABEL} value={share} onChange={onShare} />
        </Card>
        <Text variant="caption" color="textSecondary">
          {SHARE_HINT}
        </Text>
        <PressableScale
          testID="coach-note-preview"
          accessibilityLabel={preview ? HIDE_WHAT_IS_SENT : SEE_WHAT_IS_SENT}
          onPress={showPreview}
          hitSlop={6}
          style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
            {preview ? HIDE_WHAT_IS_SENT : SEE_WHAT_IS_SENT}
          </Text>
        </PressableScale>
        {note ? (
          <View ref={box} onLayout={revealBox}>
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
          </View>
        ) : null}
        {COACH_FACTS.map((p, i) => (
          <View key={p.title} style={i === 0 ? { marginTop: spacing.xs } : undefined}>
            <Text variant="bodyStrong">{p.title}</Text>
            <Text variant="body" color="textSecondary">
              {p.body}
            </Text>
          </View>
        ))}
        <Text variant="caption" color="textSecondary">
          {ask ? CONSENT_NOT_NOW_HINT : ABOUT_WITHDRAW_HINT}
        </Text>
      </View>
    </Sheet>
  );
}
