// States for first run, account, profile, settings and trends (the format is in the header
// comment of scripts/dev/evidence.cjs). What a route alone does not show: every onboarding step
// in metric and imperial with a long name, field errors, sheets and confirm sheets, the sections
// and ranges of Progress, earlier and empty weeks, and long names and big numbers.
//
//   node scripts/dev/evidence.cjs --states=start --out=<dir> [--only=<id>]
//
// Builds made by with-build.cjs have no accounts, so the sign-in forms, the sign-in gate and the
// account screen's sheets need a build with a backend (see the README, "Testing accounts and sync
// locally"; export it with EXPO_PUBLIC_E2E=1 as well, or the runner never sees the app start), then
// run this list with --backend --url=<that build> and --only=<the ids under "accounts">.

// ------------------------------------------------------------------ onboarding, step by step
// Single-choice tiles move on by themselves 250 ms after the tap, so no Continue after them.
const LONG = 'Bartholomew-Christophe';
const settle = { wait: 700 };
const basics = (units) => [{ type: 'onb-name-input', text: LONG }, `onb-units-${units}`, 'onb-next'];
const goal = (units, g = 'lose') => [...basics(units), `onb-goal-${g}`, settle];
const sex = (units, g) => [...goal(units, g), 'onb-sex-female', settle];
const about = (units, g) => [...sex(units, g), { type: 'onb-dob-day', text: '15' }, { type: 'onb-dob-month', text: '6' }, { type: 'onb-dob-year', text: '1990' }, 'onb-next'];
const bodyAnswers = (units) =>
  units === 'imperial'
    ? [{ type: 'onb-height-ft', text: '5' }, { type: 'onb-height-in', text: '5' }, { type: 'onb-weight', text: '150' }]
    : [{ type: 'onb-height-cm', text: '165' }, { type: 'onb-weight', text: '68' }];
const body = (units, g) => [...about(units, g), ...bodyAnswers(units), 'onb-next'];
const bodyfat = (units, g) => [...body(units, g), 'onb-bf-unknown', settle];
const activity = (units, g) => [...bodyfat(units, g), 'onb-activity-light', settle];
const target = (units) => [...activity(units), { type: 'onb-target-input', text: units === 'imperial' ? '136' : '62' }, 'onb-next'];
const routine = (units, g = 'lose') => (g === 'maintain' ? activity(units, g) : target(units));
const theme = (units, g) => [...routine(units, g), 'onb-reminders-skip'];
const plan = (units, g) => [...theme(units, g), 'onb-next'];
const F = { route: '/onboarding', data: 'fresh' };

