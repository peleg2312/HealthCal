/**
 * Every fixed string about the plan, as pure functions (held to ruling R19 and the morning page's
 * banned list by words.test.ts). Screens only place them.
 *
 * R19: no "upgrade", "unlock", "premium", "run out", "don't miss", "limited time", "free users",
 * "last chance", no exclamation mark and no countdown. The free way comes first; nothing blames.
 * No sentence names a payment company.
 */
import { PLAN_FULL_NAME, PLAN_NAME } from './channel';
import { yearSaving } from './saving';
import { isEnding, paymentLate, holdsPlus, type PlanLimits, type PlanOffer, type PlanPeriod, type PlanSource, type PlanView } from './view';

// ------------------------------------------------------------------ lines

/**
 * A line that may wrap keeps its last words together (no-break spaces), so its last line never holds
 * one word alone: "… barcode / and the diary", not "… and the / diary". Short lines are left as they
 * are. For the screen only: a screen reader's label and a test compare the plain words.
 */
export function tieEnd(text: string, words = 3): string {
  const parts = text.split(' ');
  if (words < 2 || parts.length < words + 2) return text;
  return `${parts.slice(0, -words).join(' ')} ${parts.slice(-words).join('\u00A0')}`;
}

/** A date inside a sentence stays on one line: "Nov 29, 2026" never breaks after the comma, nor "Dec 5" after the month. For the screen only. */
export function tieDates(text: string): string {
  return text.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:, (\d{4}))?/g, (_m, mon: string, day: string, year?: string) => (year ? `${mon}\u00A0${day},\u00A0${year}` : `${mon}\u00A0${day}`));
}

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

/** A price tile's amount, one unbroken run: "CHF 129.90" never parts its code from its number. For the screen only. */
export function amountText(o: Pick<PlanOffer, 'amount' | 'currency'>): string {
  return formatMoney(o.amount, o.currency).replace(/ /g, '\u00A0');
}

/** A line about money keeps a currency code with its number and its last two words together: "About CHF 10.83 a month". For the screen only. */
export function tieMoney(text: string | null): string | null {
  return text === null ? null : tieEnd(text.replace(/\b([A-Z]{2,3}) (?=\d)/g, '$1\u00A0'), 2);
}

/** A price tile's unit, kept whole when it goes under the amount: "a month". For the screen only. */
export function unitText(period: PlanPeriod): string {
  return `a\u00A0${EVERY[period]}`;
}

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

/**
 * The pinned button: names the price and the period. When that is longer than `maxChars` (a long price on a
 * narrow phone, "CHF 14.90 a month" at 320 px) it names the price only: the renewal sentence directly above it
 * names the period in full, so the button is never cut short with an ellipsis.
 */
export function subscribeLabel(o: Pick<PlanOffer, 'amount' | 'currency' | 'period'>, maxChars = Infinity): string {
  const full = `Subscribe for ${priceLine(o)}`;
  return full.length <= maxChars ? full : `Subscribe for ${formatMoney(o.amount, o.currency)}`;
}

