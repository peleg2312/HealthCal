// Training, the trackers and friends, in the states a route alone does not show: open sheets and
// confirm sheets, the other segments and filters, edit mode, errors, a past day or week, imperial
// units, long names and big numbers (data: 'stress'). The format is in scripts/dev/evidence.cjs.
//
//   node scripts/dev/evidence.cjs --states=move --out=<dir> [--only=<id>,<id>]
//
// Entry ids are random in the demo data, so a state reaches a saved session by tapping its row on
// Train ('^session-running' is the newest run). In the stress data today's run carries the
// two-sentence note. Strength workouts are built by tapping through the picker. The import states
// pick the files in scripts/dev/states/files: garmin-activities.csv (ten workouts, two of them
// "Cardio", which the import asks about, and long titles), morning-run.gpx, broken.fit and notes.csv
// (neither holds a workout).
//
// The signed-in friends states need accounts on a backend, which the shared dev server does not
// have. They are listed separately, in FRIENDS_SIGNED_IN at the end, and run against a build with
// the stand-in backend: see the comment there.

const settle = { wait: 700 };
// A toast with Undo stays 4.5 s, 12 s when the browser reports a screen reader (the test browser can);
// states that are not about the toast wait for it to go.
const toastGone = { wait: 12500 };
const CSV = 'scripts/dev/states/files/garmin-activities.csv';
const GPX = 'scripts/dev/states/files/morning-run.gpx';

// ------------------------------------------------------------------ Train
const train = [
  { id: 'train-stress', route: '/train', data: 'stress', note: '1,240 active minutes this week, the vessel past twice the guideline' },
  { id: 'train-stress-imperial', route: '/train', data: 'stress', imperial: true, note: 'the same week in miles' },
  { id: 'train-empty', route: '/train', data: 'empty', note: 'nothing logged: an empty week and the history invite' },
  { id: 'train-past-week', route: '/train?week={day}', day: -14, waitFor: 'train-this-week', note: 'two weeks ago, with "Back to this week"' },
  { id: 'train-history-more', route: '/train', data: 'stress', taps: ['train-show-more'], note: 'History with earlier sessions shown' },
  { id: 'train-deleted', route: '/train', taps: ['^delete-'], note: 'a session deleted: the Undo toast over the tab bar' },
];

// ------------------------------------------------------------------ pick an activity
const CATEGORIES = ['cardio', 'strength', 'mind', 'team', 'racket', 'combat', 'water', 'winter', 'outdoor', 'dance', 'daily'];
const pick = [
  ...CATEGORIES.map((c) => ({ id: `pick-${c}`, route: '/activity/pick', taps: [`category-${c}`], waitFor: 'activity-list', note: `the ${c} category` })),
  { id: 'pick-search', route: '/activity/pick', type: { 'activity-search': 'ball' }, waitFor: 'activity-list', note: 'a search with results' },
  { id: 'pick-search-none', route: '/activity/pick', type: { 'activity-search': 'underwater basket weaving championship' }, note: 'a search with no results' },
  { id: 'pick-search-none-category', route: '/activity/pick', taps: ['category-winter', { type: 'activity-search', text: 'paddle' }], note: 'nothing in this category: search all' },
  { id: 'pick-strength-sheet', route: '/activity/pick', taps: ['category-strength', 'activity-strength_training'], sheet: true, note: 'strength training: sets or time only' },
  { id: 'pick-past-day', route: '/activity/pick?date={day}', day: -3, note: 'picking for a past day' },
  { id: 'pick-empty', route: '/activity/pick', data: 'empty', note: 'no recent activities: popular only' },
];

