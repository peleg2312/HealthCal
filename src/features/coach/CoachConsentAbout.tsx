import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { formatLongDate, toISODate } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Button, Text, toast } from '@/ui';

import { CoachSheet } from './CoachSheet';
import { coachAgreed, loadCoachConsent, setCoachShare, useCoachConsent } from './consent';
import { clearCoach } from './history';
import { ABOUT_ROW_BUTTON, aboutStatus, WITHDRAW, WITHDRAWN } from './words';

/**
 * About HealthCal, Privacy, beside the food estimate's row: whether this device agreed to the coach
 * chat, "What the coach sees" with its "Share my week" switch, and the way to withdraw everything
 * (the agreement, the switch and the chat kept on this phone).
 */
export function CoachConsentAbout() {
  const { spacing } = useTheme();
  const consent = useCoachConsent((s) => s.consent);
  const share = useCoachConsent((s) => s.share);
  const agreed = coachAgreed({ consent });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadCoachConsent();
  }, []);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" testID="about-coach-consent-status">
        {aboutStatus(agreed && consent ? formatLongDate(toISODate(new Date(consent.agreedAt))) : null)}
      </Text>
      <Button testID="about-coach-consent" title={ABOUT_ROW_BUTTON} variant="secondary" size="md" onPress={() => setOpen(true)} />
      {agreed || share ? (
        <Button
          testID="about-coach-withdraw"
          title={WITHDRAW}
          variant="secondary"
          size="md"
          onPress={() => {
            void clearCoach();
            toast(WITHDRAWN);
          }}
        />
      ) : null}
      <CoachSheet visible={open} mode="review" share={share} onShare={(on) => void setCoachShare(on)} onClose={() => setOpen(false)} />
    </View>
  );
}
