import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID, searchActivities } from './activities';
import { ACTIVITY_NAMES_HE } from './activityNamesHe';

const first = (q: string) => searchActivities(q)[0]?.id;

describe('searchActivities in Hebrew', () => {
  it('finds running for ריצה and swimming for שחיה, first', () => {
    expect(first('ריצה')).toBe('running');
    expect(first('שחיה')).toBe('swimming');
    expect(first('שחייה')).toBe('swimming');
  });

  it("finds each activity first by its first Hebrew name", () => {
    const wrong: string[] = [];
    for (const [id, names] of Object.entries(ACTIVITY_NAMES_HE)) {
      expect(ACTIVITY_BY_ID[id], id).toBeDefined();
      if (first(names[0]) !== id) wrong.push(`${names[0]}: ${first(names[0])} != ${id}`);
    }
    expect(wrong).toEqual([]);
  });

  it('folds what is typed: vowel points, final letters, geresh, spaces around', () => {
    expect(first(' ר\u05b4יצ\u05b8ה ')).toBe('running');
    expect(first('ריצ')).toBe('running');
    expect(searchActivities('ריצ').map((a) => a.id)).toContain('trail_running');
  });

  it('finds nothing for a Hebrew word no activity has, and never throws', () => {
    expect(searchActivities('קקקקק')).toEqual([]);
    for (const q of ['ה', '\u05f3', '🏃', 'حمص', 'ריצה run', '\u200e']) expect(() => searchActivities(q)).not.toThrow();
  });

  it('leaves English as it was', () => {
    expect(first('run')).toBe('running');
    expect(searchActivities('SWIM')[0].name.toLowerCase().startsWith('swim')).toBe(true);
    expect(searchActivities('mtb').some((a) => a.id === 'mountain_biking')).toBe(true);
    expect(searchActivities('zzzz')).toEqual([]);
  });
});
