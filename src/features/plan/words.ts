/**
 * Every fixed string about the plan, as pure functions (held to ruling R19 and the morning page's
 * banned list by words.test.ts). Screens only place them.
 *
 * R19: no "upgrade", "unlock", "premium", "run out", "don't miss", "limited time", "free users",
 * "last chance", no exclamation mark and no countdown. The free way comes first; nothing blames.
 * No sentence names a payment company.
 */
import { PLAN_FULL_NAME, PLAN_NAME } from './channel';
import { isEnding, paymentLate, holdsPlus, type PlanLimits, type PlanOffer, type PlanPeriod, type PlanSource, type PlanView } from './view';

// ------------------------------------------------------------------ dates

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Dec 23", in the phone's own time zone. */
export function monthDay(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Dec 23, 2027". */
export function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ------------------------------------------------------------------ money

/** Digits after the point, by ISO 4217. */
const MINOR: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 2, KWD: 3, BHD: 3, JOD: 3, OMR: 3, TND: 3 };
const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', JPY: '¥', CAD: 'CA$', AUD: 'A$', INR: '₹' };

/** An amount in minor units as people read it: "$29.99", "€4", "₪14.90", "CHF 4.50". */
export function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const digits = MINOR[code] ?? 2;
  const value = amount / 10 ** digits;
  const whole = Number.isInteger(value);
  const [int, frac] = value.toFixed(whole ? 0 : digits).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const n = frac ? `${grouped}.${frac}` : grouped;
  const sym = SYMBOL[code];
  return sym ? `${sym}${n}` : `${code} ${n}`;
}

const EVERY: Record<PlanPeriod, string> = { month: 'month', year: 'year' };

/** "$29.99 a year". */
export function priceLine(o: Pick<PlanOffer, 'amount' | 'currency' | 'period'>): string {
  return `${formatMoney(o.amount, o.currency)} a ${EVERY[o.period]}`;
}

/** The yearly price per month, smaller under it ("About $2.50 a month"); null for a monthly offer. */
export function monthlyEquivalent(o: Pick<PlanOffer, 'amount' | 'currency' | 'period'>): string | null {
  if (o.period !== 'year') return null;
  const digits = MINOR[o.currency.toUpperCase()] ?? 2;
  const step = 10 ** Math.max(0, digits - 2);
  const perMonth = Math.round(o.amount / 12 / step) * step;
  return `About ${formatMoney(perMonth, o.currency)} a month`;
}

/** Ruling R16: said unless the server says the price holds the tax. */
export function taxNote(o: Pick<PlanOffer, 'taxIncluded'>): string | null {
  return o.taxIncluded === true ? null : 'Tax is added where it applies';
}

/** The pinned button: names the price and the period. */
export function subscribeLabel(o: Pick<PlanOffer, 'amount' | 'currency' | 'period'>): string {
  return `Subscribe for ${priceLine(o)}`;
}

/** The full renewal sentence, directly above the button. */
export function renewalLine(o: Pick<PlanOffer, 'amount' | 'currency' | 'period'>): string {
  const p = EVERY[o.period];
  return `Renews every ${p} at ${formatMoney(o.amount, o.currency)} until you cancel. Cancel any time; ${PLAN_NAME} then stays to the end of the paid ${p}.`;
}

export const PERIOD_LABELS = ['Monthly', 'Yearly'] as const;
export function periodLabel(p: PlanPeriod): string {
  return p === 'month' ? 'Monthly' : 'Yearly';
}

// ------------------------------------------------------------------ the screen

export const PLAN_TITLE = 'Plan';
export const PLAN_INTRO = `Everything on your phone is free. ${PLAN_NAME} pays for the AI.`;
export const FREE_CARD_TITLE = 'Free';
export const PLUS_CARD_TITLE = PLAN_NAME;
export const SELLER_LINE = `The payment page is run by the payment company that sells ${PLAN_NAME} on HealthCal's behalf. Its name is on that page.`;
export const TERMS_LABEL = 'Terms of use';
export const PRIVACY_LABEL = 'Privacy';
export const MANAGE_LABEL = 'Manage or cancel';
export const CANCEL_LABEL = 'Cancel subscription';
export const WITHDRAW_LABEL = 'Withdraw from the contract';
export const NOTHING_TO_CHOOSE = 'There is no plan to choose right now. Everything in HealthCal works as it is.';
export const SIGNED_OUT_LINE = 'Plans come with an account. Sign in from Profile > Account, then open this page again.';
export const LOADING_LINE = 'Reading your plan.';
export const WAITING_LINE = 'Waiting for the payment to arrive. This takes a few seconds.';
export const LATE_LINE = 'The payment has not arrived yet. It can take a minute, and this page looks again when you come back to it. If you closed the payment page, nothing was charged.';
export const CHECKOUT_CLOSED = 'Nothing was charged.';

