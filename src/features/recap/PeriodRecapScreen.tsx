import { Info } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { displayFoodName } from '@/features/food/displayName';
import { evenly, spokenUnits } from '@/features/progress/chartWords';
import { go } from '@/features/progress/parts';
import { SharePeriodButton } from '@/features/share';
import { formatNumber, weightValue } from '@/lib/units';
import { useLargeText, useTheme } from '@/theme';
import { AnimatedNumber, Card, CupKey, DECORATIVE, Divider, EmptyState, FadeUp, figure, Header, IconButton, ListRow, MiniCup, Screen, Sheet, Sparkline, Text } from '@/ui';

import { CupGrid } from './CupGrid';
import { markPeriodDealt, OFFER_YEAR_FROM } from './offer';
import { inProgress, type PeriodKind } from './period';
import { usePeriodRecap } from './usePeriodRecap';
import {
  activityCaption,
  closingLine,
  daysFigure,
  emptyWords,
  gridLabel,
  helpParagraphs,
  lastTwo,
  monthRowWords,
  periodName,
  periodSubtitle,
  periodTitle,
  totalVolume,
  waterCaption,
  weightWords,
  yearRowWords,
} from './words';

/** A level-2 heading, as `SectionTitle` and the check-in's card titles are. */
const H2 = { accessibilityRole: 'header', 'aria-level': 2 } as object;

/**
 * One figure of the period's numbers: its key and name, the number with its unit, and one line under it. One element
 * to a screen reader, said as drawn with its units in full. `side` is a small picture beside the number (the weight trend).
 */
function FigureRow({ color, label, value, unit, caption, side, testID }: { color: string; label: string; value: string; unit: string; caption: string; side?: React.ReactNode; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} {...figure(spokenUnits(`${label}: ${value} ${unit}. ${caption}`))} style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View {...DECORATIVE}>
          <CupKey color={color} size={10} />
        </View>
        <Text variant="label" color="textSecondary" style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, flexWrap: 'wrap' }}>
        <Text variant="numL" style={{ flexShrink: 0 }}>
          {value}
          <Text variant="unit">{` ${unit}`}</Text>
        </Text>
        {side}
      </View>
      <Text variant="caption" color="textSecondary">
        {caption}
      </Text>
    </View>
  );
}

/**
 * A month (/recap/month?month=YYYY-MM) or a year (/recap/year?year=YYYY) in cups: a short story of the
 * person's own data, top to bottom. The days as cups, poured once on arrival (drawn at once under reduced
 * motion), with the days on budget in the one headline every screen uses; active minutes, water and the weight
 * trend; the foods logged most; one calm closing line; and the way to other months and years. Free, and shared
 * as an image through the share feature (never with weight). Nothing here judges: a month is what was logged.
 */
