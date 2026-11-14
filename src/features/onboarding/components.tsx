import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Text as RNText, TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { cup, fonts, motion, useReducedMotion, useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { FadeUp, MiniCup, parseNumber, PressableScale, ProgressBar, Text } from '@/ui';

import { convertUnits, type Draft } from './model';

/**
 * Fades and lifts its children in, optionally after a delay (for staggered
 * reveals). The kit's `FadeUp` under an older name, so it is instant under
 * reduced motion and runs off the JS thread.
 */
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
  return (
    <FadeUp delay={delay} distance={distance} duration={300} style={style}>
      {children}
    </FadeUp>
  );
}

/**
 * The arrival moments (the welcome cup, the plan reveal) pour a little longer
 * than a screen's cup: once, at a moment that deserves it. Never faster than
 * the kit's pour.
 */
export const ARRIVAL_POUR = Math.round(motion.duration.pour * 1.45);

/**
 * One question arriving: it slides in 20 px from the side it comes from
 * (the right going forward, the left going back) while it fades in. The kit's
 * `FadeUp` turned sideways, with the same tokens: a CSS animation on web and
 * the UI thread natively. Instant under reduced motion. It only enters;
 * nothing waits for the question that left.
 */
export function StepSlide({ direction, disabled, children }: { direction: 1 | -1; disabled?: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  // Decided once, at mount: a later change must not replay or cut the entrance.
  const [animate] = useState(() => !reduce && !disabled);
  if (!animate) return <View>{children}</View>;
  return (
    <Animated.View
      style={{
        animationName: { from: { opacity: 0, transform: [{ translateX: direction * 20 }] }, to: { opacity: 1, transform: [{ translateX: 0 }] } },
        animationDuration: motion.duration.slide,
        animationTimingFunction: `cubic-bezier(${motion.easing.enter.join(', ')})`,
        animationFillMode: 'backwards',
      }}>
      {children}
    </Animated.View>
  );
}

/** Step heading: a question and a short line on why it is asked. */
export function StepTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <Text variant="h1" accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text variant="body" color="textSecondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Large selectable option. The whole tile is the control: no checkbox. The
 * chosen one gets the selection look of Pour: an ink edge, the level line
 * (rim) along its top and a soft primary fill. `icon` takes a mini cup or a
 * Lucide icon in the text colour (emoji never sit in buttons in Pour).
 */
export function ChoiceCard({
  title,
  hint,
  icon,
  selected,
  onPress,
  testID,
  compact,
  size = 'md',
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
  testID: string;
  /** Centred title only (two tiles side by side). */
  compact?: boolean;
  /** `lg` is for a question with two or three answers: taller tiles, a heading-size title, room for a week-strip cup. */
  size?: 'md' | 'lg';
}) {
  const lg = size === 'lg';
  const { colors, radius, spacing } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      scaleTo={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      aria-checked={selected}
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: compact ? 'center' : 'flex-start',
        gap: lg ? spacing.lg : spacing.md,
        minHeight: compact ? 96 : lg ? 92 : 68,
        paddingVertical: spacing.md,
        paddingHorizontal: lg ? spacing.xl : spacing.lg,
        ...cup(lg || compact ? radius.card : radius.tile, 5),
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text : colors.border,
        // Keep the content still when the edge thickens.
        margin: selected ? 0 : 1,
        overflow: 'hidden',
      }}>
      {selected ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: colors.rim }} /> : null}
      {icon ? <View style={{ minWidth: 30, alignItems: 'center' }}>{icon}</View> : null}
      <View style={compact ? { flexShrink: 1, minWidth: 0 } : { flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant={compact || lg ? 'h3' : 'title'} align={compact ? 'center' : undefined}>
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" color="textSecondary">
            {hint}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/**
 * A goal as a cup, the size of a week-strip cup. Lose: the level drains from
 * where it was (a dashed mark stays there) to a lower one. Maintain: a steady
 * level. Gain: it rises past the dashed mark where it started. The cup mounts
 * at the old level and pours to the new one once, shortly after the question
 * arrives; reduced motion shows the end state at once.
 */
export function GoalCup({ goal, index = 0 }: { goal: 'lose' | 'maintain' | 'gain'; index?: number }) {
  const { colors } = useTheme();
  const w = 36;
  const h = 46;
  const level = goal === 'lose' ? 0.34 : goal === 'gain' ? 0.84 : 0.6;
  const was = goal === 'lose' ? 0.72 : goal === 'gain' ? 0.46 : null;
  const reduce = useReducedMotion();
  // Reduced motion starts at the end state, so nothing jumps a moment after the question appears.
  const [poured, setPoured] = useState(reduce);
  useEffect(() => {
    const id = setTimeout(() => setPoured(true), 260 + index * 80);
    return () => clearTimeout(id);
  }, [index]);
  return (
    <View style={{ width: w, height: h }}>
      <MiniCup progress={poured || was === null ? level : was} color={colors.calories} width={w} height={h} animate={poured} />
      {was !== null ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 4, right: 4, top: Math.round((1 - was) * h) - 1, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.vesselEdge }}
        />
      ) : null}
    </View>
  );
}

