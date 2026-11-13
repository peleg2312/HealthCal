import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

/**
 * One overview tile: a title, one large value with its unit, a small visual
 * and a one-line comparison with the previous equal period. The whole tile is
 * one pressable; it holds nothing else that can be pressed.
 */
export function ProgressTile({
  testID,
  title,
  color,
  value,
  unit,
  caption,
  visual,
  compare,
  onPress,
}: {
  testID: string;
  title: string;
  color: string;
  /** Null shows a dash. */
  value: string | null;
  unit?: string;
  /** Short context under the value, e.g. 'avg a day' or 'confidence high'. */
  caption?: string;
  visual?: React.ReactNode;
  /** Neutral comparison line, or null when there is nothing to compare with. */
  compare: string | null;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.97}
      accessibilityLabel={`${title}: ${value === null ? 'no data' : `${value} ${unit ?? ''}`}${caption ? `, ${caption}` : ''}. ${compare ?? ''} Open details.`}
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        minWidth: 0,
        minHeight: 156,
        padding: spacing.md,
        gap: 4,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="label" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Text>
        <ChevronRight size={14} color={colors.textTertiary} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="numL" tabular color={value === null ? 'textTertiary' : 'text'} numberOfLines={1} style={{ flexShrink: 1 }}>
          {value ?? '–'}
        </Text>
        {unit && value !== null ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" color="textTertiary" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
      <View style={{ flex: 1, justifyContent: 'flex-end', minHeight: 28, marginTop: 2 }}>{visual}</View>
      <Text variant="caption" color="textSecondary" numberOfLines={3} style={{ minHeight: 32 }}>
        {compare ?? 'Nothing to compare with yet'}
      </Text>
    </PressableScale>
  );
}

/** Seven small bars against a budget line, for the calories tile. */
export function MiniBars({ values, color, overColor }: { values: { value: number; budget: number; muted?: boolean }[]; color: string; overColor: string }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values.map((v) => Math.max(v.value, v.budget))) * 1.1;
  const h = 32;
  const line = values.length ? values.reduce((s, v) => s + v.budget, 0) / values.length : 0;
  return (
    <View style={{ height: h, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(v.value > 0 ? 3 : 2, (v.value / max) * h),
            borderRadius: 3,
            backgroundColor: v.value <= 0 ? colors.track : v.muted ? colors.textTertiary : v.value > v.budget * 1.1 ? overColor : color,
          }}
        />
      ))}
      {line > 0 ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: (line / max) * h, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.text, opacity: 0.55 }}
        />
      ) : null}
    </View>
  );
}

/** Seven dots, filled for days with food logged. */
export function WeekDots({ days, color }: { days: { date: string; logged: boolean }[]; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((d) => (
        <View
          key={d.date}
          style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: d.logged ? color : 'transparent', borderWidth: d.logged ? 0 : 1.5, borderColor: colors.border }}
        />
      ))}
    </View>
  );
}
