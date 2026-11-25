// Value sweeps: every cup or bar that carries labels or sits beside other content, at the values
// that stress its layout. A label set at a cup's level, a bar's tick or a chart label must hold for
// every value, not only the demo's (AGENTS.md, Design rules). The format is in scripts/dev/evidence.cjs;
// `values` sets today's amounts on top of the demo data (buildSeed's `values` in scripts/dev/seed.mjs):
// eaten and protein as a share of today's budget and protein target, exercise in net kcal, water as
// a share of today's goal, weekMinutes toward the weekly guideline, fasting as a share of the target.
//
//   node scripts/dev/with-build.cjs --dir=<build> --port=<port> -- node scripts/dev/evidence.cjs --url={url} \
//        --states=sweep --themes=blossom --widths=360 --out=<dir> [--only=<id>,<id>]
// (59 states take about 4 minutes per width: one width per command, 360 first, then 390 and 320.)
//
// Only the combinations that can look different are here:
//   Today's calorie cup      eaten 0, 5%, a third, 60% (the owner's case), 85%, at budget, 30% over,
//                            each with no exercise, 290 kcal and 900 kcal (the hatched headroom);
//                            protein low and past its target; water 0, 37%, at goal, 113%
//   the diary's summary bar  every eaten value at 290 kcal, 60% and 30% over with none and 900
//   the water cup            0, 37%, at goal, 113%
//   Train's week cup         0, 45, 150 (the guideline), 300 and 600 minutes
//   the fasting cup          not running, 5%, 37%, 85%, at target, 30% past
//   the share card           nothing eaten, 60%, 30% over, with the calories shown
//   the plan reveal          a gain, a small loss and a big loss (start.cjs has the usual loss and keeping weight)
//   the morning page         the week in cups (yesterday's large cup with its number) and yesterday's figures:
//                            within the budget with protein and water reached, 30% over with 400 kcal of
//                            exercise, logged in part, no food yesterday after a week with food, the strong
//                            day (case A) and long content, imperial (case G) (morning.cjs: the clock at
//                            tomorrow 08:10)
const start = require('./start.cjs');
const morning = require('./morning.cjs');

const EATEN = [[0, '0'], [0.05, '5'], [0.33, '33'], [0.6, '60'], [0.85, '85'], [1, '100'], [1.3, '130']];
const EXERCISE = [0, 290, 900];
const WATER = [[0, '0'], [0.37, '37'], [1, '100'], [1.13, '113']];

// ------------------------------------------------------------------ Today
const today = [
  ...EXERCISE.flatMap((exercise) => EATEN.map(([eaten, pct]) => ({
    id: `sweep-today-eaten-${pct}-ex-${exercise}`, route: '/', values: { eaten, exercise },
    note: `Today, ${pct}% of the budget eaten, ${exercise} kcal of exercise`,
  }))),
  // Exercise not added to the budget: the card's last row says what was burned and left out.
  { id: 'sweep-today-not-added', route: '/', values: { eatBack: 0, exercise: 290, eaten: 0.6 }, note: 'Today, 60% eaten, 290 kcal burned and not added to the budget' },
  { id: 'sweep-today-not-added-big', route: '/', values: { eatBack: 0, exercise: 900, eaten: 1.3 }, note: 'Today over budget, 900 kcal burned and not added' },
  { id: 'sweep-today-protein-low', route: '/', values: { eaten: 0.6, exercise: 290, protein: 0.05 }, note: 'Today, 60% eaten with almost no protein' },
  { id: 'sweep-today-protein-over', route: '/', values: { eaten: 0.6, exercise: 290, protein: 1.3 }, note: 'Today, 60% eaten, protein 30% past its target' },
  ...WATER.map(([water, pct]) => ({ id: `sweep-today-water-${pct}`, route: '/', values: { eaten: 0.6, exercise: 290, water }, note: `Today with ${pct}% of the water goal` })),
  // Workout calories over 7 days (values.spread): the cup's label reads "~N added".
  { id: 'sweep-today-week-ex-0', route: '/', values: { spread: 1, exercise: 0, eaten: 0.6 }, note: 'Over 7 days, no workout today: the headroom is all shares carried from the last six days' },
  { id: 'sweep-today-week-ex-290', route: '/', values: { spread: 1, exercise: 290, eaten: 0.6 }, note: 'Over 7 days, a 290 kcal workout today: its first share plus the carried ones' },
  { id: 'sweep-today-week-ex-900-over', route: '/', values: { spread: 1, exercise: 900, eaten: 1.3 }, note: 'Over 7 days, 900 kcal today and 30% over the budget' },
];

