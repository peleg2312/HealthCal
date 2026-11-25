/** The widget's cup follows the kit's cup rules: open top, round base, amber cap only past a budget, the brim line only at a goal reached. */
import { describe, expect, it } from 'vitest';

import { lightColors } from '@/theme/tokens';

import { CUP_TOP, cupBox, cupSvg, type CupSpec } from './cup';

const colors = { fill: lightColors.calories, empty: lightColors.vesselEmpty, edge: lightColors.vesselEdge, rim: lightColors.rim, headroom: lightColors.headroom, warning: lightColors.warning };
const spec = (o: Partial<CupSpec>): CupSpec => ({ width: 30, height: 60, value: 0, max: 2000, kind: 'limit', colors, ...o });
const rects = (svg: string) => [...svg.matchAll(/<rect ([^>]*)\/>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])));

describe('cupSvg', () => {
  it('an empty cup: the empty colour inside, the outline, no fill and no level line', () => {
    const svg = cupSvg(spec({ value: 0 }));
    expect(svg).toContain(`fill="${lightColors.vesselEmpty}"`);
    expect(svg).toContain(`stroke="${lightColors.vesselEdge}"`);
    expect(rects(svg)).toHaveLength(0);
  });

  it('the outline leaves the top open', () => {
    const svg = cupSvg(spec({ value: 1000 }));
    const outline = svg.match(/<path d="(M[^"]*)" fill="none"/)![1];
    // It starts at the top of one side and ends at the top of the other: no line across the top.
    expect(outline.startsWith(`M${0.75 + 3},${CUP_TOP}`)).toBe(true);
    expect(outline.endsWith(`V${CUP_TOP}`)).toBe(true);
  });

  it('half eaten: the fill from the base to half way, the level line on it, no cap', () => {
    const [fill, rim] = rects(cupSvg(spec({ value: 1000 })));
    expect(fill.fill).toBe(lightColors.calories);
    expect(Number(fill.y)).toBeCloseTo(CUP_TOP + 30, 5);
    expect(rim.fill).toBe(lightColors.rim);
    expect(Number(rim.height)).toBe(3);
    expect(cupSvg(spec({ value: 1000 }))).not.toContain(lightColors.warning);
  });

  it('above the budget: the amber cap across the cup at its own width, never past its walls', () => {
    const svg = cupSvg(spec({ value: 2300 }));
    const cap = rects(svg).find((r) => r.fill === lightColors.warning)!;
    expect(Number(cap.x)).toBe(3);
    expect(Number(cap.width)).toBe(30);
  });

  it('workouts in the budget: hatched headroom at the top above a dashed line', () => {
    const svg = cupSvg(spec({ value: 500, max: 2400, headroom: 400 }));
    expect(svg).toContain(`stroke="${lightColors.headroom}"`);
    expect(svg).toContain('stroke-dasharray="3 3"');
  });

  it('a goal reached: brim-full with the brim line wider than the cup and heavier; never amber', () => {
    const water = { ...colors, fill: lightColors.water };
    const svg = cupSvg({ width: 22, height: 30, value: 3400, max: 3300, kind: 'reach', colors: water });
    const brim = rects(svg).find((r) => r.fill === lightColors.rim)!;
    expect(Number(brim.width)).toBe(cupBox(22, 30).width);
    expect(Number(brim.height)).toBeGreaterThan(2.5);
    expect(svg).not.toContain(lightColors.warning);
    // Just under the goal: the level line inside the cup, no brim.
    const under = rects(cupSvg({ width: 22, height: 30, value: 3200, max: 3300, kind: 'reach', colors: water })).find((r) => r.fill === lightColors.rim)!;
    expect(Number(under.width)).toBe(22);
  });

  it('is drawn at the size it is shown, in pixels', () => {
    const svg = cupSvg(spec({ value: 1000, density: 2.625 }));
    expect(svg).toMatch(/^<svg [^>]*width="94.5" height="168" viewBox="0 0 36 64"/);
  });
});