// ------------------------------------------------------------------ log a session
const log = [
  { id: 'log-new-running', route: '/activity/log?activityId=running', waitFor: 'log-activity-result', note: 'a new run, starting from the last one' },
  { id: 'log-light', route: '/activity/log?activityId=volleyball', taps: ['intensity-light'], note: 'light effort selected' },
  { id: 'log-vigorous', route: '/activity/log?activityId=paddleboarding', taps: ['intensity-vigorous'], note: 'vigorous, the longest activity name' },
  { id: 'log-single-met', route: '/activity/log?activityId=beach_volleyball', waitFor: 'intensity-single', note: 'one MET value: no effort tiles' },
  { id: 'log-distance-km', route: '/activity/log?activityId=running', type: { 'distance-input': '12.45' }, waitFor: 'distance-pace', note: 'distance and pace in km' },
  { id: 'log-distance-mi', route: '/activity/log?activityId=cycling', imperial: true, type: { 'distance-input': '24.8' }, waitFor: 'distance-pace', note: 'distance and speed in miles' },
  { id: 'log-swim-imperial', route: '/activity/log?activityId=swimming', imperial: true, type: { 'distance-input': '1.2' }, note: 'swim pace per 100 yd' },
  { id: 'log-source-open', route: '/activity/log?activityId=running', taps: ['log-activity-source'], waitFor: 'log-activity-source-body', note: 'where the number comes from, open' },
  { id: 'log-too-long', route: '/activity/log?activityId=walking', type: { 'duration-input': '2000' }, note: 'duration longer than a day: the field error' },
  { id: 'log-past-day', route: '/activity/log?activityId=yoga&date={day}', day: -2, note: 'logging for two days ago' },
  { id: 'log-edit', route: '/train', taps: ['^session-volleyball'], waitFor: 'log-activity-delete', note: 'editing a saved session' },
  { id: 'log-edit-note', route: '/train', data: 'stress', taps: ['^session-running'], waitFor: 'log-activity-delete', note: 'the run with a two-sentence note, 95 minutes, 142.6 kg' },
  { id: 'log-edit-imperial', route: '/train', data: 'stress', imperial: true, taps: ['^session-running', 'log-activity-source'], waitFor: 'log-activity-delete', note: 'editing in miles and lb, the source open' },
  { id: 'log-not-found', route: '/activity/log?entryId=no-such-session', note: 'a session that is no longer there' },
];

// ------------------------------------------------------------------ Garmin import
const chooseCsv = [{ choose: 'import-choose-files', files: [CSV] }, settle];
const toReview = [...chooseCsv, 'import-unit-km', 'import-continue', settle];
const imports = [
  { id: 'import-guide-open', route: '/activity/import', taps: ['import-guide-toggle'], note: 'the start screen with the how-to open' },
  { id: 'import-questions', route: '/activity/import', taps: chooseCsv, waitFor: 'import-csv-questions', note: 'the CSV questions: unit and time zone' },
  { id: 'import-zone-sheet', route: '/activity/import', taps: [...chooseCsv, 'import-csv-zone-change'], sheet: true, note: 'the time-zone sheet' },
  { id: 'import-review-csv', route: '/activity/import', taps: toReview, waitFor: 'import-list', note: 'ten workouts to review, two to ask about' },
  { id: 'import-review-imperial', route: '/activity/import', imperial: true, taps: [...chooseCsv, 'import-unit-mi', 'import-continue', settle], waitFor: 'import-list', note: 'the review in miles' },
  { id: 'import-review-stress', route: '/activity/import', data: 'stress', taps: toReview, waitFor: 'import-list', note: 'the review over a very full week' },
  { id: 'import-activity-sheet', route: '/activity/import', taps: [...toReview, '^import-activity-'], sheet: true, note: 'which activity was this: the sheet' },
  { id: 'import-filter', route: '/activity/import', taps: [...toReview, 'import-filter-choose'], waitFor: 'import-list', note: 'the review filtered' },
  { id: 'import-done', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: [GPX] }, settle, 'import-submit', settle, toastGone], waitFor: 'import-done', note: 'imported: the days they went to' },
  { id: 'import-nothing-new', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: [GPX] }, settle, 'import-submit', settle, 'import-more', { choose: 'import-choose-files', files: [GPX] }, settle], waitFor: 'import-list', note: 'the same file again: already in HealthCal' },
  { id: 'import-error', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: ['scripts/dev/states/files/broken.fit'] }, settle, { wait: 800 }], waitFor: 'import-nothing', note: 'a damaged file: no workouts, and why' },
  { id: 'import-error-mixed', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: ['scripts/dev/states/files/broken.fit', 'scripts/dev/states/files/notes.csv'] }, settle, 'import-unit-km', 'import-continue', settle], waitFor: 'import-file-notes', note: 'two files, neither with a workout: the note for each' },
  { id: 'import-source-mark', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: [GPX] }, settle, 'import-submit', settle, 'import-see-train', settle, '^session-source-', toastGone], waitFor: 'log-activity-delete', note: 'an imported run opened: measured by Garmin' },
  { id: 'import-train-week', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: [GPX] }, settle, 'import-submit', settle, 'import-see-train', settle, toastGone], waitFor: 'train-history', note: 'Train with the imported run and its source mark' },
];

