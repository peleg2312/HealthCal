/**
 * The "Plan" row of Profile, Account and About: "Free", "Plus until Dec 23", "Plus, ends Dec 23".
 * The screen decides whether to place it (`planVisible`), so a Group never draws an empty row.
 */
import { router } from 'expo-router';
import { CreditCard } from 'lucide-react-native';
import React from 'react';

import { IconTile } from '@/features/settings/components';
import { useTheme } from '@/theme';
import { ListRow } from '@/ui';

import { usePlan } from './cache';
import { PLAN_ROUTE } from './channel';
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
          <CreditCard size={20} color={colors.textSecondary} />
        </IconTile>
      }
      onPress={() => router.push(PLAN_ROUTE as never)}
    />
  );
}
