import React, { useState } from 'react';

import { startOfWeek } from '@/lib/dates';
import { MIN_INSIGHT_DAYS, weekRangeLabel } from '@/lib/insights';
import { CaloriesCard } from '@/features/progress/CaloriesCard';
import { ConsistencyCard } from '@/features/progress/ConsistencyCard';
import { EarlyState } from '@/features/progress/EarlyState';
import { EnergyCard } from '@/features/progress/EnergyCard';
import { HabitsCard } from '@/features/progress/HabitsCard';
import { InsightsCard } from '@/features/progress/InsightsCard';
import { MacrosCard } from '@/features/progress/MacrosCard';
import { MilestonesCard } from '@/features/progress/MilestonesCard';
import { RangeSwitch } from '@/features/progress/parts';
import { RecapCard } from '@/features/progress/RecapCard';
import { useRecapReady } from '@/features/progress/recapReady';
import { useProgressData, type RangeDays } from '@/features/progress/useProgressData';
import { WeightCard } from '@/features/progress/WeightCard';
import { LargeTitle, Screen } from '@/ui';

export default function ProgressScreen() {
  const [range, setRange] = useState<RangeDays>(30);
  const d = useProgressData(range);
  const recapReady = useRecapReady();
  const early = d.completeEver < MIN_INSIGHT_DAYS;
  const start = d.days[0].date;

  if (early) {
    const weekStart = startOfWeek(d.today);
    const loggedThisWeek = d.weekDays.filter((x) => x.date >= weekStart && x.entries.length > 0).length;
    return (
      <Screen tabs testID="progress-screen">
        <LargeTitle title="Progress" subtitle="Trends and insights" />
        <EarlyState
          completeDays={d.completeEver}
          weighIns={d.series.entries.length}
          loggedThisWeek={loggedThisWeek}
          adaptiveNeeds={d.model.adaptive.needs}
          adaptiveDays={d.model.adaptive.loggedDays}
        />
        <WeightCard series={d.series} start={start} end={d.today} profile={d.profile} />
        <EnergyCard model={d.model} useAdaptiveSetting={d.profile.useAdaptiveTdee} />
        <ConsistencyCard consistency={d.consistency} weekDays={d.weekDays} today={d.today} />
        <MilestonesCard milestones={d.milestones} />
      </Screen>
    );
  }

  return (
    <Screen tabs testID="progress-screen">
      <LargeTitle title="Progress" subtitle={weekRangeLabel(start, d.today)} />
      <RangeSwitch value={range} onChange={setRange} />
      {d.recap ? <RecapCard recap={d.recap} earlier={d.earlierWeeks} unseen={recapReady.ready && recapReady.week === d.recap.weekStart} /> : null}
      <InsightsCard insights={d.insights} rangeDays={range} />
      <CaloriesCard days={d.days} summary={d.summary} today={d.today} eatBack={d.profile.eatBackExercise} />
      <MacrosCard summary={d.summary} days={d.days} today={d.today} />
      <WeightCard series={d.series} start={start} end={d.today} profile={d.profile} />
      <EnergyCard model={d.model} useAdaptiveSetting={d.profile.useAdaptiveTdee} />
      <HabitsCard summary={d.summary} units={d.profile.units} />
      <ConsistencyCard consistency={d.consistency} weekDays={d.weekDays} today={d.today} />
      <MilestonesCard milestones={d.milestones} />
    </Screen>
  );
}