// ------------------------------------------------------------------ strength workout
const addEx = (name, first) => [first ? 'strength-add-first' : 'strength-add-exercise', settle, `exercise-option-${name}`, settle];
const set = (ex, i, kg, reps) => [{ type: `ex-${ex}-set-${i}-weight`, text: kg }, { type: `ex-${ex}-set-${i}-reps`, text: reps }];
const workout = [
  ...addEx('bench-press', true),
  ...set(0, 0, '62.5', '8'),
  'ex-0-add-set',
  ...set(0, 1, '62.5', '8'),
  'ex-0-add-set',
  ...addEx('romanian-deadlift'),
  ...set(1, 0, '100', '10'),
  ...addEx('incline-dumbbell-press'),
];
const strength = [
  { id: 'strength-empty', route: '/activity/strength', waitFor: 'strength-add-first', note: 'a new workout, nothing added' },
  { id: 'strength-picker', route: '/activity/strength', taps: ['strength-add-first'], sheet: true, note: 'the exercise picker' },
  { id: 'strength-picker-group', route: '/activity/strength', taps: ['strength-add-first', 'exercise-group-legs'], sheet: true, note: 'the picker, legs only' },
  { id: 'strength-picker-custom', route: '/activity/strength', taps: ['strength-add-first', { type: 'exercise-search', text: 'Bulgarian split squat with a pause at the bottom' }], sheet: true, note: 'a search with no exact match: add a custom exercise' },
  { id: 'strength-sets', route: '/activity/strength', taps: [...workout, 'strength-timer-toggle'], waitFor: 'ex-2', note: 'three exercises, sets filled, the timer running' },
  { id: 'strength-sets-imperial', route: '/activity/strength', imperial: true, taps: [...addEx('bench-press', true), ...set(0, 0, '137.5', '8'), 'ex-0-add-set', ...addEx('romanian-deadlift'), ...set(1, 0, '225', '10')], waitFor: 'ex-1', note: 'sets in lb' },
  { id: 'strength-rest', route: '/activity/strength', taps: [...addEx('bench-press', true), ...set(0, 0, '62.5', '8'), 'ex-0-set-0-done'], waitFor: 'strength-rest', note: 'a set ticked: the rest bar over the footer button' },
  { id: 'strength-effort-light', route: '/activity/strength', taps: ['strength-effort-light', 'strength-time-edit', { type: 'strength-duration-input', text: '45' }], waitFor: 'strength-duration-input', note: 'light effort, the duration typed in' },
  { id: 'strength-duration-error', route: '/activity/strength', taps: ['strength-time-edit', { type: 'strength-duration-input', text: '2000' }], note: 'a duration longer than a day' },
  { id: 'strength-discard-confirm', route: '/activity/strength', taps: [...addEx('bench-press', true), 'strength-discard'], sheet: true, note: 'discard this workout?' },
  { id: 'strength-save-routine', route: '/activity/strength', taps: [...workout, 'strength-save-routine'], sheet: true, note: 'save as routine, with the exercise list' },
  { id: 'strength-summary', route: '/activity/strength', taps: [...workout, 'strength-time-edit', { type: 'strength-duration-input', text: '52' }, 'strength-finish', settle, toastGone], waitFor: 'strength-summary', note: 'the summary after finishing' },
  {
    id: 'strength-edit',
    route: '/activity/strength',
    taps: [...addEx('bench-press', true), ...set(0, 0, '62.5', '8'), 'strength-time-edit', { type: 'strength-duration-input', text: '40' }, 'strength-finish', settle, 'strength-summary-done', settle, '^session-strength_training', settle, toastGone],
    waitFor: 'strength-delete',
    note: 'a saved workout opened for editing',
  },
  {
    id: 'train-routines',
    route: '/activity/strength',
    taps: [...addEx('bench-press', true), ...set(0, 0, '62.5', '8'), 'strength-time-edit', { type: 'strength-duration-input', text: '40' }, 'strength-finish', settle, 'strength-summary-done', settle, toastGone],
    waitFor: 'routines',
    note: 'Train with the "repeat last workout" routine card',
  },
  {
    id: 'train-replace-confirm',
    route: '/activity/strength',
    taps: [
      ...addEx('bench-press', true), ...set(0, 0, '62.5', '8'), 'strength-time-edit', { type: 'strength-duration-input', text: '40' }, 'strength-finish', settle, 'strength-summary-done', settle,
      'train-start-workout', settle, ...addEx('deadlift', true), 'header-back', settle, 'routine-last-start',
    ],
    sheet: true,
    note: 'starting a routine with a workout in progress: replace it?',
  },
];

