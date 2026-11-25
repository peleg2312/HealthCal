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
module.exports = states;
