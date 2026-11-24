/**
 * The waiting state's rules, pure and with no React: which words show (`waitWords`), and the loop that
 * pours the small coach cup up and lets it fall back while an answer is on its way (`startWaitLoop`).
 * The loop is one interval: level 0.15 to 1 over the small pour (360 ms), held, back to 0.15 over the
 * fade (160 ms), every 1,120 ms. Never started under reduced motion (the cup rests at 0.55), and the
 * function it returns stops it (the screen calls it on unmount and when the answer arrives).
 */
import { motion } from '@/theme/motion';

import { WAIT_LONG, WAIT_PLAIN, WAIT_SHARED } from './words';

export const WAIT_SHOW_AFTER_MS = 300;
export const WAIT_LONG_AFTER_MS = 10_000;
export const WAIT_LOW = 0.15;
export const WAIT_HIGH = 1;
export const WAIT_REST = 0.55;
/** Up (pourSmall) + held 600 ms + down (fade): one turn of the loop. */
export const WAIT_LOOP_MS = motion.duration.pourSmall + 600 + motion.duration.fade;

/** The words beside the pouring cup: the week is read only while it is shared; after 10 s, "Taking longer than usual". */
export function waitWords(shared: boolean, elapsedMs: number): string {
  if (elapsedMs >= WAIT_LONG_AFTER_MS) return WAIT_LONG;
  return shared ? WAIT_SHARED : WAIT_PLAIN;
}

/** How long the cup takes to reach `level`: the pour going up, the fade coming down. */
export function waitDuration(level: number): number {
  return level >= WAIT_HIGH ? motion.duration.pourSmall : motion.duration.fade;
}

/**
 * Start the loop: `set` is called with the level to pour to. Under reduced motion it sets the resting
 * level once and starts nothing. Returns the stop.
 */
export function startWaitLoop(set: (level: number) => void, reduce: boolean, timers: Pick<typeof globalThis, 'setInterval' | 'clearInterval' | 'setTimeout' | 'clearTimeout'> = globalThis): () => void {
  if (reduce) {
    set(WAIT_REST);
    return () => {};
  }
  let down: ReturnType<typeof setTimeout> | null = null;
  const turn = () => {
    set(WAIT_HIGH);
    if (down) timers.clearTimeout(down);
    down = timers.setTimeout(() => set(WAIT_LOW), motion.duration.pourSmall + 600);
  };
  set(WAIT_LOW);
  turn();
  const id = timers.setInterval(turn, WAIT_LOOP_MS);
  return () => {
    timers.clearInterval(id);
    if (down) timers.clearTimeout(down);
  };
}
