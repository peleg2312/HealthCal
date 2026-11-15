#!/usr/bin/env node
/**
 * Store screenshots: captures the running app with the demo data and composes the
 * App Store and Google Play frames in the Pour look. One command regenerates the set:
 *
 *   node scripts/dev/store-frames.cjs
 *
 * Writes (see docs/store-listing.md for the captions and the specifications):
 *   store/app-store/iphone-6.9/01-....png  1320 x 2868  iPhone, Dynamic Island, large display
 *   store/app-store/iphone-6.3/01-....png  1206 x 2622  iPhone, Dynamic Island, medium display (the required size)
 *   store/app-store/ipad-13/01-....png     2064 x 2752  iPad 13-inch (required, the app supports iPad)
 *   store/google-play/phone/01-....png     1440 x 2560  Play phone, 9:16 portrait
 *   store/_sheet.png                       contact sheet of every set
 *
 * Where the pictures come from:
 *   - Today, food search, water, Train, the weekly recap and the three looks: the dev server
 *     (--url, default http://localhost:8081) with scripts/dev/seed.mjs `buildSeed({ store: true })`,
 *     the clock held at 7:30 pm so the greeting and the day agree.
 *   - The photo estimate and friends need a backend, so the script exports a web build pointed at the
 *     local stand-in (scripts/dev/mock-backend.cjs, ports 54391 and 8091, separate from the e2e ports),
 *     signs up two people, makes them friends, sends a cheer and analyses a meal photo. The stand-in
 *     answers every analysis with the same fixed result (eggs on toast), so the photo is eggs on toast.
 *
 * Flags:
 *   --url=http://localhost:8081   dev server to capture from
 *   --no-backend                  skip the backend captures and reuse the last ones (frames 3 and 7)
 *   --backend-only                take only the backend captures and reuse the last dev-server ones
 *   --compose                     recompose from the last captures without opening the app at all
 *   --only=1,4                    compose only these frames (captures are still taken unless --compose)
 *   --describe                    frame 3 uses the "Describe a meal" path instead of the photo
 *
 * Needs only what is installed: Playwright, the Expo CLI and the two font packages.
 */
const { chromium } = require('playwright');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// This file's folder (scripts/dev), from the command line: the lint setup does not define __dirname.
const HERE = path.dirname(path.resolve(process.argv[1]));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'store');
const CAP = path.join(os.tmpdir(), 'healthcal-store-captures');
const BUILD = path.join(os.tmpdir(), 'healthcal-store-build');
const PHOTO = path.join(OUT, 'source', 'scrambled-eggs-on-toast-cc0.jpg');
const FONTS = path.join(ROOT, 'node_modules', '@expo-google-fonts');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const DEV = flags.url || 'http://localhost:8081';
const API_PORT = 54391;
const STATIC_PORT = 8091;
const ONLY = flags.only ? String(flags.only).split(',').map(Number) : null;

// ------------------------------------------------------------------ the brand
// The Blossom palette (src/theme/tokens.ts): raspberry ground, champagne type, aubergine ink.
const C = { ground: '#C43670', head: '#FBF4EB', sub: '#FBD9E5', ink: '#3B1427', pink: '#F283AF' };

// ------------------------------------------------------------------ sizes
// Apple: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
// Google: https://support.google.com/googleplay/android-developer/answer/9866151
const TARGETS = [
  { dir: 'app-store/iphone-6.9', w: 1320, h: 2868, device: 'phone', store: 'apple', label: 'App Store, iPhone 6.9" (1320 x 2868)' },
  { dir: 'app-store/iphone-6.3', w: 1206, h: 2622, device: 'phone', store: 'apple', label: 'App Store, iPhone 6.3" (1206 x 2622)' },
  { dir: 'app-store/ipad-13', w: 2064, h: 2752, device: 'tablet', store: 'apple', label: 'App Store, iPad 13" (2064 x 2752)' },
  { dir: 'google-play/phone', w: 1440, h: 2560, device: 'phone', store: 'google', label: 'Google Play, phone (1440 x 2560)' },
];