const onboarding = [
  { id: 'onb-basics-long', ...F, taps: [{ type: 'onb-name-input', text: LONG }], waitFor: 'onb-name-input', note: 'first question with a 22-character name' },
  { id: 'onb-basics-error', ...F, taps: ['onb-next'], waitFor: 'onb-name-input', note: 'Continue with no name: the field error' },
  { id: 'onb-sex', ...F, taps: goal('metric'), waitFor: 'onb-sex-female', note: 'sex question with its "why we ask"' },
  { id: 'onb-about-error', ...F, taps: [...sex('metric'), { type: 'onb-dob-day', text: '31' }, { type: 'onb-dob-month', text: '2' }, { type: 'onb-dob-year', text: '1890' }, 'onb-next'], waitFor: 'onb-dob-error', note: 'date of birth with an error' },
  { id: 'onb-about-filled', ...F, taps: [...sex('imperial'), { type: 'onb-dob-day', text: '15' }, { type: 'onb-dob-month', text: '6' }, { type: 'onb-dob-year', text: '1990' }], waitFor: 'onb-dob-summary', note: 'date of birth filled, the age summary' },
  { id: 'onb-body-metric', ...F, taps: [...about('metric'), ...bodyAnswers('metric')], waitFor: 'onb-height-cm', note: 'height and weight in cm and kg' },
  { id: 'onb-body-imperial', ...F, taps: [...about('imperial'), ...bodyAnswers('imperial')], waitFor: 'onb-height-ft', note: 'height and weight in ft in and lb' },
  { id: 'onb-body-empty-metric', ...F, taps: about('metric'), waitFor: 'onb-height-cm', note: 'height and weight before anything is typed: an empty field shows its unit only, never an example number that reads as an answer' },
  { id: 'onb-body-empty-imperial', ...F, taps: about('imperial'), waitFor: 'onb-height-ft', note: 'the same in ft, in and lb' },
  { id: 'onb-body-empty-error', ...F, taps: [...about('imperial'), 'onb-next'], waitFor: 'onb-height-ft', note: 'Continue with nothing typed: the errors sit under fields that are plainly empty' },
  { id: 'onb-target-empty', ...F, taps: activity('metric'), waitFor: 'onb-target-input', note: 'goal weight before anything is typed' },
  { id: 'onb-body-wide-metric', ...F, taps: [...about('metric'), { type: 'onb-height-cm', text: '178.5' }, { type: 'onb-weight', text: '142.6' }], waitFor: 'onb-height-cm', note: 'height and weight side by side with the longest numbers a person types' },
  { id: 'onb-body-wide-imperial', ...F, taps: [...about('imperial'), { type: 'onb-height-ft', text: '5' }, { type: 'onb-height-in', text: '10.5' }, { type: 'onb-weight', text: '250.5' }], waitFor: 'onb-height-ft', note: 'three cups in a row with the longest numbers' },
  { id: 'onb-body-error', ...F, taps: [...about('imperial'), { type: 'onb-height-ft', text: '9' }, { type: 'onb-weight', text: '20' }, 'onb-next'], waitFor: 'onb-height-ft', note: 'height and weight out of range, imperial' },
  { id: 'onb-bodyfat-tape', ...F, taps: [...body('imperial'), 'onb-bf-tape', { type: 'onb-neck-input', text: '13' }, { type: 'onb-waist-input', text: '31' }, { type: 'onb-hip-input', text: '39' }], waitFor: 'onb-bf-estimate', note: 'body fat by tape measure, imperial, with the estimate' },
  { id: 'onb-bodyfat-direct-error', ...F, taps: [...body('metric'), 'onb-bf-direct', { type: 'onb-bf-input', text: '80' }, 'onb-next'], waitFor: 'onb-bf-input', note: 'body fat typed out of range' },
  { id: 'onb-activity', ...F, taps: bodyfat('metric'), waitFor: 'onb-activity-light', note: 'activity level tiles' },
  { id: 'onb-activity-why', ...F, taps: [...bodyfat('metric'), 'onb-activity-why'], waitFor: 'onb-activity-light', note: 'activity level with "What about workouts?" open' },
  { id: 'onb-bodyfat-how', ...F, taps: [...body('metric'), 'onb-bf-tape', { type: 'onb-neck-input', text: '38' }, { type: 'onb-waist-input', text: '80' }, { type: 'onb-hip-input', text: '98' }, 'onb-bf-how'], waitFor: 'onb-bf-estimate', note: 'tape measure with "How to measure" open' },
  { id: 'onb-target-metric', ...F, taps: [...activity('metric'), { type: 'onb-target-input', text: '62' }], waitFor: 'onb-target-summary', note: 'target weight and pace, kg' },
  { id: 'onb-target-imperial', ...F, taps: [...activity('imperial'), { type: 'onb-target-input', text: '120' }], waitFor: 'onb-target-input', note: 'target weight and pace, lb, a big change' },
  { id: 'onb-target-error', ...F, taps: [...activity('imperial'), { type: 'onb-target-input', text: '300' }, 'onb-next'], waitFor: 'onb-target-input', note: 'target above the current weight for a loss' },
  { id: 'onb-routine', ...F, taps: routine('metric'), waitFor: 'onb-routine-times', note: 'reminder cards with their example messages' },
  { id: 'onb-routine-times', ...F, taps: [...routine('imperial'), 'onb-routine-times'], waitFor: 'onb-routine-breakfast', note: 'Adjust times open, 12-hour clock' },
  { id: 'onb-routine-time-sheet', ...F, taps: [...routine('imperial'), 'onb-routine-times', 'onb-routine-bed'], sheet: true, note: 'the time picker sheet, 12-hour' },
  { id: 'onb-theme', ...F, taps: theme('metric'), waitFor: 'onb-theme-system', note: 'the look step' },
  { id: 'onb-plan-metric', ...F, taps: plan('metric'), waitFor: 'plan-reveal', note: 'the plan reveal, losing, kg' },
  { id: 'onb-plan-imperial-math', ...F, taps: [...plan('imperial'), 'plan-math-toggle'], waitFor: 'plan-math', note: 'the plan reveal in lb with the maths open' },
  { id: 'onb-plan-maintain', ...F, taps: plan('imperial', 'maintain'), waitFor: 'plan-reveal', note: 'the plan reveal for keeping weight' },
];

