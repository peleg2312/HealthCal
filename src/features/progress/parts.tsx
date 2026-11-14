import { router } from 'expo-router';
import { Check, Triangle } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { fonts, useTheme } from '@/theme';
import type { Direction } from '@/lib/insights';
import { Card, Chip, CupKey, PressableScale, Sheet, Text } from '@/ui';

import type { RangeDays } from './useProgressData';

export function go(route: string) {
  router.push(route as never);
}

/**
 * A Pour card with a Bricolage title, a small subtitle and an optional
 * underlined text link to the detail screen. The data colour appears only as
 * a cup key before the title (never as a tinted tile or as text).
 */
export function SectionCard({
  title,
  subtitle,
  icon: _icon,
  color,
  link,
  linkLabel = 'Details',
  testID,
  children,
}: {
  title: string;
  subtitle?: string;
  /** @deprecated Pour cards carry a cup key, not an icon tile. Accepted and ignored. */
  icon?: React.ReactNode;
  /** A data colour: shown as a cup key before the title. Omit for cards that are not about one measure. */
  color?: string;
  link?: string;
  linkLabel?: string;
  testID?: string;
  children: React.ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <Card testID={testID} style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {color ? <CupKey color={color} size={10} /> : null}
            <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {link ? <TextLink testID={testID ? `${testID}-link` : undefined} label={linkLabel} accessibilityLabel={`${title}: ${linkLabel}`} onPress={() => go(link)} /> : null}
      </View>
      {children}
    </Card>
  );
}

/** An underlined text link in the text colour, with a 44 px touch target (primary text is too faint on bg in light). */
export function TextLink({ label, onPress, testID, accessibilityLabel }: { label: string; onPress: () => void; testID?: string; accessibilityLabel?: string }) {
  return (
    <PressableScale testID={testID} onPress={onPress} accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? label} hitSlop={6} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 8 }}>
      <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Large number with a small unit inside it and a caption below. Numbers stay in a text colour. */
export function BigStat({ value, unit, label, align = 'left' }: { value: string; unit?: string; label: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', flexShrink: 1 }}>
      <Text variant="numL" numberOfLines={1}>
        {value}
        {unit ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A row of small stats separated by hairlines, under a hairline (stats share the card, not tiles of their own). */
export function StatStrip({ items }: { items: { label: string; value: string; unit?: string; color?: string; trend?: Direction | null }[] }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
      {items.map((it, i) => (
        <View key={it.label} style={{ flex: 1, minWidth: 0, paddingLeft: i ? spacing.md : 0, paddingRight: spacing.sm, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="numM" style={{ flexShrink: 1, fontSize: 18, lineHeight: 22 }}>
              {it.value}
              {it.unit ? <Text variant="unit">{` ${it.unit}`}</Text> : null}
            </Text>
            <TrendMark trend={it.trend} />
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A chart legend entry: a cup key, a dashed rule (budget) or a short rim bar (the day's level). */
export function LegendDot({ color, label, dashed, level }: { color: string; label: string; dashed?: boolean; level?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dashed ? (
        <View style={{ width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: color }} />
      ) : level ? (
        <View style={{ width: 14, height: 3, borderRadius: 1, backgroundColor: color }} />
      ) : (
        <CupKey color={color} />
      )}
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" color="textTertiary">
      {children}
    </Text>
  );
}

const RANGES: RangeDays[] = [7, 30, 90];

/** The range picker: a dropdown chip ("30 days") that opens a short sheet of choices. */
export function RangeSwitch({ value, onChange }: { value: RangeDays; onChange: (v: RangeDays) => void }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Chip testID="progress-range" label={`${value} days`} dropdown onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Show the last">
        <View accessibilityRole="radiogroup">
          {RANGES.map((r, i) => {
            const active = r === value;
            return (
              <PressableScale
                key={r}
                testID={`progress-range-${r}`}
                onPress={() => {
                  onChange(r);
                  setOpen(false);
                }}
                feedback="select"
                scaleTo={0.99}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={`Last ${r} days`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 52,
                  gap: spacing.md,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.border,
                }}>
                <Text variant="bodyStrong" style={{ flex: 1, fontFamily: active ? fonts.bold : fonts.semibold }}>
                  {r} days
                </Text>
                {active ? <Check size={20} color={colors.text} strokeWidth={2.2} /> : null}
              </PressableScale>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

/**
 * The kit's underline tab row (Segmented) with stable test ids per tab: a 1 px
 * baseline, the selected label bold with a 3 px rim bar under it.
 */
export function SegmentSwitch<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            testID={`${testIDPrefix}-${o.value}`}
            onPress={() => onChange(o.value)}
            feedback="select"
            scaleTo={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={{ flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }}>
              {o.label}
            </Text>
            {active ? <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -2, height: 3, borderRadius: 1, backgroundColor: colors.rim }} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

const TREND_WORD: Record<Direction, string> = { up: 'higher than', down: 'lower than', same: 'about the same as' };

/**
 * Small neutral triangle: which way a value moved against the previous equal
 * period. Never green or red: a change is information, not a verdict.
 */
export function TrendMark({ trend, period }: { trend?: Direction | null; period?: string }) {
  const { colors } = useTheme();
  if (!trend) return null;
  const label = `${TREND_WORD[trend]} the previous ${period ?? 'period'}`;
  if (trend === 'same')
    return <View accessible accessibilityLabel={label} style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: colors.textTertiary, alignSelf: 'center' }} />;
  return (
    <View accessible accessibilityLabel={label} style={{ alignSelf: 'center', transform: [{ rotate: trend === 'down' ? '180deg' : '0deg' }] }}>
      <Triangle size={9} color={colors.textSecondary} fill={colors.textSecondary} />
    </View>
  );
}

/** One line explaining the triangles. */
export function TrendLegend({ period }: { period: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Triangle size={8} color={colors.textTertiary} fill={colors.textTertiary} />
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <Triangle size={8} color={colors.textTertiary} fill={colors.textTertiary} />
      </View>
      <Text variant="caption" color="textTertiary">
        compared with your previous {period}
      </Text>
    </View>
  );
}

/** A thin hairline between related stats inside one card. */
export function Hairline({ vertical }: { vertical?: boolean }) {
  const { colors } = useTheme();
  return vertical ? <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} /> : <View style={{ height: 1, backgroundColor: colors.border }} />;
}
