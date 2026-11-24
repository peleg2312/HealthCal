// The plan screen in every state, the Profile row and About's line. A browser build with the test hooks
// reads `?planDemo=<preset>` (DEMO_PRESETS in src/features/plan/demo.ts) and shows the plan as that
// preset with no backend: off, free, plus, canceling, past_due, grace, waiting, late, arriving, long_prices. The dates
// are counted from the moment of loading. Account's Plan group needs a signed-in account, so it is covered
// by e2e-backend against the stand-in backend, not here.
//
//   node scripts/dev/with-build.cjs -- node scripts/dev/evidence.cjs --url={url} --states=plan --out=<dir>
//
// Plus arriving (`plan-arriving`) is a still picture here (screenshots run with reduced motion: the cup
// is simply full). Its motion, the cup pouring from the Free level to the brim and the one flash:
//
//   node scripts/dev/with-build.cjs --reuse -- node scripts/dev/shot.mjs '/settings/plan?planDemo=arriving' <out.png> \
//     --url={url} --motion --frames=10 --every=110 --wait-for=plan-hero-cup
//
// With --backend (a build with the stand-in backend, as scripts/dev/states/limits.cjs describes) the list
// is the one state that needs accounts to exist: the signed-out page with its "Sign in" button.
const list = [

  {
    id: 'plan-free-month',
    route: '/settings/plan?planDemo=free',
    waitFor: 'plan-subscribe',
    note: 'Free as the page opens, the monthly price chosen (the smaller charge): what stays free, the allowance as cups (Free poured to its share of Plus, Plus brim-full), the two price tiles with the saving line, the renewal sentence over the button.',
  },
  {
    id: 'plan-free-year',
    route: '/settings/plan?planDemo=free',
    taps: ['plan-period-year'],
    waitFor: 'plan-subscribe',
    note: 'Free, the yearly tile tapped: the level line moves to Yearly, the button and the renewal sentence name $29.99 a year.',
  },
  {
    id: 'plan-long-prices',
    route: '/settings/plan?planDemo=long_prices',
    waitFor: 'plan-subscribe',
    note: 'Prices shown by a three-letter code (CHF 14.90 a month, CHF 129.90 a year): the amount never parts from its currency, the unit goes under it whole when the two do not fit, and where an amount alone does not fit beside the other tile (320 px) the two tiles stack.',
  },
  {
    id: 'plan-grace',
    route: '/settings/plan?planDemo=grace',
    waitFor: 'plan-grace-line',
    note: 'An earlier account in its grace: "Your earlier allowance stays until …" as a third line of the intro; the table shows what Free and Plus give.',
  },
  {
    id: 'plan-waiting',
    route: '/settings/plan?planDemo=waiting',
    waitFor: 'plan-waiting',
    note: 'Back from the payment page, waiting for the payment to arrive: the waiting cup beside the sentence in the footer.',
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
    note: 'A yearly subscriber three days in: the membership card with its full cup and "Since …", renews on, the allowance, Cancel subscription and Withdraw from the contract as rows, Manage or cancel.',
  },
  {
    id: 'plan-arriving',
    route: '/settings/plan?planDemo=arriving',
    waitFor: 'plan-hero-cup',
    note: 'Plus at the moment the payment arrived. Still: the same page as plan-plus (reduced motion: the cup is full at once). The pour to the brim and the flash are captured with shot.mjs --motion (see the header).',
  },
  {
    id: 'plan-canceling',
    route: '/settings/plan?planDemo=canceling',
    waitFor: 'plan-manage',
    note: 'Cancelled, on until the end of the paid month: the cup stays full, "Each day until …", no rows card (no Cancel, no Withdraw past 14 days) and no gap where it was; the last card is titled "Stays yours when Plus ends".',
  },
  {
    id: 'plan-past-due',
    route: '/settings/plan?planDemo=past_due',
    waitFor: 'plan-payment-line',
    note: 'A renewal payment that did not go through: one short line in warningInk with a card glyph, the grace date and what to do under it in the text colour.',
  },
  {
    id: 'plan-off',
    route: '/settings/plan?planDemo=off',
    waitFor: 'plan-status',
    note: 'Plans off and no plan held: the empty cup, "Nothing to choose" and one neutral line (the page is reachable by address only).',
  },
  {
    id: 'plan-signed-out',
    route: '/settings/plan',
    waitFor: 'plan-status',
    note: 'No account (no backend in this build): the empty cup, "Plans come with an account" and that accounts are not set up; with a backend the page has its "Sign in" button (plan-sign-in, --backend).',
  },
  {
    id: 'profile-plan-plus',
    route: '/profile?planDemo=plus',
    waitFor: 'profile-plan',
    note: 'Profile with the Plan row under the account, with the plan glyph: "Plus until …"; the next group is "Goals and reminders".',
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
    note: 'About: the "Plan" row above the version (at the end of the page: see __full.png).',
  },
];

const backend = [
  {
    id: 'plan-sign-in',
    route: '/settings/plan',
    waitFor: 'plan-sign-in',
    note: 'No account, in a build with a backend: the empty cup, "Plans come with an account", one sentence and the "Sign in" button.',
  },
];

module.exports = process.argv.includes('--backend') ? backend : list;
