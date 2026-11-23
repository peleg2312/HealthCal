/**
 * The AI coach is for people aged 18 and over (Anthropic's terms for minors; the app accepts 16 and
 * 17 at setup). Asked when Send is tapped, from the profile's date of birth and the day it is then
 * (never at render), and it fails closed: anything that is not a real past date reads as under 18.
 * The server checks the synced profile the same way (coach-chat, `under_18`). Pure.
 */
import type { ISODate } from '@/types';

export const COACH_MIN_AGE = 18;

/** A real calendar date written YYYY-MM-DD, or null. */
function parseDay(s: unknown): { y: number; m: number; d: number } | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return { y, m, d };
}

/** Whole years from `birthDate` to `today`, or null when either is not a real date or birth is not before today. */
export function ageOn(birthDate: unknown, today: ISODate): number | null {
  const b = parseDay(birthDate);
  const t = parseDay(today);
  if (!b || !t) return null;
  if (String(birthDate) >= today) return null;
  let age = t.y - b.y;
  if (t.m < b.m || (t.m === b.m && t.d < b.d)) age -= 1;
  return age;
}

/** May this person ask the AI coach? False for anything that is not a valid past date, and under 18. */
export function coachAgeAllowed(birthDate: unknown, today: ISODate): boolean {
  const age = ageOn(birthDate, today);
  return age !== null && age >= COACH_MIN_AGE && age <= 130;
}
