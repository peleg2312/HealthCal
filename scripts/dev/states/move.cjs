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
// The signed-in friends states need accounts on a backend, which builds from with-build.cjs do not
// have. They are listed separately, in friendsSignedIn at the end, only when the run is given
// --backend, and run against a build with the stand-in backend: see the comment there.

const settle = { wait: 700 };
// A toast with Undo stays 4.5 s, 12 s when the browser reports a screen reader (the test browser can);
// states that are not about the toast wait for it to go.
const toastGone = { wait: 12500 };
/** Log a food with the search row's + (the first result for `query`) on the route's meal. */
const logDiary = (query) => [{ type: 'food-search-input', text: query }, { wait: 1200 }, 'result-0-add'];
/** From food search to the water screen: Done (the diary), the + sheet, its Water row. */
/** The log's toast (4.5 s) gone first, so the capture shows only what the next screen raises. */
const toWater = [toastGone, 'search-done', 'tab-add', 'quick-water'];
/** Today at a clock time, for a state's `now` (the seed is built around the real today). */
const todayAt = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
/** On Water: search, pick the drink with this id, log a 250 ml glass of it, and wait for the toasts to go. */
const pickAndLog = (query, id) => ['water-search', { type: 'water-pick-search', text: query }, { wait: 900 }, `water-pick-${id}`, toastGone, 'water-add-1', toastGone];
// An iPhone with sync on: workouts from the watch and Garmin Connect, one of them to look at (health.cjs's own state).
const IPHONE_ON = require('./health.cjs').find((s) => s.id === 'health-sync-iphone-on').health;
const CSV = 'scripts/dev/states/files/garmin-activities.csv';
const GPX = 'scripts/dev/states/files/morning-run.gpx';

