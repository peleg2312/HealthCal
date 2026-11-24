import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, Text as RNText, TextInput, View, type LayoutChangeEvent, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { cup, fonts, motion, phoneCapFor, scaledFontSize, useLargeText, useReducedMotion, useTextSize, useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { cssBezier, FadeUp, FOCUS_CUP, MiniCup, parseNumber, PressableScale, ProgressBar, Text, useFocusRing } from '@/ui';

import { choiceInput, type ChoiceInput } from './choiceInput';
import { inHand, nextEmptyField } from './fieldChain';
import { convertUnits, type Draft } from './model';

/**
 * Fades and lifts its children in, optionally after a delay (for staggered
 * reveals). The kit's `FadeUp` under an older name, so it is instant under
 * reduced motion and runs off the JS thread.
 */
export function FadeIn({ delay = 0, distance = 12, children, style }: { delay?: number; distance?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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
        animationName: {
          from: { opacity: 0, transform: [{ translateX: direction * 20 }] },
          to: { opacity: 1, transform: [{ translateX: 0 }] },
        },
        animationDuration: motion.duration.slide,
        animationTimingFunction: cssBezier(motion.easing.enter),
        animationFillMode: 'backwards',
      }}>
      {children}
    </Animated.View>
  );
}

// The heading of the question on screen (StepTitle, or the plan's title), so the flow can move the focus to it.
let stepHeading: unknown = null;

/** Hand `ref` of a step's heading here; the flow focuses it when a new question arrives. */
export function stepHeadingRef(node: unknown) {
  stepHeading = node;
}

/**
 * A new question arrived: the focus goes to its heading (WCAG 2.4.3), so a keyboard or a screen
 * reader goes on from the question itself and never from the page's start. On the web the heading is
 * focusable by code only (tabindex -1, which the kit's focus ring leaves alone).
 */
export function focusStepHeading() {
  const node = stepHeading;
  if (!node) return;
  if (Platform.OS === 'web') {
    (node as { focus?: (o?: { preventScroll?: boolean }) => void }).focus?.({ preventScroll: true });
    return;
  }
  const tag = findNodeHandle(node as React.Component);
  if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
}

/** Step heading: a question and a short line on why it is asked. */
export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.xs }}>
      <Text
        variant="h1"
        accessibilityRole="header"
        // The kit's Text hands unknown props to the platform's: the heading can be given focus when its question arrives.
        {...({ ref: stepHeadingRef, tabIndex: -1 } as object)}
        style={Platform.OS === 'web' ? ({ outlineWidth: 0 } as object) : undefined}>
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
  /** `how`: a finger or a mouse ('pointer'), or a keyboard or assistive technology ('keys'; ./choiceInput). */
  onPress: (how: ChoiceInput) => void;
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
      onPress={(e) => onPress(choiceInput(e))}
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
      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 3,
            backgroundColor: colors.rim,
          }}
        />
      ) : null}
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
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            top: Math.round((1 - was) * h) - 1,
            height: 0,
            borderTopWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: colors.vesselEdge,
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Information panel with a leading icon: an alt cup (surfaceAlt, no border).
 * `warning` wears a 3 px amber lip along its top, as a cup does when it is
 * over (never red, and no stripe down the side).
 *
 * `surface="card"` draws it on the card surface inside the card's 1 px line
 * instead, for a note that must stay neutral in every look, as a look's alt
 * surface can be a strong colour of its own (maroon in Java, blue in Butter
 * and Honey). A Google sign-in that was not completed is such a note:
 * `neutral`, with an ink info mark and no amber, since amber means only "above".
 */
export function Note({
  icon,
  children,
  tone = 'neutral',
  surface = 'alt',
  testID,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'neutral' | 'warning';
  surface?: 'alt' | 'card';
  testID?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const card = surface === 'card';
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        ...cup(radius.tile, 5),
        backgroundColor: card ? colors.surface : colors.surfaceAlt,
        // On the card surface the note is outlined like a card; the amber lip, when there is one, is its top edge.
        ...(card
          ? {
              borderWidth: 1,
              borderTopWidth: tone === 'warning' ? 0 : 1,
              borderColor: colors.border,
            }
          : null),
        overflow: 'hidden',
      }}>
      {tone === 'warning' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 3,
            backgroundColor: colors.warning,
          }}
        />
      ) : null}
      {icon ? <View style={{ paddingTop: 1 }}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{children}</View>
    </View>
  );
}

/**
 * A field in error, said to assistive technology as the kit's fields say it (D6-F23): on the web
 * `aria-invalid` and `aria-describedby` pointing at the words under the field; natively the words are
 * a live region read as they appear.
 */
