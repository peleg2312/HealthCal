/**
 * Words laid out unseen as they would wrap in a box of a given width, for the measured fits of `./grownFit` (the
 * overview tiles, the milestones). The natural one-line width of words is `MeasureWidth` (@/features/today/MeasureWidth);
 * this is its wrapping sibling, and `WidestRun` measures the widest run of words a line cannot break inside. Nothing
 * here is seen, read out or touched, and nothing widens the page. Draw it only while the answer is needed (text grown),
 * keyed by `useMeasureKey` so it measures again when its screen comes back. As `MeasureWidth` does, it never passes on
 * a width or a height of 0 (a hidden screen's, `isMeasured`), so the last good size stays.
 */
import React from 'react';
import { Platform, View, type LayoutChangeEvent } from 'react-native';

import { MeasureWidth } from '@/features/today/MeasureWidth';
import { isMeasured } from '@/features/today/measured';

import { breakRuns } from './grownFit';

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? ({ 'aria-hidden': true } as object) : null),
};

/**
 * `children` laid out unseen in a box `room` wide, as narrow as they allow (as a line of words wraps there), reported
 * to `onSize`: the width (wider than the room only where a browser lets a word overflow, rounded up) and the height.
 */
export function WrapProbe({ room, children, onSize }: { room: number; children: React.ReactNode; onSize: (width: number, height: number) => void }) {
  // A width or height of 0 is a hidden screen's (`isMeasured`): the last good size stays.
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (isMeasured(width, height)) onSize(Math.ceil(width), Math.round(height));
  };
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

/**
 * The widest of the runs a line of `text` can only break between (`breakRuns`), each drawn by `draw` on one line,
 * reported to `onWidth` (rounded up, never 0). A phone breaks a run wider than its line inside itself, where a browser
 * lets it overflow, so this is how a word too wide for its room is told on both (`wrapFits`' `word`).
 */
export function WidestRun({ text, draw, onWidth }: { text: string; draw: (run: string) => React.ReactNode; onWidth: (width: number) => void }) {
  return (
    <MeasureWidth onWidth={onWidth}>
      {/* One column: as wide as its widest run. */}
      <View>
        {breakRuns(text).map((run, i) => (
          <React.Fragment key={i}>{draw(run)}</React.Fragment>
        ))}
      </View>
    </MeasureWidth>
  );
}
