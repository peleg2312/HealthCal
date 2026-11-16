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
 * The fields of onboarding (and one kit field, food search) are first tapped with a finger at
 * the left, the middle and the right of their cup, as a person does, and must take the focus
 * each time; only then is the value typed. With the on-screen keyboard faked (a visualViewport
 * that shrinks, as in a phone browser, where the layout does not), the pinned footer must rise
 * above it and the focused field must be in view above the footer, and all of it must go back
 * when the keyboard closes. No real keyboard is raised: a phone still has to confirm that part.
 *
 * The run uses reduced motion, so every animation is instant (the app also treats an
 * automated browser as reduced motion). The last section turns motion on and acts while
 * things are still pouring, to prove nothing waits on an animation finishing.
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
  // A visualViewport the test controls: the same as the real one until __keyboard(px) "opens" a
  // keyboard of that height. Like a phone browser, the layout viewport does not shrink.
  await context.addInitScript(() => {
    const fake = new EventTarget();
    let kb = 0;
    const num = (get) => ({ configurable: true, get });
    Object.defineProperties(fake, {
      height: num(() => window.innerHeight - kb),
      width: num(() => window.innerWidth),
      offsetTop: num(() => 0),
      offsetLeft: num(() => 0),
      pageTop: num(() => window.scrollY),
      pageLeft: num(() => window.scrollX),
      scale: num(() => 1),
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    window.__keyboard = (h) => {
      kb = h;
      fake.dispatchEvent(new Event('resize'));
    };
  });
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
  const text = async (id) => (await page.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/\u00A0/g, ' ').replace(/\u2060/g, '').trim();
  const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
  const focusedId = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName || 'nothing');
  const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  // The cup a field sits in: the nearest box around the input that draws an edge.
  const cupOf = (id) => page.evaluate((id) => {
    const input = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().width > 0);
    let e = input?.parentElement;
    while (e && parseFloat(getComputedStyle(e).borderTopWidth) < 1) e = e.parentElement;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
  // A finger, not typing: a tap at the cup's left, middle and right must each put the focus in the field.
  const tapsFocus = async (id, extra = []) => {
    await page.getByTestId(id).first().scrollIntoViewIfNeeded();
    const c = await cupOf(id);
    if (!c) return check(`a tap anywhere in ${id} focuses it`, false, 'no cup found');
    const misses = [];
    for (const [where, x] of [['left', c.x + 6], ['middle', c.x + c.w / 2], ['right', c.x + c.w - 6], ...extra.map(([w, dx]) => [w, c.x + dx])]) {
      await blur();
      // The finger must land on the field itself (or its <label> on web): a wrapper that catches the
      // touch and focuses the field from code works in this browser but may not raise an iPhone's keyboard.
      const hit = await page.evaluate(([id, x, y]) => {
        const input = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().width > 0);
        const el = document.elementFromPoint(x, y);
        const label = el && el.closest('label');
        return el === input || (label && label.contains(input)) ? 'field' : (el?.getAttribute('data-testid') || el?.tagName || 'nothing');
      }, [id, x, c.y + c.h / 2]);
      if (hit !== 'field') misses.push(`${where} lands on ${hit}, not the field`);
      await page.touchscreen.tap(x, c.y + c.h / 2);
      await page.waitForTimeout(120);
      const got = await focusedId();
      if (got !== id) misses.push(`${where} -> ${got}`);
    }
    check(`a tap at the left, middle and right of ${id} focuses it`, misses.length === 0, misses.join('; ') || `${Math.round(c.w)} x ${Math.round(c.h)} cup`);
  };
  // With the faked keyboard open over the focused field: the footer above it, the field above the footer.
  const keyboardRoom = async (id, kb) => {
    await blur();
    const c = await cupOf(id);
    await page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
    await page.evaluate((h) => window.__keyboard(h), kb);
    await page.waitForTimeout(400);
    const m = await page.evaluate((id) => {
      const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0);
      const f = vis('[data-testid="screen-footer"]').getBoundingClientRect();
      const i = vis(`[data-testid="${id}"]`).getBoundingClientRect();
      return { visible: window.visualViewport.height, footerTop: f.top, footerBottom: f.bottom, fieldTop: i.top, fieldBottom: i.bottom, focused: document.activeElement?.getAttribute('data-testid'), scrollY: window.scrollY };
    }, id);
    const ok = Math.abs(m.footerBottom - m.visible) <= 1 && m.fieldBottom <= m.footerTop && m.fieldTop >= 0 && m.focused === id && m.scrollY === 0;
    check(`keyboard (faked, ${kb} px): the footer sits on it and ${id} is in view above the footer`, ok, `visible ${Math.round(m.visible)}, footer ${Math.round(m.footerTop)}-${Math.round(m.footerBottom)}, field ${Math.round(m.fieldTop)}-${Math.round(m.fieldBottom)}, focus ${m.focused}`);
    await page.evaluate(() => window.__keyboard(0));
    await page.waitForTimeout(400);
    const back = await page.evaluate(() => [...document.querySelectorAll('[data-testid="screen-footer"]')].find((e) => e.getBoundingClientRect().height > 0).getBoundingClientRect().bottom);
    check(`keyboard closed: the footer is back at the bottom (${id})`, Math.abs(back - (await page.evaluate(() => window.innerHeight))) <= 1, `footer bottom ${Math.round(back)}`);
    await blur();
  };
  // The app exposes its live state for tests; this does not depend on how it is laid out in storage.
  const stored = async () => page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())));
  const live = (map) => Object.values(map).filter((r) => !r.deleted);

  // ------------------------------------------------------------ onboarding
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  check('a new user lands on the welcome screen', page.url().includes('/welcome'), page.url());
  check('an automated browser runs with motion off by default', (await page.evaluate(() => window.__healthcalMotionOn?.())) === false);
  await tap('welcome-get-started');

  await tap('onb-units-metric');
  await tapsFocus('onb-name-input');
  await fill('onb-name-input', 'Dana');
  await tap('onb-next');
  await tap('onb-goal-lose');
  await tap('onb-next');
  await tap('onb-sex-female');
  for (const id of ['onb-dob-day', 'onb-dob-month', 'onb-dob-year']) await tapsFocus(id);
  await fill('onb-dob-day', '15');
  await fill('onb-dob-month', '6');
  await fill('onb-dob-year', '1990');
  await tap('onb-next');
  // Every number field of the body step, in both unit systems, then back to metric to answer.
  await tap('onb-body-units-imperial');
  for (const id of ['onb-height-ft', 'onb-height-in', 'onb-weight']) await tapsFocus(id);
  await tap('onb-body-units-metric');
  await tapsFocus('onb-height-cm');
  // On the unit itself ("kg"), not only the cup's sides.
  const unitX = await page.evaluate(() => {
    const i = [...document.querySelectorAll('[data-testid="onb-weight"]')].find((e) => e.getBoundingClientRect().width > 0);
    const unit = [...i.parentElement.querySelectorAll('div[dir], div')].find((e) => e !== i && e.textContent === 'kg');
    return unit ? unit.getBoundingClientRect().x + unit.getBoundingClientRect().width / 2 - i.parentElement.getBoundingClientRect().x : null;
  });
  await tapsFocus('onb-weight', unitX === null ? [] : [['on the unit', unitX]]);
  await fill('onb-height-cm', '165');
  await fill('onb-weight', '68');
  await keyboardRoom('onb-weight', 320);
  await tap('onb-next');
  // The body fat fields: typed directly, and the three tape measures (the last one low on the page).
  await tap('onb-bf-direct');
  await tapsFocus('onb-bf-input');
  await tap('onb-bf-tape');
  for (const id of ['onb-neck-input', 'onb-waist-input', 'onb-hip-input']) await tapsFocus(id);
  await keyboardRoom('onb-hip-input', 340);
  await tap('onb-bf-unknown');
  await tap('onb-next');
  await tap('onb-activity-light');
  await tap('onb-next');
  await tapsFocus('onb-target-input');
  await fill('onb-target-input', '62');
  await tap('onb-next');
  // "Your day": reminders are offered once; the first-day flow declines them.
  await tap('onb-reminders-skip');
  // The look is the last question; the first-day flow keeps the one shown and goes on to the plan.
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
  // A kit field: on the search icon and in the side room as well as the middle.
  await tapsFocus('food-search-input', [['on the search icon', 23]]);
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
  // ------------------------------------------------- with motion turned on
  // A second page in the same browser (same saved data) that opts in to animation. Every
  // action below happens while pours, fades and the sheet are still moving.
  const mpage = await context.newPage();
  await mpage.emulateMedia({ reducedMotion: 'no-preference' });
  await mpage.addInitScript(() => {
    window.__healthcalMotion = true;
  });
  mpage.on('pageerror', (e) => errors.push(e.message));
  mpage.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  await mpage.goto(BASE + '/', { waitUntil: 'networkidle' });
  await mpage.getByTestId('today-screen').first().waitFor({ timeout: 15000 });
  const motionOn = await mpage.evaluate(() => typeof window.__healthcalMotionOn === 'function' && window.__healthcalMotionOn());
  check('motion: the opted-in page runs with animation on', motionOn === true);
  const waterBefore = live((await mpage.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())))).water).length;
  await mpage.getByTestId('today-water-250').first().click({ timeout: 15000 });
  // No waiting: the stored value changes at once, the drawing catches up.
  const waterAfter = live((await mpage.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())))).water).length;
  check('motion: a tap is stored at once, mid-animation', waterAfter === waterBefore + 1, `${waterBefore} -> ${waterAfter}`);
  // Open the + sheet, close it and switch tab straight away, while the sheet is still sliding.
  await mpage.getByTestId('tab-add').first().click({ timeout: 15000 });
  await mpage.getByTestId('sheet-backdrop').first().click({ timeout: 15000, position: { x: 20, y: 20 } });
  await mpage.getByTestId('tab-diary').first().click({ timeout: 15000 });
  await mpage.waitForURL((u) => new URL(u).pathname === '/diary', { timeout: 5000 }).catch(() => {});
  check('motion: the tab bar answers while a sheet is closing', new URL(mpage.url()).pathname === '/diary', mpage.url());
  // Banana minus one more glass of water does not change calories, so the diary still agrees.
  await mpage.waitForTimeout(900);
  const mLeft = num((await mpage.getByTestId('diary-remaining').first().innerText({ timeout: 15000 })).trim());
  check('motion: numbers settle on the right value', near(mLeft, expectedLeft, 1), `${mLeft} vs ${expectedLeft}`);
  await mpage.close();

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
