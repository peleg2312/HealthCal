/**
 * The coach's waiting state, pure and with no React: which words show beside the pouring cup
 * (`waitWords`) and when. The loop itself is the AI mark's (`@/features/ai/mark/loop`: one cup, one
 * loop, wherever the AI works) and is re-exported here for the coach's files and ./waiting.test.ts.
 */
import { WAIT_LONG, WAIT_PLAIN, WAIT_SHARED } from './words';

export { startWaitLoop, waitDuration, WAIT_HIGH, WAIT_LOOP_MS, WAIT_LOW, WAIT_REST } from '@/features/ai/mark/loop';

export const WAIT_SHOW_AFTER_MS = 300;
export const WAIT_LONG_AFTER_MS = 10_000;

/** The words beside the pouring cup: the week is read only while it is shared; after 10 s, "Taking longer than usual". */
export function waitWords(shared: boolean, elapsedMs: number): string {
  if (elapsedMs >= WAIT_LONG_AFTER_MS) return WAIT_LONG;
  return shared ? WAIT_SHARED : WAIT_PLAIN;
}
