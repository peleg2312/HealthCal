import { Check } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { cup, cupFor, useTheme } from '@/theme';
import { PressableScale, Text, Vessel } from '@/ui';

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

/**
 * Large selectable option: a cup with an optional leading Lucide icon (in the
 * text colour) and a check when selected. The chosen one has an ink edge and
 * an ink check, the selection colour everywhere in Pour. Emoji are content
 * marks only, so `emoji` is accepted for old callers and ignored.
 */
export function ChoiceCard({
  title,
  hint,
  emoji: _emoji,
  icon,
  color: _color,
  selected,
  onPress,
  testID,
}: {
  title: string;
  hint?: string;
  /** @deprecated Emoji never sit in buttons in Pour. Accepted and ignored; pass `icon`. */
  emoji?: string;
  icon?: React.ReactNode;
  /** @deprecated Selection is ink in Pour. Accepted and ignored. */
  color?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors, radius, spacing } = useTheme();
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
        paddingLeft: spacing.lg,
        paddingRight: spacing.md,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text : colors.border,
        // Keep the content still when the edge thickens.
        margin: selected ? 0 : 1,
      }}>
      {icon ? <View style={{ width: 24, alignItems: 'center' }}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="title">{title}</Text>
        {hint ? (
          <Text variant="caption" color="textSecondary">
            {hint}
          </Text>
        ) : null}
      </View>
      <CheckCup selected={selected} />
    </PressableScale>
  );
}

/** A 24 px cup: an ink cup with a check when chosen, an empty outline otherwise. */
export function CheckCup({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 24,
        height: 24,
        ...cupFor(24),
        borderWidth: selected ? 0 : 1.5,
        borderColor: colors.borderStrong,
        backgroundColor: selected ? colors.text : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {selected ? <Check size={15} strokeWidth={3} color={colors.bg} /> : null}
    </View>
  );
}

/**
 * Information panel with a leading icon: an alt cup (surfaceAlt, no border).
 * `warning` and `primary` add a 3 px edge on the left in that colour; warning
 * is amber, never red.
 */
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
  const edge = tone === 'warning' ? colors.warning : tone === 'primary' ? colors.rim : null;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surfaceAlt,
        borderLeftWidth: edge ? 3 : 0,
        borderLeftColor: edge ?? 'transparent',
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
 * The brand mark: the Pour cup. An open vessel with a lip, filled with the
 * calorie colour to the day's level, a hatched band of exercise headroom on
 * top and the level line on the fill. It pours in on mount. No glow.
 */
export function BrandCup({ size = 200 }: { size?: number }) {
  const { colors } = useTheme();
  const h = size;
  const w = Math.round(size * 0.62);
  return (
    <View style={{ width: w + 16, height: h + 8, alignItems: 'center', justifyContent: 'flex-end' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Vessel value={0.56} max={1} headroom={0.16} color={colors.calories} width={w} height={h} lip />
    </View>
  );
}

/** Thin progress indicator for the onboarding steps. */
export function StepProgress({ index, total }: { index: number; total: number }) {
  const { colors, spacing, radius } = useTheme();
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
      {/* A flat level bar with the rim tick at the step reached (radius 2, never a pill). */}
      <View style={{ height: 6, justifyContent: 'center' }}>
        <View style={{ height: 6, borderRadius: radius.track, backgroundColor: colors.track, overflow: 'hidden' }}>
          <Animated.View style={{ height: 6, backgroundColor: colors.primary, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -4, height: 14, width: 0, left: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}>
          <View style={{ position: 'absolute', left: -1.5, width: 3, height: 14, borderRadius: 1, backgroundColor: colors.rim }} />
        </Animated.View>
      </View>
    </View>
  );
}