// ------------------------------------------------------------------ the story
// One idea per frame. `sub` may differ per store: the App Store must not name another platform.
const FRAMES = [
  { n: 1, slug: 'day-fills-up', shot: 'today', lift: true, head: ['Watch your day', 'fill up'], sub: 'Calories, macros and exercise in one cup' },
  { n: 2, slug: 'two-taps', shot: 'search', lift: true, head: ['Log lunch in', 'two taps'], sub: 'Your usual foods are already waiting' },
  {
    n: 3, slug: 'honest-estimate', shot: 'photo', lift: true, head: ['A photo, an', 'honest estimate'], sub: 'A likely range, and you check every item',
    // With --describe the frame shows a typed description, so it does not promise a photo.
    describe: { head: ['Describe a meal,', 'get a range'], sub: 'An honest estimate, and you check every item' },
  },
  { n: 4, slug: 'water', shot: 'water', lift: true, head: ['Water goals', 'fill to the brim'], sub: 'Reminders say what is left, then stay quiet' },
  {
    n: 5, slug: 'workouts', shot: 'train', lift: true, head: ['Workouts from', 'your watch'],
    sub: { apple: 'Import Garmin files with measured calories', google: 'From Garmin files or Health Connect' },
  },
  { n: 6, slug: 'weekly-recap', shot: 'recap', lift: true, head: ['A weekly check-in,', 'no shame'], sub: 'Wins first. Over budget is just information.' },
  { n: 7, slug: 'friends', shot: 'friends', lift: true, head: ['Friends who', 'cheer you on'], sub: 'They see workouts, never food or weight' },
  { n: 8, slug: 'free', three: true, head: ['Free. No ads.', 'No paywall.'], sub: 'Three looks, full export, your data stays yours' },
];

// ------------------------------------------------------------------ captures
// Each capture is the screen as a phone (390 x 844 at 3x) and as an iPad 13" (1032 x 1376 at 2x),
// plus the "lift": the part of the screen that is shown again, larger, beside the device.
const VIEWPORTS = {
  phone: { width: 390, height: 844, deviceScaleFactor: 3 },
  tablet: { width: 1032, height: 1376, deviceScaleFactor: 2 },
};
const DEV_SHOTS = {
  today: { route: '/', lift: ['today-energy'] },
  // The first four usual foods with their one-tap add buttons.
  search: { route: '/food/search?meal=lunch', lift: [0, 1, 2, 3].flatMap((i) => [`usual-${i}`, `usual-${i}-add`]), liftPad: 8 },
  water: { route: '/water', lift: ['water-hero'] },
  // The Garmin row is below the fold: it is lifted onto the middle of the screen (liftAt, 0 to 1).
  train: { route: '/train', lift: ['^session-source-'], liftRow: true, liftAt: 0.6 },
  // The win headline is plain text on the screen, so its lift takes a margin of the screen around it.
  recap: { route: '/recap', lift: ['recap-win', 'recap-tiles'], liftPad: 16 },
  'today-dark': { route: '/', theme: 'dark' },
  'today-light': { route: '/', theme: 'light' },
};

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capPath = (name, device, part = 'screen') => path.join(CAP, `${name}-${device}-${part}.png`);
const metaPath = (name, device) => path.join(CAP, `${name}-${device}.json`);

