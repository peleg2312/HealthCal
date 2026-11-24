/**
 * The coach (/coach, src/app/coach.tsx) without a backend: empty, the two answers given on the phone,
 * a typed question with no backend (the placeholder says so and Send does nothing), a question in Hebrew in the field, "What the coach sees"
 * with and without the preview of "Share my week", the consent sheet (opened by the test hook
 * ?consentDemo=1, since a build without accounts never asks), and long content. The AI's answers
 * need an account: scripts/dev/e2e-backend.cjs captures them (--shots) against the stand-in; here the
 * test hook ?reportDemo=1 shows one AI answer (never stored), for "Report this answer" and its sheet.
 * "See what is sent" opens its own sheet over the coach's, so the whole note is in its first view.
 *
 * The coach is entered from the Coach cup on every tab header (src/features/coach/CoachEntry.tsx); the
 * tab headers themselves are in tabs.cjs (tabs-header-*). The states that need an account (an AI starter,
 * the waiting row, the unread mark on the header's cup) are listed only with --backend, against a build
 * with the stand-in backend and an account made first, as in limits.cjs:
 *
 *   curl -X POST http://localhost:54361/auth/v1/signup -H 'Content-Type: application/json' \
 *     -d '{"email":"coach.states@example.com","password":"correct horse battery"}'
 *   node scripts/dev/evidence.cjs --backend --states=coach --only=coach-starter-ai-filled,... --url=http://localhost:8261 --out=<dir>
 *
 * The stand-in answers "wait N seconds" N seconds later (scripts/dev/mock-backend.cjs), so the waiting row
 * is on screen when the capture is taken.
 *
 *   node scripts/dev/evidence.cjs --states=coach --url=<a with-build.cjs build>
 */
const LONG = 'How should I spread three runs, two gym sessions and a long walk over a week when I also want one full rest day?';

// A clock in the evening with half of today's budget eaten, so the ideas card has meals that fit.
const evening = (() => {
  const d = new Date();
  d.setHours(18, 30, 0, 0);
  return d.getTime();
})();

const local = [
  { id: 'coach-empty', route: '/coach', waitFor: 'coach-empty', note: 'the coach before anything is asked' },
  { id: 'coach-local', route: '/coach', taps: ['coach-local-training', 'coach-local-ideas'], waitFor: 'coach-local-answer', note: 'both questions answered on the phone' },
  { id: 'coach-local-stress', route: '/coach', data: 'stress', taps: ['coach-local-training', 'coach-local-ideas'], waitFor: 'coach-local-answer', note: 'the phone answers with long names and big numbers' },
  { id: 'coach-no-account', route: '/coach', taps: [{ type: 'coach-input', text: LONG }], waitFor: 'coach-input', absent: ['coach-notice', 'coach-question', 'coach-sign-in'], note: 'a typed question with no backend: Send stays the outline cup (it does nothing, so it is not tapped), no sign-in offered' },
  { id: 'coach-hebrew', route: '/coach', taps: [{ type: 'coach-input', text: 'כמה ימי מנוחה כדאי לי בשבוע?' }], waitFor: 'coach-input', note: 'a question in Hebrew in the field' },
  { id: 'coach-about', route: '/coach', taps: ['coach-about'], sheet: true, waitFor: 'coach-about-sheet', note: 'What the coach sees, sharing off' },
  { id: 'coach-about-preview', route: '/coach', taps: ['coach-about', 'coach-share', 'coach-note-preview'], sheet: true, waitFor: 'coach-note-text', note: 'Share my week on, with what is sent' },
  { id: 'coach-consent', route: '/coach?consentDemo=1', sheet: true, waitFor: 'coach-consent', note: 'the consent sheet: the "Share my week" switch in its first view, off' },
  { id: 'coach-consent-details', route: '/coach?consentDemo=1', taps: ['coach-details'], sheet: true, waitFor: 'coach-details-body', note: 'the consent with "Details" open: the four facts as worded' },
  { id: 'coach-consent-preview', route: '/coach?consentDemo=1', taps: ['coach-share', 'coach-note-preview'], sheet: true, waitFor: 'coach-note-text', note: 'the consent sheet with sharing on and what is sent in view' },
  { id: 'coach-consent-preview-stress', route: '/coach?consentDemo=1', data: 'stress', taps: ['coach-share', 'coach-note-preview'], sheet: true, waitFor: 'coach-note-text', note: 'what is sent with the long demo week: the longest note the seed makes, whole in the sheet’s first view' },
  { id: 'coach-report', route: '/coach?reportDemo=1', waitFor: 'coach-report-1', note: 'an AI answer with its quiet Report control beside the AI mark' },
  { id: 'coach-wait-demo', route: '/coach?waitDemo=1', waitFor: 'coach-typing', note: 'the waiting row without a backend (test hook ?waitDemo=1): the AI cup with its drop, its level line in view, beside "Writing an answer"' },
  { id: 'coach-report-sheet', route: '/coach?reportDemo=1', taps: ['coach-report-1'], sheet: true, waitFor: 'coach-report-sheet', note: 'Report this answer: the reasons, the tick off, what is sent, Send waiting for a reason' },
  { id: 'coach-report-sheet-chosen', route: '/coach?reportDemo=1', taps: ['coach-report-1', 'coach-report-reason-off_topic', 'coach-report-question'], sheet: true, waitFor: 'coach-report-sheet', note: 'a reason chosen and the question ticked' },
  { id: 'coach-report-not-sent', route: '/coach?reportDemo=1', taps: ['coach-report-1', 'coach-report-reason-wrong', 'coach-report-send'], sheet: true, waitFor: 'coach-report-sheet', note: 'Send without an account: "Sign in to send a report." over the sheet, which stays open' },
  { id: 'coach-fits', route: '/coach', taps: ['coach-local-ideas', 'coach-local-fits'], sheet: true, waitFor: 'fits-intro', note: 'the ideas answer opens What fits' },
  // The redesign (r14): the first view, the live answer cards, the follow-ups, the arrival from the overview, the field.
  { id: 'coach-empty-signed-out', route: '/coach', data: 'empty', waitFor: 'coach-empty', absent: ['coach-ai-starter-0'], note: 'the first view with nothing logged and no account: no AI starter to send' },
  { id: 'coach-training-card', route: '/coach', taps: ['coach-local-training'], waitFor: 'coach-training-chart', note: 'the training answer as a live card with its weeks' },
  { id: 'coach-ideas-card', route: '/coach', now: evening, values: { eaten: 0.5 }, taps: ['coach-local-ideas'], waitFor: 'coach-local-answer', note: 'the ideas answer: meals that fit, each with its add cup' },
  { id: 'coach-idea-added', route: '/coach', now: evening, values: { eaten: 0.5 }, taps: ['coach-local-ideas', 'coach-idea-add-0'], waitFor: 'coach-idea-added-0', note: 'an idea logged from the chat: "Added" in its row' },
  { id: 'coach-ask-training', route: '/coach?ask=training', waitFor: 'coach-training-chart', note: 'arriving from the overview\'s "Ask the coach": already answered' },
  { id: 'coach-follow', route: '/coach', taps: ['coach-local-training'], waitFor: 'coach-follow', note: 'the follow-up chip under the newest answer' },
  { id: 'coach-keyboard', route: '/coach', taps: [{ type: 'coach-input', text: 'How many rest days should I take\nwhen I run three times a week\nand lift twice?' }], waitFor: 'coach-input', note: 'a three-line question in the growing field' },
  { id: 'coach-about-clear', route: '/coach', taps: ['coach-local-training', 'coach-about'], sheet: true, waitFor: 'coach-clear', note: 'What the coach sees, with Clear chat above Done' },
  {
    id: 'coach-stress',
    route: '/coach',
    data: 'stress',
    taps: ['coach-local-training', { type: 'coach-input', text: 'כמה ימי מנוחה כדאי לי בשבוע כשאני רץ שלוש פעמים ומרים משקולות פעמיים?' }],
    waitFor: 'coach-local-answer',
    note: 'long content: the training card and a long Hebrew question in the growing field',
  },
];

