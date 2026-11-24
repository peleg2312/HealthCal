// The four tabs and the + sheet: every state of the other lists that starts on Today, the diary,
// Train or Progress (start, food, move, sweep), plus the ones only this list has.
//
//   node scripts/dev/evidence.cjs --states=tabs --out=<dir> [--only=train-guideline-sheet]
const TABS = /^\/(\?|$)|^\/(diary|train|progress)(\?|$)/;
const pick = (list) => require(`./${list}.cjs`).filter((s) => TABS.test(s.route));

// The tab header (src/components/TabHeader.tsx): Coach, Friends and the profile tile on the right of
// every tab, and Today's greeting, which shortens to keep the name ("Afternoon, Alex") before it
// drops it. Run at 320, 360 and 390: the afternoon is the longest greeting, the stress name the
// longest name, and a Wednesday the longest overline.
const at = (hour) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};
const wednesday = -((new Date().getDay() + 7 - 3) % 7);
const header = [
  { id: 'tabs-header-today', route: '/', now: at(15), waitFor: 'today-coach-open', note: 'Today in the afternoon: the greeting beside the three header cups' },
  { id: 'tabs-header-today-morning', route: '/', now: at(9), waitFor: 'today-coach-open', note: 'Today in the morning' },
  { id: 'tabs-header-today-evening', route: '/', now: at(20), waitFor: 'today-coach-open', note: 'Today in the evening' },
  { id: 'tabs-header-today-stress', route: '/', data: 'stress', now: at(15), waitFor: 'today-coach-open', note: 'Today with a 22-character name: the name is left out, the greeting kept' },
  { id: 'tabs-header-diary', route: '/diary?date={day}', day: wednesday, now: at(15), waitFor: 'diary-coach-open', note: 'the diary on a Wednesday, the longest overline' },
  { id: 'tabs-header-train', route: '/train', now: at(15), waitFor: 'train-coach-open', note: 'Train with the three header cups and no Coach link in its content' },
  { id: 'tabs-header-progress', route: '/progress', now: at(15), waitFor: 'progress-coach-open', note: 'Progress with its range overline' },
  { id: 'tabs-header-progress-early', route: '/progress', data: 'empty', now: at(15), waitFor: 'progress-coach-open', note: 'Progress before there is enough data: the "Trends and insights" overline' },
];

module.exports = [
  ...header,
  // Train: how the guideline counts minutes, behind the info cup under the week.
  { id: 'train-guideline-sheet', route: '/train', taps: ['train-load-info'], sheet: true, note: 'how minutes count toward the guideline' },
  { id: 'train-guideline-sheet-stress', route: '/train', data: 'stress', taps: ['train-load-info'], sheet: true, note: 'the same sheet over the long-content week' },
  // Today with "Your week is ready" hidden, so the coach line shows under the calorie card (the demo week is otherwise Monday to Wednesday).
  { id: 'today-coach', route: '/', taps: ['today-recap-dismiss', { wait: 400 }], note: 'the coach line, its one action and "Ask the coach" beside it' },
  // The one-time word on where the coach went (src/features/coach/movedToast.ts), which an automated browser sees only when it asks.
  { id: 'today-coach-moved', route: '/', flags: { __healthcalCoachMoved: true }, waitFor: 'toast', note: 'the one-time toast: "The coach is now at the top of every tab."' },
  { id: 'today-coach-stress', route: '/', data: 'stress', taps: ['today-recap-dismiss', { wait: 400 }], note: 'the coach line with long content' },
  ...pick('start'),
  ...pick('food'),
  ...pick('move'),
  ...pick('sweep'),
];
