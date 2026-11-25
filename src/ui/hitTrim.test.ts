import { describe, expect, it } from 'vitest';

import { fieldTextBox, trimSlop } from './hitTrim';

const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });

describe('trimSlop', () => {
  it('leaves a slop that reaches no other control as it is', () => {
    const slop = { top: 8, right: 8, bottom: 8, left: 8 };
    expect(trimSlop(box(100, 100, 32, 32), slop, [box(200, 100, 32, 32), box(100, 200, 32, 32)])).toEqual(slop);
  });

  it('stops at a neighbour beside it: two chips 2 px apart each reach 2 px, never into the other', () => {
    const slop = { top: 6, right: 6, bottom: 6, left: 6 };
    const a = box(20, 100, 60, 36);
    const b = box(82, 100, 60, 36);
    expect(trimSlop(a, slop, [b])).toEqual({ top: 6, right: 2, bottom: 6, left: 6 });
    expect(trimSlop(b, slop, [a])).toEqual({ top: 6, right: 6, bottom: 6, left: 2 });
  });

  it('stops at a control right above it: the week strip\'s calendar cup under Sunday', () => {
    const day = box(300, 100, 45, 92);
    const pick = box(304, 192, 32, 32);
    expect(trimSlop(pick, { top: 8, right: 8, bottom: 8, left: 8 }, [day])).toEqual({ top: 0, right: 8, bottom: 8, left: 8 });
  });

  it('cuts a neighbour off a corner on the side that loses less', () => {
    const own = box(0, 0, 100, 20);
    // Below and to the right: cutting the bottom (100 px wide) loses more than cutting the right (20 px tall).
    expect(trimSlop(own, { top: 8, right: 8, bottom: 8, left: 8 }, [box(104, 24, 40, 40)])).toEqual({ top: 8, right: 4, bottom: 8, left: 8 });
  });

  it('leaves alone a box that overlaps its own (layout, not reach) and empty boxes', () => {
    const slop = { top: 4, right: 4, bottom: 4, left: 4 };
    expect(trimSlop(box(0, 0, 40, 40), slop, [box(30, 30, 40, 40), box(42, 0, 0, 40)])).toEqual(slop);
  });

  it("keeps a field's own button at 44 px: food search's clear X reaches into the input's padding, never its text", () => {
    // 360 px: the input fills the cup up to the X (21.5..293, its last 10 px padding), the 32 px X sits at 293..325.
    const input = { left: 21.5, top: 108.5, right: 293, bottom: 155.5 };
    const clear = box(293, 116, 32, 32);
    const slop = { top: 6, right: 6, bottom: 6, left: 6 };
    // Against the input's whole box the X lost its left reach (38 px to touch).
    expect(trimSlop(clear, slop, [input])).toEqual({ top: 6, right: 6, bottom: 6, left: 0 });
    // Against where the text goes, it keeps all four sides (44 x 44), and stops 4 px short of the text.
    const text = fieldTextBox(input, { left: 46, right: 10 });
    expect(text).toEqual({ left: 67.5, top: 108.5, right: 283, bottom: 155.5 });
    expect(trimSlop(clear, slop, [text])).toEqual(slop);
    // A padding narrower than the reach: the reach stops at the text.
    expect(trimSlop(clear, slop, [fieldTextBox(input, { left: 14, right: 4 })])).toEqual({ ...slop, left: 4 });
  });

  it('keeps the whole box of an input whose padding would leave no room for text', () => {
    const input = box(0, 0, 40, 50);
    expect(fieldTextBox(input, { left: 30, right: 20 })).toEqual(input);
    expect(fieldTextBox(input, { left: -5, right: Number.NaN })).toEqual(input);
  });
});
