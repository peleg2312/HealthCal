/**
 * The coach (/coach, src/app/coach.tsx) without a backend: empty, the two answers given on the phone,
 * a typed question answered by the needs-an-account line, a question in Hebrew, "What the coach sees"
 * with and without the preview of "Share my week", the consent sheet (opened by the test hook
 * ?consentDemo=1, since a build without accounts never asks), and long content. The AI's answers
 * need an account: scripts/dev/e2e-backend.cjs captures them (--shots) against the stand-in; here the
 * test hook ?reportDemo=1 shows one AI answer (never stored), for "Report this answer" and its sheet.
 * "See what is sent" opens its own sheet over the coach's, so the whole note is in its first view.
 *
 *   node scripts/dev/evidence.cjs --states=coach --url=<a with-build.cjs build>
 */
const LONG = 'How should I spread three runs, two gym sessions and a long walk over a week when I also want one full rest day?';

module.exports = [
  { id: 'coach-empty', route: '/coach', waitFor: 'coach-empty', note: 'the coach before anything is asked' },
  { id: 'coach-local', route: '/coach', taps: ['coach-local-training', 'coach-local-ideas'], waitFor: 'coach-local-answer', note: 'both questions answered on the phone' },
  { id: 'coach-local-stress', route: '/coach', data: 'stress', taps: ['coach-local-training', 'coach-local-ideas'], waitFor: 'coach-local-answer', note: 'the phone answers with long names and big numbers' },
  { id: 'coach-no-account', route: '/coach', taps: [{ type: 'coach-input', text: LONG }, 'coach-send'], waitFor: 'coach-notice', note: 'a typed question without an account' },
  { id: 'coach-hebrew', route: '/coach', taps: [{ type: 'coach-input', text: 'כמה ימי מנוחה כדאי לי בשבוע?' }, 'coach-send'], waitFor: 'coach-notice', note: 'a question in Hebrew, laid out right to left' },
  { id: 'coach-about', route: '/coach', taps: ['coach-about'], sheet: true, waitFor: 'coach-about-sheet', note: 'What the coach sees, sharing off' },
  { id: 'coach-about-preview', route: '/coach', taps: ['coach-about', 'coach-share', 'coach-note-preview'], sheet: true, waitFor: 'coach-note-text', note: 'Share my week on, with what is sent' },
  { id: 'coach-consent', route: '/coach?consentDemo=1', sheet: true, waitFor: 'coach-consent', note: 'the consent sheet: the "Share my week" switch in its first view, off' },
  { id: 'coach-consent-preview', route: '/coach?consentDemo=1', taps: ['coach-share', 'coach-note-preview'], sheet: true, waitFor: 'coach-note-text', note: 'the consent sheet with sharing on and what is sent in view' },
  { id: 'coach-consent-preview-stress', route: '/coach?consentDemo=1', data: 'stress', taps: ['coach-share', 'coach-note-preview'], sheet: true, waitFor: 'coach-note-text', note: 'what is sent with the long demo week: the longest note the seed makes, whole in the sheet’s first view' },
  { id: 'coach-report', route: '/coach?reportDemo=1', waitFor: 'coach-report-1', note: 'an AI answer with its quiet Report control beside the AI mark' },
  { id: 'coach-report-sheet', route: '/coach?reportDemo=1', taps: ['coach-report-1'], sheet: true, waitFor: 'coach-report-sheet', note: 'Report this answer: the reasons, the tick off, what is sent, Send waiting for a reason' },
  { id: 'coach-report-sheet-chosen', route: '/coach?reportDemo=1', taps: ['coach-report-1', 'coach-report-reason-off_topic', 'coach-report-question'], sheet: true, waitFor: 'coach-report-sheet', note: 'a reason chosen and the question ticked' },
  { id: 'coach-report-not-sent', route: '/coach?reportDemo=1', taps: ['coach-report-1', 'coach-report-reason-wrong', 'coach-report-send'], sheet: true, waitFor: 'coach-report-sheet', note: 'Send without an account: "Sign in to send a report." over the sheet, which stays open' },
  { id: 'coach-fits', route: '/coach', taps: ['coach-local-ideas', 'coach-local-fits'], sheet: true, waitFor: 'fits-intro', note: 'the ideas answer opens What fits' },
];