// ------------------------------------------------------------------ welcome, auth (no backend here)
const firstRun = [
  { id: 'welcome-fresh', route: '/welcome', data: 'fresh', waitFor: 'welcome-get-started', note: 'welcome with nothing stored' },
  { id: 'auth-no-backend', route: '/auth?mode=signin', data: 'fresh', waitFor: 'auth-not-configured', note: 'sign in on a build without accounts' },
];

// ------------------------------------------------------------------ profile and settings
const settings = [
  { id: 'profile-stress', route: '/profile', data: 'stress', note: 'profile with a 22-character name' },
  { id: 'profile-imperial', route: '/profile', imperial: true, note: 'profile in imperial (the units caption is longer)' },
  { id: 'goals-imperial', route: '/settings/goals', imperial: true, note: 'goals in lb and ft in' },
  { id: 'goals-stress', route: '/settings/goals', data: 'stress', note: 'goals at 142.6 kg' },
  { id: 'goals-macro-custom', route: '/settings/goals', taps: ['goals-macro-custom'], waitFor: 'goals-pct-total', note: 'custom macro split fields' },
  { id: 'goals-maintain', route: '/settings/goals', taps: ['goals-goal-maintain'], note: 'goal: keep weight (no target or pace fields)' },
  { id: 'goals-gain-imperial', route: '/settings/goals', imperial: true, taps: ['goals-goal-gain'], note: 'goal: gain, in lb (the target is now below the current weight)' },
  { id: 'goals-sex-female', route: '/settings/goals', taps: ['goals-sex-female'], note: 'body details with female chosen' },
  { id: 'goals-calories-manual', route: '/settings/goals', taps: ['goals-calories-mode-manual'], waitFor: 'goals-calories', note: 'calorie target: set my own' },
  { id: 'goals-water-manual-imperial', route: '/settings/goals', imperial: true, taps: ['goals-water-mode-manual'], waitFor: 'goals-water', note: 'water goal: set my own, in fl oz' },
  { id: 'profile-units-switch', route: '/profile', taps: ['profile-units-imperial'], note: 'units switched to imperial on Profile' },
  { id: 'goals-errors-imperial', route: '/settings/goals', imperial: true, taps: [{ type: 'goals-target-weight', text: '20' }, { type: 'goals-height-ft', text: '12' }, { type: 'goals-birth-date', text: '1890-13-45' }, { type: 'goals-body-fat', text: '90' }], waitFor: 'goals-height-error', note: 'every field with an error, imperial (Save turns off)' },
  { id: 'reminders-on', route: '/settings/reminders', taps: ['reminders-master', 'reminders-weighin', 'reminders-movement'], waitFor: 'reminders-movement-time', note: 'reminders on, every reminder expanded' },
  { id: 'reminders-on-imperial', route: '/settings/reminders', imperial: true, taps: ['reminders-master', 'reminders-weighin', 'reminders-movement'], waitFor: 'reminders-movement-time', note: 'the same with the 12-hour clock and fl oz' },
  { id: 'reminders-time-sheet', route: '/settings/reminders', imperial: true, taps: ['reminders-master', 'reminders-breakfast'], sheet: true, note: 'a time picker sheet, 12-hour' },
  { id: 'reminders-quiet-sheet', route: '/settings/reminders', taps: ['reminders-quiet-start'], sheet: true, note: 'the quiet hours time sheet, 24-hour' },
  { id: 'data-import-newer', route: '/settings/data', taps: [{ choose: 'data-import', files: ['scripts/dev/states/files/start-newer-backup.json'] }], note: 'importing a backup from a newer version: the error toast' },
  { id: 'data-import-profile', route: '/settings/data', taps: [{ choose: 'data-import', files: ['scripts/dev/states/files/start-older-profile.json'] }], sheet: true, note: 'the confirm sheet: use the backup profile or keep mine' },
  { id: 'about-imperial', route: '/settings/about', imperial: true, note: 'about, imperial' },
  { id: 'health-sync-web', route: '/settings/health-sync', note: 'health sync on the web: not available here' },
];

