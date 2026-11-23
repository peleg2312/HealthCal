/**
 * The Water screen's kinds (Water, Tea, Coffee, Juice, Milk, Sports drink, Other) in a sideways
 * scroller of their own, laid out as the kit's ChipRow (8 apart, the screen's 20 px sides, 6 px of room
 * for the chips' touch areas). The chips keep their testIDs `water-beverage-<kind>`.
 *
 * When the kind changes from code (a drink picked in the sheet, or a recent chip, moved the screen to
 * its kind), the screen raises `reveal` and the row scrolls just enough for the selected chip to be
 * wholly in view, so the person sees where the drink went. A kind tapped by the person never moves the
 * row (the chip is already where the finger is).
 */
import React, { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { BEVERAGE_LABELS } from '@/lib/hydration';
import type { Beverage } from '@/types';
import { Chip, isReducedMotion } from '@/ui';

const BEVERAGES = Object.keys(BEVERAGE_LABELS) as Beverage[];
/** The row's side padding (the screen's gutter): a chip scrolled into view keeps it. */
const SIDE = 20;

export function DrinkKindRow({ kind, onChoose, reveal }: { kind: Beverage; onChoose: (kind: Beverage) => void; reveal: number }) {
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const boxes = useRef<Partial<Record<Beverage, { x: number; w: number }>>>({});
  const view = useRef({ w: 0, x: 0 });

  useEffect(() => {
    if (reveal === 0) return;
    const box = boxes.current[kind];
    const { w, x } = view.current;
    if (!box || !w || !scroller.current) return;
    let to: number | null = null;
    if (box.x - SIDE < x) to = Math.max(0, box.x - SIDE);
    else if (box.x + box.w + SIDE > x + w) to = box.x + box.w + SIDE - w;
    if (to === null) return;
    scroller.current.scrollTo({ x: to, y: 0, animated: !isReducedMotion() });
    view.current.x = to;
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
          <Chip testID={`water-beverage-${b}`} label={BEVERAGE_LABELS[b].label} selected={kind === b} onPress={() => onChoose(b)} />
        </View>
      ))}
    </ScrollView>
  );
}
