// States that prove each part of the state runner in scripts/dev/evidence.cjs
// (the format is described in that file's header comment).
//
//   node scripts/dev/evidence.cjs --states=sample --out=<dir> [--only=today-add-sheet]
module.exports = [
  // A sheet: the + sheet from the tab bar. Only the sheet is scanned.
  { id: 'today-add-sheet', route: '/', taps: ['tab-add'], sheet: true, note: 'the + sheet over Today' },
  // A sheet opened from a chip inside a screen.
  { id: 'progress-range-sheet', route: '/progress', taps: ['progress-range'], sheet: true, note: 'the "Show the last" range sheet' },
  // Another section of a screen.
  { id: 'progress-body', route: '/progress', taps: ['progress-segment-body'], waitFor: 'progress-segment-body', note: 'Progress, Body section' },
  // First run, one step in: no stored data, typing between taps.
  { id: 'onboarding-goal', route: '/onboarding', data: 'fresh', taps: [{ type: 'onb-name-input', text: 'Dana' }, 'onb-next'], waitFor: 'onb-goal-lose', note: 'onboarding, the goal question' },
  // Long content.
  { id: 'today-stress', route: '/', data: 'stress', note: 'Today with long names and big numbers' },
  // Imperial units.
  { id: 'diary-imperial', route: '/diary', imperial: true, note: 'the diary in lb, fl oz and mi' },
  // A day in the URL: two days ago, the 11,480 kcal day of the stress data.
  { id: 'diary-feast-day', route: '/diary?date={day}', day: -2, data: 'stress', note: 'the diary on a past day at 11,480 kcal' },
  // A confirm sheet.
  { id: 'data-erase-confirm', route: '/settings/data', taps: ['data-erase'], sheet: true, note: 'the confirm sheet before erasing everything' },
  // A file chosen in the browser's file picker: the Garmin import's review list.
  { id: 'import-review', route: '/activity/import', taps: [{ choose: 'import-choose-files', files: ['scripts/dev/states/files/morning-run.gpx'] }], waitFor: 'import-list', note: 'Garmin import, one GPX run to review' },
];