export function PeriodRecapScreen({ kind, param }: { kind: PeriodKind; param: unknown }) {
  const { colors, spacing } = useTheme();
  const large = useLargeText();
  const d = usePeriodRecap(kind, param);
  const { period: p, today, tally } = d;
  const [help, setHelp] = useState(false);
  const soFar = inProgress(p, today);

  // Opening a month or a year that has ended (or the year in its last days) deals with Progress's one-time line for it.
  useEffect(() => {
    if (!inProgress(p, today) || (p.kind === 'year' && today.slice(5) >= OFFER_YEAR_FROM)) markPeriodDealt(p.key);
  }, [p, today]);

  const empty = tally.logged === 0 && d.activity.workouts === 0 && d.water.totalMl === 0;
  const fig = daysFigure(tally, p, today);
  const water = totalVolume(d.water.totalMl, d.units);
  const w = d.weight ? weightWords(d.weight.first.trend, d.weight.last.trend, d.weight.first.date, d.weight.last.date, d.units) : null;
  const memoryKey = `period-${p.key}`;

  return (
    <Screen
      testID="recap-period-screen"
      header={<Header title={periodTitle(p, today)} subtitle={periodSubtitle(p, tally, today)} right={empty ? undefined : <SharePeriodButton input={d.share} />} />}>
      {empty ? (
        <Card testID="recap-period-empty">
          <EmptyState {...emptyWords(p, today)} action="Open diary" actionTestID="recap-period-empty-action" onAction={() => go('/diary')} />
        </Card>
      ) : (
        <>
          <Card testID="recap-period-cups" style={{ gap: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 0 }} {...figure(`${tally.logged} of ${tally.elapsed} ${tally.elapsed === 1 ? 'day' : 'days'} ${fig.label}`)}>
                {/* Ticks up from zero the first time the page opens this session, with the cups. */}
                <AnimatedNumber variant="numL" value={tally.logged} format={(n) => formatNumber(n)} from={0} memoryKey={`${memoryKey}-days`} testID="recap-period-days">
                  <Text variant="unit">{` ${fig.unit}`}</Text>
                </AnimatedNumber>
                <Text variant="caption" color="textSecondary">
                  {fig.label}
                </Text>
              </View>
              <IconButton size={36} tone="clear" testID="recap-period-help" accessibilityLabel="How to read the cups" onPress={() => setHelp(true)}>
                <Info size={20} color={colors.textSecondary} strokeWidth={1.9} />
              </IconButton>
            </View>
            <CupGrid kind={kind} rows={d.rows} memoryKey={memoryKey} accessibilityLabel={gridLabel(p, tally, today, d.months)} testID="recap-period-grid" />
            <Divider />
            <View style={{ gap: 2 }}>
              <Text variant="title" testID="recap-period-verdict">
                {d.verdict.line}
              </Text>
              {d.verdict.note ? (
                <Text variant="caption" color="textSecondary">
                  {lastTwo(d.verdict.note)}
                </Text>
              ) : null}
            </View>
          </Card>

          <FadeUp index={1}>
            <Card testID="recap-period-numbers" style={{ gap: spacing.md }}>
              <Text variant="h3" {...H2}>
                {soFar ? 'So far in numbers' : 'In numbers'}
              </Text>
              <FigureRow testID="recap-period-active" color={colors.exercise} label="Active minutes" value={formatNumber(d.activity.activeMinutes)} unit="min" caption={activityCaption(d.activity)} />
              <Divider />
              <FigureRow testID="recap-period-water" color={colors.water} label="Water" value={water.value} unit={water.unit} caption={waterCaption(d.water)} />
              {d.weight && w ? (
                <>
                  <Divider />
                  <FigureRow
                    testID="recap-period-weight"
                    color={colors.weight}
                    label="Weight trend"
                    value={w.value}
                    unit={w.unit}
                    caption={w.caption}
                    side={
                      large ? null : (
                        // The trend line as drawn; its row's name says where it started and ended.
                        <View style={{ marginBottom: 6 }} {...DECORATIVE}>
                          <Sparkline values={evenly(d.weight.points, 40).map((t) => weightValue(t.trend, d.units))} color={colors.weight} width={96} height={28} />
                        </View>
                      )
                    }
                  />
                </>
              ) : null}
            </Card>
          </FadeUp>

          {d.foods.length ? (
            <FadeUp index={2}>
              <Card testID="recap-period-foods" style={{ gap: spacing.md }}>
                <Text variant="h3" {...H2}>
                  Logged most
                </Text>
                {d.foods.map((f, i) => {
                  const name = displayFoodName(f);
                  return (
                    <View key={f.key} testID={`recap-period-food-${i}`} {...figure(`${name}, logged on ${f.days} days`)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      {f.emoji ? <Text style={{ fontSize: 17, lineHeight: 22 }}>{f.emoji}</Text> : null}
                      {/* With large text the count takes a line of its own under the name, so no word of a name is split. */}
                      <View style={{ flex: 1, minWidth: 0, flexDirection: large ? 'column' : 'row', alignItems: large ? 'flex-start' : 'center', gap: large ? 0 : spacing.md }}>
                        <Text variant={i === 0 ? 'bodyStrong' : 'body'} numberOfLines={large ? 3 : 2} style={large ? undefined : { flex: 1, minWidth: 0 }}>
                          {name}
                        </Text>
                        <Text variant="label" color="textSecondary" style={{ flexShrink: 0 }}>
                          {`${formatNumber(f.days)} days`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </FadeUp>
          ) : null}

          <Text variant="title" align="center" color="textSecondary" testID="recap-period-closing" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
            {closingLine(p, tally, today)}
          </Text>
        </>
      )}

      <MoreInCups d={d} />

      <Sheet visible={help} onClose={() => setHelp(false)} title="Reading the cups">
        <View style={{ gap: spacing.md }} testID="recap-period-help-sheet">
          {helpParagraphs(kind).map((t, i) => (
            <Text key={i} variant="body" color={i === 2 ? 'textSecondary' : 'text'}>
              {t}
            </Text>
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

/** The way to the period's neighbours: a month leads to its year and to other months; a year to its months and other years. */
function MoreInCups({ d }: { d: ReturnType<typeof usePeriodRecap> }) {
  const { colors, spacing } = useTheme();
  const { period: p, today } = d;
  const rows: { key: string; title: string; caption: string; route: string; testID: string; share: number }[] = [];
  if (p.kind === 'month') {
    const year = d.years.find((y) => y.year === p.key.slice(0, 4));
    if (year) {
      const yw = yearRowWords(year.year, year.logged, today);
      rows.push({ key: year.year, title: `Your ${yw.title}`, caption: yw.caption, route: `/recap/year?year=${year.year}`, testID: `recap-period-year-${year.year}`, share: year.elapsed ? year.logged / year.elapsed : 0 });
    }
    for (const m of d.otherMonths) {
      const mw = monthRowWords(m.month, m.logged, m.elapsed, today);
      rows.push({ key: m.month, title: mw.title, caption: mw.caption, route: `/recap/month?month=${m.month}`, testID: `recap-period-month-${m.month}`, share: m.elapsed ? m.logged / m.elapsed : 0 });
    }
  } else {
    for (const m of d.months) {
      const mw = monthRowWords(m.month, m.logged, m.elapsed, today);
      rows.push({ key: m.month, title: mw.title, caption: mw.caption, route: `/recap/month?month=${m.month}`, testID: `recap-period-month-${m.month}`, share: m.elapsed ? m.logged / m.elapsed : 0 });
    }
    for (const y of d.years.filter((y) => y.year !== p.key)) {
      const yw = yearRowWords(y.year, y.logged, today);
      rows.push({ key: y.year, title: `Your ${yw.title}`, caption: yw.caption, route: `/recap/year?year=${y.year}`, testID: `recap-period-year-${y.year}`, share: y.elapsed ? y.logged / y.elapsed : 0 });
    }
  }
  if (!rows.length || !d.firstDate) return null;
  return (
    <FadeUp index={3}>
      <Card testID="recap-period-more" style={{ gap: spacing.xs }}>
        <Text variant="h3" {...H2} style={{ marginBottom: spacing.xs }}>
          {p.kind === 'month' ? 'More in cups' : `${periodName(p, today)} month by month`}
        </Text>
        {rows.map((r, i) => (
          <React.Fragment key={r.key}>
            {i ? <Divider /> : null}
            <ListRow
              testID={r.testID}
              title={r.title}
              subtitle={r.caption}
              // A small cup filled to the share of its days with food logged: the recap's own picture, in little.
              left={<MiniCup progress={r.share} color={colors.calories} width={18} height={22} animate={false} />}
              chevron
              onPress={() => go(r.route)}
            />
          </React.Fragment>
        ))}
      </Card>
    </FadeUp>
  );
}
