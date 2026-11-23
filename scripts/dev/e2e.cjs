#!/usr/bin/env node
/**
 * End-to-end smoke test of a new user's first day, in a real browser against
 * the running web app (default http://localhost:8081):
 *
 *   welcome -> onboarding -> plan -> Today -> log food -> log a run -> add water -> reload
 *   -> the next morning: the morning page opens by itself once (greeting, quote, plan), closes onto Today, not again
 *   -> ... -> drinks -> a search for any drink on Water -> drinks logged in the diary count in Water -> an old portion after a reload: the + sheet's tile shows what its tap stores, and so does
 *      "Repeat yesterday's <meal>" (bundled foods at today's values, an own food and an online product as stored)
 *   -> Appearance in Profile: Java (kept through a reload), Honey, Butter, Blossom, then back to System
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
 * With the keyboard faked open, a toast must rest 12 px above the footer riding on it (food search) or above
 * the keyboard itself (Water's "Other amount"), its Undo must work, and with the keyboard down it stays where it was.
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
  const text = async (id) => (await page.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim();
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

  // ------------------------------------------- a food searched by its Hebrew name
  // A person types the Hebrew word: the row shows the stored English name with the Hebrew name it
  // matched under it (the name that matched best: "קוטג'" for this query, "קוטג' 5%" for "קוטג 5"),
  // and what is stored is the English food (search names are never stored).
  const HEBREW_LETTER = /[\u0590-\u05FF]/;
  await fill('food-search-input', '');
  await fill('food-search-input', 'קוטג');
  await page.waitForTimeout(700);
  await shot('e2e-search-hebrew');
  const heName = await text('result-0').catch(() => '');
  const heMatched = await text('result-0-matched').catch(() => '');
  check('a Hebrew word finds the food: its English name, the Hebrew name under it', heName.includes('Cottage cheese, 5% fat') && heMatched.startsWith("קוטג'"), `row "${heName.replace(/\n/g, ' | ').slice(0, 120)}", matched "${heMatched}"`);
  await tap('result-0-add');
  await page.waitForTimeout(500);
  s = await stored();
  const newest = live(s.foodEntries).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))[0];
  check('the entry is stored under the English name', !!newest && newest.name === 'Cottage cheese, 5% fat' && newest.foodId === 'b_cottage_cheese_5pct', newest ? `${newest.name} (${newest.foodId})` : 'no entry');
  check('no Hebrew letter is stored anywhere', !HEBREW_LETTER.test(JSON.stringify(s)), (JSON.stringify(s).match(/.{0,40}[\u0590-\u05FF].{0,40}/) || [''])[0]);
  // Take it out again (soft delete, as Undo does), so the day's numbers below stay the banana's.
  if (newest && newest.foodId === 'b_cottage_cheese_5pct') await page.evaluate((id) => window.__healthcal.getState().remove('foodEntries', id), newest.id);
  await fill('food-search-input', '');
  await fill('food-search-input', 'tehina');
  await page.waitForTimeout(700);
  const latin = await text('result-0').catch(() => '');
  check('a Latin spelling Israelis type finds the food', latin.includes('Tahini sauce (prepared, diluted)'), latin.replace(/\n/g, ' | ').slice(0, 120));

  // ------------------------------- no false "No matches" while the list catches up with the typing
  // The local list follows the typing a beat behind on a slow phone (useDeferredValue). With the CPU
  // slowed four times and one key every 60 ms, the no-match text must never be drawn for a query that
  // has matches, and must still be drawn for one that has none (sampled every 16 ms).
  const typeAndWatch = async (word) => {
    await fill('food-search-input', '');
    await page.getByTestId('food-search-input').first().focus();
    await page.evaluate(() => {
      window.__noMatch = [];
      window.__noMatchTimer = setInterval(() => {
        const shown = [...document.querySelectorAll('[data-testid="search-no-local"]')].some((e) => e.getBoundingClientRect().height > 0);
        const field = [...document.querySelectorAll('[data-testid="food-search-input"]')].find((e) => e.getBoundingClientRect().height > 0);
        if (shown) window.__noMatch.push(field ? field.value : '?');
      }, 16);
    });
    await page.keyboard.type(word, { delay: 60 });
    await page.waitForTimeout(1500);
    return page.evaluate(() => {
      clearInterval(window.__noMatchTimer);
      return [...new Set(window.__noMatch)];
    });
  };
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const word of ['chicken', 'חומוס']) {
    const seen = await typeAndWatch(word);
    check(`typing "${word}" on a slow phone never shows "No matches"`, seen.length === 0, seen.length ? `shown for ${JSON.stringify(seen)}` : 'never shown');
  }
  const none = await typeAndWatch('zzzzqq');
  check('a query with no match still says so', none.includes('zzzzqq') && (await page.getByTestId('search-no-local').first().isVisible()), `shown for ${JSON.stringify(none)}`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();

  // ------------------------------------- the photo screen's weighed total (optional field)
  // A photo chosen, then the weight field: a tap anywhere in it focuses it, the faked keyboard keeps
  // it above the pinned "Estimate nutrition", and a problem shows only once the field is left.
  await page.goto(`${BASE}/food/photo?meal=lunch`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const photoChooser = page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
  await tap('ai-choose-photo');
  const photoFc = await photoChooser;
  if (photoFc) await photoFc.setFiles(require('path').join(__dirname, '..', '..', 'assets', 'images', 'icon.png'));
  await page.waitForSelector('[data-testid="ai-photo-preview"]', { timeout: 10000 }).catch(() => {});
  check('a photo can be chosen on the photo screen', !!photoFc && (await page.getByTestId('ai-photo-preview').count()) > 0);
  await tapsFocus('ai-photo-weight');
  await keyboardRoom('ai-photo-weight', 320);
  await fill('ai-photo-weight', '4');
  const earlyError = await page.getByText('Enter 10 to 5,000 g, or leave it empty').count();
  await blur();
  await page.waitForTimeout(150);
  const lateError = await page.getByText('Enter 10 to 5,000 g, or leave it empty').count();
  check('the weight field does not turn red while typing, and says so once it is left', earlyError === 0 && lateError > 0, `while typing ${earlyError}, after leaving ${lateError}`);
  await fill('ai-photo-weight', '1,500');
  await blur();
  await page.waitForTimeout(150);
  check('a thousands separator in the weight is read as one', (await page.getByText('Enter 10 to 5,000 g, or leave it empty').count()) === 0 && (await page.getByText('Enter whole grams, e.g. 450').count()) === 0);
  await shot('e2e-photo-weight');

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
  // A new person gets 'Over 7 days': today's budget holds the first of seven whole shares of the run's net calories.
  const expectedAdded = Math.floor(Math.round(run ? run.kcalNet : expectedNet) / 7);
  const expectedBudget = Math.round(expectedTarget + expectedAdded);
  const expectedLeft = Math.round(expectedBudget - expectedBanana);
  const left = num(await text('today-remaining'));
  check('Today: calories left = target + first share of net exercise - eaten', near(left, expectedLeft, 1), `shown ${left}, expected ${expectedLeft} (budget ${expectedBudget})`);
  const energy = await text('today-energy');
  check('Today shows the budget breakdown with the exercise share', energy.replace(/,/g, '').includes(`${expectedBudget}`) && energy.replace(/,/g, '').includes(`${expectedAdded}`), energy.replace(/\n/g, ' | ').slice(0, 160));
  check('Today: the shared workout calories read "from workouts"', energy.includes('from workouts'), energy.replace(/\n/g, ' | ').slice(0, 160));
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

  // ------------------------------------------- workout calories: Over 7 days -> Same day
  const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // A new person starts on "Over 7 days". Choosing "Same day" with a workout dated today starts tomorrow
  // (effectiveFrom), so saving leaves today's budget exactly as it was and writes one closed period.
  await page.goto(`${BASE}/settings/goals`, { waitUntil: 'networkidle' });
  await page.getByTestId('goals-exercise-spread-week').first().waitFor({ timeout: 15000 });
  check('Goals: a new person is on "Over 7 days"', (await page.getByTestId('goals-exercise-spread-week').first().getAttribute('aria-selected')) === 'true');
  await tap('goals-exercise-spread-day');
  const spreadNote = await text('goals-exercise-note');
  check('Goals: the note says the change waits for tomorrow when a workout is dated today', /starts with tomorrow.s workouts/i.test(spreadNote), spreadNote);
  await tap('goals-save');
  await page.waitForTimeout(600);
  s = await stored();
  const hist = s.profile.exerciseRuleHistory ?? [];
  check('Goals: "Same day" is saved with "Over 7 days" kept up to today', s.profile.exerciseSpread === 'day' && hist.length === 1 && hist[0].rule === 'week' && hist[0].until > localKey(new Date()), JSON.stringify({ spread: s.profile.exerciseSpread, hist }));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check("Goals: saving the change leaves today's budget as it was", near(num(await text('today-remaining')), expectedLeft, 1), await text('today-remaining'));

  // ------------------------------------------------------- the next morning
  // The same saved data, seen at 08:10 tomorrow: today's food, run and water are then yesterday, and the
  // morning page (/morning, src/features/morning) opens by itself on the first visit, once. An automated
  // browser never sees it unless the window carries __healthcalMorning before the app starts. Playwright's
  // clock belongs to the whole context, so this runs in a context of its own with the stored data copied over.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 10, 0, 0);
  const tomorrowDay = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const morningContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce', storageState: await context.storageState() });
  await morningContext.addInitScript(() => {
    window.__healthcalMorning = true;
  });
  await morningContext.clock.setFixedTime(tomorrow);
  const morning = await morningContext.newPage();
  morning.on('pageerror', (e) => errors.push(e.message));
  morning.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  const mstored = async () => morning.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())));
  await morning.goto(BASE + '/', { waitUntil: 'networkidle' });
  const opened = await morning.getByTestId('morning-card').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  const at = new URL(morning.url());
  check('morning: the page opens by itself on the first visit of the morning', opened && at.pathname === '/morning', morning.url());
  check('morning: the first showing says how to turn it off', at.searchParams.get('first') === '1' && (await morning.getByTestId('morning-first').count()) > 0, morning.url());
  // In the pinned footer, so it is in view however long the page is.
  const firstBox = await morning.getByTestId('screen-footer').getByTestId('morning-first').first().boundingBox().catch(() => null);
  const view = morning.viewportSize();
  check('morning: the line about turning it off is in view, in the footer', !!firstBox && !!view && firstBox.y >= 0 && firstBox.y + firstBox.height <= view.height, JSON.stringify(firstBox));
  // Marked on this device under its own key (src/features/morning/seen.ts), not in the synced settings: without
  // an account there is no pull to wait for, and a settings write would only be a write the updater sees.
  const seenHere = await morning.evaluate(() => localStorage.getItem('healthcal-morning/seen'));
  check('morning: it is marked as seen today on this device, before anything else', seenHere === tomorrowDay, `${seenHere} vs ${tomorrowDay}`);
  check('morning: without an account the synced settings are not written', (await mstored()).settings.morningSeenDay === undefined, String((await mstored()).settings.morningSeenDay));
  let firstQuote = '';
  if (opened) {
    const line = (await morning.getByTestId('morning-line').first().innerText().catch(() => '')).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim();
    check('morning: yesterday is described in one neutral sentence', line.length > 0 && !/!|fail|cheat|great|over budget/i.test(line), line);
    // The second edition: a greeting by the time of day, a quote of the day, and words that never scold.
    const norm = (t) => t.replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim();
    const headerTitle = norm(await morning.getByTestId('screen-header').first().innerText().catch(() => ''));
    check('morning: the header greets by the time of day', headerTitle.startsWith('Good morning'), headerTitle.split('\n')[0]);
    firstQuote = norm(await morning.getByTestId('morning-quote-text').first().innerText().catch(() => ''));
    const author = norm(await morning.getByTestId('morning-quote-author').first().innerText().catch(() => ''));
    check('morning: a quote of the day with its author', firstQuote.length > 0 && author.length > 0, `${firstQuote} / ${author}`);
    const quoteBlock = norm(await morning.getByTestId('morning-quote').first().innerText().catch(() => ''));
    const pageText = norm(await morning.getByTestId('morning-screen').first().innerText().catch(() => '')).replace(quoteBlock, '');
    const harsh = /\b(fail|failed|cheat|great job|should|bad|missed your|over budget)\b/i.exec(pageText);
    check('morning: its own words have no exclamation mark and no blame', !pageText.includes('!') && !harsh, harsh ? harsh[0] : pageText.includes('!') ? 'an exclamation mark' : '');
    // The coach in the week block (coach.ts): a lead, then the next step and the first step for today, one
    // accessible element; plain words that speak to the person, never a verdict or a call to eat less.
    const coach = norm(await morning.getByTestId('morning-coach').first().innerText().catch(() => ''));
    const lead = norm(await morning.getByTestId('morning-coach-lead').first().innerText().catch(() => ''));
    const coachHarsh = /\b(bad|fail|failed|cheat|should have|lazy|guilty|eat less|make up for|great job)\b/i.exec(coach);
    check('morning: the coach speaks, with a lead sentence', coach.length > 0 && lead.length > 0 && coach.startsWith(lead), `${lead} / ${coach}`);
    check('morning: the coach has no exclamation mark and no blame word', !coach.includes('!') && !coachHarsh, coachHarsh ? coachHarsh[0] : coach);
    const coachLabel = await morning.getByTestId('morning-coach').first().getAttribute('aria-label').catch(() => null);
    check('morning: the coach is read once, as its own label', !!coachLabel && coachLabel.length > 0, String(coachLabel));
    check('morning: the week block shows the week in cups', (await morning.getByTestId('morning-week').count()) > 0 && (await morning.getByTestId('morning-week-yesterday').count()) > 0, '');
    // The quote is second, under the week block and above yesterday's card.
    const [weekBox, quoteBox, cardBox] = await Promise.all(['morning-week', 'morning-quote', 'morning-card'].map((id) => morning.getByTestId(id).first().boundingBox().catch(() => null)));
    check('morning: the quote sits under the week block and above yesterday\'s card', !!weekBox && !!quoteBox && !!cardBox && weekBox.y < quoteBox.y && quoteBox.y < cardBox.y, JSON.stringify([weekBox?.y, quoteBox?.y, cardBox?.y]));
    // The X at the top left: morning-close if the screen names it, else the kit Header's own X (header-close).
    await morning.locator('[data-testid="morning-close"], [data-testid="header-close"]').first().click({ timeout: 15000 });
    await morning.waitForURL((u) => new URL(u).pathname === '/', { timeout: 8000 }).catch(() => {});
    const onToday = new URL(morning.url()).pathname === '/' && (await morning.getByTestId('today-screen').first().isVisible().catch(() => false));
    check('morning: the X closes it onto Today in one tap', onToday, morning.url());
  }
  await morning.reload({ waitUntil: 'networkidle' });
  await morning.getByTestId('today-screen').first().waitFor({ timeout: 15000 }).catch(() => {});
  // The page decides 900 ms after the app settles: wait well past that.
  await morning.waitForTimeout(2500);
  check('morning: it does not open again the same morning after a reload', new URL(morning.url()).pathname === '/' && (await morning.getByTestId('morning-card').count()) === 0, morning.url());
  // Shown again the same morning (the seen day cleared, so it rises over Today once more): the quote is the one
  // kept on this device for the day (quotePin.ts), and a row of "For today" opens its place, with the browser's
  // back landing on Today.
  await morning.evaluate(() => localStorage.removeItem('healthcal-morning/seen'));
  await morning.goto(BASE + '/', { waitUntil: 'networkidle' });
  const again = await morning.getByTestId('morning-quote-text').first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  const againQuote = again ? (await morning.getByTestId('morning-quote-text').first().innerText()).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim() : '';
  check('morning: the same quote all day on this device', again && againQuote === firstQuote, `${againQuote} vs ${firstQuote}`);
  // The row the coach's step for today names is left out of For today (it is said once): any row left opens its place.
  const planRow = morning.locator('[data-testid^="morning-plan-"]:not([data-testid="morning-plan"])').first();
  if (again && (await planRow.count()) > 0) {
    const rowId = (await planRow.getAttribute('data-testid')) || '';
    const place = { 'morning-plan-water': '/water', 'morning-plan-move': '/activity/pick', 'morning-plan-weigh': '/weight', 'morning-plan-sleep': '/sleep' }[rowId];
    await planRow.click();
    await morning.waitForURL((u) => new URL(u).pathname === place, { timeout: 8000 }).catch(() => {});
    const onPlace = !!place && new URL(morning.url()).pathname === place;
    await morning.goBack().catch(() => {});
    await morning.waitForURL((u) => new URL(u).pathname === '/', { timeout: 8000 }).catch(() => {});
    check('morning: a row of For today opens its place, and back lands on Today', onPlace && new URL(morning.url()).pathname === '/', `${rowId} ${morning.url()}`);
  } else {
    check('morning: For today offers a row', false, again ? 'no morning-plan row' : 'the page did not open again');
  }
  await morningContext.close();

  // ------------------------------------------- drinks with calories (src/features/drinks)
  // On the water screen a kind's choice with a food writes the water record and a diary entry together
  // (logDrink); Undo and a delete on Water take both, a delete in the diary only the calories.
  await page.goto(BASE + '/water', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  s = await stored();
  const gi = Math.max(0, s.settings.waterPresets.indexOf(250));
  const pressed = async (id) => (await page.getByTestId(id).count()) > 0 && (await page.getByTestId(id).first().getAttribute('aria-pressed', { timeout: 5000 })) === 'true';
  // mealForTime (src/lib/nutrition.ts) on the page's own clock.
  const pageMeal = await page.evaluate(() => {
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    return h >= 4.5 && h < 10.5 ? 'breakfast' : h >= 11.5 && h < 15 ? 'lunch' : h >= 17.5 && h < 21.5 ? 'dinner' : 'snack';
  });
  const mealWord = pageMeal === 'snack' ? 'snacks' : pageMeal;
  await tap('water-beverage-milk');
  check('drinks: Milk opens its choices with semi-skimmed selected', await pressed('water-choice-milk_semi'));
  const drinkLine = await text('water-drink-line');
  check('drinks: the line names the drink and its calories before the tap', /Semi-skimmed milk: 129 kcal per 250 ml/.test(drinkLine), drinkLine);
  check('drinks: the 250 ml glass shows 129 kcal', (await text(`water-add-${gi}`)).includes('129 kcal'), await text(`water-add-${gi}`));
  const newIn = (after, before, c) => live(after[c]).filter((r) => !before[c][r.id]);
  let before = await stored();
  await tap(`water-add-${gi}`);
  s = await stored();
  const [w1] = newIn(s, before, 'water');
  const [e1] = newIn(s, before, 'foodEntries');
  check(
    'drinks: one tap writes one water record and one diary entry that belong together',
    newIn(s, before, 'water').length === 1 && newIn(s, before, 'foodEntries').length === 1 && w1.drink === 'milk_semi' && w1.foodEntryId === e1.id && e1.via === 'water' && Math.round(e1.nutrients.kcal) === 129 && e1.meal === pageMeal,
    JSON.stringify({ w1, e1: e1 && { meal: e1.meal, via: e1.via, kcal: e1.nutrients.kcal } }).slice(0, 240),
  );
  const addedToast = await text('toast');
  check('drinks: the toast says what was added and where', addedToast.includes(`Added 250 ml of milk, 129 kcal to ${mealWord}`), addedToast);
  await tap('toast-action');
  s = await stored();
  check('drinks: Undo removes both', !!s.water[w1.id]?.deleted && !!s.foodEntries[e1.id]?.deleted);
  before = await stored();
  await tap(`water-add-${gi}`);
  s = await stored();
  const [w2] = newIn(s, before, 'water');
  const [e2] = newIn(s, before, 'foodEntries');
  check('drinks: logged again', !!w2 && !!e2 && w2.foodEntryId === e2.id);
  await page.waitForTimeout(5000);
  // The same milk logged in the diary itself (as the food search would): the water screen says so before the tap.
  await page.evaluate((e) => {
    const { id: _id, updatedAt: _u, via: _v, ...rest } = e;
    window.__healthcal.getState().upsert('foodEntries', { ...rest, loggedAt: new Date().toISOString() });
  }, e2);
  await page.waitForTimeout(600);
  const notice = (await page.getByTestId('water-drink-notice').count()) ? await text('water-drink-notice') : '';
  check('drinks: the same milk already in the diary is said before the tap, with Water only', notice.startsWith('Semi-skimmed milk is already in') && (await page.getByTestId('water-water-only').count()) > 0, notice);
  check('drinks: Water only is off by default', !(await pressed('water-water-only')));
  await tap('water-water-only');
  check('drinks: with Water only on, the glasses read No calories', (await text(`water-add-${gi}`)).includes('No calories'), await text(`water-add-${gi}`));
  before = await stored();
  await tap(`water-add-${gi}`);
  s = await stored();
  const [w3] = newIn(s, before, 'water');
  check('drinks: Water only writes the water record alone', !!w3 && !w3.foodEntryId && newIn(s, before, 'foodEntries').length === 0, JSON.stringify(w3));
  check('drinks: the Water only toast', (await text('toast')).includes('for water only'), await text('toast'));
  check('drinks: Water only turns off after the log', !(await pressed('water-water-only')));
  await page.waitForTimeout(5000);
  // The diary marks the paired entry; a delete there removes the calories and keeps the water.
  await page.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const mark = (await page.getByTestId(`entry-in-water-${e2.id}`).count()) ? await text(`entry-in-water-${e2.id}`) : '';
  check('drinks: the diary row says "also in Water"', mark.includes('also in Water'), mark);
  await tap(`entry-delete-${e2.id}`);
  s = await stored();
  check('drinks: deleting in the diary keeps the water', !!s.foodEntries[e2.id]?.deleted && !s.water[w2.id]?.deleted);
  check('drinks: and the toast says so', (await text('toast')).includes('The 250 ml stays in Water.'), await text('toast'));
  await tap('toast-action');
  s = await stored();
  check('drinks: Undo in the diary brings the entry back', !s.foodEntries[e2.id]?.deleted);
  await page.waitForTimeout(5000);
  // Deleting on Water takes both.
  await page.goto(`${BASE}/water`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const pairedRow = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="water-entry-kcal-"]');
    return el ? el.getAttribute('data-testid').replace('water-entry-kcal-', '') : null;
  });
  if (pairedRow !== null) await tap(`water-delete-${pairedRow}`);
  s = await stored();
  check('drinks: deleting on Water removes the water and its calories', pairedRow !== null && !!s.water[w2.id]?.deleted && !!s.foodEntries[e2.id]?.deleted, `row ${pairedRow}`);
  check('drinks: the delete toast names the calories', (await text('toast')).includes('Removed 250 ml of milk and its 129 kcal'), await text('toast'));
  await page.waitForTimeout(5000);
  // Coffee starts on Black: no calories, no diary entry.
  await tap('water-beverage-coffee');
  check('drinks: Coffee starts on Black', await pressed('water-choice-coffee_black'));
  check('drinks: a black coffee glass shows no calories', !(await text(`water-add-${gi}`)).includes('kcal'), await text(`water-add-${gi}`));
  before = await stored();
  await tap(`water-add-${gi}`);
  s = await stored();
  const [wc] = newIn(s, before, 'water');
  check('drinks: a black coffee writes no diary entry', !!wc && wc.drink === 'coffee_black' && !wc.foodEntryId && newIn(s, before, 'foodEntries').length === 0, JSON.stringify(wc));
  // Other's "Choose a drink": no disabled button on opening; "Or enter calories" is in the first view and
  // its button says what it adds; tapping a drink only chooses it, and says so.
  await page.waitForTimeout(5000);
  await tap('water-beverage-other');
  await tap('water-choice-pick');
  check('drinks: the pick sheet opens with no button at its foot', (await page.getByTestId('water-pick-kcal-add').count()) === 0 && (await page.getByTestId('water-pick-kcal-open').count()) > 0);
  await tap('water-pick-kcal-open');
  await fill('water-pick-kcal', 140);
  const kcalButton = await text('water-pick-kcal-add');
  check('drinks: entered calories say where they go before the tap', kcalButton.startsWith('Add 140 kcal to '), kcalButton);
  before = await stored();
  await tap('water-pick-kcal-add');
  s = await stored();
  const [ek] = newIn(s, before, 'foodEntries');
  check('drinks: entered calories write the pair', !!ek && ek.via === 'water' && Math.round(ek.nutrients.kcal) === 140 && newIn(s, before, 'water').length === 1, JSON.stringify(ek && { kcal: ek.nutrients.kcal, via: ek.via }));
  await page.waitForTimeout(5000);
  await tap('water-choice-pick');
  before = await stored();
  await tap('water-pick-b_apple_juice');
  s = await stored();
  const chosenToast = await text('toast');
  // Apple juice is one of Juice's own choices: picked from Other's sheet it goes to Juice (placePick), and the toast says so.
  check(
    'drinks: a drink tapped in the sheet is chosen, not logged, and the toast says where',
    chosenToast === 'Apple juice chosen, under Juice. Tap a glass to add it.' && newIn(s, before, 'water').length === 0 && newIn(s, before, 'foodEntries').length === 0,
    chosenToast,
  );
  check('drinks: and the screen shows Juice with Apple selected', (await pressed('water-beverage-juice')) && (await pressed('water-choice-juice_apple')));
  // The choice is remembered on this device.
  await tap('water-beverage-milk');
  await tap('water-choice-milk_whole');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await tap('water-beverage-milk');
  check('drinks: the last milk chosen is selected after a reload', await pressed('water-choice-milk_whole'));

  // ------------------------------------------- a search for any drink (src/features/drinks/pick.ts, DrinkPickSheet, DrinkTitleRow)
  // "Search" beside "Add a drink" opens the drink sheet from any kind. A pick goes to its own kind (a bundled
  // drink), or to Other; the kind row shows it, the line names it with its calories, and a glass logs it.
  const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^="water-pick-"]')]
    .filter((e) => e.getBoundingClientRect().height > 0 && !/^water-pick-(sheet|search|kcal|hint|clear)/.test(e.getAttribute('data-testid')) && !/-matched$/.test(e.getAttribute('data-testid')))
    .map((e) => e.getAttribute('data-testid')));
  const inView = (id) => page.evaluate((id) => {
    const r = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
    return !!r && r.left >= 0 && r.right <= window.innerWidth;
  }, id);
  await tap('water-beverage-water');
  await page.waitForTimeout(5000);
  check('drink search: "Search" sits beside "Edit sizes" on the Water kind', (await page.getByTestId('water-search').count()) > 0 && (await page.getByTestId('section-add-a-drink-action').count()) > 0 && (await page.getByTestId('water-search').first().getAttribute('aria-label')) === 'Search drinks');
  await tap('water-search');
  check('drink search: it opens the drink sheet with an empty search and "All drinks"', (await page.getByTestId('water-pick-search').first().inputValue()) === '' && (await page.getByTestId('water-pick-all').count()) > 0);
  await fill('water-pick-search', 'soup');
  await page.waitForTimeout(700);
  check('drink search: "soup" lists no soup and says foods are added in the diary', (await text('water-pick-none')) === 'No drink matches “soup”. Foods are added in the diary.' && !(await rowsOf()).some((id) => /soup/.test(id)), (await rowsOf()).join(', '));
  check('drink search: the online part says it works in the phone app (no backend here)', (await text('water-pick-online-empty')) === 'Product search by name works in the phone app. Here, enter the calories above.', await text('water-pick-online-empty'));
  check('drink search: the hint line goes while a query is typed', (await page.getByTestId('water-pick-hint').count()) === 0);
  await fill('water-pick-search', 'beer');
  await page.waitForTimeout(700);
  check('drink search: "beer" says alcohol is added in the diary', (await text('water-pick-alcohol')) === 'Drinks with alcohol are added in the diary, not in Water.' && (await page.getByTestId('water-pick-none').count()) === 0, (await rowsOf()).join(', '));
  await fill('water-pick-search', 'tea');
  await page.waitForTimeout(700);
  const teaRows = (await rowsOf()).filter((id) => /^water-pick-b_/.test(id));
  check('drink search: "tea" shows three teas, then "Show all 5"', teaRows.length === 3 && (await text('water-pick-more')) === 'Show all 5', `${teaRows.join(', ')} / ${(await page.getByTestId('water-pick-more').count()) ? await text('water-pick-more') : 'no more row'}`);
  await tap('water-pick-more');
  check('drink search: "Show all" shows the rest', (await rowsOf()).filter((id) => /^water-pick-b_/.test(id)).length === 5 && (await page.getByTestId('water-pick-more').count()) === 0);
  await fill('water-pick-search', 'monster');
  await page.waitForTimeout(700);
  const monsterRows = (await rowsOf()).filter((id) => /^water-pick-b_/.test(id));
  check('drink search: "monster" finds the energy drink first', monsterRows[0] === 'water-pick-b_energy_drink', monsterRows.join(', '));
  before = await stored();
  await tap('water-pick-b_energy_drink');
  s = await stored();
  check('drink search: a pick logs nothing', newIn(s, before, 'water').length === 0 && newIn(s, before, 'foodEntries').length === 0);
  const pickToastText = await text('toast');
  check('drink search: the toast says where it went', pickToastText === 'Energy drink, sugared chosen, under Other. Tap a glass to add it.', pickToastText);
  check('drink search: the screen is on Other, its chip in view', (await pressed('water-beverage-other')) && (await inView('water-beverage-other')));
  check('drink search: the drink is its own chip, selected', (await pressed('water-choice-food')) && (await text('water-choice-food')) === 'Energy drink, sugared', await text('water-choice-food'));
  const monsterLine = await text('water-drink-line');
  check('drink search: the line names it with its calories before a glass', monsterLine.startsWith('Energy drink, sugared: 108 kcal per 250 ml'), monsterLine);
  await page.waitForTimeout(5000);
  before = await stored();
  await tap(`water-add-${gi}`);
  s = await stored();
  const [wm] = newIn(s, before, 'water');
  const [em] = newIn(s, before, 'foodEntries');
  check(
    'drink search: a glass logs the picked drink: one water record and its diary entry',
    !!wm && !!em && wm.foodEntryId === em.id && em.via === 'water' && em.foodId === 'b_energy_drink' && Math.round(em.nutrients.kcal) === 108 && wm.ml === 250,
    JSON.stringify({ wm: wm && { ml: wm.ml, drink: wm.drink }, em: em && { foodId: em.foodId, kcal: em.nutrients.kcal } }),
  );
  await page.waitForTimeout(5000);
  const monsterRow = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="water-entry-kcal-"]')].map((e) => e.innerText.replace(/[ ]/g, ' ').replace(/[⁠‎⁨⁩]/g, '')).find((t) => t.includes('Energy drink')) || '');
  check("drink search: the Water row names the drink's diary entry", /^Energy drink, sugared · 108 kcal in /.test(monsterRow), monsterRow);
  // "mocha" from the title row, while Other shows: a bundled coffee goes to Coffee with its calories.
  await tap('water-search');
  await fill('water-pick-search', 'mocha');
  await page.waitForTimeout(700);
  await tap('water-pick-b_mocha');
  check('drink search: "mocha" lands on Coffee', (await pressed('water-beverage-coffee')) && (await inView('water-beverage-coffee')) && (await text('toast')) === 'Cafe mocha, whole milk chosen, under Coffee. Tap a glass to add it.', await text('toast'));
  const mochaLine = await text('water-drink-line');
  check('drink search: under Coffee the mocha keeps its calories (not black coffee)', (await pressed('water-choice-food')) && mochaLine.startsWith('Cafe mocha, whole milk: 188 kcal per 250 ml'), mochaLine);
  await page.waitForTimeout(5000);
  // The next visit: the Water kind offers the drinks picked before as chips, one tap from a glass.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await tap('water-beverage-coffee');
  check('drink search: after a reload Coffee keeps the mocha', (await text('water-drink-line')).startsWith('Cafe mocha, whole milk'), await text('water-drink-line'));
  check('drink search: no recent chips on a kind other than Water', (await page.locator('[data-testid^="water-recent-"]').count()) === 0);
  await tap('water-beverage-water');
  const recentIds = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="water-recent-"]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.getAttribute('data-testid')));
  check('drink search: the Water kind shows the energy drink as a recent chip, on one line', recentIds.includes('water-recent-b_energy_drink') && recentIds.length <= 3, recentIds.join(', '));
  const recentLabel = await page.getByTestId('water-recent-b_energy_drink').first().getAttribute('aria-label');
  check('drink search: the chip says its calories to a screen reader', recentLabel === 'Energy drink, sugared, 108 kcal per 250 ml, choose', String(recentLabel));
  await tap('water-recent-b_energy_drink');
  check('drink search: a recent chip is a pick: Other, the drink selected, the line', (await pressed('water-beverage-other')) && (await pressed('water-choice-food')) && (await text('water-drink-line')).startsWith('Energy drink, sugared: 108 kcal'));
  // Leave the day as it was for what follows: the energy drink's water and entry go.
  await page.evaluate(([w, e]) => {
    window.__healthcal.getState().remove('water', w);
    window.__healthcal.getState().remove('foodEntries', e);
  }, [wm.id, em.id]);
  await page.waitForTimeout(400);
  // Today's water button stays plain water.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  before = await stored();
  await tap('today-water-250');
  s = await stored();
  const [wt] = newIn(s, before, 'water');
  check("drinks: Today's +250 ml stays plain water", !!wt && wt.beverage === 'water' && !wt.drink && newIn(s, before, 'foodEntries').length === 0, JSON.stringify(wt));

  // ------------------------------------------- drinks logged in the diary also count in Water (src/features/drinks/diary.ts)
  // The mirror: a drink logged as food adds its volume to Water in the same act (a water record with
  // `fromEntryId`); the one toast says both and its Undo takes both. The entry leads: the stepper moves the
  // water, a delete in the diary takes it, a delete on Water leaves the entry; a repeat copies it; the
  // Goals switch stops new pairs.
  const ymd = (offset) => page.evaluate((o) => {
    const d = new Date();
    d.setDate(d.getDate() + o);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, offset);
  const pageDay = await ymd(0);
  const yesterDay = await ymd(-1);
  const consumedNow = async () => {
    await page.goto(`${BASE}/water`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    return text('water-consumed');
  };
  const fromDiaryRow = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid^="water-entry-from-"]');
    return el ? el.getAttribute('data-testid').replace('water-entry-from-', '') : null;
  });
  const consumedBefore = await consumedNow();
  await page.goto(`${BASE}/food/search?meal=lunch&date=${pageDay}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await fill('food-search-input', 'monster');
  await page.waitForTimeout(900);
  const firstRow = await text('result-0').catch(() => '');
  check('diary drinks: "monster" finds the energy drink first', /^\W*Energy drink, sugared/.test(firstRow), firstRow.split('\n').slice(0, 2).join(' / '));
  before = await stored();
  await tap('result-0-add');
  s = await stored();
  let [de] = newIn(s, before, 'foodEntries');
  let [dw] = newIn(s, before, 'water');
  check(
    'diary drinks: its + writes the entry and its water together (fromEntryId, the same day, no via)',
    !!de && !!dw && de.foodId === 'b_energy_drink' && !de.via && dw.fromEntryId === de.id && !dw.foodEntryId && dw.date === pageDay && dw.ml > 200 && dw.updatedAt === de.updatedAt,
    JSON.stringify({ de: de && { foodId: de.foodId, via: de.via, label: de.servingLabel }, dw }).slice(0, 260),
  );
  // The toast's first line is its message (the action follows it).
  const toastLine = async () => (await text('toast')).split('\n')[0].trim();
  const logToast = await toastLine();
  check('diary drinks: the toast says both', !!dw && logToast === `Added to lunch and ${dw.ml} ml to Water`, logToast);
  await tap('toast-action');
  s = await stored();
  check('diary drinks: Undo of the log takes the entry and its water', !!de && !!s.foodEntries[de.id]?.deleted && !!s.water[dw.id]?.deleted);
  // Again, then the row's stepper: the water follows the amount, silently.
  before = await stored();
  await tap('result-0-add');
  s = await stored();
  [de] = newIn(s, before, 'foodEntries');
  [dw] = newIn(s, before, 'water');
  const perUnit = dw ? dw.ml / de.quantity : 0;
  await page.waitForTimeout(5000);
  await tap('result-0-more');
  s = await stored();
  const stepped = de && s.foodEntries[de.id];
  const steppedWater = dw && s.water[dw.id];
  check(
    'diary drinks: the stepper changes the amount and Water follows',
    !!stepped && !!steppedWater && stepped.quantity > de.quantity && Math.abs(steppedWater.ml - perUnit * stepped.quantity) <= 1 && !steppedWater.deleted,
    `${stepped?.quantity} x, ${steppedWater?.ml} ml`,
  );
  const consumedAfter = await consumedNow();
  check("diary drinks: Water's total includes it", consumedAfter !== consumedBefore, `${consumedBefore} -> ${consumedAfter}`);
  let row = await fromDiaryRow();
  const caption = row !== null ? await text(`water-entry-from-${row}`) : '';
  check('diary drinks: the Water row names the drink and its meal, with no calories', caption === 'Energy drink, sugared · from lunch', caption);
  const openLabel = row !== null ? await page.getByTestId(`water-entry-open-${row}`).first().getAttribute('aria-label') : null;
  check('diary drinks: the Water row opens the entry', !!openLabel && openLabel.endsWith('Energy drink, sugared, from lunch. Edit in diary'), String(openLabel));
  // Delete in the diary: the water goes with it; Undo brings both.
  await page.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const diaryMark = (await page.getByTestId(`entry-in-water-${de.id}`).count()) ? await text(`entry-in-water-${de.id}`) : '';
  check('diary drinks: the diary row says "also in Water"', diaryMark.includes('also in Water'), diaryMark);
  await tap(`entry-delete-${de.id}`);
  s = await stored();
  const delToast = await toastLine();
  check('diary drinks: a delete in the diary takes the water too', !!s.foodEntries[de.id]?.deleted && !!s.water[dw.id]?.deleted);
  check('diary drinks: and the toast says so', /^Removed Energy drink, sugared and its .+ from Water$/.test(delToast), delToast);
  await tap('toast-action');
  s = await stored();
  check('diary drinks: Undo in the diary brings both back', !s.foodEntries[de.id]?.deleted && !s.water[dw.id]?.deleted);
  await page.waitForTimeout(5000);
  // Delete on Water: only the water; the entry stays; Undo restores the water with its link.
  await page.goto(`${BASE}/water`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  row = await fromDiaryRow();
  const delLabel = row !== null ? await page.getByTestId(`water-delete-${row}`).first().getAttribute('aria-label') : null;
  check('diary drinks: the Water delete button says the drink stays', !!delLabel && delLabel.endsWith('. The drink stays in lunch'), String(delLabel));
  if (row !== null) await tap(`water-delete-${row}`);
  s = await stored();
  const waterDelToast = await toastLine();
  check('diary drinks: a delete on Water leaves the entry', row !== null && !!s.water[dw.id]?.deleted && !s.foodEntries[de.id]?.deleted, `row ${row}`);
  check('diary drinks: and its toast says so', /^Removed .+\. The drink stays in lunch\.$/.test(waterDelToast), waterDelToast);
  await tap('toast-action');
  s = await stored();
  check('diary drinks: Undo on Water brings the water back with its link', !s.water[dw.id]?.deleted && s.water[dw.id]?.fromEntryId === de.id);
  await page.waitForTimeout(5000);
  // Repeat yesterday's lunch that held a drink: the copy adds its water on today, and the toast says so.
  await page.evaluate(({ e, y }) => {
    const st = window.__healthcal.getState();
    for (const x of Object.values(st.foodEntries)) if (!x.deleted && x.meal === 'lunch' && x.date === e.date) st.remove('foodEntries', x.id);
    const { id: _id, updatedAt: _u, ...rest } = e;
    st.upsert('foodEntries', { ...rest, date: y, loggedAt: `${y}T12:30:00.000Z` });
  }, { e: s.foodEntries[de.id], y: yesterDay });
  await page.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  before = await stored();
  await tap('meal-repeat-lunch');
  s = await stored();
  const [re] = newIn(s, before, 'foodEntries');
  const [rw] = newIn(s, before, 'water');
  const repeatToast = await toastLine();
  check('diary drinks: repeating yesterday\'s lunch adds the drink\'s water on today', !!re && !!rw && rw.fromEntryId === re.id && rw.date === pageDay, JSON.stringify(rw));
  check('diary drinks: the repeat toast names the water', !!rw && repeatToast === `Copied lunch from yesterday, ${rw.ml} ml to Water`, repeatToast);
  // Yesterday's lunch as it was before this block (the "Repeat yesterday's" check further on counts its rows).
  await page.evaluate((y) => {
    const st = window.__healthcal.getState();
    for (const x of Object.values(st.foodEntries)) if (!x.deleted && x.date === y && x.foodId === 'b_energy_drink') st.remove('foodEntries', x.id);
  }, yesterDay);
  await page.waitForTimeout(5000);
  // The switch off (Goals > Water, saved with Save): a drink logged as food adds no water.
  await page.goto(`${BASE}/settings/goals`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await tap('goals-diary-drinks');
  await tap('goals-save');
  s = await stored();
  check('diary drinks: the switch is saved with Goals', s.profile.diaryDrinksInWater === false, String(s.profile.diaryDrinksInWater));
  await page.goto(`${BASE}/food/search?meal=dinner&date=${pageDay}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await fill('food-search-input', 'energy drink');
  await page.waitForTimeout(900);
  before = await stored();
  await tap('result-0-add');
  s = await stored();
  const offToast = await toastLine();
  check('diary drinks: with the switch off, no water and the toast as before', newIn(s, before, 'foodEntries').length === 1 && newIn(s, before, 'water').length === 0 && offToast === 'Added to dinner', offToast);
  await page.goto(`${BASE}/settings/goals`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await tap('goals-diary-drinks');
  await tap('goals-save');
  s = await stored();
  check('diary drinks: the switch on again', s.profile.diaryDrinksInWater !== false, String(s.profile.diaryDrinksInWater));

  // A remembered portion after a restart (lead's decision H1). Cheese bourekas logged before the Israeli foods
  // ("1 piece" 80 g at 335 kcal per 100 g, commit 3fa7914) on the three days before today, in every meal, so it is
  // the usual food whatever the time. After a reload the device holds today's bundled food on those entries
  // (src/store/persistence.ts): the + sheet's tile must show what its tap stores.
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const per100 = { kcal: 335, protein: 9, carbs: 28, fat: 21, fiber: 1, sugar: 1.5, satFat: 9, sodium: 600 };
    const food = { id: 'b_bourekas_cheese', name: 'Bourekas, cheese (puff pastry)', emoji: '\u{1F950}', category: 'middle_eastern', source: 'builtin', verified: false, per100g: per100, servings: [{ label: '1 piece', grams: 80 }, { label: '1 large', grams: 110 }, { label: '1 small', grams: 55 }] };
    for (const n of [1, 2, 3]) {
      const d = new Date();
      d.setDate(d.getDate() - n);
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
        window.__healthcal.getState().upsert('foodEntries', {
          date, meal, name: food.name, emoji: food.emoji, foodId: food.id, source: 'builtin', verified: false, servingLabel: '1 piece', quantity: 1, grams: 80,
          nutrients: Object.fromEntries(Object.entries(per100).map(([k, v]) => [k, (v * 80) / 100])), food, loggedAt: `${date}T10:00:00.000Z`,
        });
      }
    }
    // For "Repeat yesterday's <meal>" (lead's decision L1): yesterday, in every meal, an own food logged at 450 kcal per
    // 100 g and since edited to 500, and an online product; today's meals emptied so the repeat is offered at any hour.
    const s = window.__healthcal.getState();
    const own = { id: 'e2e_own_granola', name: 'My granola', emoji: '\u{1F963}', source: 'custom', verified: false, per100g: { kcal: 450, protein: 10, carbs: 60, fat: 18 }, servings: [{ label: '1 bowl', grams: 60 }] };
    s.upsert('customFoods', { ...own, per100g: { ...own.per100g, kcal: 500 } });
    const online = { id: 'off_7290000000001', name: 'Hummus spread', brand: 'Store brand', source: 'openfoodfacts', verified: false, per100g: { kcal: 250, protein: 7, carbs: 12, fat: 19 }, servings: [{ label: '1 tbsp', grams: 15 }] };
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const now = new Date();
    const t = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
      for (const [food, label, grams, quantity] of [[own, '1 bowl', 60, 1], [online, '1 tbsp', 30, 2]]) {
        s.upsert('foodEntries', {
          date: y, meal, name: food.name, brand: food.brand, emoji: food.emoji, foodId: food.id, source: food.source, verified: false, servingLabel: label, quantity, grams,
          nutrients: Object.fromEntries(Object.entries(food.per100g).map(([k, v]) => [k, (v * grams) / 100])), food, loggedAt: `${y}T11:00:00.000Z`,
        });
      }
    }
    for (const e of Object.values(s.foodEntries)) if (!e.deleted && e.date === t) s.remove('foodEntries', e.id);
  });
  await page.evaluate(() => window.__healthcal.flush());
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await tap('tab-add');
  const tile = (await text('quick-usual-b_bourekas_cheese')).replace(/\s*\n\s*/g, ' / ');
  const repeatRow = (await text('quick-repeat')).replace(/\s*\n\s*/g, ' / ');
  before = await stored();
  await tap('quick-repeat');
  s = await stored();
  const copied = newIn(s, before, 'foodEntries');
  const rowKcal = Number((repeatRow.match(/([\d,]+) kcal/) || [])[1]?.replace(/,/g, ''));
  const copiedKcal = copied.reduce((n, e) => n + e.nutrients.kcal, 0);
  const cb = copied.find((e) => e.foodId === 'b_bourekas_cheese');
  const co = copied.find((e) => e.foodId === 'e2e_own_granola');
  const cn = copied.find((e) => e.foodId === 'off_7290000000001');
  check(
    "repeat: after a reload \"Repeat yesterday's\" shows what its tap stores (bundled at today's values, own food and online product as logged)",
    copied.length === 3 && rowKcal === Math.round(copiedKcal) && !!cb && cb.servingLabel === '80 g' && Math.abs(cb.nutrients.kcal - (cb.food.per100g.kcal * 80) / 100) < 0.01 &&
      !!co && Math.abs(co.nutrients.kcal - 270) < 0.01 && co.servingLabel === '1 bowl' && !!cn && Math.abs(cn.nutrients.kcal - 75) < 0.01,
    `row "${repeatRow}", stored ${copied.map((e) => `${e.name} ${e.servingLabel} x${e.quantity} ${e.nutrients.kcal.toFixed(1)}`).join('; ')}`,
  );
  before = await stored();
  await tap('quick-usual-b_bourekas_cheese');
  s = await stored();
  const [old] = newIn(s, before, 'foodEntries');
  const shownKcal = Number((tile.match(/([\d,]+) kcal/) || [])[1]?.replace(/,/g, ''));
  check(
    'old portion: after a reload the + sheet tile shows what its tap stores',
    !!old && shownKcal === Math.round(old.nutrients.kcal) && tile.includes(`${old.grams} g,`) && old.servingLabel === '80 g',
    `tile "${tile}", stored ${old ? `${old.servingLabel} x${old.quantity} ${old.grams} g ${old.nutrients.kcal.toFixed(1)} kcal` : 'nothing'}`,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ------------------------------------------- meals that fit (src/features/today/ideas.ts, FitsSheet)
  // The demo's five weeks at dinner time, 60% of the budget eaten, in a context of its own: Today's "Ideas that fit" chip
  // opens What fits with "Meals that fit" above the single foods; one tap logs an idea's foods to dinner with one Undo,
  // its row turns into a tick and every row stays where it was; Undo takes the foods away. Over the budget the chip is
  // not there, and the number opens one neutral line and "Search all foods", with no list at all.
  {
    // This file's folder from the command line (the lint setup does not define __dirname).
    const here = require('path').dirname(require('path').resolve(process.argv[1]));
    const { buildSeed } = await import(require('url').pathToFileURL(require('path').join(here, 'seed.mjs')).href);
    const dinner = new Date();
    dinner.setHours(19, 0, 0, 0);
    const todayIso = `${dinner.getFullYear()}-${String(dinner.getMonth() + 1).padStart(2, '0')}-${String(dinner.getDate()).padStart(2, '0')}`;
    const openIdeas = async (eaten) => {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
      await ctx.addInitScript((value) => {
        if (!window.sessionStorage.getItem('__seeded')) {
          window.localStorage.setItem('healthcal-v1', value);
          window.sessionStorage.setItem('__seeded', '1');
        }
      }, JSON.stringify(buildSeed({ onboarded: true, theme: 'dark', values: { eaten } })));
      await ctx.clock.setFixedTime(dinner);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await p.getByTestId('today-energy').first().waitFor({ timeout: 20000 });
      return { ctx, p };
    };
    const itext = async (p, id) => (await p.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/ /g, ' ').replace(/[⁠‎⁨⁩]/g, '').trim();
    const dinnerToday = async (p) =>
      Object.values((await p.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())))).foodEntries).filter((e) => !e.deleted && e.date === todayIso && e.meal === 'dinner');

    const { ctx, p } = await openIdeas(0.6);
    const chip = await p.getByTestId('today-ideas').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    check("ideas: Today shows the \"Ideas that fit\" chip in the energy card", chip && (await itext(p, 'today-ideas')) === 'Ideas that fit');
    await p.getByTestId('today-ideas').first().click({ timeout: 15000 });
    await p.waitForTimeout(500);
    const block = await p.getByTestId('fits-ideas').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    const ideaBox = block ? await p.getByTestId('fits-ideas').first().boundingBox() : null;
    const listBox = (await p.getByTestId('fits-list').count()) ? await p.getByTestId('fits-list').first().boundingBox() : null;
    check('ideas: the chip opens What fits with "Meals that fit" first, above the single foods', block && (!listBox || (ideaBox && ideaBox.y < listBox.y)), `${await p.getByTestId('fits-idea-0').count()} idea row(s)`);
    const rowsBefore = await p.getByTestId(/^fits-idea-\d+$/).count();
    const name0 = block ? await itext(p, 'fits-idea-0') : '';
    const foods0 = block ? (await itext(p, 'fits-idea-foods-0')).split(' · ') : [];
    const before = (await dinnerToday(p)).map((e) => e.id);
    await p.getByTestId('fits-idea-add-0').first().click({ timeout: 15000 });
    await p.waitForTimeout(500);
    const after = await dinnerToday(p);
    const added = after.filter((e) => !before.includes(e.id));
    check(
      "ideas: one tap logs the idea's foods to today's dinner",
      added.length === foods0.length && added.length >= 1 && foods0.every((f) => added.some((e) => e.name === f)),
      `${added.map((e) => e.name).join(', ')} | row: ${foods0.join(', ')}`,
    );
    const addLabel = (await p.getByTestId('fits-idea-add-0').first().getAttribute('aria-label')) || '';
    check('ideas: the added row shows its tick and every row stays in its place', addLabel.endsWith(' added') && (await p.getByTestId(/^fits-idea-\d+$/).count()) === rowsBefore && (await itext(p, 'fits-idea-0')) === name0, `${addLabel} | ${rowsBefore} rows`);
    await shot('ideas-added');
    await p.getByTestId('toast-action').first().click({ timeout: 10000 });
    await p.waitForTimeout(500);
    const undone = (await dinnerToday(p)).filter((e) => !before.includes(e.id));
    const labelAfterUndo = (await p.getByTestId('fits-idea-add-0').first().getAttribute('aria-label')) || '';
    check("ideas: Undo removes the idea's foods and the row offers the add again", undone.length === 0 && labelAfterUndo.startsWith('Add '), `${undone.length} left | ${labelAfterUndo.slice(0, 60)}`);
    await ctx.close();

    const over = await openIdeas(1.1);
    check('ideas: over the budget Today shows no ideas chip', (await over.p.getByTestId('today-ideas').count()) === 0);
    await over.p.getByTestId('today-remaining-open').first().click({ timeout: 15000 });
    await over.p.waitForTimeout(500);
    const line = await over.p.getByTestId('fits-over').first().waitFor({ timeout: 10000 }).then(() => itext(over.p, 'fits-over'), () => '');
    check(
      'ideas: over the budget What fits shows one neutral line, "Search all foods" and no list',
      /^Today is [\d,]+ kcal above the budget\. One day does not move the week's trend much\.$/.test(line) &&
        (await over.p.getByTestId('fits-ideas').count()) === 0 &&
        (await over.p.getByTestId('fits-list').count()) === 0 &&
        (await over.p.getByTestId('fits-search').count()) > 0,
      line,
    );
    await over.ctx.close();
  }

  // ------------------------------------------- the toast with the keyboard up (src/ui/Toast.tsx, toastBottom in src/ui/keyboardInset.ts)
  // With the faked keyboard open, a toast must rest 12 px above the footer that rides on the keyboard (food search),
  // or above the keyboard itself where there is no footer (Water's "Other amount"), wholly in what can be seen, and
  // its Undo must work. With the keyboard down it is where it always was: 85 px from the bottom on food search
  // (the footer, 73, and 12), the number recorded before this change at 360, 320 and 390 px.
  const KB = 320;
  const toastBox = () => page.evaluate(() => {
    const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0);
    const t = vis('[data-testid="toast"]');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const a = vis('[data-testid="toast-action"]')?.getBoundingClientRect();
    const f = vis('[data-testid="screen-footer"]')?.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, footerTop: f ? f.top : null, footerBottom: f ? f.bottom : null, visible: window.visualViewport.height, inner: window.innerHeight, width: window.innerWidth, action: a ? { x: a.x + a.width / 2, y: a.y + a.height / 2, w: a.width, h: a.height } : null };
  });
  const fmt = (b) => (b ? `toast ${Math.round(b.top)}-${Math.round(b.bottom)}, footer top ${b.footerTop == null ? '-' : Math.round(b.footerTop)}, keyboard top ${Math.round(b.visible)}, Undo ${b.action ? `${Math.round(b.action.w)} x ${Math.round(b.action.h)}` : 'none'}` : 'no toast');
  await page.goto(`${BASE}/food/search?meal=snack`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await fill('food-search-input', 'apple');
  await page.waitForTimeout(700);
  {
    const c = await cupOf('food-search-input');
    await page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
  }
  await page.evaluate((h) => window.__keyboard(h), KB);
  await page.waitForTimeout(400);
  before = await stored();
  await tap('result-0-add');
  await page.waitForTimeout(300);
  let tb = await toastBox();
  const addedUp = newIn(await stored(), before, 'foodEntries');
  check(
    'keyboard up, food search: the toast rests 12 to 24 px above the footer riding on the keyboard, wholly in view',
    !!tb && tb.footerTop != null && Math.abs(tb.footerBottom - tb.visible) <= 1 && tb.bottom <= tb.footerTop - 12 && tb.bottom >= tb.footerTop - 24 && tb.bottom <= tb.visible && tb.top >= 0 && tb.left >= 0 && tb.right <= tb.width,
    fmt(tb),
  );
  check('keyboard up, food search: the toast carries Undo, a 44 px target', !!tb?.action && tb.action.h >= 44 && tb.action.w >= 44, fmt(tb));
  if (tb?.action) await page.touchscreen.tap(tb.action.x, tb.action.y);
  await page.waitForTimeout(400);
  s = await stored();
  check('keyboard up, food search: Undo on the toast removes the entry', addedUp.length === 1 && !!s.foodEntries[addedUp[0].id]?.deleted, addedUp.map((e) => e.name).join(', ') || 'nothing added');
  await page.evaluate(() => window.__keyboard(0));
  await blur();
  await page.waitForTimeout(400);
  await page.locator('[data-testid^="result-"][data-testid$="-add"]').first().click();
  await page.waitForTimeout(400);
  tb = await toastBox();
  check('keyboard down, food search: the toast is where it was before, 85 px from the bottom (footer 73 + 12)', !!tb && Math.round(tb.inner - tb.bottom) === 85 && Math.round(tb.inner - tb.footerTop) === 73, tb ? `${Math.round(tb.inner - tb.bottom)} px from the bottom, footer ${Math.round(tb.inner - tb.footerTop)} px` : 'no toast');
  for (const e of newIn(await stored(), before, 'foodEntries')) await page.evaluate((id) => window.__healthcal.getState().remove('foodEntries', id), e.id);

  await page.goto(`${BASE}/water`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await fill('water-custom-input', '300');
  {
    const c = await cupOf('water-custom-input');
    await page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
  }
  await page.evaluate((h) => window.__keyboard(h), KB);
  await page.waitForTimeout(400);
  before = await stored();
  await tap('water-custom-add');
  await page.waitForTimeout(300);
  tb = await toastBox();
  const waterUp = newIn(await stored(), before, 'water');
  check(
    'keyboard up, Water (no footer): the toast rests 12 to 24 px above the keyboard, wholly in view',
    !!tb && tb.footerTop == null && tb.bottom <= tb.visible - 12 && tb.bottom >= tb.visible - 24 && tb.top >= 0,
    fmt(tb),
  );
  // Back into the field with the toast still up (a finger at its left end, beside the toast): the toast moves
  // clear of it, since there is room above. On a phone the field keeps the focus through the Add tap
  // (keyboardShouldPersistTaps), so there the toast is clear of it from the start.
  {
    const c = await cupOf('water-custom-input');
    await page.touchscreen.tap(c.x + 12, c.y + c.h / 2);
    await page.waitForTimeout(300);
    const t2 = await toastBox();
    const f2 = await cupOf('water-custom-input');
    const clear = !!t2 && !!f2 && (t2.bottom <= f2.y || t2.top >= f2.y + f2.h);
    check('keyboard up, Water: with the field focused the toast keeps clear of it, above the keyboard', clear && t2.bottom <= t2.visible - 12 && t2.top >= 0 && (await focusedId()) === 'water-custom-input', `${fmt(t2)}, field ${f2 ? `${Math.round(f2.y)}-${Math.round(f2.y + f2.h)}` : '-'}, focus ${await focusedId()}`);
    tb = t2 || tb;
  }
  if (tb?.action) await page.touchscreen.tap(tb.action.x, tb.action.y);
  await page.waitForTimeout(400);
  s = await stored();
  check('keyboard up, Water: Undo on the toast removes the 300 ml', waterUp.length === 1 && Math.round(waterUp[0].ml) === 300 && !!s.water[waterUp[0].id]?.deleted, waterUp.map((w) => `${w.ml} ml`).join(', ') || 'nothing added');
  await page.evaluate(() => window.__keyboard(0));
  await blur();
  await page.waitForTimeout(300);
  // A drink picked in the sheet with the keyboard up: the sheet closes, the toast rests above the keyboard;
  // and a glass tapped while it is still up: the same.
  await page.waitForTimeout(5000);
  await tap('water-search');
  await fill('water-pick-search', 'mocha');
  await page.waitForTimeout(700);
  {
    const c = await cupOf('water-pick-search');
    await page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
  }
  await page.evaluate((h) => window.__keyboard(h), KB);
  await page.waitForTimeout(400);
  await tap('water-pick-b_mocha');
  await page.waitForTimeout(300);
  tb = await toastBox();
  check('keyboard up, drink sheet: the toast after a pick rests 12 to 24 px above the keyboard, wholly in view', !!tb && tb.bottom <= tb.visible - 12 && tb.bottom >= tb.visible - 24 && tb.top >= 0, fmt(tb));
  await page.waitForTimeout(5000);
  before = await stored();
  await tap(`water-add-${gi}`);
  await page.waitForTimeout(300);
  tb = await toastBox();
  const mochaUp = newIn(await stored(), before, 'foodEntries');
  check('keyboard up, Water: the toast after a glass of the picked drink rests 12 to 24 px above the keyboard', !!tb && tb.bottom <= tb.visible - 12 && tb.bottom >= tb.visible - 24 && tb.top >= 0 && mochaUp.length === 1 && mochaUp[0].foodId === 'b_mocha', fmt(tb));
  if (tb?.action) await page.touchscreen.tap(tb.action.x, tb.action.y);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__keyboard(0));
  await blur();
  await page.waitForTimeout(300);

  // ------------------------------------------- the training overview on Train (src/lib/trainingLoad.ts)
  // The demo's five weeks of workouts, in a context of their own (the first-day person has no history). The last 7 days
  // and the 21 before are recomputed here from the published rule (moderate minutes from 3 MET, Hard minutes from 6 MET
  // count double): the line shows the demo's state with the three cups, the sheet opens with those numbers, and a past
  // week keeps the old line, whose info cup opens the same sheet.
  {
    const { buildSeed } = await import(require('url').pathToFileURL(require('path').join(__dirname, 'seed.mjs')).href);
    const seed = buildSeed({ onboarded: true, theme: 'dark' });
    const loadContext = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
    await loadContext.addInitScript((value) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem('healthcal-v1', value);
        window.sessionStorage.setItem('__seeded', '1');
      }
    }, JSON.stringify(seed));
    const lp = await loadContext.newPage();
    lp.on('pageerror', (e) => errors.push(e.message));
    lp.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    const ltext = async (id) => (await lp.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/ /g, ' ').replace(/[⁠‎⁨⁩]/g, '').trim();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const back = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return iso(d); };
    const gmin = (a) => (a.met >= 6 && a.intensity === 'vigorous' ? 2 * a.durationMin : a.met >= 3 ? a.durationMin : 0);
    const acts = Object.values(seed.state.activities).filter((a) => !a.deleted);
    const sumOver = (from, to) => acts.filter((a) => a.date >= back(from) && a.date <= back(to)).reduce((t, a) => t + gmin(a), 0);
    const a7 = sumOver(6, 0);
    const c = sumOver(27, 7) / 3;
    const r = a7 / c;
    const want = r < 0.8 ? 'Lighter than your recent weeks' : r <= 1.3 ? 'About your usual' : 'More than your recent weeks';
    await lp.goto(`${BASE}/train`, { waitUntil: 'networkidle' });
    const hasLine = await lp.getByTestId('train-load').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
    const title = hasLine ? await ltext('train-load-title') : '';
    const label = hasLine ? (await lp.getByTestId('train-load').first().getAttribute('aria-label')) || '' : '';
    check(`training overview: Train's line shows the demo's state (${a7} against ${Math.round(c)}, r ${r.toFixed(2)})`, hasLine && title === want, `${title} | want ${want}`);
    check('training overview: the line is read as "Last 7 days: ..." and the old line is gone', label.startsWith(`Last 7 days: ${want}.`) && (await lp.getByTestId('train-guideline-line').count()) === 0, label);
    await lp.getByTestId('train-load-info').first().click({ timeout: 15000 });
    await lp.waitForTimeout(400);
    const sheetOpen = await lp.getByTestId('train-load-sheet').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    const numbers = sheetOpen ? await ltext('train-load-numbers') : '';
    check('training overview: the sheet opens with the last 7 days and the recent average', sheetOpen && numbers.startsWith(`${a7} guideline minutes in the last 7 days`) && numbers.includes(`recent average of ${Math.round(c)}`), numbers);
    const sheetText = sheetOpen ? await ltext('train-load-sheet') : '';
    check(
      'training overview: the sheet has the three positions, the chart, the counts and the honest sentences, and no coach button',
      (await lp.getByTestId('train-load-mark').count()) > 0 && (await lp.getByTestId('train-load-chart').count()) > 0 && /without a session|each of the last 7 days/.test(await ltext('train-load-counts')) &&
        sheetText.includes('not a measure of injury risk') && sheetText.includes('Training you did not log'),
      sheetText.slice(0, 160),
    );
    await lp.keyboard.press('Escape');
    await lp.waitForTimeout(400);
    // Two weeks back: the card is that week, so the line is "Hard minutes count double" as before, and its info cup opens the overview.
    await lp.goto(`${BASE}/train?week=${back(14)}`, { waitUntil: 'networkidle' });
    await lp.getByTestId('train-this-week').first().waitFor({ timeout: 15000 }).catch(() => {});
    const oldLine = await lp.getByTestId('train-guideline-line').first().innerText({ timeout: 15000 }).catch(() => '');
    check('training overview: a past week keeps the old line and no overview line', oldLine === 'Hard minutes count double' && (await lp.getByTestId('train-load').count()) === 0, oldLine);
    await lp.getByTestId('train-guideline-help').first().click({ timeout: 15000 }).catch(() => {});
    await lp.waitForTimeout(400);
    check('training overview: the old line\'s info cup opens the same sheet', (await lp.getByTestId('train-load-sheet').count()) > 0 && (await ltext('train-load-numbers')).startsWith(`${a7} guideline minutes`));
    await loadContext.close();
  }

  // ------------------------------------------- the coach (src/app/coach.tsx, src/features/coach)
  // Without a backend: the ways in (Train's link, the overview sheet's button, Profile's row), the two questions answered on
  // the phone (the training answer carries the same minutes as the overview sheet, the ideas answer opens What fits), a typed
  // question answered by the needs-an-account line with no request to coach-chat, the under-18 line, a Hebrew question laid
  // out right to left, the footer on the faked keyboard with the two buttons above it, and Clear chat with its Undo.
  {
    const { buildSeed } = await import(require('url').pathToFileURL(require('path').join(__dirname, 'seed.mjs')).href);
    const seed = buildSeed({ onboarded: true, theme: 'dark' });
    const cctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
    await cctx.addInitScript((value) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem('healthcal-v1', value);
        window.sessionStorage.setItem('__seeded', '1');
      }
      // The same controllable keyboard as the first-day run above.
      const fake = new EventTarget();
      let kb = 0;
      const num = (get) => ({ configurable: true, get });
      Object.defineProperties(fake, {
        height: num(() => window.innerHeight - kb), width: num(() => window.innerWidth), offsetTop: num(() => 0), offsetLeft: num(() => 0),
        pageTop: num(() => window.scrollY), pageLeft: num(() => window.scrollX), scale: num(() => 1),
      });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
      window.__keyboard = (h) => { kb = h; fake.dispatchEvent(new Event('resize')); };
    }, JSON.stringify(seed));
    const cp = await cctx.newPage();
    cp.on('pageerror', (e) => errors.push(e.message));
    cp.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    const sent = [];
    cp.on('request', (r) => /coach-chat/.test(r.url()) && sent.push(r.url()));
    const ctext = async (id) => (await cp.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim();
    const ctap = async (id) => { await cp.getByTestId(id).first().click({ timeout: 15000 }); await cp.waitForTimeout(450); };
    const onCoach = () => cp.waitForURL((u) => new URL(u).pathname === '/coach', { timeout: 15000 }).then(() => true, () => false);

    await cp.goto(`${BASE}/train`, { waitUntil: 'networkidle' });
    await ctap('train-coach');
    check('coach: Train\'s "Coach" link opens the coach', await onCoach(), cp.url());
    await cp.goto(`${BASE}/train`, { waitUntil: 'networkidle' });
    const infoId = (await cp.getByTestId('train-load-info').count()) ? 'train-load-info' : 'train-guideline-help';
    await ctap(infoId);
    const sheetNumbers = await ctext('train-load-numbers');
    await ctap('train-load-coach');
    check('coach: the overview sheet\'s "Ask the coach" closes the sheet and opens the coach', (await onCoach()) && (await cp.getByTestId('train-load-sheet').count()) === 0, cp.url());
    await cp.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    await ctap('profile-coach');
    check('coach: Profile\'s "Coach" row opens the coach', await onCoach(), cp.url());
    await cp.waitForTimeout(500);
    check('coach: the fixed line says what it is', (await ctext('coach-line')) === 'AI coach · not medical advice' && (await cp.getByTestId('coach-empty').count()) === 1);

    await ctap('coach-local-training');
    const training = await ctext('coach-local-answer');
    check('coach: "How is my training week?" is answered on the phone with the overview\'s own numbers', training.includes(sheetNumbers.split(',')[0]) && training.includes('From your data, on this phone'), training.slice(0, 160));
    await ctap('coach-local-ideas');
    const ideasText = await ctext('coach-local-answer');
    check('coach: the ideas button is answered on the phone with the meals that fit (or the neutral line)', /Meals that fit|above the budget|Under 150 kcal left/.test(ideasText), ideasText.slice(0, 120));
    await ctap('coach-local-fits');
    check('coach: the ideas answer opens What fits', (await cp.getByTestId('fits-intro').count()) + (await cp.getByTestId('fits-over').count()) > 0);
    await cp.keyboard.press('Escape');
    await cp.waitForTimeout(400);
    check('coach: the phone answers sent nothing', sent.length === 0, `${sent.length} requests`);

    await cp.getByTestId('coach-input').first().fill('How many rest days a week?');
    await ctap('coach-send');
    const noAccount = await ctext('coach-notice');
    check('coach: without an account a typed question gets the needs-an-account line and a sign-in button, and nothing is sent', /needs an account/.test(noAccount) && (await cp.getByTestId('coach-sign-in').count()) === 1 && sent.length === 0, noAccount);
    check('coach: the field is empty again after sending', (await cp.getByTestId('coach-input').first().inputValue()) === '');

    await cp.getByTestId('coach-input').first().fill('כמה ימי מנוחה בשבוע?');
    await ctap('coach-send');
    const dir = await cp.evaluate(() => {
      const box = document.querySelector('[data-testid="coach-question"]');
      const t = box && [...box.querySelectorAll('div')].find((d) => /כמה/.test(d.textContent) && !d.querySelector('div'));
      return t ? getComputedStyle(t).textAlign + '|' + getComputedStyle(t).direction : 'none';
    });
    check('coach: a question that starts with a Hebrew letter is laid out right to left', /^right\|rtl|^right\|/.test(dir), dir);

    // Under 18 (a date of birth changed in Goals): the phone answers, the AI does not, and one neutral line says so.
    const born = await cp.evaluate(() => window.__healthcal.getState().profile.birthDate);
    await cp.evaluate(() => window.__healthcal.getState().setProfile({ birthDate: '2012-04-01' }));
    await cp.getByTestId('coach-input').first().fill('Can you give me a plan?');
    await ctap('coach-send');
    check('coach: under 18 the typed question gets the 18-and-over line and nothing is sent', /18 and over/.test(await ctext('coach-notice')) && sent.length === 0, await ctext('coach-notice'));
    await cp.evaluate((b) => window.__healthcal.getState().setProfile({ birthDate: b }), born);

    // The keyboard: the footer (field and send) sits on it and the two phone buttons stay above the footer.
    await cp.getByTestId('coach-input').first().click();
    await cp.evaluate(() => window.__keyboard(320));
    await cp.waitForTimeout(450);
    const kbm = await cp.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
      const f = vis('[data-testid="screen-footer"]');
      return { visible: window.visualViewport.height, footerTop: f.top, footerBottom: f.bottom, input: vis('[data-testid="coach-input"]').bottom, chip: vis('[data-testid="coach-local-training"]').bottom, line: vis('[data-testid="coach-line"]').top, focus: document.activeElement?.getAttribute('data-testid') };
    });
    check('coach: keyboard (faked, 320 px): the footer rides on it with the field, and the two buttons are above it', Math.abs(kbm.footerBottom - kbm.visible) <= 1 && kbm.input <= kbm.footerBottom && kbm.chip <= kbm.footerTop && kbm.line >= 0 && kbm.focus === 'coach-input', JSON.stringify(kbm));
    await cp.evaluate(() => window.__keyboard(0));
    await cp.waitForTimeout(400);

    // Kept on the phone: a reload keeps the chat; Clear chat empties it and its Undo puts it back.
    await cp.evaluate(() => window.__healthcal.flush && window.__healthcal.flush());
    await cp.reload({ waitUntil: 'networkidle' });
    await cp.waitForTimeout(800);
    const kept = await cp.getByTestId('coach-local-answer').count();
    check('coach: the chat is kept on this phone through a reload', kept === 1 && (await cp.evaluate(() => !!localStorage.getItem('healthcal-coach-history'))));
    await ctap('coach-clear');
    check('coach: Clear chat empties the chat and the stored copy', (await cp.getByTestId('coach-empty').count()) === 1 && (await cp.evaluate(() => localStorage.getItem('healthcal-coach-history'))) === null);
    await ctap('toast-action');
    await cp.waitForTimeout(300);
    check('coach: the Undo of Clear chat puts the chat back', (await cp.getByTestId('coach-local-answer').count()) === 1);
    check('coach: no request ever reached coach-chat without a backend', sent.length === 0);
    await cctx.close();
  }

  // ------------------------------------------- Appearance: the newer looks (src/theme/resolve.ts)
  // A newer look is stored as `look` beside its fallback in `theme` (an older copy shows Light or Dark);
  // the four older choices write `theme` and remove `look`. The page's ground is the palette's own bg,
  // read from src/theme/tokens.ts itself (Node strips its types), so a new colour value needs no edit here.
  {
    const { execFileSync } = require('child_process');
    const grounds = JSON.parse(
      execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', "const t = await import('./src/theme/tokens.ts'); console.log(JSON.stringify(Object.fromEntries(Object.keys(t.PALETTES).map((n) => [n, t.paletteFor(n).bg]))))"], {
        cwd: require('path').join(__dirname, '..', '..'),
      }).toString(),
    );
    const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    const ground = async () => page.evaluate(() => document.body.style.backgroundColor);
    const picked = async (choice) => (await page.getByTestId(`profile-theme-${choice}`).first().getAttribute('aria-checked')) === 'true';
    const look = async (choice, theme, lookName, palette) => {
      const st = (await stored()).settings;
      const bg = await ground();
      check(
        `Appearance: ${choice} stores theme '${theme}'${lookName ? ` and look '${lookName}'` : ' and no look'}, is marked, and the page is on its ground`,
        st.theme === theme && (st.look ?? null) === lookName && (await picked(choice)) && bg === rgb(grounds[palette]),
        `theme ${st.theme}, look ${st.look ?? '-'}, ground ${bg} (want ${rgb(grounds[palette])})`,
      );
    };
    await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    await page.getByTestId('profile-theme-java').first().waitFor({ timeout: 15000 });
    check('Appearance: Profile offers System and the six looks', (await page.locator('[data-testid^="profile-theme-"]').count()) === 7);
    await tap('profile-theme-java');
    await look('java', 'dark', 'java', 'java');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('profile-theme-java').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await look('java', 'dark', 'java', 'java');
    await tap('profile-theme-honey');
    await look('honey', 'light', 'honey', 'honey');
    await tap('profile-theme-butter');
    await look('butter', 'light', 'butter', 'butter');
    await tap('profile-theme-blossom');
    await look('blossom', 'blossom', null, 'blossom');
    // The run's phone is dark, so "Match my phone" draws Dark again, as the first-day flow left it.
    await tap('profile-theme-system');
    await look('system', 'system', null, 'dark');
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
