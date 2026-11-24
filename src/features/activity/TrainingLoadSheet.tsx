import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { CHART_CAPTION, HOW_COUNTED, type TrainingOverview } from '@/lib/trainingLoad';
import { useTheme } from '@/theme';
import { BarChart, Button, Sheet, Text } from '@/ui';

import { WHO_WEEKLY_MINUTES } from './build';
import { nextChange, readFit } from './sheetFit';
import { ZoneScale } from './ZoneScale';

/** The chart's designed height, at every width. `sheetFit.ts` may give it up to 48 px more or take up to 32 px off. */
const CHART_H = 108;
/**
 * "Ask the coach" takes no press for this long after the sheet arrives. It sits in the sheet's first
 * view at the height of Train's line, so the second tap of a double tap on the line lands on it: that
 * tap must open nothing more than the sheet the first one opened.
 */
const COACH_GUARD_MS = 450;

/**
 * The training overview behind Train's line (`train-load-info`, or the guideline line's info cup
 * when there is no state). The answer comes first: the title, then where the week sits on the
 * scale (one slim track in thirds: lighter, usual, more), the numbers with at most one fact and one
 * next step, the last four 7-day blocks and this one against WHO's 150 to 300, the counts, and the
 * one action, "Ask the coach", which is in the sheet's first view at 360 x 740. The fine print
 * (where the numbers come from and how minutes count) closes the sheet under its own heading.
 * Every word comes from `trainingOverview` (src/lib/trainingLoad.ts); this only places it.
 * With too little history there is no scale: it says so and still shows the last 7 days' minutes
 * and the chart.
 *
 * How the body sits in its window is `sheetFit.ts`: the chart gives up to 32 px back when that makes
 * the whole body fit, grows by up to 48 px when the body would otherwise scroll by a sliver (so a
 * real stretch of the fine print is below the fold), and keeps "Ask the coach" whole in the first
 * view or wholly under the fold. It is asked again whenever the content or the window's height changes.
 */
export function TrainingLoadSheet({ overview, visible, onClose }: { overview: TrainingOverview; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={overview.title ?? 'Last 7 days'}>
      <OverviewBody overview={overview} visible={visible} onClose={onClose} />
    </Sheet>
  );
}

/** The sheet's content: mounted with the sheet, so it measures itself inside the sheet's own scroller. */
function OverviewBody({ overview: o, visible, onClose }: { overview: TrainingOverview; visible: boolean; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  // What the chart gets on top of its designed height (negative: less). Measured after each layout from the
  // live sizes (this render's `change` is the one drawn, and is taken off again), so it settles in one step.
  const root = useRef<React.ComponentRef<typeof View>>(null);
  const action = useRef<React.ComponentRef<typeof View>>(null);
  const [change, setChange] = useState(0);
  const fit = () => {
    const m = readFit(root.current, action.current);
    if (!m) return;
    const next = nextChange(m, change);
    if (next !== change) setChange(next);
  };
  // The sheet is as tall as the window lets it be, so a window that changes height (split screen, a browser's
  // bar) changes what fits while the content's own layout stays as it was: ask again, a frame later, once the
  // sheet has its new height. A stretch that is no longer needed is taken back that way.
  const windowH = useWindowDimensions().height;
  const latestFit = useRef(fit);
  useEffect(() => {
    latestFit.current = fit;
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => latestFit.current());
    return () => cancelAnimationFrame(frame);
  }, [windowH]);
  // When the sheet arrived (read in an effect and in the press, never while rendering). Null until then: no press counts.
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    shownAt.current = visible ? Date.now() : null;
  }, [visible]);
  return (
    <View ref={root} onLayout={fit} style={{ gap: spacing.md }} testID="train-load-sheet">
      {o.position ? <ZoneScale position={o.position} testID="train-load-mark" /> : null}
      {o.lead ? (
        <Text variant="bodyStrong" testID="train-load-lead">
          {o.lead}
        </Text>
      ) : null}
      <View style={{ gap: spacing.xs }} testID="train-load-lines">
        {o.lines.map((line, i) => (
          <Text key={i} variant="body" color={i === 0 ? 'text' : 'textSecondary'} testID={i === 0 ? 'train-load-numbers' : undefined}>
            {line}
          </Text>
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        {/* Each column of the kit's chart is drawn in a box 24 px wider on each side than its slot (room for the
            pour): the inset keeps those boxes inside the sheet's side padding. */}
        <View style={{ paddingHorizontal: 24 }}>
          <BarChart
            testID="train-load-chart"
            data={o.blocks.map((b) => ({ label: b.label, value: b.minutes, detail: b.detail }))}
            color={colors.exercise}
            band={{ from: WHO_WEEKLY_MINUTES, to: WHO_WEEKLY_MINUTES * 2 }}
            goalKind="reach"
            highlightIndex={o.blocks.length - 1}
            height={CHART_H + change}
          />
        </View>
        <Text variant="caption" color="textSecondary">
          {CHART_CAPTION}
        </Text>
      </View>
      <Text variant="body" testID="train-load-counts">
        {o.countsLine}
      </Text>
      {/* The sheet closes, then the coach rises over Train already answering the training question.
          The plain View around the button is only what the fit rule measures. */}
      <View ref={action}>
        <Button
          testID="train-load-coach"
          title="Ask the coach"
          variant="secondary"
          onPress={() => {
            const since = shownAt.current === null ? 0 : Date.now() - shownAt.current;
            if (since < COACH_GUARD_MS) return;
            onClose();
            setTimeout(() => router.push('/coach?ask=training' as never), 60);
          }}
        />
      </View>
      {/* The fine print, after the action: 8 px more than the body's gap sets it apart as its own part. */}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Text variant="overline" accessibilityRole="header" testID="train-load-how">
          {HOW_COUNTED}
        </Text>
        <View style={{ gap: spacing.sm }} testID="train-load-honest">
          {o.honest.map((line, i) => (
            <Text key={i} variant="caption" color="textSecondary">
              {line}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
