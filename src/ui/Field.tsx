import { Minus, Plus } from 'lucide-react-native';
import React, { useId, useState } from 'react';
import { Platform, TextInput, View, type AccessibilityActionEvent, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { cup, fonts, phoneCapFor, useTextSize, useTheme } from '@/theme';
import { scaledFontSize } from '@/theme/textSize';

import { IconButton } from './Button';
import { stepperKey, webAutoComplete } from './controlRules';
import { FOCUS_CUP, useFocusRing } from './Pressable';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  suffix?: string;
  error?: string | null;
  hint?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** With `multiline`: the lines of text the box shows before it scrolls, so a long placeholder is never cut. */
  lines?: number;
  /** Forwarded to the input, for moving focus between fields. */
  ref?: React.ComponentProps<typeof TextInput>['ref'];
}

/**
 * On web the whole field (label, cup, hint) is a `<label>`, so a tap on the label text focuses
 * the input the browser's own way, which raises the keyboard on every phone browser. Natively
 * a label is never a control.
 */
const FIELD_LABEL = Platform.OS === 'web' ? ({ role: 'label' } as object) : null;
/** The cup's side room, and the room between the text and an icon or a unit. */
const PAD_X = 14;
const GAP = 10;

/**
 * A one-line (or `multiline`) text field in a small cup. The input fills the cup: the side room
 * is the input's own padding, and `left` (an icon) and `suffix` (the unit) are drawn over that
 * padding without taking touches, so a tap anywhere in the cup, on the icon or on the unit is
 * the platform's own tap on the field (the keyboard opens the native way on iOS Safari, a Home
 * Screen web app, Android Chrome and the apps). `right` is the one part that keeps its own
 * touches (a button beside the text), so it sits after the input.
 *
 * The cup's edge is `fieldEdge`, at least 3:1 on the field's own fill, the page and bgElevated in
 * every look (WCAG 1.4.11; `borderStrong` is not). Focused, it is the level line (`rim`),
 * and on the web the kit's focus ring lies right against it (`FOCUS_CUP`). An error is said in
 * words under the cup and tied to the input (`aria-invalid` and `aria-describedby` on the web, the
 * hint natively); a hint is tied the same way. `autoComplete` takes React Native's names and gives
 * the browser its own (`webAutoComplete`: 'birthdate-day' is 'bday-day' there).
 */
