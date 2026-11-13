import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, PressableScale, Text } from '@/ui';

import type { RangeDays } from './useProgressData';

export function go(route: string) {
  router.push(route as never);
}

/** Card with an icon tile, a title and an optional link to the detail screen. */
export function SectionCard({
  title,
  subtitle,
  icon,
  color,
  link,
  linkLabel = 'Details',
  testID,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  link?: string;
  linkLabel?: string;
  testID?: string;
  children: React.ReactNode;
}) {
  const { spacing, radius, colors } = useTheme();
  return (
    <Card testID={testID} style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h3" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {link ? (
          <PressableScale
            testID={testID ? `${testID}-link` : undefined}
            onPress={() => go(link)}
            accessibilityLabel={`${title}: ${linkLabel}`}
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: spacing.sm, gap: 2 }}>
            <Text variant="label" color="primary">
              {linkLabel}
            </Text>
            <ChevronRight size={16} color={colors.primary} />
          </PressableScale>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

/** Large number with a small unit beside it and a caption below. */
export function BigStat({ value, unit, label, color, align = 'left' }: { value: string; unit?: string; label: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <View style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start', flexShrink: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="numL" tabular color={color ?? 'text'} numberOfLines={1}>
          {value}
        </Text>
        {unit ? (
          <Text variant="label" color="textSecondary">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A row of small stats separated by hairlines. */
export function StatStrip({ items }: { items: { label: string; value: string; unit?: string; color?: string }[] }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: spacing.md }}>
      {items.map((it, i) => (
        <View key={it.label} style={{ flex: 1, minWidth: 0, paddingHorizontal: spacing.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Text variant="numM" tabular color={it.color ?? 'text'} numberOfLines={1} style={{ fontSize: 18 }}>
              {it.value}
            </Text>
            {it.unit ? (
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {it.unit}
              </Text>
            ) : null}
          </View>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dashed ? (
        <View style={{ width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: color }} />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
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

export function RangeSwitch({ value, onChange }: { value: RangeDays; onChange: (v: RangeDays) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }} accessibilityRole="tablist">
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <PressableScale
            key={r}
            testID={`progress-range-${r}`}
            onPress={() => onChange(r)}
            feedback="select"
            scaleTo={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Last ${r} days`}
            style={{
              flex: 1,
              height: 40,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.surface : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: colors.border,
            }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'}>
              {r} days
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Pill switch with stable test ids, e.g. the Progress sections. */
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
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }} accessibilityRole="tablist">
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
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.primary : 'transparent',
            }}>
            <Text variant="label" color={active ? 'onPrimary' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