// ------------------------------------------------------------------ progress
const progress = [
  { id: 'progress-nutrition', route: '/progress', taps: ['progress-segment-nutrition'], waitFor: 'progress-calories', note: 'Nutrition' },
  { id: 'progress-habits', route: '/progress', taps: ['progress-segment-habits'], waitFor: 'progress-habits', note: 'Habits' },
  { id: 'progress-body-imperial', route: '/progress', imperial: true, taps: ['progress-segment-body'], waitFor: 'progress-weight', note: 'Body in lb' },
  { id: 'progress-habits-imperial', route: '/progress', imperial: true, taps: ['progress-segment-habits'], waitFor: 'progress-habits', note: 'Habits in fl oz and mi' },
  { id: 'progress-range-7', route: '/progress', taps: ['progress-range', 'progress-range-7'], note: 'Overview, last 7 days' },
  { id: 'progress-range-90', route: '/progress', taps: ['progress-range', 'progress-range-90'], note: 'Overview, last 90 days' },
  { id: 'progress-nutrition-90', route: '/progress', taps: ['progress-range', 'progress-range-90', 'progress-segment-nutrition'], waitFor: 'progress-calories', note: 'Nutrition, 90 days' },
  { id: 'progress-calories-sheet', route: '/progress', taps: ['progress-segment-nutrition', 'progress-calories-help'], sheet: true, note: 'the calories explainer sheet' },
  { id: 'progress-insights-open', route: '/progress', taps: ['progress-insights-toggle'], note: 'Overview with every insight shown' },
  { id: 'progress-stress', route: '/progress', data: 'stress', note: 'Overview with big numbers' },
  { id: 'progress-stress-nutrition', route: '/progress', data: 'stress', taps: ['progress-segment-nutrition'], waitFor: 'progress-calories', note: 'Nutrition with the 11,480 kcal day' },
  { id: 'progress-stress-body', route: '/progress', data: 'stress', imperial: true, taps: ['progress-segment-body'], waitFor: 'progress-weight', note: 'Body at 142.6 kg, in lb' },
  { id: 'progress-stress-habits', route: '/progress', data: 'stress', taps: ['progress-segment-habits'], waitFor: 'progress-habits', note: 'Habits with 12.5 L and 1,240 minutes' },
  { id: 'progress-early', route: '/progress', data: 'empty', waitFor: 'progress-early', note: 'early days: nothing logged yet' },
];

// ------------------------------------------------------------------ recap, consistency
const weeks = [
  { id: 'recap-this-week', route: '/recap?week={day}', day: 0, waitFor: 'recap-screen', note: 'this week so far' },
  { id: 'recap-earlier', route: '/recap?week={day}', day: -21, waitFor: 'recap-screen', note: 'three weeks ago' },
  { id: 'recap-empty', route: '/recap', data: 'empty', waitFor: 'recap-screen', note: 'a week with nothing logged' },
  { id: 'recap-help-sheet', route: '/recap', taps: ['recap-chart-help'], sheet: true, note: 'how to read the cups' },
  { id: 'recap-day-detail', route: '/recap', taps: ['^recap-day-2'], waitFor: 'recap-day-detail', note: 'one day of the week opened' },
  { id: 'recap-stress-imperial', route: '/recap', data: 'stress', imperial: true, waitFor: 'recap-screen', note: 'the feast week in lb' },
  { id: 'consistency-stress', route: '/consistency', data: 'stress', waitFor: 'consistency-screen', note: 'a 412-day streak' },
  { id: 'consistency-empty', route: '/consistency', data: 'empty', waitFor: 'consistency-screen', note: 'nothing logged yet' },
  { id: 'consistency-prev-month', route: '/consistency', taps: ['consistency-month-prev'], waitFor: 'consistency-calendar', note: 'the month before' },
  { id: 'consistency-help-sheet', route: '/consistency', taps: ['consistency-rhythm-help'], sheet: true, note: 'weekly rhythm explainer' },
  { id: 'consistency-edit-sheet', route: '/consistency', taps: ['consistency-rhythm-edit'], sheet: true, note: 'weekly rhythm targets' },
];

