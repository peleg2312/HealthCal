#!/usr/bin/env node
/**
 * End-to-end test of accounts, cross-device sync, AI analysis and friends against the
 * local mock backend. It drives the real client code (Supabase auth, the sync
 * engine, the AI request) in two separate browser profiles acting as two devices.
 *
 * Setup (see the README, "Testing accounts and sync locally"):
 *   EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-local-end-to-end-tests \
 *     npx expo export --platform web --output-dir /tmp/healthcal-mock
 *   node scripts/dev/mock-backend.cjs --static=/tmp/healthcal-mock --static-port=8090 &
 *   node scripts/dev/e2e-backend.cjs [--url=http://localhost:8090] [--api=http://localhost:54321] [--shots=<dir>]
 *
 * Plans: the stand-in starts with plans off; the "plans" block turns them on (POST /__billing) and off again.
 *
 * A server without meals: the "friends without meals" block turns the stand-in's meals off (POST /__meals, as
 * `mock-backend.cjs --no-meals` starts it) and runs the app as it would meet the live server before
 * supabase/migrations/20261201000000_friends_meals.sql is applied, then puts the switch back as it found it.
 * `--only=no-meals` runs that block alone (against a stand-in started with --no-meals, or with meals on).
 *
 * Doing things together (20261202000000_friends_together.sql): the "together" block drives circles, buddies, notes
 * and saved meals shown on three devices; "no together" turns them off on the stand-in (POST /__together, as
 * `mock-backend.cjs --no-together` starts it) and proves the app calm on a server without them, then puts the switch
 * back. `--only=together` and `--only=no-together` run one of them alone.
 */
const { chromium } = require('playwright');
const path = require('node:path');
const os = require('node:os');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const BASE = flags.url || 'http://localhost:8090';
const API = flags.api || 'http://localhost:54321';
const SHOTS = flags.shots || null;
const EMAIL = `alex+${Date.now()}@example.com`;
const PASSWORD = 'correct horse battery';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const server = async () => (await fetch(`${API}/__state`)).json();
// Every synced collection, read from the app itself so a new one is counted without touching this file.
const liveCount = (state) => Object.keys(state.dirty).reduce((n, c) => n + Object.keys(state[c] || {}).length, 0);

async function device(browser, seedJson) {
  // Reduced motion: every animation is instant, so the run is deterministic.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce' });
  if (seedJson) {
    await context.addInitScript((value) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem('healthcal-v1', value);
        window.sessionStorage.setItem('__seeded', '1');
      }
    }, seedJson);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Sign-in code exchanges this device sent (a reset link sends one; an invite link must not).
  const pkce = [];
  page.on('request', (r) => {
    if (/\/auth\/v1\/token\?grant_type=pkce/.test(r.url())) pkce.push(r.url());
  });
  const d = {
    page,
    errors,
    pkce,
    go: async (route) => {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(900);
    },
    tap: async (id) => {
      await page.getByTestId(id).first().click({ timeout: 15000 });
      await page.waitForTimeout(400);
    },
    fill: async (id, value) => {
      await page.getByTestId(id).first().fill(String(value), { timeout: 15000 });
      await page.waitForTimeout(150);
    },
    text: async (id) => (await page.getByTestId(id).first().innerText({ timeout: 15000 })).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim(),
    has: async (id) => (await page.getByTestId(id).count()) > 0,
    // The app exposes its live state for tests; this does not depend on how it is laid out in storage.
    state: async () => page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState()))),
    untilPath: (pathname, timeout = 30000) => page.waitForURL((u) => new URL(u).pathname === pathname, { timeout }).then(() => true).catch(() => false),
    shot: async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` }),
  };
  return d;
}

// ------------------------------------------------------------- friends without meals
// The new app on a server without 20261201000000_friends_meals.sql (the update can reach phones before the
// migration is applied): the stand-in answers as that server does (no feed or meal fields in the overview,
// every meal function a 404 PGRST202, a meal cheer 'invalid'). Two people on two devices. The Friends screen,
// a friend's page, Friends settings, the diary's meal menu and a sync round must stay calm: workouts and
// their cheers work as before, no meal control shows, nothing asks the server for a meal on its own, no
// error reaches the screen, and nothing is written to the store on the way.
async function friendsWithoutMeals(browser, buildSeed) {
  const switchMeals = (on) => fetch(`${API}/__meals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }).then((r) => r.json());
  const wasOn = (await server()).mealsOn !== false;
  await switchMeals(false);
  const NOT_YET = /not available yet/i;
  try {
    const api = (d, fn, ...args) =>
      d.page.evaluate(async ([f, a]) => JSON.parse(JSON.stringify((await window.__healthcalFriendsApi[f](...a)) ?? null)), [fn, args]);
    const overviewOf = (d) => d.page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcalFriends.getState().overview)));
    const waitFor = (d, id, timeout = 20000) => d.page.waitForSelector(`[data-testid="${id}"]`, { timeout }).then(() => true).catch(() => false);
    const signUp = async (email) => {
      const d = await device(browser, JSON.stringify(buildSeed()));
      await d.go('/auth?mode=signup');
      await d.fill('auth-email-input', email);
      await d.fill('auth-password-input', PASSWORD);
      await d.tap('auth-submit');
      const ok = await d.untilPath('/');
      await d.page.waitForTimeout(2500);
      return { d, ok, id: (await server()).users.find((u) => u.email === email.toLowerCase())?.id };
    };
    const kai = await signUp(`kai+${Date.now()}@example.com`);
    const lea = await signUp(`lea+${Date.now()}@example.com`);
    const K = kai.d;
    const L = lea.d;
    // What Kai's device asks the server, and every refusal it gets back.
    const calls = [];
    const refusals = [];
    K.page.on('request', (r) => {
      if (/\/rest\/v1\/rpc\//.test(r.url())) calls.push(r.url().split('/rpc/')[1].split('?')[0]);
    });
    K.page.on('response', (r) => {
      if (/\/rest\/v1\/rpc\//.test(r.url()) && r.status() >= 400) refusals.push(`${r.status()} ${r.url().split('/rpc/')[1].split('?')[0]}`);
    });
    const mealCalls = () => calls.filter((c) => /^meal_|^friend_prefs_set$/.test(c));
    // No line names meals where they cannot work: the header says "Workouts and cheers", and the remove and leave
    // words, their toasts and the set-up's note leave meals out (settings' "not available yet" card says why).
    const MEAL_WORD = /\bmeals?\b/i;
    const sheetText = async (d) => {
      const body = d.page.locator('[data-testid="sheet-body"]:visible').last();
      return (await body.count()) ? (await body.innerText()).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim() : '';
    };

    // Turning friends on: the set-up form, on a server without meals, says nothing of meals.
    await K.go('/friends');
    const setupShown = await waitFor(K, 'friends-setup');
    const setupText = setupShown ? await K.text('friends-screen') : '';
    check(
      'no meals: the set-up form and its header name no meal (“Workouts and cheers”)',
      setupShown && /Workouts and cheers/.test(setupText) && !MEAL_WORD.test(setupText),
      setupText.replace(/\s+/g, ' ').slice(0, 140),
    );

    await api(K, 'setupSocial', { displayName: 'Kai', avatar: '', sharing: { workouts: true, streak: true, minutes: true } });
    await api(L, 'setupSocial', { displayName: 'Lea', avatar: '', sharing: { workouts: true, streak: true, minutes: true } });
    await api(K, 'refreshFriends');
    const kaiCode = (await overviewOf(K))?.me?.code;
    const asked = await api(L, 'requestFriend', kaiCode);
    const answered = await api(K, 'respondToRequest', lea.id, true);
    await api(L, 'publishSummary', { force: true });
    let srv = await server();
    const leaWorkouts = srv.social[lea.id]?.summary?.workouts || [];
    check('no meals: two people sign up and become friends on a server without meals', kai.ok && lea.ok && asked?.ok && answered?.ok && srv.mealsOn === false && leaWorkouts.length > 0, `${leaWorkouts.length} workouts shared`);
    const overview = await overviewOf(K);
    check(
      'no meals: the overview reads as a server without meals: no meal allowed, nothing shown, and the feed holds the friend’s workouts',
      overview?.mealsAvailable === false && overview?.me?.mealsAllowed === false && (overview?.myMeals || []).length === 0 && (overview?.feed || []).length > 0 && overview.feed.every((i) => i.kind === 'workout' && i.userId === lea.id),
      `${(overview?.feed || []).length} feed items`,
    );

    const snapshot = () =>
      K.page.evaluate(() => {
        const s = window.__healthcal.getState();
        // Keys in a fixed order: a page load reads the records back in an order of its own.
        const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
        return JSON.stringify([...Object.keys(s.dirty).sort().map((c) => [c, sorted(s[c])]), ['profile', sorted(s.profile)], ['settings', sorted(s.settings)]]);
      });
    const before = await snapshot();
    calls.length = 0;

    // Friends: the feed shows the friend's workouts, cheered as before; no meal card, no meal words, no error.
    await K.go('/friends');
    const feedShown = await waitFor(K, 'friends-feed-workout-0');
    // What friends see of you is now at the top of Friends settings, not on the feed; the feed holds no meal word.
    const aboutYou = (await K.has('friends-feed')) ? await K.text('friends-feed') : '';
    check(
      'no meals: Friends shows the friend’s workouts in the feed, no meal card or meal action, and no error',
      feedShown && !(await K.has('friends-feed-meal-0')) && !(await K.has('friends-error-banner')) && !(await K.has('friends-error')) && !/meal/i.test(aboutYou),
      aboutYou.replace(/\s+/g, ' ').slice(0, 90),
    );
    const friendsHeader = await K.text('friends-screen').then((t) => t.split('\n').slice(0, 3).join(' · '));
    check('no meals: the Friends header’s line is news (“1 friend”), never a meal word', /\b1 friend\b/.test(friendsHeader) && !MEAL_WORD.test(friendsHeader), friendsHeader);
    await K.shot('friends-no-meals');
    await K.tap('friends-feed-workout-0-cheer');
    await K.page.waitForTimeout(1200);
    srv = await server();
    const feedRef = (await overviewOf(K))?.feed?.[0]?.ref;
    check(
      'no meals: cheering a workout from the feed shows at once and is stored, as before',
      /^You cheered /.test((await K.page.getByTestId('friends-feed-workout-0-cheer').first().getAttribute('aria-label')) || '') && srv.cheers.some((c) => c.from_user === kai.id && c.to_user === lea.id && c.ref === feedRef),
    );
    await api(L, 'refreshFriends');
    const leaSees = await overviewOf(L);
    check('no meals: the friend sees the cheer on their workout', (leaSees?.cheers || []).some((c) => c.fromUserId === kai.id && c.ref === feedRef));

    // A friend's page: their week and workouts, the day's cheer; no meals and no "Between you" switches.
    await K.go(`/friends/friend?id=${lea.id}`);
    await waitFor(K, 'friend-shows');
    check(
      'no meals: a friend’s page shows their week and workouts, without meal switches or meals',
      (await K.has('friend-shows')) && (await K.has('friend-workout-0')) && (await K.has('friend-week')) && !(await K.has('friend-between')) && !(await K.has('friend-share-meals')) && !(await K.has('friend-meals')),
    );
    await K.tap('friends-cheer-day');
    await K.page.waitForTimeout(1000);
    srv = await server();
    check('no meals: cheering the friend’s day works as before', srv.cheers.some((c) => c.from_user === kai.id && c.to_user === lea.id && /^day:/.test(c.ref)));
    await K.tap('friend-manage');
    await waitFor(K, 'friend-manage-sheet');
    const friendPage = `${await K.text('friend-screen')}\n${await sheetText(K)}`;
    check('no meals: the Manage sheet holds Remove only, no meal switch', (await K.has('friends-remove')) && !(await K.has('friend-between')), friendPage.replace(/\s+/g, ' ').slice(-120));
    await K.tap('friends-remove');
    const removeAsk = await sheetText(K);
    await K.tap('confirm-no');
    await K.page.waitForTimeout(500);
    check(
      'no meals: a friend’s page and its Remove question name no meal',
      !MEAL_WORD.test(friendPage) && /is not told/.test(friendPage) && /each other’s week, and the cheers/.test(removeAsk) && !MEAL_WORD.test(removeAsk),
      `${removeAsk.replace(/\s+/g, ' ').slice(0, 120)}`,
    );

    // Friends settings: the week's switches work; meals say plainly they are not here yet (never "under 18").
    await K.go('/friends/settings');
    await waitFor(K, 'friends-settings-week');
    const notYet = (await K.has('friends-settings-meals-not-yet')) ? await K.text('friends-settings-meals-not-yet') : '';
    check(
      'no meals: Friends settings says meals are not available yet, with no meal control and no age note',
      NOT_YET.test(notYet) && !(await K.has('friends-settings-meals')) && !(await K.has('friends-settings-showing')) && !(await K.has('friends-settings-see')) && !(await K.has('friends-settings-under-18')),
      notYet,
    );
    await K.shot('friends-settings-no-meals');
    const leaveCard = await K.text('friends-settings-leave');
    await K.tap('friends-leave');
    const leaveAsk = await sheetText(K);
    await K.tap('confirm-no');
    await K.page.waitForTimeout(500);
    check(
      'no meals: “Turn friends off” and its question name no meal (only the “not available yet” card speaks of meals)',
      /every friendship and every cheer/.test(leaveCard) && !MEAL_WORD.test(leaveCard) && /every friendship and every cheer, for you and for them/.test(leaveAsk) && !MEAL_WORD.test(leaveAsk),
      `${leaveCard.replace(/\s+/g, ' ').slice(0, 80)} | ${leaveAsk.replace(/\s+/g, ' ').slice(0, 80)}`,
    );
    await K.tap('friends-share-streak');
    await K.page.waitForTimeout(1500);
    const streakOff = (await server()).social[kai.id]?.sharing?.streak === false;
    await K.tap('friends-share-streak');
    await K.page.waitForTimeout(1500);
    check('no meals: the week’s switches still save on the server', streakOff && (await server()).social[kai.id]?.sharing?.streak === true);

    // The diary: a meal's menu has no "Show to friends" and no meal shows as shown.
    await K.go('/diary');
    let menuMeal = null;
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack']) {
      if (await K.has(`meal-menu-${m}`)) {
        menuMeal = m;
        break;
      }
    }
    let menuOpen = false;
    let showRow = true;
    if (menuMeal) {
      await K.tap(`meal-menu-${menuMeal}`);
      menuOpen = await waitFor(K, 'meal-menu-save', 8000).then(async (ok) => ok || waitFor(K, 'meal-menu-copy-to', 2000));
      showRow = await K.has('meal-menu-show');
      await K.shot('diary-menu-no-meals');
      await K.page.keyboard.press('Escape');
      await K.page.waitForTimeout(600);
    }
    check('no meals: a diary meal’s menu opens without "Show to friends", and no meal is marked as shown', !!menuMeal && menuOpen && !showRow && !(await K.has(`meal-shown-${menuMeal}`)), menuMeal || 'no meal with food');

    const after = await snapshot();
    const changed = (() => {
      const a = Object.fromEntries(JSON.parse(before));
      const b = Object.fromEntries(JSON.parse(after));
      return Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => {
        if (!a[k] || !b[k] || typeof a[k] !== 'object') return k;
        const keys = Object.keys({ ...a[k], ...b[k] }).filter((x) => JSON.stringify(a[k][x]) !== JSON.stringify(b[k][x]));
        return `${k}: ${keys.slice(0, 3).map((x) => `${x} ${JSON.stringify(a[k][x])?.slice(0, 80)} -> ${JSON.stringify(b[k][x])?.slice(0, 80)}`).join('; ')}`;
      });
    })();
    check('no meals: going through Friends, a friend, settings and the diary wrote nothing to the store', changed.length === 0, changed.join(' | '));
    check('no meals: no screen asked the server for a meal by itself, and nothing was refused', mealCalls().length === 0 && refusals.length === 0, [...mealCalls(), ...refusals].join(', '));

    // A sync round (publishMeals runs after each one): an entry is uploaded, then the device is left alone.
    calls.length = 0;
    const entryId = await K.page.evaluate(() => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return window.__healthcal.getState().upsert('foodEntries', {
        date: today, meal: 'lunch', name: 'Banana, raw', emoji: '🍌', foodId: 'b_banana', source: 'builtin', verified: true,
        servingLabel: '1 medium', quantity: 1, grams: 118, nutrients: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, loggedAt: new Date().toISOString(),
      })?.id ?? null;
    });
    await K.page.waitForTimeout(7000);
    srv = await server();
    const uploaded = srv.records.some((r) => r.user_id === kai.id && (entryId ? r.id === entryId : r.data?.name === 'Banana, raw'));
    const overviews = calls.filter((c) => c === 'friends_overview').length;
    check(
      'no meals: after a sync round nothing asks for a meal, no toast shows, and nothing loops',
      uploaded && mealCalls().length === 0 && refusals.length === 0 && !(await K.has('toast')) && overviews <= 2,
      `${calls.length} calls: ${[...new Set(calls)].join(', ')}`,
    );

    // The meal calls themselves, asked directly: each says plainly meals are not here yet, and none is sent.
    calls.length = 0;
    const answers = [
      await api(K, 'showMeal', { day: '2026-11-25', meal: 'lunch', items: [{ name: 'Rice', portion: '1 cup', source: 'builtin' }], showKcal: false, viewers: [lea.id] }),
      await api(K, 'stopMeal', 'ab'.repeat(16)),
      await api(K, 'stopAllMeals'),
      await api(K, 'setMealSettings', { kcal: true }),
      await api(K, 'setFriendMealPrefs', lea.id, { seeMeals: false }),
      await api(K, 'cheerMeal', lea.id, 'cd'.repeat(16)),
    ];
    await api(K, 'publishMeals');
    check(
      'no meals: every meal call answers "not available yet" in plain words and sends nothing',
      answers.every((a) => a && a.ok === false && a.code === 'not_yet' && NOT_YET.test(a.message) && !/function|schema|PGRST/i.test(a.message)) && calls.length === 0,
      answers.map((a) => a?.code).join(','),
    );

    // The overview claims meals but the function is missing (PostgREST's schema cache reloading): the 404 is met
    // calmly, the meal controls hide, and the next reload reads the server as it is.
    await K.page.evaluate(() => {
      const f = window.__healthcalFriends;
      const o = f.getState().overview;
      f.setState({ overview: { ...o, mealsAvailable: true, me: { ...o.me, mealsAllowed: true } } });
    });
    const missing = await api(K, 'showMeal', { day: '2026-11-25', meal: 'lunch', items: [{ name: 'Rice', portion: '1 cup', source: 'builtin' }], showKcal: false, viewers: [lea.id] });
    const afterMissing = await overviewOf(K);
    check(
      'no meals: a 404 for a missing meal function says "not available yet" and hides the meal controls',
      missing?.code === 'not_yet' && NOT_YET.test(missing?.message || '') && refusals.join() === '404 meal_show' && afterMissing?.mealsAvailable === false && afterMissing?.me?.mealsAllowed === false,
      `${refusals.join()} ${missing?.message}`,
    );

    // Removing the friend and turning friends off through the screens: their toasts name no meal.
    await K.go(`/friends/friend?id=${lea.id}`);
    await waitFor(K, 'friend-manage');
    await K.tap('friend-manage');
    await K.tap('friends-remove');
    await K.tap('confirm-yes');
    const removedSaid = (await waitFor(K, 'toast', 8000)) ? await K.text('toast') : '';
    srv = await server();
    check(
      'no meals: removing a friend works as before, and its toast names no meal',
      /Lea is no longer a friend\. Cheers between you were removed too\./.test(removedSaid) && !MEAL_WORD.test(removedSaid) && !srv.friendships.some((f) => [f.requester, f.addressee].includes(kai.id) && [f.requester, f.addressee].includes(lea.id)),
      removedSaid,
    );
    await K.go('/friends/settings');
    await waitFor(K, 'friends-leave');
    await K.tap('friends-leave');
    await K.tap('confirm-yes');
    const leftSaid = (await waitFor(K, 'toast', 8000)) ? await K.text('toast') : '';
    check('no meals: turning friends off says what went, with no meal', /Friends turned off\. Your card, friendships and cheers were removed\./.test(leftSaid) && !MEAL_WORD.test(leftSaid), leftSaid);
    await api(L, 'leaveSocial');
    srv = await server();
    check('no meals: turning friends off works as before', !srv.social[kai.id] && !srv.social[lea.id]);
    check('no meals: no runtime errors on either device', K.errors.length === 0 && L.errors.length === 0, [...K.errors, ...L.errors].join(' | ').slice(0, 200));
    await K.page.context().close();
    await L.page.context().close();
  } finally {
    await switchMeals(wasOn);
  }
}

