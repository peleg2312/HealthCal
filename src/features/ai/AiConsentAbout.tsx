import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { formatLongDate, toISODate } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Button, Text, toast } from '@/ui';

import { AiConsentSheet } from './AiConsentSheet';
import { hasAgreed, loadAiConsent, useAiConsentStore, withdrawAiConsent } from './consent';

/**
 * About HealthCal, Privacy: whether this device agreed to AI estimates, the
 * full explanation, and the way to withdraw.
 */
export function AiConsentAbout() {
  const { spacing } = useTheme();
  const consent = useAiConsentStore((s) => s.consent);
  const agreed = hasAgreed(consent);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadAiConsent();
  }, []);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" testID="about-ai-consent-status">
        {agreed && consent
          ? `AI estimates: you agreed on this device on ${formatLongDate(toISODate(new Date(consent.agreedAt)))}.`
          : 'AI estimates: not agreed on this device. HealthCal asks before your first estimate.'}
      </Text>
      <Button testID="about-ai-consent" title="What an AI estimate sends" variant="secondary" size="md" onPress={() => setOpen(true)} />
      <AiConsentSheet
        visible={open}
        mode="review"
        agreed={agreed}
        onClose={() => setOpen(false)}
        onWithdraw={() => {
          setOpen(false);
          void withdrawAiConsent();
          toast('Agreement withdrawn. HealthCal asks again before the next estimate.');
        }}
      />
    </View>
  );
}
