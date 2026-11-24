/**
 * The AI limits with plans on (src/features/ai/limit.ts, the coach's `coachLimitText`): the estimate's
 * limit on the free plan with its quiet plan link (`ai-limit-plans`), the shared ceiling, and the
 * coach's limit notice with its link (`coach-limit-plans`). They need accounts and plans on, so they
 * are listed only with --backend, against a build with the stand-in backend started with plans on:
 *
 *   EXPO_PUBLIC_SUPABASE_URL=http://localhost:54361 EXPO_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-local-end-to-end-tests \
 *     EXPO_PUBLIC_E2E=1 npx expo export --platform web --output-dir <dir>
 *   node scripts/dev/mock-backend.cjs --port=54361 --static=<dir> --static-port=8261 --plans=on &
 *   curl -X POST http://localhost:54361/auth/v1/signup -H 'Content-Type: application/json' \
 *     -d '{"email":"limits.free@example.com","password":"correct horse battery"}'
 *   node scripts/dev/evidence.cjs --backend --states=limits --url=http://localhost:8261 --out=<dir>
 *
 * The stand-in's words "daily limit" and "shared limit" give the limit answers without using the
 * allowance, so every capture shows the same thing. Plus at its limit draws today's layout with its
 * own number and no link, and the careful estimate's lines use the allowance: e2e-backend.cjs's
 * "plans" block checks and photographs those (--shots).
 */
const EMAIL = 'limits.free@example.com';
const PASSWORD = 'correct horse battery';
const signIn = [{ type: 'auth-email-input', text: EMAIL }, { type: 'auth-password-input', text: PASSWORD }, 'auth-submit', { wait: 3000 }];
const describe = (words) => ['tab-add', 'quick-describe', { wait: 800 }, { type: 'ai-description', text: words }, 'ai-analyse', 'ai-consent-agree', { wait: 2500 }];

const backend = [
  { id: 'limits-ai-free', route: '/auth?mode=signin', taps: [...signIn, ...describe('daily limit check')], waitFor: 'ai-limit-plans', note: 'the estimate at the free plan’s limit: the number, the free ways first, the reset in local time, one quiet link' },
  { id: 'limits-ai-shared', route: '/auth?mode=signin', taps: [...signIn, ...describe('shared limit check')], waitFor: 'ai-error-daily_limit', absent: ['ai-limit-plans'], note: 'the shared ceiling: busy for today, no plan link' },
  {
    id: 'limits-coach-free',
    route: '/auth?mode=signin',
    taps: [...signIn, 'today-coach-open', { wait: 800 }, { type: 'coach-input', text: 'daily limit please' }, 'coach-send', 'coach-consent-agree', { wait: 2500 }],
    waitFor: 'coach-limit-plans',
    note: 'the coach at the free plan’s limit: the notice and its quiet link',
  },
];

module.exports = process.argv.includes('--backend') ? backend : [];
