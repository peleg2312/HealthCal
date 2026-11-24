/**
 * The comparison card of the plan screen: what each plan gives a day, as cups. One card, three
 * columns: the row labels (each with the AI family's glyph, ruling D1), the Free column and the Plus
 * column. A Free cup is poured to its share of Plus (5 of 40 estimates fills an eighth), so the
 * difference is seen before it is read; every Plus cup is brim-full and wears the brim line, the
 * kit's mark for "the whole of it". The column of the plan the person holds says "Your plan".
 *
 * Every cup stands on the card itself: the Plus column is set apart by a hairline down its side and
 * its own head, not by a tint, because on a tint (surfaceAlt) the cups' outline and fill fall under
 * the 3:1 a cup needs on what it stands on (src/theme/contrast.test.ts, "the plan's allowance cups").
 *
 * The numbers come from the server (`view.planLimits`); nothing here is a price. The two plan columns
 * keep the testIDs the old cards had (`plan-free-card`, `plan-plus-card`), and each reads to a screen
 * reader once, as one sentence (`cardLabel`); the label column is hidden from it, since that
 * sentence already names every row.
 *
 * The columns are laid out as columns (so each plan's figures are one element), and a row's height
 * is the label's own measured height, at least 56, so a label that wraps on a narrow phone or at a
 * large text size never pushes its cups out of line. At 130% text and more the columns would leave the
 * labels a few letters wide, so the two plans stand one under the other instead (`largeText`).
 */
import React, { useState } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { AiGlyph } from '@/features/ai/mark';
import { NBSP } from '@/lib/text';
import { useTextSize, useTheme } from '@/theme';
import { Card, Text } from '@/ui';

import { shareOfPlus } from './allowance';
import { PlanCup } from './PlanCup';
import type { PlanLimits } from './view';
import { FREE_CARD_TITLE, PLUS_CARD_TITLE, YOUR_PLAN_TAG, cardLabel, cardRows, rowUnit, type CardRow } from './words';

const HEAD_H = 44;
const ROW_MIN = 56;
/** The room between the head and the first row, with the hairline in its middle. */
const RULE_H = 17;
/** A cell: the cup, then the figure. */
const CUP_W = 24;
/** One digit of the 20 px figure (tabular), rounded up. */
const DIGIT_W = 13;

/**
 * The measures that give way on a phone under 360 px, where the labels wrap: the card's padding, the
 * room inside a cell and beside the tint close up a little so the labels keep more of the width, and
 * the rows stand further apart so two wrapped labels never read as one block.
 */
const WIDE = { pad: 16, colGap: 8, cellGap: 8, side: 8, rowGap: 4, glyphGap: 8 } as const;
const NARROW = { pad: 12, colGap: 4, cellGap: 6, side: 6, rowGap: 12, glyphGap: 6 } as const;

const NUMBER: Record<CardRow['key'], (l: PlanLimits) => number> = {
  estimates: (l) => l.estimates,
  questions: (l) => l.questions,
  memory: (l) => l.memoryPairs,
};

