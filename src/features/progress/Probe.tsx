/**
 * Words laid out unseen as they would wrap in a box of a given width, for the measured fits of `./grownFit` (the
 * overview tiles, the milestones). The natural one-line width of words is `MeasureWidth` (@/features/today/MeasureWidth);
 * this is its wrapping sibling. Nothing here is seen, read out or touched, and nothing widens the page. Draw it only
 * while the answer is needed (text grown), keyed by `useMeasureKey` so it measures again when its screen comes back.
 */
import React from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : null),
};

/**
 * `children` laid out unseen in a box `room` wide, as narrow as they allow (as a line of words wraps there), reported
 * to `onSize`: the width (wider than the room only where a word is, rounded up) and the height.
 */
export function WrapProbe({ room, children, onSize }: { room: number; children: React.ReactNode; onSize: (width: number, height: number) => void }) {
  const onLayout = (e: LayoutChangeEvent) => onSize(Math.ceil(e.nativeEvent.layout.width), Math.round(e.nativeEvent.layout.height));
  return (
    <View pointerEvents="none" {...HIDDEN} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
      <View style={{ width: room, alignItems: 'flex-start' }}>
        <View onLayout={onLayout}>
          {children}
        </View>
      </View>
    </View>
  );
}
