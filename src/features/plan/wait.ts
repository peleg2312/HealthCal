/**
 * After a checkout the app never trusts the return: it asks the server to re-read the payment company
 * every 2 s for up to 30 s and says what it sees. The decisions are pure (`waitDecision`); the loop
 * (`waitForPlus`) takes its clock, sleep and refresh as arguments, so it is tested with a fake clock.
 */
import { holdsPlus, type PlanView } from './view';

export const WAIT_EVERY_MS = 2_000;
export const WAIT_FOR_MS = 30_000;

export type WaitDecision = 'on' | 'ask' | 'late';

/** What to do after an answer: Plus is on, ask again, or stop and say it has not arrived yet. */
export function waitDecision(view: Pick<PlanView, 'plan' | 'state'> | null, startedAt: number, now: number): WaitDecision {
  if (view && view.plan === 'plus' && holdsPlus(view)) return 'on';
  return now - startedAt + WAIT_EVERY_MS > WAIT_FOR_MS ? 'late' : 'ask';
}

export interface WaitDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Re-read the payment company; resolves with the plan as known (never throws). */
  refresh(): Promise<PlanView>;
  /** True once the person left the screen or started something else: the loop stops quietly. */
  stopped?(): boolean;
}

export type WaitOutcome = { kind: 'on'; view: PlanView } | { kind: 'late' } | { kind: 'stopped' };

export async function waitForPlus(d: WaitDeps): Promise<WaitOutcome> {
  const start = d.now();
  for (;;) {
    if (d.stopped?.()) return { kind: 'stopped' };
    const view = await d.refresh();
    if (d.stopped?.()) return { kind: 'stopped' };
    const next = waitDecision(view, start, d.now());
    if (next === 'on') return { kind: 'on', view };
    if (next === 'late') return { kind: 'late' };
    await d.sleep(WAIT_EVERY_MS);
  }
}
