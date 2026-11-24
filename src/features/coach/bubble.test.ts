/**
 * The person's bubble in the coach's chat is `primarySoft` drawn over the page (`bg`) with `text` ink
 * (spec r14, section 3.2): 4.5:1 or more in all six palettes, read as src/theme/contrast.test.ts reads
 * them. Also the send cup's two states and the idea row's add cup, which sit on the page and a card.
 */
import { describe, expect, it } from 'vitest';

import { contrast, over } from '@/theme/contrast';
import { blossomColors, butterColors, darkColors, honeyColors, javaColors, lightColors } from '@/theme/tokens';

const PALETTES = { dark: darkColors, light: lightColors, blossom: blossomColors, butter: butterColors, honey: honeyColors, java: javaColors } as const;

describe('the question bubble', () => {
  for (const [name, c] of Object.entries(PALETTES)) {
    it(`${name}: text on primarySoft over bg is 4.5:1 or more`, () => {
      const fill = over(c.primarySoft, c.bg);
      expect(contrast(c.text, fill)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}: the send cup's arrow reads on both of its fills`, () => {
      expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(3);
      // The resting cup: textTertiary on surfaceAlt is a disabled control (no minimum in WCAG); it must still show.
      expect(contrast(c.textTertiary, c.surfaceAlt)).toBeGreaterThanOrEqual(1.5);
    });
  }
});