// ------------------------------------------------------------------ water
const water = [
  { id: 'water-stress', route: '/water', data: 'stress', note: '12.5 L today, 25 drinks' },
  { id: 'water-stress-all', route: '/water', data: 'stress', taps: ['section-today-s-log-action'], note: 'every one of the 25 drinks' },
  { id: 'water-imperial', route: '/water', imperial: true, note: 'fl oz' },
  { id: 'water-stress-imperial', route: '/water', data: 'stress', imperial: true, note: '12.5 L in fl oz' },
  { id: 'water-empty', route: '/water', data: 'empty', note: 'nothing drunk yet' },
  { id: 'water-past-day', route: '/water?date={day}', day: -2, note: 'two days ago' },
  ...['tea', 'coffee', 'juice', 'milk', 'sports', 'other'].map((b) => ({ id: `water-${b}`, route: '/water', taps: [`water-beverage-${b}`], note: `${b} selected: the tiles' labels` })),
  { id: 'water-reached', route: '/water', taps: ['water-add-3', 'water-add-3', 'water-add-3', 'water-add-3', 'water-add-3'], waitFor: 'water-goal-reached', note: 'the goal reached on screen: the calm card and the toast' },
  { id: 'water-custom', route: '/water', imperial: true, type: { 'water-custom-input': '24' }, note: 'another amount typed in fl oz' },
  { id: 'water-sizes-sheet', route: '/water', taps: ['section-add-a-drink-action'], sheet: true, note: 'edit the glass sizes' },
  { id: 'water-sizes-imperial', route: '/water', imperial: true, taps: ['section-add-a-drink-action'], sheet: true, note: 'edit the glass sizes in fl oz' },
  { id: 'water-sizes-error', route: '/water', taps: ['section-add-a-drink-action', ...[0, 1, 2, 3].map((i) => ({ type: `water-preset-${i}`, text: '' })), 'water-presets-save'], sheet: true, waitFor: 'water-presets-error', note: 'every size cleared: the error' },
];

// ------------------------------------------------------------------ weight
const weight = [
  { id: 'weight-1m', route: '/weight', taps: ['weight-range-1m'], note: 'one month' },
  { id: 'weight-all', route: '/weight', taps: ['weight-range-all'], note: 'all of it' },
  { id: 'weight-stress', route: '/weight', data: 'stress', note: '142.6 kg, target 118 kg' },
  { id: 'weight-stress-imperial', route: '/weight', data: 'stress', imperial: true, note: '314 lb' },
  { id: 'weight-imperial', route: '/weight', imperial: true, note: 'lb' },
  { id: 'weight-empty', route: '/weight', data: 'empty', note: 'one weigh-in or none' },
  { id: 'weight-history-all', route: '/weight', taps: ['section-history-action'], note: 'every weigh-in' },
  { id: 'weight-sheet', route: '/weight', taps: ['weight-log'], sheet: true, note: 'log a weigh-in' },
  { id: 'weight-sheet-imperial', route: '/weight', data: 'stress', imperial: true, taps: ['weight-log'], sheet: true, note: 'log a weigh-in in lb, 314 lb' },
  { id: 'weight-sheet-edit', route: '/weight', taps: ['weight-row-0'], sheet: true, note: 'an existing weigh-in: update and delete' },
  { id: 'weight-sheet-error', route: '/weight', taps: ['weight-log', { type: 'weight-input', text: '900' }, 'weight-save'], sheet: true, note: 'a weight out of range' },
];

