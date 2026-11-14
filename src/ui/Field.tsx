import { Minus, Plus } from 'lucide-react-native';
import React, { useState } from 'react';
import { TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { cup, fonts, useTheme } from '@/theme';

import { IconButton } from './Button';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  suffix?: string;
  error?: string | null;
  hint?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Forwarded to the input, for moving focus between fields. */
  ref?: React.ComponentProps<typeof TextInput>['ref'];
}

export function TextField({ label, suffix, error, hint, left, right, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const { colors, radius } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 50,
          ...cup(radius.buttonSm),
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          // Focus is the level line: a rim-coloured edge.
          borderColor: error ? colors.danger : focused ? colors.rim : colors.borderStrong,
          paddingHorizontal: 14,
        }}>
        {left}
        <TextInput
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.primary}
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label ?? rest.placeholder}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.medium, fontSize: 16, paddingVertical: 12 },
            // Removes the default focus outline on web; the border shows focus instead.
            { outlineStyle: 'none' } as object,
          ]}
        />
        {suffix ? (
          <Text variant="unit" color="textSecondary">
            {suffix}
          </Text>
        ) : null}
        {right}
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary">
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

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  format,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (n: number) => string;
  label: string;
}) {
  const { colors } = useTheme();
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <IconButton accessibilityLabel={`Decrease ${label}`} tone="alt" onPress={() => set(value - step)} disabled={value <= min}>
        <Minus size={18} color={colors.text} />
      </IconButton>
      <Text variant="numL" align="center" style={{ minWidth: 72, fontSize: 26, lineHeight: 30 }}>
        {format ? format(value) : String(value)}
      </Text>
      <IconButton accessibilityLabel={`Increase ${label}`} tone="alt" onPress={() => set(value + step)} disabled={value >= max}>
        <Plus size={18} color={colors.text} />
      </IconButton>
    </View>
  );
}