// ------------------------------------------------------------------ Train
const train = [
  { id: 'train-stress', route: '/train', data: 'stress', note: '1,240 active minutes this week, the vessel past twice the guideline' },
  { id: 'train-stress-imperial', route: '/train', data: 'stress', imperial: true, note: 'the same week in miles' },
  { id: 'train-empty', route: '/train', data: 'empty', note: 'nothing logged: an empty week and the history invite' },
  { id: 'train-past-week', route: '/train?week={day}', day: -14, waitFor: 'train-this-week', note: 'two weeks ago, with "Back to this week"' },
  // The training overview (src/lib/trainingLoad.ts): the week card's last line in each state (seed.mjs values.load;
  // with a state the whole line is the button `train-load-info`, a chevron at its end), then its sheet.
  { id: 'train-load-steady', route: '/train', values: { load: 'steady' }, waitFor: 'train-load', note: 'overview: about your usual (268 against 268)' },
  { id: 'train-load-lighter', route: '/train', values: { load: 'lighter' }, waitFor: 'train-load', note: 'overview: lighter than your recent weeks (105 against 268)' },
  { id: 'train-load-more', route: '/train', values: { load: 'more' }, waitFor: 'train-load', note: 'overview: more than your recent weeks (366, r 1.37)' },
  { id: 'train-load-jump', route: '/train', values: { load: 'jump' }, waitFor: 'train-load', note: 'overview: a big step up (488, r 1.82)' },
  { id: 'train-load-hike', route: '/train', values: { load: 'hike' }, waitFor: 'train-load', note: 'overview: one big day (a 300 min hike)' },
  { id: 'train-load-daily', route: '/train', values: { load: 'daily' }, waitFor: 'train-load', note: 'overview: a full week, few easy days (Hard on all 7 days)' },
  { id: 'train-load-new', route: '/train', values: { load: 'new' }, waitFor: 'train-guideline-line', absent: ['train-load'], note: 'overview: under 3 weeks of workouts, the old line' },
  // The sheet: the answer first (the scale under the title: one slim track in thirds), "Ask the coach" in the first view
  // at 360 x 740, then "How this is counted". One state per third of the scale: usual (the demo), lighter, more (daily, hike).
  { id: 'train-load-sheet', route: '/train', taps: ['train-load-info'], sheet: true, note: "the overview's sheet over the demo (about your usual): the scale on its middle third" },
  { id: 'train-load-sheet-lighter', route: '/train', values: { load: 'lighter' }, taps: ['train-load-info'], sheet: true, note: 'the sheet for a lighter week: the scale on its first third' },
  { id: 'train-load-sheet-daily', route: '/train', values: { load: 'daily' }, taps: ['train-load-info'], sheet: true, note: 'the sheet with a fact and a next step (a full week)' },
  { id: 'train-load-sheet-hike', route: '/train', values: { load: 'hike' }, taps: ['train-load-info'], sheet: true, note: 'the sheet for one big day' },
  { id: 'train-load-sheet-new', route: '/train', values: { load: 'new' }, taps: ['train-guideline-help'], sheet: true, note: 'the sheet with too little history: "Your usual needs 3 weeks of workouts."' },
  { id: 'train-load-sheet-past', route: '/train?week={day}', day: -14, taps: ['train-guideline-help'], sheet: true, note: 'a past week: the old line, its info cup opens the same sheet' },
  { id: 'train-load-sheet-stress', route: '/train', data: 'stress', taps: ['train-load-info'], sheet: true, note: 'the sheet over the long-content weeks (a big step up, 1,340 minutes)' },
  { id: 'train-history-more', route: '/train', data: 'stress', taps: ['train-show-more'], note: 'History with earlier sessions shown' },
  { id: 'train-history-week', route: '/train', values: { spread: 1 }, waitFor: 'train-history', note: 'History on "Over 7 days": each figure under its name, "~290 kcal added over 7 days"' },
  { id: 'train-history-off', route: '/train', values: { eatBack: 0 }, waitFor: 'train-history', note: 'History with adding off: "290 kcal not added" under every name alike' },
  // "Bring in workouts": one row under Log activity and Workout, and its sheet of choices (each keeps its own testID).
  { id: 'train-bring-sheet', route: '/train', taps: ['train-bring-in'], waitFor: 'train-import-garmin', sheet: true, note: 'the browser: Import workouts, Add steps from your Health export, then Automatic sync' },
  { id: 'train-bring-iphone', route: '/train', health: IPHONE_ON, taps: [toastGone], waitFor: 'train-bring-in', note: 'iPhone with sync on and a workout to look at: the row says so with the amber key' },
  { id: 'train-bring-sheet-iphone', route: '/train', health: IPHONE_ON, taps: [{ wait: 1500 }, 'train-bring-in'], waitFor: 'train-health-sync', sheet: true, note: 'its sheet: Workout sync first, with what waits, then Import workouts' },
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
  { id: 'log-week', route: '/activity/log?activityId=running', values: { spread: 1 }, waitFor: 'log-activity-result', note: 'over 7 days: "+N over 7 days" beside the burn' },
  { id: 'log-day-hint', route: '/activity/log?activityId=running', waitFor: 'log-activity-spread-hint', note: 'same day: the hint that workouts can be shared over 7 days, which opens Goals' },
  { id: 'log-day-hint-closed', route: '/activity/log?activityId=running', taps: ['log-activity-spread-hint-close'], absent: ['log-activity-spread-hint'], note: 'the hint put away with its X: gone on this device' },
  { id: 'log-light', route: '/activity/log?activityId=volleyball', taps: ['intensity-light'], note: 'light effort selected' },
  { id: 'log-vigorous', route: '/activity/log?activityId=paddleboarding', taps: ['intensity-vigorous'], note: 'vigorous, the longest activity name' },
  { id: 'log-competitive', route: '/activity/log?activityId=volleyball', note: 'effort hints with long words ("Recreational", "Competitive"): rows, never a split word' },
  { id: 'log-single-met', route: '/activity/log?activityId=beach_volleyball', waitFor: 'intensity-single', note: 'one MET value: no effort tiles' },
  { id: 'log-distance-km', route: '/activity/log?activityId=running', type: { 'distance-input': '12.45' }, waitFor: 'distance-pace', note: 'distance and pace in km' },
  { id: 'log-distance-mi', route: '/activity/log?activityId=cycling', imperial: true, type: { 'distance-input': '24.8' }, waitFor: 'distance-pace', note: 'distance and speed in miles' },
  { id: 'log-swim-imperial', route: '/activity/log?activityId=swimming', imperial: true, type: { 'distance-input': '1.2' }, note: 'swim pace per 100 yd' },
  { id: 'log-source-open', route: '/activity/log?activityId=running', taps: ['log-activity-source'], waitFor: 'log-activity-source-body', note: 'where the number comes from, open' },
  { id: 'log-too-long', route: '/activity/log?activityId=walking', type: { 'duration-input': '2000' }, note: 'duration longer than a day: the field error' },
  { id: 'log-past-day', route: '/activity/log?activityId=yoga&date={day}', day: -2, note: 'logging for two days ago' },
  { id: 'log-off', route: '/activity/log?activityId=running', values: { eatBack: 0 }, waitFor: 'log-activity-adds', note: 'adding exercise off: "~423 kcal not added to your budget", no hatched key' },
  { id: 'log-day-at-today', route: '/activity/log?activityId=running', taps: ['log-date-prev', 'log-date-next'], waitFor: 'log-date-label', note: 'the one date control: back a day and forward again; next stops at today (a workout is logged once it happened)' },
  { id: 'log-day-yesterday', route: '/activity/log?activityId=running', taps: ['log-date-prev'], waitFor: 'log-date-label', note: 'the run log on yesterday: "Yesterday" in the same control as food detail' },
  { id: 'log-edit', route: '/train', taps: ['^session-volleyball'], waitFor: 'log-activity-delete', note: 'editing a saved session' },
  { id: 'log-edit-note', route: '/train', data: 'stress', taps: ['^session-running'], waitFor: 'log-activity-delete', note: 'the run with a two-sentence note, 95 minutes, 142.6 kg' },
  { id: 'log-edit-imperial', route: '/train', data: 'stress', imperial: true, taps: ['^session-running', 'log-activity-source'], waitFor: 'log-activity-delete', note: 'editing in miles and lb, the source open' },
  { id: 'log-not-found', route: '/activity/log?entryId=no-such-session', note: 'a session that is no longer there' },
  { id: 'log-new-imperial-source', route: '/activity/log?activityId=running', imperial: true, taps: ['log-activity-source'], waitFor: 'log-activity-adds', note: 'a new run on an imperial profile, the source open: the weight in kg with lb beside it' },
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
  { id: 'strength-discard-confirm', route: '/activity/strength', taps: [...addEx('bench-press', true), 'strength-discard'], sheet: true, note: 'delete this workout? (a new one, nothing saved yet)' },
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
  { id: 'water-stress', route: '/water', data: 'stress', note: '12.5 L today, 25 drinks: "Goal reached for today. 6.8 L past it." and nothing more (never "a bonus")' },
  { id: 'water-stress-all', route: '/water', data: 'stress', taps: ['section-today-s-log-action'], note: 'every one of the 25 drinks' },
  { id: 'water-imperial', route: '/water', imperial: true, note: 'fl oz' },
  { id: 'water-stress-imperial', route: '/water', data: 'stress', imperial: true, note: '12.5 L in fl oz' },
  { id: 'water-empty', route: '/water', data: 'empty', note: 'nothing drunk yet' },
  { id: 'water-past-day', route: '/water?date={day}', day: -2, note: 'two days ago' },
  ...['tea', 'coffee', 'juice', 'milk', 'sports', 'other'].map((b) => ({ id: `water-${b}`, route: '/water', taps: [`water-beverage-${b}`], note: `${b} selected: the tiles' labels` })),
  { id: 'water-reached', route: '/water', taps: ['water-add-3', 'water-add-3', 'water-add-3', 'water-add-3', 'water-add-3'], waitFor: 'water-goal-reached', note: 'the goal reached on screen: one line under the cup, "Goal reached for today. 430 ml past it.", the extra as a plain fact (nothing that presents more as better), and the toast' },
  { id: 'water-reached-past-day', route: '/water?date={day}', day: -1, taps: ['water-add-3', 'water-add-3', 'water-add-3', 'water-add-3', 'water-add-3', 'water-add-3'], waitFor: 'water-goal-reached', note: "yesterday's goal reached: the line names the day, and the extra as a plain fact" },
  { id: 'water-custom', route: '/water', imperial: true, type: { 'water-custom-input': '24' }, note: 'another amount typed in fl oz' },
  { id: 'water-sizes-sheet', route: '/water', taps: ['section-add-a-drink-action'], sheet: true, note: 'edit the glass sizes' },
  { id: 'water-sizes-imperial', route: '/water', imperial: true, taps: ['section-add-a-drink-action'], sheet: true, note: 'edit the glass sizes in fl oz' },
  // Drinks with calories (src/features/drinks): the choice row, the drink line, the glasses' calories,
  // the pick sheet, the "already in the diary" notice, and the pair seen from both sides. A clock is
  // set so the meal in the words is fixed (13:30 is lunch); values.drinks and values.diaryDrink are seed.mjs's knobs.
  ...[
    ['milk', 'milk_semi'],
    ['coffee', 'coffee_black'],
    ['tea', 'tea_plain'],
    ['juice', 'juice_orange'],
    ['sports', 'sports_zero'],
    ['other', 'other_none'],
  ].map(([b, first]) => ({ id: `water-${b}-choices`, route: '/water', now: todayAt(13, 30), taps: [`water-beverage-${b}`], waitFor: `water-choice-${first}`, note: `${b}: its choices, the default selected, the drink line` })),
  { id: 'water-milk-whole', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-milk', 'water-choice-milk_whole'], waitFor: 'water-drink-line', note: 'whole milk chosen: every glass shows its calories' },
  { id: 'water-coffee-latte', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-coffee', 'water-choice-latte'], waitFor: 'water-drink-line', note: 'a latte chosen: the glasses show 139 kcal and more' },
  { id: 'water-milk-imperial', route: '/water', imperial: true, now: todayAt(13, 30), taps: ['water-beverage-milk'], waitFor: 'water-drink-line', note: 'milk in fl oz' },
  { id: 'water-milk-custom', route: '/water', now: todayAt(13, 30), type: { 'water-custom-input': '330' }, taps: ['water-beverage-milk'], waitFor: 'water-drink-line', note: 'another amount typed: the line names it and its calories' },
  { id: 'water-milk-past-day', route: '/water?date={day}', day: -1, now: todayAt(13, 30), taps: ['water-beverage-milk'], waitFor: 'water-drink-line', note: "yesterday: the calories go to yesterday's lunch" },
  { id: 'water-milk-logged', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-milk', 'water-add-1'], waitFor: 'toast-action', note: 'a glass of milk logged: the toast with its calories and Undo' },
  { id: 'water-other-pick', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-other', 'water-choice-pick'], sheet: true, waitFor: 'water-pick-sheet', note: 'Choose a drink: search, "Or enter calories", then the drinks; no button at the foot' },
  { id: 'water-other-pick-juice', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-juice', 'water-choice-pick'], sheet: true, waitFor: 'water-pick-sheet', note: 'Other juice: the sheet opens on "juice"' },
  { id: 'water-other-pick-none', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-other', 'water-choice-pick', { type: 'water-pick-search', text: 'zzqx drink' }], sheet: true, waitFor: 'water-pick-none', note: 'a search with no drink' },
  { id: 'water-other-pick-kcal', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-other', 'water-choice-pick', 'water-pick-kcal-open', { type: 'water-pick-kcal', text: '140' }], sheet: true, waitFor: 'water-pick-kcal-add', note: 'calories entered: the button says "Add 140 kcal to lunch"' },
  { id: 'water-other-pick-kcal-over', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-other', 'water-choice-pick', 'water-pick-kcal-open', { type: 'water-pick-kcal', text: '15000' }], sheet: true, waitFor: 'water-pick-kcal-add', note: "past the quick-add screen's limit: the field says so, the button waits" },
  { id: 'water-other-picked', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-other', 'water-choice-pick', 'water-pick-b_lemonade'], waitFor: 'water-choice-food', note: 'lemonade picked: its own chip, selected, and the glasses priced' },
  { id: 'water-already-in-diary', route: '/water', values: { diaryDrink: 1 }, now: todayAt(9, 0), taps: ['water-beverage-milk'], waitFor: 'water-drink-notice', note: 'milk already in breakfast: the notice and Water only' },
  { id: 'water-water-only', route: '/water', values: { diaryDrink: 1 }, now: todayAt(9, 0), taps: ['water-beverage-milk', 'water-water-only'], waitFor: 'water-drink-notice', note: 'Water only on: the glasses read No calories' },
  { id: 'water-with-drinks', route: '/water', values: { drinks: 2 }, now: todayAt(14, 0), waitFor: 'water-entry-kcal-0', note: 'two drinks with calories: their rows name the diary entry' },
  { id: 'water-with-drinks-imperial', route: '/water', imperial: true, values: { drinks: 2 }, now: todayAt(14, 0), waitFor: 'water-entry-kcal-0', note: 'the same in fl oz' },
  { id: 'water-drink-removed', route: '/water', values: { drinks: 2 }, now: todayAt(14, 0), taps: ['^water-delete-'], waitFor: 'toast-action', note: 'a drink with calories deleted on Water: both go, one toast with Undo' },
  { id: 'water-drink-open', route: '/water', values: { drinks: 2 }, now: todayAt(14, 0), taps: ['^water-entry-open-'], waitFor: 'detail-drink-note', note: 'the edit from the water side: the row opens its diary entry' },
  { id: 'diary-with-drinks', route: '/diary', values: { drinks: 2 }, now: todayAt(14, 0), waitFor: 'entry-in-water-00000000-0000-4000-8000-00000000d001', note: 'the diary: the drinks marked "also in Water"' },
  { id: 'diary-drink-removed', route: '/diary', values: { drinks: 2 }, now: todayAt(14, 0), taps: ['entry-delete-00000000-0000-4000-8000-00000000d001'], waitFor: 'toast-action', note: 'deleted in the diary: the water stays, and the toast says so' },
  { id: 'detail-drink', route: '/food/detail?entryId=00000000-0000-4000-8000-00000000d001', values: { drinks: 1 }, now: todayAt(14, 0), waitFor: 'detail-drink-note', note: 'the edit from the diary side: the note on the water' },
  { id: 'detail-drink-future', route: '/food/detail?entryId=00000000-0000-4000-8000-00000000d001', values: { drinks: 1 }, now: todayAt(14, 0), taps: ['detail-day-next'], waitFor: 'detail-drink-problem', note: 'a paired drink moved to tomorrow: the reason under the day, Save waits' },
  { id: 'detail-drink-kcal', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-other', 'water-choice-pick', 'water-pick-kcal-open', { type: 'water-pick-kcal', text: '140' }, 'water-pick-kcal-add', toastGone, '^water-entry-open-'], waitFor: 'detail-drink-note', note: 'calories entered on Water, opened: the quick entry with the note' },
  // Drinks logged in the diary that also count in Water (src/features/drinks/diary.ts): the Water row from the diary
  // ("<name> · from lunch", no kcal), its delete, the notice that says the diary's latte is already in Water (no "Water
  // only"), the diary's mark and its delete toast, and the Goals switch. The drink is logged the way a person does it,
  // with the search row's + (the profile but no other data, so the row and the entry are the only ones), then the + sheet's
  // Water row opens the water screen. (seed.mjs's values.diaryWater writes the same records, for shot.mjs.)
  { id: 'water-from-diary', route: '/food/search?meal=lunch', data: 'empty', now: todayAt(14, 0), taps: [...logDiary('monster'), ...toWater], waitFor: '^water-entry-from-', note: 'an energy drink logged in lunch: its Water row names it, from lunch, with no kcal' },
  { id: 'water-from-diary-demo', route: '/food/search?meal=lunch', now: todayAt(14, 0), taps: [...logDiary('monster'), ...toWater], waitFor: '^water-entry-from-', note: 'the same among the demo day\'s water and drinks' },
  { id: 'water-from-diary-imperial', route: '/food/search?meal=lunch', data: 'empty', imperial: true, now: todayAt(14, 0), taps: [...logDiary('monster'), ...toWater], waitFor: '^water-entry-from-', note: 'in fl oz' },
  { id: 'water-from-diary-removed', route: '/food/search?meal=lunch', data: 'empty', now: todayAt(14, 0), taps: [...logDiary('monster'), ...toWater, toastGone, '^water-delete-'], waitFor: 'toast-action', note: 'its water deleted on Water: the drink stays in lunch, one toast with Undo' },
  { id: 'water-from-diary-open', route: '/food/search?meal=lunch', data: 'empty', now: todayAt(14, 0), taps: [...logDiary('monster'), ...toWater, '^water-entry-open-'], waitFor: 'detail-drink-note', note: 'the row opens its diary entry: the note says it changes with the entry' },
  { id: 'water-diary-latte-notice', route: '/food/search?meal=breakfast', now: todayAt(9, 0), taps: [...logDiary('latte'), ...toWater, 'water-beverage-coffee', 'water-choice-latte'], waitFor: 'water-drink-notice', absent: ['water-water-only'], note: 'a latte already in breakfast and in Water: the notice says so, no Water only' },
  { id: 'diary-drink-in-water', route: '/diary', values: { diaryWater: 1 }, now: todayAt(14, 0), waitFor: 'entry-in-water-00000000-0000-4000-8000-00000000d004', note: 'the diary: a drink logged there marked "also in Water" (seed.mjs values.diaryWater: fixed ids)' },
  { id: 'diary-drink-removed-water', route: '/food/search?meal=lunch', data: 'empty', now: todayAt(14, 0), taps: [...logDiary('monster'), 'search-done', toastGone, '^entry-delete-'], waitFor: 'toast-action', note: 'deleted in the diary: its water goes too, and the toast says so' },
  { id: 'goals-diary-drinks-off', route: '/settings/goals', taps: ['goals-diary-drinks'], waitFor: 'goals-diary-drinks', note: 'Goals > Water: "Count drinks from the diary" turned off (Save waits)' },
  // A search for any drink (src/features/drinks/pick.ts, DrinkPickSheet, DrinkTitleRow, DrinkKindRow, DrinkRecentChips):
  // "Search" beside "Add a drink" opens the drink sheet from any kind; with a query the local drinks (three, then
  // "Show all"), the honest line for foods and for alcohol, and "Online products" (in a build without the backend
  // the line says it works in the phone app; the online answers are in drinksOnline below, --backend only). A pick
  // goes to its own kind or to Other, the kind row scrolls it into view, and drinks picked before come back as
  // "Your drinks" and, on the Water kind, as one line of chips. Reached by taps: a pick, a glass, the toasts gone.
  { id: 'water-search-title', route: '/water', waitFor: 'water-search', note: 'the title row: "Add a drink", Search, Edit sizes' },
  { id: 'water-search-sheet', route: '/water', now: todayAt(13, 30), taps: ['water-search'], sheet: true, waitFor: 'water-pick-all', note: 'Search: the empty sheet, "All drinks" (nothing picked before)' },
  { id: 'water-search-yours', route: '/water', now: todayAt(13, 30), taps: [...pickAndLog('mocha', 'b_mocha'), ...pickAndLog('energy', 'b_energy_drink'), 'water-search'], sheet: true, waitFor: 'water-pick-yours', note: 'the empty sheet with "Your drinks": the energy drink and the mocha logged before' },
  { id: 'water-search-show-all', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'tea' }, { wait: 900 }], sheet: true, waitFor: 'water-pick-more', note: '"tea": three teas, "Show all 5", the online line (no backend here)' },
  { id: 'water-search-all-shown', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'milk' }, { wait: 900 }, 'water-pick-more'], sheet: true, waitFor: 'water-pick-b_milk_whole', note: '"milk" with every drink shown' },
  { id: 'water-search-soup', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'soup' }, { wait: 900 }], sheet: true, waitFor: 'water-pick-none', note: '"soup": no drink, foods are added in the diary' },
  { id: 'water-search-beer', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'beer' }, { wait: 900 }], sheet: true, waitFor: 'water-pick-alcohol', note: '"beer": alcohol is added in the diary' },
  { id: 'water-search-hebrew', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'שוקו' }, { wait: 900 }], sheet: true, waitFor: 'water-pick-b_shoko-matched', note: 'a Hebrew search: the matched names under the drinks' },
  { id: 'water-search-no-backend', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'monster' }, { wait: 900 }], sheet: true, waitFor: 'water-pick-online-empty', note: '"monster": the energy drink, and the online line of a build without the backend' },
  { id: 'water-search-moved', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'monster' }, { wait: 900 }, 'water-pick-b_energy_drink', toastGone], waitFor: 'water-choice-food', note: 'picked from Water: the screen on Other, the kind row scrolled to it, the drink chip and its line (the toast gone; e2e.cjs reads its words)' },
  { id: 'water-search-coffee', route: '/water', now: todayAt(13, 30), taps: [...pickAndLog('mocha', 'b_mocha'), toastGone], waitFor: 'water-choice-food', note: 'a mocha picked: Coffee with the mocha chip after its choices, the glasses priced' },
  { id: 'water-recent-chips', route: '/water', now: todayAt(13, 30), taps: [...pickAndLog('mocha', 'b_mocha'), ...pickAndLog('energy', 'b_energy_drink'), 'water-beverage-water'], waitFor: '^water-recent-', note: 'the Water kind with the drinks picked before as chips: the glasses still in the first view' },
  { id: 'water-recent-chips-stress', route: '/water', data: 'stress', now: todayAt(13, 30), taps: [...pickAndLog('mocha', 'b_mocha'), ...pickAndLog('hot chocolate', 'b_hot_chocolate'), ...pickAndLog('coconut', 'b_coconut_water'), 'water-beverage-water'], waitFor: '^water-recent-', note: 'three recent chips with long names: what does not fit on the line is left out' },
  { id: 'water-sizes-error',route: '/water', taps: ['section-add-a-drink-action', ...[0, 1, 2, 3].map((i) => ({ type: `water-preset-${i}`, text: '' })), 'water-presets-save'], sheet: true, waitFor: 'water-presets-error', note: 'every size cleared: the error' },
  // Loop 3: an amount asked about once (`drinkAmountCheck`), the limit, a typed minus, and typed sizes not dropped.
  { id: 'water-custom-ask', route: '/water', type: { 'water-custom-input': '2500' }, taps: ['water-custom-add'], waitFor: 'water-custom-check', note: 'above 2 L: asked once under the field, Add level with the cup' },
  { id: 'water-custom-over', route: '/water', type: { 'water-custom-input': '6000' }, waitFor: 'water-custom-check', note: 'above 5 L: "Up to 5 L at a time.", Add waits' },
  { id: 'water-custom-ask-imperial', route: '/water', imperial: true, type: { 'water-custom-input': '80' }, taps: ['water-custom-add'], waitFor: 'water-custom-check', note: 'above 2 L in fl oz: asked once' },
  { id: 'water-minus', route: '/water', type: { 'water-custom-input': '-100' }, note: 'a typed minus: kept, named under the cup, Add level with the cup and waiting' },
  { id: 'water-sizes-discard', route: '/water', taps: ['section-add-a-drink-action', { type: 'water-preset-0', text: '180' }, { key: 'Escape' }], sheet: true, waitFor: 'sheet-discard-title', note: 'a size typed, the sheet closed: "Discard these sizes?" in place of its footer' },
  { id: 'water-pick-ask', route: '/water', taps: ['water-search', 'water-pick-kcal-open', { type: 'water-pick-ml', text: '2500' }, { type: 'water-pick-kcal', text: '120' }, 'water-pick-kcal-add'], sheet: true, waitFor: 'water-pick-ask', note: 'the drink sheet\'s entered amount above 2 L: asked once under the fields' },
  { id: 'water-pick-kcal-ask', route: '/water', taps: ['water-search', 'water-pick-kcal-open', { type: 'water-pick-kcal', text: '4000' }, 'water-pick-kcal-add'], sheet: true, waitFor: 'water-pick-kcal-ask', note: 'the drink sheet\'s calories above 3,000 kcal: asked once, as quick add asks' },
];