/** How many characters the pinned button holds before `subscribeLabel` drops the period. */
export function subscribeLabelRoom(windowWidth: number): number {
  return windowWidth < 360 ? 27 : 34;
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

/** Under the monthly tile's price, where the yearly tile says its price per month. */

type Priced = Pick<PlanOffer, 'amount' | 'currency' | 'period' | 'taxIncluded'>;

/**
 * "Yearly costs $17.89 less than 12 monthly payments.": the plain sum from the two prices the server
 * sent (./saving.ts), or null when it would not be exact (another currency, another answer about tax,
 * or a year that is not the smaller sum).
 */
export function yearSavingLine(month: Priced | null | undefined, year: Priced | null | undefined): string | null {
  const less = yearSaving(month, year);
  if (less === null || !year) return null;
  return `Yearly costs ${formatMoney(less, year.currency)} less than 12 monthly payments.`;
}

/** Under the two tiles: the saving, then the tax note of the price chosen. */
export function savingAndTax(month: Priced | null | undefined, year: Priced | null | undefined, chosen: Pick<PlanOffer, 'taxIncluded'>): string | null {
  const tax = taxNote(chosen);
  const line = [yearSavingLine(month, year), tax ? `${tax}.` : null].filter(Boolean).join(' ');
  return line || null;
}

/** What a price tile reads to a screen reader: "Monthly, $3.99 a month, selected". */
export function tileLabel(o: Pick<PlanOffer, 'amount' | 'currency' | 'period'>, selected: boolean): string {
  const per = monthlyEquivalent(o);
  return [periodLabel(o.period), priceLine(o), per ? per.charAt(0).toLowerCase() + per.slice(1) : null, selected ? 'selected' : null].filter(Boolean).join(', ');
}

// ------------------------------------------------------------------ the screen

export const PLAN_TITLE = 'Plan';
export const PLAN_INTRO_LEAD = 'Everything on your phone stays free.';
export const PLAN_INTRO_MORE = `${PLAN_NAME} gives the AI estimate and the coach more each day.`;
/** The two lines as one sentence pair (a screen reader, an older reader). */
export const PLAN_INTRO = `${PLAN_INTRO_LEAD} ${PLAN_INTRO_MORE}`;
/** Under a column's title, on the plan the person holds. */
export const YOUR_PLAN_TAG = 'Your plan';
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
/** The signed-out page: a title, one sentence and the button that does it. */
export const SIGNED_OUT_TITLE = 'Plans come with an account';
export const SIGNED_OUT_BODY = 'Everything on your phone works without one.';
export const SIGN_IN_ACTION = 'Sign in';
export const OFF_TITLE = 'Nothing to choose';
export const LOADING_LINE = 'Reading your plan.';
export const WAITING_LINE = 'Waiting for the payment to arrive. This takes a few seconds.';
/** The payment that has not arrived, as a title and what follows it; `LATE_LINE` is the two as one line. */
export const LATE_TITLE = 'The payment has not arrived yet';
export const LATE_MORE = 'It can take a minute, and this page looks again when you come back to it. If you closed the payment page, nothing was charged.';
export const LATE_LINE = `${LATE_TITLE}. ${LATE_MORE}`;
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

/** The unit under a row's label in the comparison table, shared by both columns. */
export function rowUnit(key: CardRow['key']): string {
  return key === 'memory' ? 'earlier exchanges' : 'a day';
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

/** A failed renewal, said in two parts: the fact, then what happens and what the person can do. */
export const PAST_DUE_HEAD = 'The last renewal payment did not go through.';
export function pastDueDetail(v: Pick<PlanView, 'periodEnd' | 'paymentGraceUntil'>): string {
  const until = v.paymentGraceUntil ?? v.periodEnd;
  const card = `You can change the card in ${MANAGE_LABEL}.`;
  return until ? `${PLAN_NAME} stays on until ${fullDate(until)} while it is tried again. ${card}` : card;
}

/** For a subscriber: when the plan renews, ends, or is waiting on a payment. */
export function subscriberLine(v: Pick<PlanView, 'plan' | 'state' | 'periodEnd' | 'cancelAtPeriodEnd' | 'paymentGraceUntil' | 'period' | 'offers'>): string {
  if (paymentLate(v)) return `${PAST_DUE_HEAD} ${pastDueDetail(v)}`;
  if (!v.periodEnd) return `${PLAN_FULL_NAME} is on.`;
  if (isEnding(v)) return `Cancelled. ${PLAN_NAME} stays on until ${fullDate(v.periodEnd)}, then the Free allowance applies. Nothing you logged changes.`;
  const offer = v.period ? v.offers.find((o) => o.period === v.period) : undefined;
  return offer
    ? `Renews on ${fullDate(v.periodEnd)} at ${formatMoney(offer.amount, offer.currency)}. Cancel any time before then.`
    : `Renews on ${fullDate(v.periodEnd)}. Cancel any time before then.`;
}

/** The membership card's second line: "Since Nov 21", with the year when it is not this one. */
export function memberSince(startedAt: string | null, thisYear: number): string | null {
  if (!startedAt) return null;
  const d = new Date(startedAt);
  if (!Number.isFinite(d.getTime())) return null;
  return `Since ${d.getFullYear() === thisYear ? monthDay(startedAt) : fullDate(startedAt)}`;
}

/** Over the allowance table of someone who holds Plus. */
export const EACH_DAY_TITLE = `Each day with ${PLAN_NAME}`;
/** The same title once the plan is cancelled and runs to its end. */
export function eachDayUntil(periodEnd: string | null): string {
  return periodEnd ? `Each day until ${fullDate(periodEnd)}` : EACH_DAY_TITLE;
}

/** Under "Cancel subscription" and, alone, under either row: where the row leads. */
export const CANCEL_SUB = "On the payment company's page";
/** Under "Withdraw from the contract": "Within 14 days of buying, until Dec 5". */
export function withdrawSub(startedAt: string): string {
  return `Within 14 days of buying, until ${monthDay(new Date(Date.parse(startedAt) + 14 * 86_400_000).toISOString())}`;
}
/** Under the two rows when both show. */
export const BOTH_LEAD = "Both lead to the payment company's own page.";

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

// ------------------------------------------------------------------ what stays free

export const STAYS_FREE_TITLE = 'Free for good';
export const STAYS_FREE_IF_CANCEL = 'Stays yours if you cancel';
/** The same card once the plan is cancelled, or for a plan that ends by itself: there is nothing left to cancel. */
export const STAYS_FREE_AFTER_END = `Stays yours when ${PLAN_NAME} ends`;
/** Principle 7, as four rows; the fifth is the free AI allowance (`freeAiLine`). */
export const STAYS_FREE_ROWS = [
  'Logging, food search, barcode and the diary',
  'Water, drinks, sleep, fasting and weight',
  'Training, Health sync and workout import',
  'Your account, backup, sync, friends and full export',
] as const;
export const STAYS_FREE_NOTE = 'No ads, on any plan.';

/** "5 AI estimates and 5 coach questions a day": the free plan's own AI allowance. */
export function freeAiLine(l: Pick<PlanLimits, 'estimates' | 'questions'>): string {
  return `${l.estimates} AI ${l.estimates === 1 ? 'estimate' : 'estimates'} and ${l.questions} coach ${l.questions === 1 ? 'question' : 'questions'} a day`;
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
