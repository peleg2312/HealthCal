/**
 * The loop of the AI at work, pure and with no React: the AI's cup pours up and falls back while an
 * estimate or an answer is on its way (`startWaitLoop`). It is one interval: level 0.15 to 0.8 over the
 * small pour (360 ms), held, back to 0.15 over the fade (160 ms), every 1,120 ms. It never claims a
 * share done: it rises and starts again. Its highest level is 0.8, not the brim, so the level line
 * shows for the whole turn (a brim-full cup has no line to see, and would read as a block). Never started under reduced motion (the cup rests at 0.55),
 * and the function it returns stops it (called on unmount and when the answer arrives).
 */
import { motion } from '@/theme/motion';

export const WAIT_LOW = 0.15;
export const WAIT_HIGH = 0.8;
export const WAIT_REST = 0.55;
/** Up (pourSmall) + held 600 ms + down (fade): one turn of the loop. */
export const WAIT_LOOP_MS = motion.duration.pourSmall + 600 + motion.duration.fade;

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
