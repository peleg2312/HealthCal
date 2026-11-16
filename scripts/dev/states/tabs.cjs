// The four tabs and the + sheet: every state of the other lists that starts on Today, the diary,
// Train or Progress (start, food, move, sweep), plus the ones only this list has.
//
//   node scripts/dev/evidence.cjs --states=tabs --out=<dir> [--only=train-guideline-sheet]
const TABS = /^\/(\?|$)|^\/(diary|train|progress)(\?|$)/;
const pick = (list) => require(`./${list}.cjs`).filter((s) => TABS.test(s.route));

module.exports = [
  // Train: how the guideline counts minutes, behind the info cup under the week.
  { id: 'train-guideline-sheet', route: '/train', taps: ['train-guideline-help'], sheet: true, note: 'how minutes count toward the guideline' },
  { id: 'train-guideline-sheet-stress', route: '/train', data: 'stress', taps: ['train-guideline-help'], sheet: true, note: 'the same sheet over the long-content week' },
  // Today with "Your week is ready" hidden, so the coach line shows under the calorie card (the demo week is otherwise Monday to Wednesday).
  { id: 'today-coach', route: '/', taps: ['today-recap-dismiss', { wait: 400 }], note: 'the coach line and its one action' },
  { id: 'today-coach-stress', route: '/', data: 'stress', taps: ['today-recap-dismiss', { wait: 400 }], note: 'the coach line with long content' },
  ...pick('start'),
  ...pick('food'),
  ...pick('move'),
  ...pick('sweep'),
];
