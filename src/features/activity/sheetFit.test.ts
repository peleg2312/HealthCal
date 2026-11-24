/**
 * How the overview sheet sits in its window (sheetFit.ts): what the chart gives or takes for a
 * measured body, the step the sheet takes after each layout, and what is read from a host element.
 */
import { describe, expect, it } from 'vitest';

import { ACTION_ROOM_PX, chartChange, CLEAR_BY_PX, FITS_PX, GROW_MAX_PX, nextChange, readFit, SHRINK_MAX_PX, SLIVER_PX, type SheetMeasure } from './sheetFit';

const VIEW = 572;
const body = (hidden: number, action: SheetMeasure['action'] = null, viewport = VIEW): SheetMeasure => ({ height: viewport + hidden, viewport, action });

describe('chartChange', () => {
  it('changes nothing when the content fits, also by a hair over (rounding)', () => {
    expect(chartChange(body(-172))).toBe(0);
    expect(chartChange(body(0))).toBe(0);
    expect(chartChange(body(0.4))).toBe(0);
  });
  it('gives height back when a little does it: the body then fits and nothing scrolls', () => {
    // 2 px over (the "more" state at 360 x 740) is not left to scroll by a line's descenders.
    expect(chartChange(body(2))).toBe(-2);
    expect(chartChange(body(0.6))).toBe(-1);
    expect(chartChange(body(3))).toBe(-3);
    expect(chartChange(body(23))).toBe(-23);
    expect(chartChange(body(30))).toBe(-30);
    expect(chartChange(body(SHRINK_MAX_PX))).toBe(-SHRINK_MAX_PX);
    // Rounded so the body is never left a fraction too tall.
    expect(chartChange(body(22.4))).toBe(-23);
    for (let hidden = 1; hidden <= SHRINK_MAX_PX; hidden++) expect(hidden + chartChange(body(hidden))).toBeLessThanOrEqual(0);
  });
  it('takes a sliver to 88 px hidden when 48 px or less does it', () => {
    expect(chartChange(body(48))).toBe(40);
    expect(chartChange(body(66))).toBe(22);
    expect(chartChange(body(65, null, 484))).toBe(23);
    for (let hidden = 40; hidden <= SLIVER_PX; hidden++) expect(hidden + chartChange(body(hidden))).toBe(SLIVER_PX + CLEAR_BY_PX);
    // Rounded up, so the hidden part is never under the target.
    expect(chartChange(body(48.4))).toBe(40);
    expect(48.4 + chartChange(body(48.4))).toBeGreaterThanOrEqual(SLIVER_PX + CLEAR_BY_PX);
  });
  it('never grows the chart by more than 48 px or takes more than 32 px, whatever is measured', () => {
    for (let hidden = -40; hidden <= 400; hidden++) {
      for (const top of [null, 300, 500, 520, 540, 560, 571, 572, 600]) {
        const change = chartChange(body(hidden, top === null ? null : { top, bottom: top + 48 }));
        expect(change).toBeLessThanOrEqual(GROW_MAX_PX);
        expect(change).toBeGreaterThanOrEqual(-SHRINK_MAX_PX);
      }
    }
  });
  it('leaves the body to scroll where neither cures it: between 32 and 40 px hidden', () => {
    for (let hidden = SHRINK_MAX_PX + 1; hidden < SLIVER_PX + CLEAR_BY_PX - GROW_MAX_PX; hidden++) expect(chartChange(body(hidden))).toBe(0);
    expect(chartChange(body(39))).toBe(0);
    expect(chartChange(body(40))).toBe(48);
  });
  it('leaves a body that already clearly scrolls, with its action in view or under the fold', () => {
    expect(chartChange(body(81))).toBe(0);
    expect(chartChange(body(400))).toBe(0);
    expect(chartChange(body(250, { top: 400, bottom: 448 }))).toBe(0);
    expect(chartChange(body(250, { top: VIEW - 48 - ACTION_ROOM_PX, bottom: VIEW - ACTION_ROOM_PX }))).toBe(0);
    expect(chartChange(body(250, { top: VIEW, bottom: VIEW + 48 }))).toBe(0);
    expect(chartChange(body(250, { top: VIEW + 30, bottom: VIEW + 78 }))).toBe(0);
  });
  it('brings an action cut by the fold whole into the first view, with 8 px under it, when 32 px or less does it', () => {
    // 16 px of the button under the edge.
    expect(chartChange(body(250, { top: VIEW - 32, bottom: VIEW + 16 }))).toBe(-24);
    expect(chartChange(body(250, { top: VIEW - 24, bottom: VIEW + 24 }))).toBe(-32);
    // Whole but against the edge: given its room.
    expect(chartChange(body(250, { top: VIEW - 50, bottom: VIEW - 2 }))).toBe(-6);
  });
  it('else puts it wholly under the fold', () => {
    expect(chartChange(body(250, { top: VIEW - 23, bottom: VIEW + 25 }))).toBe(23);
    expect(chartChange(body(250, { top: VIEW - 1, bottom: VIEW + 47 }))).toBe(1);
    // Giving height back would leave a sliver: under the fold instead.
    expect(chartChange(body(90, { top: VIEW - 40, bottom: VIEW + 8 }))).toBe(40);
  });
  it('an action of a button\'s height is never left cut: every place across the fold is cured one way or the other', () => {
    for (let top = VIEW - 60; top <= VIEW + 10; top++) {
      const action = { top, bottom: top + 48 };
      const change = chartChange(body(250, action));
      const after = { top: action.top + change, bottom: action.bottom + change };
      const whole = after.bottom <= VIEW;
      const under = after.top >= VIEW;
      expect(whole || under, `top ${top}, change ${change}`).toBe(true);
    }
  });
  it('changes nothing without real measurements', () => {
    expect(chartChange({ height: 0, viewport: VIEW, action: null })).toBe(0);
    expect(chartChange({ height: 600, viewport: 0, action: null })).toBe(0);
    expect(chartChange({ height: Number.NaN, viewport: VIEW, action: null })).toBe(0);
    expect(chartChange(body(250, { top: 600, bottom: 600 }))).toBe(0);
  });
});

