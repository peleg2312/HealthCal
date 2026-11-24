/**
 * The words of the estimate's wait: neutral (the morning page's banned list, word for word, and the
 * plan's), no exclamation mark, sentence case, and honest: no percentage, no number that claims a
 * share done, no step that says more than the phone knows.
 */
import { describe, expect, it } from 'vitest';

import { AI_TILE_HINT, ANALYSING, analysingLabel, analysingNote, analysingSteps, slowAfterMs } from './words';

const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
const PLAN = /\b(upgrade|unlock|premium|run out|last chance)\b/i;

function all(): string[] {
  const out: string[] = [...Object.values(ANALYSING), ...Object.values(AI_TILE_HINT)];
  for (const photo of [true, false])
    for (const precise of [true, false]) {
      out.push(...Object.values(analysingSteps(photo, precise)), analysingLabel(photo, precise));
      for (const slow of [true, false]) out.push(analysingNote(precise, slow));
    }
  return out;
}

describe('the words of the wait', () => {
  it('pass the banned lists, with no exclamation mark, in sentence case', () => {
    const bad = all().filter((s) => BANNED.test(s) || PLAN.test(s) || s.includes('!') || !/^[A-Z]/.test(s));
    expect(bad).toEqual([]);
  });

  it('claim no share done: no percentage and no digit anywhere', () => {
    expect(all().filter((s) => /%|percent|\d/.test(s))).toEqual([]);
  });

  it('name the input that is ready, the work, and the review', () => {
    expect(analysingSteps(true, false)).toEqual({ input: 'Photo ready', estimate: 'Estimating each food and its portion', review: 'Nothing is added until you check it' });
    expect(analysingSteps(false, true)).toEqual({ input: 'Description ready', estimate: 'Checking each food more carefully', review: 'Nothing is added until you check it' });
    expect(analysingLabel(true, false)).toBe('Photo ready. Estimating each food and its portion. Nothing is added until you check it.');
  });

  it("the + sheet's AI tiles name the AI, and Describe says what to do", () => {
    expect(AI_TILE_HINT).toEqual({ photo: 'Photo, AI estimate', describe: 'Type it, AI estimate' });
  });

  it('says "still working" after 10 s, or 20 s for the careful check', () => {
    expect(slowAfterMs(false)).toBe(10_000);
    expect(slowAfterMs(true)).toBe(20_000);
    expect(analysingNote(false, false)).toBe('Usually a few seconds.');
    expect(analysingNote(true, false)).toBe('The careful check can take up to half a minute.');
    expect(analysingNote(true, true)).toBe(analysingNote(false, true));
  });
});
