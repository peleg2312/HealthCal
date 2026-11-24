import { describe, expect, it } from 'vitest';

import { TARGET_CARE_NOTE } from './careNote';

describe('the line where targets are set', () => {
  it('says plainly it is not medical advice and to check with a doctor', () => {
    expect(TARGET_CARE_NOTE).toMatch(/not medical advice/);
    expect(TARGET_CARE_NOTE).toMatch(/check with a doctor/);
  });

  it('stays neutral: no alarm words and no exclamation mark', () => {
    expect(TARGET_CARE_NOTE).not.toMatch(/!|\b(warning|danger|must|should|never|bad|fail)\b/i);
  });
});
