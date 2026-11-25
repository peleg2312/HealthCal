import React, { useState } from 'react';

import { TabHeader } from '@/components/TabHeader';
import { hasFoodLogged } from '@/features/drinks/via';
import { startOfWeek } from '@/lib/dates';
import { rangeRule } from '@/lib/exerciseBudget';
import { MIN_INSIGHT_DAYS, weekRangeLabel } from '@/lib/insights';
import { CaloriesADay } from '@/features/progress/CaloriesADay';
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
import { FadeUp, Screen } from '@/ui';

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
    const loggedThisWeek = d.weekDays.filter((x) => x.date >= weekStart && hasFoodLogged(x.entries)).length;
    return (
      <Screen tabs testID="progress-screen" header={<TabHeader tab="progress" overline="Trends and insights" overlineShort="Trends" title="Progress" />}>
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
    <Screen tabs testID="progress-screen" key={segment} header={<TabHeader tab="progress" overline={weekRangeLabel(start, d.today)} title="Progress" />}>
      <RangeSwitch value={range} onChange={setRange} />
      <SegmentSwitch options={SEGMENTS} value={segment} onChange={setSegment} testIDPrefix="progress-segment" />
      {segment === 'overview' ? (
        <>
          {/* The period overview leads (its first two rows in the first view at 360 x 740, its first row at 320 x
              640): its tiles fade up in reading order (1 to 8), then the cards under it carry on the sequence. */}
          <OverviewGrid d={d} range={range} onOpen={setSegment} />
          <FadeUp index={9}>
            <CaloriesADay days={d.days} summary={d.summary} today={d.today} onOpen={() => setSegment('nutrition')} />
          </FadeUp>
          <FadeUp index={10}>
            <InsightsCard insights={d.insights} rangeDays={range} />
          </FadeUp>
          {d.recap ? (
            <FadeUp index={11}>
              <RecapCard recap={d.recap} earlier={d.earlierWeeks} unseen={recapReady.ready && recapReady.week === d.recap.weekStart} />
            </FadeUp>
          ) : null}
          <FadeUp index={12}>
            <MilestonesCard milestones={d.milestones} />
          </FadeUp>
        </>
      ) : null}
      {segment === 'nutrition' ? (
        <>
          <CaloriesCard days={d.days} summary={d.summary} previous={d.previous} usual={d.usualKcal} today={d.today} rule={rangeRule(d.days.map((x) => x.exerciseRule))} />
          <MacrosCard summary={d.summary} days={d.days} today={d.today} />
        </>
      ) : null}
      {segment === 'body' ? (
        <>
          <WeightCard series={d.series} start={start} end={d.today} profile={d.profile} usual={d.usualWeight} />
          <EnergyCard model={d.model} useAdaptiveSetting={d.profile.useAdaptiveTdee} />
        </>
      ) : null}
      {segment === 'habits' ? (
        <>
          <HabitsCard summary={d.summary} previous={d.previous} units={d.profile.units} />
          <ConsistencyCard consistency={d.consistency} weekDays={d.weekDays} today={d.today} />
        </>
      ) : null}
    </Screen>
  );
}