// ------------------------------------------------------------------ weight
const weight = [
  // Weigh-ins synced from Garmin Connect through the in-memory health store, with the "Use it for my target" card
  // (defined once in health.cjs, so the crawl taps the same screen the evidence states show).
  require('./health.cjs').find((s) => s.id === 'weight-synced'),
  { id: 'weight-1m', route: '/weight', taps: ['weight-range-1m'], note: 'one month' },
  { id: 'weight-all', route: '/weight', taps: ['weight-range-all'], note: 'all of it' },
  { id: 'weight-stress', route: '/weight', data: 'stress', note: '142.6 kg, goal 118 kg' },
  { id: 'weight-stress-imperial', route: '/weight', data: 'stress', imperial: true, note: '314 lb' },
  { id: 'weight-imperial', route: '/weight', imperial: true, note: 'lb' },
  { id: 'weight-empty', route: '/weight', data: 'empty', note: 'one weigh-in or none' },
  { id: 'weight-history-all', route: '/weight', taps: ['section-history-action'], note: 'every weigh-in' },
  { id: 'weight-sheet', route: '/weight', taps: ['weight-log'], sheet: true, note: 'log a weigh-in' },
  { id: 'weight-sheet-imperial', route: '/weight', data: 'stress', imperial: true, taps: ['weight-log'], sheet: true, note: 'log a weigh-in in lb, 314 lb' },
  { id: 'weight-sheet-edit', route: '/weight', taps: ['weight-row-0'], sheet: true, note: 'an existing weigh-in: update and delete' },
  { id: 'weight-help-open', route: '/weight', taps: ['weight-trend-help'], waitFor: 'weight-trend-help-body', note: 'why the trend differs from the scale, open' },
  { id: 'weight-sheet-error', route: '/weight', taps: ['weight-log', { type: 'weight-input', text: '900' }, 'weight-save'], sheet: true, note: 'a weight out of range' },
  { id: 'weight-minus', route: '/weight', taps: ['weight-log', { type: 'weight-input', text: '-70' }], sheet: true, note: 'a typed minus in the weight: kept and named under the field' },
  { id: 'weight-sheet-minus', route: '/weight', taps: ['weight-log', { type: 'weight-bodyfat-input', text: '-20' }, 'weight-save'], sheet: true, note: 'a minus in body fat: Save waits with the field\'s own words' },
];

