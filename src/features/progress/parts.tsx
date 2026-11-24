import { router } from 'expo-router';
import { Triangle } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { fonts, useLargeText, useTheme } from '@/theme';
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
  keyVariant,
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
  /** An outlined key marks an estimate (expenditure), as on the overview tiles. */
  keyVariant?: 'filled' | 'outline';
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
            {color ? <CupKey color={color} size={10} variant={keyVariant} /> : null}
            {/* Two lines rather than an ellipsis at 320 px. */}
            <Text variant="h3" style={{ flexShrink: 1 }}>
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text variant="caption" color="textSecondary">
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
export function BigStat({ value, unit, label, align = 'left', ink = 'text' }: { value: string; unit?: string; label: string; color?: string; align?: 'left' | 'right'; ink?: 'text' | 'caloriesInk' }) {
  return (
    // The number and its unit never part: the words beside a big stat wrap instead.
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
      <Text variant="numL" color={ink}>
        {value}
        {unit ? <Text variant="unit">{`\u00A0${keepTogether(unit)}`}</Text> : null}
      </Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

/** A row of small stats separated by hairlines, under a hairline (stats share the card, not tiles of their own). */
export function StatStrip({ items }: { items: { label: string; value: string; unit?: string; color?: string; trend?: Direction | null }[] }) {
  const { colors, spacing } = useTheme();
  // Under 360 px three columns have about 70 px each: a smaller number, narrower gutters and the
  // trend mark beside the label keep each number on one line with its unit ("2,171 kcal", "19 of 27").
  const narrow = useWindowDimensions().width < 360;
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md }}>
      {items.map((it, i) => (
        <View
          key={it.label}
          style={{ flex: 1, minWidth: 0, paddingLeft: i ? (narrow ? spacing.sm : spacing.md) : 0, paddingRight: narrow ? spacing.xs : spacing.sm, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="numM" style={{ flexShrink: 1, fontSize: narrow ? 16 : 18, lineHeight: narrow ? 20 : 22 }}>
              {it.value}
              {it.unit ? <Text variant="unit">{`\u00A0${keepTogether(it.unit)}`}</Text> : null}
            </Text>
            {narrow ? null : <TrendMark trend={it.trend} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
              {it.label}
            </Text>
            {narrow ? <TrendMark trend={it.trend} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A unit such as "of 27" or "lb / wk" with no-break spaces, so it stays on its number's line. */
function keepTogether(unit: string): string {
  return unit.replace(/ /g, '\u00A0');
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

/**
 * The range picker, the first line of Progress under the tab header: "Show the last" and a
 * dropdown chip ("30 days") that opens a short sheet of choices.
 */
export function RangeSwitch({ value, onChange }: { value: RangeDays; onChange: (v: RangeDays) => void }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="label" color="textSecondary">
          Show the last
        </Text>
        <Chip testID="progress-range" label={`${value} days`} dropdown onPress={() => setOpen(true)} />
      </View>
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
                // react-native-web reads the aria prop, not accessibilityState.
                {...({ 'aria-checked': active } as object)}
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
                {/* The app's mark for the chosen row (a small filled ink cup, as OptionRow's): a check means only a day on budget. */}
                <View aria-hidden style={{ width: 20, alignItems: 'center' }}>
                  {active ? <CupKey color={colors.text} size={12} /> : null}
                </View>
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
  // At 320 px four tabs get about 70 px each: the labels step down so the selected (bold) one is never cut.
  const narrow = useWindowDimensions().width < 360;
  // Above 115% text four labels no longer fit on one line: the tabs go two to a row, so none is cut.
  const twoRows = useLargeText() && options.length > 2;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: twoRows ? 'wrap' : 'nowrap', borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
            // react-native-web reads the aria prop, not accessibilityState.
            {...({ 'aria-selected': active } as object)}
            accessibilityLabel={o.label}
            style={[twoRows ? { width: '50%' } : { flex: 1 }, { minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: narrow ? 1 : 4 }]}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1} style={{ fontSize: narrow ? 13 : 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }}>
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

/**
 * The marks explained once: the triangles against the previous period, and the dash for a change too
 * small to call (`change.ts`). The dash's words go under the triangles' on a phone too narrow for both.
 */
export function TrendLegend({ period }: { period: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: 2 }}>
      {/* Never wider than the card: at large text the words wrap beside their marks. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' }}>
        {/* The marks themselves are decorative here: the words beside them say what they mean. */}
        <View aria-hidden>
          <Triangle size={8} color={colors.textTertiary} fill={colors.textTertiary} />
        </View>
        <View aria-hidden style={{ transform: [{ rotate: '180deg' }] }}>
          <Triangle size={8} color={colors.textTertiary} fill={colors.textTertiary} />
        </View>
        <Text variant="caption" color="textTertiary" style={{ flexShrink: 1 }}>
          against your previous {period}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <View style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: colors.textTertiary }} />
        <Text variant="caption" color="textTertiary">
          about the same
        </Text>
      </View>
    </View>
  );
}

/** A thin hairline between related stats inside one card. */
export function Hairline({ vertical }: { vertical?: boolean }) {
  const { colors } = useTheme();
  return vertical ? <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} /> : <View style={{ height: 1, backgroundColor: colors.border }} />;
}
