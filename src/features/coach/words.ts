/**
 * Every fixed string the coach shows a person, in one place, so `words.test.ts` can hold all of them
 * to the morning page's banned list (no shame, sentence case, no exclamation marks). Pure.
 *
 * The facts in "What the coach sees" must stay true of the code: what is sent is `buildCoachRequest`
 * (./request.ts) and, only while "Share my week" is on, `buildCoachNote` (./note.ts); the server is
 * supabase/functions/coach-chat, which keeps a daily count of questions and token totals, never the
 * words. If what is sent or who receives it changes, change these words and raise
 * COACH_CONSENT_VERSION (./consent.ts) together with the server's.
 */
import { graceLine, moreAfter, plusLink, type LimitInfo } from '@/features/ai/limit';
import { formatNumber } from '@/lib/units';
import type { MealType } from '@/types';

export const COACH_TITLE = 'Coach';
/** The header's Coach cup (./CoachEntry.tsx): its label, and its label while an answer waits unread. */
export const COACH_OPEN_LABEL = 'Coach';
export const COACH_OPEN_NEW = 'Coach, new answer';

/** The header's short line: whether a typed question takes the week with it (`shareLine`, ./starters.ts). */
export const SHARE_ON_LINE = 'Sees your week';
export const SHARE_OFF_LINE = 'Does not see your week';
export const PHONE_ONLY_LINE = 'Answers from this phone';

export const INPUT_PLACEHOLDER_NARROW = 'Ask the coach';
/** The field with a backend and nobody signed in: Send keeps the words and opens sign-in (fix X11, `composerMode`). */
export const INPUT_PLACEHOLDER_SIGN_IN = 'Sign in to ask the AI coach';
/** The field in a build with no backend (the hosted preview): Send does nothing. */
export const INPUT_PLACEHOLDER_NO_BACKEND = 'Typed questions need the app with an account';
/** The same, for a phone's field, where the long one does not fit on one line (src/app/coach.tsx `NO_BACKEND_ROOM`). */
export const INPUT_PLACEHOLDER_NO_BACKEND_SHORT = 'Typing needs an account';
export const SEND_SIGN_IN_LABEL = 'Sign in to send';
export const SEND_OFF_LABEL = 'Send, needs the app with an account';
export const INPUT_LABEL = 'Your question for the coach';
export const SEND_LABEL = 'Send';
export const ABOUT_OPEN_LABEL = 'What the coach sees';
/** The field's cap, the server's: 500 characters, counted as `.length`. */
export const MESSAGE_MAX = 500;

export const LOCAL_TRAINING_QUESTION = 'How is my training week?';
/** "Ideas for dinner", "Ideas for a snack". */
export function localIdeasQuestion(meal: MealType): string {
  return meal === 'snack' ? 'Ideas for a snack' : `Ideas for ${meal}`;
}
export const LOCAL_MARK = 'From your data, on this phone';
export const AI_MARK = 'AI coach';
export const SEE_ALL_FITS = 'See all that fits';
export const FEW_LEFT_ANSWER = 'Under 150 kcal left: no meal ideas. What fits lists your own foods that fit.';

// ------------------------------------------------------------------ the first view: greeting, starters, disclaimer

/** The line under the greeting before anything is logged (`helloLine`, ./starters.ts). */
export const HELLO_FRESH = 'Ask about training, food, sleep or water.';

/** The starter tiles' captions: where the answer comes from. */
export const PHONE_TILE_CAPTION = 'From your data';
export const AI_TILE_CAPTION = 'AI coach';
export const SIGN_IN_STARTER = 'Sign in to ask the AI coach anything';
export const SIGN_IN_CAPTION = 'Free with an account';
export const DISCLAIMER = 'AI answers can be wrong. Not medical advice.';

/** The AI starters, in the order `coachStarters` (./starters.ts) tries them. */
export const STARTER_AFTER_WORKOUT = 'What helps after today’s workout?';
export const STARTER_PROTEIN = 'Easy ways to add protein today';
export const STARTER_PLAN = 'Plan my next week of workouts';
export const STARTER_WATER = 'How much water around a workout?';

// ------------------------------------------------------------------ waiting, the cards, the chat's days

export const WAIT_SHARED = 'Reading your week';
export const WAIT_PLAIN = 'Writing an answer';
export const WAIT_LONG = 'Taking longer than usual';

export const TRAINING_CARD_OVERLINE = 'Last 7 days';

/** The ideas card's head: "941 kcal left for dinner", "120 kcal left for a snack". */
export function ideasHead(kcalLeft: number, meal: MealType): string {
  const n = formatNumber(Math.max(0, Math.round(kcalLeft)));
  return `${n} kcal left for ${meal === 'snack' ? 'a snack' : meal}`;
}

/** An idea row's add cup: "Add Tuesday's dinner to dinner", "Add Greek yogurt bowl to snacks". */
export function ideaAddLabel(name: string, meal: MealType): string {
  return `Add ${name} to ${meal === 'snack' ? 'snacks' : meal}`;
}