export function AllowanceTable({ free, plus, current, testID = 'plan-compare' }: { free: PlanLimits; plus: PlanLimits; current: 'free' | 'plus'; testID?: string }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const largeText = useTextSize() >= 1.3;
  const m = width < 360 ? NARROW : WIDE;
  const rows = cardRows(free);
  // Each label cell reports its own height; the cups' cells follow it.
  const [heights, setHeights] = useState<number[]>([]);
  const rowH = (i: number) => Math.max(ROW_MIN, heights[i] ?? 0);
  const onRow = (i: number) => (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    setHeights((was) => {
      if (was[i] === h) return was;
      const next = [...was];
      next[i] = h;
      return next;
    });
  };
  // Wide enough for the longest figure, so a three-figure allowance still sits beside its cup.
  const digits = Math.max(...rows.map((r) => Math.max(String(NUMBER[r.key](free)).length, String(NUMBER[r.key](plus)).length)), 2);
  const cellW = CUP_W + m.cellGap + digits * DIGIT_W;

  const column = (plan: 'free' | 'plus') => {
    const limits = plan === 'free' ? free : plus;
    const title = plan === 'free' ? FREE_CARD_TITLE : PLUS_CARD_TITLE;
    const mine = current === plan;
    const isPlus = plan === 'plus';
    // The rule under the heads runs unbroken from the labels to the hairline down the Plus column's side.
    const ruleIn = isPlus ? 2 * m.side - 1 : m.colGap;
    return (
      <View
        testID={plan === 'free' ? 'plan-free-card' : 'plan-plus-card'}
        accessible
        accessibilityLabel={cardLabel(title, limits, mine)}
        style={
          isPlus
            ? // Set apart by a hairline down its side; it takes the room the tint had, so nothing else moves.
              { width: cellW + 2 * m.side, marginLeft: m.colGap, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 2 * m.side - 1 }
            : { width: cellW + m.colGap, paddingLeft: m.colGap }
        }>
        <View style={{ height: HEAD_H, justifyContent: 'flex-end' }}>
          <Text variant="h3" numberOfLines={1}>
            {title}
          </Text>
          {/* Both heads are the same height: the other column holds an empty line (a no-break space, which keeps its line). */}
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {mine ? YOUR_PLAN_TAG : NBSP}
          </Text>
        </View>
        <View style={{ height: RULE_H, justifyContent: 'center' }}>
          <View style={{ height: 1, backgroundColor: colors.border, marginLeft: -ruleIn, marginRight: isPlus ? 0 : -m.colGap }} />
        </View>
        <View style={{ gap: m.rowGap }}>
          {rows.map((r, i) => {
            const n = NUMBER[r.key](limits);
            return (
              <View key={r.key} style={{ height: rowH(i), flexDirection: 'row', alignItems: 'center', gap: m.cellGap }}>
                <PlanCup
                  size="row"
                  level={plan === 'free' ? shareOfPlus(n, NUMBER[r.key](plus)) : 1}
                  // Free cups pour first, then Plus: left to right, top down.
                  index={(plan === 'free' ? 0 : rows.length) + i}
                  memoryKey={`plan-${plan}-${r.key}`}
                />
                <Text variant="numM" tabular numberOfLines={1}>
                  {n}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  if (largeText) {
    // At 130% text and more three columns leave the labels a few letters wide: each plan becomes a block
    // of its own, Free then Plus under a hairline, each row its cup, its figure and its words, which wrap.
    return (
      <Card padding={m.pad} testID={testID} style={{ gap: m.pad }}>
        {(['free', 'plus'] as const).map((plan) => {
          const limits = plan === 'free' ? free : plus;
          const title = plan === 'free' ? FREE_CARD_TITLE : PLUS_CARD_TITLE;
          const mine = current === plan;
          return (
            <View
              key={plan}
              testID={plan === 'free' ? 'plan-free-card' : 'plan-plus-card'}
              accessible
              accessibilityLabel={cardLabel(title, limits, mine)}
              style={{ gap: 12, ...(plan === 'plus' ? { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: m.pad } : null) }}>
              <View>
                <Text variant="h3">{title}</Text>
                {mine ? (
                  <Text variant="caption" color="textSecondary">
                    {YOUR_PLAN_TAG}
                  </Text>
                ) : null}
              </View>
              {rows.map((r, i) => {
                const n = NUMBER[r.key](limits);
                return (
                  <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: m.cellGap }}>
                    <PlanCup size="row" level={plan === 'free' ? shareOfPlus(n, NUMBER[r.key](plus)) : 1} index={(plan === 'free' ? 0 : rows.length) + i} memoryKey={`plan-${plan}-${r.key}`} />
                    <Text variant="numM" tabular>
                      {n}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="label" color="text">
                        {r.label}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {rowUnit(r.key)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Card>
    );
  }

  return (
    <Card padding={m.pad} testID={testID} style={{ flexDirection: 'row' }}>
      <View style={{ flex: 1, minWidth: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ height: HEAD_H }} />
        <View style={{ height: RULE_H, justifyContent: 'center' }}>
          <View style={{ height: 1, backgroundColor: colors.border }} />
        </View>
        <View style={{ gap: m.rowGap }}>
          {rows.map((r, i) => (
            <View key={r.key} style={{ minHeight: rowH(i), justifyContent: 'center' }}>
              {/* Measured apart from the row's minimum, so the row can shrink again when the label does. */}
              <View onLayout={onRow(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: m.glyphGap }}>
                <AiGlyph name={r.key === 'estimates' ? 'estimate' : 'coach'} size={20} color={colors.text} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="label" color="text">
                    {r.label}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {rowUnit(r.key)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
      {column('free')}
      {column('plus')}
    </Card>
  );
}