const EMAIL = 'coach.states@example.com';
const PASSWORD = 'correct horse battery';
const signIn = [{ type: 'auth-email-input', text: EMAIL }, { type: 'auth-password-input', text: PASSWORD }, 'auth-submit', { wait: 3000 }];
const ask = (words) => [{ type: 'coach-input', text: words }, 'coach-send', 'coach-consent-agree'];

const backend = [
  { id: 'coach-signed-out', route: '/coach', waitFor: 'coach-input', note: 'signed out with a backend: "Sign in to ask the AI coach" in the field' },
  { id: 'coach-hebrew-bubble', route: '/auth?mode=signin', taps: [...signIn, 'today-coach-open', { wait: 800 }, ...ask('כמה ימי מנוחה כדאי לי בשבוע?'), { wait: 1500 }], waitFor: 'coach-question', note: 'a question in Hebrew as a bubble, laid out right to left, and its answer' },
  { id: 'coach-starter-ai-filled', route: '/auth?mode=signin', taps: [...signIn, 'today-coach-open', { wait: 800 }, 'coach-ai-starter-0', 'coach-consent-not-now'], waitFor: 'coach-input', absent: ['coach-consent'], note: 'an AI starter before agreeing, after "Not now": its words in the field, nothing sent' },
  { id: 'coach-waiting', route: '/auth?mode=signin', taps: [...signIn, 'today-coach-open', { wait: 800 }, ...ask('wait 6 seconds please'), { wait: 900 }], waitFor: 'coach-typing', note: 'the waiting row: the mark pouring beside "Writing an answer"' },
  { id: 'coach-waiting-long', route: '/auth?mode=signin', taps: [...signIn, 'today-coach-open', { wait: 800 }, ...ask('wait 20 seconds please'), { wait: 11000 }], waitFor: 'coach-typing', note: 'after 10 s: "Taking longer than usual"' },
  { id: 'coach-unread', route: '/auth?mode=signin', taps: [...signIn, 'today-coach-open', { wait: 800 }, ...ask('wait 2 seconds please'), 'header-close', { wait: 3500 }], waitFor: 'today-coach-open-unread', note: 'an answer that landed with the coach closed: the level line on the header\'s Coach cup' },
];

module.exports = process.argv.includes('--backend') ? [...local, ...backend] : local;
