import { router } from 'expo-router';
import { FlaskConical, Info } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { cup, useTheme } from '@/theme';
import { Button, IconButton, Text } from '@/ui';

import type { AiAvailability } from './demo';

type Reason = Extract<AiAvailability, { live: false }>['reason'];

/**
 * Explains sample mode. `before` sits on the capture step; `result` sits on
 * top of a sample result and must leave no doubt it is not the user's meal.
 * The title and one line say what it is; why, and what the app's owner can do
 * about it, sit behind the info button.
 */
export function SampleNotice({ reason, variant }: { reason: Reason; variant: 'before' | 'result' }) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const title = variant === 'result' ? 'Sample result, not your meal' : 'Sample mode';
  const what = variant === 'result' ? 'Shows how reviewing works.' : 'You will see a fixed example.';
  const why = reason === 'signed_out' ? 'Sign in to have your own meals analysed.' : 'Real analysis needs this copy of HealthCal to be connected to a server.';
  return (
    <View
      testID={`ai-sample-notice-${variant}`}
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.surfaceAlt,
        borderLeftWidth: 3,
        borderColor: colors.warning,
        ...cup(radius.card),
        paddingLeft: spacing.lg,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <FlaskConical size={18} color={colors.text} strokeWidth={1.9} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title">{title}</Text>
          <Text variant="caption" color="textSecondary">
            {what}
          </Text>
        </View>
        <IconButton
          testID={`ai-sample-info-${variant}`}
          accessibilityLabel={open ? 'Hide why this is a sample' : 'Why this is a sample'}
          tone="clear"
          size={44}
          onPress={() => setOpen((v) => !v)}>
          <Info size={18} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
      </View>
      {open ? (
        <View style={{ gap: spacing.sm, paddingRight: spacing.md, paddingBottom: spacing.xs }} testID={`ai-sample-why-${variant}`}>
          <Text variant="body" color="textSecondary">
            {why}
          </Text>
          {reason === 'no_backend' ? (
            <Text variant="caption" color="textSecondary">
              For the app owner: connect a Supabase project and add an Anthropic API key to the analyze-food function.
            </Text>
          ) : null}
        </View>
      ) : null}
      {reason === 'signed_out' ? (
        <View style={{ paddingBottom: spacing.xs }}>
          <Button testID="ai-sample-sign-in" title="Sign in" variant="secondary" size="sm" full={false} onPress={() => router.push('/auth?mode=signin' as never)} />
        </View>
      ) : null}
    </View>
  );
}
