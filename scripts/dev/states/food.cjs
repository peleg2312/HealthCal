// Today, the diary, the + sheet and everything about food, in the states a route alone does not
// show: open sheets, other tabs and filters, a past or future day, errors, edit mode, long names
// and big numbers (data: 'stress'), imperial units. The format is in scripts/dev/evidence.cjs.
//
//   node scripts/dev/evidence.cjs --states=food --out=<dir> [--only=<id>,<id>]
//
// Entry and saved-meal ids are random in the demo data, so a state reaches them by tapping
// ('^entry-' is the first diary row, '^recent-0' the first recent food). In the stress data the
// long 12-item saved meal is the second one (index 1). A day on a week strip is
// named by its date, worked out here the same way evidence.cjs works out {day}.

function isoDay(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const LONG_QUERY = 'greek yogurt with honey granola and fresh blueberries large';
/** Today at this local clock time, for a state that needs the meal of the hour (the stress seed's Hebrew-named usual food is a lunch). */
function todayAt(h, m = 0) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

module.exports = [
  // ---------------------------------------------------------------- Today
  { id: 'today-past-day', route: '/', taps: [`today-day-${isoDay(-1)}`], waitFor: 'today-jump-today', note: 'Today showing yesterday, picked on the week strip' },
  { id: 'today-over-budget', route: '/', data: 'stress', taps: [`today-day-${isoDay(-2)}`], waitFor: 'today-jump-today', note: 'Today showing the 11,480 kcal day: over budget' },
  { id: 'today-zero-day', route: '/', data: 'stress', taps: [`today-day-${isoDay(-3)}`], waitFor: 'today-jump-today', note: 'a past day logged at 0 kcal' },
  { id: 'today-first-day', route: '/', data: 'empty', waitFor: 'today-first-invite', note: 'day one: the empty cup and the first-log invite' },
  { id: 'today-first-day-imperial', route: '/', data: 'empty', imperial: true, waitFor: 'today-first-invite', note: 'day one in imperial units' },
  { id: 'today-stress', route: '/', data: 'stress', note: 'long name, 12-item lunch, 12.5 L water, 412-day streak' },
  { id: 'today-stress-imperial', route: '/', data: 'stress', imperial: true, note: 'stress data in lb and fl oz' },
  { id: 'today-imperial', route: '/', imperial: true, note: 'Today in imperial units' },
  // The big number switches between left and eaten with one tap, kept on this device (src/features/today/calorieFigure.ts).
  { id: 'today-figure-eaten', route: '/', taps: ['today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'the big number switched: "1,219 kcal eaten", "941 left of 2,160" at the level' },
  { id: 'today-figure-eaten-low', route: '/', values: { eaten: 0.15 }, taps: ['today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'eaten, early in the day: the line near the base of the cup' },
  { id: 'today-figure-eaten-over', route: '/', values: { eaten: 1.1 }, taps: ['today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'eaten, above the budget: "216 above 2,160" at the level, the amber cap, no red' },
  { id: 'today-figure-eaten-added', route: '/', values: { eaten: 0.95, exercise: 400 }, taps: ['today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'eaten into the hatched headroom' },
  { id: 'today-figure-eaten-past', route: '/', taps: [`today-day-${isoDay(-1)}`, 'today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'eaten on yesterday: "under" the budget in the line' },
  { id: 'today-figure-eaten-imperial', route: '/', imperial: true, taps: ['today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'eaten, imperial units' },
  { id: 'today-figure-eaten-stress', route: '/', data: 'stress', taps: ['today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'eaten with long content' },
  { id: 'today-figure-feast', route: '/', data: 'stress', taps: [`today-day-${isoDay(-2)}`, 'today-figure', { wait: 300 }], waitFor: 'today-figure', note: 'the 11,480 kcal day as eaten: a six-figure number whole beside its unit and the mark' },
  { id: 'today-fits-sheet', route: '/', taps: ['today-ideas'], sheet: true, note: 'the "What fits" sheet from the "Ideas that fit" chip' },
  { id: 'today-fits-stress', route: '/', data: 'stress', taps: ['today-ideas'], sheet: true, note: 'What fits with long food names' },
  // Day one has no "Ideas that fit" chip (its invite is the one thing to do): What fits from the coach's ideas answer.
  { id: 'today-fits-empty', route: '/coach?ask=ideas', data: 'empty', now: todayAt(19, 0), taps: ['coach-local-fits'], sheet: true, note: 'What fits with no food history (a fixed clock, so its meal and plates repeat)' },
  // Meals that fit (src/features/today/ideas.ts), at dinner time: the demo's own dinners and saved meals, else plates.
  { id: 'today-ideas-chip', route: '/', values: { eaten: 0.6 }, now: todayAt(19, 0), waitFor: 'today-ideas', note: 'Today: the "Ideas that fit" chip under the eaten line' },
  { id: 'today-ideas-chip-low', route: '/', values: { eaten: 0.15 }, now: todayAt(19, 0), waitFor: 'today-ideas', note: 'Today early in the day: the chip under an eaten line near the base of the cup' },
  { id: 'today-ideas-sheet', route: '/', values: { eaten: 0.6 }, now: todayAt(19, 0), taps: ['today-ideas'], sheet: true, waitFor: 'fits-ideas', note: 'What fits from the chip: Meals that fit above the single foods' },
  { id: 'today-ideas-stress', route: '/', data: 'stress', now: todayAt(19, 0), taps: ['today-ideas'], sheet: true, note: 'What fits with long names: ideas and single foods' },
  { id: 'today-ideas-empty', route: '/coach?ask=ideas', data: 'empty', now: todayAt(19, 0), taps: ['coach-local-fits'], sheet: true, waitFor: 'fits-ideas', note: 'no food history: three plates and the cooking-oil note (from the coach: day one has no chip)' },
  { id: 'today-ideas-few', route: '/', values: { eaten: 0.95 }, now: todayAt(19, 0), taps: ['today-ideas'], sheet: true, note: 'under 150 kcal left: no meal ideas, only own foods that fit' },
  { id: 'today-ideas-over', route: '/coach?ask=ideas', values: { eaten: 1.1 }, now: todayAt(19, 0), taps: ['coach-local-fits'], sheet: true, waitFor: 'fits-over', note: 'over the budget (no chip on Today; from the coach\'s ideas answer): one neutral line and Search all foods, no list' },
  { id: 'today-ideas-added', route: '/', values: { eaten: 0.6 }, now: todayAt(19, 0), taps: ['today-ideas', 'fits-idea-add-0', { wait: 300 }], sheet: true, note: 'an idea added: its tick, the rows in place, a row that no longer fits dimmed, the toast' },
  { id: 'today-share-sheet', route: '/', taps: ['today-share'], sheet: true, note: 'the share sheet, default choices' },
  { id: 'today-share-all', route: '/', data: 'stress', taps: ['today-share', 'share-choice-kcal', 'share-choice-foods'], sheet: true, note: 'every choice on, long food names on the card' },
  { id: 'today-share-none', route: '/', taps: ['today-share', 'share-choice-water', 'share-choice-activity', 'share-choice-streak', 'share-choice-week'], sheet: true, note: 'every choice off: the bare cup' },
  { id: 'today-share-past', route: '/', data: 'stress', taps: [`today-day-${isoDay(-2)}`, 'today-share', 'share-choice-kcal'], sheet: true, note: 'sharing the over-budget day with numbers' },

  // ---------------------------------------------------------------- the + sheet
  { id: 'quick-sheet', route: '/', taps: ['tab-add'], sheet: true, note: 'the + sheet with usual foods' },
  { id: 'quick-sheet-stress', route: '/', data: 'stress', taps: ['tab-add'], sheet: true, note: 'the + sheet with long usual and saved-meal names' },
  { id: 'quick-sheet-empty', route: '/', data: 'empty', taps: ['tab-add'], sheet: true, note: 'the + sheet with no history: no usual foods, no repeat' },
  { id: 'quick-sheet-imperial', route: '/', imperial: true, taps: ['tab-add'], sheet: true, note: 'the + sheet water glasses in fl oz' },
  { id: 'quick-sheet-past', route: '/', taps: [`today-day-${isoDay(-1)}`, 'tab-add'], sheet: true, note: 'the + sheet titled for a past day' },
  // A usual food's tile is quick-usual-<food id> (the demo's foods are all bundled, b_...): the row's heading
  // (quick-usual-title) and the saved meal's tile (quick-usual-saved) share the prefix, so the tap names b_.
  { id: 'quick-sheet-logged', route: '/', taps: ['tab-add', '^quick-usual-b_', { wait: 900 }], waitFor: 'toast-action', note: 'a usual food added from the + sheet: the sheet closes after its tick and the toast with Undo rests over Today' },

  // ---------------------------------------------------------------- Diary
  { id: 'diary-past', route: '/diary?date={day}', day: -1, note: 'yesterday' },
  { id: 'diary-future', route: '/diary?date={day}', day: 1, note: 'tomorrow: nothing planned, copy a day' },
  { id: 'diary-empty', route: '/diary', data: 'empty', note: 'no food logged ever' },
  { id: 'diary-stress', route: '/diary', data: 'stress', note: 'a 12-item lunch with long names' },
  { id: 'diary-feast-day', route: '/diary?date={day}', day: -2, data: 'stress', taps: ['diary-summary-details'], waitFor: 'diary-summary-more', note: 'the 11,480 kcal day, over budget: the summary\'s details open (the trough\'s amber, the macros)' },
  { id: 'diary-zero-day', route: '/diary?date={day}', day: -3, data: 'stress', taps: ['diary-summary-details'], waitFor: 'diary-summary-more', note: 'a logged 0 kcal day: the summary\'s details open (an empty trough)' },
  { id: 'diary-imperial', route: '/diary', imperial: true, note: 'the diary in imperial units' },
  { id: 'diary-menu', route: '/diary', taps: ['meal-menu-breakfast'], sheet: true, note: 'a meal menu with items' },
  { id: 'diary-empty-meal', route: '/diary', waitFor: 'meal-repeat-dinner', note: 'an empty meal: its dashed slot is its one add, no "+" or "..." in its header, Repeat beside last time\'s foods' },
  { id: 'diary-copy-to', route: '/diary', taps: ['meal-menu-breakfast', 'meal-menu-copy-to'], sheet: true, note: 'copy a meal to another day' },
  { id: 'diary-save-meal', route: '/diary', data: 'stress', taps: ['meal-menu-lunch', 'meal-menu-save'], sheet: true, note: 'save the 12-item lunch as a meal: the name offered is "My lunch" (the foods run over 40 characters)' },
  // The one-time "Save lunch as a meal" hint (src/features/food/saveHint.ts). An automated browser sees it
  // only with the flag; on a person's phone it shows until "Not now" or a save of a diary meal.
  { id: 'diary-save-hint', route: '/diary', flags: { __healthcalSaveHint: true }, waitFor: 'diary-save-hint', note: 'the hint under the first meal with two foods: "Save breakfast as a meal" and a quiet "Not now"' },
  { id: 'diary-save-hint-sheet', route: '/diary', flags: { __healthcalSaveHint: true }, taps: ['diary-save-hint'], sheet: true, waitFor: 'save-meal-name', absent: ['save-meal-foods'], note: 'the hint tapped: the save sheet with its count line ("Find it any time in Saved meals."), the name offered (the three foods, so they are not repeated in bold over it) and Save meal' },
  { id: 'diary-save-hint-stress', route: '/diary', data: 'stress', flags: { __healthcalSaveHint: true }, waitFor: 'diary-save-hint', note: 'the hint with long names (the first meal with two foods)' },
  { id: 'diary-save-hint-past', route: '/diary?date={day}', day: -1, flags: { __healthcalSaveHint: true }, waitFor: 'diary-save-hint', note: 'the hint on yesterday' },
  { id: 'diary-save-hint-meal', route: '/diary?meal=lunch', flags: { __healthcalSaveHint: true }, taps: [{ wait: 1500 }], waitFor: 'diary-save-hint', note: 'opened for lunch (a meal row on Today): the hint on lunch rather than breakfast, and it stays there after the diary scrolls to lunch and drops ?meal=' },
  { id: 'diary-save-hint-dismissed', route: '/diary', flags: { __healthcalSaveHint: true }, taps: ['diary-save-hint-close', { reload: true }, { wait: 800 }], absent: ['diary-save-hint'], note: '"Not now": gone, and still gone after a restart' },
  {
    id: 'diary-save-hint-after-ai',
    route: '/food/photo?mode=text&demoLive=1&meal=lunch',
    data: 'empty',
    flags: { __healthcalSaveHint: true },
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal', 'ai-add-to-diary', { wait: 1500 }],
    waitFor: '^entry-',
    absent: ['diary-save-hint'],
    note: 'a lunch just saved from the AI review: the diary offers no hint for it (its foods already are a saved meal)',
  },
  { id: 'diary-menu-stress', route: '/diary', data: 'stress', taps: ['meal-menu-lunch'], sheet: true, note: 'the menu for the 12-item lunch' },
  { id: 'diary-deleted', route: '/diary', taps: ['^entry-delete-'], note: 'a row deleted: the Undo toast over the tab bar' },
  { id: 'diary-repeat-stress', route: '/diary?date={day}', day: 1, data: 'stress', note: 'tomorrow with long names in the repeat lines' },
  // The diary's far days (the day swipe itself, a quick flick that never goes past today, is proven by
  // crawl.cjs's gesture checks; planning ahead is a tap in the strip). The ids are kept from when a swipe went a week ahead.
  { id: 'diary-swiped-last-day', route: '/diary?date={day}', day: 7, waitFor: 'diary-today', note: 'the furthest the diary goes: a week ahead (a tap in the strip), the strip on next week' },
  { id: 'diary-swiped-last-week', route: '/diary?date={day}', day: -8, waitFor: 'diary-today', note: 'back into last week: the strip follows to that week' },
  { id: 'quick-sheet-planned-day', route: '/diary?date={day}', day: 2, taps: ['tab-add'], sheet: true, note: 'the + sheet over a planned day: it logs to that day' },

  // ---------------------------------------------------------------- Search
  { id: 'search-results', route: '/food/search', type: { 'food-search-input': 'chicken' }, taps: [{ wait: 1200 }], note: 'results for a word' },
  { id: 'search-no-results', route: '/food/search', type: { 'food-search-input': 'zzqxv' }, taps: [{ wait: 1500 }], waitFor: 'search-no-local', note: 'nothing found: the AI tile reads Describe' },
  {
    id: 'search-describe-prefilled',
    route: '/food/search',
    type: { 'food-search-input': 'grandmas lentil stew with crusty bread' },
    taps: [{ wait: 1500 }, 'search-photo'],
    waitFor: 'ai-description',
    note: "no match, then Describe: the photo screen on Describe with the typed words in its field, nothing sent",
  },
  { id: 'search-long-query', route: '/food/search', type: { 'food-search-input': LONG_QUERY }, taps: [{ wait: 1500 }], note: 'a long query' },
  { id: 'search-recent', route: '/food/search', taps: ['search-tab-recent'], note: 'the Recent filter' },
  { id: 'search-favorites', route: '/food/search', data: 'stress', taps: ['search-tab-favorites'], note: 'Favourites with long names' },
  { id: 'search-mine', route: '/food/search', data: 'stress', taps: ['search-tab-mine'], note: 'My foods, long name and brand, with edit buttons' },
  { id: 'search-mine-empty', route: '/food/search', taps: ['search-tab-mine'], note: 'My foods, none yet' },
  { id: 'search-usual-empty', route: '/food/search?meal=snack', data: 'empty', taps: ['search-tab-usual'], waitFor: 'search-usual-empty', note: 'the fixed chips (Usual, Recent, Favourites, My foods, Saved meals): Usual with no history, its empty state' },
  { id: 'search-chips-meals', route: '/food/search?meal=lunch', taps: ['search-tab-meals'], waitFor: 'search-new-meal', note: 'Saved meals, the last chip of the fixed row, chosen: the row scrolled to it' },
  { id: 'search-meals', route: '/food/search', data: 'stress', taps: ['search-tab-meals'], note: 'Saved meals with a long name' },
  { id: 'search-edit-meals', route: '/food/search', taps: ['search-tab-meals', 'search-edit-meals'], waitFor: 'saved-meal-card-0', note: '"Edit or delete saved meals" opens the saved meals screen (a row\'s tap reviews it before logging)' },
  { id: 'search-empty', route: '/food/search', data: 'empty', note: 'search with no history at all' },
  { id: 'search-past-day', route: '/food/search?meal=snack&date={day}', day: -1, note: 'adding to a past day' },
  { id: 'search-added', route: '/food/search', taps: ['search-tab-recent', 'recent-0-add', { wait: 600 }], waitFor: 'recent-0-stepper', note: 'a food added: the row stepper and the footer count' },
  { id: 'search-added-stress', route: '/food/search?date={day}', day: -1, data: 'stress', taps: ['search-tab-recent', 'recent-0-add', { wait: 600 }], waitFor: 'recent-0-stepper', note: 'a long-named food added on a past day' },
  { id: 'search-amount-sheet', route: '/food/search', data: 'stress', taps: ['search-tab-recent', 'recent-0-add', { wait: 600 }, 'recent-0-amount'], sheet: true, note: 'the amount sheet for an added food, long name as its title' },
  { id: 'search-log-meal-sheet', route: '/food/search', data: 'stress', taps: ['search-tab-meals', 'saved-meal-1'], sheet: true, note: "the 12-item saved meal's row tapped: the review sheet (its \"+\" logs at once)" },
  { id: 'search-online-note', route: '/food/search', type: { 'food-search-input': 'oat milk' }, taps: [{ wait: 1500 }], waitFor: 'search-online-empty', note: 'the web build: "Online products" says in one line that name search is in the phone app' },
  // ---------------------------------------------------------------- The log toast's name (src/features/food/addedTo.ts, toastFoodName)
  { id: 'toast-name-brackets', route: '/food/search?meal=lunch', type: { 'food-search-input': 'israeli salad' }, taps: [{ wait: 1200 }, 'result-0-add'], waitFor: 'toast-action', note: 'a name with commas inside brackets: "Israeli salad added to lunch", never cut inside the bracket' },
  { id: 'toast-name-schnitzel', route: '/food/search?meal=lunch', type: { 'food-search-input': 'chicken schnitzel' }, taps: [{ wait: 1200 }, 'result-0-add'], waitFor: 'toast-action', note: '"Chicken schnitzel added to lunch"' },
  // ---------------------------------------------------------------- One water toast (waterAddedToast with the day's total)
  { id: 'water-tile-toast', route: '/water', taps: ['water-add-1'], waitFor: 'toast-action', note: 'a glass on the Water screen: "250 ml added to Water · <total> of <goal>", as on Today' },
  { id: 'water-tile-toast-drink', route: '/water', now: todayAt(13, 30), taps: ['water-beverage-milk', 'water-add-1'], waitFor: 'toast-action', note: 'a milk on the Water screen: its calories, then the same total' },
  { id: 'quick-sheet-water-toast', route: '/', taps: ['tab-add', 'quick-water-250', { wait: 900 }], waitFor: 'toast-action', note: "the + sheet's glass: the sheet closes and the same toast with the day's total rests over Today" },

  // ---------------------------------------------------------------- Detail
  { id: 'detail-new', route: '/food/search', taps: ['search-tab-recent', 'recent-0'], waitFor: 'food-detail-screen', note: 'a new food' },
  { id: 'detail-new-imperial', route: '/food/search', imperial: true, taps: ['search-tab-recent', 'recent-0'], waitFor: 'food-detail-screen', note: 'a new food in imperial units' },
  { id: 'detail-grams', route: '/food/search', taps: ['search-tab-recent', 'recent-0', '^detail-serving-', { wait: 300 }], waitFor: 'food-detail-screen', note: 'the first unit chosen' },
  { id: 'detail-long-brand', route: '/food/search', data: 'stress', taps: ['search-tab-mine', 'mine-0'], waitFor: 'food-detail-screen', note: 'your own food: 60-character name and a long brand' },
  { id: 'detail-long-builtin', route: '/food/search', data: 'stress', taps: ['search-tab-recent', 'recent-0'], waitFor: 'food-detail-screen', note: 'a long-named reference food' },
  { id: 'detail-edit', route: '/diary', taps: ['^entry-'], waitFor: 'detail-delete', note: 'editing an entry' },
  { id: 'detail-manual', route: '/diary?date={day}', day: -2, data: 'stress', taps: ['^entry-'], waitFor: 'manual-name', note: 'a quick add (no food definition): the number editor' },
  {
    id: 'detail-ai',
    route: '/food/photo?mode=text&meal=breakfast',
    data: 'empty',
    // The wait lets the "4 items added" toast from the review leave first (4.5 s), so the capture is the entry alone.
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-add-to-diary', { wait: 1200 }, '^entry-', { wait: 4000 }],
    waitFor: 'food-detail-screen',
    note: 'an AI estimate in the diary, opened: its range, its macros in whole grams',
  },

  // ---------------------------------------------------------------- Scan, photo, quick, custom
  { id: 'scan-lookup', route: '/food/scan', taps: [{ type: 'scan-manual-input', text: '5000112637922' }, 'scan-manual-submit', { wait: 4000 }], note: 'a typed barcode looked up (not found, or no network)' },
  { id: 'photo-describe', route: '/food/photo?mode=text', type: { 'ai-description': 'Two scrambled eggs with butter, one slice of sourdough toast and a flat white with oat milk' }, note: 'describe, filled in' },
  { id: 'photo-weight', route: '/food/photo', taps: [{ choose: 'ai-choose-photo', files: ['assets/images/icon.png'] }, { type: 'ai-photo-weight', text: '418' }], waitFor: 'ai-photo-preview', note: 'a photo chosen, with its weighed total (optional field)' },
  { id: 'photo-weight-error', route: '/food/photo', taps: [{ type: 'ai-photo-weight', text: '3' }, 'ai-photo-note'], note: 'a weighed total out of range: the field says so once it is left, not while typing' },
  { id: 'photo-weight-imperial', route: '/food/photo', imperial: true, taps: [{ type: 'ai-photo-weight', text: '16' }, 'ai-photo-note'], note: 'the weighed total in ounces for imperial units' },
  { id: 'photo-review', route: '/food/photo?mode=text', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: 'ai-add-to-diary', note: 'the estimate rows with ranges (sample): the sample is not the AI, so its rows wear the dashed key' },
  { id: 'photo-review-imperial', route: '/food/photo?mode=text', imperial: true, taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: 'ai-add-to-diary', note: 'the estimate in imperial units' },
  { id: 'photo-error-network', route: '/food/photo?mode=text&demoError=network', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: '^ai-error-', note: 'offline' },
  { id: 'photo-error-limit', route: '/food/photo?mode=text&demoError=daily_limit', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: '^ai-error-', note: 'the daily limit' },
  { id: 'photo-error-not-food', route: '/food/photo?mode=text&demoError=not_food', taps: [{ type: 'ai-description', text: 'A photo of my cat' }, 'ai-analyse', { wait: 2600 }], waitFor: '^ai-error-', note: 'not food' },
  { id: 'photo-consent-sheet', route: '/settings/about', taps: ['about-ai-consent'], sheet: true, note: 'the AI consent sheet (review mode; the ask mode needs a backend)' },
  // The wait for an estimate, held by the test hook ?demoWait (test builds only; nothing is sent): the photo with its level
  // line (one still line under reduced motion, as here), the three true steps with the AI's cup, and the note.
  { id: 'photo-capture', route: '/food/photo', waitFor: 'ai-take-photo', note: 'the capture card: the photo glyph of the AI family over "Photograph your meal"' },
  {
    id: 'photo-analysing',
    route: '/food/photo?demoWait=1',
    taps: [{ choose: 'ai-choose-photo', files: ['store/source/scrambled-eggs-on-toast-cc0.jpg'] }, { wait: 1500 }, 'ai-analyse', { wait: 600 }],
    waitFor: 'ai-analysing-level',
    note: 'the wait in photo mode: the photo with its level line, "Photo ready", the AI cup beside the estimating step, Cancel',
  },
  {
    id: 'photo-analysing-text',
    route: '/food/photo?mode=text&demoWait=1',
    taps: [{ type: 'ai-description', text: 'Two scrambled eggs with butter, one slice of sourdough toast and a flat white with oat milk' }, 'ai-analyse', { wait: 600 }],
    waitFor: 'ai-step-estimate',
    note: 'the wait in text mode: the words stay on screen, "Description ready"',
  },
  {
    id: 'photo-analysing-careful',
    route: '/food/photo?mode=text&demoWait=careful',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-check-again', { wait: 600 }],
    waitFor: 'ai-step-estimate',
    note: 'the careful check waiting: "Checking each food more carefully" and its own note',
  },
  // The review as a live estimate is drawn, by the test hook ?demoLive (the fixed sample, nothing sent): a live one needs an account.
  {
    id: 'photo-review-live',
    route: '/food/photo?mode=text&demoLive=1',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }],
    waitFor: 'ai-result-mark',
    note: 'a described meal reviewed: the AI cup beside the dish, the AI mark as each row\'s source',
  },
  {
    id: 'photo-review-hero',
    route: '/food/photo?demoLive=1',
    taps: [{ choose: 'ai-choose-photo', files: ['store/source/scrambled-eggs-on-toast-cc0.jpg'] }, { wait: 1500 }, 'ai-analyse', { wait: 2600 }],
    waitFor: 'ai-photo-hero',
    note: 'a photographed meal reviewed: the photo as the hero with the total and its range',
  },
  {
    id: 'diary-ai-row',
    route: '/food/photo?mode=text&meal=breakfast',
    data: 'empty',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-add-to-diary', { wait: 1200 }],
    waitFor: '^entry-',
    note: 'the diary with an estimated meal (its toast still up; the whole page shows the rows): each row wears the mark of the food it names (cherry tomatoes the tomato), else the pot, and the small AI cup as its source mark',
  },
  // "Also save as a meal" in the review's footer (src/features/ai/SaveMealRow.tsx), drawn as a live
  // estimate by ?demoLive (nothing sent). Off on every visit; on, the name of the saved meal and "Add to lunch and save".
  {
    id: 'photo-review-save-off',
    route: '/food/photo?mode=text&demoLive=1&meal=lunch',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }],
    waitFor: 'ai-save-meal',
    note: 'the review footer: "Also save as a meal" off above "Add to lunch"',
  },
  {
    id: 'photo-review-save-on',
    route: '/food/photo?mode=text&demoLive=1&meal=lunch',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal'],
    waitFor: 'ai-save-meal-name',
    note: 'the switch on: the name field (the dish) takes the words\' place beside the switch, one row, and "Add to lunch and save"; the first item stays in view over the footer',
  },
  {
    id: 'photo-review-save-focused',
    route: '/food/photo?mode=text&demoLive=1&meal=breakfast',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal', { type: 'ai-save-meal-name', text: 'Sunday chicken bowl with the green salad' }],
    waitFor: 'ai-save-meal-name',
    note: 'a long name typed in the focused field, the longest meal in the button ("Add to breakfast and save")',
  },
  {
    id: 'photo-review-save-hero',
    route: '/food/photo?demoLive=1&meal=lunch',
    taps: [{ choose: 'ai-choose-photo', files: ['store/source/scrambled-eggs-on-toast-cc0.jpg'] }, { wait: 1500 }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal'],
    waitFor: 'ai-save-meal-name',
    note: 'a photographed meal with the switch on',
  },
  {
    id: 'photo-review-save-sample',
    route: '/food/photo?mode=text&meal=lunch',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }],
    waitFor: 'ai-add-to-diary',
    absent: ['ai-save-meal', 'ai-save-meal-row'],
    note: 'the sample (no account): example data is never offered as one of my meals, so no switch',
  },
  {
    id: 'photo-saved-toast',
    route: '/food/photo?mode=text&demoLive=1&meal=lunch',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal', 'ai-add-to-diary', { wait: 1200 }],
    waitFor: 'toast',
    note: 'logged and saved: one toast that names the meal, one Undo for both',
  },
  {
    id: 'photo-saved-toast-long',
    route: '/food/photo?mode=text&demoLive=1&meal=breakfast',
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal', { type: 'ai-save-meal-name', text: 'Grilled chicken breast with brown rice, roasted vegetables and tahini' }, 'ai-add-to-diary', { wait: 1200 }],
    waitFor: 'toast',
    note: 'a long name in the toast: shortened at a word so the toast keeps to two lines at the window\'s width (more of it at 360 and 390 than at 320)',
  },
  {
    id: 'photo-saved-toast-hebrew-past',
    route: '/food/photo?mode=text&demoLive=1&meal=breakfast&date={day}',
    day: -1,
    taps: [{ type: 'ai-description', text: 'Shakshuka with two eggs and bread' }, 'ai-analyse', { wait: 2600 }, 'ai-save-meal', { type: 'ai-save-meal-name', text: 'שקשוקה של שבת בבוקר עם לחם וטחינה' }, 'ai-add-to-diary', { wait: 1200 }],
    waitFor: 'toast',
    note: 'yesterday\'s breakfast, no water, a 27-letter Hebrew name: the toast still names the meal, shortened at a word with "…" (never "meal saved")',
  },
  { id: 'quick-filled', route: '/food/quick', type: { 'quick-kcal': '1250', 'quick-name': 'Office birthday cake, two slices and a coffee with cream', 'quick-protein': '80' }, note: 'quick add filled, with the mismatch note' },
  { id: 'quick-past-day', route: '/food/quick?meal=breakfast&date={day}', day: -1, note: 'quick add to a past day' },
  { id: 'custom-errors', route: '/food/custom', taps: ['custom-save'], note: 'create a food: every error showing' },
  { id: 'custom-barcode', route: '/food/custom?barcode=5000112637922', note: 'create a food from a scanned barcode' },
  { id: 'custom-impossible', route: '/food/custom', type: { 'custom-name': 'Protein bar', 'custom-serving-grams': '40', 'custom-kcal': '200', 'custom-protein': '30', 'custom-carbs': '20' }, note: 'macros over 100 g per 100 g' },
  { id: 'custom-edit', route: '/food/search', data: 'stress', taps: ['search-tab-mine', 'mine-0-edit'], waitFor: 'custom-delete', note: 'editing your own food: long name and brand' },

  // ---------------------------------------------------------------- Saved meals
  { id: 'meals-stress', route: '/food/meals', data: 'stress', note: 'a saved meal with a long name and 12 items' },
  { id: 'meals-empty', route: '/food/meals', data: 'empty', note: 'no saved meals' },
  { id: 'meals-dinner-past', route: '/food/meals?meal=dinner&date={day}', day: -1, note: 'logging to dinner yesterday' },
  { id: 'meals-day-week-ahead', route: '/food/meals', taps: Array(7).fill('meals-day-next'), waitFor: 'meals-day-label', note: 'the one date control at its limit: seven taps reach a week ahead, as far as the diary goes; next is then off' },
  { id: 'detail-day-yesterday', route: '/food/search', taps: ['search-tab-recent', 'recent-0', 'detail-day-prev'], waitFor: 'detail-day-label', note: 'food detail on yesterday: the same date control as the run log and Saved meals' },
  { id: 'meals-log-sheet', route: '/food/meals', taps: ['saved-meal-log-0'], sheet: true, note: 'log a saved meal' },
  { id: 'meals-log-sheet-stress', route: '/food/meals', data: 'stress', taps: ['saved-meal-log-1'], sheet: true, note: 'log the 12-item meal with a long name' },
  { id: 'meal-edit-new', route: '/food/meal-edit', note: 'a new meal, empty' },
  { id: 'meal-edit-existing', route: '/food/meals', data: 'stress', taps: ['saved-meal-edit-1'], waitFor: 'meal-edit-screen', note: 'editing the 12-item meal' },
  { id: 'meal-edit-recipe', route: '/food/meals', taps: ['saved-meal-edit-0', { type: 'meal-edit-servings', text: '4' }], waitFor: 'meal-edit-screen', note: 'a recipe that makes 4 servings' },
  { id: 'meal-edit-item-sheet', route: '/food/meals', data: 'stress', taps: ['saved-meal-edit-1', 'meal-edit-item-0'], sheet: true, note: 'the amount sheet for one line, long name' },
  { id: 'meal-recipe-log-sheet', route: '/food/meals', taps: ['saved-meal-edit-0', { type: 'meal-edit-servings', text: '4' }, 'meal-edit-save', { wait: 800 }, 'saved-meal-log-0', 'log-meal-portion-other'], sheet: true, note: 'logging a share of a recipe: portion chips and Other' },
  { id: 'meal-pick', route: '/food/meal-edit', data: 'stress', taps: ['meal-edit-add', 'pick-recent-0-add', { wait: 600 }], waitFor: 'pick-recent-0-stepper', note: 'adding long-named foods to the builder: the stepper and the count' },
  { id: 'meal-pick-search', route: '/food/meal-edit', taps: ['meal-edit-add', { type: 'meal-pick-input', text: 'chicken' }, { wait: 800 }], waitFor: 'meal-pick-screen', note: 'meal builder search results' },
  { id: 'meal-pick-none', route: '/food/meal-edit', taps: ['meal-edit-add', { type: 'meal-pick-input', text: 'zzqxv' }, { wait: 800 }], waitFor: 'meal-pick-none', note: 'meal builder, nothing found' },

  // ---------------------------------------------------------------- Hebrew names and search
  // A person in Israel types the food's Hebrew name, or the Latin spelling Israelis use. Every Hebrew
  // name starts at the row's left edge, numbers stay with their units, the matched line is one line.
  // The stress seed holds two own foods named in Hebrew ("קוטג' 5% עם זיתים ושמן זית", serving "1 גביע";
  // "Pita פיתה מקמח מלא"), the first in today's lunch and usual at lunch, and a saved meal named in Hebrew.
  { id: 'search-hebrew', route: '/food/search', type: { 'food-search-input': 'קוטג' }, taps: [{ wait: 1200 }], note: 'a Hebrew word: the matched Hebrew name under each row' },
  { id: 'search-hebrew-prefix', route: '/food/search', type: { 'food-search-input': 'והחומוס' }, taps: [{ wait: 1200 }], note: 'a prefixed Hebrew word' },
  { id: 'search-hebrew-relaxed', route: '/food/search', type: { 'food-search-input': '2 ביצים' }, taps: [{ wait: 1200 }], note: 'an amount in the query' },
  { id: 'search-hebrew-none', route: '/food/search', type: { 'food-search-input': 'סביח' }, taps: [{ wait: 1500 }], waitFor: 'search-no-local', note: 'a Hebrew word with no match' },
  { id: 'search-latin-israeli', route: '/food/search', type: { 'food-search-input': 'tehina' }, taps: [{ wait: 1200 }], note: 'a Latin spelling' },
  { id: 'search-own-hebrew', route: '/food/search', data: 'stress', type: { 'food-search-input': 'קוטג 5' }, taps: [{ wait: 1200 }], note: 'an own food named in Hebrew with a Hebrew serving label' },
  { id: 'diary-hebrew-stress', route: '/diary', data: 'stress', note: 'a Hebrew-named entry with a Hebrew serving label in lunch' },
  { id: 'detail-hebrew', route: '/food/search', data: 'stress', type: { 'food-search-input': 'קוטג 5' }, taps: [{ wait: 1200 }, 'result-0'], waitFor: 'food-detail-screen', note: 'food detail of the Hebrew own food' },
  { id: 'meals-hebrew', route: '/food/meals', data: 'stress', note: 'a saved meal named in Hebrew with a Hebrew item' },
  { id: 'today-hebrew-usual', route: '/', data: 'stress', now: todayAt(12, 30), taps: ['today-ideas'], sheet: true, note: 'What fits at lunch time: the usual food named in Hebrew' },
  { id: 'quick-sheet-hebrew', route: '/', data: 'stress', now: todayAt(12, 30), taps: ['tab-add'], sheet: true, note: 'the + sheet at lunch time with long names (the Hebrew-named usual food and saved meal are under "See all"; quick-sheet-favourite-stress has a Hebrew name in a row)' },
  { id: 'meal-pick-hebrew', route: '/food/meal-edit', taps: ['meal-edit-add', { type: 'meal-pick-input', text: 'חומוס' }, { wait: 800 }], waitFor: 'meal-pick-screen', note: 'the meal builder searched in Hebrew: the matched line' },

  // ---------------------------------------------------------------- a remembered portion whose food changed
  // Five earlier snacks of cheese bourekas logged before the Israeli foods ("1 piece" 80 g at 335 kcal per 100 g;
  // seed knob oldBourekas), in the shape the device holds after a restart: today's bundled food attached, the old
  // label, grams and calories kept (src/store/persistence.ts). Today's food names "1 piece" at another weight, so
  // every place shows and logs "80 g" at today's values, never the stale label (lead's decisions D1 and H1). Before
  // H1 the + sheet showed "1 piece, 268 kcal" here and a tap stored 298 kcal. The clock is at snack time. Each state
  // first reloads the page ({ reload: true }), so what it looks at is what the app saved and loaded again.
  // The + sheet shows three likely rows (the demo's snack leads with whey, then its two favourite foods): the bourekas is
  // under "See all", in food search's Usual tab (search-old-portion). e2e.cjs's "old portion" check logs it from the
  // sheet, where it leads.
  { id: 'quick-sheet-old-portion', route: '/', values: { oldBourekas: 1 }, now: todayAt(16, 30), taps: [{ reload: true }, 'tab-add'], sheet: true, waitFor: 'quick-see-all', note: 'the + sheet at snack time: three likely rows and "See all", which holds the usual bourekas' },
  { id: 'search-old-portion', route: '/food/search?meal=snack', values: { oldBourekas: 1 }, now: todayAt(16, 30), taps: [{ reload: true }, 'search-tab-usual'], note: 'food search, Usual: the bourekas row at 80 g' },
  { id: 'today-fits-old-portion', route: '/', values: { oldBourekas: 1 }, now: todayAt(16, 30), taps: [{ reload: true }, 'today-ideas'], sheet: true, note: 'What fits: the usual bourekas at 80 g' },
  // Food detail of such an entry, opened from the diary: the row says 268 kcal, the detail 298 kcal at the same 80 g,
  // so one neutral line under the calories says why (lead's decision H2). Not for a new food or an entry that agrees.
  { id: 'detail-old-portion', route: '/diary?date={day}', day: -1, values: { oldBourekas: 1 }, taps: [{ reload: true }, 'entry-00000000-0000-4000-8000-00000000b001'], waitFor: 'detail-values-updated', note: 'an old bourekas entry opened: 298 kcal and the line "This food\'s values were updated since you logged it."' },
  // ---------------------------------------------------------------- copies at today's values (lead's decisions L1, L2)
  // Yesterday's lunch (seed knob oldBourekas: 2): cheese bourekas, halloumi and chicken schnitzel logged before the Israeli
  // foods, in the shape a restart gives them, then an own food and an online product; today's lunch empty; the newest
  // saved meal "Lunch plate" holds the old bourekas and halloumi lines. Every row that offers a copy shows what a tap
  // stores: the bundled foods at today's values for their grams ("Repeat yesterday's lunch, 1,170 kcal", not 1,137),
  // the own food and the online product as logged. The clock is at lunch; each state reloads first.
  { id: 'quick-sheet-repeat-old', route: '/', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }, 'tab-add'], sheet: true, waitFor: 'quick-repeat', note: 'the + sheet: "Repeat yesterday\'s lunch" with 1,170 kcal, and the likely rows' },
  { id: 'quick-sheet-repeat-old-done', route: '/', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }, 'tab-add', 'quick-repeat', { wait: 300 }], sheet: true, note: 'Repeat tapped: its done mark and the toast' },
  { id: 'diary-repeat-old', route: '/diary', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }], waitFor: 'meal-repeat-lunch', note: 'the diary\'s lunch card: "Yesterday, 1,170 kcal: ..." and Repeat' },
  // An empty meal has no menu (its copy of the last same meal is the Repeat under the slot), so the copy is tapped there.
  { id: 'diary-repeat-old-done', route: '/diary', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }, 'meal-repeat-lunch'], waitFor: 'meal-total-lunch', note: 'Repeat tapped on the empty lunch: yesterday\'s five foods at today\'s values, 1,170 kcal' },
  { id: 'diary-copy-to-old', route: '/diary?date={day}', day: -1, values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }, 'meal-menu-lunch'], sheet: true, waitFor: 'meal-menu-copy-to', note: 'yesterday\'s lunch menu: "Copy to another day, 5 items, 1,170 kcal" while the card says 1,137' },
  { id: 'meals-old', route: '/food/meals', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }], waitFor: 'saved-meal-card-0', note: 'Saved meals: "Lunch plate" at today\'s values (744 kcal), its lines "80 g" and "2 x 30 g"' },
  { id: 'meals-log-sheet-old', route: '/food/meals', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }, 'saved-meal-log-0'], sheet: true, note: 'logging "Lunch plate": each line and the button at today\'s values' },
  { id: 'meal-edit-old', route: '/food/meals', values: { oldBourekas: 2 }, now: todayAt(12, 30), taps: [{ reload: true }, 'saved-meal-edit-0'], waitFor: 'meal-edit-screen', note: 'the builder of "Lunch plate": its total at today\'s values' },
  { id: 'detail-entry-agrees', route: '/diary?date={day}', day: -1, values: { oldBourekas: 1 }, taps: ['^entry-'], waitFor: 'food-detail-screen', absent: ['detail-values-updated'], note: 'an entry whose numbers agree: no line' },
  { id: 'detail-new-food-no-line', route: '/food/search?meal=snack', values: { oldBourekas: 1 }, type: { 'food-search-input': 'bourekas cheese' }, taps: [{ wait: 1200 }, 'result-0'], waitFor: 'food-detail-screen', absent: ['detail-values-updated'], note: 'the same food being added new: no line' },
  // Drinks logged in the diary also count in Water (src/features/drinks/diary.ts): the line before Add, the note when
  // editing one (logged with the search row's +, on a profile with no other data), the toasts that say both, and the
  // own food's switch.
  { id: 'detail-drink-adds', route: '/food/search?meal=lunch', type: { 'food-search-input': 'monster' }, taps: [{ wait: 1200 }, 'result-0'], waitFor: 'detail-water-adds', note: 'an energy drink before Add: "Also adds 248 ml to Water." under the amount' },
  { id: 'detail-drink-adds-imperial', route: '/food/search?meal=lunch', imperial: true, type: { 'food-search-input': 'latte' }, taps: [{ wait: 1200 }, 'result-0'], waitFor: 'detail-water-adds', note: 'a latte before Add, in fl oz' },
  { id: 'detail-not-drink', route: '/food/search?meal=lunch', type: { 'food-search-input': 'banana' }, taps: [{ wait: 1200 }, 'result-0'], waitFor: 'food-detail-screen', absent: ['detail-water-adds'], note: 'a banana before Add: no Water line' },
  { id: 'detail-soup-not-drink', route: '/food/search?meal=lunch', type: { 'food-search-input': 'lentil soup' }, taps: [{ wait: 1200 }, 'result-0'], waitFor: 'food-detail-screen', absent: ['detail-water-adds'], note: 'a soup before Add: no Water line' },
  // A drink already in the diary comes from seed.mjs's values.diaryWater (a 500 ml can in today's lunch at 13:10, entry ...d004, and its water), so its ids are the same on every load.
  { id: 'detail-diary-drink', route: '/diary', values: { diaryWater: 1 }, now: todayAt(14, 0), taps: ['entry-00000000-0000-4000-8000-00000000d004'], waitFor: 'detail-drink-note', note: 'editing a drink logged in the diary: "Also counted in Water as 500 ml. It changes with this entry and is removed with it."' },
  { id: 'detail-diary-drink-imperial', route: '/diary', imperial: true, values: { diaryWater: 1 }, now: todayAt(14, 0), taps: ['entry-00000000-0000-4000-8000-00000000d004'], waitFor: 'detail-drink-note', note: 'the same in fl oz' },
  { id: 'detail-diary-drink-amount', route: '/diary', values: { diaryWater: 1 }, now: todayAt(14, 0), taps: ['entry-00000000-0000-4000-8000-00000000d004', 'detail-serving-0'], waitFor: 'detail-drink-note', note: 'editing it with the first serving (the 250 ml can) chosen on screen: the note names that volume, before Save' },
  { id: 'toast-diary-drink-imperial', route: '/food/search?meal=lunch', imperial: true, type: { 'food-search-input': 'monster' }, taps: [{ wait: 1200 }, 'result-0-add'], waitFor: 'toast-action', note: 'an energy drink added with its +: "Energy drink added to lunch, 8.4 fl oz to Water" (320 px is the narrow case)' },
  // Copied from the meal menu so the diary stays on today, whose entries have the seed's fixed ids (a copy's own rows are new on every load).
  { id: 'toast-diary-copy', route: '/diary', values: { diaryWater: 1 }, now: todayAt(14, 0), taps: ['meal-menu-lunch', 'meal-menu-copy-to', 'copy-to-confirm'], waitFor: 'toast-action', note: "today's lunch (with the can of energy drink) copied to tomorrow: the copy's toast names the water" },
  { id: 'custom-drink-on', route: '/food/custom', type: { 'custom-name': 'Cold brew', 'custom-serving-label': '1 bottle (330 ml)', 'custom-serving-grams': '330' }, waitFor: 'custom-drink', note: 'an own food whose serving names ml: "This is a drink" on by itself' },
  { id: 'custom-drink-off', route: '/food/custom', type: { 'custom-name': 'Protein bar', 'custom-serving-label': '1 bar', 'custom-serving-grams': '40' }, waitFor: 'custom-drink', note: 'an own food with a bar serving: the switch off' },

  // ---------------------------------------------------------------- Favourites (src/features/food/favorites.ts)
  // Seed knobs: favoriteMeal 1 stars the saved meal listed last (demo: "Usual breakfast"; stress: the Hebrew-named
  // one), savedEstimate 1 adds "Chicken and rice bowl" saved from an AI estimate (2: starred too, the newest star).
  { id: 'meals-favourite', route: '/food/meals', taps: ['saved-meal-favorite-0'], waitFor: 'toast-action', note: 'Saved meals: the star tapped, filled primaryInk, the card in place, the toast with Undo' },
  { id: 'meals-favourite-first', route: '/food/meals', data: 'stress', values: { favoriteMeal: 1 }, waitFor: 'saved-meal-favorite-0', note: 'stress: the starred meal named in Hebrew leads, the long 12-item meal after it' },
  { id: 'meals-saved-estimate', route: '/food/meals', values: { savedEstimate: 1 }, waitFor: 'saved-meal-card-0', note: 'a meal saved from an AI estimate: "~" before its calories, each line ending "AI estimate"' },
  { id: 'meals-save-current', route: '/food/meals?meal=lunch&date={day}', day: -1, waitFor: 'save-current-meal', note: 'the permanent "Save lunch as a meal" row above the cards, with its count' },
  { id: 'meals-save-current-sheet', route: '/food/meals?meal=lunch&date={day}', day: -1, taps: ['save-current-meal'], sheet: true, waitFor: 'save-meal-name', note: 'the row opens the diary\'s save sheet' },
  { id: 'meals-log-sheet-estimate', route: '/food/meals', values: { savedEstimate: 1 }, taps: ['saved-meal-log-0'], sheet: true, waitFor: 'log-meal-range', note: 'logging the saved estimate: each line with the AI mark and "AI estimate", the range' },
  { id: 'search-favourites-meals', route: '/food/search?meal=lunch', values: { favoriteMeal: 1 }, taps: ['search-tab-favorites'], waitFor: 'favorite-meal-0', note: 'Favourites: Meals (the starred meal with its star and +) above Foods' },
  { id: 'search-favourites-stress', route: '/food/search?meal=lunch', data: 'stress', values: { favoriteMeal: 1, savedEstimate: 2 }, taps: ['search-tab-favorites'], waitFor: 'favorite-meal-1', note: 'Favourites with long names: two meals (one an estimate, "~") and the foods' },
  { id: 'search-favourites-empty', route: '/food/search?meal=lunch', data: 'empty', taps: ['search-tab-favorites'], waitFor: 'search-fav-hint', note: 'no favourites: the one-line tip "Press and hold a food to star it" with Got it, the empty state naming the star' },
  { id: 'search-favourites-empty-hint-done', route: '/food/search?meal=lunch', data: 'empty', taps: ['search-tab-favorites', 'search-fav-hint-close'], absent: ['search-fav-hint'], note: 'the tip dealt with on this device: the empty state names the star and the long press' },
  { id: 'search-meal-plus', route: '/food/search?meal=lunch', values: { favoriteMeal: 1 }, taps: ['search-tab-favorites', 'favorite-meal-0-log'], waitFor: 'toast-action', note: 'the favourite meal\'s "+": logged at once, "Usual breakfast added to lunch" with Undo, the footer count' },
  { id: 'search-meal-review', route: '/food/search?meal=lunch', values: { favoriteMeal: 1 }, taps: ['search-tab-favorites', 'favorite-meal-0'], sheet: true, waitFor: 'log-meal-confirm', note: "the favourite meal's row tapped: the review sheet (servings, items)" },
  { id: 'search-meals-star', route: '/food/search?meal=lunch', taps: ['search-tab-meals', 'saved-meal-0-favorite'], waitFor: 'toast-action', note: 'Saved meals tab: a meal starred from its row; the row keeps its place' },
  { id: 'search-meals-save-row', route: '/food/search?meal=lunch&date={day}', day: -1, values: { savedEstimate: 1 }, taps: ['search-tab-meals'], waitFor: 'save-current-meal', note: 'Saved meals tab: "Save lunch as a meal" and the rows, the estimate with "~"' },
  { id: 'search-meals-save-sheet', route: '/food/search?meal=lunch&date={day}', day: -1, taps: ['search-tab-meals', 'save-current-meal'], sheet: true, waitFor: 'save-meal-name', note: 'the save sheet from search' },
  { id: 'detail-favourite-on', route: '/food/search?meal=lunch', taps: ['search-tab-favorites', 'favorite-0'], waitFor: 'detail-favorite', note: 'a favourite food opened: the star filled primaryInk (never amber)' },
  { id: 'detail-favourite-toast', route: '/food/search?meal=lunch', taps: ['search-tab-recent', 'recent-1', 'detail-favorite'], waitFor: 'toast-action', note: 'the detail star tapped: "Added to favourites: Banana, raw" with Undo' },
  // Search remembers only Favourites (src/features/food/searchTab.ts, openingTab); e2e's favourites block checks the chip's box at 360 and 320.
  { id: 'search-favourites-remembered', route: '/food/search?meal=lunch', values: { favoriteMeal: 1 }, taps: ['search-tab-favorites', { reload: true }, { wait: 800 }], waitFor: 'favorite-meal-0', note: 'Favourites chosen last on this device: search opens on it again after a restart, its chip in view' },
  { id: 'search-meals-not-remembered', route: '/food/search?meal=lunch', taps: ['search-tab-meals', { reload: true }, { wait: 800 }], waitFor: 'search-usual-note', note: 'Saved meals chosen last: search opens on Usual again (only Favourites is remembered)' },
  { id: 'search-favourites-food-unstarred', route: '/food/search?meal=lunch', taps: ['search-tab-favorites', 'favorite-0-favorite'], waitFor: 'toast-action', note: 'Favourites: a food unstarred by its own star stays listed with an outline star until the next visit; "Removed from favourites: …" with Undo' },
  { id: 'quick-sheet-favourite-food', route: '/', taps: ['tab-add'], sheet: true, waitFor: 'quick-fav-food-0', note: 'the + sheet with favourite foods only (the demo): the meal\'s first usual food, then two favourites, as rows in the first view' },
  { id: 'quick-sheet-favourite-meal', route: '/', values: { favoriteMeal: 1, savedEstimate: 2 }, taps: ['tab-add'], sheet: true, waitFor: 'quick-fav-meal-0', note: 'the + sheet: the meal\'s first usual food leads the rows, then the favourite meals (the estimate "~"), "Usual and favourites"' },
  { id: 'quick-sheet-favourite-stress', route: '/', data: 'stress', values: { favoriteMeal: 1 }, taps: ['tab-add'], sheet: true, waitFor: 'quick-fav-meal-0', note: 'the + sheet with a favourite meal named in Hebrew' },
  { id: 'quick-sheet-favourite-logged', route: '/', values: { favoriteMeal: 1 }, taps: ['tab-add', 'quick-fav-meal-0', { wait: 900 }], waitFor: 'toast-action', note: 'a favourite meal logged from its row: the sheet closes after its done mark and the toast with Undo rests over Today' },
  { id: 'fits-saved-estimate', route: '/', values: { savedEstimate: 1, eaten: 0.3 }, now: todayAt(19, 0), taps: ['today-ideas'], sheet: true, waitFor: 'fits-ideas', note: 'What fits: a saved estimate as an idea reads "~"' },

  // ---------------------------------------------------------------- loop 3: the soft checks, the leave guards, a typed minus
  // Edit entry with the amount changed: the line under the meal choice says a pick now only chooses (`mealPickAdvice`).
  { id: 'detail-edit-touched', route: '/diary', taps: ['^entry-', { type: 'detail-grams', text: '40' }], waitFor: 'detail-meal-advice', note: 'Edit entry with the grams changed: "The meal you pick is saved with your other changes."' },
  // The soft check (`@/features/food/softCheck`): the first press stores nothing and asks under the field.
  { id: 'quick-ask', route: '/food/quick', type: { 'quick-kcal': '5000' }, taps: ['quick-save'], waitFor: 'quick-ask', note: 'quick add above 3,000 kcal: asked once under the field, the button names the amount' },
  { id: 'detail-portion-ask', route: '/food/search?meal=snack', type: { 'food-search-input': 'banana' }, taps: [{ wait: 1200 }, 'result-0', { type: 'detail-grams', text: '1500' }, 'detail-save'], waitFor: 'detail-ask', note: 'a portion above five times its largest measure: asked once under the grams' },
  // The leave guards: typed words are not dropped without asking.
  { id: 'describe-discard', route: '/food/photo?mode=text', type: { 'ai-description': 'Lentil soup with bread' }, taps: ['header-close'], sheet: true, waitFor: 'confirm-yes', note: 'words typed to describe, then X: "Discard this description?"' },
  { id: 'custom-discard', route: '/food/custom', type: { 'custom-name': 'Grandma lentil stew' }, taps: ['header-back'], sheet: true, waitFor: 'confirm-yes', note: 'an own food half typed, then back: "Discard this food?"' },
  { id: 'diary-menu-save-typed', route: '/diary', taps: ['meal-menu-breakfast', 'meal-menu-save', { type: 'save-meal-name', text: 'My work lunch' }, { key: 'Escape' }], sheet: true, waitFor: 'sheet-discard-title', note: 'the meal menu\'s save step with a name typed, closed: "Discard this meal name?" in the sheet' },
  // A typed minus kept as typed and named under its field; Add or Save waits (the kit's `numberTextProblem`).
  { id: 'quick-macro-minus', route: '/food/quick', type: { 'quick-kcal': '300', 'quick-protein': '-20' }, note: 'a minus in Protein: named under the field, Add waits' },
  { id: 'custom-minus', route: '/food/custom', type: { 'custom-name': 'Test bar', 'custom-kcal': '-200' }, taps: ['custom-save'], note: 'a minus in Calories: the minus words, Save waits' },
  { id: 'photo-review-grams-minus', route: '/food/photo?mode=text&demoLive=1', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, { type: 'ai-item-0-grams', text: '-100' }], waitFor: 'ai-item-0-grams-error', note: 'the AI review with a minus in a row\'s grams: named under the row, Add waits' },
  // ---------------------------------------------------------------- the diary shows more of the day (visible changes)
  // The diary's slim strip (`DayRingStrip slim`): small cups, the same caption row, "Choose a week" a tap away; each
  // filled meal says its protein, carbs and fat under its name (`meal-macros-<meal>`, `mealMacroLine`).
  { id: 'diary-slim-week-pick', route: '/diary', taps: ['diary-week-pick'], sheet: true, waitFor: 'diary-week-pick-sheet', note: 'the slim strip\'s "Choose a week" sheet' },
  { id: 'diary-slim-macros', route: '/diary', waitFor: 'meal-macros-lunch', note: 'Breakfast and Lunch whole in the first view at 360 x 740, each with "P · C · F" under its name' },
  // ---------------------------------------------------------------- the + sheet in one view (src/components/QuickLogSheet.tsx)
  // "Add to <meal>" with the day and what is left under it, four small ways in, Search food with Scan, Repeat, three
  // likely rows with "See all N" and Water's glasses: nothing scrolls at 360 x 740, 390 x 844 and 320 x 640.
  { id: 'quick-sheet-dinner', route: '/', now: todayAt(19, 0), taps: ['tab-add'], sheet: true, waitFor: 'quick-repeat', note: 'the + sheet at dinner: Repeat with its calories, three likely rows and "See all 7", all in one view' },
  { id: 'quick-sheet-breakfast', route: '/', now: todayAt(8, 0), taps: ['tab-add'], sheet: true, waitFor: 'quick-see-all', note: 'the + sheet at breakfast (already logged): no Repeat' },
  { id: 'quick-sheet-first-day', route: '/', data: 'empty', now: todayAt(19, 0), taps: ['tab-add'], sheet: true, waitFor: 'quick-water-tile', absent: ['quick-usual', 'quick-repeat'], note: 'the + sheet on a first day: the ways in, Search with Scan and Water, nothing likely yet' },
  { id: 'quick-sheet-dinner-imperial', route: '/', imperial: true, now: todayAt(19, 0), taps: ['tab-add'], sheet: true, waitFor: 'quick-repeat', note: 'the + sheet at dinner in fluid ounces: the glasses on Water\'s line' },
  { id: 'quick-sheet-repeat-done', route: '/', now: todayAt(19, 0), taps: ['tab-add', 'quick-repeat', { wait: 300 }], sheet: true, waitFor: 'toast-action', note: 'Repeat tapped: the row stays with its done mark, the sheet open, its toast above it' },
  { id: 'quick-sheet-see-all', route: '/', now: todayAt(19, 0), taps: ['tab-add', 'quick-see-all'], waitFor: 'food-search-input', note: '"See all 7" opens food search for dinner' },
];