function invalidAria(invalid: boolean, describedBy: string | undefined): object {
  if (Platform.OS !== 'web' || !invalid) return {};
  return {
    'aria-invalid': true,
    ...(describedBy ? { 'aria-describedby': describedBy } : null),
  };
}

/** A field's unit as a screen reader says it: "Target weight, kilograms", never "kg". */
const SPOKEN_UNIT: Record<string, string> = {
  kg: 'kilograms',
  lb: 'pounds',
  cm: 'centimetres',
  in: 'inches',
  ft: 'feet',
  '%': 'percent',
};
export function unitSpoken(unit: string): string {
  return SPOKEN_UNIT[unit] ?? unit;
}

export function ErrorText({ children, testID, nativeID }: { children?: string | null; testID?: string; nativeID?: string }) {
  if (!children) return null;
  return (
    <Text variant="caption" color="danger" testID={testID} nativeID={nativeID} accessibilityLiveRegion="polite">
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
 * Units as two small label chips ("kg · cm" / "lb · ft", drawn as the kit's Chip), for the corner of a
 * step. The answer is preselected from the phone's region, so this is a
 * correction, not a question. Switching re-expresses anything already typed.
 */
export function UnitsToggle({ draft, set, idPrefix = 'onb-units' }: { draft: Draft; set: (patch: Partial<Draft>) => void; idPrefix?: string }) {
  const { colors, radius } = useTheme();
  const opts: { value: UnitSystem; label: string; a11y: string }[] = [
    {
      value: 'metric',
      label: 'kg · cm',
      a11y: 'Metric units: kilograms and centimetres',
    },
    {
      value: 'imperial',
      label: 'lb · ft',
      a11y: 'Imperial units: pounds, feet and inches',
    },
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
            // The kit's Chip look, the one look of a selected single choice in the app: selected is an ink chip
            // (text fill, bg text), the other a 1 px borderStrong edge.
            style={{
              height: 32,
              paddingHorizontal: 12,
              justifyContent: 'center',
              borderRadius: radius.chip,
              borderWidth: 1,
              borderColor: active ? colors.text : colors.borderStrong,
              backgroundColor: active ? colors.text : 'transparent',
            }}>
            <Text
              variant="label"
              color={active ? 'bg' : 'text'}
              style={{
                fontSize: 13.5,
                fontFamily: active ? fonts.bold : fonts.semibold,
              }}>
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
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          minHeight: 32,
        }}>
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
 * On web the whole field (its label and its cup) is a `<label>`, so a tap on the label text
 * focuses the input the browser's own way, which raises the keyboard on every phone browser.
 * Natively a label is never a control.
 */
const FIELD_LABEL = Platform.OS === 'web' ? ({ role: 'label' } as object) : null;

/**
 * A view's drawn width. On web the layout event rounds to whole px; the element's own box does not,
 * and the input's centre must match the sizer's to the fraction or the digits move by a hair.
 */
function drawnWidth(e: LayoutChangeEvent): number {
  const target = (
    e.nativeEvent as unknown as {
      target?: { getBoundingClientRect?: () => { width: number } };
    }
  ).target;
  const w = Platform.OS === 'web' && typeof target?.getBoundingClientRect === 'function' ? target.getBoundingClientRect().width : NaN;
  return Number.isFinite(w) && w > 0 ? w : e.nativeEvent.layout.width;
}

/** The space between the number and its unit. */
const UNIT_GAP = 6;

/** A mounted text input (what a ref to `TextInput` holds). */
type InputHandle = React.ComponentRef<typeof TextInput>;

// The step on screen registers its fields here, so the footer's Continue can ask it where to go.
let activeChain: (() => boolean) | null = null;

/**
 * Continue was pressed. If a field of this step is in hand and another one is still empty, the
 * focus goes there (the keyboard stays up) and this returns true; otherwise false, and the step
 * is checked as usual.
 */
export function focusNextEmptyField(): boolean {
  return activeChain ? activeChain() : false;
}

/**
 * The fields of one step in the order they are read, `values` being what each holds now. Spread
 * `field(i)` on the i-th `BigNumberField`: the keyboard's Next key then moves to the following
 * field without closing the keyboard, the last field's Done key calls `submit`, and Continue goes
 * to a field that is still empty before it checks anything (`focusNextEmptyField`). With the
 * keyboard up a phone shows little more than the field in hand, so without this the next field
 * can only be reached by closing the keyboard first.
 */
export function useFieldChain(values: readonly (number | null)[], submit: () => void) {
  const inputs = useRef<(InputHandle | null)[]>([]);
  const empty = useRef<boolean[]>([]);
  const focus = useRef({ index: -1, on: false, at: 0 });
  const count = values.length;
  useEffect(() => {
    empty.current = values.map((v) => v === null);
  });
  useEffect(() => {
    const ask = () => {
      if (!inHand(focus.current, Date.now())) return false;
      const to = nextEmptyField(focus.current.index, empty.current);
      const input = to === null ? null : inputs.current[to];
      if (!input) return false;
      input.focus();
      return true;
    };
    activeChain = ask;
    return () => {
      if (activeChain === ask) activeChain = null;
    };
  }, []);
  return (i: number) => {
    const last = i >= count - 1;
    return {
      inputRef: (node: InputHandle | null) => {
        inputs.current[i] = node;
      },
      onFocus: () => {
        focus.current = { index: i, on: true, at: Date.now() };
      },
      onBlur: () => {
        if (focus.current.index === i) focus.current = { index: i, on: false, at: Date.now() };
      },
      returnKeyType: last ? ('done' as const) : ('next' as const),
      // Next keeps the keyboard up while the focus moves on (blurOnSubmit is what the web build reads).
      submitBehavior: last ? ('blurAndSubmit' as const) : ('submit' as const),
      blurOnSubmit: last,
      onSubmitEditing: () => {
        const next = last ? null : inputs.current[i + 1];
        if (next) next.focus();
        else submit();
      },
    };
  };
}

/**
 * A number typed big: a cup-shaped field with the value in large Bricolage
 * and its unit small beside it, centred together like a number on Today.
 *
 * The real input covers the whole cup, so every tap anywhere in it is the
 * platform's own tap on a text field: the keyboard opens the native way on
 * iOS Safari, a Home Screen web app, Android Chrome and the apps (focusing
 * from code after a tap on a wrapper does not reliably raise the keyboard on
 * iOS). What the eye sees is laid out by an unseen copy of the text (the
 * sizer) followed by the unit; the input is centred on the same point by
 * padding its right side with the unit's measured width plus the gap, so the
 * digits and the caret sit exactly where that layout puts them at every
 * length. Keeps the raw text while typing so "65." is not eaten (as
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
  inputRef,
  errorId,
  grow,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChange' | 'style'> & {
  label: string;
  /** Its share of a `FieldRow` (flex), dropped when large text stacks the row. */
  grow?: number;
  value: number | null;
  onChange: (n: number | null) => void;
  /** The nativeID of an error said under a row of fields (a boolean `error`), so the input is tied to it. */
  errorId?: string;
  /** The input itself, for a step that moves the focus from field to field (`useFieldChain`). */
  inputRef?: React.Ref<InputHandle>;
  unit?: string;
  decimals?: number;
  /** Any truthy value draws the error edge; a string is shown under the field. */
  error?: string | boolean | null;
  testID: string;
  style?: StyleProp<ViewStyle>;
  size?: 'lg' | 'md';
}) {
  const { colors, radius, spacing } = useTheme();
  useFocusRing();
  const ownErrorId = `onb-error-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ownError = typeof error === 'string' && error.trim() ? error : null;
  const errorAria = invalidAria(!!error, ownError ? ownErrorId : errorId);
  const [text, setText] = useState(fieldFormat(value, decimals));
  const [lastValue, setLastValue] = useState(value);
  const [focused, setFocused] = useState(false);
  // The unit's drawn width, so the input's centre is the sizer's centre.
  const [unitW, setUnitW] = useState(0);
  if (value !== lastValue) {
    setLastValue(value);
    if (parseNumber(text) !== value) setText(fieldFormat(value, decimals));
  }
  // The figure grows with the app's text size as the kit's type does (`scaledFontSize`; not drawn by the kit's
  // Text), and the cup with it; the phone's own setting adds only up to 2x in all (`phoneCapFor`).
  const scale = useTextSize();
  const large = useLargeText();
  const baseSize = size === 'lg' ? 32 : 24;
  const fontSize = scaledFontSize(baseSize, scale);
  const lineHeight = Math.round(((size === 'lg' ? 38 : 30) * fontSize) / baseSize);
  const grown = lineHeight - (size === 'lg' ? 38 : 30);
  const type = {
    fontFamily: fonts.numBold,
    fontSize,
    lineHeight,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums' as const],
  };
  const padX = spacing.sm;
  return (
    <View {...FIELD_LABEL} style={[{ gap: 6 }, grow !== undefined && !large ? { flex: grow } : null, style]}>
      <Text variant="label" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <View
        {...FOCUS_CUP}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: UNIT_GAP,
          minHeight: (size === 'lg' ? 68 : 60) + grown,
          paddingVertical: 15,
          paddingHorizontal: padX,
          ...cup(radius.tile, 5),
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.rim : colors.fieldEdge,
          overflow: 'hidden',
        }}>
        {/* The sizer: the same text in the same type, unseen. With the unit it sets where the number is drawn. */}
        <View style={{ minWidth: 32, flexShrink: 1 }}>
          <RNText
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no"
            numberOfLines={1}
            maxFontSizeMultiplier={phoneCapFor(scale)}
            style={[type, { opacity: 0, paddingHorizontal: 3, textAlign: 'center' }]}>
            {text || placeholder || '0'}
          </RNText>
        </View>
        {unit ? (
          <Text
            variant="unit"
            color="textSecondary"
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no"
            onLayout={(e) => setUnitW(drawnWidth(e))}
            style={{ marginBottom: size === 'lg' ? 6 : 4 }}>
            {unit}
          </Text>
        ) : null}
        {/* The real field, over the whole cup (last, so it is on top): the sizer's centre is
            (cup - unit - gap) / 2, and so is this input's with the unit and the gap as right padding. */}
        <TextInput
          ref={inputRef}
          testID={testID}
          maxFontSizeMultiplier={phoneCapFor(scale)}
          keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          {...rest}
          {...errorAria}
          accessibilityLabel={rest.accessibilityLabel ?? (unit ? `${label}, ${unitSpoken(unit)}` : label)}
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
          style={[
            type,
            {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              paddingVertical: 0,
              paddingLeft: padX,
              paddingRight: padX + (unit ? unitW + UNIT_GAP : 0),
              textAlign: 'center',
              color: colors.text,
            },
            Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null,
            { outlineStyle: 'none' } as object,
          ]}
        />
      </View>
      {ownError ? <ErrorText nativeID={ownErrorId}>{ownError}</ErrorText> : null}
    </View>
  );
}

/**
 * Big fields side by side (a date of birth, height and weight, the tape measures), each taking its `grow` share
 * of the row. With large text (`useLargeText`) they stack, each the full width, so a figure at its grown size
 * is never cut (three side by side would not hold one at 320 px).
 */
export function FieldRow({ children }: { children: React.ReactNode }) {
  const { spacing } = useTheme();
  const large = useLargeText();
  return <View style={{ flexDirection: large ? 'column' : 'row', gap: spacing.sm }}>{children}</View>;
}

/**
 * One large text field (the name): h2-size type in a cup, the rim edge on focus. The input
 * fills the cup, its 16 px side room is the input's own padding, so a tap anywhere in the cup
 * is a tap on the field.
 */
export function BigTextField({
  label,
  error,
  testID,
  ...rest
}: Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  testID: string;
}) {
  const { colors, radius } = useTheme();
  useFocusRing();
  const errorId = `onb-error-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [focused, setFocused] = useState(false);
  // A long answer (a double-barrelled name) steps the type down so it still fits a 320 px phone
  // whole; the field keeps its height.
  const length = typeof rest.value === 'string' ? rest.value.length : 0;
  // It grows with the app's text size as the kit's type does (`scaledFontSize`), and the cup with it.
  const scale = useTextSize();
  const fontSize = scaledFontSize(length > 18 ? 18 : length > 14 ? 21 : 24, scale);
  const lineHeight = Math.round((30 * scaledFontSize(24, scale)) / 24);
  const grown = lineHeight - 30;
  return (
    <View {...FIELD_LABEL} style={{ gap: 6 }}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View
        {...FOCUS_CUP}
        style={{
          minHeight: 64 + grown,
          justifyContent: 'center',
          ...cup(radius.tile, 5),
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.rim : colors.fieldEdge,
        }}>
        <TextInput
          testID={testID}
          maxFontSizeMultiplier={phoneCapFor(scale)}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          {...rest}
          {...invalidAria(!!error, error ? errorId : undefined)}
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
            // 64 less the 1.5 px edges: the input is the whole inside of the cup.
            {
              color: colors.text,
              fontFamily: fonts.display,
              fontSize,
              lineHeight,
              paddingVertical: 12,
              paddingHorizontal: 16,
              minHeight: 61 + grown,
              letterSpacing: -0.3,
            },
            Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : null,
            { outlineStyle: 'none' } as object,
          ]}
        />
      </View>
      <ErrorText nativeID={errorId}>{error}</ErrorText>
    </View>
  );
}

/** The cup mark from the app icon, small: an open cup with the calorie fill and the level line. */
export function CupMark({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return <MiniCup progress={0.62} color={colors.calories} width={Math.round(size * 0.78)} height={size} animate={false} />;
}
