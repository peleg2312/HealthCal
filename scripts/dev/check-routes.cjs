#!/usr/bin/env node
/**
 * Opens every route three ways and fails if any of them lands on the error screen
 * or throws: with nothing stored (a link opened before setup must go to the welcome
 * screen, not crash), with a profile and no data (empty states), and with demo data.
 *
 *   node scripts/dev/check-routes.cjs [--url=http://localhost:8081] [--only=none|empty|demo]
 *
 * Add a route here when you add one to src/app.
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
  '/profile', '/settings/goals', '/settings/reminders', '/settings/account', '/settings/data', '/settings/about', '/settings/health-sync',
  '/recap', '/consistency', '/friends', '/friends/add?code=ABCD2345', '/no-such-page',
];

/** Without a profile only these may stay where they are; everything else must end on /welcome. */
const OPEN_WITHOUT_PROFILE = ['/welcome', '/auth', '/onboarding', '/friends/add', '/settings/data', '/settings/about', '/no-such-page'];

(async () => {
  const { buildSeed } = await import('./seed.mjs');
  const modes = [
    { key: 'none', seed: null },
    { key: 'empty', seed: buildSeed({ empty: true, theme: 'light' }) },
    { key: 'demo', seed: buildSeed({ theme: 'light' }) },
  ].filter((m) => !flags.only || flags.only === m.key);

  const browser = await chromium.launch();
  const problems = [];
  let opened = 0;
  for (const mode of modes) {
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
      } catch (e) {
        errors.push(`did not load: ${String(e.message).split('\n')[0].slice(0, 80)}`);
      }
      opened += 1;
      const crashed = (await page.getByTestId('error-retry').count()) > 0;
      const end = new URL(page.url()).pathname;
      const start = route.split('?')[0];
      const reasons = [];
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
