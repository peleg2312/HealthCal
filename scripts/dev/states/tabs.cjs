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
/** Today at hh:mm, as a timestamp for a state's `now`. */
const atm = (hour, minute) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
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

// A local calendar day n days from today, as the week strip's testIDs name it.
function isoDay(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Today's one-tap glass, at the foot of the day card: the toast rests in its one place, 12 px above the tab bar's + cup,
// and Today's scroll area ends 8 px above it while a control would lie under it, so nothing that shows is under it at
// 360 x 740, 390 x 844 and 320 x 640 (the toast scan judges both). It names the new total (`waterAddedToast` with
// `waterOfGoal`) and keeps to two lines at 320.
const water = [
  { id: 'today-water-toast', route: '/', taps: ['^today-water-', { wait: 300 }], waitFor: 'toast', note: 'a glass on Today: "250 ml added to Water · 1.48 of 3.3 L" over the tab bar, the page ending above it' },
  { id: 'today-water-toast-reached', route: '/', values: { water: 0.95 }, taps: ['^today-water-', { wait: 300 }], waitFor: 'toast', note: 'the glass that reaches the goal: the total and "goal reached"' },
  { id: 'today-water-toast-imperial', route: '/', imperial: true, taps: ['^today-water-', { wait: 300 }], waitFor: 'toast', note: 'the same in fl oz' },
  { id: 'today-water-toast-past', route: '/', taps: [`today-day-${isoDay(-1)}`, '^today-water-', { wait: 300 }], waitFor: 'toast', note: 'a glass on yesterday, picked on the strip: the day and the total, two lines at 320 (on a Monday the strip shows only today)' },
];

// Today's Activity, Sleep and Weight card under Meals (`PillarsCard`): every label one line ("Activity", the week in its
// caption: "this week, 75 today"), so the three values share a baseline at 320, 360 and 390, a fast running ("Fast of
// 16 h") and a past day included.
const rail = [
  { id: 'today-rail-fast', route: '/', values: { fasting: 0.4 }, waitFor: 'today-fasting', note: 'a fast running: "Fast of 16 h" on one line beside "Activity" and "Sleep", the values level' },
  { id: 'today-rail-past', route: '/', taps: [`today-day-${isoDay(-1)}`, { wait: 300 }], waitFor: 'today-rail', note: 'yesterday picked on the strip: "that week, 45 that day" under the week\'s minutes' },
];

// Kept days and the caption row's links (src/features/streak/kept.ts, builder STREAK). The seed logs every day up to
// its today, so the clock moves on to leave the page's yesterday with no food between logged days, which the streak
// keeps (drawn with the dashed kept line), inside the week shown on any weekday: two days on (the seed's day after is
// quiet), or, when that would be a Monday (the seed made on a Saturday, whose kept day would be last week's), one day
// on with the seed's own today left without food (values.eaten 0).
const keptAt = (() => {
  const d = new Date();
  const saturday = d.getDay() === 6;
  d.setDate(d.getDate() + (saturday ? 1 : 2));
  d.setHours(15, 0, 0, 0);
  return { now: d.getTime(), ...(saturday ? { values: { eaten: 0 } } : null) };
})();
// The month or year link needs the clock in its window and no week link in front of it: the first day of next month's
// first week, or of December 26 to 31, that is a Thursday to a Sunday (the week's link shows Monday to Wednesday).
const linkDay = (year, month, from, to) => {
  for (let day = from; day <= to; day++) {
    const d = new Date(year, month, day, 10, 0);
    if ([4, 5, 6, 0].includes(d.getDay())) return d.getTime();
  }
  return new Date(year, month, from, 10, 0).getTime();
};
const now0 = new Date();
const kept = [
  { id: 'today-kept-day', route: '/', ...keptAt, waitFor: 'today-week', note: 'yesterday with nothing logged between logged days: its cup wears the dashed kept line, its name says it is kept' },
  { id: 'today-kept-line', route: '/', ...keptAt, flags: { __healthcalKeptDay: true }, waitFor: 'today-kept-line', note: 'the one-time line in the caption row: "Kept: one quiet day does not break your streak." with its X' },
  { id: 'diary-kept-day', route: '/diary', ...keptAt, waitFor: 'diary-week', note: "the diary's strip draws the same kept day" },
  { id: 'today-period-link', route: '/', now: linkDay(now0.getFullYear(), now0.getMonth() + 1, 1, 7), flags: { __healthcalPeriodOffer: true }, waitFor: 'today-period-open', note: 'early in a month, no week link: "Your <month> is ready" with its X' },
  { id: 'today-year-link', route: '/', now: linkDay(now0.getFullYear(), 11, 26, 31), flags: { __healthcalPeriodOffer: true }, waitFor: 'today-period-open', note: 'the last days of December: "Your <year> is ready"' },
];

module.exports = [
  ...kept,
  ...header,
  ...water,
  ...rail,
  // Train: the overview's sheet (with how the guideline counts minutes), behind the week card's last line, which is one button.
  { id: 'train-guideline-sheet', route: '/train', taps: ['train-load-info'], sheet: true, note: 'how minutes count toward the guideline' },
  { id: 'train-guideline-sheet-stress', route: '/train', data: 'stress', taps: ['train-load-info'], sheet: true, note: 'the same sheet over the long-content week' },
  // Today's Now card (src/features/today/NowCard.tsx): the same place all day, only its words and actions change. The
  // demo's dinner is not logged, so from 20:30 (the seed's dinner at 19:30, an hour on) the coach asks about it; from
  // 21:00 the evening is late, and once dinner is in (its Repeat, then a reload that clears the toast) the card wraps
  // the day up with Share.
  { id: 'today-now-evening', route: '/', now: atm(20, 45), waitFor: 'today-now-repeat', note: 'the Now card in the evening: "Had dinner yet?", Repeat with its calories and the foods, What fits, "Ask the coach"' },
  { id: 'today-now-morning', route: '/', now: atm(9, 15), waitFor: 'today-now', note: 'the Now card in the morning, with the week caption\'s link early in the week' },
  { id: 'today-now-late', route: '/', now: atm(22, 0), taps: ['today-now-repeat', { wait: 400 }, { reload: true }], waitFor: 'today-share', note: 'late evening, dinner in: "Your day · wrap-up", Share and What fits' },
  { id: 'today-now-over', route: '/', values: { eaten: 1.15 }, now: atm(18, 0), waitFor: 'today-ideas', note: 'above the budget: the coach\'s neutral line, the hour\'s action and What fits' },
  { id: 'today-now-stress', route: '/', data: 'stress', now: atm(20, 45), waitFor: 'today-now', note: 'the Now card with long content' },
  { id: 'today-ask-coach', route: '/', values: { eaten: 1.1 }, waitFor: 'today-coach-ask', note: 'over the budget: "Ask the coach" in the Now card\'s corner, What fits its last action' },
  // The one-time word on where the coach went (src/features/coach/movedToast.ts), which an automated browser sees only when it asks.
  { id: 'today-coach-moved', route: '/', flags: { __healthcalCoachMoved: true }, waitFor: 'toast', note: 'the one-time toast: "The coach is now at the top of every tab."' },
  // The diary on a day with nothing logged after a day with food: no panel, the summary card's "Copy today" row,
  // each meal's dashed slot as its one add (the first says what the search offers) and Repeat beside last time's foods.
  { id: 'diary-empty-day-history', route: '/diary?date={day}', day: 1, waitFor: 'diary-copy-yesterday', note: 'tomorrow, empty: "Copy today", the slots and the Repeat buttons' },
  { id: 'diary-empty-day-history-stress', route: '/diary?date={day}', day: 1, data: 'stress', waitFor: 'diary-copy-yesterday', note: 'the same with long food names in the Repeat lines' },
  ...pick('start'),
  ...pick('food'),
  ...pick('move'),
  ...pick('sweep'),
];
