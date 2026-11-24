// The app's own text size at 200% (Profile > App, "Text size"; @/theme textSize), screen by screen, so a
// layout that breaks when text doubles is found in a browser (WCAG 1.4.4 as WCAG2Mobile reads it: the
// app's size reaches 200%, and the phone's setting adds up to 2x in all). The flag sets the size before load.
//
//   node scripts/dev/evidence.cjs --states=textsize --themes=blossom --widths=360 --out=<dir>
const big = { __healthcalTextSize: true };
module.exports = [
  { id: 'text200-today', route: '/', flags: big, note: 'Today at 200% text' },
  { id: 'text200-diary', route: '/diary', flags: big, note: 'the diary at 200% text' },
  { id: 'text200-train', route: '/train', flags: big, note: 'Train at 200% text' },
  { id: 'text200-progress', route: '/progress', flags: big, note: 'Progress at 200% text' },
  { id: 'text200-water', route: '/water', flags: big, note: 'Water at 200% text' },
  { id: 'text200-weight', route: '/weight', flags: big, note: 'Weight at 200% text' },
  { id: 'text200-search', route: '/food/search?meal=lunch', flags: big, note: 'food search at 200% text' },
  { id: 'text200-quick', route: '/food/quick?meal=lunch', flags: big, note: 'quick add at 200% text' },
  { id: 'text200-profile', route: '/profile', flags: big, note: 'Profile at 200% text' },
  { id: 'text200-goals', route: '/settings/goals', flags: big, note: 'Goals at 200% text' },
  { id: 'text200-add-sheet', route: '/', taps: ['tab-add'], sheet: true, flags: big, note: 'the + sheet at 200% text' },
];
