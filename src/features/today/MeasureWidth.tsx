/**
 * The measuring copy for `fit.ts`: words drawn unseen at their natural one-line width, so a layout drawn to grow with
 * its text gives way only where they are wider than their room. It has no opacity, is hidden from assistive
 * technology, takes no touches and is clipped in a box of no size, so it never widens the page or is read out.
 */
import React from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : null),
};

/**
 * `children` drawn unseen on one line at their natural width, reported to `onWidth` (whole pixels, rounded up)
 * whenever it changes. Placed anywhere inside a box: it is absolutely positioned and takes no room. Draw it only while
 * the answer is needed (text grown), so the designed layout draws nothing more.
 */
export function MeasureWidth({ children, onWidth }: { children: React.ReactNode; onWidth: (width: number) => void }) {
  const onLayout = (e: LayoutChangeEvent) => onWidth(Math.ceil(e.nativeEvent.layout.width));
  return (
    <View pointerEvents="none" {...HIDDEN} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
      <View style={{ width: 4000, flexDirection: 'row', alignItems: 'flex-start' }}>
        <View onLayout={onLayout} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {children}
        </View>
      </View>
    </View>
  );
}
