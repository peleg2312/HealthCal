import { ChevronDown } from 'lucide-react-native';
import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, useTheme } from '@/theme';

import { PressableScale } from './Pressable';
import { Text } from './Text';

/**
 * A label you can tap: 32 visible (a 44 px touch target through hitSlop, on
 * web too), corners 6, a 1 px borderStrong edge. Selected is an ink chip (text fill, bg text). `dropdown` adds a
 * chevron for a chip that opens a choice (the "30 days" chip on Progress).
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  dropdown,
  style,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  dropdown?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  const fg = selected ? colors.bg : colors.text;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      // 6 above and below makes the 44 px target (ChipRow keeps 6 px of room so it is not clipped).
      // Sideways a chip is already 44 wide or more; 4 each side meets the next chip's area in the
      // middle of the 8 px gap, so a neighbour never takes a tap that is nearer this chip.
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 32,
          paddingHorizontal: 12,
          borderRadius: radius.chip,
          backgroundColor: selected ? colors.text : 'transparent',
          borderWidth: 1,
          borderColor: selected ? colors.text : colors.borderStrong,
        },
        style,
      ]}>
      {icon}
      <Text variant="label" color={fg} numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>
        {label}
      </Text>
      {dropdown ? <ChevronDown size={16} color={fg} strokeWidth={2.2} /> : null}
    </PressableScale>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingHorizontal: 20, paddingVertical: 6 }, style]} style={{ marginHorizontal: -20, marginVertical: -6, flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

/**
 * Chips that wrap onto more lines when the screen is narrow. Lines are 12 apart
 * (chips 8 apart), so the 44 px touch areas of a chip and the one under it meet
 * in the middle of the gap instead of the lower chip taking the upper one's taps.
 */
export function ChipWrap({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }, style]}>{children}</View>;
}

/**
 * An underline tab row: a 1 px border baseline, inactive labels in
 * textSecondary, the selected label in text with a 3 px rim bar under it
 * (inset 18% each side). No sliding pill and no filled track.
 */
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
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            feedback="select"
            scaleTo={0.98}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }}>
              {o.label}
            </Text>
            {active ? <Underline /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

/** The selected segment's level line, inset 18% each side of the label's cell. */
function Underline() {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -2, height: 3, borderRadius: 1, backgroundColor: colors.rim }} />;
}

/**
 * A small status label: a cup-key square in the colour, then the text.
 * Corners 4, a faint tint of the colour behind it. Text stays a text token.
 */
export function Badge({ label, color, style }: { label: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const c = color ?? colors.primary;
  const tintable = /^#[0-9a-fA-F]{6}$/.test(c);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 5,
          paddingHorizontal: 7,
          height: 22,
          borderRadius: 4,
          backgroundColor: tintable ? `${c}1F` : colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-start',
        },
        style,
      ]}>
      <CupKey color={c} size={7} />
      <Text variant="caption" color="text" style={{ fontSize: 11.5, lineHeight: 14, fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The legend key: a tiny cup (corners 1.5 on top, 4 at the base). `variant`
 * marks a food's data source: filled for reference, outlined for community,
 * dashed for an AI estimate.
 */
export function CupKey({ color, size = 9, variant = 'filled', style }: { color: string; size?: number; variant?: 'filled' | 'outline' | 'dashed'; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderTopLeftRadius: 1.5,
          borderTopRightRadius: 1.5,
          borderBottomLeftRadius: Math.min(4, size / 2),
          borderBottomRightRadius: Math.min(4, size / 2),
          backgroundColor: variant === 'filled' ? color : 'transparent',
          borderWidth: variant === 'filled' ? 0 : 1.5,
          borderColor: color,
          borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
        },
        style,
      ]}
    />
  );
}
