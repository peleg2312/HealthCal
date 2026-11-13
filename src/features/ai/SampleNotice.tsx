import { router } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';

import type { AiAvailability } from './demo';

type Reason = Extract<AiAvailability, { live: false }>['reason'];

/**
 * Explains sample mode. `before` sits on the capture step; `result` sits on
 * top of a sample result and must leave no doubt it is not the user's meal.
 */
export function SampleNotice({ reason, variant }: { reason: Reason; variant: 'before' | 'result' }) {
  const { colors, radius, spacing } = useTheme();
  const title = variant === 'result' ? 'Sample result, not your meal' : 'Sample mode';
  const what =
    variant === 'result'
      ? 'These items are a fixed example to show how reviewing works. They are not based on your photo or description, so check them before adding anything.'
      : 'You will see a fixed example result, not an analysis of your photo or description.';
  const why =
    reason === 'signed_out'
      ? 'Sign in to have your own meals analysed.'
      : 'This copy of HealthCal is not connected to a server, so meals cannot be analysed yet. For the app owner: connect a Supabase project and add an Anthropic API key to the analyze-food function.';
  return (
    <View
      testID={`ai-sample-notice-${variant}`}
      accessibilityRole="alert"
      style={{
        backgroundColor: `${colors.warning}22`,
        borderColor: `${colors.warning}66`,
        borderWidth: 1,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: spacing.sm,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <FlaskConical size={18} color={colors.warning} />
        <Text variant="title" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      <Text variant="body" color="textSecondary">
        {what} {why}
      </Text>
      {reason === 'signed_out' ? (
        <Button testID="ai-sample-sign-in" title="Sign in" variant="secondary" size="sm" full={false} onPress={() => router.push('/auth?mode=signin' as never)} />
      ) : null}
    </View>
  );
}
