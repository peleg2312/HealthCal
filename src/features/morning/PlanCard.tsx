import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import type { ISODate } from '@/types';
import { useTheme } from '@/theme';
import { Card, Divider, ListRow, MiniCup, SectionTitle, Text } from '@/ui';

import type { PlanItem } from './plan';
import { PLAN_TITLE } from './review';

/**
 * "For today": today's targets in one plain line, then up to three rows, each a thing to do today
 * with its numbers and a small cup of where it stands, one tap from the place it is done. The rows
 * are siblings in one card (the card itself is not pressable). Each row replaces the morning page,
 * as the shelf's "Add" does, so Back returns to whatever was under the page.
 */
export function PlanCard({ today, targets, items }: { today: ISODate; targets: string | null; items: PlanItem[] }) {
  const { colors, spacing } = useTheme();
  if (!targets && items.length === 0) return null;
  return (
    <View testID="morning-plan">
      <SectionTitle title={PLAN_TITLE} testID="morning-plan" />
      {targets ? (
        <Text variant="body" color="textSecondary" testID="morning-targets" style={{ marginTop: spacing.sm }}>
          {targets}
        </Text>
      ) : null}
      {items.length > 0 ? (
        <Card padding={0} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, marginTop: spacing.md }}>
          {items.map((item, i) => (
            <React.Fragment key={item.kind}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`morning-plan-${item.kind}`}
                title={item.title}
                subtitle={item.subtitle}
                chevron
                accessibilityRole="link"
                accessibilityHint={item.hint}
                left={<MiniCup progress={item.progress} color={colors[item.color]} goalKind="reach" future={item.future} index={i} memoryKey={`morning-plan-${today}-${item.kind}`} />}
                onPress={() => router.replace(item.href as never)}
              />
            </React.Fragment>
          ))}
        </Card>
      ) : null}
    </View>
  );
}
