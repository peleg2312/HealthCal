/**
 * The Water screen's kinds (Water, Tea, Coffee, Juice, Milk, Sports drink, Other) in a sideways
 * scroller of their own, laid out as the kit's ChipRow (8 apart, the screen's 20 px sides, 6 px of room
 * for the chips' touch areas). The chips keep their testIDs `water-beverage-<kind>`.
 *
 * When the kind changes from code (a drink picked in the sheet, or a recent chip, moved the screen to
 * its kind), the screen raises `reveal` and the row scrolls just enough for the selected chip to be
 * wholly in view, so the person sees where the drink went. A kind tapped by the person never moves the
 * row (the chip is already where the finger is). A chip reached with the keyboard (Tab) is scrolled
 * wholly into view the same way, so the focused chip is never left mostly outside the row.
 *
 * The kinds are a quiet choice above the glasses, which are the screen's main action: the chosen kind
 * is marked by a 2 px ink outline (`KindChip`), never a solid ink fill that would
 * outweigh the glasses.
 */
import React, { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { BEVERAGE_LABELS } from '@/lib/hydration';
import { useTheme } from '@/theme';
import type { Beverage } from '@/types';
import { isReducedMotion, PressableScale, Text, useGrownText } from '@/ui';

const BEVERAGES = Object.keys(BEVERAGE_LABELS) as Beverage[];
/** The row's side padding (the screen's gutter): a chip scrolled into view keeps it. */
const SIDE = 20;

export function DrinkKindRow({ kind, onChoose, reveal }: { kind: Beverage; onChoose: (kind: Beverage) => void; reveal: number }) {
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const boxes = useRef<Partial<Record<Beverage, { x: number; w: number }>>>({});
  const view = useRef({ w: 0, x: 0 });

  // Scrolls the row just enough for the kind's chip to be wholly in view, keeping the row's side padding.
  const bringIntoView = (b: Beverage) => {
    const box = boxes.current[b];
    const { w, x } = view.current;
    if (!box || !w || !scroller.current) return;
    let to: number | null = null;
    if (box.x - SIDE < x) to = Math.max(0, box.x - SIDE);
    else if (box.x + box.w + SIDE > x + w) to = box.x + box.w + SIDE - w;
    if (to === null) return;
    scroller.current.scrollTo({ x: to, y: 0, animated: !isReducedMotion() });
    view.current.x = to;
  };

  useEffect(() => {
    if (reveal === 0) return;
    bringIntoView(kind);
    // Only a pick raises `reveal`; the kind it set is read with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="water-kinds"
      scrollEventThrottle={32}
      onScroll={(e) => {
        view.current.x = e.nativeEvent.contentOffset.x;
      }}
      onLayout={(e) => {
        view.current.w = e.nativeEvent.layout.width;
      }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: SIDE, paddingVertical: 6 }}
      style={{ marginHorizontal: -SIDE, marginVertical: -6, flexGrow: 0 }}>
      {BEVERAGES.map((b) => (
        <View
          key={b}
          onLayout={(e) => {
            boxes.current[b] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
          }}>
          <KindChip testID={`water-beverage-${b}`} label={BEVERAGE_LABELS[b].label} selected={kind === b} onPress={() => onChoose(b)} onFocus={() => bringIntoView(b)} />
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * One kind: the kit Chip's size, corners, label and touch area (32 px, 44 to touch), its chosen state drawn quietly
 * as a 2 px ink outline (the same width either way: the padding gives back the outline's extra pixel), so the
 * selection stays legible without a solid fill. Selected is `aria-pressed`, as the
 * kit Chip's.
 */
function KindChip({ label, selected, onPress, onFocus, testID }: { label: string; selected: boolean; onPress: () => void; onFocus: () => void; testID: string }) {
  const { colors, radius } = useTheme();
  const large = useGrownText();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      onFocus={onFocus}
      feedback="select"
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityState={{ selected }}
      aria-pressed={selected}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        ...(large ? { minHeight: 32, paddingVertical: 3, maxWidth: '100%' as const } : { height: 32 }),
        paddingHorizontal: selected ? 11 : 12,
        borderRadius: radius.chip,
        backgroundColor: 'transparent',
        borderWidth: selected ? 2 : 1,
        // The other kinds stay quiet (a hairline and secondary words), so the glasses under them lead the screen in
        // every look; the chosen kind is the 2 px ink outline with its words in ink.
        borderColor: selected ? colors.text : colors.border,
      }}>
      <Text variant="label" color={selected ? 'text' : 'textSecondary'} numberOfLines={large ? undefined : 1} style={{ fontSize: 13.5, flexShrink: 1 }}>
        {label}
      </Text>
    </PressableScale>
  );
}
