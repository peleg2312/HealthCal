/**
 * The used-up cup at the top of the estimate's limit view (`ai-limit-cup`): today's allowance as a
 * full cup, in the icon's place. It is drawn only when the person's own allowance is fully used
 * (`usedAllowance`, ./allowance.ts). A cup that shows an allowance used up is a limit cup: full, with
 * the level line across the top of the fill inside the walls, never amber (nothing went over), no
 * brim line and no flash (nothing was reached).
 *
 * It is the picture only: the view's title already says the number ("Today's 5 estimates are used"),
 * so the cup says it once more to nobody, and a screen reader skips it. It adds no word about a plan;
 * the view's own words and its one quiet link are unchanged.
 */
import React from 'react';
import { View } from 'react-native';

import { useToday } from '@/store/clock';
import { DECORATIVE } from '@/ui';

import type { UsedAllowance } from './allowance';
import { PlanCup } from './PlanCup';

export function AllowanceUsed({ used, limit, testID = 'ai-limit-cup' }: UsedAllowance & { testID?: string }) {
  const today = useToday();
  return (
    <View testID={testID} {...DECORATIVE} style={{ alignSelf: 'flex-start' }}>
      <PlanCup size="row" level={limit > 0 ? used / limit : 0} goalKind="limit" memoryKey={`ai-limit-${today}`} />
    </View>
  );
}
