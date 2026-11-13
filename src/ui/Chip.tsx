import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './Pressable';
import { Text } from './Text';

export function Chip({
  label,
  selected,
  onPress,
  icon,
  style,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 36,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: selected ? colors.primary : colors.surface,
          borderWidth: 1,
          borderColor: selected ? colors.primary : colors.border,
        },
        style,
      ]}>
      {icon}
      <Text variant="label" color={selected ? 'onPrimary' : 'textSecondary'}>
        {label}
      </Text>
    </PressableScale>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingHorizontal: 20 }, style]} style={{ marginHorizontal: -20, flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            feedback="select"
            scaleTo={0.98}
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              height: 38,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.surface : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: colors.border,
            }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function Badge({ label, color, style }: { label: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const c = color ?? colors.primary;
  return (
    <View style={[{ paddingHorizontal: 8, height: 22, borderRadius: radius.pill, backgroundColor: `${c}22`, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' }, style]}>
      <Text variant="caption" color={c} style={{ fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}
