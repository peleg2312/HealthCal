/**
 * The water cup poured in layers, one colour per kind of drink (the Water screen's hero, `LayeredVessel`).
 * Pure: no React, no store.
 *
 * - The day's drinks are poured in the order they were logged (`DaySummary.waterEntries` is sorted by
 *   `loggedAt`), oldest at the bottom and the newest on top, so the last drink is the layer under the level
 *   line. Drinks of one kind in a row are one layer (three glasses of water after each other are one band).
 * - Each layer counts what its drinks count toward the goal (`effectiveMl`: coffee at 90%), as the total
 *   does, so the layers add up to the level the cup shows.
 * - Under the goal the layers fill the cup to the share of the goal drunk; at or past it the cup is
 *   brim-full and every layer keeps its share of what was drunk, so the newest still shows on top.
 * - The key under the cup names each kind with what it counts, largest first, and shows only when the day
 *   holds two kinds or more (one kind is the cup's own colour and its "drunk" figure already).
 */
import { BEVERAGE_LABELS, effectiveMl } from '@/lib/hydration';
import { formatVolume } from '@/lib/units';
import type { ThemeColors } from '@/theme/tokens';
import type { Beverage, UnitSystem, WaterEntry } from '@/types';

import { spokenVolume } from './rules';

/** The theme colour each kind is poured in: plain water in `water`, every other kind in its own token. */
export const DRINK_LAYER_COLOR: Record<Beverage, keyof ThemeColors> = {
  water: 'water',
  tea: 'drinkTea',
  coffee: 'drinkCoffee',
  milk: 'drinkMilk',
  juice: 'drinkJuice',
  sports: 'drinkSports',
  other: 'drinkOther',
};

export interface DrinkLayer {
  /** Stable while drinks are added on top: the id of the layer's first drink. */
  key: string;
  kind: Beverage;
  /** What the layer counts toward the goal, in ml (not rounded). */
  ml: number;
  /** The layer's bottom and top as shares of the cup's inside height, 0 (the base) to 1 (the brim). */
  from: number;
  to: number;
}

type Poured = Pick<WaterEntry, 'id' | 'ml' | 'beverage'>;

/** The day's drinks as layers in a cup whose brim is `goalMl`. Nothing to pour, or no goal: no layers. */
export function drinkLayers(entries: readonly Poured[], goalMl: number): DrinkLayer[] {
  const runs: { key: string; kind: Beverage; ml: number }[] = [];
  for (const e of entries) {
    const ml = effectiveMl(e.ml, e.beverage);
    if (!(ml > 0)) continue;
    const last = runs[runs.length - 1];
    if (last && last.kind === e.beverage) last.ml += ml;
    else runs.push({ key: e.id, kind: e.beverage, ml });
  }
  const total = runs.reduce((n, r) => n + r.ml, 0);
  const scale = Math.max(goalMl, total);
  if (!(goalMl > 0) || !(total > 0)) return [];
  let at = 0;
  return runs.map((r) => {
    const from = at;
    at += r.ml;
    return { ...r, from: from / scale, to: Math.min(1, at / scale) };
  });
}

export interface DrinkKeyItem {
  kind: Beverage;
  /** What the kind counts toward the goal today, in whole ml. */
  ml: number;
}

/** What each kind counts, largest first (the first poured first when two count the same). */
export function drinkKey(entries: readonly Poured[]): DrinkKeyItem[] {
  const order: Beverage[] = [];
  const sums = new Map<Beverage, number>();
  for (const e of entries) {
    const ml = effectiveMl(e.ml, e.beverage);
    if (!(ml > 0)) continue;
    if (!sums.has(e.beverage)) order.push(e.beverage);
    sums.set(e.beverage, (sums.get(e.beverage) ?? 0) + ml);
  }
  return order
    .map((kind, i) => ({ kind, ml: Math.round(sums.get(kind) ?? 0), i }))
    .sort((a, b) => b.ml - a.ml || a.i - b.i)
    .map(({ kind, ml }) => ({ kind, ml }));
}

/** Whether the key is drawn: two kinds or more. */
export function showDrinkKey(key: readonly DrinkKeyItem[]): boolean {
  return key.length >= 2;
}

/** One item of the key as drawn: "Coffee 225 ml". */
export function drinkKeyText(item: DrinkKeyItem, units: UnitSystem): string {
  return `${BEVERAGE_LABELS[item.kind].label} ${formatVolume(item.ml, units)}`;
}

/** The key as a screen reader hears it, in one sentence: "In the cup: water 1.25 litres, coffee 225 millilitres." */
export function drinkKeySpoken(key: readonly DrinkKeyItem[], units: UnitSystem): string {
  const parts = key.map((k) => `${BEVERAGE_LABELS[k.kind].label.toLowerCase()} ${spokenVolume(formatVolume(k.ml, units))}`);
  return `In the cup: ${parts.join(', ')}.`;
}
