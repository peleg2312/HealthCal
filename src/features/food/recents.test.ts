import { describe, expect, it, vi } from 'vitest';

vi.mock('@/ui', () => ({ toast: () => {}, haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} } }));

import { recentsAfterUndo } from './log';

const food = (id: string) => ({ id });

describe('recentsAfterUndo', () => {
  it('takes a food back out of recents when its logging is undone', () => {
    const before = [food('oats'), food('milk')];
    const now = [food('egg'), food('oats'), food('milk')];
    expect(recentsAfterUndo(now, before, 'egg')).toEqual(before);
  });

  it('puts a food back where it was when it was already a recent', () => {
    const before = [food('oats'), food('egg'), food('milk')];
    const now = [food('egg'), food('oats'), food('milk')];
    expect(recentsAfterUndo(now, before, 'egg')).toEqual(before);
  });

  it('leaves recents alone when something else was logged since', () => {
    const before = [food('oats')];
    const now = [food('rice'), food('egg'), food('oats')];
    expect(recentsAfterUndo(now, before, 'egg')).toEqual(now);
  });
});
