// The app's own text size at 200% (Profile > App, "Text size"; @/theme textSize), screen by screen, so a
// layout that breaks when text doubles is found in a browser (WCAG 1.4.4 as WCAG2Mobile reads it: the
// app's size reaches 200%, and the phone's setting adds up to 2x in all). The flag sets the size before load.
//
//   node scripts/dev/evidence.cjs --states=textsize --themes=blossom --widths=360 --out=<dir>
const big = { __healthcalTextSize: true };
/** The local date n days from today, as the week strip names its days (as in food.cjs). */
function isoDay(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
module.exports = [
  { id: 'text200-today', route: '/', flags: big, note: 'Today at 200% text' },
  { id: 'text200-diary', route: '/diary', flags: big, note: 'the diary at 200% text' },
  { id: 'text200-train', route: '/train', flags: big, note: 'Train at 200% text' },
  { id: 'text200-progress', route: '/progress', flags: big, note: 'Progress at 200% text' },
  { id: 'text200-water', route: '/water', flags: big, note: 'Water at 200% text' },
  { id: 'text200-weight', route: '/weight', flags: big, note: 'Weight at 200% text' },
  { id: 'text200-search', route: '/food/search?meal=lunch', flags: big, note: 'food search at 200% text' },
  { id: 'text200-quick', route: '/food/quick?meal=lunch', flags: big, note: 'quick add at 200% text' },
  { id: 'text200-profile', route: '/profile', flags: big, note: 'Profile at 200% text' },
  { id: 'text200-goals', route: '/settings/goals', flags: big, note: 'Goals at 200% text' },
  { id: 'text200-sleep', route: '/sleep', flags: big, note: 'Sleep at 200% text' },
  { id: 'text200-fasting', route: '/fasting', flags: big, note: 'Fasting at 200% text' },
  { id: 'text200-recap', route: '/recap', flags: big, note: 'the weekly check-in at 200% text' },
  { id: 'text200-consistency', route: '/consistency', flags: big, note: 'the logging calendar at 200% text' },
  { id: 'text200-pick', route: '/activity/pick', flags: big, note: 'the activity picker at 200% text' },
  { id: 'text200-log-run', route: '/activity/log?activityId=running', waitFor: 'log-activity-result', flags: big, note: 'the run log at 200% text' },
  { id: 'text200-strength', route: '/activity/strength', flags: big, note: 'the strength log at 200% text' },
  { id: 'text200-import', route: '/activity/import', flags: big, note: 'the workout import at 200% text' },
  { id: 'text200-train-load-sheet', route: '/train', taps: ['train-load-info'], sheet: true, flags: big, note: "Train's overview sheet at 200% text" },
  { id: 'text200-add-sheet', route: '/', taps: ['tab-add'], sheet: true, flags: big, note: 'the + sheet at 200% text' },
  { id: 'text200-detail', route: '/food/search', taps: ['search-tab-recent', 'recent-0'], waitFor: 'food-detail-screen', flags: big, note: 'food detail at 200% text' },
  { id: 'text200-photo-review', route: '/food/photo?mode=text', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: 'ai-add-to-diary', flags: big, note: 'the AI review (sample) at 200% text' },
  { id: 'text200-meals', route: '/food/meals?meal=lunch', flags: big, note: 'saved meals at 200% text' },
  // Settings, set-up, accounts, the morning page, friends and legal (W2-SETTINGS). The routes as they are, then
  // states of the other lists at 200%, picked by id (`settingsAt200`, below).
  { id: 'text200-reminders', route: '/settings/reminders', flags: big, note: 'Reminders at 200% text' },
  { id: 'text200-data', route: '/settings/data', flags: big, note: 'Your data at 200% text' },
  { id: 'text200-about', route: '/settings/about', flags: big, note: 'About at 200% text' },
  { id: 'text200-health-sync', route: '/settings/health-sync', flags: big, note: 'Workout sync at 200% text' },
  { id: 'text200-account', route: '/settings/account', flags: big, note: 'Account (no backend) at 200% text' },
  { id: 'text200-friends', route: '/friends', flags: big, note: 'Friends (no backend) at 200% text' },
  { id: 'text200-friends-add', route: '/friends/add', flags: big, note: 'Add a friend at 200% text' },
  { id: 'text200-terms', route: '/legal/terms', flags: big, note: 'Terms of use at 200% text' },
  { id: 'text200-privacy', route: '/legal/privacy', flags: big, note: 'Privacy at 200% text' },
  { id: 'text200-welcome', route: '/welcome', data: 'fresh', waitFor: 'welcome-get-started', flags: big, note: 'welcome at 200% text' },
  { id: 'text200-share-sheet', route: '/', taps: ['today-share'], sheet: true, flags: big, note: "the day's share sheet at 200% text" },
  // Today, the diary and the coach in their other states (W2-TODAY).
  { id: 'text200-today-first', route: '/', data: 'empty', flags: big, note: 'Today on day one at 200% text' },
  { id: 'text200-today-past', route: '/', taps: [`today-day-${isoDay(-1)}`], waitFor: 'today-jump-today', flags: big, note: 'Today on yesterday at 200% text' },
  { id: 'text200-today-off', route: '/', values: { eatBack: 0 }, flags: big, note: 'Today with workouts not added, at 200% text' },
  { id: 'text200-today-over', route: '/', values: { eaten: 1.15 }, flags: big, note: 'Today over the budget at 200% text' },
  { id: 'text200-today-fits', route: '/', taps: ['today-ideas'], sheet: true, flags: big, note: 'What fits at 200% text' },
  { id: 'text200-diary-empty', route: '/diary', data: 'empty', flags: big, note: 'an empty diary day at 200% text' },
  { id: 'text200-coach', route: '/coach', flags: big, note: 'the coach at 200% text' },
  { id: 'text200-coach-ideas', route: '/coach', values: { eaten: 0.5 }, taps: ['coach-local-ideas'], waitFor: 'coach-local-answer', flags: big, note: "the coach's ideas answer at 200% text" },
  ...settingsAt200(),
  // The kit's toast at 200% (W2-KIT): a glass on Today, the toast in its place clear of the controls.
  { id: 'text200-toast-water', route: '/', taps: ['^today-water-', { wait: 300 }], waitFor: 'toast', flags: big, note: "Today's glass and its toast at 200% text" },
  // Profile > App > Text size, at the designed size, then Larger five times: the page's own text grows to 200%.
  { id: 'text-size-row-larger', route: '/profile', taps: Array(5).fill('profile-text-size-larger'), waitFor: 'profile-text-size', note: 'Text size from 100% to 200% by its own control (no flag)' },
];

/** States of the set-up, account, morning and plan lists, again at 200% text (id prefixed with text200-). */
function settingsAt200() {
  const pick = (list, ids) =>
    ids.map((id) => {
      const st = list.find((x) => x.id === id);
      if (!st) throw new Error(`textsize.cjs: no state ${id}`);
      return { ...st, id: `text200-${id}`, flags: { ...(st.flags || {}), ...big }, note: `${st.note} (200% text)` };
    });
  return [
    ...pick(require('./start.cjs'), [
      'onb-basics-long',
      'onb-sex',
      'onb-about-filled',
      'onb-body-wide-imperial',
      'onb-bodyfat-tape',
      'onb-activity',
      'onb-target-metric',
      'onb-target-imperial',
      'onb-routine',
      'onb-plan-metric',
      'welcome-google-declined',
      'auth-demo-signup',
      'auth-demo-declined',
      'auth-demo-inbox',
      'account-demo-signed-in',
      'account-demo-signed-out',
      'reminders-on',
      'goals-macro-custom',
      'goals-imperial',
    ]),
    ...pick(require('./morning.cjs'), ['morning', 'morning-first']),
    ...pick(require('./plan.cjs'), ['plan-free-month', 'plan-plus']),
  ];
}
