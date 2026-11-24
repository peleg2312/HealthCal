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
const { toastActionReady } = require('./toastGuard.cjs');

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

  // A toast's action takes no press in its first moments on screen (toastGuard.cjs): every helper below waits for it.
  const tap = async (id) => {
    if (id === 'toast-action') await toastActionReady(page);
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

  // The toast's Undo takes no press in its first 600 ms on screen (TOAST_ACTION_GUARD_MS in src/ui/Toast.tsx), so a
  // quick second tap meant for "+ 250 ml" never undoes the first glass. Timed in the page from the moment the toast's
  // action is drawn to the finger going down on it; these two taps go straight to the button, past toastGuard.cjs.
  {
    // An action toast stays 12 s in a browser (react-native-web reports a screen reader as on), 4.5 s on a phone.
    await page.locator('[data-testid="toast"]').first().waitFor({ state: 'detached', timeout: 16000 });
    await page.evaluate(() => {
      window.__toastAt = null;
      window.__undoDownAt = null;
      new MutationObserver(() => {
        if (window.__toastAt == null && document.querySelector('[data-testid="toast-action"]')) window.__toastAt = performance.now();
      }).observe(document.body, { childList: true, subtree: true });
      document.addEventListener('pointerdown', (e) => e.target instanceof Element && e.target.closest('[data-testid="toast-action"]') && (window.__undoDownAt = performance.now()), { capture: true });
    });
    const glassesBefore = live((await stored()).water).length;
    await page.getByTestId('today-water-250').first().click({ timeout: 15000 });
    await page.waitForFunction(() => window.__toastAt != null, null, { timeout: 5000 });
    const glassesAdded = live((await stored()).water).length;
    const undoAt = async (ms) => {
      await page.waitForFunction((ms) => performance.now() - window.__toastAt >= ms, ms, { polling: 'raf', timeout: 5000 });
      await page.getByTestId('toast-action').first().click({ timeout: 2000 });
      await page.waitForTimeout(120);
      return Math.round(await page.evaluate(() => window.__undoDownAt - window.__toastAt));
    };
    const early = await undoAt(100);
    s = await stored();
    check(
      'toast guard: Undo tapped about 100 ms after the toast appears does nothing (the glass stays, the toast stays)',
      glassesAdded === glassesBefore + 1 && live(s.water).length === glassesAdded && early < 600 && (await page.getByTestId('toast-action').count()) > 0,
      `tapped ${early} ms after the toast appeared, ${glassesBefore} -> ${glassesAdded} -> ${live(s.water).length} glasses`,
    );
    const late = await undoAt(700);
    s = await stored();
    check('toast guard: Undo tapped at 700 ms takes the glass back', late >= 700 && live(s.water).length === glassesBefore, `tapped ${late} ms after the toast appeared, ${live(s.water).length} glasses`);
  }

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
  check('drinks: the toast says what was added and where', addedToast.includes(`Milk, 129 kcal, added to ${mealWord} and 250 ml to Water`), addedToast);
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
  // "250 ml of milk added to Water only" (src/features/drinks/rules.ts), whatever follows it.
  check('drinks: the Water only toast', /\bof milk added to Water only\b/.test(await text('toast')), await text('toast'));
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
  check('diary drinks: the toast names the drink and says both', !!dw && logToast === `Energy drink added to lunch, ${dw.ml} ml to Water`, logToast);
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
  check('diary drinks: with the switch off, no water and the toast as before', newIn(s, before, 'foodEntries').length === 1 && newIn(s, before, 'water').length === 0 && offToast === 'Energy drink added to dinner', offToast);
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
      // The row draws a reference food without the stored capitals (displayFoodName: "Pasta, enriched, cooked" for
      // "Pasta, enriched, COOKED"), so the drawn and stored names are compared through that rule: case aside.
      added.length === foods0.length && added.length >= 1 && foods0.every((f) => added.some((e) => e.name.toLowerCase() === f.toLowerCase())),
      `${added.map((e) => e.name).join(', ')} | row: ${foods0.join(', ')}`,
    );
    const addLabel = (await p.getByTestId('fits-idea-add-0').first().getAttribute('aria-label')) || '';
    check('ideas: the added row shows its tick and every row stays in its place', addLabel.endsWith(' added') && (await p.getByTestId(/^fits-idea-\d+$/).count()) === rowsBefore && (await itext(p, 'fits-idea-0')) === name0, `${addLabel} | ${rowsBefore} rows`);
    await shot('ideas-added');
    await toastActionReady(p, 10000);
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
  if (tb?.action) await toastActionReady(page);
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
  if (tb?.action) await toastActionReady(page);
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
  if (tb?.action) await toastActionReady(page);
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
      'training overview: the sheet has the three positions, the chart, the counts and the honest sentences',
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
  // Without a backend: the way in (the Coach cup first on every tab header, rising as a task screen whose X returns to the
  // same tab, scroll and day, with an unsent question kept), no other way in left (Train's link, Profile's row), the two
  // questions answered on the phone (the training answer carries the same minutes as the overview sheet, the ideas answer
  // opens What fits), the overview sheet's "Ask the coach" arriving already answered (?ask=training), Today's "Ask the
  // coach" beside the coach card's action, the Coach cup as the one accented cup, no "the coach moved" toast in an
  // automated browser that did not ask, a typed question with no backend (the placeholder says typed questions need the
  // app with an account, Send is the outline cup and does nothing, no sign-in is offered, no request to coach-chat), the
  // footer on the faked keyboard under a visible header, and Clear chat (in "What the coach sees") with its Undo. The AI
  // starters, sending after consent, the signed-out Send that opens sign-in, the under-18 line, a Hebrew question laid
  // out right to left and the unread mark need a backend: e2e-backend.cjs.
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
    const ctap = async (id) => { if (id === 'toast-action') await toastActionReady(cp); await cp.getByTestId(id).first().click({ timeout: 15000 }); await cp.waitForTimeout(450); };
    const onCoach = () => cp.waitForURL((u) => new URL(u).pathname === '/coach', { timeout: 15000 }).then(() => true, () => false);
    const onPath = (path) => cp.waitForURL((u) => new URL(u).pathname === path, { timeout: 15000 }).then(() => true, () => false);
    const subtitle = async () => ((await ctext('screen-header')).split('\n').map((l) => l.trim()).filter(Boolean)[1] || '');
    // The tab's own scroll position (the tallest scrolling box, the Screen's ScrollView), moved to `set` when given.
    const scrollBox = (set) =>
      cp.evaluate((to) => {
        const boxes = [...document.querySelectorAll('div')].filter((d) => {
          const o = getComputedStyle(d).overflowY;
          return (o === 'auto' || o === 'scroll') && d.scrollHeight > d.clientHeight + 40 && d.getBoundingClientRect().height > 200;
        });
        const box = boxes.sort((x, y) => y.scrollHeight - x.scrollHeight)[0];
        if (!box) return -1;
        if (to != null) box.scrollTop = to;
        return Math.round(box.scrollTop);
      }, set ?? null);

    // The way in: the Coach cup, first of the three cups on every tab's header.
    for (const tab of ['today', 'diary', 'train', 'progress']) {
      await cp.goto(`${BASE}/${tab === 'today' ? '' : tab}`, { waitUntil: 'networkidle' });
      await cp.getByTestId(`${tab}-coach-open`).first().waitFor({ timeout: 15000 });
      const order = await cp.evaluate((t) => {
        const ids = [`${t}-coach-open`, `${t}-friends`, `${t}-profile`];
        const boxes = ids.map((id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().width > 0)?.getBoundingClientRect());
        if (boxes.some((b) => !b)) return 'missing';
        const header = document.querySelector('[data-testid="tab-header"]').getBoundingClientRect();
        return boxes.map((b) => `${Math.round(b.left)}:${Math.round(b.width)}x${Math.round(b.height)}`).join(' ') + ` h${Math.round(header.height)}`;
      }, tab);
      const xs = order === 'missing' ? [] : order.split(' ').slice(0, 3).map((t) => t.split(':'));
      check(
        `coach: ${tab}'s header has Coach, Friends and the profile tile, 36 px cups 4 px apart, in a 68 px header`,
        xs.length === 3 && xs.every(([, wh]) => wh === '36x36') && Number(xs[1][0]) - Number(xs[0][0]) === 40 && Number(xs[2][0]) - Number(xs[1][0]) === 40 && / h68$/.test(order),
        order,
      );
      check(`coach: ${tab}'s Coach cup is labelled "Coach"`, (await cp.getByTestId(`${tab}-coach-open`).first().getAttribute('aria-label')) === 'Coach');
      const fills = await cp.evaluate((t) => [`${t}-coach-open`, `${t}-friends`].map((id) => { const e = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((x) => x.getBoundingClientRect().width > 0); return e ? getComputedStyle(e).backgroundColor : 'none'; }), tab);
      check(`coach: ${tab}'s Coach cup is the one tinted cup (Friends keeps its plain fill)`, fills[0] !== 'none' && fills[0] !== fills[1], fills.join(' vs '));
    }
    await cp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await cp.waitForTimeout(2600);
    check('coach: no "the coach is now at the top" toast in an automated browser that did not ask for it', !/The coach is now at the top/.test(await cp.evaluate(() => document.body.innerText)) && (await cp.evaluate(() => localStorage.getItem('healthcal.coachMovedSaid'))) === null);
    // Early in the week "Your week is ready" stands in the coach card's place: mark last week's check-in seen so the card shows.
    await cp.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      window.__healthcal.getState().setSettings({ recapSeenWeek: key });
    });
    await cp.getByTestId('today-coach').first().waitFor({ timeout: 10000 }).catch(() => {});
    const coachAction = await cp.locator('[data-testid="today-coach-action"], [data-testid="today-coach-water"], [data-testid="today-coach-repeat"]').count();
    if (!coachAction) {
      check('coach: a coach card with no action of its own gets no "Ask the coach" (nothing is added)', (await cp.getByTestId('today-coach-ask').count()) === 0);
    } else if (await cp.getByTestId('today-coach-ask').count()) {
      const row = await cp.evaluate(() => {
        const a = document.querySelector('[data-testid="today-coach-ask"]').getBoundingClientRect();
        const card = document.querySelector('[data-testid="today-coach"]');
        const other = [...card.querySelectorAll('[data-testid^="today-coach-"]')].find((e) => e.getAttribute('data-testid') !== 'today-coach-ask').getBoundingClientRect();
        return { same: Math.abs(a.top - other.top) < 1 };
      });
      check('coach: Today\'s "Ask the coach" sits in the same row as the coach card\'s action at 360 px', row.same, JSON.stringify(row));
      await ctap('today-coach-ask');
      check('coach: Today\'s "Ask the coach" opens the coach', await onCoach(), cp.url());
      await ctap('header-close');
      await onPath('/');
    } else {
      check('coach: Today shows the coach card with "Ask the coach" beside its action (the demo day at this hour has one)', false, 'today-coach-ask not found');
    }
    check('coach: Train has no "Coach" link in its content any more', (await cp.getByTestId('train-coach').count()) === 0);
    await cp.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
    await cp.getByTestId('profile-goals').first().waitFor({ timeout: 15000 }).catch(() => {});
    check('coach: Profile has no "Coach" row any more', (await cp.getByTestId('profile-coach').count()) === 0);

    await cp.goto(`${BASE}/train`, { waitUntil: 'networkidle' });
    await ctap('train-coach-open');
    check('coach: Train\'s Coach cup opens the coach, before anything is asked', (await onCoach()) && (await cp.getByTestId('coach-empty').count()) === 1, cp.url());
    check('coach: without an account the short line under the title says the answers come from this phone', (await subtitle()) === 'Answers from this phone', await subtitle());
    await ctap('header-close');
    check('coach: its X goes back to Train', await onPath('/train'), cp.url());

    // The diary under the coach is the one that was left: the same day and the same scroll.
    await cp.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
    const yesterdayDate = await cp.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await ctap(`diary-day-${yesterdayDate}`);
    const scrolled = await scrollBox(240);
    await cp.waitForTimeout(300);
    await ctap('diary-coach-open');
    const diaryOpened = await onCoach();
    await ctap('header-close');
    await onPath('/diary');
    await cp.waitForTimeout(400);
    const dayShown = await cp.getByTestId(`diary-day-${yesterdayDate}`).first().getAttribute('aria-selected');
    const scrollAfter = await scrollBox();
    check('coach: from the diary and back with the X, the diary shows the same day at the same scroll', diaryOpened && dayShown === 'true' && scrolled > 0 && Math.abs(scrollAfter - scrolled) <= 2, `day ${dayShown}, scroll ${scrolled} -> ${scrollAfter}`);

    // An unsent question is kept when the coach closes and opens again (memory only, src/features/coach/session.ts).
    await cp.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await ctap('today-coach-open');
    await onCoach();
    await cp.getByTestId('coach-input').first().fill('Half a question');
    await cp.waitForTimeout(200);
    await ctap('header-close');
    await onPath('/');
    await ctap('today-coach-open');
    await onCoach();
    check('coach: an unsent question is still in the field after closing and opening the coach', (await cp.getByTestId('coach-input').first().inputValue()) === 'Half a question');
    await cp.getByTestId('coach-input').first().fill('');
    // No account here: the AI starters are not offered as questions to send; at most the one sign-in tile.
    const aiTiles = await cp.getByTestId('coach-ai-starter-0').count();
    check('coach: without an account no AI starter is offered, and nothing was sent', aiTiles === 0 && sent.length === 0, `${aiTiles} AI tiles, sign-in tile ${await cp.getByTestId('coach-sign-in-starter').count()}`);

    await ctap('coach-local-training');
    const training = await ctext('coach-local-answer');
    check('coach: "How is my training week?" is answered on the phone, marked as from your data', /From your data, on this phone/.test(training), training.slice(0, 160));
    check('coach: the starters leave once the chat has a message today', (await cp.getByTestId('coach-empty').count()) === 0);
    await ctap('coach-local-ideas');
    const ideasText = await ctext('coach-local-answer');
    check('coach: the ideas question (a follow-up chip now) is answered on the phone with what fits (or the neutral line)', /kcal left|above the budget|over|Under 150 kcal left|Meals that fit/.test(ideasText) && /From your data, on this phone/.test(ideasText), ideasText.slice(0, 160));
    await ctap('coach-local-fits');
    check('coach: the ideas answer opens What fits', (await cp.getByTestId('fits-intro').count()) + (await cp.getByTestId('fits-over').count()) > 0);
    await cp.keyboard.press('Escape');
    await cp.waitForTimeout(400);
    check('coach: the phone answers sent nothing', sent.length === 0, `${sent.length} requests`);

    // No backend at all (this build, like the hosted preview): typed questions cannot go anywhere, and the composer says so.
    const placeholder = await cp.getByTestId('coach-input').first().getAttribute('placeholder');
    check('coach: with no backend the field\'s placeholder says typed questions need an account (its short form on a narrow field)', /^(Typed questions need the app with an account|Typing needs an account)$/.test(placeholder || ''), placeholder);
    const before = await cp.locator('[data-testid^="coach-question"], [data-testid^="coach-notice"]').count();
    await cp.getByTestId('coach-input').first().fill('How many rest days a week?');
    await cp.getByTestId('coach-send').first().click({ timeout: 15000, force: true });
    await cp.waitForTimeout(500);
    const after = await cp.locator('[data-testid^="coach-question"], [data-testid^="coach-notice"]').count();
    check(
      'coach: with no backend Send does nothing: no question, no notice, no sign-in, the words stay, nothing is sent',
      after === before && (await cp.getByTestId('coach-sign-in').count()) === 0 && (await onPath('/coach')) && (await cp.getByTestId('coach-input').first().inputValue()) === 'How many rest days a week?' && sent.length === 0,
      `${before} -> ${after} messages, ${cp.url()}`,
    );
    await cp.getByTestId('coach-input').first().fill('');

    // The keyboard: the footer (field and send) sits on it, and the header stays in view above the chat.
    await cp.getByTestId('coach-input').first().click();
    await cp.evaluate(() => window.__keyboard(320));
    await cp.waitForTimeout(450);
    const kbm = await cp.evaluate(() => {
      const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0)?.getBoundingClientRect();
      const f = vis('[data-testid="screen-footer"]');
      const h = vis('[data-testid="screen-header"]');
      return { visible: window.visualViewport.height, footerTop: f.top, footerBottom: f.bottom, input: vis('[data-testid="coach-input"]').bottom, header: h ? h.top : -999, headerBottom: h ? h.bottom : 0, focus: document.activeElement?.getAttribute('data-testid') };
    });
    check('coach: keyboard (faked, 320 px): the footer rides on it with the field, and the header stays in view', Math.abs(kbm.footerBottom - kbm.visible) <= 1 && kbm.input <= kbm.footerBottom && kbm.header >= 0 && kbm.headerBottom <= kbm.footerTop && kbm.focus === 'coach-input', JSON.stringify(kbm));
    await cp.evaluate(() => window.__keyboard(0));
    await cp.waitForTimeout(400);

    // Kept on the phone: a reload keeps the chat; Clear chat (in "What the coach sees") empties it and its Undo puts it back.
    await cp.evaluate(() => window.__healthcal.flush && window.__healthcal.flush());
    await cp.reload({ waitUntil: 'networkidle' });
    await cp.waitForTimeout(800);
    const kept = await cp.getByTestId('coach-local-answer').count();
    check('coach: the chat is kept on this phone through a reload', kept === 1 && (await cp.evaluate(() => !!localStorage.getItem('healthcal-coach-history'))));
    await ctap('coach-about');
    await ctap('coach-clear');
    check('coach: Clear chat, in "What the coach sees", empties the chat and the stored copy', (await cp.getByTestId('coach-empty').count()) === 1 && (await cp.evaluate(() => localStorage.getItem('healthcal-coach-history'))) === null);
    await ctap('toast-action');
    await cp.waitForTimeout(300);
    check('coach: the Undo of Clear chat puts the chat back', (await cp.getByTestId('coach-local-answer').count()) >= 1 && (await cp.getByTestId('coach-empty').count()) === 0);

    // The training overview's "Ask the coach": the sheet closes and the coach rises already answering, with the sheet's own numbers.
    await cp.goto(`${BASE}/train`, { waitUntil: 'networkidle' });
    const infoId = (await cp.getByTestId('train-load-info').count()) ? 'train-load-info' : 'train-guideline-help';
    await ctap(infoId);
    const sheetNumbers = await ctext('train-load-numbers');
    // "Ask the coach" takes no press in its first 450 ms (a double tap on Train's line opens only the sheet).
    await cp.waitForTimeout(300);
    await ctap('train-load-coach');
    const arrived = await onCoach();
    await cp.getByTestId('coach-local-answer').first().waitFor({ timeout: 15000 }).catch(() => {});
    const numbers = (await cp.getByTestId('coach-training-numbers').count()) ? await ctext('coach-training-numbers') : '';
    check(
      'coach: the overview sheet\'s "Ask the coach" closes the sheet and opens the coach already answering, with the sheet\'s own numbers',
      arrived && (await cp.getByTestId('train-load-sheet').count()) === 0 && numbers === sheetNumbers,
      `${cp.url()} | ${numbers} | ${sheetNumbers}`,
    );
    await cp.waitForTimeout(300);
    check('coach: ?ask is cleared once answered, so the arrival asks once', !/ask=/.test(cp.url()), cp.url());
    await ctap('header-close');
    check('coach: its X returns to Train', await onPath('/train'), cp.url());
    check('coach: no request ever reached coach-chat without a backend', sent.length === 0);
    await cctx.close();
  }

  // ------------------------------------------- lists with motion on (AnimatedList and AnimatedItem in src/ui/motion.tsx, FadeRow in src/features/food/rowMotion.tsx)
  // Everything above runs reduced motion. Here motion is on (window.__healthcalMotion), as for a person, and a row added
  // to a list must stay in the layout once its entrance is over. On the web, Reanimated tidies up after a custom Keyframe
  // entrance about five times its length later by pinning the row with position: absolute where it was measured: the row
  // leaves the layout, what holds it closes up and the next rows are drawn over it (the coach's question under its own
  // answer card, a diary row over the next meal, a glass over the section under Water's log). Each step waits past that
  // moment, then reads the boxes: the coach's questions above their answers with no row over another (three questions,
  // then Clear chat and its Undo), a diary row added to lunch, deleted and brought back by Undo, inside lunch's card with
  // the meal cards apart, and a glass added on Water, deleted and brought back, inside its card. No row may be left
  // pinned (inline position absolute from a Reanimated animation).
  {
    const { buildSeed } = await import(require('url').pathToFileURL(require('path').join(__dirname, 'seed.mjs')).href);
    const seed = buildSeed({ onboarded: true, theme: 'blossom' });
    const lctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    await lctx.addInitScript((value) => {
      window.__healthcalMotion = true;
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem('healthcal-v1', value);
        window.sessionStorage.setItem('__seeded', '1');
      }
    }, JSON.stringify(seed));
    const lp = await lctx.newPage();
    lp.on('pageerror', (e) => errors.push(e.message));
    lp.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    // Past Reanimated's tidy-up: five times a row's entrance (220 ms; FadeRow's starts 110 ms late), plus room.
    const SETTLE = 2000;
    const lshot = async (name) => SHOTS && lp.screenshot({ path: `${SHOTS}/${name}.png` });
    const show = (rows) => rows.map((r) => `${r.id} ${r.top}-${r.bottom}`).join(', ');
    // Rows in page order, each below the one before (1 px of rounding allowed).
    const inOrder = (rows) => rows.every((r, i) => i === 0 || rows[i - 1].bottom <= r.top + 1);
    const rowBoxes = (selector, pattern) =>
      lp.evaluate(
        ([s, p]) =>
          [...document.querySelectorAll(s)]
            .filter((e) => new RegExp(p).test(e.getAttribute('data-testid') || '') && e.getBoundingClientRect().height > 0)
            .map((e) => {
              const r = e.getBoundingClientRect();
              return { id: e.getAttribute('data-testid'), top: Math.round(r.top), bottom: Math.round(r.bottom) };
            }),
        [selector, pattern],
      );
    // Rows that do not lie inside the card that holds them (the nearest ancestor drawing an edge).
    const outsideCard = (pattern) =>
      lp.evaluate((p) => {
        const out = [];
        for (const e of document.querySelectorAll('[data-testid]')) {
          if (!new RegExp(p).test(e.getAttribute('data-testid')) || e.getBoundingClientRect().height === 0) continue;
          let card = e.parentElement;
          while (card && parseFloat(getComputedStyle(card).borderTopWidth) < 1) card = card.parentElement;
          if (!card) continue;
          const r = e.getBoundingClientRect();
          const c = card.getBoundingClientRect();
          if (r.top < c.top - 1 || r.bottom > c.bottom + 1) out.push(`${e.getAttribute('data-testid')} ${Math.round(r.top)}-${Math.round(r.bottom)} in a card ${Math.round(c.top)}-${Math.round(c.bottom)}`);
        }
        return out;
      }, pattern);
    // Elements a Reanimated animation left with an inline position: absolute (a leaving row's stand-in is gone by now).
    const pinned = () => lp.evaluate(() => [...document.querySelectorAll('div')].filter((e) => e.style.position === 'absolute' && /^REA-/.test(e.style.animationName || '') && !e.isDummy).length);
    const today = await lp.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // A tap that reports instead of throwing, so one stuck row does not hide what the later steps find.
    const ltap = async (id, what) => {
      if (id === 'toast-action') await toastActionReady(lp, 8000).catch(() => {});
      const ok = await lp.getByTestId(id).first().click({ timeout: 8000 }).then(() => true, () => false);
      if (!ok) check(`lists with motion: ${what} can be tapped`, false, id);
      return ok;
    };
    const pinnedLine = async () => `${await pinned()} pinned`;

    // The coach: a question and its answer are two rows; three questions, then Clear chat and its Undo.
    await lp.goto(`${BASE}/coach`, { waitUntil: 'networkidle' });
    await lp.getByTestId('coach-local-training').first().waitFor({ timeout: 15000 });
    check('lists with motion: the page runs with animation on', (await lp.evaluate(() => typeof window.__healthcalMotionOn === 'function' && window.__healthcalMotionOn())) === true);
    const chat = async () => rowBoxes('[data-testid="coach-chat"] [data-testid]', '^coach-(question|local-answer)(-\\d+)?$');
    const questionsFirst = (rows) => rows.length % 2 === 0 && rows.every((r, i) => r.id.startsWith(i % 2 ? 'coach-local-answer' : 'coach-question'));
    for (const [n, ask] of [[1, 'coach-local-training'], [2, 'coach-local-ideas'], [3, 'coach-local-training']]) {
      await ltap(ask, `question ${n}`);
      await lp.waitForTimeout(SETTLE);
      const rows = await chat();
      check(`lists with motion: after question ${n}, each coach question sits above its answer and no row lies over another`, rows.length === 2 * n && questionsFirst(rows) && inOrder(rows), show(rows));
    }
    await lshot('e2e-lists-motion-coach');
    check('lists with motion: no coach row is left pinned by its entrance', (await pinned()) === 0, await pinnedLine());
    if ((await ltap('coach-about', 'the coach\'s info cup')) && (await ltap('coach-clear', 'Clear chat')) && (await ltap('toast-action', "Clear chat's Undo"))) {
      await lp.waitForTimeout(SETTLE);
      const back = await chat();
      check('lists with motion: after Clear chat and its Undo, the coach rows are back in order with none over another', back.length === 6 && questionsFirst(back) && inOrder(back) && (await pinned()) === 0, `${show(back)}; ${await pinnedLine()}`);
    }

    // The diary: a row added to lunch while the diary is on screen (written to the store: this is about the list, not
    // logging), deleted, then brought back by Undo.
    await lp.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
    await lp.getByTestId('meal-card-lunch').first().waitFor({ timeout: 15000 });
    await lp.waitForTimeout(600);
    const addedId = await lp.evaluate((day) => {
      const s = window.__healthcal.getState();
      const from = Object.values(s.foodEntries).find((e) => !e.deleted && !e.via);
      const { id, updatedAt, ...rest } = from;
      return s.upsert('foodEntries', { ...rest, date: day, meal: 'lunch' }).id;
    }, today);
    const entryRows = '^entry-(?!delete-|in-water-)';
    const diaryStep = async (what) => {
      await lp.waitForTimeout(SETTLE);
      const cards = await rowBoxes('[data-testid^="meal-card-"]', '^meal-card-');
      const rows = await rowBoxes('[data-testid^="entry-"]', entryRows);
      const outside = await outsideCard(entryRows);
      check(
        `lists with motion: diary, ${what}: the rows in order inside their meal's card, the cards apart`,
        inOrder(cards) && inOrder(rows) && outside.length === 0 && (await pinned()) === 0,
        outside.length ? outside.join('; ') : `${show(cards)}; ${show(rows)}; ${await pinnedLine()}`,
      );
    };
    await lp.getByTestId(`entry-${addedId}`).first().scrollIntoViewIfNeeded().catch(() => {});
    await diaryStep('a row added to lunch');
    await lshot('e2e-lists-motion-diary');
    if (await ltap(`entry-delete-${addedId}`, "the added row's delete")) {
      await diaryStep('the row deleted');
      if (await ltap('toast-action', "the delete's Undo")) {
        await diaryStep("the row back from the delete's Undo");
        check('lists with motion: diary, the Undo brought the row back', (await lp.getByTestId(`entry-${addedId}`).count()) === 1);
      }
    }

    // Water: a glass added, deleted, then brought back by Undo.
    await lp.goto(`${BASE}/water`, { waitUntil: 'networkidle' });
    await lp.getByTestId('water-add-0').first().waitFor({ timeout: 15000 });
    await lp.waitForTimeout(600);
    const waterRows = '^water-entry-\\d+$';
    const waterStep = async (what) => {
      await lp.waitForTimeout(SETTLE);
      const rows = await rowBoxes('[data-testid^="water-entry-"]', waterRows);
      const outside = await outsideCard(waterRows);
      check(`lists with motion: Water, ${what}: the log's rows in order inside their card`, rows.length > 0 && inOrder(rows) && outside.length === 0 && (await pinned()) === 0, outside.length ? outside.join('; ') : `${show(rows)}; ${await pinnedLine()}`);
      return rows.length;
    };
    await ltap('water-add-0', 'a glass size');
    const glasses = await waterStep('a glass added');
    await lp.getByTestId('water-entry-0').first().scrollIntoViewIfNeeded().catch(() => {});
    await lshot('e2e-lists-motion-water');
    if (await ltap(`water-delete-${glasses - 1}`, "the last glass's delete")) {
      await waterStep('the glass deleted');
      if (await ltap('toast-action', "the delete's Undo")) check('lists with motion: Water, the Undo brought the glass back', (await waterStep("the glass back from the delete's Undo")) === glasses);
    }
    await lctx.close();
  }

  // ------------------------------------------- saving meals: from the AI review and from the diary (builder one)
  // (src/features/ai/SaveMealRow.tsx, logAndSaveMeal in src/features/food/log.ts, src/features/food/saveHint.ts,
  // SaveMealSheet.tsx.) Each part in a fresh seeded demo context at 360 x 740, so no step leans on another's data.
  // The review's "Also save as a meal" is off on every visit; on, its name follows the dish and the button says
  // "Add to lunch and save"; the name field in the footer rides above the faked keyboard; one tap logs and saves
  // exactly what was logged (ranges, confidence and source kept) with one toast that names the meal, whose Undo
  // takes back both. The saved estimate is logged again from /food/meals as an estimate, with no request to the
  // AI (the stand-in backend's allowance is proven unchanged in e2e-backend.cjs). The sample offers no switch.
  // The diary's one-time hint: on one card, opens the save sheet, gone for good after a save or "Not now", never in
  // an automated browser that did not ask. A long press on a diary row stars its food, with Undo, and never opens it.
  {
    const { buildSeed } = await import(require('url').pathToFileURL(require('path').join(__dirname, 'seed.mjs')).href);
    const seed = JSON.stringify(buildSeed({ onboarded: true, theme: 'dark' }));
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const open = async ({ hint = false } = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
      await ctx.addInitScript(
        ([value, hint]) => {
          if (!window.sessionStorage.getItem('__seeded')) {
            window.localStorage.setItem('healthcal-v1', value);
            window.sessionStorage.setItem('__seeded', '1');
          }
          if (hint) window.__healthcalSaveHint = true;
          const fake = new EventTarget();
          let kb = 0;
          const num = (get) => ({ configurable: true, get });
          Object.defineProperties(fake, {
            height: num(() => window.innerHeight - kb), width: num(() => window.innerWidth), offsetTop: num(() => 0), offsetLeft: num(() => 0),
            pageTop: num(() => window.scrollY), pageLeft: num(() => window.scrollX), scale: num(() => 1),
          });
          Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
          window.__keyboard = (h) => { kb = h; fake.dispatchEvent(new Event('resize')); };
        },
        [seed, hint],
      );
      const p = await ctx.newPage();
      const requests = [];
      p.on('request', (r) => requests.push(r.url()));
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
      return { ctx, p, requests };
    };
    const ptext = async (p, id) => (await p.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/ /g, ' ').replace(/[⁠‎⁨⁩]/g, '').trim();
    const pstate = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())));
    const liveOf = (map) => Object.values(map).filter((r) => !r.deleted);
    const ptap = async (p, id) => {
      if (id === 'toast-action') await toastActionReady(p);
      await p.getByTestId(id).first().click({ timeout: 15000 });
      await p.waitForTimeout(350);
    };
    const review = async (p) => {
      await p.goto(`${BASE}/food/photo?mode=text&meal=lunch&demoLive=1`, { waitUntil: 'networkidle' });
      await p.getByTestId('ai-description').first().fill('Chicken, rice and salad', { timeout: 20000 });
      await ptap(p, 'ai-analyse');
      await p.getByTestId('ai-add-to-diary').first().waitFor({ timeout: 15000 });
      await p.waitForTimeout(300);
    };
    const switchOn = async (p) => (await p.getByTestId('ai-save-meal').first().getAttribute('aria-checked')) === 'true';
    const pick = (e) => ({ name: e.name, grams: e.grams, quantity: e.quantity, servingLabel: e.servingLabel, nutrients: e.nutrients, kcalRange: e.kcalRange ?? null, confidence: e.confidence ?? null, source: e.source });

    // 1. The review: off, on, the name and the button, the field above the faked keyboard, one act, its Undo.
    {
      const { ctx, p } = await open();
      await review(p);
      check('save meals: the review offers "Also save as a meal", off, with no name field', (await p.getByTestId('ai-save-meal').count()) === 1 && !(await switchOn(p)) && (await p.getByTestId('ai-save-meal-name').count()) === 0 && (await ptext(p, 'ai-add-to-diary')) === 'Add to lunch');
      // The footer's geometry: the field and the switch, the footer, the first item's name (scrolled to the top).
      const footerGeo = () =>
        p.evaluate(() => {
          const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0);
          const box = (sel) => {
            const r = vis(sel)?.getBoundingClientRect();
            return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null;
          };
          return { footer: box('[data-testid="screen-footer"]'), field: box('[data-testid="ai-save-meal-name"]'), toggle: box('[data-testid="ai-save-meal"]'), words: box('[data-testid="ai-save-meal-words"]'), item: box('[data-testid="ai-item-0-name"]'), vh: window.innerHeight };
        });
      const offGeo = await footerGeo();
      // The words beside the switch take a finger's tap too (ai-save-meal-words).
      await ptap(p, 'ai-save-meal-words');
      const onGeo = await footerGeo();
      const oneRow = (g) => !!g.field && !!g.toggle && !g.words && Math.abs((g.field.top + g.field.bottom) / 2 - (g.toggle.top + g.toggle.bottom) / 2) <= 2 && g.field.right < g.toggle.left;
      check(
        'save meals: a tap on the words turns it on; the name field and the switch share one row (field left, switch right), the footer only a field taller than the row it replaced',
        (await switchOn(p)) && !!offGeo.words && oneRow(onGeo) && onGeo.footer.height - offGeo.footer.height <= 50 - 36 + 1,
        `footer ${Math.round(offGeo.footer?.height)} -> ${Math.round(onGeo.footer?.height)}, field ${JSON.stringify(onGeo.field && [Math.round(onGeo.field.left), Math.round(onGeo.field.top), Math.round(onGeo.field.right)])}, switch ${JSON.stringify(onGeo.toggle && [Math.round(onGeo.toggle.left), Math.round(onGeo.toggle.top)])}`,
      );
      check('save meals: with it on, the first item is in view above the footer at 360 x 740', !!onGeo.item && onGeo.item.top >= 0 && onGeo.item.bottom <= onGeo.footer.top, `item ${Math.round(onGeo.item?.top)}-${Math.round(onGeo.item?.bottom)}, footer top ${Math.round(onGeo.footer.top)}`);
      // At 320 x 640 the review's own cards (the total, the oil question with its chips on two lines) already
      // reach below where even a button-only footer starts, so the first item is a scroll away whatever the
      // footer does: what the switch may cost there is the same one row, no taller than at 360.
      await p.setViewportSize({ width: 320, height: 640 });
      await p.waitForTimeout(400);
      const small = await footerGeo();
      await ptap(p, 'ai-save-meal');
      const smallOff = await footerGeo();
      await ptap(p, 'ai-save-meal');
      check(
        'save meals: at 320 x 640 still one row, and the switch adds no more to the footer than at 360',
        oneRow(small) && !!smallOff.words && small.footer.height - smallOff.footer.height <= 50 - 36 + 1 && Math.abs(small.footer.height - onGeo.footer.height) <= 1,
        `footer ${Math.round(smallOff.footer?.height)} -> ${Math.round(small.footer?.height)} (360: ${Math.round(onGeo.footer.height)}), first item at ${Math.round(small.item?.top)}, footer top ${Math.round(small.footer?.top)}`,
      );
      await p.setViewportSize({ width: 360, height: 740 });
      await p.waitForTimeout(400);
      const dish = await ptext(p, 'ai-dish');
      const offered = await p.getByTestId('ai-save-meal-name').first().inputValue({ timeout: 10000 }).catch(() => '');
      check('save meals: on, the name offered is the dish and the button says "Add to lunch and save"', (await switchOn(p)) && offered === dish && (await ptext(p, 'ai-add-to-diary')) === 'Add to lunch and save', `"${offered}" / "${dish}"`);
      // The name field sits in the footer: with the faked keyboard up, the footer rides on it and the field is in view.
      const field = await p.getByTestId('ai-save-meal-name').first().boundingBox();
      await p.touchscreen.tap(field.x + field.width / 2, field.y + field.height / 2);
      await p.evaluate(() => window.__keyboard(320));
      await p.waitForTimeout(400);
      const kb = await p.evaluate(() => {
        const vis = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().height > 0);
        const f = vis('[data-testid="screen-footer"]').getBoundingClientRect();
        const i = vis('[data-testid="ai-save-meal-name"]').getBoundingClientRect();
        return { visible: window.visualViewport.height, footerBottom: f.bottom, fieldTop: i.top, fieldBottom: i.bottom, focused: document.activeElement?.getAttribute('data-testid') };
      });
      check('save meals: keyboard (faked, 320 px): the footer with the name field sits on it, the field in view', Math.abs(kb.footerBottom - kb.visible) <= 1 && kb.fieldTop >= 0 && kb.fieldBottom <= kb.visible && kb.focused === 'ai-save-meal-name', `visible ${Math.round(kb.visible)}, footer bottom ${Math.round(kb.footerBottom)}, field ${Math.round(kb.fieldTop)}-${Math.round(kb.fieldBottom)}, focus ${kb.focused}`);
      await p.evaluate(() => window.__keyboard(0));
      await p.getByTestId('ai-save-meal-name').first().fill('My chicken lunch');
      // Off and on again keeps the typed name.
      await ptap(p, 'ai-save-meal');
      await ptap(p, 'ai-save-meal');
      check('save meals: the switch off and on again keeps the typed name', (await p.getByTestId('ai-save-meal-name').first().inputValue()) === 'My chicken lunch');
      const before = await pstate(p);
      const entriesBefore = new Set(Object.keys(before.foodEntries));
      const mealsBefore = new Set(liveOf(before.savedMeals).map((m) => m.id));
      await ptap(p, 'ai-add-to-diary');
      await p.waitForTimeout(600);
      const after = await pstate(p);
      const added = liveOf(after.foodEntries).filter((e) => !entriesBefore.has(e.id));
      const saved = liveOf(after.savedMeals).filter((m) => !mealsBefore.has(m.id));
      const sorted = (list) => list.map((x) => JSON.stringify(pick(x))).sort();
      const same = saved.length === 1 && JSON.stringify(sorted(saved[0].items)) === JSON.stringify(sorted(added));
      check('save meals: one tap logs the estimate to lunch and saves exactly that as "My chicken lunch"', added.length >= 3 && added.every((e) => e.meal === 'lunch' && e.date === todayIso && Array.isArray(e.kcalRange)) && saved.length === 1 && saved[0].name === 'My chicken lunch' && same, `${added.length} entries, ${saved.length} meal(s)`);
      check('save meals: the saved items keep the AI source, range and confidence', saved.length === 1 && saved[0].items.every((it) => Array.isArray(it.kcalRange) && typeof it.confidence === 'number') && saved[0].items.some((it) => it.source === 'ai'));
      const toastText = (await ptext(p, 'toast').catch(() => '')).replace(/\s*Undo$/, '');
      check('save meals: one toast names the meal', toastText === `${added.length} items added to lunch, saved as "My chicken lunch"`, toastText);
      await ptap(p, 'toast-action');
      const undone = await pstate(p);
      check('save meals: its Undo takes back the entries and the saved meal', added.every((e) => undone.foodEntries[e.id].deleted) && saved.every((m) => undone.savedMeals[m.id].deleted));
      // A new visit: the switch is off again (never remembered).
      await review(p);
      check('save meals: the switch is off again on the next visit', !(await switchOn(p)));
      await ctx.close();
    }

    // 1b. The toast always names the meal, as much of it as two lines hold at the window's width: yesterday's
    // breakfast, no water, a 27-letter Hebrew name, at 320 px (shortened at a word with "…") and at 360 px (more of it).
    let shown320 = 0;
    for (const width of [320, 360]) {
      const { ctx, p } = await open();
      await p.setViewportSize({ width, height: 740 });
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const ydayIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      await p.goto(`${BASE}/food/photo?mode=text&meal=breakfast&date=${ydayIso}&demoLive=1`, { waitUntil: 'networkidle' });
      await p.getByTestId('ai-description').first().fill('Shakshuka with two eggs and bread', { timeout: 20000 });
      await ptap(p, 'ai-analyse');
      await p.getByTestId('ai-add-to-diary').first().waitFor({ timeout: 15000 });
      await ptap(p, 'ai-save-meal');
      const hebrew = 'שקשוקה של שבת בבוקר עם לחם וטחינה';
      await p.getByTestId('ai-save-meal-name').first().fill(hebrew);
      await ptap(p, 'ai-add-to-diary');
      await p.getByTestId('toast').first().waitFor({ timeout: 10000 });
      await p.waitForTimeout(300);
      const msg = (await ptext(p, 'toast')).replace(/\s*Undo$/, '');
      // The toast is its 13 + 11 px padding around 18 px lines (Toast.tsx): two lines are 60 px.
      const lines = await p.evaluate(() => {
        const t = [...document.querySelectorAll('[data-testid="toast"]')].find((e) => e.getBoundingClientRect().height > 0);
        return t ? Math.round((t.getBoundingClientRect().height - 24) / 18) : 0;
      });
      const shown = (msg.match(/saved as "([^"]*)"/) || [])[1] || '';
      const letters = shown.replace(/[^\p{L}]/gu, '');
      check(
        `save meals: the toast names the meal at ${width} px (yesterday's breakfast, a 27-letter Hebrew name): shortened at a word with "…", in two lines`,
        /^\d+ items? added to yesterday's breakfast, saved as "/.test(msg) && letters.length >= 4 && hebrew.replace(/\s+/g, ' ').startsWith(shown.replace(/…$/, '')) && lines > 0 && lines <= 2,
        `"${msg}" (${lines} lines)`,
      );
      if (width === 320) shown320 = letters.length;
      else check('save meals: at 360 px the toast keeps more of the name than at 320 px', letters.length > shown320, `${shown320} then ${letters.length} letters`);
      await ctx.close();
    }

    // 2. The saved estimate logged again from /food/meals is still an estimate, and nothing is asked of the AI.
    {
      const { ctx, p, requests } = await open();
      await review(p);
      await ptap(p, 'ai-save-meal');
      await p.getByTestId('ai-save-meal-name').first().fill('Estimate to repeat');
      await ptap(p, 'ai-add-to-diary');
      await p.waitForTimeout(600);
      await p.goto(`${BASE}/food/meals?meal=dinner`, { waitUntil: 'networkidle' });
      await p.getByTestId('saved-meal-card-0').first().waitFor({ timeout: 15000 });
      const cards = await p.locator('[data-testid^="saved-meal-card-"]').allInnerTexts();
      const i = cards.findIndex((t) => t.replace(/[⁠‎⁨⁩]/g, '').includes('Estimate to repeat'));
      check('save meals: the saved estimate is on /food/meals, its total with "~"', i >= 0 && /~\s?[\d,]+/.test(cards[i] || ''), (cards[i] || '').split('\n').slice(0, 3).join(' | '));
      const before = new Set(Object.keys((await pstate(p)).foodEntries));
      if (i >= 0) {
        await ptap(p, `saved-meal-log-${i}`);
        await ptap(p, 'log-meal-confirm');
        await p.waitForTimeout(500);
      }
      const again = liveOf((await pstate(p)).foodEntries).filter((e) => !before.has(e.id));
      check('save meals: logged again (dinner), every line is still an estimate with its range', again.length >= 3 && again.every((e) => e.meal === 'dinner' && Array.isArray(e.kcalRange)), `${again.length} entries`);
      check('save meals: no request went to the AI while saving and logging the saved estimate', !requests.some((u) => /analyze-food/.test(u)));
      await ctx.close();
    }

    // 3. The sample (no account) offers no switch.
    {
      const { ctx, p } = await open();
      await p.goto(`${BASE}/food/photo?mode=text&meal=lunch`, { waitUntil: 'networkidle' });
      await p.getByTestId('ai-description').first().fill('Chicken, rice and salad', { timeout: 20000 });
      await ptap(p, 'ai-analyse');
      await p.getByTestId('ai-add-to-diary').first().waitFor({ timeout: 15000 });
      check('save meals: the sample offers no "Also save as a meal"', (await p.getByTestId('ai-save-meal').count()) === 0 && (await ptext(p, 'ai-add-to-diary')) === 'Add sample to lunch');
      await ctx.close();
    }

    // 4. The diary's one-time hint.
    {
      const plain = await open();
      await plain.p.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
      await plain.p.getByTestId('meal-card-breakfast').first().waitFor({ timeout: 20000 });
      await plain.p.waitForTimeout(800);
      check('save hint: an automated browser that did not ask never sees it', (await plain.p.getByTestId('diary-save-hint').count()) === 0);
      await plain.ctx.close();

      const { ctx, p } = await open({ hint: true });
      await p.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
      const shown = await p.getByTestId('diary-save-hint').first().waitFor({ timeout: 15000 }).then(() => true, () => false);
      const where = await p.evaluate(() => {
        const hints = [...document.querySelectorAll('[data-testid="diary-save-hint"]')];
        return { count: hints.length, card: hints[0]?.closest('[data-testid^="meal-card-"]')?.getAttribute('data-testid') ?? null };
      });
      const st = await pstate(p);
      const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
      const want = meals.find((m) => liveOf(st.foodEntries).filter((e) => e.date === todayIso && e.meal === m && e.via !== 'water').length >= 2);
      check('save hint: on exactly one card, the first meal with two foods', shown && where.count === 1 && where.card === `meal-card-${want}`, `${where.card} (want meal-card-${want})`);
      check('save hint: it says "Save <meal> as a meal" and offers "Not now"', (await ptext(p, 'diary-save-hint')) === `Save ${want} as a meal` && (await ptext(p, 'diary-save-hint-close')) === 'Not now');
      const mealsBefore = liveOf(st.savedMeals).length;
      await ptap(p, 'diary-save-hint');
      const name = await p.getByTestId('save-meal-name').first().inputValue({ timeout: 10000 }).catch(() => '');
      const sheetLine = await ptext(p, 'save-meal-line').catch(() => '');
      // The demo's first meal of two foods has three: the name offered is those foods, so they are not written again in bold.
      const foodsShown = await p.getByTestId('save-meal-foods').count();
      check(
        'save hint: a tap opens the save sheet with a name offered, its line honest ("Find it any time in Saved meals."), the foods not repeated in bold over the same name',
        name.length > 0 && /^\d+ items? · ~?[\d,]+ kcal\. Find it any time in Saved meals\.$/.test(sheetLine) && (foodsShown === 0 || (await ptext(p, 'save-meal-foods')) !== name) && (/^My /.test(name) || foodsShown === 0),
        `"${name}" | "${sheetLine}" | bold foods line ${foodsShown}`,
      );
      await ptap(p, 'save-meal-confirm');
      await p.waitForTimeout(500);
      check('save hint: Save meal keeps it as a saved meal and the hint is gone', liveOf((await pstate(p)).savedMeals).length === mealsBefore + 1 && (await p.getByTestId('diary-save-hint').count()) === 0);
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByTestId('meal-card-breakfast').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(800);
      check('save hint: still gone after a restart', (await p.getByTestId('diary-save-hint').count()) === 0);
      await ctx.close();

      const second = await open({ hint: true });
      await second.p.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
      await second.p.getByTestId('diary-save-hint').first().waitFor({ timeout: 15000 });
      const savedBefore = liveOf((await pstate(second.p)).savedMeals).length;
      await ptap(second.p, 'diary-save-hint-close');
      const gone = (await second.p.getByTestId('diary-save-hint').count()) === 0;
      await second.p.reload({ waitUntil: 'networkidle' });
      await second.p.getByTestId('meal-card-breakfast').first().waitFor({ timeout: 20000 });
      await second.p.waitForTimeout(800);
      check('save hint: "Not now" hides it for good and saves nothing', gone && (await second.p.getByTestId('diary-save-hint').count()) === 0 && liveOf((await pstate(second.p)).savedMeals).length === savedBefore);
      await second.ctx.close();
    }

    // 5. A long press on a diary row stars its food (a real touch held 800 ms), never opens the row; Undo.
    {
      const { ctx, p } = await open();
      await p.goto(`${BASE}/diary`, { waitUntil: 'networkidle' });
      await p.locator('[data-testid^="entry-delete-"]').first().waitFor({ timeout: 20000 });
      // The first row whose food is not a favourite yet.
      const st0 = await pstate(p);
      const starred0 = new Set(liveOf(st0.favorites).map((f) => f.food.id));
      const ids = await p.locator('[data-testid^="entry-delete-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').slice('entry-delete-'.length)));
      const id = ids.find((i) => st0.foodEntries[i]?.food && !starred0.has(st0.foodEntries[i].food.id));
      const entry = st0.foodEntries[id];
      const row = p.getByTestId(`entry-${id}`).first();
      await row.scrollIntoViewIfNeeded();
      const box = await row.boundingBox();
      const cdp = await ctx.newCDPSession(p);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await p.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(600);
      const favs = liveOf((await pstate(p)).favorites).map((f) => f.food.id);
      const msg = (await ptext(p, 'toast').catch(() => '')).replace(/\s*Undo$/, '');
      const selected = await p.evaluate(() => String(window.getSelection?.() ?? ''));
      check(
        'long press: a diary row stars its food with a toast, stays on the diary and selects no text',
        !!entry?.food && favs.includes(entry.food.id) && msg === `Added to favourites: ${entry.food.name}` && new URL(p.url()).pathname === '/diary' && selected === '',
        `${msg} | ${new URL(p.url()).pathname} | selection "${selected.slice(0, 30)}"`,
      );
      await ptap(p, 'toast-action');
      check('long press: Undo takes the star back', !liveOf((await pstate(p)).favorites).some((f) => f.food.id === entry?.food?.id));

      // A quick add has no food: a press and hold on it does nothing at all (it never ends as a tap that opens the row).
      const quickId = await p.evaluate((date) => {
        const rec = window.__healthcal.getState().upsert('foodEntries', {
          date,
          meal: 'snack',
          name: 'Office cake',
          emoji: '⚡',
          source: 'quick',
          verified: false,
          servingLabel: '1 serving',
          quantity: 1,
          grams: 0,
          nutrients: { kcal: 320, protein: 4, carbs: 40, fat: 16 },
          loggedAt: new Date().toISOString(),
        });
        return rec.id;
      }, todayIso);
      const quickRow = p.getByTestId(`entry-${quickId}`).first();
      await quickRow.waitFor({ timeout: 10000 });
      await quickRow.scrollIntoViewIfNeeded();
      await p.waitForTimeout(300);
      const qb = await quickRow.boundingBox();
      const favsBefore = liveOf((await pstate(p)).favorites).length;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: qb.x + qb.width / 2, y: qb.y + qb.height / 2 }] });
      await p.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(800);
      check(
        'long press: on a quick add (no food) it does nothing: stays on the diary, opens nothing, stars nothing',
        new URL(p.url()).pathname === '/diary' && liveOf((await pstate(p)).favorites).length === favsBefore,
        `${new URL(p.url()).pathname}${new URL(p.url()).search}`,
      );
      await ctx.close();
    }
  }

  // ------------------------------------------- favourites: foods and saved meals (builder two)
  // (src/features/food/favorites.ts, favoriteActions.ts, FavoriteStar.tsx, SavedMealRow.tsx, searchTab.ts, QuickLogSheet.)
  // Each part in a fresh seeded demo context at 360 x 740 (seed knobs favoriteMeal and savedEstimate), so no step leans
  // on another's data and every card is found by its name. A meal's star on /food/meals writes `favoriteAt` and keeps
  // every other field, its Undo takes it away again, the card keeps its place until the next visit and then leads; the
  // star is filled primaryInk, never amber. Search's Favourites tab lists the starred meal (with its star and Log) above
  // the foods, and logging it from there adds its items; search opens on the tab chosen last. The + sheet leads with the
  // favourite meals inside the first view, a saved estimate reads "~", and one tap logs it with its ranges. A long press
  // on a food row or a saved-meal row stars it with a toast and Undo and never opens it. "Save lunch as a meal" in
  // Saved meals saves the day's lunch and then goes, because that lunch is now a saved meal.
  {
    // This file's folder from the command line (the lint setup does not define __dirname).
    const here = require('path').dirname(require('path').resolve(process.argv[1]));
    const { buildSeed } = await import(require('url').pathToFileURL(require('path').join(here, 'seed.mjs')).href);
    const { execFileSync } = require('child_process');
    const ink = JSON.parse(
      execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', "const t = await import('./src/theme/tokens.ts'); console.log(JSON.stringify({ ink: t.paletteFor('dark').primaryInk, warning: t.paletteFor('dark').warning }))"], {
        cwd: require('path').join(here, '..', '..'),
      }).toString(),
    );
    const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const yesterday = ymd(new Date(Date.now() - 86400000));
    const favOpen = async (values = {}) => {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
      await ctx.addInitScript((value) => {
        if (!window.sessionStorage.getItem('__seeded')) {
          window.localStorage.setItem('healthcal-v1', value);
          window.sessionStorage.setItem('__seeded', '1');
        }
      }, JSON.stringify(buildSeed({ onboarded: true, theme: 'dark', values })));
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
      return { ctx, p };
    };
    const ftext = async (p, id) => (await p.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/ /g, ' ').replace(/[⁠‎⁨⁩]/g, '').trim();
    const fstate = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())));
    const ftap = async (p, id) => {
      if (id === 'toast-action') await toastActionReady(p);
      await p.getByTestId(id).first().click({ timeout: 15000 });
      await p.waitForTimeout(350);
    };
    const mealNamed = (s, name) => Object.values(s.savedMeals).find((m) => m.name === name);
    // The star's own drawing: its fill as the browser paints it, and whether it is pressed.
    const starLook = (p, id) =>
      p.evaluate((id) => {
        const b = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getBoundingClientRect().width > 0);
        const shape = b && b.querySelector('svg path, svg polygon');
        return { pressed: b?.getAttribute('aria-pressed'), fill: shape ? getComputedStyle(shape).fill : 'none' };
      }, id);
    // A finger held on a row for 800 ms (a real touch, as a phone sends it), then lifted.
    const hold = async (p, id) => {
      const box = await p.getByTestId(id).first().boundingBox();
      const cdp = await p.context().newCDPSession(p);
      const x = box.x + Math.min(80, box.width / 2);
      const y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await p.waitForTimeout(800);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(500);
    };
    const cardIndex = async (p, name) => {
      const n = await p.getByTestId(/^saved-meal-card-\d+$/).count();
      for (let i = 0; i < n; i++) if ((await ftext(p, `saved-meal-card-${i}`)).includes(name)) return i;
      return -1;
    };

    // 1. The star on /food/meals: the field, the toast, the Undo, the colour, the card in place until the next visit.
    {
      const { ctx, p } = await favOpen({ savedEstimate: 1 });
      await p.goto(`${BASE}/food/meals`, { waitUntil: 'networkidle' });
      await p.getByTestId('saved-meal-card-0').first().waitFor({ timeout: 20000 });
      const at = await cardIndex(p, 'Usual breakfast');
      const before = mealNamed(await fstate(p), 'Usual breakfast');
      await ftap(p, `saved-meal-favorite-${at}`);
      const after = mealNamed(await fstate(p), 'Usual breakfast');
      const { favoriteAt, updatedAt: _u1, ...restAfter } = after;
      const { updatedAt: _u0, ...restBefore } = before;
      check(
        'favourites: the star on /food/meals writes an ISO favoriteAt and leaves every other field as it was',
        typeof favoriteAt === 'string' && !Number.isNaN(Date.parse(favoriteAt)) && JSON.stringify(restAfter) === JSON.stringify(restBefore),
        `${favoriteAt}`,
      );
      const toastText = await ftext(p, 'toast');
      check('favourites: the toast puts the verb first, "Added to favourites: \\"Usual breakfast\\"", with Undo', toastText.startsWith('Added to favourites: "Usual breakfast"') && (await ftext(p, 'toast-action')) === 'Undo', toastText);
      const look = await starLook(p, `saved-meal-favorite-${at}`);
      check('favourites: the star is pressed and filled primaryInk (never the amber of "over")', look.pressed === 'true' && look.fill === rgbOf(ink.ink) && look.fill !== rgbOf(ink.warning), `${look.pressed}, ${look.fill} (want ${rgbOf(ink.ink)})`);
      check('favourites: the starred card keeps its place on this visit', (await cardIndex(p, 'Usual breakfast')) === at, `index ${at}`);
      await ftap(p, 'toast-action');
      const undone = mealNamed(await fstate(p), 'Usual breakfast');
      check('favourites: Undo takes the star away again (no favoriteAt at all)', !('favoriteAt' in undone) && !undone.deleted);
      await ftap(p, `saved-meal-favorite-${at}`);
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByTestId('saved-meal-card-0').first().waitFor({ timeout: 20000 });
      check('favourites: on the next visit the favourite leads', (await cardIndex(p, 'Usual breakfast')) === 0, `"Chicken and rice bowl" at ${await cardIndex(p, 'Chicken and rice bowl')}`);
      const cap = await ftext(p, `saved-meal-caption-${await cardIndex(p, 'Chicken and rice bowl')}`);
      check('favourites: a saved estimate on /food/meals reads "~" before its calories', cap.startsWith('~'), cap);
      await ctx.close();
    }

    // 2. Search: Favourites lists the starred meal above the foods; Log adds its items; search opens on the tab chosen last.
    {
      const { ctx, p } = await favOpen({ favoriteMeal: 1 });
      await p.goto(`${BASE}/food/search?meal=lunch`, { waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-favorites').first().waitFor({ timeout: 20000 });
      await ftap(p, 'search-tab-favorites');
      const chip = await ftext(p, 'search-tab-favorites');
      const mealsLabel = (await p.getByTestId('search-fav-meals-label').count()) > 0 && (await p.getByTestId('search-fav-foods-label').count()) > 0;
      const mealBox = await p.getByTestId('favorite-meal-0').first().boundingBox();
      const foodBox = await p.getByTestId('favorite-0').first().boundingBox();
      check('favourites: search\'s Favourites tab counts foods and meals ("Favourites 3") and lists Meals above Foods', chip === 'Favourites 3' && mealsLabel && mealBox && foodBox && mealBox.y < foodBox.y, `${chip}`);
      check('favourites: the meal row names the meal and carries its star (pressed) and Log', (await ftext(p, 'favorite-meal-0')).includes('Usual breakfast') && (await starLook(p, 'favorite-meal-0-favorite')).pressed === 'true' && (await p.getByTestId('favorite-meal-0-log').count()) === 1);
      const lunchNow = async () => Object.values((await fstate(p)).foodEntries).filter((e) => !e.deleted && e.meal === 'lunch').length;
      const lunchBefore = await lunchNow();
      // The row's body opens the review sheet (servings, items) and logs nothing by itself.
      await ftap(p, 'favorite-meal-0');
      const review = (await p.getByTestId('log-meal-confirm').count()) > 0 && (await lunchNow()) === lunchBefore;
      await p.keyboard.press('Escape');
      await p.getByTestId('log-meal-confirm').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      check('favourites: a tap on the meal row opens its review sheet and logs nothing', review);
      // The "+" logs at once, as a food's "+" does: one toast naming the meal, with Undo for both items.
      await ftap(p, 'favorite-meal-0-log');
      const lunchAfter = await lunchNow();
      const mealToast = await ftext(p, 'toast').catch(() => '');
      check('favourites: the "+" on the favourite meal adds its two items to lunch at once, with no sheet', lunchAfter - lunchBefore === 2 && (await p.getByTestId('log-meal-confirm').count()) === 0, `${lunchAfter - lunchBefore} added`);
      check('favourites: its one toast names the meal ("Usual breakfast added to lunch") with Undo', mealToast.startsWith('Usual breakfast added to lunch') && (await p.getByTestId('toast-action').count()) > 0, mealToast);
      await ftap(p, 'toast-action');
      check('favourites: its Undo takes both items back', (await lunchNow()) === lunchBefore, `${await lunchNow()} vs ${lunchBefore}`);
      await p.goto(`${BASE}/food/search?meal=lunch`, { waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-favorites').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(400);
      check('favourites: search opens again on the tab chosen last on this device (Favourites)', (await p.getByTestId('favorite-meal-0').count()) === 1 && (await p.getByTestId('search-tab-favorites').first().getAttribute('aria-pressed')) === 'true');
      // The chip of the tab search opened on is wholly in view, at 360 and at 320 (fixer two, T1).
      const chipIn = async (w) => {
        const b = await p.getByTestId('search-tab-favorites').first().boundingBox();
        return { ok: !!b && b.x >= 0 && b.x + b.width <= w, at: b ? `${Math.round(b.x)}-${Math.round(b.x + b.width)}` : 'none' };
      };
      const at360 = await chipIn(360);
      await p.setViewportSize({ width: 320, height: 640 });
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-favorites').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(400);
      const at320 = await chipIn(320);
      check(
        'favourites: opened on Favourites, its chip is wholly in view at 360 and at 320',
        at360.ok && at320.ok && (await p.getByTestId('search-tab-favorites').first().getAttribute('aria-pressed')) === 'true',
        `360: ${at360.at}, 320: ${at320.at}`,
      );
      await p.setViewportSize({ width: 360, height: 740 });
      // Only Favourites is remembered: after a look at Saved meals, search opens on the meal's default (Usual) again.
      await ftap(p, 'search-tab-meals');
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-usual').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(400);
      check('favourites: Saved meals chosen last does not stick: search opens on Usual again', (await p.getByTestId('search-tab-usual').first().getAttribute('aria-pressed')) === 'true' && (await p.getByTestId('search-tab-meals').first().getAttribute('aria-pressed')) !== 'true');
      // Favourites chosen last but nothing starred any more: the default, never an empty tab.
      await ftap(p, 'search-tab-favorites');
      await p.evaluate(async () => {
        const s = window.__healthcal.getState();
        for (const [id, r] of Object.entries(s.favorites)) if (!r.deleted) s.remove('favorites', id);
        for (const m of Object.values(s.savedMeals)) {
          if (m.deleted || !('favoriteAt' in m)) continue;
          const { favoriteAt: _f, ...rest } = m;
          s.upsert('savedMeals', rest);
        }
        await window.__healthcal.flush?.();
      });
      await p.reload({ waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-usual').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(400);
      check('favourites: Favourites chosen last with nothing starred opens on Usual, not an empty tab', (await p.getByTestId('search-tab-usual').first().getAttribute('aria-pressed')) === 'true' && (await p.getByTestId('search-tab-favorites').first().getAttribute('aria-pressed')) !== 'true');
      await ctx.close();
    }

    // 3. The + sheet: favourite meals lead, inside the first view; a saved estimate reads "~" and logs with its ranges.
    {
      const { ctx, p } = await favOpen({ favoriteMeal: 1, savedEstimate: 2 });
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await p.getByTestId('tab-add').first().waitFor({ timeout: 20000 });
      await ftap(p, 'tab-add');
      await p.getByTestId('quick-fav-meal-0').first().waitFor({ timeout: 10000 });
      const box = await p.getByTestId('quick-fav-meal-0').first().boundingBox();
      check('favourites: the + sheet\'s first tile is the newest favourite meal, wholly inside the first view at 360 x 740', box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 740 && (await ftext(p, 'quick-fav-meal-0')).includes('Chicken and rice bowl'), box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'no tile');
      const title = await ftext(p, 'quick-usual-title');
      check('favourites: the row is titled "Favourites and usual for …" and the second favourite follows', /^Favourites and usual for (breakfast|lunch|dinner|a snack|snack)$/i.test(title) && (await ftext(p, 'quick-fav-meal-1')).includes('Usual breakfast') && (await p.getByTestId('quick-usual-saved').count()) === 0, title);
      const cap = await ftext(p, 'quick-fav-meal-0-caption');
      check('favourites: the saved estimate\'s tile reads "~" before its calories ("3 items, ~592 kcal")', /^3 items, ~[\d,]+ kcal$/.test(cap), cap);
      const before = new Set(Object.keys((await fstate(p)).foodEntries));
      await ftap(p, 'quick-fav-meal-0');
      const added = Object.values((await fstate(p)).foodEntries).filter((e) => !before.has(e.id) && !e.deleted);
      check('favourites: one tap logs the saved estimate, each line still an estimate (its range and source kept)', added.length === 3 && added.every((e) => Array.isArray(e.kcalRange) && e.source === 'ai'), `${added.length} added`);
      await ctx.close();
    }

    // 4. A long press stars a food (search's Recent) and a saved meal (search's Saved meals), never opening the row.
    {
      const { ctx, p } = await favOpen();
      await p.goto(`${BASE}/food/search?meal=lunch`, { waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-recent').first().waitFor({ timeout: 20000 });
      await ftap(p, 'search-tab-recent');
      // The demo's recent foods start with oats (a favourite) and then banana (not one): hold the second row.
      const i = 1;
      const before = (await fstate(p)).favoriteFoodIds;
      await hold(p, `recent-${i}`);
      const s1 = await fstate(p);
      const gained = s1.favoriteFoodIds.filter((id) => !before.includes(id));
      const name = Object.values(s1.favorites).find((r) => !r.deleted && r.food?.id === gained[0])?.food?.name ?? '?';
      const t = await ftext(p, 'toast').catch(() => '');
      const selected = await p.evaluate(() => String(window.getSelection?.() ?? ''));
      check('favourites: a long press on a food row stars it, with "Added to favourites: <name>" and Undo', gained.length === 1 && t.startsWith(`Added to favourites: ${name}`), `${gained.join(',')} | ${t}`);
      check('favourites: the long press did not open the row nor select its text', new URL(p.url()).pathname === '/food/search' && (await p.getByTestId('food-detail-screen').count()) === 0 && selected.trim() === '', `${p.url()} | "${selected.slice(0, 30)}"`);
      await ftap(p, 'toast-action');
      check('favourites: its Undo removes the star again', !(await fstate(p)).favoriteFoodIds.includes(gained[0]));
      await ftap(p, 'search-tab-meals');
      await hold(p, 'saved-meal-0');
      const meal = mealNamed(await fstate(p), 'Usual breakfast');
      check('favourites: a long press on a saved-meal row stars the meal and stays on search', typeof meal.favoriteAt === 'string' && new URL(p.url()).pathname === '/food/search', `${meal.favoriteAt}`);
      check('favourites: the row\'s star shows it at once, the row in its place', (await starLook(p, 'saved-meal-0-favorite')).pressed === 'true' && (await ftext(p, 'saved-meal-0')).includes('Usual breakfast'));
      // The detail star: a toast, pressed, filled primaryInk.
      await ftap(p, 'search-tab-recent');
      await ftap(p, `recent-${i}`);
      await p.getByTestId('detail-favorite').first().waitFor({ timeout: 15000 });
      await ftap(p, 'detail-favorite');
      const dt = await ftext(p, 'toast').catch(() => '');
      const dl = await starLook(p, 'detail-favorite');
      check('favourites: the detail star stars the food with a toast and is filled primaryInk', dt.startsWith(`Added to favourites: ${name}`) && dl.pressed === 'true' && dl.fill === rgbOf(ink.ink), `${dt} | ${dl.fill}`);
      await ctx.close();
    }

    // 5. "Save lunch as a meal" in Saved meals (yesterday's lunch): the sheet saves it, then the row goes.
    {
      const { ctx, p } = await favOpen();
      await p.goto(`${BASE}/food/search?meal=lunch&date=${yesterday}`, { waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-meals').first().waitFor({ timeout: 20000 });
      await ftap(p, 'search-tab-meals');
      const label = await ftext(p, 'save-current-meal');
      const lunch = Object.values((await fstate(p)).foodEntries).filter((e) => !e.deleted && e.date === yesterday && e.meal === 'lunch' && e.via !== 'water');
      check('favourites: Saved meals offers "Save lunch as a meal" with the count of yesterday\'s lunch', label.startsWith('Save lunch as a meal') && label.includes(`${lunch.length} items, yesterday`), label.replace(/\n/g, ' | '));
      const count = Object.values((await fstate(p)).savedMeals).filter((m) => !m.deleted).length;
      await ftap(p, 'save-current-meal');
      await p.getByTestId('save-meal-name').first().waitFor({ timeout: 10000 });
      await ftap(p, 'save-meal-confirm');
      await p.waitForTimeout(400);
      const saved = Object.values((await fstate(p)).savedMeals).filter((m) => !m.deleted);
      check('favourites: the row\'s sheet saves the lunch as a meal, and the row goes (that lunch is a saved meal now)', saved.length === count + 1 && (await p.getByTestId('save-current-meal').count()) === 0, `${saved.length - count} saved`);
      await ctx.close();
    }

    // 6. The + sheet with favourite foods only (the demo stars two): they lead the row, ahead of the usual foods, inside the
    // first view; an AI food starred reads "~" and "about" (fixer two, T2 and T3).
    {
      const { ctx, p } = await favOpen();
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await p.getByTestId('tab-add').first().waitFor({ timeout: 20000 });
      await ftap(p, 'tab-add');
      await p.getByTestId('quick-fav-food-0').first().waitFor({ timeout: 10000 });
      const box = await p.getByTestId('quick-fav-food-0').first().boundingBox();
      const lefts = await p.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="quick-fav-"], [data-testid^="quick-usual-"]')]
          .filter((e) => !/-caption$/.test(e.getAttribute('data-testid')) && e.getAttribute('data-testid') !== 'quick-usual-title' && e.getBoundingClientRect().width > 100)
          .map((e) => ({ id: e.getAttribute('data-testid'), x: Math.round(e.getBoundingClientRect().left) }))
          .sort((a, b) => a.x - b.x),
      );
      check(
        'favourites: with favourite foods only, the first tile of the + sheet is a favourite food, wholly inside 360 x 740',
        !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 360 && box.y + box.height <= 740 && lefts[0]?.id === 'quick-fav-food-0',
        `${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'no tile'} | ${lefts.map((l) => l.id).join(', ')}`,
      );
      const title = await ftext(p, 'quick-usual-title');
      check('favourites: the row is titled "Favourites and usual for …" (the favourites drawn first)', /^Favourites and usual for (breakfast|lunch|dinner|a snack|snack)$/i.test(title), title);
      const favIds = (await fstate(p)).favoriteFoodIds;
      const usualShown = lefts.filter((l) => l.id.startsWith('quick-usual-')).map((l) => l.id.slice('quick-usual-'.length));
      check('favourites: a favourite food is shown once, never again as a usual tile', usualShown.length > 0 && usualShown.every((k) => !favIds.includes(k)), usualShown.join(', '));
      // An AI food starred (as a long press on its diary row does): its tile reads "~" and "about".
      await p.evaluate(async () => {
        const s = window.__healthcal.getState();
        s.toggleFavoriteFood({ id: 'ai-e2e-grilled-chicken', name: 'Grilled chicken breast', per100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, servings: [{ label: '150 g', grams: 150 }], source: 'ai', verified: false, emoji: '🍗' });
        await window.__healthcal.flush?.();
      });
      await p.waitForTimeout(400);
      const cap = await ftext(p, 'quick-fav-food-0-caption');
      const label = await p.getByTestId('quick-fav-food-0').first().getAttribute('aria-label');
      check('favourites: a starred AI food\'s tile reads "~" before its calories and "about" in its label', /^150 g, ~248 kcal$/.test(cap) && /about 248 kilocalories/.test(label ?? ''), `${cap} | ${label}`);
      await ctx.close();
    }

    // 7. Search's Favourites tab: each food carries the meals' star 12 px before its "+"; unstarring keeps the row (outline
    // star) until the next visit, with "Removed from favourites: <name>" and Undo (fixer two, T6 and T7).
    {
      const { ctx, p } = await favOpen();
      await p.goto(`${BASE}/food/search?meal=lunch`, { waitUntil: 'networkidle' });
      await p.getByTestId('search-tab-favorites').first().waitFor({ timeout: 20000 });
      await ftap(p, 'search-tab-favorites');
      await p.getByTestId('favorite-0-favorite').first().waitFor({ timeout: 10000 });
      const starBox = await p.getByTestId('favorite-0-favorite').first().boundingBox();
      const addBox = await p.getByTestId('favorite-0-add').first().boundingBox();
      const gap = starBox && addBox ? Math.round(addBox.x - (starBox.x + starBox.width)) : null;
      const name = (await ftext(p, 'favorite-0')).split('\n').map((l) => l.trim()).find((l) => /[A-Za-z]/.test(l)) ?? '';
      const chipBefore = await ftext(p, 'search-tab-favorites');
      check('favourites: a favourite food row carries a pressed star 12 px before its "+"', (await starLook(p, 'favorite-0-favorite')).pressed === 'true' && gap === 12, `gap ${gap}`);
      await ftap(p, 'favorite-0-favorite');
      const t = await ftext(p, 'toast').catch(() => '');
      const after = await starLook(p, 'favorite-0-favorite');
      const chipAfter = await ftext(p, 'search-tab-favorites');
      check(
        'favourites: its star unstars it with "Removed from favourites: <name>"; the row stays, its star an outline, the count one less',
        t.startsWith(`Removed from favourites: ${name}`) && after.pressed === 'false' && (await ftext(p, 'favorite-0')).includes(name) && chipAfter !== chipBefore,
        `${t} | ${after.pressed} | ${chipBefore} -> ${chipAfter}`,
      );
      await ftap(p, 'favorite-0-favorite');
      check('favourites: a second tap stars it again, the row in its place', (await starLook(p, 'favorite-0-favorite')).pressed === 'true' && (await ftext(p, 'favorite-0')).includes(name) && (await ftext(p, 'search-tab-favorites')) === chipBefore);
      await ctx.close();
    }
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
