import { useIsFocused } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, ScrollView, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, useTheme, useVeryLargeText } from '@/theme';

import { rovingIndex, segmentLayout } from './controlRules';
import { DECORATIVE } from './decorative';
import { PressableScale } from './Pressable';
import { Text, useGrownText } from './Text';
import { Hatch } from './Vessel';

/**
 * A label you can tap: 32 visible (a 44 px touch target through hitSlop, on
 * web too), corners 6, a 1 px borderStrong edge. Selected is an ink chip (text fill, bg text). `dropdown` adds a
 * chevron for a chip that opens a choice (the "30 days" chip on Progress).
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  dropdown,
  style,
  testID,
  accessibilityLabel,
}: {
  label: string;
  /** What a screen reader says; the label by default. Pass the raw text when `label` carries direction marks (`isolateRtl`). */
  accessibilityLabel?: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  dropdown?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  const fg = selected ? colors.bg : colors.text;
  // Large text: the chip grows to its label's lines (32 at least) and the label wraps at its spaces, never cut.
  const large = useGrownText();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      // 6 above and below makes the 44 px target (ChipRow keeps 6 px of room so it is not clipped).
      // Sideways a chip is already 44 wide or more; 4 each side meets the next chip's area in the
      // middle of the 8 px gap, so a neighbour never takes a tap that is nearer this chip.
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityState={{ selected: !!selected }}
      // react-native-web drops accessibilityState, so the browser is told directly.
      aria-pressed={!!selected}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          ...(large ? { minHeight: 32, paddingVertical: 3, maxWidth: '100%' as const } : { height: 32 }),
          paddingHorizontal: 12,
          borderRadius: radius.chip,
          backgroundColor: selected ? colors.text : 'transparent',
          borderWidth: 1,
          borderColor: selected ? colors.text : colors.borderStrong,
        },
        style,
      ]}>
      {/* The chip is named by its label: its icon only decorates. */}
      {icon ? <View {...DECORATIVE}>{icon}</View> : null}
      <Text variant="label" color={fg} numberOfLines={large ? undefined : 1} style={{ fontSize: 13.5, flexShrink: 1 }}>
        {label}
      </Text>
      {/* An icon on a control: 18 px at stroke 2.2, as on a small Button. */}
      {dropdown ? <ChevronDown size={18} color={fg} strokeWidth={2.2} {...DECORATIVE} /> : null}
    </PressableScale>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingHorizontal: 20, paddingVertical: 6 }, style]} style={{ marginHorizontal: -20, marginVertical: -6, flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

/**
 * Chips that wrap onto more lines when the screen is narrow. Lines are 12 apart
 * (chips 8 apart), so the 44 px touch areas of a chip and the one under it meet
 * in the middle of the gap instead of the lower chip taking the upper one's taps.
 */
export function ChipWrap({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }, style]}>{children}</View>;
}

