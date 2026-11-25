/**
 * The measuring parts for `fit.ts`: words drawn unseen at their natural one-line width (`MeasureWidth`), and the size
 * of a box read by a probe inside it (`SizeProbe`), so a layout drawn to grow with its text gives way only where the
 * words are wider than their room. Nothing here is seen, read out or touched, and nothing widens the page.
 *
 * On the web a view's layout is watched by react-native-web's ResizeObserver, which stops reporting a view laid out
 * while its screen was hidden (the text size changed on Profile, over Today), so every measuring part is keyed by
 * `useMeasureKey`: it mounts again, and measures again, each time its screen comes back into focus.
 */
import { useIsFocused } from 'expo-router';
import React from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : null),
};

/** A key for the measuring parts of a screen: it changes as the screen comes into focus and leaves it. Screens only. */
export function useMeasureKey(): string {
  return useIsFocused() ? 'shown' : 'away';
}

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

/**
 * Reports the size of the box it is placed in (its padding box: it fills it, absolutely positioned, and draws
 * nothing), so the box itself needs no handler of its own and the probe can be mounted again to measure again.
 */
export function SizeProbe({ onSize }: { onSize: (width: number, height: number) => void }) {
  const onLayout = (e: LayoutChangeEvent) => onSize(e.nativeEvent.layout.width, e.nativeEvent.layout.height);
  return <View pointerEvents="none" {...HIDDEN} onLayout={onLayout} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />;
}
