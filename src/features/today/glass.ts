/**
 * The one write of a plain glass of water: Today's one-tap glass, the reminder's "+ 250 ml" and the
 * home-screen widget's glass all write this same record through the store (the only writer). Plain
 * water only: no drink choice, no food, no `via`, so it counts in the day's water and never makes a
 * day "logged" (`hasFoodLogged`). No toast and no haptic here: each caller says it its own way.
 */
import { nowISO } from '@/lib/id';
import { useStore } from '@/store';
import type { ISODate, WaterEntry } from '@/types';

export function logPlainGlass(date: ISODate, ml: number): WaterEntry {
  return useStore.getState().upsert('water', { date, ml, beverage: 'water', loggedAt: nowISO() });
}
