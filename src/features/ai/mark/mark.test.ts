/**
 * The AI's mark: its drop can be seen in every look (3:1 on the page and on a card), its fill is the
 * coach's fill under both names, the box of each size is the cup plus the drop's room, and the loop
 * under reduced motion starts nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contrast } from '@/theme/contrast';
import { motion } from '@/theme/motion';
import { blossomColors, butterColors, chartFillOpacity, darkColors, honeyColors, javaColors, lightColors } from '@/theme/tokens';

import { aiMarkFill, coachMarkFill, dropColor } from './fill';
import { startWaitLoop, waitDuration, WAIT_HIGH, WAIT_LOOP_MS, WAIT_LOW, WAIT_REST, WAIT_STILL_AFTER_MS, WAIT_TURNS } from './loop';

const PALETTES = { dark: darkColors, light: lightColors, blossom: blossomColors, butter: butterColors, honey: honeyColors, java: javaColors } as const;

describe('dropColor', () => {
  it('is at least 3:1 on the page and on a card in all six looks', () => {
    for (const [name, c] of Object.entries(PALETTES)) {
      const d = dropColor(c);
      expect(contrast(d, c.bg), `${name} on bg`).toBeGreaterThanOrEqual(3);
      expect(contrast(d, c.surface), `${name} on surface`).toBeGreaterThanOrEqual(3);
      // The tinted card a description sits on, too.
      expect(contrast(d, c.surfaceAlt), `${name} on surfaceAlt`).toBeGreaterThanOrEqual(3);
    }
  });

  it('is the level line where that can be seen, else the text colour', () => {
    expect(dropColor({ rim: '#000000', text: '#111111', bg: '#FFFFFF', surface: '#FFFFFF' })).toBe('#000000');
    expect(dropColor({ rim: '#EEEEEE', text: '#111111', bg: '#FFFFFF', surface: '#FFFFFF' })).toBe('#111111');
    expect(dropColor({ rim: '#000000', text: '#EEEEEE', bg: '#FFFFFF', surface: '#222222' })).toBe('#EEEEEE');
  });
});

describe('aiMarkFill', () => {
  it('is the coach cup’s fill: one cup under both names', () => {
    expect(aiMarkFill).toBe(coachMarkFill);
    for (const [name, c] of Object.entries(PALETTES)) expect(aiMarkFill(c, chartFillOpacity[name as keyof typeof PALETTES])).toBe(coachMarkFill(c, chartFillOpacity[name as keyof typeof PALETTES]));
  });
});

describe('the loop of the AI at work', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('under reduced motion rests at 0.55 and starts nothing', () => {
    const seen: number[] = [];
    const stop = startWaitLoop((l) => seen.push(l), true);
    vi.advanceTimersByTime(5 * WAIT_LOOP_MS);
    expect(seen).toEqual([WAIT_REST]);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it('rests with its level line in view: at its highest the cup is near 80%, never brim-full', () => {
    expect(WAIT_HIGH).toBeGreaterThanOrEqual(0.75);
    expect(WAIT_HIGH).toBeLessThanOrEqual(0.85);
    expect(WAIT_LOW).toBeLessThan(WAIT_REST);
  });

  it('never rests part way: it pours up and falls back, and stops when told', () => {
    const seen: number[] = [];
    const stop = startWaitLoop((l) => seen.push(l), false);
    vi.advanceTimersByTime(3 * WAIT_LOOP_MS);
    expect(new Set(seen)).toEqual(new Set([WAIT_LOW, WAIT_HIGH]));
    stop();
    const n = seen.length;
    vi.advanceTimersByTime(3 * WAIT_LOOP_MS);
    expect(seen.length).toBe(n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('moves for 5 s at most (WCAG 2.2.2): four turns, one pour to the resting level, then still', () => {
    const seen: { at: number; level: number }[] = [];
    const start = Date.now();
    const stop = startWaitLoop((level) => seen.push({ at: Date.now() - start, level }), false);
    vi.advanceTimersByTime(60_000);
    expect(WAIT_TURNS).toBe(4);
    expect(seen.filter((s) => s.level === WAIT_HIGH)).toHaveLength(WAIT_TURNS);
    const last = seen.at(-1)!;
    expect(last.level).toBe(WAIT_REST);
    // The last move (the pour to rest) and its rim's settle end within 5 s.
    expect(last.at + waitDuration(WAIT_REST) + motion.duration.settle).toBeLessThanOrEqual(WAIT_STILL_AFTER_MS);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it('rests at the level the mark was given', () => {
    const seen: number[] = [];
    startWaitLoop((l) => seen.push(l), false, globalThis, 0.4);
    vi.advanceTimersByTime(10_000);
    expect(seen.at(-1)).toBe(0.4);
    const still: number[] = [];
    startWaitLoop((l) => still.push(l), true, globalThis, 0.4);
    expect(still).toEqual([0.4]);
  });
});
