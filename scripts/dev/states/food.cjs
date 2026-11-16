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
  { id: 'today-fits-sheet', route: '/', taps: ['today-remaining-open'], sheet: true, note: 'the "What fits" sheet from the big number' },
  { id: 'today-fits-stress', route: '/', data: 'stress', taps: ['today-remaining-open'], sheet: true, note: 'What fits with long food names' },
  { id: 'today-fits-empty', route: '/', data: 'empty', taps: ['today-remaining-open'], sheet: true, note: 'What fits with no food history' },
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
  { id: 'quick-sheet-logged', route: '/', taps: ['tab-add', '^quick-usual-', { wait: 300 }], sheet: true, note: 'a usual food added: its tick, and the toast above the sheet' },

  // ---------------------------------------------------------------- Diary
  { id: 'diary-past', route: '/diary?date={day}', day: -1, note: 'yesterday' },
  { id: 'diary-future', route: '/diary?date={day}', day: 1, note: 'tomorrow: nothing planned, copy a day' },
  { id: 'diary-empty', route: '/diary', data: 'empty', note: 'no food logged ever' },
  { id: 'diary-stress', route: '/diary', data: 'stress', note: 'a 12-item lunch with long names' },
  { id: 'diary-feast-day', route: '/diary?date={day}', day: -2, data: 'stress', note: 'the 11,480 kcal day, over budget' },
  { id: 'diary-zero-day', route: '/diary?date={day}', day: -3, data: 'stress', note: 'a logged 0 kcal day' },
  { id: 'diary-imperial', route: '/diary', imperial: true, note: 'the diary in imperial units' },
  { id: 'diary-menu', route: '/diary', taps: ['meal-menu-breakfast'], sheet: true, note: 'a meal menu with items' },
  { id: 'diary-menu-empty-meal', route: '/diary', taps: ['meal-menu-dinner'], sheet: true, note: 'a meal menu for a meal not logged yet' },
  { id: 'diary-copy-to', route: '/diary', taps: ['meal-menu-breakfast', 'meal-menu-copy-to'], sheet: true, note: 'copy a meal to another day' },
  { id: 'diary-save-meal', route: '/diary', data: 'stress', taps: ['meal-menu-lunch', 'meal-menu-save'], sheet: true, note: 'save the 12-item lunch as a meal' },
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
  { id: 'search-no-results', route: '/food/search', type: { 'food-search-input': 'zzqxv' }, taps: [{ wait: 1500 }], waitFor: 'search-no-local', note: 'nothing found' },
  { id: 'search-long-query', route: '/food/search', type: { 'food-search-input': LONG_QUERY }, taps: [{ wait: 1500 }], note: 'a long query' },
  { id: 'search-recent', route: '/food/search', taps: ['search-tab-recent'], note: 'the Recent filter' },
  { id: 'search-favorites', route: '/food/search', data: 'stress', taps: ['search-tab-favorites'], note: 'Favourites with long names' },
  { id: 'search-mine', route: '/food/search', data: 'stress', taps: ['search-tab-mine'], note: 'My foods, long name and brand, with edit buttons' },
  { id: 'search-mine-empty', route: '/food/search', taps: ['search-tab-mine'], note: 'My foods, none yet' },
  { id: 'search-meals', route: '/food/search', data: 'stress', taps: ['search-tab-meals'], note: 'Saved meals with a long name' },
  { id: 'search-empty', route: '/food/search', data: 'empty', note: 'search with no history at all' },
  { id: 'search-past-day', route: '/food/search?meal=snack&date={day}', day: -1, note: 'adding to a past day' },
  { id: 'search-added', route: '/food/search', taps: ['search-tab-recent', 'recent-0-add', { wait: 600 }], waitFor: 'recent-0-stepper', note: 'a food added: the row stepper and the footer count' },
  { id: 'search-added-stress', route: '/food/search?date={day}', day: -1, data: 'stress', taps: ['search-tab-recent', 'recent-0-add', { wait: 600 }], waitFor: 'recent-0-stepper', note: 'a long-named food added on a past day' },
  { id: 'search-amount-sheet', route: '/food/search', data: 'stress', taps: ['search-tab-recent', 'recent-0-add', { wait: 600 }, 'recent-0-amount'], sheet: true, note: 'the amount sheet for an added food, long name as its title' },
  { id: 'search-log-meal-sheet', route: '/food/search', data: 'stress', taps: ['search-tab-meals', 'saved-meal-1-log'], sheet: true, note: 'log the 12-item saved meal from the search tab' },

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
    taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }, 'ai-add-to-diary', { wait: 1200 }, '^entry-'],
    waitFor: 'food-detail-screen',
    note: 'an AI estimate in the diary, opened: its range',
  },

  // ---------------------------------------------------------------- Scan, photo, quick, custom
  { id: 'scan-lookup', route: '/food/scan', taps: [{ type: 'scan-manual-input', text: '5000112637922' }, 'scan-manual-submit', { wait: 4000 }], note: 'a typed barcode looked up (not found, or no network)' },
  { id: 'photo-describe', route: '/food/photo?mode=text', type: { 'ai-description': 'Two scrambled eggs with butter, one slice of sourdough toast and a flat white with oat milk' }, note: 'describe, filled in' },
  { id: 'photo-review', route: '/food/photo?mode=text', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: 'ai-add-to-diary', note: 'the estimate rows with ranges (sample)' },
  { id: 'photo-review-imperial', route: '/food/photo?mode=text', imperial: true, taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: 'ai-add-to-diary', note: 'the estimate in imperial units' },
  { id: 'photo-error-network', route: '/food/photo?mode=text&demoError=network', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: '^ai-error-', note: 'offline' },
  { id: 'photo-error-limit', route: '/food/photo?mode=text&demoError=daily_limit', taps: [{ type: 'ai-description', text: 'Chicken, rice and salad' }, 'ai-analyse', { wait: 2600 }], waitFor: '^ai-error-', note: 'the daily limit' },
  { id: 'photo-error-not-food', route: '/food/photo?mode=text&demoError=not_food', taps: [{ type: 'ai-description', text: 'A photo of my cat' }, 'ai-analyse', { wait: 2600 }], waitFor: '^ai-error-', note: 'not food' },
  { id: 'photo-consent-sheet', route: '/settings/about', taps: ['about-ai-consent'], sheet: true, note: 'the AI consent sheet (review mode; the ask mode needs a backend)' },
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
];
