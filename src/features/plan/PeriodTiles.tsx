/**
 * Monthly and Yearly as two price tiles, both prices in view at once (ruling D2: the larger charge is
 * never the one chosen at first, and choosing the other is one tap). The chosen tile wears the level
 * line across its top, the mark of every selected thing in the app; nothing else tells them apart:
 * no badge, no crossed-out price, no "best value". Each tile is a radio button.
 *
 * The amount, the currency and the period are the server's (`view.offers`); the tile only formats
 * them. `plan-price` is the testID of the chosen tile's price, so a script reads exactly the price
 * that the button below will charge. With a single offer there is one tile, chosen, with no radio mark.
 *
 * LONG PRICES ("CA$129.90", "CHF 129.90"): the amount is one unbroken run (its currency never parts
 * from its number), and the unit ("a month") goes under it whole when the two do not fit on one line.
 * When an amount alone is wider than a tile beside the other, the two tiles stack, each the full
 * width. The amounts are measured by an unseen sizer (natural width, the same text style), so the
 * choice follows the real font at any text size; until it is measured the tiles stand side by side.
 * The Yearly tile's third line is its monthly equivalent; the Monthly tile keeps that line blank, so
 * the two stay the same height without a line that repeats its price.
 */
import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { NBSP } from '@/lib/text';

import { cup, useTheme } from '@/theme';
import { CupKey, FadeUp, motion, PressableScale, Text } from '@/ui';

import type { PlanOffer, PlanPeriod } from './view';
import { amountText, monthlyEquivalent, tieMoney, periodLabel, priceLine, taxNote, tileLabel, unitText } from './words';

/** A tile's padding and border: what a tile beside the other leaves for its amount. */
const PAD = 14;
const EDGE = 1;

export function PeriodTiles({ offers, value, onChange }: { offers: PlanOffer[]; value: PlanPeriod; onChange: (p: PlanPeriod) => void }) {
  const { spacing } = useTheme();
  const [rowW, setRowW] = useState(0);
  const [amountW, setAmountW] = useState<Partial<Record<PlanPeriod, number>>>({});
  const list = (['month', 'year'] as const).map((p) => offers.find((o) => o.period === p)).filter((o): o is PlanOffer => !!o);
  if (!list.length) return null;
  const single = list.length === 1;
  // Room for an amount in a tile beside the other; the widest amount decides for both.
  const room = (rowW - spacing.sm) / 2 - 2 * (PAD + EDGE);
  const widest = Math.max(0, ...list.map((o) => amountW[o.period] ?? 0));
  const stack = !single && rowW > 0 && widest > room;
  const onRow = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== rowW) setRowW(w);
  };
  const onAmount = (p: PlanPeriod) => (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setAmountW((was) => (was[p] === w ? was : { ...was, [p]: w }));
  };
  return (
    <View onLayout={onRow} accessibilityRole={single ? undefined : 'radiogroup'} style={{ flexDirection: stack ? 'column' : 'row', alignItems: 'stretch', gap: spacing.sm }}>
      {list.map((o) => (
        <Tile key={o.period} offer={o} selected={single || o.period === value} single={single} onPress={() => onChange(o.period)} />
      ))}
      {/* The unseen sizer: each amount at its natural width, in the amount's own text style. Never drawn, never read. */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 }}>
        <View style={{ width: 480, alignItems: 'flex-start' }}>
          {list.map((o) => (
            <Text key={o.period} variant="numM" numberOfLines={1} onLayout={onAmount(o.period)}>
              {amountText(o)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function Tile({ offer, selected, single, onPress }: { offer: PlanOffer; selected: boolean; single: boolean; onPress: () => void }) {
  const { colors, radius } = useTheme();
  // The Monthly tile's third line is blank (a no-break space keeps its height): its price is already said.
  const note = tieMoney(monthlyEquivalent(offer)) ?? NBSP;
  const frame = {
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    padding: PAD,
    gap: 4,
    ...cup(radius.card),
    borderWidth: EDGE,
    borderColor: selected ? colors.borderStrong : colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden' as const,
  };
  const content = (
    <>
      {/* The signature: the level line across the chosen tile's top. It fades in; the tile never changes size. */}
      {selected ? (
        <FadeUp distance={0} duration={motion.duration.fade} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.rim }} />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {single ? null : <CupKey size={10} color={selected ? colors.primary : colors.textSecondary} variant={selected ? 'filled' : 'outline'} />}
        <Text variant="label" color={selected ? 'text' : 'textSecondary'}>
          {periodLabel(offer.period)}
        </Text>
      </View>
      {/* The chosen price: what the button below charges. One sentence for a screen reader on a single tile; on a radio the tile's own label says it. */}
      {/* The amount never breaks; the unit goes under it whole when the two do not fit on one line. */}
      <View
        testID={selected ? 'plan-price' : undefined}
        accessible={single}
        accessibilityLabel={single ? [priceLine(offer), monthlyEquivalent(offer), taxNote(offer)].filter(Boolean).join('. ') : undefined}
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 4 }}>
        <Text variant="numM">{amountText(offer)}</Text>
        <Text variant="unit">{unitText(offer.period)}</Text>
      </View>
      <Text variant="caption" color="textSecondary">
        {note}
      </Text>
    </>
  );
  if (single) return <View style={frame}>{content}</View>;
  return (
    <PressableScale
      testID={`plan-period-${offer.period}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={tileLabel(offer, selected)}
      scaleTo={0.985}
      feedback="select"
      onPress={onPress}
      style={frame}>
      {content}
    </PressableScale>
  );
}