function localTime(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Testids to find: 'x' exact, '^x' prefix. */
const selectorFor = (id) => (id.startsWith('^') ? `[data-testid^="${id.slice(1)}"]` : `[data-testid="${id}"]`);

async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Scroll React Native Web's inner scroller (the one holding `sel`) by `dy` px, or so `sel` sits `offset` px below the top. */
async function scrollTo(page, sel, offset, dy) {
  await page.evaluate(({ sel, offset, dy }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    let s = el.parentElement;
    while (s && !(s.scrollHeight > s.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
    if (s) s.scrollTop += dy ?? el.getBoundingClientRect().top - offset;
  }, { sel, offset, dy });
  await page.waitForTimeout(400);
}

/** Union of the elements' boxes, in CSS px of the viewport. With `row`, the box of the whole row (its card). */
async function boxOf(page, ids, row) {
  return page.evaluate(({ sels, row }) => {
    let r = null;
    for (const sel of sels) {
      for (const found of [...document.querySelectorAll(sel)].slice(0, 1)) {
        let el = found;
        if (row) {
          // Climb to the nearest ancestor that is a whole card (has a border), so the row is lifted entire.
          let p = el.parentElement;
          while (p && p !== document.body && parseFloat(getComputedStyle(p).borderTopWidth) === 0) p = p.parentElement;
          if (p && p !== document.body) el = p;
        }
        const b = el.getBoundingClientRect();
        r = r ? { x: Math.min(r.x, b.x), y: Math.min(r.y, b.y), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) } : { x: b.x, y: b.y, r: b.right, b: b.bottom };
      }
    }
    return r && { x: r.x, y: r.y, width: r.r - r.x, height: r.b - r.y };
  }, { sels: ids.map(selectorFor), row: !!row });
}

/** Screenshot the viewport, then the lift (growing the viewport if the lift is below the fold). */
async function captureScreen(page, name, device, spec) {
  if (spec.scrollTo) await scrollTo(page, selectorFor(spec.scrollTo), spec.scrollOffset ?? 96);
  const errors = await page.evaluate(() => document.body.innerText.slice(0, 400));
  if (/Unmatched Route|Something went wrong|Uncaught Error|Unable to resolve/i.test(errors)) throw new Error(`${name}: the page shows an error screen: ${errors.replace(/\s+/g, ' ')}`);
  await page.screenshot({ path: capPath(name, device) });
  // The screen's own background, for the device's status bar.
  const meta = {};
  meta.bg = await page.evaluate(() => {
    let el = document.elementFromPoint(4, 4);
    while (el && (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)')) el = el.parentElement;
    return el ? getComputedStyle(el).backgroundColor : '#FBF4EB';
  });
  if (spec.lift) {
    const box = await boxOf(page, spec.lift, spec.liftRow);
    if (!box) throw new Error(`${name}: nothing to lift (${spec.lift.join(', ')})`);
    const lp = spec.liftPad || 0;
    meta.lift = { x: box.x - lp, y: box.y - lp, width: box.width + lp * 2, height: box.height + lp * 2 };
    const vp = page.viewportSize();
    if (box.y < 0 || box.y + box.height > vp.height) {
      await scrollTo(page, selectorFor(spec.lift[0]), 0, box.y - 40);
    }
    const now = await boxOf(page, spec.lift, spec.liftRow);
    const pad = spec.liftPad || 0;
    await page.screenshot({ path: capPath(name, device, 'lift'), clip: { x: now.x - pad, y: now.y - pad, width: now.width + pad * 2, height: now.height + pad * 2 } });
  }
  if (spec.liftAt != null) meta.liftAt = spec.liftAt;
  fs.writeFileSync(metaPath(name, device), JSON.stringify(meta));
  log(`  captured ${name} (${device})`);
}

async function newDevice(browser, device, { seedJson, theme = 'light', fixedTime, storageState } = {}) {
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS[device].width, height: VIEWPORTS[device].height },
    deviceScaleFactor: VIEWPORTS[device].deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
    reducedMotion: 'reduce',
    storageState,
  });
  if (fixedTime) await context.clock.setFixedTime(fixedTime);
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
  return { context, page, errors };
}