/** The composer's counter near the cap: "460 / 500". */
export function countLine(n: number): string {
  return `${n} / ${MESSAGE_MAX}`;
}

/** From how many characters the counter shows. */
export const COUNT_FROM = 400;
export const IDEA_ADDED = 'Added';
export const DAY_TODAY = 'Today';
export const DAY_YESTERDAY = 'Yesterday';
/** The follow-up chip after the first AI answer while the week is not shared (ruling L6). */
export const FOLLOW_SHARE = 'Let the coach see my week';

export const REFER_LINE = 'If you are at risk of harm now, call your local emergency number. findahelpline.com lists free lines in every country.';

export const TRY_AGAIN = 'Try again';
export const SIGN_IN = 'Sign in';
export const CLEAR_CHAT = 'Clear chat';
export const CHAT_CLEARED = 'Chat cleared.';

// ------------------------------------------------------------------ the app's answers when the AI cannot answer

export type CoachNoticeKind =
  | 'account'
  | 'under18'
  | 'unconfirmed'
  | 'daily_limit'
  | 'shared_limit'
  | 'busy'
  | 'timeout'
  | 'upstream'
  | 'declined'
  | 'not_configured'
  | 'too_large'
  | 'network'
  | 'failed';

/** What the app says, and whether "Try again" is offered (only where asking again soon has a fair chance). */
export const NOTICE: Record<CoachNoticeKind, { text: string; retry: boolean }> = {
  account: { text: 'The AI coach needs an account. Questions marked From your data work without one.', retry: false },
  under18: { text: 'The AI coach is for people aged 18 and over. Questions marked From your data still work.', retry: false },
  unconfirmed: { text: 'Confirm your email address to use the AI coach.', retry: false },
  daily_limit: { text: '30 questions today. They reset at midnight UTC.', retry: false },
  shared_limit: { text: 'The AI coach is busy for today. It is back after midnight UTC.', retry: false },
  busy: { text: 'The AI coach is busy right now. Try again in a moment.', retry: true },
  timeout: { text: 'The AI coach took too long to answer.', retry: true },
  upstream: { text: 'The AI coach could not answer right now.', retry: true },
  declined: { text: 'The coach cannot help with that question. Try asking it another way.', retry: false },
  not_configured: { text: 'The AI coach is not set up yet.', retry: false },
  too_large: { text: 'That message is too long to send.', retry: false },
  network: { text: 'No connection. Check your internet.', retry: true },
  failed: { text: 'The question could not be sent.', retry: true },
};

// ------------------------------------------------------------------ the limit with plans on (@/features/ai/limit)
// With plans off, or from a server that does not send the plan fields, the notice is NOTICE's, as before.

/**
 * The free way that still works at the limit, named by the caption the phone questions carry (fix X13:
 * not "the two buttons above", which are no longer above once the chat has scrolled).
 */
const PHONE_STILL = 'Questions marked From your data still work.';

/**
 * The limit notice with plans on: the number of questions, the free way first (the phone questions), the
 * reset in the phone's clock, and the earlier allowance's end while it applies. The plan link is apart
 * (`coachPlansLink`, `coach-limit-plans`), only on the free plan.
 */
export function coachLimitText(info: LimitInfo): string {
  const after = moreAfter(info.resetsAt);
  if (info.shared) return `The AI coach is busy for today. ${PHONE_STILL} ${after}`;
  const count = info.limit === 1 ? '1 question today.' : `${info.limit} questions today.`;
  return [count, PHONE_STILL, after, graceLine(info.graceUntil)].filter(Boolean).join(' ');
}

/** The coach's plan link: "Plus gives 30 a day" (the number from the plan the app was told about). */
export function coachPlansLink(plusQuestions: number | null): string {
  return plusLink(plusQuestions);
}

// ------------------------------------------------------------------ what the coach sees, and the consent

export const ABOUT_TITLE = 'What the coach sees';
export const CONSENT_TITLE = 'Before your first question';
export const CONSENT_INTRO = 'A question to the AI coach leaves this device. This is exactly what happens.';
/**
 * The consent's first layer (fix X12): two sentences, each true and complete by itself, over the switch
 * and the two buttons. The facts (`COACH_FACTS`) are one row below, under `CONSENT_DETAILS`.
 */
export const CONSENT_LEAD: readonly string[] = [
  'Your question goes to HealthCal’s server and from there to Anthropic’s AI, Claude, to be answered. Your week goes with it while Share my week is on, and never otherwise.',
  'AI answers can be wrong, and this is not medical advice.',
];
export const CONSENT_DETAILS = 'Details';
export const CONSENT_DETAILS_HIDE = 'Hide details';

