import { Redirect } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';

import { addDays, formatDayLabel, formatLongDate } from '@/lib/dates';
import { useToday } from '@/store/clock';
import { useStore } from '@/store';
import { cup, useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { CupKey, IconButton, PressableScale, Text } from '@/ui';

/** Renders children only once a profile exists; otherwise sends the user to the welcome flow. */
export function RequireProfile({ children }: { children: React.ReactNode }) {
  const profile = useStore((s) => s.profile);
  if (!profile) return <Redirect href="/welcome" />;
  return <>{children}</>;
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** Previous / next day picker that never goes past today. */
export function DayStepper({ date, onChange, testID }: { date: ISODate; onChange: (d: ISODate) => void; testID: string }) {
  const { colors, radius } = useTheme();
  const atToday = date >= useToday();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        ...cup(radius.buttonSm, 5),
        borderWidth: 1.5,
        borderColor: colors.borderStrong,
        padding: 2,
      }}>
      <IconButton testID={`${testID}-prev`} accessibilityLabel="Previous day" tone="clear" size={44} onPress={() => onChange(addDays(date, -1))}>
        <ChevronLeft size={20} color={colors.text} />
      </IconButton>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text testID={`${testID}-label`} variant="title">
          {formatDayLabel(date)}
        </Text>
        <Text variant="caption" color="textSecondary">
          {formatLongDate(date)}
        </Text>
      </View>
      <IconButton
        testID={`${testID}-next`}
        accessibilityLabel="Next day"
        tone="clear"
        size={44}
        disabled={atToday}
        onPress={() => onChange(addDays(date, 1))}>
        <ChevronRight size={20} color={colors.text} />
      </IconButton>
    </View>
  );
}

/**
 * A number with a small unit beside it and a label underneath. With `color`
 * (a theme colour name), the label carries a cup key in that colour; the
 * number stays in the text colour (data colours are fills, never text).
 */
export function Figure({
  value,
  unit,
  label,
  color,
  size = 'numM',
  align = 'left',
  testID,
  basis,
}: {
  value: string;
  unit?: string;
  label: string;
  color?: string;
  size?: 'numM' | 'numL';
  align?: 'left' | 'center';
  testID?: string;
  /** In a row that wraps: the narrowest the figure may be before it moves to the next line, so its unit stays beside the number. */
  basis?: number;
}) {
  const { colors } = useTheme();
  const key = color ? ((colors as unknown as Record<string, string>)[color] ?? color) : undefined;
  return (
    <View style={{ ...(basis ? { flexGrow: 1, flexBasis: basis } : { flex: 1 }), minWidth: 0, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      {/* The figure itself never breaks (non-breaking spaces); on a narrow phone its unit may drop to a second line rather than be cut. */}
      <Text testID={testID} variant={size} tabular numberOfLines={2}>
        {value.replace(/ /g, '\u00A0')}
        {unit ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
      {/* Never wider than the figure's column: a long label takes a second line instead of running into the next figure. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
        {key ? <CupKey color={key} /> : null}
        <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/** Small info paragraph with an icon, used for "why" explanations. */
export function Note({ icon, children, style }: { icon?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, style]}>
      {icon ? <View style={{ paddingTop: 2 }}>{icon}</View> : null}
      <Text variant="caption" color="textSecondary" style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
        {children}
      </Text>
    </View>
  );
}

export { splitUnit } from './helpers';

/** Large square-ish tile for one-tap adds. */
export function Tile({
  title,
  subtitle,
  icon,
  onPress,
  testID,
  accessibilityLabel,
  selected,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  selected?: boolean;
}) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="press"
      scaleTo={0.94}
      accessibilityLabel={accessibilityLabel ?? title}
      style={{
        flex: 1,
        minWidth: 72,
        minHeight: 84,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 10,
      }}>
      {icon}
      <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 16, lineHeight: 21 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </PressableScale>
  );
}
