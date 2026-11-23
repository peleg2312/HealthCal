import React from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { startsRtl } from '@/lib/bidi';
import { cup, useTheme } from '@/theme';
import { Button, CupKey, Text } from '@/ui';

import { shownAnswer, type CoachMessage } from './request';
import { AI_MARK, LOCAL_MARK, NOTICE, REFER_LINE, SEE_WHAT_FITS, SIGN_IN, TRY_AGAIN } from './words';

/**
 * A message drawn as a cup card: the person's on the right on surfaceAlt, the coach's across the column
 * on surface, each answer with its mark ("AI" or "From your data, on this phone"). A message that starts
 * with a Hebrew letter is laid out right to left. Its actions (open What fits, try again, sign in)
 * are buttons beside the card's text, never a pressable card.
 */
export function CoachBubble({
  message,
  testID,
  onLayout,
  onFits,
  onRetry,
  onSignIn,
}: {
  message: CoachMessage;
  testID: string;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** The ideas answer's "See what fits" (only on the newest one). */
  onFits?: () => void;
  /** "Try again" on the newest failure that may work a second time. */
  onRetry?: () => void;
  onSignIn?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const width = useWindowDimensions().width;
  const mine = message.role === 'user';
  const text = message.source === 'notice' ? NOTICE[message.notice].text : message.source === 'ai' ? shownAnswer(message) : message.text;
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
          <Text variant="caption" color="textSecondary" testID={message.source === 'ai' ? 'coach-mark-ai' : 'coach-mark-local'}>
            {mark}
          </Text>
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
    </View>
  );
}
