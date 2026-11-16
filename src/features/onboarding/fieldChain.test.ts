import { describe, expect, it } from 'vitest';

import { FOCUS_GRACE_MS, inHand, nextEmptyField } from './fieldChain';

describe('nextEmptyField', () => {
  it('goes to the first empty field after the one in hand', () => {
    // Height typed, weight empty: Continue means "weight next".
    expect(nextEmptyField(0, [false, true])).toBe(1);
    expect(nextEmptyField(0, [false, true, true])).toBe(1);
    expect(nextEmptyField(1, [false, false, true])).toBe(2);
  });
  it('comes back to an empty field before it when nothing after is empty', () => {
    // Weight typed first, height skipped.
    expect(nextEmptyField(1, [true, false])).toBe(0);
    expect(nextEmptyField(2, [false, true, false])).toBe(1);
  });
  it('has nowhere to go when every other field is filled', () => {
    expect(nextEmptyField(1, [false, false])).toBeNull();
    // The field in hand is the empty one: Continue checks the step and says so.
    expect(nextEmptyField(1, [false, true])).toBeNull();
    expect(nextEmptyField(0, [true])).toBeNull();
  });
  it('ignores a field that is not on the step', () => {
    expect(nextEmptyField(-1, [true, true])).toBeNull();
    expect(nextEmptyField(5, [true, true])).toBeNull();
  });
});

describe('inHand', () => {
  it('is the field with the focus', () => {
    expect(inHand({ index: 0, on: true, at: 0 }, 1_000_000)).toBe(true);
  });
  it('is still the field that lost the focus to the tap on Continue', () => {
    expect(inHand({ index: 1, on: false, at: 1000 }, 1000 + FOCUS_GRACE_MS)).toBe(true);
    expect(inHand({ index: 1, on: false, at: 1000 }, 1001 + FOCUS_GRACE_MS)).toBe(false);
  });
  it('is nothing before any field was touched', () => {
    expect(inHand({ index: -1, on: false, at: 0 }, 10)).toBe(false);
  });
});
