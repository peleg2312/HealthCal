import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Sheet, Text } from '@/ui';

/**
 * What happens to a meal photo or description, in plain words, before the
 * first live AI estimate on this device (`mode="ask"`), and again whenever
 * someone wants to read it (`mode="review"`, from the photo screen's line and
 * About HealthCal), where an agreement can also be withdrawn.
 *
 * Every sentence here must stay true of the code: the request body
 * (`buildAnalyzeRequest` in ./api.ts) and the analyze-food edge function,
 * which stores neither the photo nor the text, only a count and token totals
 * for the daily allowance. If that changes, change these words and raise
 * AI_CONSENT_VERSION in ./consent.ts so everyone is asked again.
 */
export const AI_CONSENT_PARTS: readonly { title: string; body: string }[] = [
  {
    title: 'What is sent',
    body: 'A smaller copy of the meal photo with any note you add, or the words you type to describe a meal.',
  },
  {
    title: 'Who receives it',
    body: "HealthCal's server, which passes it to Anthropic, the maker of Claude, so its AI can estimate the foods and portions.",
  },
  {
    title: 'What is not sent',
    body: 'Nothing else from your diary: not your name, email, weight, goals or history. The server checks that you are signed in, and only the photo or words go on to Anthropic.',
  },
  {
    title: 'What happens to it',
    body: "HealthCal's server does not store the photo or the words. It records only how many analyses you ran and how large they were, for the daily allowance. Anthropic handles what it receives under Anthropic's terms.",
  },
];

export function AiConsentSheet({
  visible,
  mode,
  agreed,
  onAgree,
  onClose,
  onWithdraw,
}: {
  visible: boolean;
  /** 'ask' before the first estimate; 'review' to read it again. */
  mode: 'ask' | 'review';
  /** This device has agreed (review mode offers to withdraw). */
  agreed: boolean;
  onAgree?: () => void;
  onClose: () => void;
  onWithdraw?: () => void;
}) {
  const { spacing } = useTheme();
  const ask = mode === 'ask';
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={ask ? 'Before your first estimate' : 'Where your meal goes'}
      footer={
        <View style={{ gap: 10 }}>
          {ask ? (
            <>
              <Button testID="ai-consent-agree" title="Agree and continue" onPress={onAgree ?? onClose} />
              <Button testID="ai-consent-not-now" title="Not now" variant="secondary" onPress={onClose} />
            </>
          ) : (
            <>
              <Button testID="ai-consent-done" title="Done" onPress={onClose} />
              {agreed && onWithdraw ? <Button testID="ai-consent-withdraw" title="Withdraw agreement" variant="secondary" onPress={onWithdraw} /> : null}
            </>
          )}
        </View>
      }>
      <View testID="ai-consent-sheet" style={{ gap: spacing.md }}>
        <Text variant="body" color="textSecondary">
          An AI estimate needs your meal to leave this device. This is exactly what happens.
        </Text>
        {AI_CONSENT_PARTS.map((p) => (
          <View key={p.title} style={{ gap: 2 }}>
            <Text variant="bodyStrong">{p.title}</Text>
            <Text variant="body" color="textSecondary">
              {p.body}
            </Text>
          </View>
        ))}
        <Text variant="caption" color="textSecondary">
          {ask
            ? 'Not now sends nothing: you can still search for a food or enter it yourself. To read this again or withdraw, go to About HealthCal, under Privacy.'
            : agreed
              ? 'Withdrawing means nothing more is sent until you agree again before your next estimate.'
              : 'You have not agreed on this device. HealthCal asks before your first estimate.'}
        </Text>
      </View>
    </Sheet>
  );
}
