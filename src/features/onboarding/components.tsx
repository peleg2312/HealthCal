import { Check } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';
import { PressableScale, Ring, Text } from '@/ui';

/** Fades and lifts its children in, optionally after a delay (for staggered reveals). */
export function FadeIn({
  delay = 0,
  distance = 12,
  children,
  style,
}: {
  delay?: number;
  distance?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Step heading: a question and a short line on why it is asked. */
export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
      <Text variant="h1" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color="textSecondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** Large selectable option with an optional leading tile and a check when selected. */
export function ChoiceCard({
  title,
  hint,
  emoji,
  icon,
  color,
  selected,
  onPress,
  testID,
}: {
  title: string;
  hint?: string;
  emoji?: string;
  icon?: React.ReactNode;
  color?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const accent = color ?? colors.primary;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      scaleTo={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 64,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: selected ? `${accent}14` : colors.surface,
        borderWidth: 1.5,
        borderColor: selected ? accent : colors.border,
      }}>
      {emoji || icon ? (
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
          {emoji ? <Text style={{ fontSize: 22, lineHeight: 28 }}>{emoji}</Text> : icon}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="title">{title}</Text>
        {hint ? (
          <Text variant="caption" color="textSecondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.borderStrong,
          backgroundColor: selected ? accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {selected ? <Check size={15} strokeWidth={3} color={colors.bg} /> : null}
      </View>
    </PressableScale>
  );
}

/** Soft information panel with a leading icon. `tone` warning is amber, never red. */
export function Note({
  icon,
  children,
  tone = 'neutral',
  testID,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'primary';
  testID?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const tint = tone === 'warning' ? colors.warning : tone === 'primary' ? colors.primary : null;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: tint ? `${tint}18` : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: tint ? `${tint}44` : colors.border,
      }}>
      {icon ? <View style={{ paddingTop: 1 }}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{children}</View>
    </View>
  );
}

export function ErrorText({ children, testID }: { children?: string | null; testID?: string }) {
  if (!children) return null;
  return (
    <Text variant="caption" color="danger" testID={testID} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

/**
 * The brand mark: concentric rings in the semantic colours (calories, protein,
 * carbs, water) over a soft glow, filling in on mount.
 */
export function BrandRings({ size = 232 }: { size?: number }) {
  const { colors, dark } = useTheme();
  const rings = [
    { color: colors.calories, progress: 0.82 },
    { color: colors.protein, progress: 0.64 },
    { color: colors.carbs, progress: 0.9 },
    { color: colors.water, progress: 0.56 },
  ];
  const stroke = Math.round(size * 0.068);
  const gap = Math.round(size * 0.03);
  const glow = size * 1.5;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={glow} height={glow} style={{ position: 'absolute', left: (size - glow) / 2, top: (size - glow) / 2 }}>
        <Defs>
          <RadialGradient id="brand-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.calories} stopOpacity={dark ? 0.22 : 0.16} />
            <Stop offset="0.55" stopColor={colors.water} stopOpacity={dark ? 0.08 : 0.06} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill="url(#brand-glow)" />
      </Svg>
      {rings.map((r, i) => {
        const s = size - i * 2 * (stroke + gap);
        return (
          <Ring key={r.color + i} size={s} stroke={stroke} progress={r.progress} color={r.color} trackColor={`${r.color}26`} style={{ position: 'absolute' }} />
        );
      })}
    </View>
  );
}

/** Thin progress indicator for the onboarding steps. */
export function StepProgress({ index, total }: { index: number; total: number }) {
  const { colors, spacing } = useTheme();
  const [v] = useState(() => new Animated.Value((index + 1) / total));
  useEffect(() => {
    Animated.timing(v, { toValue: (index + 1) / total, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [index, total, v]);
  return (
    <View
      style={{ flex: 1, gap: spacing.xs }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      accessibilityLabel={`Step ${index + 1} of ${total}`}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' }}>
        <Animated.View
          style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
        />
      </View>
    </View>
  );
}
