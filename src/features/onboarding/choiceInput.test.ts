import { describe, expect, it } from 'vitest';

import { choiceInput } from './choiceInput';

describe('choiceInput', () => {
  it('reads a tap or a mouse click as a pointer, so the step moves on by itself', () => {
    expect(choiceInput({ type: 'click', nativeEvent: { type: 'click', detail: 1 } })).toBe('pointer');
    // A native press has no type at all.
    expect(choiceInput({ nativeEvent: { locationX: 4, locationY: 9 } })).toBe('pointer');
    expect(choiceInput(undefined)).toBe('pointer');
  });

  it('reads Enter, Space and an activation with no pointer as keys, so only Continue moves on', () => {
    expect(choiceInput({ type: 'keyup', key: 'Enter', nativeEvent: { type: 'keyup' } })).toBe('keys');
    expect(choiceInput({ type: 'keydown', key: ' ' })).toBe('keys');
    expect(choiceInput({ type: 'click', nativeEvent: { type: 'click', detail: 0 } })).toBe('keys');
  });
});