describe('nextChange, applied the way the sheet does', () => {
  // The sheet draws the chart `change` px taller, which moves everything under the chart by as much;
  // then its layout fires and it asks again with what it now measures and what it drew.
  const draw = (natural: SheetMeasure, change: number): SheetMeasure => ({
    height: natural.height + change,
    viewport: natural.viewport,
    action: natural.action ? { top: natural.action.top + change, bottom: natural.action.bottom + change } : null,
  });
  const settle = (natural: SheetMeasure) => {
    const first = nextChange(draw(natural, 0), 0);
    const second = nextChange(draw(natural, first), first);
    const third = nextChange(draw(natural, second), second);
    return { first, second, third };
  };

  it('settles in one step and stays there, for every body from one that fits to one that scrolls far', () => {
    for (let hidden = -40; hidden <= 320; hidden++) {
      // The action 150 px above the end of the body, as the fine print under it is.
      const natural = body(hidden, { top: VIEW + hidden - 198, bottom: VIEW + hidden - 150 });
      const { first, second, third } = settle(natural);
      expect(second, `hidden ${hidden}`).toBe(first);
      expect(third, `hidden ${hidden}`).toBe(first);
    }
  });
  it('the second layout keeps a stretch: 48 px hidden gets 40, and with the 40 drawn it is 40 again, not 0', () => {
    const natural = body(48);
    expect(nextChange(draw(natural, 0), 0)).toBe(40);
    // Asked about what is drawn without taking the 40 off, the rule would see 88 px hidden and answer 0: the loop this guards against.
    expect(chartChange(draw(natural, 40))).toBe(0);
    expect(nextChange(draw(natural, 40), 40)).toBe(40);
  });
  it('the second layout keeps what was given back: 23 px hidden loses 23, and drawn that way it is 23 again', () => {
    const natural = body(23);
    expect(nextChange(draw(natural, 0), 0)).toBe(-23);
    expect(chartChange(draw(natural, -23))).toBe(0);
    expect(nextChange(draw(natural, -23), -23)).toBe(-23);
  });
  it('takes a stretch back when the window grows, and gives one when it shrinks', () => {
    const natural = body(48);
    const drawn = draw(natural, 40);
    // The same body in a window 100 px taller: everything fits, nothing is added.
    expect(nextChange({ ...drawn, viewport: VIEW + 100 }, 40)).toBe(0);
    // In a window 20 px shorter it scrolls by 68: 20 px clear it.
    expect(nextChange({ ...drawn, viewport: VIEW - 20 }, 40)).toBe(20);
  });
  it('what is drawn after the step is what the rule promises', () => {
    for (let hidden = -40; hidden <= 320; hidden++) {
      const natural = body(hidden, { top: VIEW + hidden - 198, bottom: VIEW + hidden - 150 });
      const change = nextChange(draw(natural, 0), 0);
      const after = draw(natural, change);
      const left = after.height - after.viewport;
      const curable = hidden <= SHRINK_MAX_PX || hidden >= SLIVER_PX + CLEAR_BY_PX - GROW_MAX_PX;
      // It fits, or it clearly scrolls: never a sliver.
      if (curable) expect(left <= FITS_PX || left > SLIVER_PX, `hidden ${hidden} left ${left}`).toBe(true);
      else expect(change).toBe(0);
      if (after.action) expect(after.action.bottom <= after.viewport || after.action.top >= after.viewport, `hidden ${hidden}`).toBe(true);
    }
  });
});

describe('readFit', () => {
  const host = (height: number, viewport: number | undefined, top = 100) => ({
    getBoundingClientRect: () => ({ top, bottom: top + height, height }),
    parentElement: { parentElement: viewport === undefined ? {} : { clientHeight: viewport } },
  });
  const box = (top: number, bottom: number) => ({ getBoundingClientRect: () => ({ top, bottom, height: bottom - top }) });
  it("reads the content's height and the scroller's visible height (the parent of its parent)", () => {
    expect(readFit(host(620, 572))).toEqual({ height: 620, viewport: 572, action: null });
  });
  it("reads the action's edges from the content's top, wherever the sheet is on screen", () => {
    expect(readFit(host(620, 572, 100), box(500, 548))).toEqual({ height: 620, viewport: 572, action: { top: 400, bottom: 448 } });
    // The sheet still sliding in (everything 300 px lower) or scrolled (the content 80 px higher): the same edges.
    expect(readFit(host(620, 572, 400), box(800, 848))?.action).toEqual({ top: 400, bottom: 448 });
    expect(readFit(host(620, 572, 20), box(420, 468))?.action).toEqual({ top: 400, bottom: 448 });
  });
  it('leaves out an action that cannot say', () => {
    expect(readFit(host(620, 572), null)?.action).toBeNull();
    expect(readFit(host(620, 572), {})?.action).toBeNull();
    expect(readFit(host(620, 572), box(500, 500))?.action).toBeNull();
  });
  it('answers null when the element cannot say', () => {
    expect(readFit(null)).toBeNull();
    expect(readFit({})).toBeNull();
    expect(readFit(host(0, 572))).toBeNull();
    expect(readFit(host(620, 0))).toBeNull();
    expect(readFit(host(620, undefined))).toBeNull();
    expect(readFit({ getBoundingClientRect: () => ({ height: 620 }), parentElement: null })).toBeNull();
  });
});