async function captureDev(browser, buildSeed) {
  log(`Capturing from ${DEV}`);
  const evening = localTime(19, 30);
  for (const device of ['phone', 'tablet']) {
    for (const [name, spec] of Object.entries(DEV_SHOTS)) {
      const theme = spec.theme || 'blossom';
      const seedJson = JSON.stringify(buildSeed({ theme, store: true }));
      const d = await newDevice(browser, device, { seedJson, theme, fixedTime: evening });
      await d.page.goto(DEV + spec.route, { waitUntil: 'networkidle', timeout: 120_000 });
      await settle(d.page);
      await captureScreen(d.page, name, device, spec);
      if (d.errors.length) log(`  ! ${name}: ${d.errors.join(' | ').slice(0, 300)}`);
      await d.context.close();
    }
  }
}

// ------------------------------------------------------------------ backend captures
async function waitForUrl(url, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`${url} did not answer`);
}

async function captureBackend(browser, buildSeed) {
  log('Exporting a web build for the stand-in backend');
  const env = { ...process.env, EXPO_PUBLIC_SUPABASE_URL: `http://localhost:${API_PORT}`, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key-for-local-end-to-end-tests' };
  const exp = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', BUILD], { cwd: ROOT, env, encoding: 'utf8' });
  if (exp.status !== 0) throw new Error(`expo export failed:\n${(exp.stderr || exp.stdout).slice(-2000)}`);
  const mock = spawn(process.execPath, [path.join(HERE, 'mock-backend.cjs'), `--port=${API_PORT}`, `--static=${BUILD}`, `--static-port=${STATIC_PORT}`], { stdio: 'ignore' });
  const stop = () => mock.kill();
  process.on('exit', stop);
  try {
    await waitForUrl(`http://localhost:${API_PORT}/__state`);
    await waitForUrl(`http://localhost:${STATIC_PORT}/`);
    const BASE = `http://localhost:${STATIC_PORT}`;
    const stamp = Date.now();
    const go = async (d, route) => {
      await d.page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120_000 });
      await d.page.waitForTimeout(900);
    };
    const tap = (d, sel) => d.page.locator(sel).first().click({ timeout: 20_000 });
    const until = (d, sel, timeout = 25_000) => d.page.waitForSelector(sel, { timeout });
    const signUp = async (d, email) => {
      await go(d, '/auth?mode=signup');
      await d.page.getByTestId('auth-email-input').first().fill(email);
      await d.page.getByTestId('auth-password-input').first().fill('store screenshots only');
      await tap(d, '[data-testid="auth-submit"]');
      await d.page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 30_000 });
      await d.page.waitForTimeout(2500);
    };
    const friendsOn = async (d, name) => {
      await go(d, '/friends');
      await until(d, '[data-testid="friends-setup-save"]');
      if (name) await d.page.getByTestId('friends-setup-name').first().fill(name);
      await tap(d, '[data-testid="friends-setup-save"]');
      await until(d, '[data-testid="friends-code"]');
      return (await d.page.getByTestId('friends-code').first().innerText()).replace(/[^A-Za-z0-9]/g, '') || null;
    };

    // Alex: the store demo data. Maya: the ordinary demo data under another name.
    const alex = await newDevice(browser, 'phone', { seedJson: JSON.stringify(buildSeed({ theme: 'blossom', store: true })), theme: 'blossom' });
    const mayaSeed = buildSeed({ theme: 'blossom' });
    mayaSeed.state.profile.name = 'Maya';
    const maya = await newDevice(browser, 'phone', { seedJson: JSON.stringify(mayaSeed), theme: 'blossom' });
    log('  signing up two people');
    await signUp(alex, `alex+${stamp}@example.com`);
    await signUp(maya, `maya+${stamp}@example.com`);
    log('  making them friends');
    const code = await friendsOn(alex);
    await friendsOn(maya, 'Maya');
    if (!code) throw new Error('friends: no invite code');
    await go(maya, `/friends/add?invite=${code}`);
    await tap(maya, '[data-testid="friends-add-send"]');
    await until(maya, '[data-testid="friends-add-outcome-sent"]');
    await go(alex, '/friends');
    await tap(alex, '[data-testid^="friends-accept-"]');
    await until(alex, '[data-testid^="friends-card-"]');
    // Each cheers the other's latest workout.
    await go(maya, '/friends');
    await until(maya, '[data-testid^="friends-cheer-"]');
    await tap(maya, '[data-testid^="friends-cheer-"]');
    await maya.page.waitForTimeout(1200);
    await go(alex, '/friends');
    await until(alex, '[data-testid^="friends-cheer-"]');
    await tap(alex, '[data-testid^="friends-cheer-"]');
    await alex.page.waitForTimeout(1200);
    const state = await alex.context.storageState();

    // Maya's card and the cheers received, as one piece, with the screen scrolled to them.
    const friendsSpec = { lift: ['^friends-friend-', 'friends-cheers'], liftPad: 14, scrollTo: '^friends-friend-', scrollOffset: 250 };
    // With --describe there is no photo hero: the card holding the dish name and the total is lifted.
    const photoSpec = flags.describe ? { lift: ['ai-dish'], liftRow: true } : { lift: ['ai-photo-hero'] };
    const analyse = async (d) => {
      if (flags.describe) {
        await go(d, '/food/photo?meal=breakfast&mode=text');
        await d.page.getByTestId('ai-description').first().fill('Two scrambled eggs on a slice of sourdough toast');
      } else {
        await go(d, '/food/photo?meal=breakfast&mode=photo');
        const chooser = d.page.waitForEvent('filechooser', { timeout: 15_000 });
        await tap(d, '[data-testid="ai-choose-photo"]');
        await (await chooser).setFiles(PHOTO);
        await d.page.waitForTimeout(1500);
      }
      if (await d.page.getByTestId('ai-analyse').count()) await tap(d, '[data-testid="ai-analyse"]');
      // The first live estimate on a device asks before anything is sent.
      await d.page.getByTestId('ai-consent-agree').first().waitFor({ timeout: 5000 }).then(() => tap(d, '[data-testid="ai-consent-agree"]')).catch(() => {});
      await until(d, '[data-testid="ai-add-to-diary"]');
      await d.page.waitForTimeout(1200);
      if (await d.page.getByText(/Sample mode|Sample result/).count()) throw new Error('photo: the sample result is showing, not a real analysis');
    };

    for (const device of ['phone', 'tablet']) {
      const d = device === 'phone' ? alex : await newDevice(browser, device, { storageState: state, theme: 'blossom' });
      await go(d, '/friends');
      await until(d, '[data-testid="friends-cheers"]').catch(() => log('  ! friends: no cheers card'));
      await d.page.waitForTimeout(800);
      await captureScreen(d.page, 'friends', device, friendsSpec);
      await analyse(d);
      await captureScreen(d.page, 'photo', device, photoSpec);
      if (d.errors.length) log(`  ! backend ${device}: ${d.errors.join(' | ').slice(0, 300)}`);
      if (device !== 'phone') await d.context.close();
    }
    await alex.context.close();
    await maya.context.close();
  } finally {
    stop();
  }
}

