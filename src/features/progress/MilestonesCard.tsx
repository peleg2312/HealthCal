import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import { MeasureWidth, SizeProbe, useMeasureKey } from '@/features/today/MeasureWidth';
import type { Milestone } from '@/lib/insights';
import { LARGE_TEXT, useTextGrowth, useTheme, useVeryLargeText } from '@/theme';
import { figure, MiniCup, Text, useGrownText } from '@/ui';

import { spokenUnits } from './chartWords';
import { besideRoom, keepsShape, milestoneRoom, wrapFits } from './grownFit';
import { SectionCard } from './parts';
import { WrapProbe } from './Probe';

/** A milestone's cup, and the room between it and its words. */
const CUP_W = 22;
const CUP_H = 28;
/** A reached milestone's title two a row may take three lines; an "Up next" title beside its share two. */
const DONE_LINES = 3;
const NEXT_LINES = 2;

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
 *
 * Through the phone's common text steps (text grown, under very large text) the reached ones stay two a row while
 * every title, measured as drawn in its half, fits in three lines with no word wider than it, and an "Up next" share
 * stays beside its title while every title, measured beside it, fits in two (`./grownFit`); else they give way as
 * with very large text: one a row, the share under the title.
 */
export function MilestonesCard({ milestones }: { milestones: Milestone[] }) {
  const { colors, spacing } = useTheme();
  // Two to a row from 360 px; one to a row below that, with very large text, or through the common steps where a
  // title measured in its half does not fit, so a title is never cut or split.
  const grow = useTextGrowth();
  const grown = useGrownText();
  const veryLarge = useVeryLargeText();
  const measuring = grown && !veryLarge;
  const measureKey = useMeasureKey();
  const wide = useWindowDimensions().width >= 360;
  const [doneRow, setDoneRow] = useState(0);
  const [nextRow, setNextRow] = useState(0);
  const [doneFits, setDoneFits] = useState<Record<string, boolean | null>>({});
  const [nextFits, setNextFits] = useState<Record<string, boolean | null>>({});
  const two = wide && (measuring ? keepsShape(Object.values(doneFits)) : grow <= LARGE_TEXT);
  // The share beside its title; under it with very large text, or where a title measured beside it does not fit.
  const beside = measuring ? keepsShape(Object.values(nextFits)) : grow <= LARGE_TEXT;
  const doneRoom = milestoneRoom(doneRow, CUP_W, spacing.md);
  const putFit = (set: typeof setDoneFits, id: string) => (f: boolean | null) => set((was) => (was[id] === f ? was : { ...was, [id]: f }));
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
              <MiniCup progress={1} goalKind="reach" index={i} memoryKey={`milestone-${m.id}`} color={colors[milestoneDomain(m.id)]} width={CUP_W} height={CUP_H} />
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
          {measuring && wide ? <SizeProbe key={`done-${measureKey}`} onSize={(w) => (w > 0 ? setDoneRow(w) : undefined)} /> : null}
          {measuring && wide && doneRoom > 0
            ? done.map((m) => <TitleProbe key={`${m.id}-${measureKey}`} title={m.title} room={doneRoom} maxLines={DONE_LINES} onFit={putFit(setDoneFits, m.id)} />)
            : null}
        </View>
      ) : null}
      {next.length ? (
        <View style={{ gap: spacing.md, borderTopWidth: done.length ? 1 : 0, borderTopColor: colors.border, paddingTop: done.length ? spacing.md : 0 }}>
          <Text variant="overline">Up next</Text>
          {next.map((m, i) => {
            const pct = Math.round((m.current / m.goal) * 100);
            return (
              <View key={m.id} testID={`milestone-${m.id}`} {...figure(spokenUnits(`${m.title}, ${pct}% of the way. ${m.detail}`))} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <MiniCup progress={Math.min(0.999, m.current / m.goal)} goalKind="reach" index={done.length + i} memoryKey={`milestone-${m.id}`} color={colors[milestoneDomain(m.id)]} width={CUP_W} height={CUP_H} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label">{m.title}</Text>
                  {/* With very large text, or where a title beside it does not fit, the share goes under the title, so
                      the title keeps the row's width. */}
                  {!beside ? (
                    <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                      {pct}
                      <Text variant="unit">%</Text>
                    </Text>
                  ) : null}
                  <Text variant="caption" color="textSecondary">
                    {m.detail}
                  </Text>
                </View>
                {!beside ? null : (
                  <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
                    {pct}
                    <Text variant="unit">%</Text>
                  </Text>
                )}
              </View>
            );
          })}
          {measuring ? <SizeProbe key={`next-${measureKey}`} onSize={(w) => (w > 0 ? setNextRow(w) : undefined)} /> : null}
          {measuring && nextRow > 0
            ? next.map((m) => (
                <NextProbe key={`${m.id}-${measureKey}`} title={m.title} pct={Math.round((m.current / m.goal) * 100)} row={nextRow} gap={spacing.md} onFit={putFit(setNextFits, m.id)} />
              ))
            : null}
        </View>
      ) : null}
    </SectionCard>
  );
}

/**
 * A milestone's title laid out unseen in `room`, as it wraps there: whether it fits in `maxLines` with no word wider
 * than the room goes to `onFit` (null until measured).
 */
function TitleProbe({ title, room, maxLines, onFit }: { title: string; room: number; maxLines: number; onFit: (fits: boolean | null) => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lineH, setLineH] = useState(0);
  const fits = wrapFits({ ...size, lineHeight: lineH, room, maxLines });
  useEffect(() => {
    onFit(fits);
  }, [fits, onFit]);
  return (
    <>
      <WrapProbe room={room} onSize={(width, height) => setSize({ width, height })}>
        <Text variant="label">{title}</Text>
      </WrapProbe>
      <WrapProbe room={room} onSize={(_w, h) => setLineH(h)}>
        <Text variant="label">x</Text>
      </WrapProbe>
    </>
  );
}

/** An "Up next" row's share drawn unseen, and its title measured in the room left beside it (`TitleProbe`). */
function NextProbe({ title, pct, row, gap, onFit }: { title: string; pct: number; row: number; gap: number; onFit: (fits: boolean | null) => void }) {
  const [pctW, setPctW] = useState(0);
  const room = besideRoom(row, CUP_W, pctW, gap);
  return (
    <>
      <MeasureWidth onWidth={setPctW}>
        <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
          {pct}
          <Text variant="unit">%</Text>
        </Text>
      </MeasureWidth>
      {room > 0 ? <TitleProbe title={title} room={room} maxLines={NEXT_LINES} onFit={onFit} /> : null}
    </>
  );
}
