import { Redirect } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { addDays, formatDayLabel, formatLongDate, today } from '@/lib/dates';
import { useStore } from '@/store';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { IconButton, PressableScale, Text } from '@/ui';

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
  const atToday = date >= today();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surfaceAlt,
        borderRadius: radius.md,
        padding: 6,
      }}>
      <IconButton testID={`${testID}-prev`} accessibilityLabel="Previous day" tone="surface" size={44} onPress={() => onChange(addDays(date, -1))}>
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
        tone="surface"
        size={44}
        disabled={atToday}
        onPress={() => onChange(addDays(date, 1))}>
        <ChevronRight size={20} color={colors.text} />
      </IconButton>
    </View>
  );
}

/** A number with a small unit beside it and a label underneath. */
export function Figure({
  value,
  unit,
  label,
  color,
  size = 'numM',
  align = 'left',
  testID,
}: {
  value: string;
  unit?: string;
  label: string;
  color?: string;
  size?: 'numM' | 'numL';
  align?: 'left' | 'center';
  testID?: string;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text testID={testID} variant={size} tabular color={color ?? 'text'} numberOfLines={1}>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" color="textSecondary">
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

/** Split a formatted value such as '1.25 L' into number and unit. */
export function splitUnit(formatted: string): { value: string; unit: string } {
  const i = formatted.lastIndexOf(' ');
  return i < 0 ? { value: formatted, unit: '' } : { value: formatted.slice(0, i), unit: formatted.slice(i + 1) };
}

// ------------------------------------------------------------- water wave

const AMPLITUDE = 7;

function wavePath(width: number): string {
  const h = AMPLITUDE * 2 + 2;
  const q = width / 4;
  // Two full periods (four half waves) so the layer can slide left by one period and loop seamlessly.
  let d = `M 0 ${AMPLITUDE} Q ${q} 0 ${2 * q} ${AMPLITUDE}`;
  for (let k = 2; k <= 4; k++) d += ` T ${k * 2 * q} ${AMPLITUDE}`;
  return `${d} L ${width * 2} ${h} L 0 ${h} Z`;
}

function WaveLayer({
  width,
  height,
  color,
  opacity,
  duration,
  phase,
  reduceMotion,
  lift = 0,
}: {
  width: number;
  height: Animated.AnimatedInterpolation<number> | Animated.Value;
  color: string;
  opacity: number;
  duration: number;
  phase: number;
  reduceMotion: boolean;
  lift?: number;
}) {
  const [shift] = useState(() => new Animated.Value(phase));
  useEffect(() => {
    if (reduceMotion) {
      shift.setValue(phase);
      return;
    }
    shift.setValue(0);
    const loop = Animated.loop(
      Animated.timing(shift, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [shift, duration, reduceMotion, phase]);
  const translateX = shift.interpolate({ inputRange: [0, 1], outputRange: [0, -width] });
  const waveH = AMPLITUDE * 2 + 2;
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height, opacity }} pointerEvents="none">
      <Animated.View style={{ position: 'absolute', top: -waveH + 1 - lift, left: 0, width: width * 2, height: waveH, transform: [{ translateX }] }}>
        <Svg width={width * 2} height={waveH}>
          <Path d={wavePath(width)} fill={color} />
        </Svg>
      </Animated.View>
      <View style={{ position: 'absolute', top: -lift, left: 0, right: 0, bottom: 0, backgroundColor: color }} />
    </Animated.View>
  );
}

/**
 * Round glass that fills with gently moving water. Fill animates when the
 * amount changes; waves pause when the system asks for reduced motion.
 */
export function WaterWave({ progress, size = 220, children }: { progress: number; size?: number; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const inner = size - 16;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  // Keep a sliver visible at the bottom once anything is logged, and never quite flat when full.
  const visual = clamped === 0 ? 0 : 0.03 + clamped * 0.92;
  const [fill] = useState(() => new Animated.Value(0));
  const [bump] = useState(() => new Animated.Value(1));
  const prev = useRef(clamped);

  useEffect(() => {
    Animated.timing(fill, {
      toValue: visual,
      duration: reduceMotion ? 0 : 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    if (clamped > prev.current && !reduceMotion) {
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.04, duration: 140, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(bump, { toValue: 1, speed: 14, bounciness: 10, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
    prev.current = clamped;
  }, [visual, clamped, fill, bump, reduceMotion]);

  const height = fill.interpolate({ inputRange: [0, 1], outputRange: [0, inner] });
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: `${colors.water}44`,
        padding: 6,
        transform: [{ scale: bump }],
      }}>
      <View style={{ flex: 1, borderRadius: inner / 2, overflow: 'hidden', backgroundColor: `${colors.water}14` }}>
        {clamped > 0 ? (
          <>
            <WaveLayer width={inner} height={height} color={colors.water} opacity={0.35} duration={5200} phase={0.5} reduceMotion={reduceMotion} lift={6} />
            <WaveLayer width={inner} height={height} color={colors.water} opacity={0.9} duration={3400} phase={0} reduceMotion={reduceMotion} />
          </>
        ) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </View>
      </View>
    </Animated.View>
  );
}

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
        borderRadius: radius.md,
        backgroundColor: selected ? `${colors.water}22` : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? colors.water : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 10,
      }}>
      {icon}
      <Text variant="title" tabular numberOfLines={1}>
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