// ------------------------------------------------------------------ composing
const fontFace = (name, file) => `@font-face{font-family:'${name}';src:url('file://${path.join(FONTS, file)}')}`;
const FONT_CSS =
  fontFace('Bricolage', 'bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf') +
  fontFace('BricolageSemi', 'bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf') +
  fontFace('Hanken', 'hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf');

const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const url = (file) => `file://${file}`;

/** Layout for each frame shape, in a coordinate space 1320 wide. */
function layoutFor(t) {
  const H = Math.round((1320 * t.h) / t.w);
  if (t.device === 'tablet') return { H, headTop: 96, headSize: 104, subSize: 46, subGap: 26, devTop: 460, devW: 1080, liftW: 1000 };
  if (t.store === 'google') return { H, headTop: 120, headSize: 118, subSize: 50, subGap: 30, devTop: 540, devW: 940, liftW: 1180 };
  return { H, headTop: 176, headSize: 124, subSize: 50, subGap: 34, devTop: 640, devW: 1010, liftW: 1200 };
}

/** A device with the capture as its screen and a status bar in the screen's own colour. */
const STATUS_CSS = { phone: 50, tablet: 26 };
const PAD = { phone: 0.026, tablet: 0.03 };
/** Height of a whole device (not bleeding off the frame) for a width. */
const wholeHeight = (t, width) => {
  const p = PAD[t.device];
  const vp = VIEWPORTS[t.device];
  return Math.round(width * ((1 - 2 * p) * (STATUS_CSS[t.device] + vp.height) / vp.width + 2 * p));
};

