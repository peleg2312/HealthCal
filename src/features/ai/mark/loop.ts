/**
 * The loop of the AI at work, pure and with no React: the AI's cup pours up and falls back while an
 * estimate or an answer is on its way (`startWaitLoop`). It is one interval: level 0.15 to 0.8 over the
 * small pour (360 ms), held, back to 0.15 over the fade (160 ms), every 1,120 ms. It never claims a
 * share done: it rises and starts again. Its highest level is 0.8, not the brim, so the level line
 * shows for the whole turn (a brim-full cup has no line to see, and would read as a block). Never started under reduced motion (the cup rests at 0.55),
 * and the function it returns stops it (called on unmount and when the answer arrives).
 *
 * It moves for 5 s at most (WCAG 2.2.2: moving content beside other content that lasts more than 5 s must stop):
 * the turns that end by then (`WAIT_TURNS`, four), then one pour to the resting level, where it holds still until
 * the wait ends. The words beside the cup keep saying what is happening.
 */
import { motion } from '@/theme/motion';

export const WAIT_LOW = 0.15;
export const WAIT_HIGH = 0.8;
export const WAIT_REST = 0.55;
/** Up (pourSmall) + held 600 ms + down (fade): one turn of the loop. */
export const WAIT_LOOP_MS = motion.duration.pourSmall + 600 + motion.duration.fade;
/** A wait's cup is still from this long after it started (WCAG 2.2.2), whatever the wait. */
export const WAIT_STILL_AFTER_MS = 5000;

/** How long the cup takes to reach `level`: the pour going up, the fade coming down. */
export function waitDuration(level: number): number {
  return level >= WAIT_HIGH ? motion.duration.pourSmall : motion.duration.fade;
}

/** The turns that, with the last pour to the resting level, end within `WAIT_STILL_AFTER_MS`: 4. */
export const WAIT_TURNS = Math.floor((WAIT_STILL_AFTER_MS - waitDuration(WAIT_REST)) / WAIT_LOOP_MS);

/**
 * Start the loop: `set` is called with the level to pour to. After `WAIT_TURNS` turns it pours to `rest` and
 * starts nothing more (still from then on, all within 5 s). Under reduced motion it sets `rest` once and starts
 * nothing. Returns the stop.
 */
export function startWaitLoop(
  set: (level: number) => void,
  reduce: boolean,
  timers: Pick<typeof globalThis, 'setInterval' | 'clearInterval' | 'setTimeout' | 'clearTimeout'> = globalThis,
  rest: number = WAIT_REST,
): () => void {
  if (reduce) {
    set(rest);
    return () => {};
  }
  let down: ReturnType<typeof setTimeout> | null = null;
  let turns = 0;
  let id: ReturnType<typeof setInterval> | null = null;
  const turn = () => {
    if (down) timers.clearTimeout(down);
    down = null;
    if (turns >= WAIT_TURNS) {
      // Five seconds are nearly up: one last pour to the resting level, then still.
      if (id !== null) timers.clearInterval(id);
      id = null;
      set(rest);
      return;
    }
    turns += 1;
    set(WAIT_HIGH);
    down = timers.setTimeout(() => set(WAIT_LOW), motion.duration.pourSmall + 600);
  };
  set(WAIT_LOW);
  turn();
  id = timers.setInterval(turn, WAIT_LOOP_MS);
  return () => {
    if (id !== null) timers.clearInterval(id);
    if (down) timers.clearTimeout(down);
  };
}
