import { Check } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { useColorScheme, useWindowDimensions, View } from 'react-native';
import { create } from 'zustand';

import { useStore } from '@/store';
import { blossomColors, cup, darkColors, fonts, lightColors, useTheme, vesselBase, type ThemeColors } from '@/theme';
import type { ThemePreference } from '@/types';
import { FadeUp, Hatch, PressableScale, Text } from '@/ui';

import { StepTitle } from './components';

export const THEME_CHOICES: { value: ThemePreference; title: string; hint: string }[] = [
  { value: 'blossom', title: 'Blossom', hint: 'Champagne and raspberry' },
  { value: 'light', title: 'Oat', hint: 'Light oat paper' },
  { value: 'dark', title: 'Espresso', hint: 'Warm and dark' },
  { value: 'system', title: 'Match my phone', hint: 'Light by day, dark at night, following your phone' },
];

/**
 * True once "Match my phone" was tapped here. The stored value for it is
 * 'system', the same as "never chosen", so this is what tells them apart
 * during set-up: coming back to the step keeps it selected, and the set-up
 * screens show the phone's look instead of the lead one (see `ChosenLook` in
 * the onboarding route). In memory only, like the answers.
 */
export const useMatchPhone = create<{ picked: boolean }>(() => ({ picked: false }));

/**
 * The look this step shows as chosen. An explicit choice is kept. Otherwise
 * "Match my phone" on a dark phone, and Blossom (the app's lead look, the one
 * on the icon) on a light phone or one that does not say.
 */
export function preselectedTheme(stored: ThemePreference, scheme: string | null | undefined, matchPhone = useMatchPhone.getState().picked): ThemePreference {
  if (stored !== 'system') return stored;
  return matchPhone || scheme === 'dark' ? 'system' : 'blossom';
}

/** Write the shown choice, so finishing set-up always leaves an explicit look stored. */
export function commitThemeChoice(scheme: string | null | undefined) {
  const { settings, setSettings } = useStore.getState();
  const pick = preselectedTheme(settings.theme, scheme);
  if (pick !== settings.theme) setSettings({ theme: pick });
}

/**
 * The last question: how the app looks. Each card holds a live miniature of
 * the Today hero in that palette. A tap applies the look to the whole app at
 * once, so the preview is the real thing.
 */
export function ThemeStep() {
  const { spacing } = useTheme();
  const stored = useStore((s) => s.settings.theme);
  const matchPhone = useMatchPhone((s) => s.picked);
  const scheme = useColorScheme();
  const selected = preselectedTheme(stored, scheme, matchPhone);

  // Shown means chosen: store the preselected look as soon as the step appears.
  useEffect(() => {
    commitThemeChoice(scheme);
  }, [scheme]);

  const choose = (theme: ThemePreference) => {
    useMatchPhone.setState({ picked: theme === 'system' });
    useStore.getState().setSettings({ theme });
  };

  return (
    <View style={{ gap: spacing.xl }}>
      <StepTitle title="Pick how your day looks" subtitle="Tap one and the whole app changes, so you can see it before you start." />
      <View accessibilityRole="radiogroup" accessibilityLabel="Appearance" style={{ gap: spacing.sm }}>
        {THEME_CHOICES.map((o, i) => (
          <FadeUp key={o.value} index={i}>
            <ThemeCard title={o.title} hint={o.hint} value={o.value} selected={selected === o.value} onPress={() => choose(o.value)} />
          </FadeUp>
        ))}
      </View>
      <Text variant="caption" color="textSecondary" testID="onb-theme-note">
        You can change this any time in Profile, under Appearance.
      </Text>
    </View>
  );
}