/** A device with the capture as its screen. It bleeds off the bottom of the frame unless `whole`. */
function deviceHtml(t, shot, width, style = '', whole = false) {
  const tablet = t.device === 'tablet';
  const vp = VIEWPORTS[t.device];
  const pad = Math.round(width * PAD[t.device]);
  const inner = width - pad * 2;
  const k = inner / vp.width; // device px per CSS px of the capture
  const statusH = Math.round(STATUS_CSS[t.device] * k);
  const meta = JSON.parse(fs.readFileSync(metaPath(shot, t.device), 'utf8'));
  const radius = Math.round(inner * (tablet ? 0.03 : 0.12));
  const dark = /rgb\((\d+), (\d+), (\d+)\)/.exec(meta.bg);
  const lum = dark ? (0.2126 * dark[1] + 0.7152 * dark[2] + 0.0722 * dark[3]) / 255 : 1;
  const fg = lum < 0.5 ? '#F6EEE3' : '#1B1310';
  const island = tablet ? '' : `<div style="position:absolute;left:50%;top:${Math.round(11 * k)}px;width:${Math.round(124 * k)}px;height:${Math.round(36 * k)}px;margin-left:${-Math.round(62 * k)}px;background:#000;border-radius:${Math.round(18 * k)}px"></div>`;
  const status = `<div style="position:relative;height:${statusH}px;background:${meta.bg};color:${fg};font:600 ${Math.round((tablet ? 13 : 16) * k)}px/1 Hanken">
      <span style="position:absolute;left:${Math.round((tablet ? 22 : 34) * k)}px;top:${Math.round((tablet ? 7 : 19) * k)}px">7:30</span>${island}
      <span style="position:absolute;right:${Math.round((tablet ? 22 : 30) * k)}px;top:${Math.round((tablet ? 7 : 20) * k)}px;width:${Math.round(25 * k)}px;height:${Math.round(12 * k)}px;border:${Math.max(2, Math.round(1.2 * k))}px solid ${fg};border-radius:${Math.round(4 * k)}px;opacity:.9;box-sizing:border-box;padding:${Math.round(1.5 * k)}px"><span style="display:block;height:100%;width:80%;background:${fg};border-radius:${Math.round(2 * k)}px"></span></span>
    </div>`;
  const outer = `${radius + pad}px ${radius + pad}px ${whole ? radius + pad : 0}px ${whole ? radius + pad : 0}px`;
  const screen = `${radius}px ${radius}px ${whole ? radius : 0}px ${whole ? radius : 0}px`;
  return `<div class="device" style="width:${width}px;padding:${pad}px;border-radius:${outer};${style}">
    <div style="border-radius:${screen};overflow:hidden;background:${meta.bg}">${status}<img src="${url(capPath(shot, t.device))}" style="display:block;width:100%"></div></div>`;
}