// ------------------------------------------------------------------ body
const body = [
  { id: 'body-imperial', route: '/body', imperial: true, note: 'in and lb' },
  { id: 'body-stress', route: '/body', data: 'stress', note: '142.6 kg' },
  { id: 'body-stress-imperial', route: '/body', data: 'stress', imperial: true, note: '314 lb, ft in' },
  { id: 'body-empty', route: '/body', data: 'empty', note: 'nothing measured yet' },
  { id: 'body-filled', route: '/body', data: 'empty', type: { 'body-neck-input': '38', 'body-waist-input': '84', 'body-hip-input': '99' }, waitFor: 'body-estimate', note: 'measurements typed: the estimate' },
  { id: 'body-filled-imperial', route: '/body', data: 'empty', imperial: true, type: { 'body-neck-input': '15', 'body-waist-input': '33', 'body-hip-input': '39' }, waitFor: 'body-estimate', note: 'measurements in inches' },
  { id: 'body-help-open', route: '/body', data: 'stress', taps: ['body-bmi-help', 'body-measure-help', 'body-lean-help'], waitFor: 'body-lean-help-body', note: 'every explanation open, long content' },
  { id: 'body-weight-error', route: '/body', data: 'empty', type: { 'body-neck-input': '38', 'body-waist-input': '84', 'body-weight-input': '900' }, taps: ['body-save'], note: 'no weigh-in today, and a weight out of range' },
  { id: 'body-minus', route: '/body', type: { 'body-neck-input': '38', 'body-waist-input': '-80' }, note: 'a minus in Waist: named under the field, Save measurements waits' },
];