function ThemeCard({ title, hint, value, selected, onPress }: { title: string; hint: string; value: ThemePreference; selected: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const w = narrow ? 112 : 136;
  const h = narrow ? 86 : 96;
  return (
    <PressableScale
      testID={`onb-theme-${value}`}
      onPress={onPress}
      feedback="select"
      scaleTo={0.985}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      aria-checked={selected}
      accessibilityLabel={`${title}. ${hint}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: selected ? 10 : 11.5,
        ...cup(radius.card),
        backgroundColor: colors.surface,
        // The selected chip's edge: 2.5 px of ink.
        borderWidth: selected ? 2.5 : 1,
        borderColor: selected ? colors.text : colors.border,
      }}>
      <View style={{ width: w, height: h }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {value === 'system' ? (
          <>
            <View style={{ position: 'absolute', left: 0, top: 0, width: w / 2, height: h, overflow: 'hidden' }}>
              <MiniToday c={lightColors} width={w} height={h} />
            </View>
            <View style={{ position: 'absolute', left: w / 2, top: 0, width: w / 2, height: h, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', left: -w / 2, top: 0 }}>
                <MiniToday c={darkColors} width={w} height={h} />
              </View>
            </View>
          </>
        ) : (
          <MiniToday c={value === 'dark' ? darkColors : value === 'blossom' ? blossomColors : lightColors} width={w} height={h} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="h3">{title}</Text>
        <Text variant="caption" color="textSecondary">
          {hint}
        </Text>
        {selected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs }}>
            <Check size={14} color={colors.text} strokeWidth={2.6} />
            <Text variant="label" style={{ fontFamily: fonts.bold }}>
              Selected
            </Text>
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

/**
 * The Today hero in miniature, drawn in a given palette (not the active one):
 * the background, a card holding the cup with hatched exercise headroom, the
 * calorie fill and its level line, the big number left and two macro bars.
 * Purely decorative; the card around it carries the label.
 */
function MiniToday({ c, width, height }: { c: ThemeColors; width: number; height: number }) {
  const vh = height - 30;
  const vw = Math.round(vh * 0.4);
  const head = Math.round(vh * 0.16);
  const fill = 0.52;
  return (
    <View style={{ width, height, backgroundColor: c.bg, padding: 5, ...cup(12, 4), overflow: 'hidden' }}>
      <View style={{ flex: 1, backgroundColor: c.surface, ...cup(10, 3), borderWidth: 1, borderColor: c.border, padding: 7, flexDirection: 'row', gap: 7 }}>
        <View style={{ width: vw, height: vh, alignSelf: 'flex-end' }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderTopWidth: 0,
              borderColor: c.vesselEdge,
              borderBottomLeftRadius: vesselBase(vh, vw) / 2,
              borderBottomRightRadius: vesselBase(vh, vw) / 2,
              backgroundColor: c.track,
              overflow: 'hidden',
            }}>
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: head, borderBottomWidth: 1, borderStyle: 'dashed', borderColor: c.vesselEdge }}>
              <Hatch width={vw - 2} height={head} color={c.headroom} step={4} />
            </View>
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: (vh - 1) * fill, backgroundColor: c.calories }}>
              <View style={{ height: 2, backgroundColor: c.rim }} />
            </View>
          </View>
          <View style={{ position: 'absolute', left: -3, right: -3, top: -1, height: 1.5, backgroundColor: c.vesselEdge }} />
        </View>
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <Text style={{ color: c.caloriesInk, fontFamily: fonts.extrabold, fontSize: height < 90 ? 21 : 24, lineHeight: height < 90 ? 23 : 26, letterSpacing: -0.8 }}>941</Text>
            <Text style={{ color: c.textSecondary, fontFamily: fonts.semibold, fontSize: 7.5, lineHeight: 9 }}>{'kcal\nleft'}</Text>
          </View>
          <View style={{ gap: 5 }}>
            <MiniBar c={c} color={c.protein} share={0.62} />
            <MiniBar c={c} color={c.carbs} share={0.44} />
          </View>
        </View>
      </View>
    </View>
  );
}

function MiniBar({ c, color, share }: { c: ThemeColors; color: string; share: number }) {
  return (
    <View style={{ height: 4, borderRadius: 1, backgroundColor: c.track, justifyContent: 'center' }}>
      <View style={{ width: `${share * 100}%`, height: 4, borderRadius: 1, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: `${share * 100}%`, marginLeft: -1, width: 2, height: 8, borderRadius: 0.5, backgroundColor: c.rim }} />
    </View>
  );
}
