// The foot of About, as a phone with over-the-air updates shows it. A browser has no updates, so a
// build with the test hooks reads `?updatesDemo=<preset>` from the address and stands an update
// server in memory in for expo-updates (DEMO_PRESETS in src/features/updates/fake.ts). The block is
// at the end of the page: look at the __full.png captures.
//
//   node scripts/dev/with-build.cjs -- node scripts/dev/evidence.cjs --url={url} --states=updates --out=<dir>
module.exports = [
  {
    id: 'about-version-web',
    route: '/settings/about',
    waitFor: 'about-version',
    note: 'The browser: the version line only, as before.',
  },
  {
    id: 'about-updated-checked',
    route: '/settings/about?updatesDemo=updated',
    taps: ['about-check-updates', { wait: 900 }],
    waitFor: 'about-update-status',
    note: 'A phone running an update from Nov 17, after "Check for updates": "Up to date".',
  },
  {
    id: 'about-update-ready',
    route: '/settings/about?updatesDemo=ready',
    waitFor: 'about-restart',
    note: 'A phone with a newer update downloaded: "Restart to update".',
  },
  {
    id: 'about-emergency',
    route: '/settings/about?updatesDemo=emergency',
    waitFor: 'about-update-line',
    note: 'The last update did not start, so the installed code runs, and About says so.',
  },
];
