#!/usr/bin/env node
/**
 * Opens every route four ways and fails if any of them lands on the error screen
 * or throws: with nothing stored (a link opened before setup must go to the welcome
 * screen, not crash), with a profile and no data (empty states), with demo data, and
 * with the long-content demo data (buildSeed({ stress: true }): long names, big numbers).
 *
 *   node scripts/dev/check-routes.cjs [--url=http://localhost:8081] [--only=none|empty|demo|stress]
 *
 * Add a route here when you add one to src/app.
 *
 * It also reads each page's document title once the route has settled: every page must be named
 * "<page> · HealthCal" (WCAG 2.4.2; src/features/layout/routeTitle.ts), and two different addresses where the
 * routes ended never share one within a mode. `--titles` prints the title of every route it opened.
 */
const { chromium } = require('playwright');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const base = flags.url || 'http://localhost:8081';

const ROUTES = [
  '/', '/diary', '/train', '/progress', '/welcome', '/auth?mode=signin', '/auth?mode=signup', '/onboarding',
  '/food/search?meal=lunch', '/food/detail?meal=lunch', '/food/scan?meal=lunch', '/food/photo?meal=lunch&mode=text', '/food/quick?meal=lunch',
  '/food/custom', '/food/meals?meal=lunch', '/food/meal-edit', '/food/meal-pick',
  '/activity/pick', '/activity/log?activityId=running', '/activity/strength', '/activity/import',
  '/water', '/weight', '/body', '/sleep', '/fasting',
  '/profile', '/settings/goals', '/settings/reminders', '/settings/account', '/settings/data', '/settings/about', '/settings/health-sync', '/settings/plan', '/legal/terms', '/legal/privacy',
  '/morning', '/morning?first=1', '/coach', '/coach?ask=training', '/coach?ask=ideas',
  '/recap', '/consistency', '/friends', '/friends/add?invite=ABCD2345', '/friends/add?code=ABCD2345', '/no-such-page',
];

/** Without a profile only these may stay where they are; everything else must end on /welcome. */
const OPEN_WITHOUT_PROFILE = ['/welcome', '/auth', '/onboarding', '/friends/add', '/settings/data', '/settings/about', '/legal/terms', '/legal/privacy', '/no-such-page'];

(async () => {
  const { buildSeed } = await import('./seed.mjs');
  const modes = [
    { key: 'none', seed: null },
    { key: 'empty', seed: buildSeed({ empty: true, theme: 'light' }) },
    { key: 'demo', seed: buildSeed({ theme: 'light' }) },
    { key: 'stress', seed: buildSeed({ theme: 'light', stress: true }) },
  ].filter((m) => !flags.only || flags.only === m.key);

  const browser = await chromium.launch();
  const problems = [];
  let opened = 0;
  for (const mode of modes) {
    // Title -> the address where a route ended with it, per mode: two addresses never share a title.
    const titled = new Map();
    for (const route of ROUTES) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      if (mode.seed) {
        await context.addInitScript((value) => {
          if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('healthcal-v1', value);
            sessionStorage.setItem('seeded', '1');
          }
        }, JSON.stringify(mode.seed));
      }
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message.split('\n')[0].slice(0, 120)));
      try {
        await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
        await page.waitForTimeout(700);
        // A busy machine can take a moment to redirect: give a link opened before setup up to 8 s to reach /welcome.
        if (mode.key === 'none' && !OPEN_WITHOUT_PROFILE.includes(route.split('?')[0])) {
          await page.waitForFunction(() => location.pathname === '/welcome', null, { timeout: 8000 }).catch(() => {});
        }
      } catch (e) {
        errors.push(`did not load: ${String(e.message).split('\n')[0].slice(0, 80)}`);
      }
      opened += 1;
      const crashed = (await page.getByTestId('error-retry').count()) > 0;
      const end = new URL(page.url()).pathname;
      const start = route.split('?')[0];
      const reasons = [];
      // The title is set a frame after the screen draws: give it up to 3 s to name the page.
      await page.waitForFunction(() => / · HealthCal$/.test(document.title), null, { timeout: 3000 }).catch(() => {});
      const title = await page.title().catch(() => '');
      if (flags.titles) console.log(`title [${mode.key}] ${route} -> ${end}: ${title}`);
      if (!/^\S.* · HealthCal$/.test(title)) reasons.push(`page title "${title}" does not name the page`);
      else if (titled.has(title) && titled.get(title) !== end) reasons.push(`page title "${title}" is also ${titled.get(title)}'s`);
      else titled.set(title, end);
      if (crashed) reasons.push('error screen');
      if (errors.length) reasons.push(`page error: ${errors[0]}`);
      if (mode.key === 'none' && !OPEN_WITHOUT_PROFILE.includes(start) && end !== '/welcome') reasons.push(`stayed on ${end} without a profile`);
      if (mode.key === 'none' && OPEN_WITHOUT_PROFILE.includes(start) && end !== start) reasons.push(`should stay open but went to ${end}`);
      if (reasons.length) {
        problems.push({ mode: mode.key, route, reasons });
        console.log(`FAIL  [${mode.key}] ${route}  (${reasons.join('; ')})`);
      }
      await context.close();
    }
    console.log(`${mode.key}: ${ROUTES.length} routes opened`);
  }
  await browser.close();
  console.log(`\n${opened - problems.length} of ${opened} passed`);
  process.exit(problems.length ? 1 : 0);
})();
