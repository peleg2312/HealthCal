import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import type { Milestone } from '@/lib/insights';
import { LARGE_TEXT, useTextGrowth, useTheme } from '@/theme';
import { figure, MiniCup, Text } from '@/ui';

import { spokenUnits } from './chartWords';
import { SectionCard } from './parts';

type Domain = 'calories' | 'weight' | 'water' | 'exercise';

/** Which measure a milestone is about, so its cup is drawn in that data colour. */
export function milestoneDomain(id: string): Domain {
  if (id.startsWith('water')) return 'water';
  if (id.startsWith('sessions') || id === 'active-week') return 'exercise';
  if (id.startsWith('weigh-ins') || id.startsWith('trend')) return 'weight';
  return 'calories';
}

/**
 * Milestones as cups in the colour of what they measure (logging in the
 * calorie colour, water, workouts, weigh-ins). A reached one is brim-full with
 * the brim line across its top (a goal to reach, never amber); one still to
 * come is filled to how close it is, with its level line. Rows share the card,
 * divided by hairlines.
 */
export function MilestonesCard({ milestones }: { milestones: Milestone[] }) {
  const { colors, spacing } = useTheme();
  // Two to a row from 360 px; one to a row below that or above 115% text, so a title is never cut or split.
  const grow = useTextGrowth();
  const two = useWindowDimensions().width >= 360 && grow <= LARGE_TEXT;
  const doneAll = milestones.filter((m) => m.achieved).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const done = doneAll.slice(0, 4);
  const next = milestones
    .filter((m) => !m.achieved)
    .sort((a, b) => b.current / b.goal - a.current / a.goal)
    .slice(0, 3);
  return (
    <SectionCard
      testID="progress-milestones"
      title="Milestones"
      subtitle={`${doneAll.length} of ${milestones.length} reached${doneAll.length > done.length ? ', latest shown' : ''}`}>
      {done.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md }}>
          {done.map((m, i) => (
            <View
              key={m.id}
              testID={`milestone-${m.id}`}
              {...figure(spokenUnits(`Reached: ${m.title}${m.date ? `, ${formatShortDate(m.date)}` : ''}`))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                width: two ? '50%' : '100%',
                paddingLeft: two && i % 2 ? spacing.md : 0,
                paddingRight: two && !(i % 2) ? spacing.md : 0,
                borderLeftWidth: two && i % 2 ? 1 : 0,
                borderLeftColor: colors.border,
              }}>
              <MiniCup progress={1} goalKind="reach" index={i} memoryKey={`milestone-${m.id}`} color={colors[milestoneDomain(m.id)]} width={22} height={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="label">
                  {m.title}
                </Text>
                {m.date ? (
                  <Text variant="caption" color="textSecondary">
                    {formatShortDate(m.date)}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {next.length ? (
        <View style={{ gap: spacing.md, borderTopWidth: done.length ? 1 : 0, borderTopColor: colors.border, paddingTop: done.length ? spacing.md : 0 }}>
          <Text variant="overline">Up next</Text>
          {next.map((m, i) => {
            const pct = Math.round((m.current / m.goal) * 100);
            return (
              <View key={m.id} testID={`milestone-${m.id}`} {...figure(spokenUnits(`${m.title}, ${pct}% of the way. ${m.detail}`))} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <MiniCup progress={Math.min(0.999, m.current / m.goal)} goalKind="reach" index={done.length + i} memoryKey={`milestone-${m.id}`} color={colors[milestoneDomain(m.id)]} width={22} height={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label">{m.title}</Text>
                  {/* Above 115% text the share goes under the title, so the title keeps the row's width. */}
                  {grow > LARGE_TEXT ? (
                    <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                      {pct}
                      <Text variant="unit">%</Text>
                    </Text>
                  ) : null}
                  <Text variant="caption" color="textSecondary">
                    {m.detail}
                  </Text>
                </View>
                {grow > LARGE_TEXT ? null : (
                  <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                    {pct}
                    <Text variant="unit">%</Text>
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </SectionCard>
  );
}
