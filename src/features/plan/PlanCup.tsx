/**
 * The plan's own cup: the day's AI allowance poured into the kit's open tumbler. One fill colour
 * everywhere the allowance is drawn (the comparison table, the membership card, the two limit
 * messages): the AI family's own tint (`aiMarkFill`, @/features/ai/mark), so the allowance looks like
 * the AI it stands for, with the kit's `rim` level line on top. It is the allowance, not the AI
 * speaking, so it never carries the AI mark's drop.
 *
 * - `hero` (44 x 56, the kit's `Vessel`): the membership card. A goal that is reached: brim-full it
 *   wears the brim line, and crossing it on screen is the kit's one flash (`onReached`).
 * - `row` (24 x 30, a `MiniCup`): a cell of the comparison table, and the used-up cup at the estimate's limit.
 * - `small` (16 x 20): beside the coach's limit notice.
 *
 * `goalKind` is 'reach' for what Plus gives (full is the whole allowance) and 'limit' where the cup
 * shows an allowance that is used up (full, never amber, no brim line: nothing was reached). A full
 * limit cup stands a hair under its open top (`fullLevel`), so its whole level line shows across the
 * top of the fill, inside the walls, as the kit draws any cup with room above its level; at exactly
 * the top the kit's open cup clips half the line away and the cup reads as a flat block.
 * Decorative: the figures beside it carry the meaning, so it is hidden from screen readers.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { aiMarkFill } from '@/features/ai/mark';
import { useTheme } from '@/theme';
import { MiniCup, Vessel, type GoalKind } from '@/ui';

export type PlanCupSize = 'hero' | 'row' | 'small';

const SIZES: Record<PlanCupSize, { width: number; height: number }> = {
  hero: { width: 44, height: 56 },
  row: { width: 24, height: 30 },
  small: { width: 16, height: 20 },
};

/** The kit's cup outline (src/ui/Vessel.tsx) and its level line: 3 px on a Vessel, 2.5 px on a MiniCup. */
const EDGE = 1.5;
const RIM: Record<PlanCupSize, number> = { hero: 3, row: 2.5, small: 2.5 };

/** A full limit cup's level: the level line's centre half its thickness under the open top, so all of it shows. */
export function fullLevel(size: PlanCupSize): number {
  return 1 - RIM[size] / 2 / (SIZES[size].height - EDGE);
}

/** The allowance's fill colour in this look. */
export function useAllowanceFill(): string {
  const { colors, chartFill } = useTheme();
  return aiMarkFill(colors, chartFill).color;
}

export function PlanCup({
  size,
  level = 1,
  goalKind = 'reach',
  animate = true,
  index = 0,
  onReached,
  memoryKey,
  testID,
  style,
}: {
  size: PlanCupSize;
  /** 0..1 of the cup; 1 is the whole allowance. */
  level?: number;
  goalKind?: GoalKind;
  /** Pour on mount and on change (default). False jumps to the level. */
  animate?: boolean;
  /** Position in a row or a table, for the kit's left-to-right stagger (`row` and `small`). */
  index?: number;
  /** `reach` only: once, when the level crosses the brim while the cup is on screen. */
  onReached?: () => void;
  /** Remember the level for this session, so a return to the page does not pour again. */
  memoryKey?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = useAllowanceFill();
  const s = SIZES[size];
  // A used-up allowance is a full limit cup: its level line shows inside the walls.
  const shown = goalKind === 'limit' && level >= 1 ? fullLevel(size) : level;
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={style}>
      {size === 'hero' ? (
        <Vessel value={shown} max={1} goalKind={goalKind} color={fill} width={s.width} height={s.height} animate={animate} memoryKey={memoryKey} onReached={onReached} />
      ) : (
        <MiniCup progress={shown} goalKind={goalKind} color={fill} width={s.width} height={s.height} animate={animate} index={index} memoryKey={memoryKey} onReached={onReached} />
      )}
    </View>
  );
}
