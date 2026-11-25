import { Shield } from 'lucide-react-native';
import React from 'react';

import { useTheme } from '@/theme';
import { decorative, PressableScale, Text } from '@/ui';

/**
 * One quiet line on the estimate screen saying where the photo or description
 * goes. Tapping it opens the full explanation (AiConsentSheet in review mode),
 * where an agreement can also be withdrawn.
 */
export function AiDataLine({ mode, onPress }: { mode: 'photo' | 'text'; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  const what = mode === 'photo' ? 'Your photo' : 'Your description';
  return (
    <PressableScale
      testID="ai-data-line"
      accessibilityRole="button"
      accessibilityLabel={`${what} goes to HealthCal's server and on to Anthropic's Claude for the estimate. Read how it is handled`}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.sm }}>
      {decorative(<Shield size={16} color={colors.textSecondary} strokeWidth={1.9} style={{ marginTop: 1 }} />)}
      <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
        {`${what} goes to HealthCal's server and on to Anthropic's Claude for the estimate. `}
        <Text variant="caption" color="text" style={{ textDecorationLine: 'underline' }}>
          How it is handled
        </Text>
      </Text>
    </PressableScale>
  );
}