// ------------------------------------------------------------------ body
const body = [
  { id: 'body-imperial', route: '/body', imperial: true, note: 'in and lb' },
  { id: 'body-stress', route: '/body', data: 'stress', note: '142.6 kg' },
  { id: 'body-stress-imperial', route: '/body', data: 'stress', imperial: true, note: '314 lb, ft in' },
  { id: 'body-empty', route: '/body', data: 'empty', note: 'nothing measured yet' },
  { id: 'body-filled', route: '/body', data: 'empty', type: { 'body-neck-input': '38', 'body-waist-input': '84', 'body-hip-input': '99' }, waitFor: 'body-estimate', note: 'measurements typed: the estimate' },
  { id: 'body-filled-imperial', route: '/body', data: 'empty', imperial: true, type: { 'body-neck-input': '15', 'body-waist-input': '33', 'body-hip-input': '39' }, waitFor: 'body-estimate', note: 'measurements in inches' },
  { id: 'body-weight-error', route: '/body', data: 'empty', type: { 'body-neck-input': '38', 'body-waist-input': '84', 'body-weight-input': '900' }, taps: ['body-save'], note: 'no weigh-in today, and a weight out of range' },
];

// ------------------------------------------------------------------ sleep
const sleep = [
  { id: 'sleep-30', route: '/sleep', taps: ['sleep-window-30'], note: '30 nights' },
  { id: 'sleep-empty', route: '/sleep', data: 'empty', note: 'no nights logged' },
  { id: 'sleep-sheet', route: '/sleep', taps: ['sleep-log'], sheet: true, note: 'log or edit last night' },
  { id: 'sleep-sheet-empty', route: '/sleep', data: 'empty', taps: ['sleep-log'], sheet: true, note: 'log the first night' },
  { id: 'sleep-sheet-row', route: '/sleep', taps: ['sleep-row-3'], sheet: true, note: 'an earlier night opened' },
  { id: 'sleep-past-day', route: '/sleep?date={day}', day: -4, note: 'four nights ago' },
];

// ------------------------------------------------------------------ fasting
const fasting = [
  { id: 'fasting-active', route: '/fasting', taps: ['fasting-start'], waitFor: 'fasting-end', note: 'a fast just started' },
  { id: 'fasting-adjust-sheet', route: '/fasting', taps: ['fasting-start', 'fasting-adjust', 'fasting-shift--60', 'fasting-shift--15'], sheet: true, note: 'change the start time' },
  {
    id: 'fasting-reached',
    route: '/fasting',
    taps: ['fasting-target-custom', { type: 'fasting-custom-input', text: '2' }, 'fasting-custom-set', 'fasting-start', 'fasting-adjust', 'fasting-shift--60', 'fasting-shift--60', 'fasting-shift--60', 'fasting-adjust-save', settle, toastGone],
    waitFor: 'fasting-end',
    note: 'a 2 h fast reached an hour ago',
  },
  { id: 'fasting-custom', route: '/fasting', taps: ['fasting-target-custom', { type: 'fasting-custom-input', text: '36.5' }], waitFor: 'fasting-custom-input', note: 'a custom target being typed' },
  { id: 'fasting-long-target', route: '/fasting', taps: ['fasting-target-custom', { type: 'fasting-custom-input', text: '72' }, 'fasting-custom-set', 'fasting-start'], waitFor: 'fasting-end', note: 'a 72 h fast running' },
  { id: 'fasting-history', route: '/fasting', taps: ['fasting-start', 'fasting-adjust', 'fasting-shift--60', 'fasting-shift--60', 'fasting-adjust-save', settle, 'fasting-end', settle, 'fasting-start', settle, 'fasting-end', settle, toastGone], waitFor: 'fasting-row-1', note: 'two finished fasts in the history' },
];

// ------------------------------------------------------------------ friends, no account here
const friendsLocal = [
  { id: 'friends-add-local', route: '/friends/add?invite=ABCD2345', note: 'an invite link opened with no accounts' },
];

