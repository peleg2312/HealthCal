/**
 * Test-hook builds only (a development build, or EXPO_PUBLIC_E2E) with `window.__healthcalJournalDemo = true`
 * set before the app loads (a state's `flags`): the journal fills itself with photos for the demo diary's
 * meals of the last days, so its grid and its sheet can be looked at and scanned in a browser, where no photo
 * can be taken. The pictures are flat drawings of a plate (an SVG), never a real photo, and nothing is written
 * to the device. A release bundle never reads the flag (`journalDemoOn` answers false there).
 */
import type { FoodEntry, ISODate, MealType } from '@/types';

import type { MealPhoto } from './rules';

declare global {
  interface Window {
    /** Tests: true fills the meal photo journal with drawn demo photos. */
    __healthcalJournalDemo?: boolean;
  }
}

const DEMO_PREFIX = 'demo-photo-';

/** Whether the demo journal is asked for. Never throws. */
export function journalDemoOn(): boolean {
  try {
    // Written out in full: Expo inlines EXPO_PUBLIC_ values only where they appear literally.
    const testBuild = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1';
    return testBuild && typeof window !== 'undefined' && window.__healthcalJournalDemo === true;
  } catch {
    return false;
  }
}

/** One demo photo for each meal with live entries on the `days` latest days up to `today`. */
export function demoPhotos(entries: readonly FoodEntry[], today: ISODate, days: ISODate[]): MealPhoto[] {
  const out: MealPhoto[] = [];
  for (const date of days) {
    if (date > today) continue;
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
      const ids = entries.filter((e) => !e.deleted && e.date === date && e.meal === meal).map((e) => e.id);
      if (ids.length === 0) continue;
      out.push({ id: `${DEMO_PREFIX}${date}-${meal}`, date, meal, entryIds: ids, keptAt: `${date}T12:00:00.000Z`, width: 480, height: 360 });
    }
  }
  return out;
}

export function isDemoPhoto(id: string): boolean {
  return id.startsWith(DEMO_PREFIX);
}

/** A drawn plate for a demo photo: a table, a plate and three foods, their colours varied by the photo's id. */
export function demoPhotoUri(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = (list: string[], n: number) => list[(h >>> n) % list.length];
  const table = pick(['#C9A27E', '#8E9AA6', '#B7A58C', '#A3B18A'], 0);
  const a = pick(['#E8B04A', '#D9773A', '#C8553D', '#F2D06B'], 3);
  const b = pick(['#6E9B3D', '#4F7A2E', '#93B85A', '#3E6B48'], 6);
  const c = pick(['#F3E6C8', '#E6D3A7', '#A0522D', '#D8B48A'], 9);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">` +
    `<rect width="480" height="360" fill="${table}"/>` +
    `<circle cx="240" cy="180" r="150" fill="#F7F5F0"/><circle cx="240" cy="180" r="118" fill="#EFEBE3"/>` +
    `<ellipse cx="200" cy="150" rx="62" ry="44" fill="${a}"/>` +
    `<ellipse cx="290" cy="170" rx="50" ry="40" fill="${b}"/>` +
    `<ellipse cx="230" cy="230" rx="70" ry="34" fill="${c}"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
