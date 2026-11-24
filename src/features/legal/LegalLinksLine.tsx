import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

/** Each link's own height: its caption line with room above and below, so 8 px of reach each side makes the 44 px target. */
const LINK_H = 28;
const LINK_REACH = (44 - LINK_H) / 2;

/**
 * "Terms of use · Privacy" as one quiet line of underlined ink links in caption weight, the way the
 * sign-in screen shows them, for a place where the two must sit right beside an action (the plan's
 * pinned Subscribe). Each link is 28 px tall and reaches 8 px above and below, so it takes no tap
 * from a control 8 px or more away.
 */
export function LegalLinksLine({
  termsLabel,
  privacyLabel,
  termsTestID,
  privacyTestID,
}: {
  termsLabel: string;
  privacyLabel: string;
  termsTestID: string;
  privacyTestID: string;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Link label={termsLabel} to="/legal/terms" testID={termsTestID} />
      <Text variant="caption" color="textSecondary" style={{ marginHorizontal: spacing.md }} accessibilityElementsHidden importantForAccessibility="no">
        ·
      </Text>
      <Link label={privacyLabel} to="/legal/privacy" testID={privacyTestID} />
    </View>
  );
}

function Link({ label, to, testID }: { label: string; to: '/legal/terms' | '/legal/privacy'; testID: string }) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={{ top: LINK_REACH, bottom: LINK_REACH, left: 6, right: 6 }}
      onPress={() => router.push(to as never)}
      style={{ height: LINK_H, justifyContent: 'center' }}>
      <Text variant="caption" color="text" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </PressableScale>
  );
}