// ------------------------------------------------------------------ accounts (a build with a backend)
// Only listed when the run is given --backend (a build made with EXPO_PUBLIC_SUPABASE_URL set and
// scripts/dev/mock-backend.cjs serving it), so a run against a build without accounts (every
// with-build.cjs build, which every run now passes as --url) does not report them as not captured. The signed-in states need this account on the
// stand-in backend first (POST /auth/v1/signup with the same email and password).
const EMAIL = 'bartholomew.christophe.longname@example-family-mail.com';
const PASSWORD = 'correct horse battery';
const signIn = [{ type: 'auth-email-input', text: EMAIL }, { type: 'auth-password-input', text: PASSWORD }, 'auth-submit', { wait: 2500 }];
const backend = [
  { id: 'auth-welcome', route: '/welcome', data: 'fresh', waitFor: 'welcome-sign-in', note: 'welcome with accounts: sign in offered' },
  { id: 'auth-signin-errors', route: '/auth?mode=signin', data: 'fresh', taps: ['auth-submit'], waitFor: 'auth-email-input', note: 'sign in with both fields empty' },
  { id: 'auth-signup-errors', route: '/auth?mode=signup', data: 'fresh', taps: [{ type: 'auth-email-input', text: 'dana@' }, { type: 'auth-password-input', text: 'short' }, 'auth-submit'], waitFor: 'auth-email-input', note: 'sign up with a bad email and a short password' },
  { id: 'auth-signin-wrong', route: '/auth?mode=signin', data: 'fresh', taps: [{ type: 'auth-email-input', text: EMAIL }, { type: 'auth-password-input', text: 'not the password' }, 'auth-password-toggle', 'auth-submit', { wait: 1500 }], waitFor: 'auth-error', note: 'wrong password: the form error, the long email, the password shown' },
  { id: 'auth-from-email', route: '/auth?mode=signin&code=from-another-browser', data: 'fresh', waitFor: 'auth-email-input', note: 'opened from the sign-up confirmation email in a browser that did not ask for it' },
  { id: 'auth-from-email-expired', route: '/auth?mode=signin&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', data: 'fresh', waitFor: 'auth-email-input', note: 'opened from an expired confirmation link' },
  { id: 'auth-forgot', route: '/auth?mode=forgot', data: 'fresh', taps: [{ type: 'auth-email-input', text: EMAIL }], waitFor: 'auth-submit', note: 'forgot password' },
  { id: 'auth-forgot-sent', route: '/auth?mode=forgot', data: 'fresh', taps: [{ type: 'auth-email-input', text: EMAIL }, 'auth-submit', { wait: 1500 }], waitFor: 'auth-done', note: 'reset email sent' },
  { id: 'onb-account-offer', ...F, taps: [...plan('metric'), 'onb-finish'], waitFor: 'onb-account-offer', note: 'after set-up, the account offer (only with accounts)' },
  { id: 'auth-gate-demo', route: '/auth?mode=signin', taps: signIn, note: 'signing in on a device that already holds a diary: the sign-in gate' },
  { id: 'account-signed-out', route: '/settings/account', waitFor: 'account-signin', note: 'account, signed out' },
  { id: 'account-signed-in', route: '/auth?mode=signin', taps: [...signIn, 'today-profile', 'profile-account'], waitFor: 'account-email', note: 'account, signed in with a 55-character email' },
  { id: 'account-sign-out-sheet', route: '/auth?mode=signin', taps: [...signIn, 'today-profile', 'profile-account', 'account-sign-out'], sheet: true, note: 'the sign out confirm sheet' },
  { id: 'account-delete-sheet', route: '/auth?mode=signin', taps: [...signIn, 'today-profile', 'profile-account', 'account-delete'], sheet: true, note: 'the delete account confirm sheet' },
  { id: 'profile-signed-out', route: '/profile', data: 'stress', waitFor: 'profile-account', note: 'profile with the account row, signed out' },
];

module.exports = [...firstRun, ...onboarding, ...settings, ...progress, ...weeks, ...(process.argv.includes('--backend') ? backend : [])];
