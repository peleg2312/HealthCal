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

(async () => {
  const { buildSeed } = await import('./seed.mjs');
  const browser = await chromium.launch();

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
  check('accepting makes them friends on the server', await waitFor(A, `friends-card-${tid(user2.id)}`) && (await server()).friendships.some((f) => f.status === 'accepted' && [f.requester, f.addressee].sort().join() === [user.id, user2.id].sort().join()));
  await A.page.waitForTimeout(800);
  await A.shot('friends-full');

  // Each sees the other's week; the minutes match that person's own Train screen.
  const ownMinutes = async (d) => {
    await d.go('/train');
    return d.text('train-guideline-minutes');
  };
  const minutesA = await ownMinutes(A);
  const minutesD = await ownMinutes(D);
  await A.go('/friends');
  await waitFor(A, `friends-minutes-${tid(user2.id)}`);
  const samSeenByAlex = (await A.text(`friends-minutes-${tid(user2.id)}`)).replace(/\D+/g, '');
  await D.go('/friends');
  await waitFor(D, `friends-minutes-${tid(user.id)}`);
  const alexSeenBySam = (await D.text(`friends-minutes-${tid(user.id)}`)).replace(/\D+/g, '');
  check("each sees the other's weekly minutes, equal to that person's own", samSeenByAlex === minutesD && alexSeenBySam === minutesA && minutesA !== minutesD, `Alex sees Sam ${samSeenByAlex} (own ${minutesD}), Sam sees Alex ${alexSeenBySam} (own ${minutesA})`);
  const card = await A.text(`friends-friend-${tid(user2.id)}`);
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
  await A.go('/friends');
  await waitFor(A, `friends-cheer-${latest?.id}`);
  await A.tap(`friends-cheer-${latest?.id}`);
  await A.page.waitForTimeout(1200);
  srv = await server();
  check('cheering shows at once and is stored', (await A.text(`friends-cheer-${latest?.id}`)) === 'Cheered' && srv.cheers.some((c) => c.from_user === user.id && c.to_user === user2.id && c.ref === latest?.id));
  await D.go('/friends');
  await waitFor(D, 'friends-cheers');
  const cheersText = (await D.has('friends-cheers')) ? await D.text('friends-cheers') : '';
  check('the cheer appears on the other device, naming the workout', /Alex\s+cheered your (?!day)/.test(cheersText) && !/workout of yours/.test(cheersText), cheersText.replace(/\s+/g, ' ').slice(0, 80));
  await D.shot('friends-cheer-received');

  // Removing the friend clears both sides.
  await A.go('/friends');
  await A.tap(`friends-card-${tid(user2.id)}`);
  await A.tap('friends-remove');
  await A.tap('confirm-yes');
  await A.page.waitForTimeout(1500);
  srv = await server();
  const between = (x) => [x.requester ?? x.from_user, x.addressee ?? x.to_user].sort().join() === [user.id, user2.id].sort().join();
  check('removing a friend clears the friendship and cheers on the server', !srv.friendships.some(between) && !srv.cheers.some(between) && !(await A.has(`friends-card-${tid(user2.id)}`)));
  await D.go('/friends');
  await waitFor(D, 'friends-empty');
  check('the other side no longer shows them either', (await D.has('friends-empty')) && !(await D.has(`friends-card-${tid(user.id)}`)));

  // Turning friends off removes the card.
  await D.tap('friends-settings-open');
  await D.tap('friends-leave');
  await D.tap('confirm-yes');
  await D.page.waitForTimeout(1500);
  srv = await server();
  check('turning friends off removes the card and returns to the set-up', !srv.social[user2.id] && (await waitFor(D, 'friends-setup-save')));

  // ------------------------------------------------------ delete account
  await A.go('/settings/account');
  await A.tap('account-delete');
  await A.shot('backend-delete-confirm');
  if (await A.has('confirm-yes')) await A.tap('confirm-yes');
  await A.untilPath('/welcome', 15000);
  srv = await server();
  check('deleting the account erases the user and all their rows', !srv.users.some((u) => u.id === user.id) && srv.records.filter((r) => r.user_id === user.id).length === 0 && !srv.profiles[user.id]);
  check('device A is back at the welcome screen with no data', new URL(A.page.url()).pathname === '/welcome' && (await A.state()).profile === null, A.page.url());

  const errs = [...A.errors, ...B.errors, ...C.errors, ...D.errors];
  check('no uncaught errors on any device', errs.length === 0, errs.slice(0, 2).join(' || '));

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('E2E aborted:', e.message.split('\n')[0]);
  process.exit(2);
});
