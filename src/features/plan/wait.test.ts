import { describe, expect, it } from 'vitest';

import { demoView } from './demo';
import { ARRIVAL_WINDOW_MS, arrivalFresh, WAIT_EVERY_MS, WAIT_FOR_MS, waitDecision, waitForPlus } from './wait';
import type { PlanView } from './view';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const free = demoView('free', NOW);
const plus = demoView('plus', NOW);

function fakeClock(answers: (t: number) => PlanView) {
  let t = 0;
  const asked: number[] = [];
  return {
    asked,
    deps: {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
      refresh: async () => {
        asked.push(t);
        t += 300; // the server takes a moment
        return answers(t);
      },
    },
  };
}

describe('waitDecision', () => {
  it('is on as soon as Plus is held', () => {
    expect(waitDecision(plus, 0, 1000)).toBe('on');
    expect(waitDecision(demoView('canceling', NOW), 0, 1000)).toBe('on');
  });
  it('asks again within 30 s and stops after', () => {
    expect(waitDecision(free, 0, 2_000)).toBe('ask');
    expect(waitDecision(null, 0, WAIT_FOR_MS - WAIT_EVERY_MS)).toBe('ask');
    expect(waitDecision(free, 0, WAIT_FOR_MS - WAIT_EVERY_MS + 1)).toBe('late');
  });
});

describe('waitForPlus', () => {
  it('asks every 2 s and stops when the payment arrives', async () => {
    const c = fakeClock((t) => (t > 6_000 ? plus : free));
    const out = await waitForPlus(c.deps);
    expect(out.kind).toBe('on');
    expect(c.asked).toEqual([0, 2_300, 4_600, 6_900]);
  });
  it('says late after about 30 s, never asking past it', async () => {
    const c = fakeClock(() => free);
    const out = await waitForPlus(c.deps);
    expect(out.kind).toBe('late');
    expect(c.asked.length).toBe(14); // 0, 2.3 s, ... 29.9 s
    expect(Math.max(...c.asked)).toBeLessThan(WAIT_FOR_MS);
  });
  it('stops quietly when the screen moved on', async () => {
    let stop = false;
    const c = fakeClock(() => {
      stop = true;
      return free;
    });
    const out = await waitForPlus({ ...c.deps, stopped: () => stop });
    expect(out.kind).toBe('stopped');
    expect(c.asked.length).toBe(1);
  });
});

describe('the moment Plus arrives', () => {
  it('is shown only right after the payment arrived', () => {
    expect(arrivalFresh(null, NOW)).toBe(false);
    expect(arrivalFresh(NOW, NOW)).toBe(true);
    expect(arrivalFresh(NOW, NOW + ARRIVAL_WINDOW_MS - 1)).toBe(true);
    expect(arrivalFresh(NOW, NOW + ARRIVAL_WINDOW_MS)).toBe(false);
    // A clock that went backwards shows nothing.
    expect(arrivalFresh(NOW, NOW - 1)).toBe(false);
  });
});
