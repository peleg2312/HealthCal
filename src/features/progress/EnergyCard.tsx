import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { confidenceWord, kcalText } from '@/lib/insights';
import { WatchEstimate, WatchEstimateNote } from '@/features/health-sync/ui/WatchEstimate';
import { formatNumber } from '@/lib/units';
import type { EnergyModel } from '@/store/selectors';
import { useTheme } from '@/theme';
import { Badge, PressableScale, ProgressBar, Text } from '@/ui';

import { SectionCard } from './parts';

/** Minimums from src/lib/trend.ts, shown as progress toward the first estimate. */
const NEED_DAYS = 10;
const NEED_WEIGH_INS = 5;

/** One estimate; the two share the card, split by a hairline. The one that sets targets carries a badge. */
function Column({ title, value, caption, active, color, first }: { title: string; value: string | null; caption: string; active: boolean; color: string; first?: boolean }) {
  const { colors, spacing } = useTheme();
  // At 320 px a column is about 110 px wide: the number steps down so it and its unit stay whole.
  const narrow = useWindowDimensions().width < 360;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        paddingLeft: first ? 0 : spacing.lg,
        paddingRight: first ? spacing.md : 0,
        borderLeftWidth: first ? 0 : 1,
        borderLeftColor: colors.border,
        gap: 4,
      }}>
      <Text variant="caption" color="textSecondary">
        {title}
      </Text>
      <Text variant="numL" color={value ? 'text' : 'textTertiary'} style={value ? (narrow ? { fontSize: 24, lineHeight: 28 } : undefined) : { fontSize: 22 }}>
        {value ?? 'Not yet'}
        {value ? <Text variant="unit"> kcal</Text> : null}
      </Text>
      <Text variant="caption" color="textSecondary">
        {caption}
      </Text>
      {/* The badge is one line high: at 320 px the column only holds the short label. */}
      {active ? <Badge label={narrow ? 'Sets targets' : 'Sets your targets'} color={color} style={{ marginTop: 4 }} /> : null}
    </View>
  );
}

export function EnergyCard({ model, useAdaptiveSetting }: { model: EnergyModel; useAdaptiveSetting: boolean }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const a = model.adaptive;
  const ready = a.observed !== null;
  const pct = Math.round(a.confidence * 100);
  const word = confidenceWord(a.confidence);
  const delta = Math.round(model.target.dailyDelta);
  // What you burn has one key everywhere: the calorie colour, outlined because it is an estimate (as on the
  // overview tile). The exercise colour would say this card is about workouts; it is mostly resting burn.
  const accent = colors.calories;

  return (
    <SectionCard
      testID="progress-energy"
      title="Calories you burn"
      subtitle="In a typical day, before workouts"
      color={accent}
      keyVariant="outline"
      link="/settings/goals"
      linkLabel="Goals">
      <View style={{ flexDirection: 'row' }}>
        <Column
          first
          title="From your body"
          value={formatNumber(Math.round(model.formulaTdee))}
          caption="Height, weight, age and everyday activity"
          active={!model.usingAdaptive}
          color={accent}
        />
        <Column
          title="From your logs"
          value={ready ? formatNumber(a.observed!) : null}
          caption={ready ? `Your food and weigh-ins, last ${a.windowDays} days` : 'Needs a few weeks of logs'}
          active={model.usingAdaptive}
          color={accent}
        />
      </View>

      {ready ? (
        <View style={{ gap: 6 }} testID="progress-energy-confidence">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label">Confidence: {word}</Text>
            <Text variant="label" color="textSecondary" tabular>
              {pct}%
            </Text>
          </View>
          <ProgressBar progress={a.confidence} color={accent} height={6} />
          <Text variant="caption" color="textSecondary">
            Based on {a.loggedDays} fully logged days and {a.weighIns} weigh-ins in the last {a.windowDays} days.{' '}
            {model.usingAdaptive
              ? `Your targets use ${kcalText(model.tdee)}, a blend that gives your logs ${pct}% of the weight and the body estimate the rest. ${a.confidence >= 0.85 ? 'That is the most weight it ever gets, so a few unlogged days cannot swing your targets.' : 'More complete days and weigh-ins raise the confidence.'}`
              : useAdaptiveSetting
                ? ''
                : '"Learn from my data" is off in Goals, so your targets use the body estimate.'}
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }} testID="progress-energy-needs">
          <Text variant="body" color="textSecondary" style={{ fontSize: 14, lineHeight: 20 }}>
            Still needed: <Text variant="bodyStrong" style={{ fontSize: 14 }}>{a.needs}</Text>. Until then your targets use the estimate from your body.
          </Text>
          <NeedRow label="Fully logged days" have={a.loggedDays} need={NEED_DAYS} color={colors.calories} />
          <NeedRow label="Weigh-ins" have={a.weighIns} need={NEED_WEIGH_INS} color={colors.weight} />
        </View>
      )}

      <Text variant="caption" color="textSecondary">
        Daily target {kcalText(model.target.target)}: the {kcalText(model.tdee)} you burn{' '}
        {delta < -5 ? `minus ${formatNumber(-delta)} kcal for your goal` : delta > 5 ? `plus ${formatNumber(delta)} kcal for your goal` : 'with no deficit'}
        {model.target.limitedByFloor ? ', held at the minimum safe intake' : ''}.
      </Text>

      <WatchEstimate model={model} />

      <PressableScale
        testID="progress-energy-how"
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel="Where this number comes from"
        expanded={open}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: -spacing.sm }}>
        <Text variant="label">Where this number comes from</Text>
        {open ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
      </PressableScale>
      {open ? (
        <View style={{ gap: spacing.sm }} testID="progress-energy-explainer">
          <Text variant="caption" color="textSecondary">
            The estimate from your body starts from your resting burn (the Mifflin-St Jeor equation from height, weight, age and sex, or Katch-McArdle from
            lean mass when you know your body fat) and scales it for how active your days are outside workouts. It is a population average and can be off by
            10% or more for any one person.
          </Text>
          <Text variant="caption" color="textSecondary">
            The estimate from your logs works backwards from what actually happened: if you ate an average of 2,200 kcal a day and your weight held steady, you
            burn about 2,200. Weight change is read from a straight line fitted through your weigh-ins of the last {a.windowDays} days, so one high or low
            reading barely moves it, and each kilo of change is counted as about 7,700 kcal. Calories from logged exercise are taken out of the estimate,
            because your budget adds those separately.
          </Text>
          <Text variant="caption" color="textSecondary">
            It needs at least {NEED_DAYS} fully logged days and {NEED_WEIGH_INS} weigh-ins spread over two weeks. Confidence rises with more of both, and the
            estimate is blended with the body estimate until it is well supported. As everywhere in the app, a day counts as fully logged at 800 kcal or more and at least half its reference; here the reference is the body estimate, since this is what sets the target. Other days are left out.
          </Text>
          <WatchEstimateNote model={model} />
        </View>
      ) : null}
    </SectionCard>
  );
}

function NeedRow({ label, have, need, color }: { label: string; have: number; need: number; color: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="caption" color="text" tabular>
          {Math.min(have, need)} of {need}
        </Text>
      </View>
      <ProgressBar progress={have / need} color={color} height={6} />
    </View>
  );
}
