/**
 * Words drawn unseen, each on a line of its own at its natural width, reported together by key (whole pixels,
 * rounded up) once every one is measured and again whenever one changes: Train's history rows measure their name's
 * pieces, their figure and their line with it (`historyFigureBesideMeasured`, `historyMetaLines` in ./history), so
 * a row gives way only where its words, as drawn on the device, do not fit. The same hidden box as `MeasureWidth`
 * (@/features/today/MeasureWidth): nothing here is seen, read out or touched, and nothing widens the page. Draw it
 * only while the answer is needed (text grown), keyed by `useMeasureKey`, so it measures again when its screen
 * comes back into focus.
 */
import React, { useRef } from 'react';
import { Platform, View } from 'react-native';

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : null),
};

export function MeasureEach({ items, onWidths }: { items: readonly { key: string; node: React.ReactNode }[]; onWidths: (widths: Record<string, number>) => void }) {
  const got = useRef<Record<string, number>>({});
  const report = (key: string, width: number) => {
    if (got.current[key] === width) return;
    got.current = { ...got.current, [key]: width };
    if (items.every((it) => (got.current[it.key] ?? 0) > 0)) onWidths(got.current);
  };
  return (
    <View pointerEvents="none" {...HIDDEN} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
      <View style={{ width: 4000, alignItems: 'flex-start' }}>
        {items.map((it) => (
          <View key={it.key} onLayout={(e) => report(it.key, Math.ceil(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {it.node}
          </View>
        ))}
      </View>
    </View>
  );
}
