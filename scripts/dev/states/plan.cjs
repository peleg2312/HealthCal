// The plan screen in every state, the Profile row and About's line. A browser build with the test hooks
// reads `?planDemo=<preset>` (DEMO_PRESETS in src/features/plan/demo.ts) and shows the plan as that
// preset with no backend: off, free, plus, canceling, past_due, grace, waiting, late. The dates are
// counted from the moment of loading. Account's Plan group needs a signed-in account, so it is covered
// by e2e-backend against the stand-in backend, not here.
//
//   node scripts/dev/with-build.cjs -- node scripts/dev/evidence.cjs --url={url} --states=plan --out=<dir>
module.exports = [
  {
    id: 'plan-free-year',
    route: '/settings/plan?planDemo=free',
    waitFor: 'plan-subscribe',
    note: 'Free, the yearly price chosen: the sentence, two cards, Monthly | Yearly, $29.99 a year, the renewal sentence over the button.',
  },
  {
    id: 'plan-free-month',
    route: '/settings/plan?planDemo=free',
    taps: ['plan-period-month'],
    waitFor: 'plan-subscribe',
    note: 'Free, the monthly price chosen: no monthly equivalent line.',
  },
  {
    id: 'plan-grace',
    route: '/settings/plan?planDemo=grace',
    waitFor: 'plan-grace-line',
    note: 'An earlier account in its grace: "Your earlier allowance stays until …".',
  },
  {
    id: 'plan-waiting',
    route: '/settings/plan?planDemo=waiting',
    waitFor: 'plan-waiting',
    note: 'Back from the payment page, waiting for the payment to arrive.',
  },
  {
    id: 'plan-late',
    route: '/settings/plan?planDemo=late',
    waitFor: 'plan-late',
    note: 'The payment has not arrived after 30 s: the page says so and looks again by itself.',
  },
  {
    id: 'plan-plus',
    route: '/settings/plan?planDemo=plus',
    waitFor: 'plan-manage',
    note: 'A yearly subscriber three days in: renews on, Cancel subscription, Withdraw from the contract, Manage or cancel.',
  },
  {
    id: 'plan-canceling',
    route: '/settings/plan?planDemo=canceling',
    waitFor: 'plan-manage',
    note: 'Cancelled, on until the end of the paid month: no Cancel control, no Withdraw (past 14 days).',
  },
  {
    id: 'plan-past-due',
    route: '/settings/plan?planDemo=past_due',
    waitFor: 'plan-payment-line',
    note: 'A renewal payment that did not go through: neutral words in warningInk with the grace date.',
  },
  {
    id: 'plan-off',
    route: '/settings/plan?planDemo=off',
    waitFor: 'plan-status',
    note: 'Plans off and no plan held: one neutral line (the page is reachable by address only).',
  },
  {
    id: 'plan-signed-out',
    route: '/settings/plan',
    waitFor: 'plan-status',
    note: 'No account (no backend in this build): one line that plans come with an account.',
  },
  {
    id: 'profile-plan-plus',
    route: '/profile?planDemo=plus',
    waitFor: 'profile-plan',
    note: 'Profile with the Plan row under the account: "Plus until …".',
  },
  {
    id: 'profile-plan-canceling',
    route: '/profile?planDemo=canceling',
    waitFor: 'profile-plan',
    note: 'Profile while cancelling: "Plus, ends …".',
  },
  {
    id: 'profile-plan-off',
    route: '/profile?planDemo=off',
    waitFor: 'profile-account',
    absent: ['profile-plan'],
    note: 'Plans off: no Plan row.',
  },
  {
    id: 'about-plan-free',
    route: '/settings/about?planDemo=free',
    waitFor: 'about-plan',
    note: 'About: the plan line above the version (at the end of the page: see __full.png).',
  },
];
