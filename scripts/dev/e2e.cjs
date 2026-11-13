#!/usr/bin/env node
/**
 * End-to-end smoke test of a new user's first day, in a real browser against
 * the running web app (default http://localhost:8081):
 *
 *   welcome -> onboarding -> plan -> Today -> log food -> log a run -> add water -> reload
 *
 * The expected numbers are recomputed here from the published formulas, not
 * read back from the app's own calculation code, so a mistake in the engine
 * or in how a screen wires it up shows as a mismatch.
 *
 *   node scripts/dev/e2e.cjs [--url=http://localhost:8081] [--shots=<dir>]
 */
const { chromium } = require('playwright');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const BASE = flags.url || 'http://localhost:8081';
const SHOTS = flags.shots || null;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const num = (text) => Number(String(text).replace(/[^0-9.\-]/g, ''));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));

  const tap = async (id) => {
    await page.getByTestId(id).first().click({ timeout: 15000 });
    await page.waitForTimeout(350);
  };
  const fill = async (id, value) => {
    await page.getByTestId(id).first().fill(String(value), { timeout: 15000 });
    await page.waitForTimeout(150);
  };
  const text = async (id) => (await page.getByTestId(id).first().innerText({ timeout: 15000 })).trim();
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  // The app exposes its live state for tests; this does not depend on how it is laid out in storage.
  const stored = async () => page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())));
  const live = (map) => Object.values(map).filter((r) => !r.deleted);

  // ------------------------------------------------------------ onboarding
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  check('a new user lands on the welcome screen', page.url().includes('/welcome'), page.url());
  await tap('welcome-get-started');

  await tap('onb-units-metric');
  await fill('onb-name-input', 'Dana');
  await tap('onb-next');
  await tap('onb-goal-lose');
  await tap('onb-next');
  await tap('onb-sex-female');
  await fill('onb-dob-day', '15');
  await fill('onb-dob-month', '6');
  await fill('onb-dob-year', '1990');
  await tap('onb-next');
  await fill('onb-height-cm', '165');
  await fill('onb-weight', '68');
  await tap('onb-next');
  await tap('onb-bf-unknown');
  await tap('onb-next');
  await tap('onb-activity-light');
  await tap('onb-next');
  await fill('onb-target-input', '62');
  await tap('onb-next');
  await page.waitForTimeout(600);
  await shot('e2e-plan');
  const planKcal = num(await text('plan-kcal'));
  await tap('onb-finish');
  await page.waitForTimeout(1200);
  if (await page.getByTestId('onb-account-skip').count()) await tap('onb-account-skip');
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 15000 }).catch(() => {});
  check('finishing onboarding opens Today', new URL(page.url()).pathname === '/', page.url());

  // Independent recomputation of the plan.
  let s = await stored();
  const p = s.profile;
  const now = new Date();
  let age = now.getFullYear() - 1990;
  if (now.getMonth() < 5 || (now.getMonth() === 5 && now.getDate() < 15)) age -= 1;
  const bmr = 10 * 68 + 6.25 * 165 - 5 * age - 161; // Mifflin-St Jeor, female
  const tdee = bmr * 1.375; // lightly active
  const rate = Math.min(p.weeklyRateKg, 68 * 0.01); // never faster than 1% of body weight a week
  const expectedTarget = Math.round(Math.max(tdee - (rate * 7700) / 7, Math.min(1200, tdee)) / 10) * 10;

  check('profile stored in metric with the entered values', p.name === 'Dana' && p.sex === 'female' && p.birthDate === '1990-06-15' && p.heightCm === 165 && p.weightKg === 68 && p.goal === 'lose' && p.targetWeightKg === 62 && p.activityLevel === 'light' && p.units === 'metric' && !!p.onboardedAt, JSON.stringify({ ...p, onboardedAt: !!p.onboardedAt }).slice(0, 200));
  check('a first weigh-in was recorded', live(s.weights).length === 1 && live(s.weights)[0].kg === 68);
  check('plan screen shows the independently computed calorie target', planKcal === expectedTarget, `plan ${planKcal}, expected ${expectedTarget} (BMR ${bmr.toFixed(1)}, TDEE ${tdee.toFixed(1)}, pace ${rate} kg/wk)`);
  check('Today starts with the whole budget left', num(await text('today-remaining')) === expectedTarget, await text('today-remaining'));

  // ------------------------------------------------------------- log food
  await page.goto(`${BASE}/food/search?meal=breakfast`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await fill('food-search-input', 'banana');
  await page.waitForTimeout(700);
  await shot('e2e-search');
  await tap('result-0-add');
  await page.waitForTimeout(500);
  s = await stored();
  const foods = live(s.foodEntries);
  const banana = foods[0];
  check('one-tap add logs one breakfast entry', foods.length === 1 && banana.meal === 'breakfast' && /banana/i.test(banana.name), foods.map((f) => f.name).join(', '));
  // Banana, raw: 89 kcal per 100 g (USDA); the entry must equal grams x per-100 g.
  const expectedBanana = (banana.grams * banana.food.per100g.kcal) / 100;
  check('entry calories equal grams x per-100 g value', near(banana.nutrients.kcal, expectedBanana, 0.01) && banana.food.per100g.kcal === 89 && banana.grams > 0, `${banana.grams} g -> ${banana.nutrients.kcal.toFixed(1)} kcal`);

  // --------------------------------------------------------- log activity
  await page.goto(`${BASE}/activity/log?activityId=running`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await tap('duration-30');
  await tap('intensity-moderate');
  await shot('e2e-activity');
  await tap('log-activity-save');
  await page.waitForTimeout(800);
  s = await stored();
  const acts = live(s.activities);
  const run = acts[0];
  const expectedGross = run ? (run.met * 3.5 * 68 * 30) / 200 : NaN; // Compendium: kcal/min = MET x 3.5 x kg / 200
  const expectedNet = Math.max(0, expectedGross - (tdee / 1440) * 30); // minus what the day already assumes for those 30 minutes
  check('a 30 minute moderate run is stored', acts.length === 1 && run.durationMin === 30 && run.intensity === 'moderate' && run.met > 6, run ? `MET ${run.met}` : 'no entry');
  check('stored gross calories match MET x 3.5 x kg / 200 x minutes', run && near(run.kcalGross, expectedGross, 0.5), run ? `${run.kcalGross.toFixed(1)} vs ${expectedGross.toFixed(1)}` : '');
  check('stored net calories exclude the baseline share (no double counting)', run && near(run.kcalNet, expectedNet, 0.5) && run.kcalNet < run.kcalGross, run ? `${run.kcalNet.toFixed(1)} vs ${expectedNet.toFixed(1)}` : '');

  // ---------------------------------------------------------------- Today
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await tap('today-water-250');
  await page.waitForTimeout(500);
  await shot('e2e-today');
  const expectedBudget = Math.round(expectedTarget + expectedNet);
  const expectedLeft = Math.round(expectedBudget - expectedBanana);
  const left = num(await text('today-remaining'));
  check('Today: calories left = target + net exercise - eaten', near(left, expectedLeft, 1), `shown ${left}, expected ${expectedLeft} (budget ${expectedBudget})`);
  const energy = await text('today-energy');
  check('Today shows the budget breakdown with the exercise share', energy.replace(/,/g, '').includes(`${expectedBudget}`) && energy.replace(/,/g, '').includes(`${Math.round(expectedNet)}`), energy.replace(/\n/g, ' | ').slice(0, 160));
  // Water goal: 33 ml/kg within 1.6-3.0 L for women, plus 550 ml per hour of moderate exercise, both rounded to 50 ml.
  const base = Math.round(Math.min(3000, Math.max(1600, 68 * 33)) / 50) * 50;
  const extra = Math.round(Math.min(0.5 * 550, 2000) / 50) * 50;
  const water = await text('today-water');
  s = await stored();
  check('one tap adds 250 ml of water', live(s.water).length === 1 && live(s.water)[0].ml === 250);
  check('water card shows the goal from body weight plus exercise', water.includes('250 ml') && water.includes(`${(base + extra) / 1000} L`), `${water.replace(/\n/g, ' | ').slice(0, 120)} ; expected goal ${(base + extra) / 1000} L`);

  // --------------------------------------------------------------- diary
  await tap('tab-diary');
  await page.waitForTimeout(800);
  await shot('e2e-diary');
  check('diary shows the same calories left as Today', near(num(await text('diary-remaining')), expectedLeft, 1), await text('diary-remaining'));

  // -------------------------------------------------------- persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('everything survives a reload', near(num(await text('today-remaining')), expectedLeft, 1), await text('today-remaining'));

  // The remaining tabs open without errors for a one-day-old account.
  for (const tab of ['tab-train', 'tab-progress']) {
    await tap(tab);
    await page.waitForTimeout(900);
    await shot(`e2e-${tab}`);
  }
  const real = errors.filter((e) => !/favicon|DevTools|useNativeDriver|pointerEvents is deprecated|shadow\*/i.test(e));
  check('no runtime or console errors during the whole run', real.length === 0, real.slice(0, 3).join(' || '));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('E2E aborted:', e.message.split('\n')[0]);
  process.exit(2);
});