/**
 * An underline tab row: a 1 px border baseline, inactive labels in
 * textSecondary, the selected label in text with a 3 px rim bar under it
 * (inset 18% each side). No sliding pill and no filled track.
 *
 * Two kinds, drawn the same. By default it is tabs (a `tablist` of `tab`s, the
 * chosen one selected), for switching what a screen shows. With
 * `role="radiogroup"` it is one choice of a form (a `radiogroup` of `radio`s,
 * the chosen one checked), named by `accessibilityLabel` (the field's label,
 * "Goal"). Either way it is one tab stop: on the web the arrow keys move the
 * choice and focus along the row (Home and End to its ends), and Space or Enter
 * picks the focused one.
 *
 * With text grown (`useGrownText`: the app's size, the phone's, or a reader's own text spacing) no label is cut,
 * and the row keeps one line while its labels fit it: through the phone's common text steps (under
 * `VERY_LARGE_TEXT`) each label is measured as drawn, in its bold (selected) weight, and the row keeps equal shares
 * while the widest fits its share, else segments as wide as their labels with the room left shared, and only where
 * they do not fit one row do they go on to a second (`segmentLayout` in ./controlRules). With very large text the
 * segments wrap as soon as text has grown, each as wide as its label (a label wider than the whole row wraps at
 * its spaces). At the designed size the segments share the row equally on one line, as always.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
  role = 'tablist',
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Each option gets `${testID}-${value}`. */
  testID?: string;
  /** 'tablist' (default) switches views; 'radiogroup' is a choice in a form, read as radios. */
  role?: 'tablist' | 'radiogroup';
  /** The group's name: with 'radiogroup', the field's label ("Goal", "Sex"). */
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const radio = role === 'radiogroup';
  const current = options.findIndex((o) => o.value === value);
  const web = Platform.OS === 'web';
  const large = useGrownText();
  // Through the common text steps the labels and the row are measured as drawn (`useSegmentFit`), and the row
  // wraps only where they do not fit one line; with very large text it wraps as soon as text has grown.
  const veryLarge = useVeryLargeText();
  const measured = large && !veryLarge;
  const fit = useSegmentFit(options.map((o) => o.label), measured);
  const layout = !large ? 'equal' : measured ? fit.layout : 'wrap';
  const wrap = layout === 'wrap';
  return (
    <View
      accessibilityRole={radio ? 'radiogroup' : 'tablist'}
      {...(web ? { role } : null)}
      accessibilityLabel={accessibilityLabel}
      style={[{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }, wrap ? { flexWrap: 'wrap' } : null, style]}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            onPress={() => onChange(o.value)}
            feedback="select"
            scaleTo={0.98}
            accessibilityRole={radio ? 'radio' : 'tab'}
            accessibilityState={radio ? { checked: active } : { selected: active }}
            {...(radio ? { 'aria-checked': active } : { 'aria-selected': active })}
            accessibilityLabel={o.label}
            {...(web
              ? {
                  // One tab stop for the row: the chosen option, else the first.
                  tabIndex: (current < 0 ? i === 0 : active) ? 0 : -1,
                  onKeyDown: (e: { key: string; currentTarget: unknown; preventDefault: () => void }) => {
                    const next = rovingIndex(e.key, i, options.length);
                    if (next === null) return;
                    e.preventDefault();
                    const row = (e.currentTarget as HTMLElement | null)?.parentElement;
                    (row?.children[next] as HTMLElement | undefined)?.focus();
                    if (options[next].value !== value) onChange(options[next].value);
                  },
                }
              : null)}
            style={[
              { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
              wrap
                ? { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4 }
                : layout === 'row'
                  ? { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: SEGMENT_PAD }
                  : { flex: 1, paddingHorizontal: SEGMENT_PAD },
            ]}>
            <Text
              variant="label"
              color={active ? 'text' : 'textSecondary'}
              numberOfLines={large ? undefined : 1}
              style={[{ fontSize: 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }, large ? { textAlign: 'center' } : null]}>
              {o.label}
            </Text>
            {active ? <Underline /> : null}
          </PressableScale>
        );
      })}
      {/* After the segments, so the arrow keys' `children[next]` still finds them. */}
      {measured ? fit.probes(SEGMENT_LABEL_MEASURE) : null}
    </View>
  );
}

/** A segment's side room on each side, at the designed size and while its row keeps one line. */
const SEGMENT_PAD = 4;
/** A label as drawn in its wider weight, the selected one's bold. */
const SEGMENT_LABEL_MEASURE = { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.bold };

/**
 * A row of segments measured as drawn, for `segmentLayout` (./controlRules): each label drawn unseen on one line in
 * `labelStyle` at its natural width, and the row's own width read by a probe that fills it. Nothing here is seen,
 * read out or touched, and nothing widens the page. On the web a view laid out while its screen was hidden is no
 * longer reported (the text size changed on Profile, over a tab), so the probes mount again, and measure again,
 * each time their screen comes into focus. Used by the kit's `Segmented` and Progress's section tabs.
 */