// ------------------------------------------------------------------ friends with accounts
// Only listed when the run is given --url: a build exported with EXPO_PUBLIC_SUPABASE_URL (and
// EXPO_PUBLIC_E2E=1) pointing at scripts/dev/mock-backend.cjs, as the README's "Testing accounts and
// sync locally" describes. The accounts below must be on that backend first, with friends turned on
// and linked as the names say: the friends account has four friends (long names, a 1,240-minute
// week, recent workouts with distances), two requests waiting for it, one sent, and five cheers; the
// lone account has friends on and nobody yet; the asked account has two requests waiting; the off
// account has never turned friends on. Every password is PASSWORD. scripts/dev/states/move-friends.mjs
// puts all of this on a running stand-in backend. Signing in keeps the account's saved settings, theme
// included, and the first capture saves its own: run one theme at a time (--themes=dark), each on a
// freshly started and seeded backend. The long names and big numbers here are the friends' (on the
// server), so the device holds the ordinary demo data.
const PASSWORD = 'correct horse battery';
const signIn = (email) => [{ type: 'auth-email-input', text: email }, { type: 'auth-password-input', text: PASSWORD }, 'auth-submit', { wait: 2500 }];
const friends = (email) => [...signIn(email), 'today-friends', { wait: 1500 }];
const FULL = 'move.friends@example.com';
const friendsSignedIn = [
  { id: 'friends-signed-out', route: '/friends', waitFor: 'friends-signed-out', note: 'friends with accounts, signed out' },
  { id: 'friends-add-signed-out', route: '/friends/add?invite=ABCD2345', waitFor: 'friends-signed-out', note: 'an invite link, signed out' },
  { id: 'friends-setup', route: '/auth?mode=signin', taps: friends('move.off@example.com'), waitFor: 'friends-setup-save', note: 'signed in, friends not on: the set-up' },
  { id: 'friends-setup-long', route: '/auth?mode=signin', taps: [...friends('move.off@example.com'), { type: 'friends-setup-name', text: 'Maximiliana Vandenberghe-Okonkwo' }], waitFor: 'friends-setup-save', note: 'the set-up with a long name' },
  { id: 'friends-none', route: '/auth?mode=signin', taps: friends('move.lone@example.com'), waitFor: 'friends-empty', note: 'friends on, nobody yet' },
  { id: 'friends-requests', route: '/auth?mode=signin', taps: friends('move.asked@example.com'), waitFor: 'friends-incoming', note: 'two requests waiting, one with a long name' },
  { id: 'friends-full', route: '/auth?mode=signin', taps: friends(FULL), waitFor: 'friends-cheers', note: 'four friends, requests both ways, cheers' },
  { id: 'friends-full-imperial', route: '/auth?mode=signin', imperial: true, taps: friends(FULL), waitFor: 'friends-cheers', note: 'the same in miles' },
  { id: 'friends-friend-sheet', route: '/auth?mode=signin', taps: [...friends(FULL), '^friends-card-'], sheet: true, note: 'a friend opened: their week' },
  { id: 'friends-settings-sheet', route: '/auth?mode=signin', taps: [...friends(FULL), 'friends-settings-open'], sheet: true, note: 'friends settings' },
  { id: 'friends-remove-confirm', route: '/auth?mode=signin', taps: [...friends(FULL), '^friends-card-', 'friends-remove'], sheet: true, note: 'remove this friend?' },
  { id: 'friends-leave-confirm', route: '/auth?mode=signin', taps: [...friends(FULL), 'friends-settings-open', 'friends-leave'], sheet: true, note: 'turn friends off?' },
  { id: 'friends-add', route: '/auth?mode=signin', taps: [...friends(FULL), 'friends-add-open'], waitFor: 'friends-add-input', note: 'add a friend by code' },
  { id: 'friends-add-wrong', route: '/auth?mode=signin', taps: [...friends(FULL), 'friends-add-open', { type: 'friends-add-input', text: 'ZZZZ-ZZZZ' }, 'friends-add-send', { wait: 1200 }], waitFor: 'friends-add-outcome-not-found', note: 'a code nobody has' },
];

module.exports = [
  ...train, ...pick, ...log, ...imports, ...strength, ...water, ...weight, ...body, ...sleep, ...fasting, ...friendsLocal,
  ...(process.argv.some((a) => a.startsWith('--url=')) ? friendsSignedIn : []),
];
