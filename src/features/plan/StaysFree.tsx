/**
 * What stays free, said specifically (principle 7): four rows of what runs on the phone and the
 * account, each with a cup key in the colour of what it names, then the free plan's own daily AI
 * allowance in the allowance's colour, and "No ads, on any plan." On the plan screen it follows the
 * prices ("Free for good"); for a subscriber it follows the cancel rows ("Stays yours if you
 * cancel"), so nobody has to wonder what a cancellation takes away. The figures are the server's.
 */
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, CupKey, Text } from '@/ui';

import { useAllowanceFill } from './PlanCup';
import type { PlanLimits } from './view';
import { STAYS_FREE_NOTE, STAYS_FREE_ROWS, freeAiLine, tieEnd } from './words';

/** Half of body's 21 px line less half the key: the key sits at the first line's centre. */
const KEY = 10;
const KEY_TOP = (21 - KEY) / 2;

export function StaysFree({ free, title, testID = 'plan-stays-free' }: { free: PlanLimits; title: string; testID?: string }) {
  const { colors, spacing } = useTheme();
  const allowance = useAllowanceFill();
  const keys: { color: string; variant: 'filled' | 'outline' }[] = [
    { color: colors.calories, variant: 'filled' },
    { color: colors.water, variant: 'filled' },
    { color: colors.exercise, variant: 'filled' },
    { color: colors.primary, variant: 'outline' },
  ];
  const rows = [...STAYS_FREE_ROWS.map((text, i) => ({ text, ...keys[i] })), { text: freeAiLine(free), color: allowance, variant: 'filled' as const }];
  return (
    <Card padding={spacing.lg} testID={testID} style={{ gap: 10 }}>
      <Text variant="h3">{title}</Text>
      {rows.map((r) => (
        <View key={r.text} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <CupKey size={KEY} color={r.color} variant={r.variant} style={{ marginTop: KEY_TOP }} />
          <Text variant="body" style={{ flex: 1 }}>
            {tieEnd(r.text, 2)}
          </Text>
        </View>
      ))}
      <Text variant="caption" color="textSecondary">
        {STAYS_FREE_NOTE}
      </Text>
    </Card>
  );
}