function frameHtml(f, t) {
  if (flags.describe && f.describe) f = { ...f, ...f.describe };
  const L = layoutFor(t);
  const sub = typeof f.sub === 'string' ? f.sub : f.sub[t.store];
  let body = '';
  if (f.three) {
    // Three whole devices: Blossom in front, dark and light behind it, each showing the same Today.
    const fit = (L.H - L.devTop - 80) / wholeHeight(t, 1000) * 1000;
    const big = Math.round(Math.min(t.device === 'tablet' ? 760 : 780, fit));
    // Centred in the space under the words.
    const top = L.devTop + Math.max(0, Math.round((L.H - L.devTop - 40 - wholeHeight(t, big)) / 2));
    const small = Math.round(big * 0.76);
    const sideTop = top + Math.round((wholeHeight(t, big) - wholeHeight(t, small)) * 0.7);
    const overlap = Math.round(small * 0.3);
    const ring = `box-shadow:0 0 0 ${Math.round(big * 0.014)}px ${C.ground}`; // a gap in the ground colour, not a shadow
    body += deviceHtml(t, 'today-dark', small, `position:absolute;top:${sideTop}px;left:${Math.round(660 - big / 2 - small + overlap)}px`, true);
    body += deviceHtml(t, 'today-light', small, `position:absolute;top:${sideTop}px;left:${Math.round(660 + big / 2 - overlap)}px`, true);
    body += deviceHtml(t, 'today', big, `position:absolute;top:${top}px;left:${Math.round(660 - big / 2)}px;${ring}`, true);
  } else {
    const left = Math.round((1320 - L.devW) / 2);
    body += deviceHtml(t, f.shot, L.devW, `position:absolute;top:${L.devTop}px;left:${left}px`);
    if (f.lift && fs.existsSync(capPath(f.shot, t.device, 'lift'))) {
      const meta = JSON.parse(fs.readFileSync(metaPath(f.shot, t.device), 'utf8'));
      const vp = VIEWPORTS[t.device];
      const pad = Math.round(L.devW * PAD[t.device]);
      const k = (L.devW - pad * 2) / vp.width;
      const statusH = Math.round(STATUS_CSS[t.device] * k);
      const size = pngSize(capPath(f.shot, t.device, 'lift'));
      // The lift is the same card, larger: 1.25 times on a phone, more on the iPad, whose screen is drawn smaller.
      const liftW = Math.min(L.liftW, Math.round(meta.lift.width * k * (t.device === 'tablet' ? 1.7 : 1.25)));
      const liftH = Math.round((liftW * size.h) / size.w);
      // Lift the card out where it sits on the screen, kept inside the frame.
      const centre = L.devTop + pad + statusH + (meta.liftAt != null ? meta.liftAt * vp.height : meta.lift.y + meta.lift.height / 2) * k;
      // Never over the screen's header (about 64 CSS px under the status bar), so the screen keeps its name.
      const minTop = L.devTop + pad + statusH + 64 * k;
      const top = Math.round(Math.max(minTop, Math.min(L.H - liftH - 70, centre - liftH / 2)));
      const border = 6;
      body += `<div class="lift" style="top:${top}px;left:${Math.round(660 - liftW / 2 - border)}px;width:${liftW}px"><img src="${url(capPath(f.shot, t.device, 'lift'))}"></div>`;
    }
  }
  const scale = t.w / 1320;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
  html,body{margin:0;background:${C.ground}}
  .stage{position:relative;width:1320px;height:${L.H}px;overflow:hidden;background:${C.ground};transform:scale(${scale});transform-origin:0 0}
  h1{position:absolute;top:${L.headTop}px;left:60px;right:60px;margin:0;text-align:center;font:400 ${L.headSize}px/1.02 Bricolage;letter-spacing:${(-L.headSize * 0.032).toFixed(1)}px;color:${C.head}}
  h1 span{display:inline-block;position:relative;padding:0 4px}
  /* The level line: the signature 'rim' under the second line. */
  h1 span::after{content:'';position:absolute;left:0;right:0;bottom:-${Math.round(L.headSize * 0.1)}px;height:${Math.round(L.headSize * 0.1)}px;background:${C.pink}}
  p{position:absolute;top:${L.headTop + Math.round(L.headSize * 2.04) + L.subGap + Math.round(L.headSize * 0.12)}px;left:110px;right:110px;margin:0;text-align:center;font:400 ${L.subSize}px/1.25 Hanken;color:${C.sub}}
  .device{position:absolute;box-sizing:border-box;background:${C.ink}}
  .lift{position:absolute;border:6px solid ${C.ink};border-radius:18px 18px 64px 64px;overflow:hidden;background:${C.ink}}
  .lift img{display:block;width:100%}
  </style></head><body><div class="stage">
  <h1>${f.head[0]}<br><span>${f.head[1]}</span></h1><p>${sub}</p>${body}</div></body></html>`;
}

async function compose(browser) {
  const page = await browser.newPage();
  const written = [];
  for (const t of TARGETS) {
    const dir = path.join(OUT, t.dir);
    fs.mkdirSync(dir, { recursive: true });
    await page.setViewportSize({ width: t.w, height: t.h });
    for (const f of FRAMES) {
      if (ONLY && !ONLY.includes(f.n)) continue;
      const html = path.join(CAP, `_frame-${t.dir.replace(/\W+/g, '-')}-${f.n}.html`);
      fs.writeFileSync(html, frameHtml(f, t));
      await page.goto(url(html));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const out = path.join(dir, `${String(f.n).padStart(2, '0')}-${f.slug}.png`);
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width: t.w, height: t.h } });
      // Both stores refuse an alpha channel and a wrong size: check the PNG header (colour type 2 is RGB).
      const head = fs.readFileSync(out).subarray(0, 26);
      if (head.readUInt32BE(16) !== t.w || head.readUInt32BE(20) !== t.h || head[25] !== 2) throw new Error(`${out}: not a ${t.w} x ${t.h} RGB PNG`);
      written.push(out);
    }
    log(`  composed ${t.label}`);
  }
  await page.close();
  return written;
}

async function contactSheet(browser) {
  const rows = TARGETS.map((t) => {
    const dir = path.join(OUT, t.dir);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    const tw = t.device === 'tablet' ? 300 : 225;
    return `<div class="row"><div class="label">${t.label}</div><div class="tiles">${files
      .map((f) => `<img src="${url(path.join(dir, f))}" style="width:${tw}px">`)
      .join('')}</div></div>`;
  }).join('');
  const html = path.join(CAP, '_sheet.html');
  fs.writeFileSync(html, `<!doctype html><html><head><style>${FONT_CSS}
    body{margin:0;background:#FBF4EB;font:400 22px Hanken;color:${C.ink};padding:28px}
    .row{margin-bottom:28px}.label{margin:0 0 12px 2px}.tiles{display:flex;gap:14px;align-items:flex-start}
    img{display:block;border-radius:6px 6px 18px 18px}</style></head><body>${rows}</body></html>`);
  const page = await browser.newPage({ viewport: { width: 2520, height: 900 } });
  await page.goto(url(html));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '_sheet.png'), fullPage: true });
  await page.close();
}

(async () => {
  fs.mkdirSync(CAP, { recursive: true });
  const { buildSeed } = await import('./seed.mjs');
  const browser = await chromium.launch();
  try {
    if (!flags.compose) {
      if (!flags['backend-only']) await captureDev(browser, buildSeed);
      if (flags['no-backend']) log('Skipping the backend captures (--no-backend): reusing the last photo and friends captures');
      else await captureBackend(browser, buildSeed);
    }
    const missing = [...Object.keys(DEV_SHOTS), 'photo', 'friends'].flatMap((name) => ['phone', 'tablet'].filter((d) => !fs.existsSync(metaPath(name, d))).map((d) => `${name} (${d})`));
    if (missing.length) throw new Error(`missing captures: ${missing.join(', ')}; run once without --compose or --no-backend`);
    log('Composing');
    await compose(browser);
    await contactSheet(browser);
    log(`Done: ${path.relative(ROOT, OUT)}/ (contact sheet: store/_sheet.png)`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