/**
 * Information panel with a leading icon: an alt cup (surfaceAlt, no border).
 * `warning` adds a 3 px amber edge on the left (never red). `primary` is kept
 * for old callers and draws like neutral.
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
  const edge = tone === 'warning' ? colors.warning : null;
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

/** Progress through the questions: the kit's level bar with the rim tick, in the brand colour. */
export function StepProgress({ index, total }: { index: number; total: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ flex: 1, justifyContent: 'center' }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      accessibilityLabel={`Step ${index + 1} of ${total}`}>
      <ProgressBar progress={(index + 1) / total} color={colors.primary} height={6} memoryKey="onb-progress" />
    </View>
  );
}

/**
 * Units as two small label chips ("kg · cm" / "lb · ft"), for the corner of a
 * step. The answer is preselected from the phone's region, so this is a
 * correction, not a question. Switching re-expresses anything already typed.
 */
export function UnitsToggle({ draft, set, idPrefix = 'onb-units' }: { draft: Draft; set: (patch: Partial<Draft>) => void; idPrefix?: string }) {
  const { colors, radius } = useTheme();
  const opts: { value: UnitSystem; label: string; a11y: string }[] = [
    { value: 'metric', label: 'kg · cm', a11y: 'Metric units: kilograms and centimetres' },
    { value: 'imperial', label: 'lb · ft', a11y: 'Imperial units: pounds, feet and inches' },
  ];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Units" style={{ flexDirection: 'row', gap: 4 }}>
      {opts.map((o) => {
        const active = draft.units === o.value;
        return (
          <PressableScale
            key={o.value}
            testID={`${idPrefix}-${o.value}`}
            onPress={() => set(convertUnits(draft, o.value))}
            feedback="select"
            scaleTo={0.97}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, selected: active }}
            aria-checked={active}
            accessibilityLabel={o.a11y}
            style={{
              height: 34,
              paddingHorizontal: 10,
              justifyContent: 'center',
              borderRadius: radius.chip,
              borderWidth: active ? 1.5 : 1,
              borderColor: active ? colors.text : colors.border,
              backgroundColor: active ? colors.surface : 'transparent',
            }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} style={{ fontFamily: active ? fonts.bold : fonts.semibold }}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A quiet text button that shows a short explanation in place: the equation names live here, not in the titles. */
export function WhyWeAsk({ children, testID, title = 'Why we ask' }: { children: React.ReactNode; testID: string; title?: string }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ gap: spacing.sm }}>
      <PressableScale
        testID={testID}
        onPress={() => setOpen(!open)}
        feedback="tap"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 }}>
        <Text variant="label" color="textSecondary">
          {title}
        </Text>
        <Icon size={16} color={colors.textSecondary} strokeWidth={2.2} />
      </PressableScale>
      {open ? (
        <FadeUp>
          <Text variant="caption" color="textSecondary">
            {children}
          </Text>
        </FadeUp>
      ) : null}
    </View>
  );
}