// ------------------------------------------------------------------ sleep
const sleep = [
  { id: 'sleep-30', route: '/sleep', taps: ['sleep-window-30'], note: '30 nights' },
  { id: 'sleep-empty', route: '/sleep', data: 'empty', note: 'no nights logged' },
  { id: 'sleep-sheet', route: '/sleep', taps: ['sleep-log'], sheet: true, note: 'log or edit last night' },
  { id: 'sleep-sheet-empty', route: '/sleep', data: 'empty', taps: ['sleep-log'], sheet: true, note: 'log the first night' },
  { id: 'sleep-sheet-row', route: '/sleep', taps: ['sleep-row-3'], sheet: true, note: 'an earlier night opened' },
  { id: 'sleep-help-open', route: '/sleep', taps: ['sleep-help'], waitFor: 'sleep-help-body', note: 'why 7 to 9 hours, open' },
  { id: 'sleep-past-day', route: '/sleep?date={day}', day: -4, note: 'four nights ago' },
  { id: 'sleep-history-all', route: '/sleep', taps: ['section-sleep-history-action'], note: 'every night: "Show less" under the list' },
  // A night without a rating (what a synced night is until the person rates it). The demo's ratings are 2 to 5,
  // so tapping "Poor" twice selects it and clears it again whatever last night had; saving leaves it unrated.
  { id: 'sleep-unrated', route: '/sleep', taps: ['sleep-log', 'sleep-quality-1', 'sleep-quality-1', 'sleep-save', { wait: 4500 }], waitFor: 'sleep-last-night', note: 'last night saved without a rating' },
  { id: 'sleep-unrated-sheet', route: '/sleep', taps: ['sleep-log', 'sleep-quality-1', 'sleep-quality-1'], sheet: true, note: 'the sheet with no rating chosen' },
  // Synced nights (source 'health', from Garmin Connect, Apple Watch or the Health export) cannot be seeded by a
  // state yet: the format carries no records and the health demo has no sleep until the sleep sync lands.
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
  { id: 'fasting-custom', route: '/fasting', taps: ['fasting-target-custom', { type: 'fasting-custom-input', text: '36.5' }], waitFor: 'fasting-custom-input', note: 'a custom goal being typed' },
  { id: 'fasting-long-target', route: '/fasting', taps: ['fasting-target-custom', { type: 'fasting-custom-input', text: '72' }, 'fasting-custom-set', 'fasting-start'], waitFor: 'fasting-end', note: 'a 72 h fast running' },
  { id: 'fasting-history', route: '/fasting', taps: ['fasting-start', 'fasting-adjust', 'fasting-shift--60', 'fasting-shift--60', 'fasting-adjust-save', settle, 'fasting-end', settle, 'fasting-start', settle, 'fasting-end', settle, toastGone], waitFor: 'fasting-row-1', note: 'two finished fasts in the history' },
];

