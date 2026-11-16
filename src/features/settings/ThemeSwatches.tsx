import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { blossomColors, cup, darkColors, fonts, lightColors, radius, useTheme, vesselBase, type ThemeColors } from '@/theme';
import type { ThemePreference } from '@/types';
import { PressableScale, Text } from '@/ui';

export const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Light or dark, following your device' },
  { value: 'light', label: 'Light', hint: 'Oat paper with a persimmon accent' },
  { value: 'dark', label: 'Dark', hint: 'Warm black with a persimmon accent' },
  { value: 'blossom', label: 'Blossom', hint: 'Champagne, pink and raspberry' },
];

/**
 * A miniature of a palette in its own Pour colours: the background, a card
 * (a cup) holding a small calorie vessel with that theme's level line, and a
 * water bar with its rim tick. The vessel is drawn like the kit's: a tumbler
 * with no lip, sides and base in vesselEdge, and `vesselEmpty` above the fill.
 * A `half` (one side of the System swatch) has room for the cup only.
 */
function Mini({ c, half }: { c: ThemeColors; half?: 'left' | 'right' }) {
  const vh = 26;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        padding: 5,
        justifyContent: 'center',
        overflow: 'hidden',
        borderTopLeftRadius: half === 'right' ? 0 : 4,
        borderTopRightRadius: half === 'left' ? 0 : 4,
        borderBottomLeftRadius: half === 'right' ? 0 : 10,
        borderBottomRightRadius: half === 'left' ? 0 : 10,
      }}>
      <View style={{ backgroundColor: c.surface, ...cup(9, 3), paddingHorizontal: 5, paddingVertical: 5, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: c.border }}>
        {/* The vessel: open top, sides and base in vesselEdge, empty above the calorie fill, a rim on the fill. */}
        <View
          style={{
            width: 14,
            height: vh,
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: c.vesselEdge,
            borderBottomLeftRadius: vesselBase(vh, 14) / 2,
            borderBottomRightRadius: vesselBase(vh, 14) / 2,
            backgroundColor: c.vesselEmpty,
            overflow: 'hidden',
            justifyContent: 'flex-end',
          }}>
          <View style={{ height: vh * 0.6, backgroundColor: c.calories }}>
            <View style={{ height: 2, backgroundColor: c.rim }} />
          </View>
        </View>
        {half ? null : (
          <View style={{ flex: 1, minWidth: 0, gap: 5, paddingBottom: 2 }}>
            <View style={{ height: 4, width: '70%', borderRadius: 1, backgroundColor: c.text }} />
            <View style={{ height: 4, borderRadius: 1, backgroundColor: c.track, justifyContent: 'center' }}>
              <View style={{ width: '55%', height: 4, borderRadius: 1, backgroundColor: c.water }} />
              <View style={{ position: 'absolute', left: '55%', width: 2, height: 8, backgroundColor: c.rim }} />
            </View>
            <View style={{ height: 6, width: 14, ...cup(3, 1), backgroundColor: c.primary }} />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Appearance picker: one cup per palette that previews it. The chosen one has a 2 px ink edge and its
 * name in bold ink. The name stays inside its tile's width (a check beside "Blossom" ran past the tile).
 */
export function ThemeSwatches({ value, onChange }: { value: ThemePreference; onChange: (v: ThemePreference) => void }) {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
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
            aria-checked={selected}
            accessibilityLabel={`${o.label}. ${o.hint}`}
            feedback="select"
            onPress={() => onChange(o.value)}
            style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xs }}>
            <View
              style={{
                width: '100%',
                height: 70,
                ...cup(radius.tile, 5),
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.text : colors.border,
                padding: selected ? 2 : 3,
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
            </View>
            <Text
              variant="label"
              color={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
              style={{ maxWidth: '100%', fontFamily: selected ? fonts.bold : fonts.semibold, ...(narrow ? { fontSize: 13 } : null) }}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