/** The facts, the same in the consent sheet and in "What the coach sees". */
export const COACH_FACTS: readonly { title: string; body: string }[] = [
  {
    title: 'What is sent',
    body: 'What you type, with your last few questions and the coach’s answers to them. Your week goes with it when "Share my week" is on, exactly as "See what is sent" shows it.',
  },
  {
    title: 'What is not sent',
    body: 'With sharing off, the coach cannot see your diary, workouts or any health data. Answers marked "From your data, on this phone" are worked out here and never sent.',
  },
  {
    title: 'Who receives it',
    body: 'HealthCal’s server, which passes it to Anthropic, the maker of Claude, so its AI can answer.',
  },
  {
    title: 'What happens to it',
    body: 'HealthCal’s server keeps a daily count of your questions, not the words. Anthropic does not use it to train its models and normally deletes it within 30 days (longer if its safety checks flag a message).',
  },
  {
    title: 'Answers can be wrong',
    body: 'The coach gives general guidance, not medical advice. The chat is kept on this phone and is not in the export.',
  },
];

export const SHARE_LABEL = 'Share my week with the coach';
export const SHARE_HINT =
  'A short summary written on this phone: calories, training, sleep, the weight trend, and protein and water as shares of the targets. Never your name, email, body weight, age, notes or food names.';
export const SEE_WHAT_IS_SENT = 'See what is sent';
export const HIDE_WHAT_IS_SENT = 'Hide what is sent';
export const NOTE_EMPTY = 'Nothing to share yet: log some food, a workout or a night of sleep first.';
export const NOTE_APPLE = 'On iPhone, data from Apple Health is not included.';
export const ABOUT_WITHDRAW_HINT = 'Switch sharing off here at any time. To withdraw everything, go to About HealthCal, under Privacy.';

export const CONSENT_AGREE = 'Agree and send';
export const CONSENT_NOT_NOW = 'Not now';
export const CONSENT_NOT_NOW_HINT = 'Not now sends nothing. Your question stays in the field, and questions marked From your data still work.';
export const ABOUT_DONE = 'Done';

// ------------------------------------------------------------------ About > Privacy, the erase sheet, the export

export const ABOUT_ROW_TITLE = 'Coach chat';
export function aboutStatus(agreedOn: string | null): string {
  return agreedOn ? `Coach chat: you agreed on this device on ${agreedOn}.` : 'Coach chat: not agreed on this device. HealthCal asks before your first question.';
}
export const ABOUT_ROW_BUTTON = 'What the coach chat sends';
export const WITHDRAW = 'Withdraw agreement';
export const WITHDRAWN = 'Agreement withdrawn and the chat cleared. HealthCal asks again before the next question.';
export const EXPORT_NOTE = 'The coach chat is kept on this phone and is not in the export.';

// ------------------------------------------------------------------ "Report this answer" (./report.ts, ./ReportSheet.tsx)
// On the AI's answers only, never on a phone answer or a notice. What a report holds is `buildReportRow`.

export const REPORT_OPEN = 'Report';
export const REPORT_OPEN_LABEL = 'Report this answer';
export const REPORTED = 'Reported';
export const REPORT_TITLE = 'Report this answer';
export const REPORT_REASON_LABEL = 'What is the problem?';
/** The reasons, in the order shown; the ids are the ai_reports table's (supabase/migrations/20261123000100_ai_reports.sql). */
export const REPORT_REASONS: Record<'unsafe' | 'wrong' | 'offensive' | 'off_topic' | 'other', { text: string }> = {
  unsafe: { text: 'Unsafe' },
  wrong: { text: 'Wrong' },
  offensive: { text: 'Offensive' },
  off_topic: { text: 'Off topic' },
  other: { text: 'Something else' },
};
export const REPORT_WITH_QUESTION = 'Also send my question';
export const REPORT_WHAT_IS_SENT = 'This answer goes to HealthCal so it can be looked at. Your question is added if you tick the box, and left out if you do not.';
export const REPORT_SEND = 'Send';
export const REPORT_SENT = 'Report sent. Thank you.';
/** A report that did not go: what the app says (a toast; the sheet stays open so it can be sent again). */
export const REPORT_NOT_SENT: Record<'network' | 'limit' | 'account' | 'failed', { text: string }> = {
  network: { text: 'No connection. The report was not sent.' },
  limit: { text: 'That is today’s limit of reports.' },
  account: { text: 'Sign in to send a report.' },
  failed: { text: 'The report could not be sent. Try again later.' },
};

/**
 * The line over the preview in "What is sent" (ruling R17): how many earlier exchanges go with a typed
 * question for this person now. `pairs` is `pairsToSend(usePlan().limits.memoryPairs)`.
 */
export function sentWithLine(pairs: number): string {
  const earlier =
    pairs <= 0
      ? 'Each question you type goes to the AI coach by itself.'
      : pairs === 1
        ? 'Each question you type goes to the AI coach with your last question and its answer.'
        : `Each question you type goes to the AI coach with your last ${pairs} questions and their answers.`;
  return `${earlier} The summary below goes with it while "Share my week" is on.`;
}
