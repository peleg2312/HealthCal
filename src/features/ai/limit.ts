/**
 * What a person reads at an AI limit: the fields the server adds to a limit answer (analyze-food's
 * and coach-chat's 429 `daily_limit` / `shared_limit`, supabase/functions/<fn>/plans.ts
 * `limitFields`), read defensively, and the food estimate's words built from them. Pure; tested in
 * limit.test.ts. The coach's words are in @/features/coach/words.ts and use the reading here.
 *
 * Rules (docs/plans-and-payments.md, ruling R18 and R19):
 *  - with plans off, or from a server that does not send these fields, nothing here applies and the
 *    screen keeps today's words exactly (`limitInfoFrom` answers null);
 *  - the free way to log is named first; the reset is said in the phone's own clock ("More after
 *    02:00."), from `resetsAt`;
 *  - a careful estimate refused because it needed more than is left says so, never "used";
 *  - the plan link ("Plus gives 40 a day") is offered only on the free plan and never at the shared
 *    ceiling; the screen adds its own conditions (the plan is visible, the checkout may be shown);
 *  - no word from the banned list (limit.test.ts holds them to it).
 */
import { formatShortDate, toISODate } from '@/lib/dates';

export interface LimitInfo {
  /** The person's daily number for this feature (estimate units, or questions). */
  limit: number;
  plan: 'free' | 'plus';
  /** The units the refused call needed (a careful estimate is 5), when the server said. */
  cost: number | null;
  /** When the count starts again (next midnight UTC), when the server said. */
  resetsAt: string | null;
  /** The end of an earlier account's allowance, while it applies. */
  graceUntil: string | null;
  /** The project's shared ceiling, not the person's own allowance. */
  shared: boolean;
}

const instant = (v: unknown): string | null => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null);
const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1_000_000 ? v : null);

/**
 * The plan fields of a limit answer, or null when plans are off or the answer does not carry them
 * (an older server): the screen then says exactly what it said before plans existed.
 */
export function limitInfoFrom(body: unknown): LimitInfo | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (b.plansOn !== true || (b.plan !== 'free' && b.plan !== 'plus')) return null;
  const limit = whole(b.limit);
  if (limit === null) return null;
  return {
    limit,
    plan: b.plan,
    cost: whole(b.cost),
    resetsAt: instant(b.resetsAt),
    graceUntil: instant(b.graceUntil),
    shared: b.shared === true || b.error === 'shared_limit',
  };
}

/** "02:00": the phone's own clock at `iso`, 24-hour. Null for a time that cannot be read. */
export function localClock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "More after 02:00." in the phone's time, or "More after midnight UTC." when the server gave no time. */
export function moreAfter(resetsAt: string | null): string {
  const clock = localClock(resetsAt);
  return clock ? `More after ${clock}.` : 'More after midnight UTC.';
}

/** "Your earlier allowance stays until Jan 31." while an earlier account's allowance applies. */
export function graceLine(graceUntil: string | null): string | null {
  if (!graceUntil) return null;
  const d = new Date(graceUntil);
  if (!Number.isFinite(d.getTime())) return null;
  return `Your earlier allowance stays until ${formatShortDate(toISODate(d))}.`;
}

/** The plan link's words: "Plus gives 40 a day", or, with no number known, "What Plus gives". */
export function plusLink(plusLimit: number | null): string {
  return plusLimit && plusLimit > 0 ? `Plus gives ${plusLimit} a day` : 'What Plus gives';
}

export interface EstimateLimitWords {
  title: string;
  body: string;
  /** Whether the plan link may be offered (the free plan, the person's own allowance). */
  offerPlans: boolean;
}

/**
 * The estimate's limit, worded. `leftBefore` is the allowance the app last heard of before this
 * call (the "N analyses left today" line), or null; with it above 0 and a call that cost more than
 * one unit, the refusal is a careful estimate that needed more than is left (ruling R18).
 */
export function estimateLimitWords(info: LimitInfo, leftBefore: number | null): EstimateLimitWords {
  const after = moreAfter(info.resetsAt);
  if (info.shared) {
    return { title: 'The AI estimate is busy for today', body: `Search, scan and quick add work as always. ${after}`, offerPlans: false };
  }
  const grace = graceLine(info.graceUntil);
  if (info.cost !== null && info.cost > 1 && leftBefore !== null && leftBefore > 0 && leftBefore < info.cost) {
    return {
      title: 'Too few left for a careful estimate',
      body: `A careful estimate needs ${info.cost} units and fewer are left today. A quick estimate still works. ${after}`,
      offerPlans: info.plan === 'free',
    };
  }
  const title = info.limit === 1 ? "Today's 1 estimate is used" : `Today's ${info.limit} estimates are used`;
  const body = [`Search, scan or quick add still log this meal. ${after}`, grace].filter(Boolean).join(' ');
  return { title, body, offerPlans: info.plan === 'free' };
}

/** The careful check's cost in units (supabase/functions/analyze-food/analyze.ts `costOf`). */
export const CAREFUL_COST = 5;

/** The careful option's line on the free plan: "Uses 5 of today's 5" (ruling R18). */
export function carefulUses(cost: number, dailyLimit: number): string {
  return `Uses ${cost} of today's ${dailyLimit}`;
}

/**
 * The review's "Not quite right?" line: what each second try uses, so no try reads cheaper than it is.
 * Re-estimate uses 1, or `CAREFUL_COST` once the result is a careful check (it checks carefully again); the
 * careful check uses `CAREFUL_COST`, said here unless its own line under its button already says it.
 */
export function retryCostLine(precisePass: boolean, carefulSaidBelow: boolean): string {
  if (precisePass) return `Re-estimate checks carefully again and uses ${CAREFUL_COST} of today's AI estimates.`;
  return carefulSaidBelow ? "Re-estimate uses 1 of today's AI estimates." : `Re-estimate uses 1 of today's AI estimates, a careful check ${CAREFUL_COST}.`;
}

/** The allowance under the second tries: "3 AI estimates left today", the plan's own word for the unit. */
export function estimatesLeft(remaining: number): string {
  return `${remaining} AI ${remaining === 1 ? 'estimate' : 'estimates'} left today`;
}

/**
 * Plus's daily number for the plan link, from the plan the app was told about (@/features/plan):
 * its `planLimits.plus` (the server's figures, or its documented defaults), else an offer that
 * carries its limits, else the person's own limits while they hold Plus. Null when none says (the
 * link then reads "What Plus gives").
 */
export function plusLimitOf(
  view: { plan: string; limits: { estimates: number; questions: number }; offers: readonly object[]; planLimits?: { plus: { estimates: number; questions: number } } | null },
  kind: 'estimates' | 'questions',
): number | null {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
  const fromPlan = view.planLimits?.plus?.[kind];
  if (ok(fromPlan)) return fromPlan;
  for (const o of view.offers) {
    const lim = (o as { limits?: unknown }).limits;
    if (lim && typeof lim === 'object' && ok((lim as Record<string, unknown>)[kind])) return (lim as Record<string, number>)[kind];
  }
  return view.plan === 'plus' && ok(view.limits[kind]) ? view.limits[kind] : null;
}
