import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { cup, fonts, LOOK_HINTS, paletteFor, radius, THEME_CHOICES, THEME_LABELS, themeNameOfChoice, useTextSize, useTheme, vesselBase, type ThemeChoice, type ThemeColors } from '@/theme';
import { PressableScale, Text } from '@/ui';

/** The name on each tile. "Match my phone" is too long for a tile a quarter of a 320 px phone wide, so it is "System" here. */
const TILE_LABELS: Record<ThemeChoice, string> = { ...THEME_LABELS, system: 'System' };

/** One line about each choice: under Appearance for the selected one, and in each tile's screen-reader label. */
export const THEME_HINTS: Record<ThemeChoice, string> = {
  system: 'Light or dark, following your device',
  light: 'Oat paper with a persimmon accent',
  dark: 'Warm black with a persimmon accent',
  blossom: 'Champagne, pink and raspberry',
  ...LOOK_HINTS,
};

/**
 * Four tiles a row at the designed text size: the four first looks, then the three newer ones. With the
 * app's text size raised the names need more room, so a row holds three (from 115%) or two (from 150%),
 * and no name is cut short.
 */
export function swatchesPerRow(textSize: number): number {
  return textSize >= 1.5 ? 2 : textSize >= 1.15 ? 3 : 4;
}

function rowsOf(perRow: number): ThemeChoice[][] {
  const rows: ThemeChoice[][] = [];
  for (let i = 0; i < THEME_CHOICES.length; i += perRow) rows.push(THEME_CHOICES.slice(i, i + perRow));
  return rows;
}

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
 * Appearance picker: one cup per choice that previews it, four a row (the seven choices take two
 * rows, the second with an empty last place so every tile has the same width; fewer a row with
 * larger text, `swatchesPerRow`). The chosen one has a
 * 2 px ink edge and its name in bold ink. The name stays inside its tile's width (a check beside
 * "Blossom" ran past the tile). The value is a `ThemeChoice`: the caller reads it with
 * `themeChoiceOf(settings)` and writes a pick with `setSettings(themeChoicePatch(choice))`.
 */
export function ThemeSwatches({ value, onChange }: { value: ThemeChoice; onChange: (v: ThemeChoice) => void }) {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const perRow = swatchesPerRow(useTextSize());
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ gap: spacing.md }}>
      {rowsOf(perRow).map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: spacing.sm }}>
          {row.map((choice) => {
            const selected = value === choice;
            return (
              <PressableScale
                key={choice}
                testID={`profile-theme-${choice}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, selected }}
                aria-checked={selected}
                accessibilityLabel={`${TILE_LABELS[choice]}. ${THEME_HINTS[choice]}`}
                feedback="select"
                onPress={() => onChange(choice)}
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
                    {choice === 'system' ? (
                      <>
                        <Mini c={paletteFor(themeNameOfChoice('system', 'light'))} half="left" />
                        <Mini c={paletteFor(themeNameOfChoice('system', 'dark'))} half="right" />
                      </>
                    ) : (
                      <Mini c={paletteFor(themeNameOfChoice(choice, null))} />
                    )}
                  </View>
                </View>
                <Text
                  variant="label"
                  color={selected ? 'text' : 'textSecondary'}
                  numberOfLines={1}
                  style={{ maxWidth: '100%', fontFamily: selected ? fonts.bold : fonts.semibold, ...(narrow ? { fontSize: 13 } : null) }}>
                  {TILE_LABELS[choice]}
                </Text>
              </PressableScale>
            );
          })}
          {Array.from({ length: perRow - row.length }, (_, i) => (
            <View key={`gap-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