const fieldFormat = (n: number | null, decimals: number) => (n === null ? '' : String(Math.round(n * 10 ** decimals) / 10 ** decimals));

/**
 * A number typed big: a cup-shaped field with the value in large Bricolage
 * and its unit small beside it, centred together like a number on Today. The
 * input is exactly as wide as what is typed (an unseen copy of the text sizes
 * it), so the unit always sits next to the last digit. A tap anywhere in the
 * cup focuses it. Keeps the raw text while typing so "65." is not eaten (as
 * `NumberField` does). `size="md"` is for three fields side by side.
 */
export function BigNumberField({
  label,
  value,
  onChange,
  unit,
  decimals = 1,
  error,
  testID,
  style,
  size = 'lg',
  placeholder,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChange' | 'style'> & {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  unit?: string;
  decimals?: number;
  /** Any truthy value draws the error edge; a string is shown under the field. */
  error?: string | boolean | null;
  testID: string;
  style?: StyleProp<ViewStyle>;
  size?: 'lg' | 'md';
}) {
  const { colors, radius, spacing } = useTheme();
  const [text, setText] = useState(fieldFormat(value, decimals));
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  if (value !== lastValue) {
    setLastValue(value);
    if (parseNumber(text) !== value) setText(fieldFormat(value, decimals));
  }
  const fontSize = size === 'lg' ? 32 : 24;
  const lineHeight = size === 'lg' ? 38 : 30;
  const type = { fontFamily: fonts.numBold, fontSize, lineHeight, letterSpacing: -0.5, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text variant="label" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <View
        // A tap on the cup around the number goes to the input (the input itself takes its own taps first).
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => input.current?.focus()}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 6,
          minHeight: size === 'lg' ? 68 : 60,
          paddingVertical: size === 'lg' ? 15 : 15,
          paddingHorizontal: spacing.sm,
          ...cup(radius.tile, 5),
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.rim : colors.borderStrong,
          overflow: 'hidden',
        }}>
        <View style={{ minWidth: 32, flexShrink: 1 }}>
          {/* The sizer: the same text in the same type, unseen. It gives the input its width. */}
          <RNText aria-hidden accessibilityElementsHidden importantForAccessibility="no" numberOfLines={1} style={[type, { opacity: 0, paddingHorizontal: 3, textAlign: 'center' }]}>
            {text || placeholder || '0'}
          </RNText>
          <TextInput
            ref={input}
            testID={testID}
            keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.primary}
            {...rest}
            accessibilityLabel={rest.accessibilityLabel ?? (unit ? `${label}, ${unit}` : label)}
            value={text}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            onChangeText={(raw) => {
              const t = raw.replace(/-/g, '');
              setText(t);
              const n = parseNumber(t);
              setLastValue(n);
              onChange(n);
            }}
            style={[type, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 0, textAlign: 'center', color: colors.text }, { outlineStyle: 'none' } as object]}
          />
        </View>
        {unit ? (
          <Text variant="unit" color="textSecondary" style={{ marginBottom: size === 'lg' ? 6 : 4 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {typeof error === 'string' && error.trim() ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** One large text field (the name): h2-size type in a cup, the rim edge on focus. */
export function BigTextField({
  label,
  error,
  testID,
  ...rest
}: Omit<TextInputProps, 'style'> & { label: string; error?: string | null; testID: string }) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View
        style={{
          minHeight: 64,
          justifyContent: 'center',
          paddingHorizontal: 16,
          ...cup(radius.tile, 5),
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.rim : colors.borderStrong,
        }}>
        <TextInput
          testID={testID}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            { color: colors.text, fontFamily: fonts.display, fontSize: 24, lineHeight: 30, paddingVertical: 12, letterSpacing: -0.3 },
            { outlineStyle: 'none' } as object,
          ]}
        />
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** The cup mark from the app icon, small: an open cup with the calorie fill and the level line. */
export function CupMark({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return <MiniCup progress={0.62} color={colors.calories} width={Math.round(size * 0.78)} height={size} animate={false} />;
}