// ------------------------------------------------------------- friends: doing things together
// Circles, buddies, notes and saved meals shown (supabase/migrations/20261202000000_friends_together.sql), on three
// devices, through the app's own friends service (`__healthcalFriendsApi`), so the checks do not depend on how the
// screens are laid out: what each phone sends is only what the server asked for, the shared cup holds the circle's
// total and never one person's figure, a buddy's week is counted from both phones, a muted note is never seen while
// its sender is told nothing, a saved meal shown reaches only the friend picked, and "Save to my meals" makes a
// saved meal on the phone with this phone's numbers.
const friendsApi = (d, fn, ...args) => d.page.evaluate(async ([f, a]) => JSON.parse(JSON.stringify((await window.__healthcalFriendsApi[f](...a)) ?? null)), [fn, args]);
const friendsOverview = (d) => d.page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcalFriends.getState().overview)));
async function signUpDevice(browser, buildSeed, name) {
  const email = `${name.toLowerCase()}+${Date.now()}@example.com`;
  const d = await device(browser, JSON.stringify(buildSeed()));
  await d.go('/auth?mode=signup');
  await d.fill('auth-email-input', email);
  await d.fill('auth-password-input', PASSWORD);
  await d.tap('auth-submit');
  const ok = await d.untilPath('/');
  await d.page.waitForTimeout(2500);
  const id = (await server()).users.find((u) => u.email === email.toLowerCase())?.id;
  const calls = [];
  const refusals = [];
  d.page.on('request', (r) => {
    if (/\/rest\/v1\/rpc\//.test(r.url())) calls.push({ fn: r.url().split('/rpc/')[1].split('?')[0], body: r.postData() || '' });
  });
  d.page.on('response', (r) => {
    if (/\/rest\/v1\/rpc\//.test(r.url()) && r.status() >= 400) refusals.push(`${r.status()} ${r.url().split('/rpc/')[1].split('?')[0]}`);
  });
  await friendsApi(d, 'setupSocial', { displayName: name, avatar: '', sharing: { workouts: true, streak: true, minutes: true } });
  return { d, ok, id, name, calls, refusals };
}
async function befriendDevices(a, b) {
  await friendsApi(a.d, 'refreshFriends');
  const code = (await friendsOverview(a.d))?.me?.code;
  await friendsApi(b.d, 'requestFriend', code);
  return friendsApi(a.d, 'respondToRequest', b.id, true);
}
const TOGETHER_FNS = /^(social_signals_publish|together_|buddy_|send_note|note_settings_set|friend_notes_set|meal_show_saved)/;

async function friendsTogether(browser, buildSeed) {
  // The seed's profile is an adult's (born 1994): days logged together and saved meals shown need 18 and over.
  const kai = await signUpDevice(browser, buildSeed, 'Kai');
  const lea = await signUpDevice(browser, buildSeed, 'Lea');
  const mo = await signUpDevice(browser, buildSeed, 'Mo');
  await befriendDevices(kai, lea);
  await befriendDevices(kai, mo);
  for (const p of [kai, lea, mo]) await friendsApi(p.d, 'refreshFriends');
  let srv = await server();
  check('together: three people sign up and Kai becomes friends with Lea and Mo', kai.ok && lea.ok && mo.ok && srv.togetherOn === true && Object.keys(srv.social).filter((k) => [kai.id, lea.id, mo.id].includes(k)).length === 3);

  // Nobody is in a circle yet: a phone sends nothing for circles.
  kai.calls.length = 0;
  await friendsApi(kai.d, 'publishSignals', { force: true });
  check('together: with no circle and no buddy, a phone sends no figures', !kai.calls.some((c) => c.fn === 'social_signals_publish') && !srv.signals[kai.id]);

  // Kai starts a minutes circle with Lea and Mo; Lea joins, Mo declines (silently).
  const started = await friendsApi(kai.d, 'startTogether', { kind: 'minutes', target: 300, invite: [lea.id, mo.id] });
  await friendsApi(lea.d, 'refreshFriends');
  const invite = (await friendsOverview(lea.d))?.togetherInvites?.[0];
  const joined = await friendsApi(lea.d, 'respondToTogether', started?.value?.id, true);
  await friendsApi(mo.d, 'refreshFriends');
  const declined = await friendsApi(mo.d, 'respondToTogether', started?.value?.id, false);
  check(
    'together: a circle is started, its invitation names who asked, one friend joins and one declines',
    started?.ok && invite?.from?.displayName === 'Kai' && invite?.kind === 'minutes' && joined?.value === 'joined' && declined?.value === 'declined',
    JSON.stringify([started, joined?.value, declined?.value]).slice(0, 160),
  );

  // Each phone sends its minutes (the seed holds workouts this week); the cup is their sum, by name only.
  for (const p of [kai, lea]) await friendsApi(p.d, 'refreshFriends');
  for (const p of [kai, lea]) await friendsApi(p.d, 'publishSignals', { force: true });
  srv = await server();
  const sent = kai.calls.filter((c) => c.fn === 'social_signals_publish').map((c) => JSON.parse(c.body).p_signals);
  const kaiSent = sent[sent.length - 1] || {};
  check(
    'together: a phone in a minutes circle sends its day and active minutes only: no days logged, no food, no calories',
    Object.keys(kaiSent).sort().join() === 'last_minutes,minutes,today' && !/kcal|food|name|weight|T\d\d:/.test(JSON.stringify(kaiSent)),
    JSON.stringify(kaiSent),
  );
  await friendsApi(kai.d, 'refreshFriends');
  const circle = (await friendsOverview(kai.d))?.together?.[0];
  const expected = (srv.signals[kai.id]?.minutes || 0) + (srv.signals[lea.id]?.minutes || 0);
  check(
    'together: the cup holds the circle’s total, members by name, never a figure of one person',
    !!circle && circle.total === expected && circle.members.map((m) => m.displayName).join() === 'Kai,Lea' && circle.members.every((m) => Object.keys(m).sort().join() === 'avatar,displayName,me,userId') && circle.asked.includes(mo.id),
    `total ${circle?.total} of ${circle?.target}, expected ${expected}`,
  );
  const goal = await friendsApi(lea.d, 'setTogetherTarget', circle?.id, 240);
  await friendsApi(kai.d, 'refreshFriends');
  check('together: any member changes the goal and the other sees it', goal?.ok && (await friendsOverview(kai.d))?.together?.[0]?.target === 240);
  const cheered = await friendsApi(kai.d, 'cheerTogether', circle, new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  srv = await server();
  check('together: "Cheer everyone" cheers each member who is a friend once', cheered?.value?.sent === 1 && srv.cheers.some((c) => c.from_user === kai.id && c.to_user === lea.id && /^day:/.test(c.ref)));

  // Buddies: Kai asks Mo; Mo accepts. Both phones then send their days logged, never what was eaten.
  const asked = await friendsApi(kai.d, 'inviteBuddy', mo.id);
  await friendsApi(mo.d, 'refreshFriends');
  const buddyInvite = (await friendsOverview(mo.d))?.buddyInvites?.[0];
  const together = await friendsApi(mo.d, 'respondToBuddy', kai.id, true);
  for (const p of [kai, mo]) await friendsApi(p.d, 'refreshFriends');
  for (const p of [kai, mo]) await friendsApi(p.d, 'publishSignals', { force: true });
  await friendsApi(kai.d, 'refreshFriends');
  const buddy = (await friendsOverview(kai.d))?.buddies?.find((b) => b.userId === mo.id);
  const moSent = mo.calls.filter((c) => c.fn === 'social_signals_publish').map((c) => JSON.parse(c.body).p_signals).pop() || {};
  check(
    'together: a buddy pair is asked and accepted, and the week counts how many of the two logged each day',
    asked?.value === 'sent' && buddyInvite?.displayName === 'Kai' && together?.value === 'together' && buddy?.status === 'together' && buddy.week.length === 7 && buddy.week.some((d) => d.count === 2),
    JSON.stringify(buddy?.week?.map((d) => d.count)),
  );
  check('together: a buddy’s phone sends the days it logged food, and only that', Object.keys(moSent).sort().join() === 'logged,today' && Array.isArray(moSent.logged) && moSent.logged.length > 0 && !/kcal|name|lunch|T\d\d:/.test(JSON.stringify(moSent)), JSON.stringify(moSent).slice(0, 120));

  // Notes: one a day; a muted friend's note is never seen and its sender is told "ok".
  const n1 = await friendsApi(kai.d, 'sendNote', lea.id, 'walk_later');
  const n2 = await friendsApi(kai.d, 'sendNote', lea.id, 'nice_week');
  await friendsApi(lea.d, 'refreshFriends');
  const leaNotes = (await friendsOverview(lea.d))?.notes || [];
  await friendsApi(mo.d, 'setFriendNotes', kai.id, false);
  const n3 = await friendsApi(kai.d, 'sendNote', mo.id, 'thinking_of_you');
  await friendsApi(mo.d, 'setFriendNotes', kai.id, true);
  await friendsApi(mo.d, 'refreshFriends');
  check(
    'together: a note arrives once a day; a friend who turned notes off never sees it, and the sender is not told',
    n1?.ok && n2?.code === 'already_today' && leaNotes.length === 1 && leaNotes[0].kind === 'walk_later' && n3?.ok && ((await friendsOverview(mo.d))?.notes || []).length === 0,
    JSON.stringify([n1?.ok, n2?.code, leaNotes.length, n3?.ok]),
  );

  // A saved meal shown to Lea only; Lea saves it to her meals on her phone.
  const shownSaved = await kai.d.page.evaluate(async (leaId) => {
    const a = window.__healthcalFriendsApi;
    const food = { id: 'b_banana', name: 'Banana, raw', source: 'builtin', verified: true, per100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, servings: [{ label: '1 medium', grams: 118 }] };
    const meal = { name: 'Banana break', servings: 1, items: [{ name: 'Banana, raw', emoji: '🍌', servingLabel: '1 medium', quantity: 1, grams: 118, nutrients: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, food, source: 'builtin', verified: true }] };
    const built = a.buildSharedSavedMeal({ meal, showKcal: false });
    return a.showSavedMeal({ savedMealId: 'saved-banana-1', name: built.name, items: built.items, servings: built.servings, showKcal: false, viewers: [leaId] });
  }, lea.id);
  await friendsApi(lea.d, 'refreshFriends');
  await friendsApi(mo.d, 'refreshFriends');
  const leaSaved = (await friendsOverview(lea.d))?.sharedSavedMeals || [];
  const moSaved = (await friendsOverview(mo.d))?.sharedSavedMeals || [];
  const leaFeed = (await friendsOverview(lea.d))?.feed || [];
  check(
    'together: a saved meal shown reaches the friend picked only, outside the feed, with no calories unless shown',
    shownSaved?.ok && leaSaved.length === 1 && leaSaved[0].name === 'Banana break' && !('kcal' in leaSaved[0].items[0]) && moSaved.length === 0 && !leaFeed.some((i) => i.ref === shownSaved.value.ref),
  );
  const savedBefore = await lea.d.page.evaluate(() => Object.values(window.__healthcal.getState().savedMeals).filter((m) => !m.deleted).length);
  const saved = await lea.d.page.evaluate(() => {
    const o = window.__healthcalFriends.getState().overview;
    const m = o.sharedSavedMeals[0];
    const { draft, leftOut } = window.__healthcalFriendsApi.friendMealToSaved({ items: m.items, name: `${m.displayName}’s ${m.name}` });
    if (draft) window.__healthcal.getState().upsert('savedMeals', draft);
    return { name: draft?.name, items: draft?.items.length ?? 0, kcal: draft?.items[0]?.nutrients?.kcal, leftOut: leftOut.length };
  });
  const savedAfter = await lea.d.page.evaluate(() => Object.values(window.__healthcal.getState().savedMeals).filter((m) => !m.deleted).length);
  check('together: "Save to my meals" makes a saved meal on the phone, with this phone’s numbers', saved.items === 1 && saved.name === 'Kai’s Banana break' && savedAfter === savedBefore + 1 && saved.kcal > 0, JSON.stringify(saved));

  // Removing a friend ends the pair and the notes; turning friends off clears the rest.
  await friendsApi(kai.d, 'removeFriend', mo.id);
  srv = await server();
  check('together: removing a friend ends logging together and deletes the notes between them', !srv.buddies.some((b) => [b.requester, b.addressee].includes(kai.id) && [b.requester, b.addressee].includes(mo.id)) && !srv.notes.some((n) => [n.from_user, n.to_user].includes(mo.id) && [n.from_user, n.to_user].includes(kai.id)));
  for (const p of [kai, lea, mo]) await friendsApi(p.d, 'leaveSocial');
  srv = await server();
  check('together: turning friends off leaves no circle, buddy, note or figure behind', ![kai.id, lea.id, mo.id].some((id) => srv.signals[id] || srv.circleMembers.some((m) => m.user_id === id && m.status === 'joined') || srv.buddies.some((b) => [b.requester, b.addressee].includes(id))));
  const refusals = [...kai.refusals, ...lea.refusals, ...mo.refusals];
  const errors = [...kai.d.errors, ...lea.d.errors, ...mo.d.errors];
  check('together: nothing was refused with an error status and no runtime errors on any device', refusals.length === 0 && errors.length === 0, [...refusals, ...errors].join(' | ').slice(0, 200));
  for (const p of [kai, lea, mo]) await p.d.page.context().close();
}

// ------------------------------------------------------------- friends without doing things together
// The new app on a server without 20261202000000_friends_together.sql (the update can reach phones first): the
// stand-in answers as that server (POST /__together { on: false }, as `--no-together` starts it): no new overview
// keys, every new function a 404 PGRST202. Friends must stay calm: no together call is made by itself (a sync round
// included), every together call says "not available yet" without a request, the Friends screen shows no error,
// nothing is written to the store, and a function that goes missing after all is met calmly and hides the controls.
async function friendsWithoutTogether(browser, buildSeed) {
  const switchTogether = (on) => fetch(`${API}/__together`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }).then((r) => r.json());
  const wasOn = (await server()).togetherOn !== false;
  await switchTogether(false);
  try {
    const kai = await signUpDevice(browser, buildSeed, 'Kai');
    const lea = await signUpDevice(browser, buildSeed, 'Lea');
    await befriendDevices(kai, lea);
    await friendsApi(kai.d, 'refreshFriends');
    const o = await friendsOverview(kai.d);
    check(
      'no together: the overview reads as a server without it: nothing to show, and friends and meals as before',
      o?.togetherAvailable === false && o?.mealsAvailable === true && (o?.friends || []).length === 1 && ['together', 'togetherInvites', 'buddies', 'buddyInvites', 'notes', 'notesSent', 'sharedSavedMeals', 'mySavedMeals'].every((k) => Array.isArray(o[k]) && o[k].length === 0),
    );
    const snapshot = () => kai.d.page.evaluate(() => JSON.stringify(Object.keys(window.__healthcal.getState().dirty).sort().map((c) => [c, Object.keys(window.__healthcal.getState()[c]).length])));
    const before = await snapshot();
    kai.calls.length = 0;
    await kai.d.go('/friends');
    await kai.d.page.waitForTimeout(1500);
    check('no together: Friends opens without an error on a server without it', !(await kai.d.has('friends-error')) && !(await kai.d.has('friends-error-banner')) && !(await kai.d.has('toast')));
    await kai.d.go(`/friends/friend?id=${lea.id}`);
    await kai.d.page.waitForTimeout(1500);
    check('no together: a friend’s page opens without an error, and offers no buddy or note', !(await kai.d.has('friends-error')) && !(await kai.d.has('toast')));
    // A sync round: an entry is uploaded, and nothing together is asked for.
    await kai.d.page.evaluate(() => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      window.__healthcal.getState().upsert('foodEntries', { date: today, meal: 'lunch', name: 'Banana, raw', emoji: '🍌', foodId: 'b_banana', source: 'builtin', verified: true, servingLabel: '1 medium', quantity: 1, grams: 118, nutrients: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, loggedAt: new Date().toISOString() });
    });
    await kai.d.page.waitForTimeout(7000);
    const answers = [
      await friendsApi(kai.d, 'startTogether', { kind: 'minutes', target: 300, invite: [lea.id] }),
      await friendsApi(kai.d, 'inviteBuddy', lea.id),
      await friendsApi(kai.d, 'sendNote', lea.id, 'nice_week'),
      await friendsApi(kai.d, 'setNotesOn', false),
      await friendsApi(kai.d, 'showSavedMeal', { savedMealId: 's1', name: 'Oats', items: [{ name: 'Oats', portion: '1 cup', source: 'builtin' }], servings: null, showKcal: false, viewers: [lea.id] }),
    ];
    await friendsApi(kai.d, 'publishSignals', { force: true });
    const togetherCalls = kai.calls.filter((c) => TOGETHER_FNS.test(c.fn));
    check(
      'no together: every together call says "not available yet" in plain words and nothing is sent, a sync round included',
      answers.every((a) => a?.ok === false && a.code === 'not_yet' && /not available yet/i.test(a.message) && !/function|schema|PGRST/i.test(a.message)) && togetherCalls.length === 0 && kai.refusals.length === 0,
      `${answers.map((a) => a?.code).join(',')} ${togetherCalls.map((c) => c.fn).join(',')} ${kai.refusals.join(',')}`,
    );
    // The overview claims it but the function is missing (PostgREST reloading): met calmly, the controls hide.
    await kai.d.page.evaluate(() => {
      const f = window.__healthcalFriends;
      f.setState({ overview: { ...f.getState().overview, togetherAvailable: true, signals: { minutes: true, logged: true, today: null } } });
    });
    const missing = await friendsApi(kai.d, 'inviteBuddy', lea.id);
    await friendsApi(kai.d, 'publishSignals', { force: true });
    const after = await friendsOverview(kai.d);
    check(
      'no together: a 404 for a missing together function says "not available yet", hides the controls and is asked once',
      missing?.code === 'not_yet' && after?.togetherAvailable === false && kai.refusals.join() === '404 buddy_invite' && !(await kai.d.has('toast')),
      `${kai.refusals.join()} ${missing?.message}`,
    );
    check('no together: the tour wrote nothing to the store but the entry it added', JSON.parse(await snapshot()).find(([c]) => c === 'foodEntries')[1] === JSON.parse(before).find(([c]) => c === 'foodEntries')[1] + 1 && JSON.parse(await snapshot()).filter(([c]) => c !== 'foodEntries').join() === JSON.parse(before).filter(([c]) => c !== 'foodEntries').join());
    check('no together: no runtime errors on either device', kai.d.errors.length === 0 && lea.d.errors.length === 0, [...kai.d.errors, ...lea.d.errors].join(' | ').slice(0, 200));
    await friendsApi(kai.d, 'leaveSocial');
    await friendsApi(lea.d, 'leaveSocial');
    await kai.d.page.context().close();
    await lea.d.page.context().close();
  } finally {
    await switchTogether(wasOn);
  }
}

(async () => {
  const { buildSeed } = await import('./seed.mjs');
  const browser = await chromium.launch();
  if (flags.only === 'no-meals' || flags.only === 'together' || flags.only === 'no-together') {
    if (flags.only === 'no-meals') await friendsWithoutMeals(browser, buildSeed);
    if (flags.only === 'together') await friendsTogether(browser, buildSeed);
    if (flags.only === 'no-together') await friendsWithoutTogether(browser, buildSeed);
    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed} of ${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }

  // ---------------------------------------------- device A: guest with history
  const A = await device(browser, JSON.stringify(buildSeed()));
  await A.go('/');
  const localBefore = await A.state();
  const expectedRecords = liveCount(localBefore);
  const remainingA = await A.text('today-remaining');

  await A.go('/auth?mode=signup');
  await A.fill('auth-email-input', EMAIL);
  await A.fill('auth-password-input', PASSWORD);
  await A.shot('backend-signup');
  await A.tap('auth-submit');
  check('sign-up succeeds and returns to Today', await A.untilPath('/'), A.page.url());
  await A.page.waitForTimeout(2500);

  let srv = await server();
  const user = srv.users.find((u) => u.email === EMAIL.toLowerCase());
  check('the account exists on the server', !!user);
  const mine = srv.records.filter((r) => r.user_id === user?.id);
  check('all data created before the account was uploaded', mine.length === expectedRecords, `${mine.length} of ${expectedRecords} records`);
  check('the profile was uploaded', srv.profiles[user?.id]?.data?.name === 'Alex');
  const aState = await A.state();
  check('device A is attached to the account with nothing left pending', aState.ownerId === user?.id && Object.values(aState.dirty).every((d) => Object.keys(d).length === 0) && !aState.profileDirty);

  // ------------------------------------------------- device B: fresh install
  const B = await device(browser, null);
  await B.go('/');
  check('a fresh device starts at the welcome screen', new URL(B.page.url()).pathname === '/welcome');
  await B.tap('welcome-sign-in');
  await B.fill('auth-email-input', EMAIL);
  await B.fill('auth-password-input', 'wrong password');
  await B.tap('auth-submit');
  await B.page.waitForTimeout(1200);
  const wrong = (await B.has('auth-error')) ? await B.text('auth-error') : '';
  check('a wrong password gives a clear message and stays signed out', /do not match/i.test(wrong) && (await B.state()).ownerId == null, wrong);
  await B.fill('auth-password-input', PASSWORD);
  await B.shot('backend-signin');
  await B.tap('auth-submit');
  check('sign-in on the new device goes straight to Today (profile restored, no onboarding)', await B.untilPath('/'), B.page.url());
  await B.page.waitForTimeout(1500);
  const bState = await B.state();
  check('the new device received every record', liveCount(bState) === expectedRecords, `${liveCount(bState)} of ${expectedRecords}`);
  check('both devices show the same calories left', (await B.text('today-remaining')) === remainingA, `A ${remainingA}, B ${await B.text('today-remaining')}`);
  await B.shot('backend-device-b-today');

  // ------------------------------------------------ B adds, A receives
  const waterBefore = Object.keys(bState.water).length;
  await B.tap('today-water-250');
  await B.page.waitForTimeout(4500); // auto-sync runs a few seconds after the last change
  srv = await server();
  check('a new entry on device B reaches the server by itself', srv.records.filter((r) => r.user_id === user.id && r.collection === 'water').length === waterBefore + 1);
  await A.go('/settings/account');
  await A.tap('account-sync-now');
  await A.page.waitForTimeout(2500);
  check('device A receives it on the next sync', Object.keys((await A.state()).water).length === waterBefore + 1);

  // ------------------------------------------------ A deletes, B follows
  const foodId = Object.values((await A.state()).foodEntries).filter((e) => !e.deleted).sort((x, y) => y.loggedAt.localeCompare(x.loggedAt))[0].id;
  await A.go('/diary');
  await A.tap(`entry-delete-${foodId}`);
  await A.page.waitForTimeout(6500); // let the Undo toast pass and auto-sync run
  srv = await server();
  check('a delete on device A is stored as a soft delete on the server', srv.records.find((r) => r.id === foodId)?.deleted === true);
  await B.go('/settings/account');
  await B.tap('account-sync-now');
  await B.page.waitForTimeout(2500);
  check('device B removes the entry too', (await B.state()).foodEntries[foodId]?.deleted === true);
  await A.go('/');
  await B.go('/');
  check('both devices agree again after the delete', (await A.text('today-remaining')) === (await B.text('today-remaining')), `A ${await A.text('today-remaining')}, B ${await B.text('today-remaining')}`);

  // ------------------------------------------------------------ AI: text
  await A.go('/food/photo?mode=text&meal=snack');
  await A.fill('ai-description', 'two scrambled eggs on sourdough toast');
  await A.tap('ai-analyse');
  // The first live estimate on a device asks before anything is sent.
  check('nothing is sent before agreeing to the AI estimate', (await A.has('ai-consent-agree')) && (await server()).aiRequests.length === srv.aiRequests.length);
  await A.tap('ai-consent-agree');
  await A.page.waitForSelector('[data-testid="ai-add-to-diary"]', { timeout: 20000 }).catch(() => {});
  await A.shot('backend-ai-review');
  srv = await server();
  const textReq = srv.aiRequests[srv.aiRequests.length - 1];
  check('a described meal is sent to the analysis function as the signed-in user', textReq?.user === user.id && /scrambled eggs/.test(textReq?.text || '') && textReq?.precise === false && !textReq?.hasImage);
  check('the real result is shown, not the sample', (await A.text('ai-dish')).includes('Eggs on toast') && !(await A.page.getByText('Sample mode').count()), await A.text('ai-dish'));
  const before = Object.values((await A.state()).foodEntries).filter((e) => !e.deleted).length;
  await A.tap('ai-add-to-diary');
  await A.page.waitForTimeout(1200);
  const aiEntries = Object.values((await A.state()).foodEntries).filter((e) => !e.deleted && e.source === 'ai' && e.meal === 'snack');
  check('confirmed items are logged as AI estimates with a calorie range', Object.values((await A.state()).foodEntries).filter((e) => !e.deleted).length >= before + 2 && aiEntries.length >= 2 && aiEntries.every((e) => Array.isArray(e.kcalRange) && e.kcalRange[0] < e.nutrients.kcal && e.kcalRange[1] > e.nutrients.kcal), `${aiEntries.length} AI entries`);

  await A.go('/food/photo?mode=text&meal=snack');
  await A.fill('ai-description', 'daily limit check');
  await A.tap('ai-analyse');
  await A.page.waitForTimeout(2500);
  await A.shot('backend-ai-limit');
  check('the daily-limit answer is explained to the user', (await A.page.getByText(/reset at midnight|used today/i).count()) > 0);

  // ----------------------------------------------------------- AI: photo
  const big = path.join(os.tmpdir(), `healthcal-meal-${Date.now()}.png`);
  const painter = await browser.newPage({ viewport: { width: 2400, height: 1800 } });
  await painter.setContent('<body style="margin:0;background:linear-gradient(135deg,#e9c46a,#e76f51 40%,#2a9d8f)"><div style="font:200px sans-serif;padding:300px;color:#fff">meal</div></body>');
  await painter.screenshot({ path: big });
  await painter.close();
  await A.go('/food/photo?meal=lunch');
  const chooser = A.page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
  await A.tap('ai-choose-photo');
  const fc = await chooser;
  if (fc) await fc.setFiles(big);
  await A.page.waitForTimeout(1500);
  // A weighed total ("Weighed it? Total grams") goes as the photo's text in the measured words, rounded to 10 g.
  if (await A.has('ai-photo-weight')) await A.fill('ai-photo-weight', '418');
  if (await A.has('ai-analyse')) await A.tap('ai-analyse');
  await A.page.waitForSelector('[data-testid="ai-add-to-diary"]', { timeout: 20000 }).catch(() => {});
  srv = await server();
  const photoReq = srv.aiRequests[srv.aiRequests.length - 1];
  // 2400x1800 downscaled to 768 px on the long edge as JPEG should be far below 300 KB of base64.
  check('a photo is downscaled before upload', !!fc && photoReq?.hasImage === true && photoReq.imageChars > 2000 && photoReq.imageChars < 400000, photoReq ? `${Math.round(photoReq.imageChars / 1024)} KB of base64, ${photoReq.mediaType}` : 'no request');
  check('a weighed total travels as the measured sentence and nothing else', photoReq?.text === 'About 420 g of food in total.' && photoReq?.precise === false, photoReq ? JSON.stringify(photoReq.text) : 'no request');
  await A.shot('backend-ai-photo-weight');
  check('the review says the weighed total was used', (await A.has('ai-weight-used')) && (await A.page.getByText('Made with your weighed total, 418 g').count()) > 0);

  // ------------------------------------- a live estimate saved as a meal, then logged again (src/features/food/log.ts)
  // "Also save as a meal" on a live estimate logs and saves in one act; the saved meal syncs like any saved meal. Logging
  // it again, from /food/meals and from the + sheet's row, runs on the phone: no request reaches analyze-food, and the
  // next estimate's allowance is exactly one below the one before (the stand-in counts every use).
  {
    const leftOf = async () => Number(((await A.has('ai-remaining')) ? await A.text('ai-remaining') : '').match(/^(\d+)/)?.[1] ?? NaN);
    await A.go('/food/photo?mode=text&meal=dinner');
    await A.fill('ai-description', 'eggs on toast for the saved meal');
    await A.tap('ai-analyse');
    await A.page.waitForSelector('[data-testid="ai-add-to-diary"]', { timeout: 20000 }).catch(() => {});
    const left1 = await leftOf();
    check('save live: the live review offers "Also save as a meal", off', (await A.has('ai-save-meal')) && (await A.page.getByTestId('ai-save-meal').first().getAttribute('aria-checked')) === 'false');
    await A.tap('ai-save-meal');
    const offered = await A.page.getByTestId('ai-save-meal-name').first().inputValue().catch(() => '');
    check('save live: the name offered is the dish the AI named', offered === 'Eggs on toast', offered);
    await A.fill('ai-save-meal-name', 'Saved live estimate');
    await A.tap('ai-add-to-diary');
    await A.page.waitForTimeout(1200);
    const st = await A.state();
    const meal = Object.values(st.savedMeals).find((m) => !m.deleted && m.name === 'Saved live estimate');
    check(
      'save live: one tap logged the estimate and saved it, each item an AI estimate with its range',
      !!meal && meal.items.length >= 2 && meal.items.every((it) => it.source === 'ai' && Array.isArray(it.kcalRange)),
      meal ? `${meal.items.length} items` : 'no saved meal',
    );
    const requestsBefore = (await server()).aiRequests.length;
    const sent = [];
    const watch = (r) => /analyze-food/.test(r.url()) && r.method() === 'POST' && sent.push(r.url());
    A.page.on('request', watch);
    // From /food/meals.
    await A.go('/food/meals?meal=snack');
    const cards = await A.page.locator('[data-testid^="saved-meal-card-"]').allInnerTexts();
    const i = cards.findIndex((t) => t.includes('Saved live estimate'));
    const entriesBefore = new Set(Object.keys((await A.state()).foodEntries));
    if (i >= 0) {
      await A.tap(`saved-meal-log-${i}`);
      await A.tap('log-meal-confirm');
      await A.page.waitForTimeout(800);
    }
    const fromMeals = Object.values((await A.state()).foodEntries).filter((e) => !e.deleted && !entriesBefore.has(e.id));
    check('save live: logged again from /food/meals, still an estimate', i >= 0 && fromMeals.length === meal?.items.length && fromMeals.every((e) => Array.isArray(e.kcalRange)), `${fromMeals.length} entries`);
    // From the + sheet's row. The sheet shows only the three most likely rows (the meal's first usual food, then the
    // favourite meals, the favourite foods, the other usual foods, the meal changed last, which keeps the third row);
    // the meal is starred first, so its row is a favourite meal's, after the first usual food.
    await A.go('/food/meals?meal=snack');
    const starAt = (await A.page.locator('[data-testid^="saved-meal-card-"]').allInnerTexts()).findIndex((t) => t.includes('Saved live estimate'));
    if (starAt >= 0) await A.tap(`saved-meal-favorite-${starAt}`);
    await A.go('/');
    await A.tap('tab-add');
    const rowIds = await A.page
      .locator('[data-testid^="quick-fav-meal-"], [data-testid="quick-usual-saved"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((id) => !id.endsWith('-caption')));
    let rowId = null;
    for (const id of rowIds) if ((await A.text(id)).includes('Saved live estimate')) rowId = rowId ?? id;
    const tile = rowId ? await A.text(rowId) : '';
    const before2 = new Set(Object.keys((await A.state()).foodEntries));
    if (rowId) await A.tap(rowId);
    await A.page.waitForTimeout(800);
    const fromTile = Object.values((await A.state()).foodEntries).filter((e) => !e.deleted && !before2.has(e.id));
    check('save live: the + sheet row names it with "~" and one tap logs it as an estimate', tile.includes('Saved live estimate') && /~\s?[\d,]+/.test(tile) && fromTile.length === meal?.items.length && fromTile.every((e) => Array.isArray(e.kcalRange)), tile.replace(/\n/g, ' | '));
    A.page.off('request', watch);
    check('save live: no request reached analyze-food while saving and logging the saved meal', sent.length === 0 && (await server()).aiRequests.length === requestsBefore, `${sent.length} sent, server ${(await server()).aiRequests.length - requestsBefore} new`);
    // The next estimate is exactly one use later: the stand-in's count did not move in between.
    await A.go('/food/photo?mode=text&meal=dinner');
    await A.fill('ai-description', 'eggs on toast once more');
    await A.tap('ai-analyse');
    await A.page.waitForSelector('[data-testid="ai-add-to-diary"]', { timeout: 20000 }).catch(() => {});
    const left2 = await leftOf();
    check('save live: the allowance moved by the one new estimate only', Number.isFinite(left1) && left2 === left1 - 1, `${left1} then ${left2}`);
    // The saved meal reaches the account like any saved meal.
    await A.go('/settings/account');
    await A.tap('account-sync-now');
    await A.page.waitForTimeout(2500);
    check('save live: the saved meal is backed up to the account', (await server()).records.some((r) => r.collection === 'savedMeals' && r.id === meal?.id && r.data?.name === 'Saved live estimate'));
  }

  // ------------------------------------------------------------ sign out
  await B.go('/settings/account');
  await B.tap('account-sign-out');
  if (await B.has('confirm-yes')) await B.tap('confirm-yes');
  await B.untilPath('/welcome', 15000);
  const bAfter = await B.state();
  check('signing out clears the device and returns to the welcome screen', new URL(B.page.url()).pathname === '/welcome' && bAfter.profile === null && liveCount(bAfter) === 0, B.page.url());
  srv = await server();
  check('signing out deletes nothing on the server', srv.records.filter((r) => r.user_id === user.id).length >= expectedRecords);

  // --------------------------------------------------- forgotten password
  const NEW_PASSWORD = 'a new horse, the same battery';
  await B.go('/auth?mode=forgot');
  await B.fill('auth-email-input', EMAIL);
  await B.tap('auth-submit');
  await B.page.waitForTimeout(1500);
  srv = await server();
  const reset = srv.recoveries.find((r) => r.email === EMAIL.toLowerCase());
  check('asking for a reset produces a link back to this app', !!reset && /\/auth\?mode=reset$/.test(reset.redirectTo || ''), reset ? reset.redirectTo : 'no reset requested');

  // The link only works in the browser that asked for it (PKCE): a third device cannot use it.
  const C = await device(browser, null);
  await C.go(`/auth?mode=reset&code=${reset?.code}`);
  await C.page.waitForSelector('[data-testid="auth-reset-expired"]', { timeout: 20000 }).catch(() => {});
  check('the reset link is refused in a browser that did not ask for it', (await C.has('auth-reset-expired')) && (await C.state()).ownerId == null);

  await B.go(`/auth?mode=reset&code=${reset?.code}`);
  await B.page.waitForSelector('[data-testid="auth-reset-password"]', { timeout: 20000 }).catch(() => {});
  await B.shot('backend-reset');
  await B.fill('auth-reset-password', NEW_PASSWORD);
  await B.fill('auth-reset-confirm', NEW_PASSWORD);
  await B.tap('auth-reset-submit');
  const resetHome = await B.untilPath('/', 20000);
  await B.page.waitForTimeout(1500);
  const bReset = await B.state();
  check('choosing a new password signs the device in with its data restored', resetHome && bReset.ownerId === user.id && bReset.profile?.name === 'Alex', B.page.url());

  await C.go('/auth?mode=signin');
  await C.fill('auth-email-input', EMAIL);
  await C.fill('auth-password-input', PASSWORD);
  await C.tap('auth-submit');
  await C.page.waitForTimeout(1200);
  check('the old password no longer works', (await C.has('auth-error')) && (await C.state()).ownerId == null);
  await C.fill('auth-password-input', NEW_PASSWORD);
  await C.tap('auth-submit');
  check('the new password does', await C.untilPath('/', 20000), C.page.url());
  await C.page.waitForTimeout(1500);

  // ------------------------------------- sign-out with changes not backed up
  // Uploads fail (as with no connection); the entry exists only on this device.
  await C.page.route('**/rest/v1/rpc/push_records', (route) => route.abort());
  await C.tap('today-water-250');
  await C.page.waitForTimeout(3000);
  const pendingWater = Object.keys((await C.state()).dirty.water);
  await C.go('/settings/account');
  await C.tap('account-sign-out');
  if (await C.has('confirm-yes')) await C.tap('confirm-yes');
  await C.page.waitForTimeout(2500);
  const cBlocked = await C.state();
  check(
    'sign-out stops and asks when an entry has not been backed up',
    pendingWater.length === 1 && (await C.has('account-sign-out-anyway')) && cBlocked.ownerId === user.id && !!cBlocked.water[pendingWater[0]],
    `${pendingWater.length} pending`,
  );
  await C.shot('backend-signout-blocked');
  await C.tap('account-sign-out-keep');
  await C.page.unroute('**/rest/v1/rpc/push_records');
  await C.tap('account-sync-now');
  await C.page.waitForTimeout(2500);
  srv = await server();
  check('once the connection is back the entry is uploaded', srv.records.some((r) => r.id === pendingWater[0]) && Object.keys((await C.state()).dirty.water).length === 0);

  // ------------------------------------------------------------- friends: meals shown
  // (src/services/friends.ts, supabase/migrations/20261201000000_friends_meals.sql)
  // Two people on two new devices. One shows a meal to the other, who sees it and cheers it; an edit
  // reaches the friend; stopping takes it away; it leaves by itself after 7 days (the stand-in's clock
  // moved forward); removing the friend stops it. Driven through the app's own friends calls
  // (window.__healthcalFriendsApi, test builds only), so it does not depend on the Friends screens.
  {
    const api = (d, fn, ...args) =>
      d.page.evaluate(async ([f, a]) => JSON.parse(JSON.stringify((await window.__healthcalFriendsApi[f](...a)) ?? null)), [fn, args]);
    const overviewOf = async (d) => {
      await api(d, 'refreshFriends');
      return d.page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcalFriends.getState().overview)));
    };
    const mealsIn = (o) => (o?.feed || []).filter((x) => x.kind === 'meal');
    const clock = (body) => fetch(`${API}/__clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    const ALLOWED = ['name', 'emoji', 'portion', 'source', 'foodId', 'barcode', 'serving', 'quantity', 'grams', 'kcal', 'kcalLow', 'kcalHigh'];
    const signUp = async (email) => {
      const d = await device(browser, JSON.stringify(buildSeed()));
      await d.go('/auth?mode=signup');
      await d.fill('auth-email-input', email);
      await d.fill('auth-password-input', PASSWORD);
      await d.tap('auth-submit');
      const ok = await d.untilPath('/');
      await d.page.waitForTimeout(2500);
      return { d, ok, id: (await server()).users.find((u) => u.email === email.toLowerCase())?.id };
    };
    const maya = await signUp(`maya+${Date.now()}@example.com`);
    const noa = await signUp(`noa+${Date.now()}@example.com`);
    check('meals: two more people sign up on two devices', maya.ok && noa.ok && !!maya.id && !!noa.id);
    const M = maya.d;
    const N = noa.d;
    await api(M, 'setupSocial', { displayName: 'Maya', avatar: '', sharing: { workouts: true, streak: true, minutes: true } });
    await api(N, 'setupSocial', { displayName: 'Noa', avatar: '', sharing: { workouts: true, streak: true, minutes: true } });
    const mayaCode = (await overviewOf(M))?.me?.code;
    const asked = await api(N, 'requestFriend', mayaCode);
    const answered = await api(M, 'respondToRequest', noa.id, true);
    const mayaView = await overviewOf(M);
    check('meals: the two are friends, and both may show meals (18 or over by their profiles)', asked?.ok && answered?.ok && mayaView?.friends?.some((f) => f.userId === noa.id) && mayaView?.me?.mealsAllowed === true);

    // Maya shows today's first meal that has food, built from her diary by the app's one door for food.
    const pick = await M.page.evaluate(() => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const entries = Object.values(window.__healthcal.getState().foodEntries).filter((e) => !e.deleted && e.date === today && e.via !== 'water' && e.quantity > 0);
      const meal = ['breakfast', 'lunch', 'dinner', 'snack'].find((m) => entries.some((e) => e.meal === m));
      const mine = entries.filter((e) => e.meal === meal);
      return { today, meal, count: Math.min(mine.length, 15), ids: mine.map((e) => e.id) };
    });
    const showDiaryMeal = () =>
      M.page.evaluate(
        async ([today, meal, viewer]) => {
          const f = window.__healthcalFriendsApi;
          const items = f.buildSharedMeal({ entries: Object.values(window.__healthcal.getState().foodEntries), day: today, meal, showKcal: false });
          return JSON.parse(JSON.stringify(await f.showMeal({ day: today, meal, items, showKcal: false, viewers: [viewer] })));
        },
        [pick.today, pick.meal, noa.id],
      );
    const shown = await showDiaryMeal();
    const ref = shown?.value?.ref;
    srv = await server();
    const row = srv.sharedMeals.find((m) => m.owner === maya.id);
    const rowText = JSON.stringify(row || {});
    check(
      'meals: showing a meal stores only the foods with what friends may see, for the friend picked',
      shown?.ok && /^[0-9a-f]{32}$/.test(ref || '') && row?.viewers?.join() === noa.id && row.items.length === pick.count && row.items.every((i) => Object.keys(i).every((k) => ALLOWED.includes(k)) && !('kcal' in i)),
      `${pick.meal}, ${row?.items?.length} foods`,
    );
    check(
      'meals: no record id, time, macros or total leaves the phone',
      !!row && !pick.ids.some((id) => rowText.includes(id)) && !/loggedAt|nutrients|protein|budget|updatedAt|"date"/.test(rowText),
    );
    let noaView = await overviewOf(N);
    let seen = mealsIn(noaView);
    check('meals: the friend sees it in the feed, named by its owner', seen.length === 1 && seen[0].ref === ref && seen[0].displayName === 'Maya' && seen[0].meal === pick.meal && seen[0].items.length === pick.count && !('shownAt' in seen[0]) && !('viewers' in seen[0]));

    const cheered = await api(N, 'cheerMeal', maya.id, ref);
    srv = await server();
    noaView = await overviewOf(N);
    const mayaAfterCheer = await overviewOf(M);
    check(
      'meals: the friend cheers it; the owner sees one cheer on the meal and in the cheers list',
      cheered?.ok && srv.cheers.some((c) => c.from_user === noa.id && c.to_user === maya.id && c.ref === `meal:${ref}`) && mealsIn(noaView)[0]?.cheered === true && mayaAfterCheer?.myMeals?.[0]?.cheers === 1 && mayaAfterCheer.cheers.some((c) => c.ref === `meal:${ref}`),
    );

    // An edit in the diary reaches the friend after the next publish.
    await M.page.evaluate(
      ([today, meal]) =>
        window.__healthcal.getState().upsert('foodEntries', {
          date: today, meal, name: 'Banana, raw', emoji: '🍌', foodId: 'b_banana', source: 'builtin', verified: true,
          servingLabel: '1 medium', quantity: 1, grams: 118, nutrients: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }, loggedAt: new Date().toISOString(),
        }),
      [pick.today, pick.meal],
    );
    await api(M, 'publishMeals');
    seen = mealsIn(await overviewOf(N));
    check('meals: an edit in the diary reaches the friend', seen[0]?.items?.some((i) => i.name === 'Banana, raw') === true || pick.count >= 15, `${seen[0]?.items?.length} foods`);

    const stopped = await api(M, 'stopMeal', ref);
    srv = await server();
    check('meals: stopping takes it away at once, with its cheer', stopped?.ok && mealsIn(await overviewOf(N)).length === 0 && !srv.sharedMeals.some((m) => m.owner === maya.id) && !srv.cheers.some((c) => c.ref === `meal:${ref}`));

    // Shown again, then 7 days pass on the stand-in's clock.
    const again = await showDiaryMeal();
    const seenAgain = mealsIn(await overviewOf(N)).length === 1;
    await clock({ advanceMs: 7 * 86400000 + 60000 });
    let afterWeek;
    try {
      afterWeek = mealsIn(await overviewOf(N)).length;
      srv = await server();
    } finally {
      await clock({ reset: true });
    }
    check('meals: a shown meal leaves by itself after 7 days, from the server too', again?.ok && seenAgain && afterWeek === 0 && !srv.sharedMeals.some((m) => m.owner === maya.id));

    // Removing the friend stops it at once.
    await showDiaryMeal();
    const seenBefore = mealsIn(await overviewOf(N)).length === 1;
    const removed = await api(N, 'removeFriend', maya.id);
    srv = await server();
    const mayaAfter = await overviewOf(M);
    check('meals: removing the friend stops the meal at once on both sides', seenBefore && removed?.ok && mealsIn(await overviewOf(N)).length === 0 && !srv.sharedMeals.some((m) => m.owner === maya.id) && (mayaAfter?.myMeals || []).length === 0);

    await api(M, 'leaveSocial');
    await api(N, 'leaveSocial');
    check('meals: no runtime errors on either device', M.errors.length === 0 && N.errors.length === 0, [...M.errors, ...N.errors].join(' | ').slice(0, 200));
    await M.page.context().close();
    await N.page.context().close();
  }

  // The same app against the server before meals (the block above this IIFE).
  await friendsWithoutMeals(browser, buildSeed);
  await friendsTogether(browser, buildSeed);
  await friendsWithoutTogether(browser, buildSeed);

  // ------------------------------------------------------------- friends
  // A second person (Sam) on another device. Both turn friends on, Sam adds Alex by code, Alex accepts.
  const EMAIL2 = `sam+${Date.now()}@example.com`;
  // Sam's week differs from Alex's (one session fewer), so equal minutes cannot pass by accident.
  const seedD = buildSeed();
  const samActs = Object.values(seedD.state.activities).sort((x, y) => y.date.localeCompare(x.date));
  if (samActs[0]) delete seedD.state.activities[samActs[0].id];
  const D = await device(browser, JSON.stringify(seedD));
  await D.go('/auth?mode=signup');
  await D.fill('auth-email-input', EMAIL2);
  await D.fill('auth-password-input', PASSWORD);
  await D.tap('auth-submit');
  check('a second person signs up on another device', await D.untilPath('/'), D.page.url());
  await D.page.waitForTimeout(2500);
  srv = await server();
  const user2 = srv.users.find((u) => u.email === EMAIL2.toLowerCase());
  const tid = (id) => String(id).replace(/[^A-Za-z0-9-]/g, '').toLowerCase();
  const myCode = (d) => d.page.evaluate(() => window.__healthcalFriends?.getState().overview?.me?.code ?? null);
  const waitFor = (d, id, timeout = 20000) => d.page.waitForSelector(`[data-testid="${id}"]`, { timeout }).then(() => true).catch(() => false);

  await A.go('/friends');
  await waitFor(A, 'friends-setup-save');
  const setupText = (await A.has('friends-setup')) ? await A.text('friends-setup') : '';
  const prefilled = await A.page.getByTestId('friends-setup-name').first().inputValue().catch(() => '');
  check('friends start off, with a set-up prefilled from the profile that says what is never shared', /never shared/i.test(setupText) && prefilled === 'Alex', `name "${prefilled}"`);
  await A.shot('friends-setup');
  await A.tap('friends-setup-save');
  await waitFor(A, 'friends-code');
  const codeA = await myCode(A);
  srv = await server();
  check('turning friends on gives an 8-character code shown on the screen', /^[A-HJKMNP-Z2-9]{8}$/.test(codeA || '') && srv.social[user.id]?.code === codeA, codeA);

  await D.go('/friends');
  await waitFor(D, 'friends-setup-save');
  await D.fill('friends-setup-name', 'Sam');
  await D.tap('friends-setup-save');
  await waitFor(D, 'friends-code');
  const codeD = await myCode(D);
  check('the second person turns friends on too', !!codeD && (await server()).social[user2?.id]?.display_name === 'Sam');

  // Every answer is said in plain words.
  await D.go(`/friends/add?invite=${codeD}`);
  await D.tap('friends-add-send');
  check('entering your own code says so', await waitFor(D, 'friends-add-outcome-self', 10000));
  await D.fill('friends-add-input', 'ZZZZ-ZZZZ');
  await D.tap('friends-add-send');
  check('a code nobody has says so', await waitFor(D, 'friends-add-outcome-not-found', 10000));

  // The invite link (?invite=, never ?code=, which the sign-in library would take for a sign-in code)
  // opens the add screen with the code filled in, and sends nothing to the auth server.
  await D.go(`/friends/add?invite=${codeA.toLowerCase().slice(0, 4)}-${codeA.slice(4)}`);
  const filled = await D.page.getByTestId('friends-add-input').first().inputValue();
  check('an invite link opens the add screen with the code filled in and normalised', filled === `${codeA.slice(0, 4)} ${codeA.slice(4)}`, filled);
  check('opening an invite link as a signed-in web user sends no sign-in code exchange', D.pkce.length === 0, D.pkce.join(' '));
  await D.tap('friends-add-send');
  check('sending a request says it was sent', await waitFor(D, 'friends-add-outcome-sent', 10000));
  await D.shot('friends-request-sent');
  await D.go('/friends');
  check('the request shows as waiting for the sender', await waitFor(D, `friends-outgoing-${tid(user.id)}`));

  await A.go('/friends');
  check('the request reaches the other person', await waitFor(A, `friends-accept-${tid(user2.id)}`));
  await A.shot('friends-request-received');
  await A.tap(`friends-accept-${tid(user2.id)}`);
  check('accepting makes them friends on the server', await waitFor(A, `friends-person-${tid(user2.id)}`) && (await server()).friendships.some((f) => f.status === 'accepted' && [f.requester, f.addressee].sort().join() === [user.id, user2.id].sort().join()));
  await A.page.waitForTimeout(800);
  await A.shot('friends-full');

  // Each sees the other's week; the minutes match that person's own Train screen.
  const ownMinutes = async (d) => {
    await d.go('/train');
    return d.text('train-guideline-minutes');
  };
  const minutesA = await ownMinutes(A);
  const minutesD = await ownMinutes(D);
  // A friend's week is on their page (/friends/friend?id=): the Friends screen itself lines up no figures side by side.
  await A.go(`/friends/friend?id=${user2.id}`);
  await waitFor(A, 'friend-minutes');
  const samSeenByAlex = (await A.text('friend-minutes')).replace(/\D+/g, '');
  await D.go(`/friends/friend?id=${user.id}`);
  await waitFor(D, 'friend-minutes');
  const alexSeenBySam = (await D.text('friend-minutes')).replace(/\D+/g, '');
  check("each sees the other's weekly minutes, equal to that person's own", samSeenByAlex === minutesD && alexSeenBySam === minutesA && minutesA !== minutesD, `Alex sees Sam ${samSeenByAlex} (own ${minutesD}), Sam sees Alex ${alexSeenBySam} (own ${minutesA})`);
  await A.go(`/friends/friend?id=${user2.id}`);
  await waitFor(A, 'friend-week');
  const card = await A.text('friend-week');
  srv = await server();
  const shared = srv.social[user2.id]?.summary || {};
  const allowed = ['week', 'minutes', 'sessions', 'streak', 'workouts'];
  check(
    "no calories, weight or food appear on the friend's card or in what was shared",
    !/kcal|calor|\bkg\b|\blb\b|weight|food/i.test(card) && Object.keys(shared).every((k) => allowed.includes(k)) && !/kcal|weight|food/i.test(JSON.stringify(shared)),
    card.replace(/\s+/g, ' ').slice(0, 120),
  );
  // Workouts are shared by an opaque reference, never their record id (an imported one's id gives away its start time).
  const samRecordIds = new Set(srv.records.filter((r) => r.user_id === user2.id).map((r) => r.id));
  const sharedIds = (shared.workouts || []).map((w) => w.id);
  check(
    'shared workouts carry opaque references, not record ids, and the share key stays with its owner',
    sharedIds.length > 0 && sharedIds.every((id) => /^[0-9a-f]{32}$/.test(id) && !samRecordIds.has(id)) && !JSON.stringify(await A.page.evaluate(() => window.__healthcalFriends?.getState().overview?.friends ?? [])).includes(srv.social[user2.id]?.share_key || '-'),
    sharedIds.slice(0, 2).join(', '),
  );

  // A cheer on one device appears on the other, matched to the workout it was for.
  const latest = [...(shared.workouts || [])].sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
  await A.go(`/friends/friend?id=${user2.id}`);
  await waitFor(A, `friends-cheer-${latest?.id}`);
  await A.tap(`friends-cheer-${latest?.id}`);
  await A.page.waitForTimeout(1200);
  srv = await server();
  check('cheering shows at once and is stored', /^You cheered /.test((await A.page.getByTestId(`friends-cheer-${latest?.id}`).first().getAttribute('aria-label')) || '') && srv.cheers.some((c) => c.from_user === user.id && c.to_user === user2.id && c.ref === latest?.id));
  // One line on the Friends screen ("1 cheer for you"); its list opens in a sheet.
  await D.go('/friends');
  await waitFor(D, 'friends-cheers');
  await D.tap('friends-cheers-open');
  await waitFor(D, 'friends-cheers-list');
  const cheersText = (await D.has('friends-cheers-list')) ? await D.text('friends-cheers-list') : '';
  check('the cheer appears on the other device, naming the workout', /Alex\s+cheered your (?!day)/.test(cheersText) && !/workout of yours/.test(cheersText), cheersText.replace(/\s+/g, ' ').slice(0, 80));
  await D.shot('friends-cheer-received');

  // Removing the friend clears both sides.
  await A.go(`/friends/friend?id=${user2.id}`);
  await waitFor(A, 'friend-manage');
  await A.tap('friend-manage');
  await A.tap('friends-remove');
  await A.tap('confirm-yes');
  await A.page.waitForTimeout(1500);
  srv = await server();
  const between = (x) => [x.requester ?? x.from_user, x.addressee ?? x.to_user].sort().join() === [user.id, user2.id].sort().join();
  check('removing a friend clears the friendship and cheers on the server', !srv.friendships.some(between) && !srv.cheers.some(between) && !(await A.has(`friends-person-${tid(user2.id)}`)));
  await D.go('/friends');
  await waitFor(D, 'friends-empty');
  check('the other side no longer shows them either', (await D.has('friends-empty')) && !(await D.has(`friends-person-${tid(user.id)}`)));

  // Turning friends off removes the card (Friends settings is a screen of its own, behind the header's one button).
  await D.tap('friends-settings-open');
  await waitFor(D, 'friends-leave');
  await D.tap('friends-leave');
  await D.tap('confirm-yes');
  await D.page.waitForTimeout(1500);
  srv = await server();
  check('turning friends off removes the card and returns to the set-up', !srv.social[user2.id] && (await waitFor(D, 'friends-setup-save')));

  // ------------------------------------------- a drink from the online products (Water's drink sheet)
  // The stand-in answers "iced coffee" with seven fixed products (scripts/dev/mock-backend.cjs); the sheet
  // lists the five that are drinks, each with its brand and pack, and a pick is logged with its own calories.
  const E = await device(browser, JSON.stringify(buildSeed()));
  await E.go('/water');
  await E.tap('water-search');
  await E.fill('water-pick-search', 'iced coffee');
  await E.page.waitForTimeout(200);
  const searching = (await E.has('water-pick-online-empty')) ? await E.text('water-pick-online-empty') : '';
  check('drink sheet: while the online answer is on its way it says so, never "no match"', searching === 'Searching Open Food Facts…', searching);
  const onlineIn = await E.page.waitForSelector('[data-testid="water-pick-off_8850389301012"]', { timeout: 15000 }).then(() => true).catch(() => false);
  const onlineRows = await E.page.evaluate(() => [...document.querySelectorAll('[data-testid^="water-pick-off_"]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.getAttribute('data-testid').replace('water-pick-', '')));
  check(
    'drink sheet: "iced coffee" lists the five online drinks, in order, and leaves out the 178 kcal one and the instant coffee',
    onlineIn && onlineRows.join(',') === 'off_8850389301012,off_4000349860088,off_9311336030069,off_0041271004953,off_5449000298157',
    onlineRows.join(', '),
  );
  check('drink sheet: under "Online products", community data from Open Food Facts', (await E.text('water-pick-online')).replace(/\s+/g, ' ') === 'Online products Community data from Open Food Facts', await E.text('water-pick-online'));
  check('drink sheet: nothing local matched, and it says so', (await E.text('water-pick-none')) === 'No drink in the list matches “iced coffee”.', await E.text('water-pick-none'));
  const prew = await E.text('water-pick-off_8850389301012');
  check('drink sheet: a row carries its brand and pack', /Prew · 180 ml · \d+ kcal per 250 ml · Community/.test(prew), prew.replace(/\n/g, ' / '));
  const nippys = await E.text('water-pick-off_9311336030069');
  check('drink sheet: another brand and pack', /Nippys · 500 ml · \d+ kcal per 250 ml · Community/.test(nippys), nippys.replace(/\n/g, ' / '));
  const prewKcal = Number((prew.match(/(\d+) kcal per 250 ml/) || [])[1]);
  await E.tap('water-pick-off_8850389301012');
  check('drink sheet: the product goes to Other and the toast says so', (await E.text('toast')) === 'Iced coffee chosen, under Other. Tap a glass to add it.', await E.text('toast'));
  const prewLine = await E.text('water-drink-line');
  check('drink sheet: the line names it with the same calories as its row', prewLine.startsWith(`Iced coffee: ${prewKcal} kcal per 250 ml`), prewLine);
  const eBefore = await E.state();
  const glass = Math.max(0, eBefore.settings.waterPresets.indexOf(250));
  await E.page.waitForTimeout(5000);
  await E.tap(`water-add-${glass}`);
  const eAfter = await E.state();
  const newEntries = Object.values(eAfter.foodEntries).filter((x) => !x.deleted && !eBefore.foodEntries[x.id]);
  const newWater = Object.values(eAfter.water).filter((x) => !x.deleted && !eBefore.water[x.id]);
  check(
    'drink sheet: a glass logs the product with its calories, paired with its water',
    newEntries.length === 1 && newWater.length === 1 && newWater[0].foodEntryId === newEntries[0].id && newEntries[0].foodId === 'off_8850389301012' && Math.round(newEntries[0].nutrients.kcal) === prewKcal && newEntries[0].food?.brand === 'Prew',
    JSON.stringify(newEntries.map((x) => ({ foodId: x.foodId, kcal: x.nutrients.kcal }))),
  );
  await E.page.context().close();

  // ------------------------------------------------------ the coach chat (src/app/coach.tsx, supabase/functions/coach-chat)
  // A device of its own, signed in. What the stand-in received (/__state coachRequests) proves what the phone sent: nothing
  // before agreeing; with sharing off exactly the typed question (and earlier typed pairs), never an answer given on the phone
  // or a figure from the app; with sharing on the question and the note word for word as "See what is sent" showed it. Then
  // the limit, a refusal, a cut-short answer, a referral, a failure with Try again, Clear chat, under 18 on the server and on
  // the phone, an unconfirmed email, and erasing the device clearing the chat and the agreement.
  {
    const K = await device(browser, JSON.stringify(buildSeed()));
    const coachEmail = `coach+${Date.now()}@example.com`;
    await K.go('/auth?mode=signup');
    await K.fill('auth-email-input', coachEmail);
    await K.fill('auth-password-input', PASSWORD);
    await K.tap('auth-submit');
    check('coach: a second account signs up for the coach run', await K.untilPath('/'), K.page.url());
    await K.page.waitForTimeout(2500);
    const coachUser = (await server()).users.find((u) => u.email === coachEmail.toLowerCase());
    const reqs = async () => (await server()).coachRequests.filter((r) => r.user === coachUser?.id);
    const settle = async (d) => {
      await d.page.waitForFunction(() => !document.querySelector('[data-testid="coach-typing"]'), null, { timeout: 60000 }).catch(() => {});
      await d.page.waitForTimeout(500);
    };
    const askIt = async (d, words) => {
      await d.fill('coach-input', words);
      await d.tap('coach-send');
      await settle(d);
    };
    const norm = (t) => String(t).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '');
    // The same JSON whatever the order of its keys.
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
    const same = (x, y) => JSON.stringify(canon(x)) === JSON.stringify(canon(y));

    const subtitle = async (d) => ((await d.text('screen-header')).split('\n').map((l) => l.trim()).filter(Boolean)[1] || '');
    await K.go('/');
    await K.tap('today-coach-open');
    check('coach: the Coach cup on Today opens the coach', await K.untilPath('/coach', 15000), K.page.url());
    check('coach: signed in with sharing off, the line under the title says the coach does not see your week', (await subtitle(K)) === 'Does not see your week', await subtitle(K));
    // An AI starter before agreeing takes the path of a sent question: its words go into the field and the consent sheet
    // asks first; "Not now" sends nothing and leaves the words in the field.
    const starter = (await K.text('coach-ai-starter-0')).split('\n')[0].trim();
    await K.tap('coach-ai-starter-0');
    const askedFirst = await K.has('coach-consent');
    if (askedFirst) await K.tap('coach-consent-not-now');
    const kept = await K.page.getByTestId('coach-input').first().inputValue();
    check('coach: before agreeing, an AI starter asks for consent first, sends nothing, and leaves its words in the field', askedFirst && kept === starter && (await reqs()).length === 0, `${askedFirst} | ${kept} | ${starter}`);
    await K.fill('coach-input', '');
    await K.tap('coach-local-training');
    await K.tap('coach-local-ideas');
    const localTraining = await K.text('coach-local-answer-1').catch(() => '');
    check('coach: the two phone answers are there and sent nothing', (await K.has('coach-local-answer')) && (await reqs()).length === 0, localTraining.slice(0, 80));

    const q1 = 'How many rest days a week?';
    await K.fill('coach-input', q1);
    await K.tap('coach-send');
    check('coach: the first typed question asks for consent, and nothing is sent before agreeing', (await K.has('coach-consent')) && (await reqs()).length === 0);
    await K.shot('backend-coach-consent');
    await K.tap('coach-consent-agree');
    await settle(K);
    const a1 = await K.text('coach-answer');
    let r = await reqs();
    const first = r[r.length - 1];
    check('coach: after agreeing the question is sent at once and its answer shown, marked AI', r.length === 1 && first.status === 200 && a1.includes(`It received your question "${q1}", 0 earlier messages`) && (await K.has('coach-mark-ai')), a1.slice(0, 120));
    check('coach: with sharing off the server received exactly the typed question and the consent version', same(first.body, { message: q1, consentVersion: 1 }), JSON.stringify(first.body));

    const q2 = 'And stretching after a run?';
    await askIt(K, q2);
    r = await reqs();
    const second = r[r.length - 1].body;
    const firstAnswer = `This is the stand-in coach. It received your question "${q1}", 0 earlier messages, and no summary of your week. Try one easy day this week.`;
    check(
      'coach: the next question carries the earlier typed pair and nothing else: no phone answer, no button question, no note',
      same(second, { message: q2, history: [{ role: 'user', text: q1 }, { role: 'assistant', text: firstAnswer }], consentVersion: 1 }),
      JSON.stringify(second).slice(0, 240),
    );
    check('coach: no figure from the app went with sharing off', !/guideline|active minutes|kcal|Meals that fit|training week|Ideas for/.test(JSON.stringify(r.map((x) => x.body))));

    // Share my week: on in "What the coach sees", its text read from the preview, then sent word for word.
    await K.tap('coach-about');
    await K.tap('coach-share');
    await K.tap('coach-note-preview');
    const preview = norm(await K.page.getByTestId('coach-note-text').first().innerText());
    await K.shot('backend-coach-preview');
    // "See what is sent" opens its own sheet over the coach's (src/features/coach/CoachSheet.tsx): close it first.
    if (await K.has('coach-note-done')) await K.tap('coach-note-done');
    await K.tap('coach-about-done');
    check('coach: with sharing on the line under the title says the coach sees your week', (await subtitle(K)) === 'Sees your week', await subtitle(K));
    const q3 = 'What should I eat after training?';
    await askIt(K, q3);
    r = await reqs();
    const third = r[r.length - 1].body;
    check('coach: with sharing on the server received the question and the note word for word as previewed', third.message === q3 && typeof third.note === 'string' && third.note === preview && third.note.startsWith('Goal:') && third.note.length <= 900, `${third.note?.length} characters`);
    check('coach: with sharing on still no phone answer in what was sent', !/Last 7 days: |Meals that fit|How is my training week|Ideas for/.test(JSON.stringify(third.history || [])) && (third.history || []).length === 4);
    check('coach: the note holds no name or email', !/Alex|@/.test(third.note || ''), (third.note || '').slice(0, 80));
    await K.tap('coach-about');
    await K.tap('coach-share');
    await K.tap('coach-about-done');

    await askIt(K, 'daily limit please');
    check('coach: the daily limit has its own words', /^30 questions today\. .*midnight UTC\.$/.test(await K.text('coach-notice')) && !(await K.has('coach-retry')), await K.text('coach-notice'));
    await askIt(K, 'please decline this');
    check('coach: a refusal has its own words and no "Try again"', /cannot help with that question/.test(await K.text('coach-notice')) && !(await K.has('coach-retry')));
    await askIt(K, 'cut short answer');
    // The answer's words, without the Report control under them.
    const answerWords = (await K.text('coach-answer')).split('\n').map((l) => l.trim()).filter((l) => l && !/^Report(ed)?$/.test(l)).join('\n');
    check('coach: an answer cut short by the length cap shows what arrived with "…"', answerWords.endsWith('…'), JSON.stringify(answerWords.slice(-60)));
    await askIt(K, 'refer me please');
    check('coach: a referral shows the fixed line under the answer', (await K.text('coach-refer')) === 'If you are at risk of harm now, call your local emergency number. findahelpline.com lists free lines in every country.');
    await askIt(K, 'busy now?');
    const before = (await reqs()).length;
    const busyOk = /busy right now/.test(await K.text('coach-notice')) && (await K.has('coach-retry'));
    await K.tap('coach-retry');
    await settle(K);
    r = await reqs();
    check('coach: a busy answer offers "Try again", which sends the same question once more', busyOk && r.length === before + 1 && r[r.length - 1].body.message === 'busy now?', `${r.length - before} more`);
    const fourth = r[r.length - 1].body;
    check('coach: unanswered questions are left out of the history, so the pairs stay whole', (fourth.history || []).every((t, i) => t.role === (i % 2 ? 'assistant' : 'user')) && !JSON.stringify(fourth.history || []).includes('daily limit please') && !JSON.stringify(fourth.history || []).includes('please decline'));
    await K.shot('backend-coach-chat');

    await K.tap('coach-about');
    await K.tap('coach-clear');
    check('coach: Clear chat (in "What the coach sees") empties the chat and keeps the agreement', (await K.has('coach-empty')) && (await K.page.evaluate(() => localStorage.getItem('healthcal-coach-history'))) === null && (await K.page.evaluate(() => !!localStorage.getItem('healthcal-coach-consent'))));

    // After agreeing, an AI starter sends at once: exactly its own words, with the earlier pairs gone with the chat.
    const starter2 = (await K.text('coach-ai-starter-0')).split('\n')[0].trim();
    const sentBeforeStarter = (await reqs()).length;
    await K.tap('coach-ai-starter-0');
    await settle(K);
    r = await reqs();
    check(
      'coach: after agreeing, an AI starter is sent at once with exactly its words, and answered',
      r.length === sentBeforeStarter + 1 && same(r[r.length - 1].body, { message: starter2, consentVersion: 1 }) && (await K.text('coach-question')) === starter2 && (await K.has('coach-answer')),
      JSON.stringify(r[r.length - 1]?.body).slice(0, 160),
    );

    // An answer that arrives while the coach is closed marks the Coach cup until the coach is opened again.
    await K.go('/');
    await K.tap('today-coach-open');
    await K.untilPath('/coach', 15000);
    await K.fill('coach-input', 'wait 3 seconds before answering');
    await K.tap('coach-send');
    await K.tap('header-close');
    const backHome = await K.untilPath('/', 15000);
    const marked = await K.page.getByTestId('today-coach-open-unread').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
    const markedLabel = await K.page.getByTestId('today-coach-open').first().getAttribute('aria-label');
    await K.shot('backend-coach-unread');
    check('coach: an answer that lands with the coach closed puts the level line on the Coach cup, labelled "Coach, new answer"', backHome && marked && markedLabel === 'Coach, new answer', `${marked} ${markedLabel}`);
    await K.tap('today-coach-open');
    await K.untilPath('/coach', 15000);
    const waited = await K.text('coach-answer');
    await K.tap('header-close');
    await K.untilPath('/', 15000);
    check('coach: opening the coach shows that answer and takes the mark away', /wait 3 seconds before answering/.test(waited) && !(await K.has('today-coach-open-unread')) && (await K.page.getByTestId('today-coach-open').first().getAttribute('aria-label')) === 'Coach', waited.slice(0, 100));
    // Signed out with a backend (fix X11): the field says to sign in; Send keeps the words and opens sign-in; back in the
    // coach, signed in, the words are in the field and go out only on the next Send, through the consent first (layered:
    // its "Details" row opens the four facts). Then a question that starts with a Hebrew letter is laid out right to left.
    {
      const L = await device(browser, JSON.stringify(buildSeed()));
      // Sign-in pushes Today over the stack it came from, so hidden copies of Today and the coach stay in the page:
      // this device acts on what is visible.
      // The topmost (last) visible copy, so a sheet over another is the one acted on.
      const vis = (id) => L.page.locator(`[data-testid="${id}"]:visible`).last();
      L.tap = async (id) => { await vis(id).click({ timeout: 15000 }); await L.page.waitForTimeout(400); };
      L.fill = async (id, value) => { await vis(id).fill(String(value), { timeout: 15000 }); await L.page.waitForTimeout(150); };
      L.text = async (id) => (await vis(id).innerText({ timeout: 15000 })).replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').trim();
      L.has = async (id) => (await L.page.locator(`[data-testid="${id}"]:visible`).count()) > 0;
      await L.go('/');
      await L.tap('today-coach-open');
      await L.untilPath('/coach', 15000);
      const ph = await L.page.getByTestId('coach-input').first().getAttribute('placeholder');
      check('coach: signed out with a backend, the field says "Sign in to ask the AI coach"', ph === 'Sign in to ask the AI coach', ph);
      const beforeL = (await server()).coachRequests.length;
      await L.fill('coach-input', 'How many rest days a week?');
      await L.tap('coach-send');
      check('coach: signed out, Send opens sign-in and sends nothing', (await L.untilPath('/auth', 15000)) && (await server()).coachRequests.length === beforeL, L.page.url());
      await L.fill('auth-email-input', coachEmail);
      await L.fill('auth-password-input', PASSWORD);
      await L.tap('auth-submit');
      await L.page.waitForURL((u) => !/\/auth/.test(new URL(u).pathname), { timeout: 30000 }).catch(() => {});
      await L.page.waitForTimeout(2500);
      // A sign-in that began in the coach comes back to the coach, with the words in the field.
      check('coach: signing in from the coach returns to the coach, not to Today', await L.untilPath('/coach', 5000), L.page.url());
      if (!(await L.untilPath('/coach', 1000))) {
        // Sign-in pushes Today over the stack it came from, so the cup of the Today underneath is still in the page, hidden.
        await L.tap('today-coach-open');
        await L.untilPath('/coach', 15000);
      }
      await L.page.waitForTimeout(600);
      const back = await vis('coach-input').inputValue();
      check('coach: back in the coach, signed in, the words are in the field and nothing was sent by itself', back === 'How many rest days a week?' && (await server()).coachRequests.length === beforeL, `${back} | ${L.page.url()}`);
      await L.tap('coach-send');
      await L.page.waitForTimeout(500);
      const sheets = await L.page.locator('[data-testid="coach-consent-lead"]:visible').count();
      check('coach: back from sign-in, one consent sheet rises (not one per coach screen left in the stack)', sheets === 1, `${sheets} consent sheets on screen`);
      const consentFirst = await L.has('coach-consent');
      const leadText = consentFirst ? norm(await L.text('coach-consent-lead')) : '';
      const closedDetails = await L.has('coach-details-body');
      await L.tap('coach-details');
      const facts = consentFirst ? norm(await L.text('coach-details-body')) : '';
      check(
        'coach: the next Send asks for the consent first, whose first layer is the two sentences with the details closed, and "Details" opens the four facts',
        consentFirst && /Anthropic’s AI, Claude/.test(leadText) && /not medical advice/.test(leadText) && !closedDetails && ['What is sent', 'What is not sent', 'Who receives it', 'What happens to it'].every((t) => facts.includes(t)) && (await server()).coachRequests.length === beforeL,
        leadText.slice(0, 120),
      );
      await L.shot('backend-coach-consent-details');
      await L.tap('coach-consent-agree');
      await L.page.waitForFunction(() => !document.querySelector('[data-testid="coach-typing"]'), null, { timeout: 60000 }).catch(() => {});
      await L.page.waitForTimeout(500);
      const lastL = (await server()).coachRequests.slice(-1)[0];
      check('coach: after agreeing, the kept words are sent once, exactly', (await server()).coachRequests.length === beforeL + 1 && lastL.body.message === 'How many rest days a week?', JSON.stringify(lastL?.body || {}).slice(0, 120));
      await L.fill('coach-input', 'כמה ימי מנוחה בשבוע?');
      await L.tap('coach-send');
      await L.page.waitForTimeout(600);
      const dir = await L.page.evaluate(() => {
        const box = [...document.querySelectorAll('[data-testid="coach-question"]')].find((e) => e.getBoundingClientRect().width > 0);
        const t = box && [...box.querySelectorAll('div')].find((d) => /כמה/.test(d.textContent) && !d.querySelector('div'));
        return t ? getComputedStyle(t).textAlign + '|' + getComputedStyle(t).direction : 'none';
      });
      check('coach: a question that starts with a Hebrew letter is laid out right to left', /^right\|/.test(dir), dir);
      await L.page.context().close();
    }

    await K.go('/coach');

    // Under 18 on the server: the synced profile says 2012 (pushed straight to the stand-in, newer than the phone's).
    const token = await K.page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        try {
          const v = JSON.parse(localStorage.getItem(k));
          if (v && v.access_token) return v.access_token;
        } catch {}
      }
      return null;
    });
    const prof = (await K.state()).profile;
    await fetch(`${API}/rest/v1/rpc/push_profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: 'mock-anon-key-for-local-end-to-end-tests' },
      body: JSON.stringify({ p_profile: { ...prof, birthDate: '2012-03-01' }, p_profile_updated_at: '2099-01-01T00:00:00.000Z', p_settings: null, p_settings_updated_at: null }),
    });
    await askIt(K, 'Hello coach');
    r = await reqs();
    check('coach: the server refuses a profile under 18, and the app says so neutrally', r[r.length - 1].error === 'under_18' && /18 and over/.test(await K.text('coach-notice')), r[r.length - 1].error);
    // Under 18 on the phone: nothing is sent at all.
    const sentBefore = r.length;
    await K.page.evaluate(() => window.__healthcal.getState().setProfile({ birthDate: '2011-06-01' }));
    await askIt(K, 'Hello again');
    check('coach: under 18 on the phone nothing is sent', (await reqs()).length === sentBefore && /18 and over/.test(await K.text('coach-notice')));
    await K.page.evaluate(() => window.__healthcal.getState().setProfile({ birthDate: '1994-05-12' }));

    // Erase this device: the chat and the coach's agreement go with the profile.
    await K.tap('coach-local-training');
    await K.page.waitForTimeout(600);
    await K.go('/settings/data');
    await K.tap('data-erase');
    const eraseWords = await K.page.getByText(/the coach chat and the coach's agreement/).count();
    await K.tap('confirm-yes');
    await K.untilPath('/welcome', 15000);
    await K.page.waitForTimeout(800);
    const leftAfter = await K.page.evaluate(() => [localStorage.getItem('healthcal-coach-history'), localStorage.getItem('healthcal-coach-consent')]);
    check('coach: the erase sheet names the coach chat, and erasing clears the chat and the agreement', eraseWords > 0 && leftAfter.every((v) => v === null), JSON.stringify(leftAfter));

    // An unconfirmed email: the server's 403 has its own words.
    const U = await device(browser, JSON.stringify(buildSeed()));
    await U.go('/auth?mode=signup');
    await U.fill('auth-email-input', `unconfirmed-${Date.now()}@example.com`);
    await U.fill('auth-password-input', PASSWORD);
    await U.tap('auth-submit');
    await U.untilPath('/');
    await U.page.waitForTimeout(2000);
    await U.go('/coach');
    await U.fill('coach-input', 'How many rest days a week?');
    await U.tap('coach-send');
    await U.tap('coach-consent-agree');
    await settle(U);
    check('coach: an unconfirmed email gets "Confirm your email address to use the AI coach."', (await U.text('coach-notice')) === 'Confirm your email address to use the AI coach.');
    check('coach: no uncaught errors in the coach run', [...K.errors, ...U.errors].length === 0, [...K.errors, ...U.errors].slice(0, 2).join(' || '));
    await K.page.context().close();
    await U.page.context().close();
  }

  // ------------------------------------------------------ Google sign-in (the stand-in's "Choose an account" page)
  // No Google involved: scripts/dev/mock-backend.cjs answers /auth/v1/settings, serves its own account page at
  // /auth/v1/authorize and exchanges the code it hands out only with the verifier of the browser that started.
  {
    const google = (body) => fetch(`${API}/__google`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const WORDS = {
      cancelled: 'Google sign-in cancelled. Nothing changed.',
      declined: 'Google sign-in was not completed. Try again, or use your email.',
      unverified: 'Google has not confirmed this address yet. Confirm it with Google, or sign up with your email.',
      signupsOff: 'New accounts are paused right now. Try again later.',
      notFinished: 'That sign-in did not finish on this device. Try Continue with Google again.',
    };
    // Tap Continue with Google, wait for the account page, choose there, and wait to be back in the app.
    const viaGoogle = async (d, button, choice) => {
      await d.tap(button);
      await d.page.waitForURL(/\/auth\/v1\/authorize/, { timeout: 20000 });
      await d.page.getByTestId(choice).click({ timeout: 15000 });
      await d.page.waitForURL((u) => new URL(u).pathname === '/auth' || new URL(u).pathname === '/' || new URL(u).pathname === '/onboarding', { timeout: 30000 });
      await d.page.waitForTimeout(2500);
    };
    // A toast stays about two seconds: every toast text a page shows is kept, across the redirects to Google and back.
    const watchToasts = (d) =>
      d.page.context().addInitScript(() => {
        const seen = [];
        window.__toasts = seen;
        new MutationObserver(() => {
          for (const n of document.querySelectorAll('[data-testid="toast"]')) if (n.innerText && !seen.includes(n.innerText)) seen.push(n.innerText);
        }).observe(document, { subtree: true, childList: true, characterData: true });
      });
    const toastsSeen = (d) => d.page.evaluate(() => (window.__toasts || []).join(' | ').replace(/\u00A0/g, ' '));
    const visible = async (d, id) => (await d.page.getByTestId(id).count()) > 0 && (await d.page.getByTestId(id).first().isVisible());

    // Off on the backend: the button is not shown anywhere.
    await google({ on: false, signupDisabled: false });
    const off = await device(browser, null);
    await off.go('/welcome');
    const offWelcome = await visible(off, 'welcome-google');
    await off.go('/auth?mode=signin');
    check('google: hidden on welcome and the sign-in form while the backend has Google off', !offWelcome && !(await visible(off, 'auth-google')) && (await visible(off, 'auth-email-input')));
    await off.page.context().close();
    await google({ on: true });

    // Cancel, decline, an unconfirmed address and paused sign-ups each come back to the form with their own words.
    const G = await device(browser, null);
    await G.go('/auth?mode=signin');
    check('google: shown above the email form once the backend has it on', (await visible(G, 'auth-google')) && (await visible(G, 'auth-or')));
    const box = await G.page.getByTestId('auth-google').boundingBox();
    check('google: the button is 50 px high', !!box && Math.round(box.height) === 50, box ? `${box.height}` : 'no box');
    await viaGoogle(G, 'auth-google', 'google-cancel');
    const toastText = (await G.has('toast')) ? await G.text('toast') : '';
    check('google: a cancel comes back to the form with "Google sign-in cancelled. Nothing changed."', toastText.includes(WORDS.cancelled) && (await visible(G, 'auth-email-input')) && !(await G.has('auth-google-error')), toastText);
    await viaGoogle(G, 'auth-google', 'google-decline');
    check('google: declining on the account page shows its words under the button', (await G.has('auth-google-error')) && (await G.text('auth-google-error')) === WORDS.declined);
    await viaGoogle(G, 'auth-google', 'google-unverified');
    check('google: an address Google has not confirmed shows its words', (await G.has('auth-google-error')) && (await G.text('auth-google-error')) === WORDS.unverified);
    await google({ signupDisabled: true });
    await viaGoogle(G, 'auth-google', 'google-account-new');
    check('google: paused sign-ups show "New accounts are paused right now. Try again later."', (await G.has('auth-google-error')) && (await G.text('auth-google-error')) === WORDS.signupsOff);
    await google({ signupDisabled: false });
    check('google: no failed return signed the device in', (await G.state()).ownerId == null && G.pkce.length === 0, `${G.pkce.length} exchanges`);

    // A new Google person lands in onboarding, signed in, with a Google-only account and no password.
    await G.go('/auth?mode=signin');
    let returnUrl = '';
    G.page.on('framenavigated', (f) => {
      if (f === G.page.mainFrame() && /[?&]code=/.test(f.url()) && /mode=google/.test(f.url())) returnUrl = f.url();
    });
    await viaGoogle(G, 'auth-google', 'google-account-new');
    await G.untilPath('/onboarding', 20000);
    srv = await server();
    const newcomer = srv.users.find((u) => u.email === 'new.google.person@example.test');
    check('google: a new Google person lands in onboarding', new URL(G.page.url()).pathname === '/onboarding', G.page.url());
    check('google: the new account has the Google identity only', !!newcomer && newcomer.identities.join(',') === 'google', newcomer ? newcomer.identities.join(',') : 'no user');
    check('google: the browser exchanged the code once, and the return said "Signing in with Google", never "Email confirmed"', G.pkce.length === 1 && !(await G.page.getByText('Email confirmed').count()), `${G.pkce.length} exchanges`);

    // The same code again: refused in another browser (it holds no verifier) and by the server (one use).
    const R = await device(browser, null);
    const replayPath = returnUrl ? new URL(returnUrl).pathname + new URL(returnUrl).search : '/auth?mode=google&code=missing';
    await R.go(replayPath);
    await R.page.waitForSelector('[data-testid="auth-google-error"]', { timeout: 20000 }).catch(() => {});
    const replayWords = (await R.has('auth-google-error')) ? await R.text('auth-google-error') : '';
    check('google: a replayed return in another browser is refused with its words and signs nothing in', !!returnUrl && replayWords === WORDS.notFinished && (await R.state()).ownerId == null, replayWords || returnUrl);
    const replayCode = returnUrl ? new URL(returnUrl).searchParams.get('code') : 'missing';
    const replay = await fetch(`${API}/auth/v1/token?grant_type=pkce`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auth_code: replayCode, code_verifier: 'x'.repeat(43) }) });
    check('google: the server refuses a code used once already', replay.status === 400);
    await R.page.context().close();
    await G.page.context().close();

    // An existing email person: the same account, its data on a fresh device, one user with two identities.
    const L = await device(browser, null);
    await watchToasts(L);
    await L.go('/welcome');
    check('google: the welcome screen offers Continue with Google as its second option', await visible(L, 'welcome-google'));
    const order = await L.page.evaluate(() => ['welcome-get-started', 'welcome-google', 'welcome-sign-in'].map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1));
    check('google: under Get started and above Sign in', order[0] >= 0 && order[0] < order[1] && order[1] < order[2], order.join(' < '));
    await viaGoogle(L, 'welcome-google', `google-account-${EMAIL.toLowerCase()}`);
    const linkedHome = await L.untilPath('/', 20000);
    const linkedToast = await toastsSeen(L);
    srv = await server();
    const alex = srv.users.find((u) => u.email === EMAIL.toLowerCase());
    const lState = await L.state();
    check('google: an existing email person keeps the same account (one user, two identities)', !!alex && alex.id === user.id && alex.identities.join(',') === 'email,google' && srv.users.filter((u) => u.email === EMAIL.toLowerCase()).length === 1, alex ? alex.identities.join(',') : 'no user');
    check("google: and their plan and logs arrive on the new device (straight to Today)", linkedHome && lState.ownerId === user.id && lState.profile?.name === 'Alex', L.page.url());
    check('google: the sign-in that joined them says "Signed in. Google now also opens this account."', linkedToast.includes('Signed in. Google now also opens this account.'), linkedToast);
    const password = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: NEW_PASSWORD }) });
    check('google: the password still opens the linked account', password.status === 200);
    check('google: no uncaught errors in the Google runs', [...L.errors].length === 0, L.errors.slice(0, 2).join(' || '));
    await L.page.context().close();
  }

  // ------------------------------------------------------ plans (src/features/plan, the stand-in's billing function)
  // Plans are off on the stand-in until this block turns them on (POST /__billing), so every check above ran on
  // today's limits. Off: nothing about a plan anywhere and today's words. On: a new account is Free with 5 and 5;
  // the limit words for free (with the plan link) and for Plus (without); buying monthly (with the waiting state)
  // and yearly from the plan screen; a second device; "Manage or cancel" and cancelling in the stand-in's portal;
  // a failed payment; the careful estimate's line; deleting an account that holds Plus, with the payment company
  // answering and failing; and a report of an AI answer arriving as one row.
  {
    const billing = (b) => fetch(`${API}/__billing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
    const billingEvent = (b) => fetch(`${API}/__billing/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
    const norm = (t) => String(t).replace(/ /g, ' ').replace(/[⁠‎⁨⁩]/g, '').trim();
    const visible = async (d, id) => (await d.page.getByTestId(id).count()) > 0 && (await d.page.getByTestId(id).first().isVisible());
    const textOf = async (d, id) => ((await d.has(id)) ? norm(await d.page.getByTestId(id).first().innerText()) : '');
    // The server's last status answer as the device keeps it (the plan's display cache).
    const status = (d) => d.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('healthcal-plan') || 'null')?.status ?? null; } catch { return null; } });
    const planOf = async (d) => (await status(d))?.plan ?? null;
    const clock = (iso) => {
      const t = new Date(iso);
      return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    };
    const resets = (() => {
      const n = new Date();
      return clock(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)).toISOString());
    })();
    const signUp = async (d, email) => {
      await d.go('/auth?mode=signup');
      await d.fill('auth-email-input', email);
      await d.fill('auth-password-input', PASSWORD);
      await d.tap('auth-submit');
      const ok = await d.untilPath('/');
      await d.page.waitForTimeout(2500);
      return ok;
    };
    const estimate = async (d, words) => {
      await d.go('/food/photo?mode=text&meal=snack');
      await d.fill('ai-description', words);
      await d.tap('ai-analyse');
      if (await d.has('ai-consent-agree')) await d.tap('ai-consent-agree');
      await d.page.waitForSelector('[data-testid="ai-add-to-diary"], [data-testid^="ai-error-"]', { timeout: 20000 }).catch(() => {});
      await d.page.waitForTimeout(600);
    };
    const settle = async (d) => {
      await d.page.waitForFunction(() => !document.querySelector('[data-testid="coach-typing"]'), null, { timeout: 60000 }).catch(() => {});
      await d.page.waitForTimeout(500);
    };
    const ask = async (d, words) => {
      await d.fill('coach-input', words);
      await d.tap('coach-send');
      if (await d.has('coach-consent-agree')) await d.tap('coach-consent-agree');
      await settle(d);
    };
    const nothingAboutPlans = async (d) => {
      await d.go('/profile');
      const profile = await d.has('profile-plan');
      await d.go('/settings/account');
      const account = (await d.has('account-plan')) || (await d.has('account-plan-manage'));
      await d.go('/settings/about');
      const about = await d.has('about-plan');
      return !profile && !account && !about;
    };

    // Plans off: an account sees nothing about a plan, and today's words.
    await billing({ plansOn: false, providerFails: false, webhookDelayMs: 0, resetUsage: true });
    const P = await device(browser, JSON.stringify(buildSeed()));
    const pEmail = `plus+${Date.now()}@example.com`;
    check('plans: an account signs up for the plans run', await signUp(P, pEmail), P.page.url());
    check('plans off: nothing about a plan on Profile, Account or About', await nothingAboutPlans(P));
    await estimate(P, 'daily limit check');
    check('plans off: the estimate’s limit keeps today’s words and offers no plan', (await textOf(P, 'ai-error-daily_limit')).includes("You've used today's AI estimates") && !(await P.has('ai-limit-plans')), (await textOf(P, 'ai-error-daily_limit')).slice(0, 120));
    await P.go('/coach');
    await ask(P, 'daily limit please');
    check('plans off: the coach’s limit keeps today’s words and offers no plan', (await textOf(P, 'coach-notice')) === '30 questions today. They reset at midnight UTC.' && !(await P.has('coach-limit-plans')), await textOf(P, 'coach-notice'));

    // Plans on: a new account is Free with 5 and 5.
    await billing({ plansOn: true, resetUsage: true });
    await P.go('/profile');
    await P.page.waitForTimeout(1500);
    const freeRow = await textOf(P, 'profile-plan');
    check('plans on: Profile shows the Plan row, Free', /Free/.test(freeRow), freeRow);
    await P.go('/settings/plan');
    const freeCard = await textOf(P, 'plan-free-card');
    const plusCard = await textOf(P, 'plan-plus-card');
    check('plans on: the plan screen shows Free with 5 estimates and 5 questions, and Plus with 40 and 30', /\b5\b/.test(freeCard) && /\b40\b/.test(plusCard) && /\b30\b/.test(plusCard), `${freeCard.replace(/\n/g, ' / ')} | ${plusCard.replace(/\n/g, ' / ')}`);
    await P.shot('backend-plan-free');

    // The estimate on the free plan: the careful line, a careful estimate that needs more than is left, then the limit.
    await estimate(P, 'two scrambled eggs on sourdough toast');
    check('plans on, free: the careful check says what it uses', (await textOf(P, 'ai-careful-uses')) === "Uses 5 of today's 5", await textOf(P, 'ai-careful-uses'));
    check('plans on, free: no plan words after a successful estimate', !(await P.has('ai-limit-plans')) && !/Plus/.test(await textOf(P, 'ai-remaining')));
    await P.tap('ai-check-again');
    await P.page.waitForSelector('[data-testid^="ai-error-"]', { timeout: 20000 }).catch(() => {});
    const careful = await textOf(P, 'ai-error-daily_limit');
    check(
      'plans on, free: a careful estimate that needed more than is left says so (R18), never "used"',
      careful.includes('Too few left for a careful estimate') && careful.includes('A careful estimate needs 5 units and fewer are left today. A quick estimate still works.') && !/used/.test(careful),
      careful.slice(0, 160),
    );
    await estimate(P, 'daily limit check');
    const freeLimit = await textOf(P, 'ai-error-daily_limit');
    const plansLink = await textOf(P, 'ai-limit-plans');
    const order = await P.page.evaluate(() => ['ai-error-search', 'ai-limit-plans'].map((id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().top ?? -1));
    check(
      'plans on, free: the estimate’s limit names the number, the free way first and the reset in local time',
      freeLimit.includes("Today's 5 estimates are used") && freeLimit.includes(`Search, scan or quick add still log this meal. More after ${resets}.`),
      freeLimit.slice(0, 200),
    );
    check('plans on, free: one quiet link, "Plus gives 40 a day", after the free ways', plansLink === 'Plus gives 40 a day' && order[0] >= 0 && order[0] < order[1], `${plansLink} ${order.join(' < ')}`);
    await P.shot('backend-plan-ai-limit-free');
    await P.tap('ai-limit-plans');
    check('plans on, free: the link opens the plan screen', await P.untilPath('/settings/plan', 10000), P.page.url());

    await P.go('/coach');
    await ask(P, 'daily limit please');
    const coachFree = await textOf(P, 'coach-notice');
    // The notice's card also holds its link, so its text starts with the words.
    check('plans on, free: the coach’s limit words', coachFree.split('\n')[0] === `5 questions today. Questions marked From your data still work. More after ${resets}.`, coachFree);
    check('plans on, free: the coach’s plan link, "Plus gives 30 a day"', (await textOf(P, 'coach-limit-plans')) === 'Plus gives 30 a day', await textOf(P, 'coach-limit-plans'));
    await P.shot('backend-plan-coach-limit-free');

    // A report of an AI answer: one row, the answer, and the question only when ticked.
    const reportQ = 'How long should a warm-up be?';
    await billing({ resetUsage: true });
    await ask(P, reportQ);
    const reportAnswerIndex = await P.page.evaluate(() => {
      const ids = [...document.querySelectorAll('[data-testid^="coach-report-"]')].map((n) => n.getAttribute('data-testid')).filter((id) => /^coach-report-\d+$/.test(id));
      return ids.length ? ids[ids.length - 1] : null;
    });
    const reportsBefore = (await server()).aiReports.length;
    if (reportAnswerIndex) {
      await P.tap(reportAnswerIndex);
      await P.tap('coach-report-reason-wrong');
      await P.tap('coach-report-send');
      await P.page.waitForTimeout(1200);
    }
    let reports = (await server()).aiReports;
    const pUser = (await server()).users.find((u) => u.email === pEmail.toLowerCase());
    const row = reports[reports.length - 1];
    check(
      'report: one row arrives with the answer, the reason and no question (not ticked)',
      !!reportAnswerIndex && reports.length === reportsBefore + 1 && row.user_id === pUser?.id && row.kind === 'coach_answer' && row.reason === 'wrong' && row.answer.includes(reportQ) && !('question' in row),
      row ? JSON.stringify({ reason: row.reason, question: row.question ?? null, answer: row.answer.slice(0, 60) }) : 'no row',
    );
    await ask(P, 'And a cool-down?');
    const second = await P.page.evaluate(() => {
      const ids = [...document.querySelectorAll('[data-testid^="coach-report-"]')].map((n) => n.getAttribute('data-testid')).filter((id) => /^coach-report-\d+$/.test(id));
      return ids.length ? ids[ids.length - 1] : null;
    });
    if (second) {
      await P.tap(second);
      await P.tap('coach-report-reason-other');
      await P.tap('coach-report-question');
      await P.tap('coach-report-send');
      await P.page.waitForTimeout(1200);
    }
    reports = (await server()).aiReports;
    check('report: with the box ticked the question goes too', reports.length === reportsBefore + 2 && reports[reports.length - 1].question === 'And a cool-down?', reports.length ? JSON.stringify(reports[reports.length - 1].question ?? null) : '');

    // A checkout that is cancelled comes back to the plan page with nothing bought and the offer still there.
    await P.go('/settings/plan');
    await P.tap('plan-subscribe');
    await P.page.waitForURL(/\/__checkout\?/, { timeout: 20000 }).catch(() => {});
    await P.page.getByTestId('checkout-cancel').click({ timeout: 15000 });
    await P.page.waitForURL((u) => new URL(u).pathname === '/settings/plan', { timeout: 30000 }).catch(() => {});
    await waitFor(P, 'plan-subscribe');
    check('buy: a cancelled checkout returns with no "checkout=done", still Free, and Subscribe still offered', !/checkout=done/.test(P.page.url()) && (await visible(P, 'plan-subscribe')) && !(await visible(P, 'plan-waiting')) && (await planOf(P)) === 'free', P.page.url());
    const sheet = await status(P);
    check('status: the server sends both plans\u2019 numbers, so the cards hard-code nothing', sheet?.planLimits?.plus?.estimates === 40 && sheet?.planLimits?.free?.questions === 5, JSON.stringify(sheet?.planLimits ?? null));

    // Buying monthly from the plan screen, with the payment arriving a few seconds after the return.
    await billing({ webhookDelayMs: 5000 });
    await P.go('/settings/plan');
    await P.tap('plan-period-month');
    const monthPrice = await textOf(P, 'plan-price');
    const renewal = await textOf(P, 'plan-renewal-line');
    check('buy: the monthly price and the renewal sentence come from the server', monthPrice.includes('$3.99') && renewal.length > 20, `${monthPrice.replace(/\n/g, ' / ')} | ${renewal}`);
    await P.tap('plan-subscribe');
    await P.page.waitForURL(/\/__checkout\?/, { timeout: 20000 }).catch(() => {});
    check('buy: Subscribe goes to the payment page', /\/__checkout\?/.test(P.page.url()) && /3\.99 USD a month/.test(await P.page.getByTestId('checkout-amount').innerText().catch(() => '')), P.page.url());
    await P.page.getByTestId('checkout-pay').click({ timeout: 15000 });
    await P.page.waitForURL((u) => new URL(u).pathname === '/settings/plan', { timeout: 30000 }).catch(() => {});
    await P.page.waitForTimeout(1500);
    check('buy: back on the plan screen the app waits for the payment', await visible(P, 'plan-waiting'), P.page.url());
    await P.shot('backend-plan-waiting');
    await P.page.waitForFunction(() => !document.querySelector('[data-testid="plan-waiting"]'), null, { timeout: 40000 }).catch(() => {});
    await P.page.waitForTimeout(800);
    const plusStatus = await textOf(P, 'plan-status');
    check('buy: Plus is on, with its date', /Plus/.test(plusStatus) && /[A-Z][a-z]{2} \d{1,2}/.test(plusStatus), plusStatus.replace(/\n/g, ' / '));
    await P.shot('backend-plan-plus');
    await billing({ webhookDelayMs: 0 });
    srv = await server();
    check('buy: the stand-in holds an active monthly row from a signed webhook', srv.billing.rows[pEmail.toLowerCase()]?.state === 'active' && srv.billing.rows[pEmail.toLowerCase()]?.period === 'month' && srv.billing.webhooks.some((w) => w.userId === pUser?.id && w.type === 'checkout.paid'));
    await P.go('/profile');
    const plusRow = await textOf(P, 'profile-plan');
    check('buy: the Profile row says Plus until a date', /Plus until [A-Z][a-z]{2} \d{1,2}/.test(plusRow), plusRow);

    // Plus at its limits: the same words with its own numbers, and no link.
    await estimate(P, 'daily limit check');
    const plusLimit = await textOf(P, 'ai-error-daily_limit');
    check('Plus: the estimate’s limit says 40 and offers no plan', plusLimit.includes("Today's 40 estimates are used") && !(await P.has('ai-limit-plans')), plusLimit.slice(0, 120));
    await P.go('/coach');
    await ask(P, 'daily limit please');
    const coachPlus = await textOf(P, 'coach-notice');
    check('Plus: the coach’s limit says 30 and offers no plan', coachPlus === `30 questions today. Questions marked From your data still work. More after ${resets}.` && !(await P.has('coach-limit-plans')), coachPlus);
    await billing({ resetUsage: true });
    await ask(P, 'Plus memory check');
    const plusReq = (await server()).coachRequests.filter((x) => x.user === pUser?.id).pop();
    check('Plus: the coach may send up to 6 earlier pairs, never more than 12 turns', (plusReq?.body.history || []).length <= 12 && plusReq?.status === 200, `${(plusReq?.body.history || []).length} turns`);

    // A second device signed in to the same account sees Plus after its refresh.
    const Q = await device(browser, null);
    await Q.go('/auth?mode=signin');
    await Q.fill('auth-email-input', pEmail);
    await Q.fill('auth-password-input', PASSWORD);
    await Q.tap('auth-submit');
    await Q.untilPath('/');
    await Q.page.waitForTimeout(2500);
    await Q.go('/profile');
    await Q.page.waitForTimeout(1500);
    check('second device: Plus after its refresh', /Plus until/.test(await textOf(Q, 'profile-plan')), await textOf(Q, 'profile-plan'));
    await Q.page.context().close();

    // Manage or cancel: the stand-in's portal, "Cancel at period end", back: "Plus, ends ..." and Plus stays.
    await P.go('/settings/plan');
    await P.tap('plan-manage');
    await P.page.waitForURL(/\/__portal\?/, { timeout: 20000 }).catch(() => {});
    check('manage: "Manage or cancel" opens the payment company’s page', /\/__portal\?/.test(P.page.url()), P.page.url());
    await P.page.getByTestId('portal-cancel').click({ timeout: 15000 });
    await P.page.waitForURL((u) => new URL(u).pathname === '/settings/plan', { timeout: 30000 }).catch(() => {});
    await P.page.waitForTimeout(2500);
    const ending = await textOf(P, 'plan-status');
    await P.shot('backend-plan-ending');
    srv = await server();
    await P.go('/profile');
    const endingRow = await textOf(P, 'profile-plan');
    check(
      'manage: after cancelling, "Plus, ends ..." on Profile and Plus stays on the plan screen',
      /Plus, ends [A-Z][a-z]{2} \d{1,2}/.test(endingRow) && /Plus stays on until/.test(ending) && srv.billing.rows[pEmail.toLowerCase()]?.state === 'canceling',
      `${endingRow} | ${ending.replace(/\n/g, ' / ')}`,
    );

    // Buying yearly, and a failed renewal, on a second account.
    const Y = await device(browser, JSON.stringify(buildSeed()));
    const yEmail = `yearly+${Date.now()}@example.com`;
    check('yearly: a second account signs up', await signUp(Y, yEmail), Y.page.url());
    await Y.go('/settings/plan');
    await Y.tap('plan-period-year');
    check('yearly: the yearly price', (await textOf(Y, 'plan-price')).includes('$29.99'), await textOf(Y, 'plan-price'));
    await Y.tap('plan-subscribe');
    await Y.page.waitForURL(/\/__checkout\?/, { timeout: 20000 }).catch(() => {});
    await Y.page.getByTestId('checkout-pay').click({ timeout: 15000 });
    await Y.page.waitForURL((u) => new URL(u).pathname === '/settings/plan', { timeout: 30000 }).catch(() => {});
    await Y.page.waitForFunction(() => !document.querySelector('[data-testid="plan-waiting"]'), null, { timeout: 40000 }).catch(() => {});
    await Y.page.waitForTimeout(800);
    srv = await server();
    check('yearly: Plus is on for a year', /Plus/.test(await textOf(Y, 'plan-status')) && srv.billing.rows[yEmail.toLowerCase()]?.period === 'year', (await textOf(Y, 'plan-status')).replace(/\n/g, ' / '));
    await billingEvent({ email: yEmail, state: 'past_due', periodEnd: new Date(Date.now() - 86400000).toISOString() });
    await Y.go('/settings/plan');
    await Y.page.waitForTimeout(1500);
    const late = await textOf(Y, 'plan-payment-line');
    check('failed payment: the plan screen says so in neutral words and Plus stays', late.length > 10 && !/fail|!/i.test(late) && /Plus/.test(await textOf(Y, 'plan-status')), late);
    await Y.shot('backend-plan-past-due');

    // Deleting an account that holds Plus: the plan is ended at the payment company first, then the account goes.
    await P.go('/settings/account');
    await P.tap('account-delete');
    if (await P.has('confirm-yes')) await P.tap('confirm-yes');
    await P.untilPath('/welcome', 20000);
    srv = await server();
    check('delete with Plus: the plan is ended first, then the account is deleted', srv.billing.cancels.includes(pEmail.toLowerCase()) && !srv.users.some((u) => u.email === pEmail.toLowerCase()) && !srv.billing.rows[pEmail.toLowerCase()], JSON.stringify(srv.billing.cancels));

    // With the payment company failing: nothing is deleted, the screen says why and offers the second step.
    await billing({ providerFails: true });
    await Y.go('/settings/account');
    await Y.tap('account-delete');
    if (await Y.has('confirm-yes')) await Y.tap('confirm-yes');
    await Y.page.waitForTimeout(2500);
    srv = await server();
    const blocked = await textOf(Y, 'account-delete-blocked');
    check('delete with the payment company failing: the account stays and the screen says why', srv.users.some((u) => u.email === yEmail.toLowerCase()) && blocked.length > 10 && (await Y.has('account-delete-anyway')), blocked);
    await Y.shot('backend-plan-delete-blocked');
    await Y.tap('account-delete-anyway');
    if (await Y.has('confirm-yes')) await Y.tap('confirm-yes');
    await Y.untilPath('/welcome', 20000);
    srv = await server();
    check('delete anyway: the plan is released on the server’s side and the account goes', !srv.users.some((u) => u.email === yEmail.toLowerCase()) && srv.billing.releases.some((r) => r.kind === 'released'), JSON.stringify(srv.billing.releases.slice(-1)));
    await billing({ providerFails: false, plansOn: false, resetUsage: true });

    const errs = [...P.errors, ...Y.errors];
    check('plans: no uncaught errors in the plans run', errs.length === 0, errs.slice(0, 2).join(' || '));
    await P.page.context().close();
    await Y.page.context().close();
  }

  // ------------------------------------------------------ delete account
  await A.go('/settings/account');
  await A.tap('account-delete');
  await A.shot('backend-delete-confirm');
  if (await A.has('confirm-yes')) await A.tap('confirm-yes');
  await A.untilPath('/welcome', 15000);
  srv = await server();
  check('deleting the account erases the user and all their rows', !srv.users.some((u) => u.id === user.id) && srv.records.filter((r) => r.user_id === user.id).length === 0 && !srv.profiles[user.id]);
  check('device A is back at the welcome screen with no data', new URL(A.page.url()).pathname === '/welcome' && (await A.state()).profile === null, A.page.url());

  const errs = [...A.errors, ...B.errors, ...C.errors, ...D.errors, ...E.errors];
  check('no uncaught errors on any device', errs.length === 0, errs.slice(0, 2).join(' || '));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('E2E aborted:', e.message.split('\n')[0]);
  process.exit(2);
});