export function TextField({ label, suffix, error, hint, left, right, style, lines, onFocus, onBlur, ...rest }: TextFieldProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  useFocusRing();
  const scale = useTextSize();
  const fontSize = scaledFontSize(16, scale);
  const lineHeight = Math.round((22 * fontSize) / 16);
  const noteId = `field-note-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const note = error || hint ? noteId : undefined;
  const given = rest as { 'aria-describedby'?: string };
  const web =
    Platform.OS === 'web'
      ? {
          ...(error ? { 'aria-invalid': true } : null),
          ...(note || given['aria-describedby'] ? { 'aria-describedby': [given['aria-describedby'], note].filter(Boolean).join(' ') } : null),
          ...(rest.autoComplete ? { autoComplete: webAutoComplete(rest.autoComplete) } : null),
        }
      : null;
  // Drawn widths of the icon, the unit and the right-hand control, for the input's padding.
  // Until they are measured, a fair guess (an 18 px icon, a short unit) keeps the first frame close.
  const [leftW, setLeftW] = useState(18);
  const [suffixW, setSuffixW] = useState(suffix ? 8 * suffix.length : 0);
  const [rightW, setRightW] = useState(0);
  const rightRoom = right ? GAP + rightW + PAD_X : PAD_X;
  return (
    <View {...FIELD_LABEL} style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <View
        {...FOCUS_CUP}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 50,
          ...cup(radius.buttonSm),
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          // Focus is the level line: a rim-coloured edge. At rest the cup outline, 3:1 on the page and the field.
          borderColor: error ? colors.danger : focused ? colors.rim : colors.fieldEdge,
        }}>
        <TextInput
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          maxFontSizeMultiplier={phoneCapFor(scale)}
          {...rest}
          {...(web as object)}
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          accessibilityHint={error || rest.accessibilityHint || hint}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              alignSelf: 'stretch',
              color: colors.text,
              fontFamily: fonts.medium,
              // 16 px at the app's text size (twice at 200%), as every Text is drawn.
              fontSize,
              paddingVertical: 12,
              paddingLeft: PAD_X + (left ? leftW + GAP : 0),
              // The unit sits over this padding, then the right-hand control after the input.
              paddingRight: (suffix ? suffixW + GAP : 0) + (right ? GAP : PAD_X),
            },
            // 16 px text sets 22 px lines (web and native alike); the 12 px padding goes above and below.
            rest.multiline && lines ? { minHeight: lines * lineHeight + 24, textAlignVertical: 'top' as const } : null,
            // Removes the default focus outline on web; the border shows focus instead.
            { outlineStyle: 'none' } as object,
          ]}
        />
        {left ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: PAD_X, top: 0, bottom: 0, justifyContent: 'center' }}>
            <View onLayout={(e) => setLeftW(Math.round(e.nativeEvent.layout.width))}>{left}</View>
          </View>
        ) : null}
        {suffix ? (
          <View pointerEvents="none" style={{ position: 'absolute', right: rightRoom, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Text variant="unit" color="textSecondary" onLayout={(e) => setSuffixW(Math.ceil(e.nativeEvent.layout.width))}>
              {suffix}
            </Text>
          </View>
        ) : null}
        {right ? (
          <View onLayout={(e) => setRightW(Math.round(e.nativeEvent.layout.width))} style={{ marginRight: PAD_X }}>
            {right}
          </View>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger" nativeID={noteId} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary" nativeID={noteId}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Parse user-typed numbers, accepting a comma as the decimal separator. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface NumberFieldProps extends Omit<TextFieldProps, 'value' | 'onChangeText' | 'onChange'> {
  value: number | null;
  onChange: (n: number | null) => void;
  decimals?: number;
  /** Amounts, weights and nutrients are never below zero, so a minus sign is not accepted unless this is set. */
  allowNegative?: boolean;
}

/** Numeric text field that keeps the raw text while typing so "1." is not eaten. */
export function NumberField({ value, onChange, decimals = 1, allowNegative = false, ...rest }: NumberFieldProps) {
  const format = (n: number | null) => (n === null ? '' : String(Math.round(n * 10 ** decimals) / 10 ** decimals));
  const [text, setText] = useState(format(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (parseNumber(text) !== value) setText(format(value));
  }
  return (
    <TextField
      keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      {...rest}
      value={text}
      onChangeText={(raw) => {
        const t = allowNegative ? raw : raw.replace(/-/g, '');
        setText(t);
        const n = parseNumber(t);
        setLastValue(n);
        onChange(n);
      }}
    />
  );
}

/**
 * A number set in steps: the value between a minus and a plus cup. The value itself is one
 * adjustable control (D5-08, the platform's own kind): natively `adjustable` with its value and
 * the increment and decrement actions (a swipe up or down in VoiceOver, the volume keys in
 * TalkBack), on the web a `spinbutton` with `aria-valuenow`, `aria-valuetext` and the arrow keys
 * (Up and Right one step, Down and Left one back, Page Up and Page Down ten, Home and End the
 * limits). The two cups stay for touch.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  format,
  label,
  compact,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (n: number) => string;
  label: string;
  /** Narrower (156 px instead of 188), for a row that also holds a label on a 320 px phone. */
  compact?: boolean;
}) {
  const { colors, radius } = useTheme();
  useFocusRing();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)));
  const shown = format ? format(value) : String(value);
  // The value's name is the stepper's label with a capital, as the cups say "Decrease quantity".
  const name = label ? label[0].toUpperCase() + label.slice(1) : label;
  const range = { ...(Number.isFinite(min) ? { min } : null), ...(Number.isFinite(max) ? { max } : null) };
  const adjustable =
    Platform.OS === 'web'
      ? {
          role: 'spinbutton',
          tabIndex: 0,
          'aria-label': name,
          'aria-valuenow': value,
          'aria-valuetext': shown,
          ...(Number.isFinite(min) ? { 'aria-valuemin': min } : null),
          ...(Number.isFinite(max) ? { 'aria-valuemax': max } : null),
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const next = stepperKey(e.key, value, step, min, max);
            if (next === null) {
              // A key that would pass a limit still must not scroll the page.
              if (/^(Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End)$/.test(e.key)) e.preventDefault();
              return;
            }
            e.preventDefault();
            set(next);
          },
        }
      : {
          accessible: true,
          accessibilityRole: 'adjustable' as const,
          accessibilityLabel: name,
          accessibilityValue: { ...range, now: value, text: shown },
          accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
          onAccessibilityAction: (e: AccessibilityActionEvent) => {
            if (e.nativeEvent.actionName === 'increment' && value < max) set(value + step);
            if (e.nativeEvent.actionName === 'decrement' && value > min) set(value - step);
          },
        };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 8 : 14 }}>
      <IconButton accessibilityLabel={`Decrease ${label}`} tone="surface" onPress={() => set(value - step)} disabled={value <= min}>
        <Minus size={18} color={colors.text} />
      </IconButton>
      {/* Label corners, so the web's focus ring round the value is a label's shape. */}
      <View {...(adjustable as object)} style={{ borderRadius: radius.chip }}>
        <Text variant="numL" align="center" style={compact ? { minWidth: 52, fontSize: 22, lineHeight: 28 } : { minWidth: 72, fontSize: 26, lineHeight: 30 }}>
          {shown}
        </Text>
      </View>
      <IconButton accessibilityLabel={`Increase ${label}`} tone="surface" onPress={() => set(value + step)} disabled={value >= max}>
        <Plus size={18} color={colors.text} />
      </IconButton>
    </View>
  );
}
