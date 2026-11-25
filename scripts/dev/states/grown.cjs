// Text a step or two above the designed size: the phone's common steps (Android's 1.15 and 1.3, iOS up to xxxLarge)
// as the app's own text size draws them (Profile > App, "Text size"; @/theme textSize). Through them Today, the diary
// and the + sheet keep their designed shape with larger text (`VERY_LARGE_TEXT`): a part gives way only where its
// words, measured as drawn, do not fit (src/features/today/fit.ts). Each state sets the size the way a person does:
// from its tab's profile tile, on Profile's own control (115% one step up, 130% two), then back to the tab.
//
//   node scripts/dev/evidence.cjs --states=grown --themes=blossom --widths=360 --out=<dir>
/** The taps that open Profile from a tab, set the text size `steps` steps up and come back to that tab. */
const sized = (tab, steps) => [`${tab}-profile`, ...Array(steps).fill('profile-text-size-larger'), 'header-back', { wait: 600 }];
/** The local date n days from today, as the week strip names its days (as in food.cjs). */
function isoDay(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Today at a clock time, for the greeting and the Now card's hour. */
function todayAt(h, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
const states = [];
for (const [steps, tag] of [
  [1, '115'],
  [2, '130'],
]) {
  const up = sized('today', steps);
  const upDiary = sized('diary', steps);
  states.push(
    { id: `text${tag}-today`, route: '/', taps: up, waitFor: 'today-energy', now: todayAt(14, 15), note: `Today at ${tag}% text, the afternoon` },
    { id: `text${tag}-today-morning`, route: '/', taps: up, waitFor: 'today-energy', now: todayAt(8, 30), note: `Today at ${tag}% text, the morning` },
    { id: `text${tag}-today-evening`, route: '/', taps: up, waitFor: 'today-energy', now: todayAt(20, 30), note: `Today at ${tag}% text, the evening` },
    { id: `text${tag}-today-first`, route: '/', data: 'empty', taps: up, waitFor: 'today-energy', note: `Today on day one at ${tag}% text` },
    { id: `text${tag}-today-past`, route: '/', taps: [...up, `today-day-${isoDay(-1)}`], waitFor: 'today-jump-today', note: `Today on yesterday at ${tag}% text` },
    { id: `text${tag}-today-over`, route: '/', values: { eaten: 1.15 }, taps: up, waitFor: 'today-energy', note: `Today over the budget at ${tag}% text` },
    { id: `text${tag}-diary`, route: '/diary', taps: upDiary, waitFor: 'diary-summary', note: `the diary at ${tag}% text` },
    { id: `text${tag}-diary-empty`, route: '/diary', data: 'empty', taps: upDiary, waitFor: 'diary-summary', note: `an empty diary day at ${tag}% text` },
    { id: `text${tag}-add-sheet`, route: '/', taps: [...up, 'tab-add'], sheet: true, note: `the + sheet at ${tag}% text` },
  );
}
// Water at the same steps, opened from Today's water row after the size is set (WATERGROWN): the cup's words at their
// levels in boxes measured as drawn, four glasses a row wherever their words fit, the title row on one line while it
// fits, and the drink chips and the cup's key in lines from their widths as drawn. Milk is tapped twice: at 320 px
// with grown text the first tap only scrolls the kind row (DrinkKindRow brings a chip into view as it takes the focus).
for (const [steps, tag] of [
  [1, '115'],
  [2, '130'],
]) {
  const toWater = [...sized('today', steps), 'today-water'];
  states.push(
    { id: `text${tag}-water`, route: '/', taps: toWater, waitFor: 'water-hero', note: `Water at ${tag}% text: the cup with its key, the glasses, the title row` },
    { id: `text${tag}-water-layers`, route: '/', values: { drinks: 2 }, taps: toWater, waitFor: 'water-key', note: `Water at ${tag}% text with five drinks of four kinds: the layers and a key of several items` },
    { id: `text${tag}-water-milk`, route: '/', now: todayAt(13, 30), taps: [...toWater, 'water-beverage-milk', 'water-beverage-milk', 'water-choice-milk_whole'], waitFor: 'water-drink-line', note: `Water at ${tag}% text, whole milk chosen: the choice chips and the glasses with their calories` },
    { id: `text${tag}-water-reached`, route: '/', taps: [...toWater, 'water-add-3', 'water-add-3', 'water-add-3', 'water-add-3', 'water-add-3'], waitFor: 'water-goal-reached', note: `Water at ${tag}% text, the goal reached: the brim line and the line under the cup` },
  );
}
// Train at the same steps (GTRAIN): the week card's words at their levels in boxes measured as drawn (the cup grows
// only if they need it), Log activity and Workout side by side while their words as drawn fit (halves, then each its
// own width, then 14 px side room), and each History row's figure beside its name wherever the two, as drawn, fit.
for (const [steps, tag] of [
  [1, '115'],
  [2, '130'],
]) {
  const up = sized('train', steps);
  states.push(
    { id: `text${tag}-train`, route: '/train', taps: up, waitFor: 'train-week-card', note: `Train at ${tag}% text: the week card, the two actions, History` },
    { id: `text${tag}-train-spread`, route: '/train', values: { spread: 1 }, taps: up, waitFor: 'train-week-card', note: `Train at ${tag}% text on "Over 7 days": figures under their names, breaking only before "over 7 days"` },
    { id: `text${tag}-train-off`, route: '/train', values: { eatBack: 0 }, taps: up, waitFor: 'train-week-card', note: `Train at ${tag}% text with workouts not added` },
    { id: `text${tag}-train-stress`, route: '/train', data: 'stress', taps: up, waitFor: 'train-week-card', note: `Train at ${tag}% text with long content: three-figure days in the strip, big totals` },
    { id: `text${tag}-train-empty`, route: '/train', data: 'empty', taps: up, waitFor: 'train-week-card', note: `Train on day one at ${tag}% text` },
  );
}
// Progress and the kit's Segmented at the same steps (GPROG): the section tabs on one row while their labels, measured
// as drawn in bold, fit it (equal shares, else each as wide as its label, 8 px apart at least; `segmentLayout`), the
// overview tiles two a row while every tile's title, number and caption, measured two a row, fit, the reached
// milestones two a row and each "Up next" share beside its title while their titles fit (src/features/progress/grownFit.ts).
// The size is set on Profile over the Progress tab, so the tabs and tiles measure again when Progress comes back. The
// Segmented screens are opened from Profile after the size is set.
for (const [steps, tag] of [
  [1, '115'],
  [2, '130'],
]) {
  const up = sized('progress', steps);
  const onProfile = ['progress-profile', ...Array(steps).fill('profile-text-size-larger')];
  states.push(
    { id: `text${tag}-progress`, route: '/progress', taps: up, waitFor: 'progress-overview-grid', note: `Progress at ${tag}% text: the tabs, the overview tiles, the milestones` },
    { id: `text${tag}-progress-nutrition`, route: '/progress', taps: [...up, 'progress-segment-nutrition'], waitFor: 'progress-calories', note: `Progress, Nutrition at ${tag}% text` },
    { id: `text${tag}-progress-body`, route: '/progress', taps: [...up, 'progress-segment-body'], waitFor: 'progress-weight', note: `Progress, Body at ${tag}% text` },
    { id: `text${tag}-progress-habits`, route: '/progress', taps: [...up, 'progress-segment-habits'], waitFor: 'progress-habits', note: `Progress, Habits at ${tag}% text` },
    { id: `text${tag}-progress-stress`, route: '/progress', data: 'stress', taps: up, waitFor: 'progress-overview-grid', note: `Progress at ${tag}% text with long content: 11,480 kcal days, 142.6 kg` },
    { id: `text${tag}-profile-units`, route: '/progress', taps: onProfile, waitFor: 'profile-units-metric', note: `Profile at ${tag}% text: the units choice (Segmented)` },
    { id: `text${tag}-goals`, route: '/progress', taps: [...onProfile, 'profile-goals'], waitFor: 'goals-exercise-spread-day', note: `Goals at ${tag}% text: five Segmented choices` },
    { id: `text${tag}-reminders`, route: '/progress', taps: [...onProfile, 'profile-reminders'], note: `Reminders at ${tag}% text: the interval (Segmented)` },
    { id: `text${tag}-fasting`, route: '/progress', taps: [...onProfile, 'profile-fasting'], note: `Fasting at ${tag}% text: the goal (Segmented, five choices)` },
    { id: `text${tag}-sleep`, route: '/progress', taps: [...onProfile, 'profile-sleep'], note: `Sleep at ${tag}% text: the range (Segmented)` },
  );
}
module.exports = states;
