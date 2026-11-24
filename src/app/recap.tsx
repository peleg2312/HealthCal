import { useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowRight, ArrowUp, CalendarCheck, ChevronRight, Info, Star, Target } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { addDays, formatDayLabel, formatShortDate } from '@/lib/dates';
import { budgetBalanceText, weekRangeLabel, type RecapTile } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { changeDirection, changeWords, type ChangeKind } from '@/features/progress/change';
import { go } from '@/features/progress/parts';
import { RecapCups } from '@/features/progress/RecapCups';
import { recapDayCups, recapDaysVerdict } from '@/features/progress/recapDays';
import { useRecapReady } from '@/features/progress/recapReady';
import { useRecap } from '@/features/progress/useRecap';
import { ShareWeekButton } from '@/features/share';
import { useTheme } from '@/theme';
import { AnimatedNumber, Card, CupKey, Divider, EmptyState, FadeUp, Header, IconButton, PressableScale, Screen, Sheet, Text } from '@/ui';

function deltaText(t: RecapTile): string {
  if (t.soFar) return 'So far, week in progress';
  if (t.delta === null) return t.previous === null ? 'No data the week before' : '';
  if (t.delta === 0) return 'Same as the week before';
  const n = formatNumber(Math.abs(t.delta));
  const unit = t.id === 'water' ? (Math.abs(t.delta) === 1 ? ' day' : ' days') : t.id === 'protein' ? ' g' : t.id === 'activity' ? ' min' : ' kcal';
  return `${t.delta > 0 ? '+' : '−'}${n}${unit} vs the week before`;
}

/** Each tile's measure for the honest-arrow rule (`change.ts`): an arrow only for a change worth calling, else the sideways one. */
const TILE_KIND: Record<RecapTile['id'], ChangeKind> = { calories: 'kcal', protein: 'protein', activity: 'minutes', water: 'days' };