/** The header's short line. */
export function planShortLine(v: Pick<PlanView, 'plan' | 'state'> & { known?: boolean; plansOn?: boolean }): string {
  if (holdsPlus(v)) return PLAN_NAME;
  // Signed out, not read yet or plans off: the screen does not know a plan, so it names none.
  if (v.known === false || v.plansOn === false) return 'Settings and plan';
  return 'Free';
}

/** Profile's and Account's row: "Free", "Plus until Dec 23", "Plus, ends Dec 23". */
export function planRowLine(v: Pick<PlanView, 'plan' | 'state' | 'periodEnd' | 'cancelAtPeriodEnd' | 'paymentGraceUntil'>): string {
  if (!holdsPlus(v)) return 'Free';
  if (paymentLate(v)) return v.paymentGraceUntil ? `${PLAN_NAME}, payment due by ${monthDay(v.paymentGraceUntil)}` : `${PLAN_NAME}, payment due`;
  if (!v.periodEnd) return PLAN_NAME;
  return isEnding(v) ? `${PLAN_NAME}, ends ${monthDay(v.periodEnd)}` : `${PLAN_NAME} until ${monthDay(v.periodEnd)}`;
}

/** The earlier-account allowance ("Your earlier allowance stays until Jan 31."). */
export function graceLine(graceUntil: string | null): string | null {
  return graceUntil ? `Your earlier allowance stays until ${monthDay(graceUntil)}.` : null;
}

export interface CardRow {
  key: 'estimates' | 'questions' | 'memory';
  label: string;
  value: string;
}

/** The three rows that differ between the plans, as figures with units. */
export function cardRows(l: PlanLimits): CardRow[] {
  return [
    { key: 'estimates', label: 'AI estimates', value: `${l.estimates} a day` },
    { key: 'questions', label: 'Coach questions', value: `${l.questions} a day` },
    { key: 'memory', label: 'Coach memory', value: `${l.memoryPairs} ${l.memoryPairs === 1 ? 'exchange' : 'exchanges'}` },
  ];
}

/** What a card reads to a screen reader, once. */
export function cardLabel(title: string, l: PlanLimits, current: boolean): string {
  const rows = cardRows(l).map((r) => `${r.label}: ${r.value}`).join(', ');
  return `${title}${current ? ', your plan' : ''}. ${rows}.`;
}

const SOURCE_LINE: Record<PlanSource, string> = {
  paddle: 'Bought on the web.',
  polar: 'Bought on the web.',
  stripe: 'Bought on the web.',
  test: 'Bought on the web (test payment).',
  app_store: 'Bought in the App Store.',
  play_store: 'Bought on Google Play.',
  promotional: 'Given by HealthCal.',
};

export function sourceLine(s: PlanSource | null): string | null {
  return s ? SOURCE_LINE[s] : null;
}

/** For a subscriber: when the plan renews, ends, or is waiting on a payment. */
export function subscriberLine(v: Pick<PlanView, 'plan' | 'state' | 'periodEnd' | 'cancelAtPeriodEnd' | 'paymentGraceUntil' | 'period' | 'offers'>): string {
  if (paymentLate(v)) {
    const until = v.paymentGraceUntil ?? v.periodEnd;
    return until
      ? `The last renewal payment did not go through. ${PLAN_NAME} stays on until ${fullDate(until)} while it is tried again. You can change the card in ${MANAGE_LABEL}.`
      : `The last renewal payment did not go through. You can change the card in ${MANAGE_LABEL}.`;
  }
  if (!v.periodEnd) return `${PLAN_FULL_NAME} is on.`;
  if (isEnding(v)) return `Cancelled. ${PLAN_NAME} stays on until ${fullDate(v.periodEnd)}, then the Free allowance applies. Nothing you logged changes.`;
  const offer = v.period ? v.offers.find((o) => o.period === v.period) : undefined;
  return offer
    ? `Renews on ${fullDate(v.periodEnd)} at ${formatMoney(offer.amount, offer.currency)}. Cancel any time before then.`
    : `Renews on ${fullDate(v.periodEnd)}. Cancel any time before then.`;
}

/** Under "Withdraw from the contract": until when it is offered. */
export function withdrawLine(startedAt: string): string {
  return `Within 14 days of buying you can withdraw from the contract, until ${monthDay(new Date(Date.parse(startedAt) + 14 * 86_400_000).toISOString())}. Both lead to the payment company's own page.`;
}