// ------------------------------------------------------------------ friends, no account here
const friendsLocal = [
  { id: 'friends-add-local', route: '/friends/add?invite=ABCD2345', note: 'an invite link opened with no accounts' },
  { id: 'friends-local', route: '/friends', waitFor: 'friends-unavailable', note: 'friends in a build with no accounts: two lines and Back to Today' },
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

// ------------------------------------------------------------------ online drinks (a build with a backend)
// The drink sheet's "Online products" with answers: only with --backend, against a build exported with
// EXPO_PUBLIC_SUPABASE_URL pointing at scripts/dev/mock-backend.cjs (README, "Testing accounts and sync
// locally"); no account is needed. "iced coffee" has a fixed answer there (seven products, five of them
// drinks), so nothing goes to the network. The other three need fixed answers of their own in
// mock-backend.cjs ("flat white": no hits; "cold brew": a 502; "bubble tea": an answer held 20 s): until
// it has them, they would reach the live service, so run them only against a stand-in that answers them.
const drinksOnline = [
  { id: 'water-search-online', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'iced coffee' }, { wait: 1500 }], sheet: true, waitFor: 'water-pick-off_8850389301012', note: '"iced coffee": no local drink, five online drinks with their brand and pack' },
  { id: 'water-search-online-picked', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'iced coffee' }, { wait: 1500 }, 'water-pick-off_8850389301012', toastGone], waitFor: 'water-choice-food', note: 'an online drink picked from Water: Other, its chip, the line with its calories (the toast gone)' },
  { id: 'water-search-online-none', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'flat white' }, { wait: 1500 }], sheet: true, waitFor: 'water-pick-online-empty', note: '"flat white": nothing local, nothing online' },
  { id: 'water-search-online-failed', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'cold brew' }, { wait: 1500 }], sheet: true, waitFor: 'water-pick-online-empty', note: '"cold brew": the online products could not be reached' },
  { id: 'water-search-online-loading', route: '/water', now: todayAt(13, 30), taps: ['water-search', { type: 'water-pick-search', text: 'bubble tea' }, { wait: 900 }], sheet: true, waitFor: 'water-pick-online-empty', note: '"bubble tea": still searching' },
];

module.exports = [
  ...train, ...pick, ...log, ...imports, ...strength, ...water, ...weight, ...body, ...sleep, ...fasting, ...friendsLocal,
  // Only with --backend: every run passes --url now, and builds from with-build.cjs have no accounts.
  ...(process.argv.includes('--backend') ? [...drinksOnline, ...friendsSignedIn] : []),
];
