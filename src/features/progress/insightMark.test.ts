import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ABOVE_LIMIT_INSIGHTS, insightMark } from './insightMark';

/** Every insight id written with tone 'attention' in @/lib/insights. */
function attentionIds(): string[] {
  const src = readFileSync(join(__dirname, '../../lib/insights.ts'), 'utf8');
  const ids: string[] = [];
  const re = /id: '([a-z-]+)',\s*tone: 'attention'/g;
  for (let m = re.exec(src); m; m = re.exec(src)) ids.push(m[1]);
  return ids;
}

describe('insightMark', () => {
  it('draws amber only for a value above its limit', () => {
    expect(insightMark({ id: 'calories-above', tone: 'attention' })).toBe('above');
    expect(insightMark({ id: 'pace-too-fast', tone: 'attention' })).toBe('above');
  });

  it('draws a below-goal or gap finding in a neutral ink, never amber', () => {
    for (const id of ['water-low', 'protein-low', 'fiber-low', 'calories-well-under', 'activity-low', 'sleep-short', 'logging-gaps']) {
      expect(insightMark({ id, tone: 'attention' })).toBe('act');
    }
  });

  it('gives a positive finding the sprout and a neutral one the info mark', () => {
    expect(insightMark({ id: 'calories-on-budget', tone: 'positive' })).toBe('sprout');
    expect(insightMark({ id: 'anything', tone: 'neutral' })).toBe('info');
  });

  it('knows every attention insight there is, and names only real ones as above a limit', () => {
    const ids = attentionIds();
    expect(ids.length).toBeGreaterThanOrEqual(9);
    for (const id of ABOVE_LIMIT_INSIGHTS) expect(ids).toContain(id);
    // A new attention insight is neutral unless it is added to ABOVE_LIMIT_INSIGHTS on purpose.
    const above = ids.filter((id) => insightMark({ id, tone: 'attention' }) === 'above');
    expect(above.sort()).toEqual(['calories-above', 'pace-too-fast']);
  });
});
