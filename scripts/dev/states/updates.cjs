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
    note: 'A phone running an update from Nov 12, after "Check for updates": "Up to date".',
  },
  {
    id: 'about-installed-checked',
    route: '/settings/about?updatesDemo=installed',
    taps: ['about-check-updates', { wait: 900 }],
    waitFor: 'about-update-status',
    note: 'A phone running the code it was installed with (no "Updated" line), after a check: "Up to date".',
  },
  {
    id: 'about-checking',
    route: '/settings/about?updatesDemo=slow',
    taps: ['about-check-updates', { wait: 400 }],
    waitFor: 'about-update-status',
    note: 'While a check runs: the button is disabled and the line under it says "Checking for updates".',
  },
  {
    id: 'about-offline',
    route: '/settings/about?updatesDemo=offline',
    taps: ['about-check-updates', { wait: 900 }],
    waitFor: 'about-update-status',
    note: 'No network: "Could not check right now", and the check can be tried again.',
  },
  {
    id: 'about-update-arrives',
    route: '/settings/about?updatesDemo=arrives',
    taps: ['about-check-updates', { wait: 2600 }],
    waitFor: 'about-restart',
    note: 'A check finds nothing, then the library brings an update by itself: "Up to date" gives way to "An update is ready".',
  },
  {
    id: 'about-update-ready',
    route: '/settings/about?updatesDemo=ready',
    waitFor: 'about-restart',
    note: 'A phone with a newer update downloaded: "An update is ready", what a restart does, then "Restart to update".',
  },
  {
    id: 'about-restart-fails',
    route: '/settings/about?updatesDemo=restart-fails',
    taps: ['about-restart', { wait: 600 }],
    waitFor: 'about-update-status',
    note: 'The restart fails: no restart offered again, "The update starts the next time HealthCal opens".',
  },
  {
    id: 'about-emergency',
    route: '/settings/about?updatesDemo=emergency',
    waitFor: 'about-update-line',
    note: 'The last update did not start, so the installed code runs, and About says so.',
  },
];