export function useSegmentFit(labels: string[], measuring: boolean, pad = SEGMENT_PAD) {
  const focusKey = useIsFocused() ? 'shown' : 'away';
  const [rowW, setRowW] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const layout = measuring ? segmentLayout(labels.map((l) => widths[l] ?? 0), rowW, pad) : 'equal';
  // A hidden screen may report nothing or 0: only a real size is kept.
  const onRow = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) setRowW(w);
  };
  const onLabel = (label: string) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    if (w > 0) setWidths((was) => (was[label] === w ? was : { ...was, [label]: w }));
  };
  const probes = (labelStyle: object) => [
    <View key={`segment-row-${focusKey}`} pointerEvents="none" {...DECORATIVE} onLayout={onRow} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />,
    <View key={`segment-words-${focusKey}`} pointerEvents="none" {...DECORATIVE} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
      <View style={{ width: 4000, flexDirection: 'row', alignItems: 'flex-start' }}>
        {labels.map((l) => (
          <View key={l} onLayout={onLabel(l)} style={{ flexDirection: 'row' }}>
            <Text variant="label" numberOfLines={1} style={labelStyle}>
              {l}
            </Text>
          </View>
        ))}
      </View>
    </View>,
  ];
  return { layout, probes };
}

/** The selected segment's level line, inset 18% each side of the label's cell. */
function Underline() {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -2, height: 3, borderRadius: 1, backgroundColor: colors.rim }} />;
}

/**
 * A small status label: a cup-key square in the colour, then the text.
 * A label's equal corners (`radius.chip`, 6), a faint tint of the colour behind it. Text stays a text token.
 */
export function Badge({ label, color, style }: { label: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const c = color ?? colors.primary;
  const tintable = /^#[0-9a-fA-F]{6}$/.test(c);
  const large = useGrownText();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 5,
          paddingHorizontal: 7,
          // At large text it grows with its label (22 at least) rather than clip it.
          ...(large ? { minHeight: 22, paddingVertical: 2 } : { height: 22 }),
          borderRadius: radius.chip,
          backgroundColor: tintable ? `${c}1F` : colors.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-start',
        },
        style,
      ]}>
      <CupKey color={c} size={7} />
      <Text variant="caption" color="text" style={{ fontSize: 12, lineHeight: 14, fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The legend key: a tiny cup (corners 1.5 on top, 4 at the base). `variant`
 * marks a food's data source: filled for reference, outlined for community,
 * dashed for an AI estimate. `hatched` is the key of exercise headroom (pass
 * `colors.headroom`): the same cup outlined in 1 px with the cup's hatching
 * inside, as the hatched part of a cup is drawn.
 */
export function CupKey({ color, size = 9, variant = 'filled', style }: { color: string; size?: number; variant?: 'filled' | 'outline' | 'dashed' | 'hatched'; style?: StyleProp<ViewStyle> }) {
  const hatched = variant === 'hatched';
  const edge = variant === 'filled' ? 0 : hatched ? 1 : 1.5;
  return (
    // A key only decorates: the words beside it (or the row's spoken name) say what it stands for.
    <View
      {...DECORATIVE}
      style={[
        {
          width: size,
          height: size,
          borderTopLeftRadius: 1.5,
          borderTopRightRadius: 1.5,
          borderBottomLeftRadius: Math.min(4, size / 2),
          borderBottomRightRadius: Math.min(4, size / 2),
          backgroundColor: variant === 'filled' ? color : 'transparent',
          borderWidth: edge,
          borderColor: color,
          borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
          overflow: hatched ? 'hidden' : undefined,
        },
        style,
      ]}>
      {hatched ? <Hatch width={size - 2 * edge} height={size - 2 * edge} color={color} step={3.5} opacity={1} /> : null}
    </View>
  );
}
