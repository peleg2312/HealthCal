import { Check } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { blossomColors, darkColors, lightColors, useTheme, type ThemeColors } from '@/theme';
import type { ThemePreference } from '@/types';
import { PressableScale, Text } from '@/ui';

export const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Light or dark, following your device' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
  { value: 'blossom', label: 'Blossom', hint: 'Raspberry, pink and champagne' },
];

/** A miniature of a palette: background, a card with a ring and a bar, in that palette's own colours. */
function Mini({ c, half }: { c: ThemeColors; half?: 'left' | 'right' }) {
  const { radius } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        padding: 6,
        justifyContent: 'center',
        borderTopLeftRadius: half === 'right' ? 0 : radius.sm,
        borderBottomLeftRadius: half === 'right' ? 0 : radius.sm,
        borderTopRightRadius: half === 'left' ? 0 : radius.sm,
        borderBottomRightRadius: half === 'left' ? 0 : radius.sm,
      }}>
      <View style={{ backgroundColor: c.surface, borderRadius: 6, padding: 5, gap: 4, borderWidth: 1, borderColor: c.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: c.calories }} />
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: c.textTertiary, opacity: 0.6 }} />
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.track, overflow: 'hidden' }}>
          <View style={{ width: '60%', height: 4, backgroundColor: c.primary }} />
        </View>
      </View>
    </View>
  );
}

/** Appearance picker: one tile per palette that previews it. */
export function ThemeSwatches({ value, onChange }: { value: ThemePreference; onChange: (v: ThemePreference) => void }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ flexDirection: 'row', gap: spacing.sm }}>
      {THEME_OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <PressableScale
            key={o.value}
            testID={`profile-theme-${o.value}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            accessibilityLabel={`${o.label}. ${o.hint}`}
            feedback="select"
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: '100%',
                height: 64,
                borderRadius: radius.md,
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.border,
                padding: 2,
              }}>
              <View style={{ flex: 1, flexDirection: 'row' }}>
                {o.value === 'system' ? (
                  <>
                    <Mini c={lightColors} half="left" />
                    <Mini c={darkColors} half="right" />
                  </>
                ) : (
                  <Mini c={o.value === 'dark' ? darkColors : o.value === 'blossom' ? blossomColors : lightColors} />
                )}
              </View>
              {selected ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -7,
                    right: -7,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Check size={11} color={colors.onPrimary} strokeWidth={3.5} />
                </View>
              ) : null}
            </View>
            <Text variant="label" color={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