// ------------------------------------------------------------------ the diary
const diary = [
  // The summary's trough, target, workouts and macros are behind its chevron (`diary-summary-details`): each state opens it.
  ...EATEN.map(([eaten, pct]) => ({ id: `sweep-diary-eaten-${pct}-ex-290`, route: '/diary', values: { eaten, exercise: 290 }, taps: ['diary-summary-details'], waitFor: 'diary-summary-more', note: `the diary's summary at ${pct}% eaten, 290 kcal of exercise` })),
  ...[0, 900].flatMap((exercise) => [[0.6, '60'], [1.3, '130']].map(([eaten, pct]) => ({
    id: `sweep-diary-eaten-${pct}-ex-${exercise}`, route: '/diary', values: { eaten, exercise }, taps: ['diary-summary-details'], waitFor: 'diary-summary-more',
    note: `the diary's summary at ${pct}% eaten, ${exercise} kcal of exercise`,
  }))),
  { id: 'sweep-diary-week', route: '/diary', values: { spread: 1, exercise: 290, eaten: 0.6 }, taps: ['diary-summary-details'], waitFor: 'diary-exercise', note: 'the diary\'s summary over 7 days: "~N kcal added over 7 days"' },
];

// ------------------------------------------------------------------ trackers
const water = WATER.map(([value, pct]) => ({ id: `sweep-water-${pct}`, route: '/water', values: { water: value }, note: `the water cup at ${pct}% of the goal` }));
const train = [0, 45, 150, 300, 600].map((weekMinutes) => ({ id: `sweep-train-week-${weekMinutes}`, route: '/train', values: { weekMinutes }, note: `Train's week cup at ${weekMinutes} guideline minutes` }));
const fasting = [[0, '0'], [0.05, '5'], [0.37, '37'], [0.85, '85'], [1, '100'], [1.3, '130']].map(([value, pct]) => ({
  id: `sweep-fasting-${pct}`, route: '/fasting', values: { fasting: value }, waitFor: 'fasting-screen', note: value ? `the fasting cup ${pct}% of the way to the goal` : 'no fast running',
}));

// ------------------------------------------------------------------ the share card
// From the diary, where Share is at every hour on a day with food (an empty day has none, so 0% is not reached).
const share = [[0.6, '60'], [1.3, '130']].map(([eaten, pct]) => ({
  id: `sweep-share-eaten-${pct}`, route: '/diary', values: { eaten, exercise: 290 }, taps: ['diary-share', 'share-choice-kcal'], sheet: true,
  note: `the share card at ${pct}% eaten, calories shown`,
}));

// ------------------------------------------------------------------ the plan reveal
// The steps of start.cjs's onb-plan-metric (a woman of 68 kg, losing to 62 kg), with the goal or the target changed.
const planSteps = start.find((s) => s.id === 'onb-plan-metric').taps;
const withPlan = (goal, target) => planSteps.map((t) => (t === 'onb-goal-lose' ? `onb-goal-${goal}` : t && t.type === 'onb-target-input' ? { ...t, text: target } : t));
const plan = [
  { id: 'sweep-plan-gain', route: '/onboarding', data: 'fresh', taps: withPlan('gain', '74'), waitFor: 'plan-reveal', note: 'the plan reveal for gaining 6 kg' },
  { id: 'sweep-plan-small-loss', route: '/onboarding', data: 'fresh', taps: withPlan('lose', '67'), waitFor: 'plan-reveal', note: 'the plan reveal for losing 1 kg' },
  { id: 'sweep-plan-big-loss', route: '/onboarding', data: 'fresh', taps: withPlan('lose', '52'), waitFor: 'plan-reveal', note: 'the plan reveal for losing 16 kg' },
];

// ------------------------------------------------------------------ the morning page
// The week's cups and yesterday's figures on /morning at yesterday's values (the states of morning.cjs, under their own ids).
const shelf = ['morning-within', 'morning-over', 'morning-partial', 'morning-no-food', 'morning-a-strong', 'morning-g-stress'].map((id) => {
  const s = morning.find((m) => m.id === id);
  if (!s) throw new Error(`sweep: no state ${id} in morning.cjs`);
  return { ...s, id: `sweep-${id}` };
});

module.exports = [...today, ...diary, ...water, ...train, ...fasting, ...share, ...plan, ...shelf];
