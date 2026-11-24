/**
 * The "Plan" row of Profile, Account and About: "Free", "Plus until Dec 23", "Plus, ends Dec 23".
 * The screen decides whether to place it (`planVisible`), so a Group never draws an empty row.
 * Its mark is the plan's own glyph (./PlanGlyph.tsx: the full cup), not a payment card: the row is
 * about what the person has, and a card stays the mark of a payment (Account's manage row).
 */
import { router } from 'expo-router';
import React from 'react';

import { IconTile } from '@/features/settings/components';
import { useTheme } from '@/theme';
import { ListRow } from '@/ui';

import { usePlan } from './cache';
import { PLAN_ROUTE } from './channel';
import { PlanGlyph } from './PlanGlyph';
import { PLAN_TITLE, planRowLine } from './words';

export function PlanRow({ testID, title = PLAN_TITLE }: { testID: string; title?: string }) {
  const { colors } = useTheme();
  const view = usePlan();
  return (
    <ListRow
      testID={testID}
      title={title}
      subtitle={planRowLine(view)}
      left={
        <IconTile color={colors.textSecondary}>
          <PlanGlyph size={20} color={colors.textSecondary} />
        </IconTile>
      }
      onPress={() => router.push(PLAN_ROUTE as never)}
    />
  );
}
