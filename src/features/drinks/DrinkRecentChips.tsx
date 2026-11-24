/**
 * On the Water kind only: one line of up to 3 of the person's own drinks (`recentChips` from "Your
 * drinks", ./pick.ts), so a drink picked once is two taps away the next day (the chip, then a glass).
 * One line, no wrapping: a chip that does not fit is left out (`recentChips` decides, from the line's
 * measured width). Nothing is drawn when there is nothing to show. A tap is a pick: the screen sends it
 * through `placePick(food, null)` and the same path as a pick in the sheet.
 */
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import type { Food, UnitSystem } from '@/types';
import { Chip } from '@/ui';
import { spokenUnits } from '@/lib/spokenUnits';

import { recentChips } from './pick';

/** A chip's name is cut with an ellipsis past this width. */
const MAX_CHIP = 200;

export function DrinkRecentChips({ yours, glassMl, units, onPick }: { yours: readonly Food[]; glassMl: number; units: UnitSystem; onPick: (food: Food) => void }) {
  const { width } = useWindowDimensions();
  // The screen's content width until the line has measured itself.
  const [room, setRoom] = useState<number | null>(null);
  const chips = recentChips(yours, glassMl, units, room ?? Math.min(width, 560) - 40, MAX_CHIP);
  if (chips.length === 0) return null;
  return (
    <View
      testID="water-recent"
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== room) setRoom(w);
      }}
      style={{ flexDirection: 'row', gap: 8, paddingVertical: 6, marginVertical: -6 }}>
      {chips.map((c) => (
        <Chip key={c.testID} testID={c.testID} label={c.text} accessibilityLabel={spokenUnits(c.label)} style={{ maxWidth: MAX_CHIP }} onPress={() => onPick(c.food)} />
      ))}
    </View>
  );
}