/** One cell of the week's numbers: the four share a card, divided by hairlines. */
function Tile({ t, index, week }: { t: RecapTile; index: number; week: string }) {
  const { colors, spacing } = useTheme();
  // At 320 px a tile is about 108 px wide: the number steps down so it and its unit are never cut.
  const narrow = useWindowDimensions().width < 360;
  const color = {
    calories: colors.calories,
    protein: colors.protein,
    activity: colors.exercise,
    water: colors.water,
  }[t.id];
  const dir = t.delta === null ? null : changeDirection(TILE_KIND[t.id], t.value, t.previous);
  const Arrow = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : ArrowRight;
  // Read out with its size and whether it counts as a change ("About the same as the week before: down 17 kcal a day").
  const said = t.delta === null ? deltaText(t) : (changeWords(TILE_KIND[t.id], t.value, t.previous, { period: 'week', than: 'the week before', total: t.id === 'activity' }) ?? deltaText(t));
  return (
    <View
      testID={`recap-tile-${t.id}`}
      accessible
      accessibilityLabel={`${t.label}: ${t.value === null ? 'no data' : `${formatNumber(t.value)} ${t.unit}`}, ${t.context}. ${said}`}
      style={{
        width: '50%',
        minWidth: 0,
        paddingHorizontal: spacing.lg,
        paddingTop: 14,
        paddingBottom: spacing.lg,
        gap: 3,
        borderRightWidth: index % 2 === 0 ? 1 : 0,
        borderTopWidth: index >= 2 ? 1 : 0,
        borderColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <CupKey color={color} size={10} />
        <Text variant="label" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
          {t.label}
        </Text>
      </View>
      {t.value === null ? (
        <Text variant="numL" color="textTertiary">
          –
        </Text>
      ) : (
        // Ticks up from zero when the recap opens, once per week this session.
        <AnimatedNumber
          variant="numL"
          color={t.id === 'calories' ? 'caloriesInk' : 'text'}
          value={t.value}
          from={0}
          memoryKey={`recap-${week}-${t.id}`}
          delay={index * 60}
          style={narrow ? { fontSize: 24, lineHeight: 28 } : undefined}>
          <Text variant="unit">{` ${t.unit}`}</Text>
        </AnimatedNumber>
      )}
      <Text variant="caption" color="textSecondary" numberOfLines={2}>
        {t.context}
      </Text>
      {deltaText(t) ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginTop: 4,
          }}>
          {t.delta !== null ? <Arrow size={12} color={colors.textSecondary} /> : null}
          <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
            {deltaText(t)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ icon, label, text, testID }: { icon: React.ReactNode; label: string; text: string; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
      }}>
      <View style={{ width: 20, paddingTop: 1 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="overline">{label}</Text>
        <Text variant="body">{text}</Text>
      </View>
    </View>
  );
}

export default function RecapScreen() {
  const { week: weekParam } = useLocalSearchParams<{ week?: string }>();
  const { colors, spacing } = useTheme();
  const d = useRecap(weekParam);
  const ready = useRecapReady();
  const r = d.recap;
  const [help, setHelp] = useState(false);
  const cups = r ? recapDayCups(r.weekStart, r.days, d.today) : [];
  const verdict = recapDaysVerdict(cups);

  // Opening last week's check-in clears "Your week is ready" on Today.
  useEffect(() => {
    if (r && ready.ready && ready.week === d.week) ready.markSeen();
  }, [r, ready, d.week]);

  const title = r?.label === 'This week' ? 'This week so far' : r?.label === 'Last week' ? 'Your week' : 'Weekly check\u2011in';
  const range = weekRangeLabel(d.week, addDays(d.week, 6));

  return (
    <Screen
      header={
        <Header
          title={title}
          subtitle={r ? `${r.label === 'Week' ? 'Week of' : `${r.label} ·`} ${weekRangeLabel(r.weekStart, r.weekEnd)}` : range}
          right={r ? <ShareWeekButton recap={r} /> : undefined}
        />
      }
      testID="recap-screen">
      {!r ? (
        <Card>
          <EmptyState
            title="Not enough to recap yet"
            message="It appears once a week has 3 days with food logged, and compares it with the week before."
            action="Open diary"
            onAction={() => go('/diary')}
          />
        </Card>
      ) : (
        <>
          {/* The win is the week's headline, held in a card so it reads as content under the header, not a second title. */}
          <Card style={{ gap: spacing.xs }} testID="recap-win-card">
            <Text variant="overline">Win of the week</Text>
            <Text variant="h2" testID="recap-win">
              {/* The last two words share a line, so a headline never ends on one word alone ("150."). */}
              {r.win.replace(/ (\S+)$/, '\u00A0$1')}
            </Text>
          </Card>

          <FadeUp index={1}>
            <Card padding={0} style={{ flexDirection: 'row', flexWrap: 'wrap' }} testID="recap-tiles">
              {d.tiles.map((t, i) => (
                <Tile key={t.id} t={t} index={i} week={d.week} />
              ))}
            </Card>
          </FadeUp>

          <FadeUp index={2}>
            <Card style={{ gap: spacing.md }} testID="recap-days">
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="h3">Day by day</Text>
                  {/* Plain words in the headline ("3 of 7 days on budget, 2 above"); what they count and the week's balance in the caption. */}
                  <Text variant="title" testID="recap-days-verdict">
                    {verdict.line}
                  </Text>
                  <Text variant="caption" color="textSecondary" testID="recap-days-note">
                    {[verdict.note, budgetBalanceText(r.budgetBalance)].filter(Boolean).join('. ')}
                  </Text>
                </View>
                <IconButton size={36} tone="clear" testID="recap-chart-help" accessibilityLabel="How to read the cups" onPress={() => setHelp(true)}>
                  <Info size={20} color={colors.textSecondary} strokeWidth={1.9} />
                </IconButton>
              </View>
              <RecapCups cups={cups} week={d.week} />
            </Card>
          </FadeUp>

          <Card style={{ gap: spacing.md }}>
            {r.bestDay ? (
              <>
                <Row
                  testID="recap-best-day"
                  icon={<Star size={19} color={colors.text} strokeWidth={1.9} />}
                  label={`Best day · ${formatDayLabel(r.bestDay.date)}`}
                  text={r.bestDay.detail}
                />
                <Divider />
              </>
            ) : null}
            <Row
              testID="recap-focus"
              icon={<Target size={19} color={colors.text} strokeWidth={1.9} />}
              label={r.label === 'This week' ? 'Focus for the rest of the week' : 'Focus for this week'}
              text={r.focus}
            />
          </Card>

          <PressableScale
            testID="recap-plan"
            onPress={() => go('/settings/goals')}
            accessibilityLabel={`Your daily target: ${formatNumber(d.plan.before)} kcal on ${formatShortDate(d.week)}, ${formatNumber(d.plan.after)} kcal ${d.plan.afterDate === d.today ? 'today' : `from ${formatShortDate(d.plan.afterDate)}`}. ${d.plan.reason} The target is before workouts${d.exerciseRule === 'day' ? '; logged workouts add their own calories on the day' : d.exerciseRule === 'week' ? '; each logged workout adds a seventh of its calories to 7 days' : d.exerciseRule === 'mixed' ? '; logged workouts add their calories by the rule each day had, on the day or shared over 7 days' : ''}. Open goals.`}
            scaleTo={0.985}>
            <Card style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}>
                <Text variant="h3" style={{ flex: 1 }}>
                  Your daily target
                </Text>
                <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.9} />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: spacing.lg,
                  flexWrap: 'wrap',
                }}>
                <View>
                  <Text variant="caption" color="textSecondary">
                    {formatShortDate(d.week)}
                  </Text>
                  <Text variant="numM" color="textSecondary">
                    {formatNumber(d.plan.before)}
                    <Text variant="unit"> kcal</Text>
                  </Text>
                </View>
                <ArrowRight size={18} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <View>
                  <Text variant="caption" color="textSecondary">
                    {d.plan.afterDate === d.today ? 'Today' : formatShortDate(d.plan.afterDate)}
                  </Text>
                  <Text variant="numL" color="caloriesInk">
                    {formatNumber(d.plan.after)}
                    <Text variant="unit"> kcal</Text>
                  </Text>
                </View>
              </View>
              <Text variant="caption" color="textSecondary">
                {d.plan.reason}
              </Text>
            </Card>
          </PressableScale>
        </>
      )}

      <Sheet visible={help} onClose={() => setHelp(false)} title="Reading the cups">
        <View style={{ gap: spacing.md }} testID="recap-help">
          <Text variant="body">Each cup is one day, filled to how much of that day&apos;s own budget you ate. The dashed line across the tops is each day&apos;s budget, so a full cup is a day right on it.</Text>
          <Text variant="body">A check marks a fully logged day on budget: 90 to 100% of its own budget. Amber at the top marks a day above its budget, and such a day has no check. A lighter fill is a day only partly logged (under 800 kcal or half the budget), and a hatched cup is today, still in progress.</Text>
          <Text variant="body" color="textSecondary">Budgets change with exercise and with your plan, which is why each day is measured against its own and never against the week&apos;s average.</Text>
        </View>
      </Sheet>

      {d.earlier.length ? (
        <Card style={{ gap: spacing.xs }} testID="recap-earlier">
          <Text variant="h3" style={{ marginBottom: spacing.xs }}>
            Earlier weeks
          </Text>
          {d.earlier.map((w) => (
            <PressableScale
              key={w}
              testID={`recap-week-${w}`}
              onPress={() => go(`/recap?week=${w}`)}
              accessibilityLabel={`Open the check-in for the week of ${formatShortDate(w)}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: 44,
              }}>
              <CalendarCheck size={18} color={colors.textSecondary} strokeWidth={1.9} />
              <Text variant="body" style={{ flex: 1 }}>
                {weekRangeLabel(w, addDays(w, 6))}
              </Text>
              <ChevronRight size={18} color={colors.textTertiary} />
            </PressableScale>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
