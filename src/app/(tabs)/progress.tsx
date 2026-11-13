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
import { OverviewGrid, type ProgressSegment } from '@/features/progress/OverviewGrid';
import { RangeSwitch, SegmentSwitch } from '@/features/progress/parts';
import { RecapCard } from '@/features/progress/RecapCard';
import { useRecapReady } from '@/features/progress/recapReady';
import { useProgressData, type RangeDays } from '@/features/progress/useProgressData';
import { WeightCard } from '@/features/progress/WeightCard';
import { LargeTitle, Screen } from '@/ui';

const SEGMENTS: { value: ProgressSegment; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'nutrition', label: 'Nutrition' },
  { value: 'body', label: 'Body' },
  { value: 'habits', label: 'Habits' },
];

export default function ProgressScreen() {
  const [range, setRange] = useState<RangeDays>(30);
  const [segment, setSegment] = useState<ProgressSegment>('overview');
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
    // Keyed by section so a switch starts at the top instead of mid-way down the previous section.
    <Screen tabs testID="progress-screen" key={segment}>
      <LargeTitle title="Progress" subtitle={weekRangeLabel(start, d.today)} />
      <SegmentSwitch options={SEGMENTS} value={segment} onChange={setSegment} testIDPrefix="progress-segment" />
      <RangeSwitch value={range} onChange={setRange} />
      {segment === 'overview' ? (
        <>
          <InsightsCard insights={d.insights} rangeDays={range} />
          <OverviewGrid d={d} range={range} onOpen={setSegment} />
          {d.recap ? <RecapCard recap={d.recap} earlier={d.earlierWeeks} unseen={recapReady.ready && recapReady.week === d.recap.weekStart} /> : null}
          <MilestonesCard milestones={d.milestones} />
        </>
      ) : null}
      {segment === 'nutrition' ? (
        <>
          <CaloriesCard days={d.days} summary={d.summary} today={d.today} eatBack={d.profile.eatBackExercise} />
          <MacrosCard summary={d.summary} days={d.days} today={d.today} />
        </>
      ) : null}
      {segment === 'body' ? (
        <>
          <WeightCard series={d.series} start={start} end={d.today} profile={d.profile} />
          <EnergyCard model={d.model} useAdaptiveSetting={d.profile.useAdaptiveTdee} />
        </>
      ) : null}
      {segment === 'habits' ? (
        <>
          <HabitsCard summary={d.summary} units={d.profile.units} />
          <ConsistencyCard consistency={d.consistency} weekDays={d.weekDays} today={d.today} />
        </>
      ) : null}
    </Screen>
  );
}