/** The toast when the payment arrived. */
export function plusOnToast(periodEnd: string | null): string {
  return periodEnd ? `${PLAN_NAME} is on until ${fullDate(periodEnd)}.` : `${PLAN_NAME} is on.`;
}

/**
 * Where Plus can be bought, when this copy cannot open the checkout (a store build, R15, or the hosted
 * preview's frame). No link.
 */
export function notBuyableHere(reason: 'channel' | 'frame'): string {
  return reason === 'frame'
    ? `${PLAN_NAME} can be bought when HealthCal is open in its own browser tab or in the app.`
    : `${PLAN_NAME} can be bought in HealthCal on the web, signed in with this account.`;
}

// ------------------------------------------------------------------ refusals

export type RefusalContext = 'checkout' | 'manage' | 'status';

const OUTSIDE: Partial<Record<string, string>> = {
  app_store: `This plan was bought in the App Store. Change or cancel it in the iPhone's Settings, under your name, then Subscriptions.`,
  play_store: `This plan was bought on Google Play. Change or cancel it in the Play Store app, under Payments and subscriptions.`,
  promotional: 'This plan was given by HealthCal and ends by itself. There is nothing to cancel.',
};

/** Neutral words for every refusal the billing function (or the device) can give. */
export function refusalLine(code: string, context: RefusalContext, source?: string): string {
  const charged = context === 'checkout' ? ' Nothing was charged.' : '';
  switch (code) {
    case 'already_subscribed':
      return `This account already has ${PLAN_NAME}.`;
    case 'plans_off':
      return NOTHING_TO_CHOOSE;
    case 'not_configured':
      return `Plans are not set up on the server yet.${charged}`;
    case 'provider_failed':
      return `The payment company did not answer. Try again in a minute.${charged}`;
    case 'offline':
    case 'timeout':
      return `No connection. Try again when you are online.${charged}`;
    case 'checkout_limit':
      return `Several payment pages were opened in the last hour. Try again later.${charged}`;
    case 'rate_limited':
    case 'too_many':
    case 'too_many_requests':
    case 'rate_limit':
      return `That was tried many times this hour. Try again in a while.${charged}`;
    case 'offer_unknown':
      return `That price has changed. The page now shows the current one.${charged}`;
    case 'nothing_to_manage':
      return 'There is no subscription on this account to manage.';
    case 'cancel_elsewhere':
      return OUTSIDE[source ?? ''] ?? 'This plan was bought somewhere else. Change or cancel it where it was bought.';
    case 'unauthorized':
    case 'signed_out':
      return 'Sign in to see your plan.';
    case 'unconfirmed':
      return 'Confirm your email first: open the link we sent you.';
    case 'no_backend':
      return 'Accounts are not set up for this build yet.';
    case 'cancelled':
      return CHECKOUT_CLOSED;
    default:
      return `That did not work. Try again in a minute.${charged}`;
  }
}

// ------------------------------------------------------------------ deleting the account

/** Added to the delete sheet when a plan is held. */
export const DELETE_PLAN_LINE = `Your ${PLAN_NAME} plan ends with the account. No further payment is taken.`;
export const DELETE_ANYWAY_LABEL = 'Delete anyway';

/** Ending the plan did not work, so the account was kept. */
export function deleteBlockedLine(code: string, source?: string): string {
  if (code === 'cancel_elsewhere') return `${OUTSIDE[source ?? ''] ?? 'This plan was bought somewhere else. Cancel it where it was bought.'} The account was not deleted.`;
  const why = code === 'offline' || code === 'timeout' ? 'There is no connection, so' : code === 'not_configured' ? 'Plans are not set up on the server, so' : 'The payment company did not answer, so';
  return `${why} your plan could not be ended and the account was not deleted. Try again in a minute, or choose ${DELETE_ANYWAY_LABEL}.`;
}

/** After "Delete anyway": the subscription may still be held by the payment company. */
export const RELEASED_LINE =
  'Your account is deleted. The subscription may still be open at the payment company: open the receipt email from your purchase and cancel there, so no further payment is taken.';

/** The server refused the delete itself because a plan is still held (ruling R5). */
export const PLAN_ACTIVE_LINE = 'This account still holds a plan, so it was not deleted. Try again, or choose Delete anyway: the plan is then released here and has to be cancelled at the payment company too.';

// ------------------------------------------------------------------ add a password (R20)

export const ADD_PASSWORD_LABEL = 'Add a password';
export const ADD_PASSWORD_HINT = 'You sign in with Google. A password lets you sign in with your email too.';
export function addPasswordSent(email: string): string {
  return `A link to choose a password was sent to ${email}. Open it on this device.`;
}
