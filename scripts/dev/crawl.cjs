#!/usr/bin/env node
/**
 * Navigation crawler: taps every control the way a person would, with a finger in a phone
 * browser (touch, 360 x 740, reduced motion), and says what each tap did.
 *
 * Targets: every route in scripts/dev/check-routes.cjs (with demo data; the first-run ones,
 * those that open without a profile, also with nothing stored) and every state in
 * scripts/dev/states/start.cjs, food.cjs and move.cjs (the format is in evidence.cjs).
 *
 * For each target it lists the visible, enabled controls (buttons, links, tabs, switches,
 * checkboxes; by testID, else role and label). With a sheet open only the sheet's controls
 * count (the page behind is covered). Then, for each control, from a fresh load of that target
 * (its own page, its own stored data, the state's steps run again), it taps the control and
 * records what happened, any of:
 *   went      another screen (and whether that screen is the error or the not-found screen)
 *   sheet+    a sheet opened              sheet-    the open sheet closed
 *   toast     a toast showed (its text)   data      stored data changed
 *   page      the page changed (text, a selected state, a field's value, scroll, focus)
 *   system    handed to the system: share, download, file picker, camera, link out, clipboard
 *   nothing   none of the above, even after a second tap
 * A control that did nothing on the first tap but something on a second is reported as
 * "needs two taps". After every move to another screen it taps that screen's back or close
 * control (header-back / header-close) and checks the person is back where they started, then
 * does the same move again from a fresh load and uses the browser's back. Tabs have no back
 * control, so only the browser's back is checked for them.
 *
 * Before the taps it checks what a tap cannot show, with real touch events (gestureChecks, whose
 * comment lists them): that the day never changes by accident on Today and the diary (Today has no
 * page swipe; the diary's is a quick flick, never into the future, said in a toast), coming back to
 * today after time away, the week strip paging weeks, and every kind of sheet following the finger, settling,
 * closing and still scrolling, with motion on and off, and with a mouse and Escape on a desktop-size
 * window. --gestures-only runs just those; --no-gestures skips them.
 *
 * Reported as problems: controls that do nothing, moves that end on an error or not-found
 * screen (or throw), returns that do not return, and controls that need two taps.
 *
 *   node scripts/dev/crawl.cjs [--url=http://localhost:8081] [--out=<dir>]
 *        [--only=<route or state id>[,...]]   one or a few targets (a route is matched by its path)
 *        [--routes-only] [--states-only] [--lists=start,food,move]
 *        [--hosted=<page.html>] [--port=8125]  crawl the hosted preview's single page instead: it is
 *                                              served on --port inside a sandboxed iframe (scripts,
 *                                              same origin and forms only), as the preview viewer
 *                                              shows it, so downloads, popups and links out are
 *                                              blocked by the browser itself
 *        [--workers=4] [--all] (tap every control in every target; by default a control already
 *                               tapped on the same screen with the same data is not tapped again)
 *        [--max=60] (controls per target) [--group=3] (rows of one list per screen, such as
 *        activity-running, activity-cycling: they do the same thing) [--width=360] [--height=740]
 *
 * The page's own store is read through window.__healthcal (development and E2E builds); in a
 * production build (the hosted preview) stored data is read from localStorage instead. Writes
 * report.json (every tap) and summary.txt into --out. Exits 1 when there are problems.
 */
const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const ROOT = path.join(__dirname, '..', '..');
const hosted = typeof flags.hosted === 'string' ? path.resolve(flags.hosted) : null;
const port = Number(flags.port || 8125);
const base = hosted ? `http://localhost:${port}` : flags.url || 'http://localhost:8081';
const out = path.resolve(flags.out || path.join(ROOT, 'crawl-out'));
const W = Number(flags.width || 360);
const H = Number(flags.height || 740);
const WORKERS = Number(flags.workers || 4);
const MAX = Number(flags.max || 60);
/** Controls of one list (same testID but its last part) tapped per screen. */
const GROUP_MAX = Number(flags.group || 3);
const only = flags.only ? String(flags.only).split(',') : null;
const lists = String(flags.lists || 'start,food,move').split(',').filter(Boolean);

// ------------------------------------------------------------------ targets

/** The route list and the routes that open without a profile, read from check-routes.cjs (one list). */
function readRouteList() {
  const src = fs.readFileSync(path.join(__dirname, 'check-routes.cjs'), 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
    if (!m) throw new Error(`check-routes.cjs: ${name} not found`);
    return Function(`return ${m[1]}`)();
  };
  return { ROUTES: grab('ROUTES'), OPEN_WITHOUT_PROFILE: grab('OPEN_WITHOUT_PROFILE') };
}

function isoDay(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function targets() {
  const { ROUTES, OPEN_WITHOUT_PROFILE } = readRouteList();
  const list = [];
  const FIRST_RUN = ['/welcome', '/auth', '/onboarding'];
  if (!flags['states-only']) {
    for (const route of ROUTES) {
      const p = route.split('?')[0];
      if (!FIRST_RUN.includes(p)) list.push({ kind: 'route', id: `${route} [demo]`, route, data: 'demo' });
      if (OPEN_WITHOUT_PROFILE.includes(p) && p !== '/no-such-page') list.push({ kind: 'route', id: `${route} [fresh]`, route, data: 'fresh' });
    }
  }
  if (!flags['routes-only']) {
    for (const l of lists) {
      for (const s of require(path.join(__dirname, 'states', `${l}.cjs`))) {
        list.push({ kind: 'state', list: l, ...s, data: s.data || 'demo', route: s.route.replace('{day}', s.day !== undefined ? isoDay(s.day) : '') });
      }
    }
  }
  return only ? list.filter((t) => only.some((o) => t.id === o || t.route === o || t.route.split('?')[0] === o || t.id.startsWith(`${o} [`))) : list;
}

// ------------------------------------------------------------------ the hosted page

function serveHosted() {
  const app = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' +
    fs.readFileSync(hosted, 'utf8').replace('try { history.replaceState(null, "", "/"); } catch (e) {}', 'try { if (!window.__crawlKeepPath) history.replaceState(null, "", "/"); } catch (e) {}') + '</body></html>';
  const frame = (p) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe id="viewer" sandbox="allow-scripts allow-same-origin allow-forms" src="${p.replace(/"/g, '&quot;')}"></iframe></body></html>`;
  const srv = http.createServer((q, s) => {
    const u = new URL(q.url, base);
    s.setHeader('content-type', 'text/html; charset=utf-8');
    s.setHeader('cache-control', 'max-age=3600');
    if (u.pathname === '/__viewer') s.end(frame(u.searchParams.get('path') || '/'));
    else s.end(app);
  });
  return new Promise((resolve) => srv.listen(port, () => resolve(srv)));
}

// ------------------------------------------------------------------ in the page

/** Runs in every frame before the app: records hand-offs to the system instead of leaving the page. */
function instrument() {
  if (window.__crawlCalls) return;
  window.__crawlCalls = [];
  window.__crawlKeepPath = true;
  const rec = (kind, detail) => window.__crawlCalls.push({ kind, detail: String(detail || '').slice(0, 80) });
  const open = window.open;
  window.open = function (u) { rec('link out', u); return null; };
  void open;
  if (navigator.share) {
    const share = navigator.share.bind(navigator);
    navigator.share = (d) => { rec('share', d && d.title); return share(d); };
  }
  const aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) rec('download', this.download);
    else if (this.href && new URL(this.href, location.href).origin !== location.origin) { rec('link out', this.href); return; }
    return aClick.call(this);
  };
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && !a.download && new URL(a.href, location.href).origin !== location.origin) { rec('link out', a.href); e.preventDefault(); }
  }, true);
  const iClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') rec('file picker', this.accept);
    return iClick.call(this);
  };
  if (HTMLInputElement.prototype.showPicker) {
    const show = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function () { if (this.type === 'file') rec('file picker', this.accept); return show.call(this); };
  }
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => { rec('camera', ''); return gum(c); };
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const w = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => { rec('clipboard', ''); return w(t); };
  }
}

/** Runs in the page: the visible, enabled controls, in the open sheet when there is one. */
function listControls() {
  const SEL = '[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],a[href],button,input[type="checkbox"],input[type="radio"]';
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      if (e.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  };
  const sheets = [...document.querySelectorAll('[data-testid="sheet"]')].filter(shown);
  let scope = document.body;
  if (sheets.length) {
    // The modal that holds the newest sheet and its backdrop.
    scope = sheets[sheets.length - 1];
    while (scope.parentElement && !scope.querySelector('[data-testid="sheet-backdrop"]')) scope = scope.parentElement;
  }
  const seen = new Map();
  const outList = [];
  for (const el of scope.querySelectorAll(SEL)) {
    if (!shown(el)) continue;
    if (el.getAttribute('aria-disabled') === 'true' || el.disabled) continue;
    // Only the outermost control (a label inside a button is the button).
    if (el.parentElement && el.parentElement.closest(SEL) && scope.contains(el.parentElement.closest(SEL))) continue;
    const testid = el.getAttribute('data-testid');
    const label = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    const key = testid || `${role}:${label}`;
    const nth = seen.get(key) || 0;
    seen.set(key, nth + 1);
    const selected = el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true';
    outList.push({ key, nth, testid, label, role, selected, inSheet: sheets.length > 0 });
  }
  return outList;
}

/** Runs in the page: finds a control listed by listControls again (same key, same position). */
function findControl({ key, nth }) {
  window.__crawlFound = null;
  const SEL = '[role="button"],[role="link"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="menuitem"],a[href],button,input[type="checkbox"],input[type="radio"]';
  const sheets = [...document.querySelectorAll('[data-testid="sheet"]')];
  let scope = document.body;
  if (sheets.length) {
    scope = sheets[sheets.length - 1];
    while (scope.parentElement && !scope.querySelector('[data-testid="sheet-backdrop"]')) scope = scope.parentElement;
  }
  let i = 0;
  for (const el of scope.querySelectorAll(SEL)) {
    const testid = el.getAttribute('data-testid');
    const label = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    if ((testid || `${role}:${label}`) !== key) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (i === nth) return el;
    i += 1;
  }
  return null;
}

/** Runs in the page: what a tap can change. */
function snapshot() {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const toastEl = [...document.querySelectorAll('[data-testid="toast"]')].filter(visible).pop();
  let store = '';
  try {
    if (window.__healthcal) {
      const s = window.__healthcal.getState();
      store = JSON.stringify(s, (k, v) => (typeof v === 'function' ? undefined : v));
    } else {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('healthcal')).sort();
      store = keys.map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
    }
  } catch (e) { store = `error ${e.message}`; }
  let hash = 0;
  for (let i = 0; i < store.length; i++) hash = (hash * 31 + store.charCodeAt(i)) | 0;
  const marks = [...document.querySelectorAll('[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"],[aria-expanded="true"]')].length;
  const values = [...document.querySelectorAll('input,textarea')].map((i) => i.value).join('|');
  let scroll = 0;
  for (const el of document.querySelectorAll('*')) if (el.scrollTop || el.scrollLeft) scroll += el.scrollTop + el.scrollLeft;
  const text = (document.body.innerText || '').replace(toastEl ? toastEl.innerText : '\u0000', '');
  return {
    url: location.pathname + location.search,
    sheets: [...document.querySelectorAll('[data-testid="sheet"]')].filter(visible).length,
    toast: toastEl ? toastEl.innerText.replace(/\s+/g, ' ').trim() : null,
    store: hash,
    text,
    marks,
    values,
    scroll: Math.round(scroll),
    focus: document.activeElement ? (document.activeElement.getAttribute('data-testid') || document.activeElement.tagName) : '',
    error: !!document.querySelector('[data-testid="error-retry"]'),
    notFound: !!document.querySelector('[data-testid="not-found"]'),
    calls: (window.__crawlCalls || []).length,
    tabHeader: [...document.querySelectorAll('[data-testid="tab-header"]')].some(visible),
    hist: history.length,
  };
}

// ------------------------------------------------------------------ driving one page

/** Screens a flow starts or ends on, with no back control by design. */
const ROOTS = ['/', '/welcome', '/onboarding'];

const sel = (id) => (id.startsWith('^') ? `[data-testid^="${id.slice(1)}"]` : `[data-testid="${id}"]`);

async function newPage(ctx, target, seeds) {
  const page = await ctx.newPage();
  const ev = { errors: [], popups: [], downloads: [], choosers: [], dialogs: [] };
  page.on('pageerror', (e) => ev.errors.push(e.message.split('\n')[0].slice(0, 140)));
  page.on('popup', (p) => { ev.popups.push(p.url()); p.close().catch(() => {}); });
  page.on('download', (d) => { ev.downloads.push(d.suggestedFilename()); d.cancel().catch(() => {}); });
  page.on('filechooser', (f) => ev.choosers.push(f.isMultiple() ? 'many' : 'one'));
  page.on('dialog', (d) => { ev.dialogs.push(d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  const seed = seeds[`${target.data}${target.imperial ? '-imperial' : ''}`];
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('__crawl')) return;
    localStorage.clear();
    if (value) localStorage.setItem('healthcal-v1', value);
    // The hosted page seeds itself on a first visit unless it has already.
    localStorage.setItem('healthcal-preview-seeded', '3');
    sessionStorage.setItem('__crawl', '1');
  }, seed);
  await page.addInitScript(instrument);
  return { page, ev };
}

/** The frame the app runs in: the page itself, or the viewer's iframe for the hosted build. */
async function appFrame(page) {
  if (!hosted) return page.mainFrame();
  for (let i = 0; i < 100; i++) {
    const f = page.frames().find((x) => x !== page.mainFrame());
    if (f) return f;
    await page.waitForTimeout(100);
  }
  throw new Error('no viewer frame');
}

async function load(ctx, target, seeds) {
  const { page, ev } = await newPage(ctx, target, seeds);
  const step = async (what, fn) => { try { await fn(); return null; } catch (e) { return `${what}: ${String(e.message).split('\n')[0].slice(0, 120)}`; } };
  let frame = null;
  let problem = await step('did not load', async () => {
    const url = hosted ? `${base}/__viewer?path=${encodeURIComponent(target.route)}` : base + target.route;
    await page.goto(url, { waitUntil: hosted ? 'load' : 'networkidle', timeout: 120000 });
    frame = await appFrame(page);
    await frame.waitForSelector('[data-testid]', { timeout: 30000 });
    // Wait until the screen stops adding things (fonts, data, a check that answers late), up to 6 s.
    let last = -1;
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      const n = await frame.evaluate(() => document.querySelectorAll('[data-testid],[role="button"]').length);
      if (n === last) break;
      last = n;
    }
  });
  for (const [id, text] of Object.entries(target.type || {})) {
    if (problem) break;
    problem = await step(`type ${id}`, () => frame.locator(sel(id)).first().fill(text, { timeout: 10000 }));
    await page.waitForTimeout(300);
  }
  for (const t of target.taps || []) {
    if (problem) break;
    if (typeof t === 'string') {
      problem = await step(`tap ${t}`, () => frame.locator(sel(t)).first().tap({ timeout: 10000 }));
      await page.waitForTimeout(650);
    } else if (t.type) {
      problem = await step(`type ${t.type}`, () => frame.locator(sel(t.type)).first().fill(t.text, { timeout: 10000 }));
      await page.waitForTimeout(300);
    } else if (t.wait) {
      await page.waitForTimeout(t.wait);
    } else if (t.choose) {
      problem = await step(`choose files with ${t.choose}`, async () => {
        const chooser = page.waitForEvent('filechooser', { timeout: 8000 });
        await frame.locator(sel(t.choose)).first().tap({ timeout: 10000 });
        await (await chooser).setFiles(t.files.map((f) => path.resolve(ROOT, f)));
      });
      await page.waitForTimeout(1500);
    }
  }
  if (!problem && target.waitFor) problem = await step(`wait for ${target.waitFor}`, () => frame.locator(sel(target.waitFor)).first().waitFor({ state: 'visible', timeout: 15000 }));
  if (!problem) await page.waitForTimeout(300);
  ev.errors.length = 0;
  return { page, frame, ev, problem };
}

const urlKey = (u) => {
  const x = new URL(u, 'http://x');
  const q = [...x.searchParams.entries()].sort().map(([k, v]) => `${k}=${v}`).join('&');
  return x.pathname + (q ? `?${q}` : '');
};

/** What changed between two snapshots, plus what the page handed off. */
function outcome(before, after, calls, ev) {
  const o = [];
  if (urlKey(after.url) !== urlKey(before.url)) o.push(`went ${after.url}`);
  if (after.error) o.push('ERROR SCREEN');
  if (after.notFound && !before.notFound) o.push('NOT FOUND');
  if (after.sheets > before.sheets) o.push('sheet+');
  if (after.sheets < before.sheets) o.push('sheet-');
  if (after.toast && after.toast !== before.toast) o.push(`toast "${after.toast.slice(0, 70)}"`);
  if (after.store !== before.store) o.push('data');
  const sys = [...calls.map((c) => c.kind), ...ev.popups.map(() => 'link out'), ...ev.downloads.map(() => 'download'), ...ev.choosers.map(() => 'file picker')];
  if (sys.length) o.push(`system ${[...new Set(sys)].join('+')}`);
  if (!o.length && (after.text !== before.text || after.marks !== before.marks || after.values !== before.values || after.scroll !== before.scroll || after.focus !== before.focus)) o.push('page');
  if (ev.errors.length) o.push(`PAGE ERROR ${ev.errors[0]}`);
  return o;
}

async function tapOnce(page, frame, ev, control) {
  const before = await frame.evaluate(snapshot);
  const callsBefore = before.calls;
  const counts = { popups: ev.popups.length, downloads: ev.downloads.length, choosers: ev.choosers.length, errors: ev.errors.length };
  const handle = await frame.evaluateHandle(findControl, control);
  const el = handle.asElement();
  if (!el) return { before, result: ['GONE (not found again on a fresh load)'] };
  try {
    await el.tap({ timeout: 6000 });
  } catch (e) {
    return { before, result: [`COULD NOT TAP: ${String(e.message).split('\n')[0].slice(0, 100)}`] };
  }
  let after = null;
  let calls = [];
  // Give a slow answer (a sheet rising, a page loading, a share being drawn) up to 2.4 s.
  for (const wait of [700, 800, 900]) {
    await page.waitForTimeout(wait);
    try {
      after = await frame.evaluate(snapshot);
      calls = await frame.evaluate((n) => (window.__crawlCalls || []).slice(n), callsBefore);
    } catch (e) {
      after = { ...before, url: '(page left)', calls: 0 };
      ev.errors.push(`left the page: ${String(e.message).slice(0, 60)}`);
    }
    const sub = { popups: ev.popups.slice(counts.popups), downloads: ev.downloads.slice(counts.downloads), choosers: ev.choosers.slice(counts.choosers), errors: ev.errors.slice(counts.errors) };
    const r = outcome(before, after, calls, sub);
    if (r.length) return { before, after, result: r };
  }
  return { before, after, result: [] };
}

/** On a screen reached by a tap: its back or close control, if it has one. */
async function backControl(frame) {
  // Screens under the one in front stay in the page (hidden), with their own back controls.
  for (const id of ['header-back', 'header-close']) {
    const l = frame.locator(sel(id));
    for (let i = (await l.count()) - 1; i >= 0; i--) if (await l.nth(i).isVisible()) return l.nth(i);
  }
  return null;
}

// ------------------------------------------------------------------ gestures

/**
 * What a tap cannot show, checked with real touch events (Chrome's protocol) at the crawl's size:
 * - the day never changes by accident: a slow sideways drag (70 px, or across the page) changes
 *   nothing on Today or the diary; Today has no page swipe at all (a flick does nothing, a tap in
 *   the strip and "Back to today" do); on the diary a fast flick (120 px in about 60 ms) right shows
 *   the day before and says so in a toast naming the day whose "Today" goes back, a flick toward
 *   the future, from the screen's edge or on a slant does nothing, a flick left comes back to today;
 *   a vertical swipe still scrolls the page; a flick across a row moves the day and does not open
 *   the row; a sideways swipe on the week strip or inside an open sheet leaves the day alone;
 * - coming back: a day picked a minute before the page was hidden stays; after six minutes away
 *   (the page hidden, the clock moved on) Today and the diary show today again;
 * - the week strip: a swipe pages weeks (right the week before, left back; the diary on to next
 *   week, Today no further), the selected day is the one tab with aria-selected, no week arrows
 *   on touch and "Back to today" only away from today;
 * - sheets, with motion on: every kind (the + sheet, a long scrolling body, a pinned footer, a
 *   confirm sheet, a field focused) follows the finger on the handle, settles back after a short
 *   drag, closes past a quarter of its height and on a flick, and its body still scrolls; under
 *   reduced motion it stays put under the finger but still closes; on a desktop-size window a mouse
 *   drag on the handle and Escape close it, and the week arrows show.
 * The pages are made with the same `load` as the taps, so --hosted runs them inside the viewer's frame.
 */
async function gestureChecks(browser, seeds) {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`  gesture ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
  const phone = (motion) => browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: motion ? 'no-preference' : 'reduce', userAgent: devices['Pixel 7'].userAgent });
  const open = async (ctx, route, taps = [], motion = false) => {
    if (motion) await ctx.addInitScript(() => { window.__healthcalMotion = true; });
    const r = await load(ctx, { id: route, route, data: 'demo', taps }, seeds);
    if (r.problem) { await r.page.close(); throw new Error(`${route}: ${r.problem}`); }
    const cdp = await ctx.newCDPSession(r.page);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const move = async (x1, y1, x2, y2, steps = 10, gap = 16) => { for (let i = 1; i <= steps; i++) { await touch('touchMove', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps); await r.page.waitForTimeout(gap); } };
    const swipe = async (x1, y1, x2, y2, steps = 8, gap = 16) => { await touch('touchStart', x1, y1); await move(x1, y1, x2, y2, steps, gap); await touch('touchEnd'); await r.page.waitForTimeout(900); };
    return { ...r, touch, move, swipe };
  };
  const overline = (f) => f.evaluate(() => {
    const h = [...document.querySelectorAll('[data-testid="tab-header"]')].find((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' && e.offsetParent !== null);
    return h ? h.innerText.split('\n')[0].trim() : '';
  });
  // The top of the newest sheet on screen, or null when none is.
  const sheetTop = (f) => f.evaluate((h) => {
    const s = [...document.querySelectorAll('[data-testid="sheet"]')].filter((e) => e.getBoundingClientRect().height > 0).pop();
    return s && s.getBoundingClientRect().top < h ? Math.round(s.getBoundingClientRect().top) : null;
  }, H);
  const sheetOpen = async (f) => (await sheetTop(f)) !== null;
  const scrolled = (f) => f.evaluate(() => Math.max(0, ...[...document.querySelectorAll('*')].map((e) => e.scrollTop)));
  const firstDayShown = (f, pre) => f.evaluate((p) => [...document.querySelectorAll(`[data-testid^="${p}-day-"]`)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= -1 && b.right <= innerWidth + 1; }).map((e) => e.getAttribute('data-testid').slice(p.length + 5))[0] || '', pre);
  const midY = Math.round(H * 0.7);
  const guard = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, String(e.message).split('\n')[0].slice(0, 120)); } };

  // ---- the day swipe and the week strip (reduced motion, as the taps)
  // A flick is 120 px in about 60 ms; a slow drag holds the finger down for about a second.
  const flick = (r, x1, x2, y) => r.swipe(x1, y, x2, y + 4, 4, 8);
  const drag = (r, x1, x2, y) => r.swipe(x1, y, x2, y + 4, 10, 90);
  const toastText = (f) => f.evaluate(() => { const t = [...document.querySelectorAll('[data-testid="toast"]')].find((e) => e.getBoundingClientRect().height > 0); return t ? t.innerText.replace(/ /g, ' ').replace(/⁠/g, '').trim() : ''; });
  // Tap yesterday in the strip (on a Monday it is in the week before: page the strip back first).
  const tapYesterday = async (r, pre) => {
    const id = await r.frame.evaluate((p) => { const d = new Date(); d.setDate(d.getDate() - 1); return `${p}-day-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, pre);
    const shown = () => r.frame.evaluate((id) => { const e = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.left >= -1 && b.right <= innerWidth + 1; }); return !!e; }, id);
    if (!(await shown())) {
      const strip = await r.frame.locator(sel(`${pre}-week`)).first().boundingBox();
      await r.swipe(60, strip.y + 40, W - 60, strip.y + 40);
    }
    const l = r.frame.locator(sel(id));
    for (let i = 0; i < (await l.count()); i++) if (await l.nth(i).isVisible()) { await l.nth(i).tap(); break; }
    await r.page.waitForTimeout(600);
  };
  // The app goes to the background (the page hidden) for `ms` and comes back.
  const awayFor = (f, ms) => f.evaluate((ms) => {
    const set = (v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); };
    set('hidden');
    const now = Date.now.bind(Date);
    Date.now = () => now() + ms;
    set('visible');
  }, ms);
  let ctx = await phone(false);
  for (const [route, pre, jump, ahead] of [['/', 'today', 'today-jump-today', 0], ['/diary', 'diary', 'diary-today', 7]]) {
    const name = pre === 'today' ? 'Today' : 'diary';
    await guard(`${name}: day swipe`, async () => {
      const r = await open(ctx, route);
      const f = r.frame;
      check(`${name}: no week arrows on touch`, (await f.locator(sel(`${pre}-week-prev`)).count()) === 0);
      check(`${name}: no "Back to today" on today`, (await f.locator(sel(jump)).count()) === 0);
      const selected = await f.evaluate((p) => [...document.querySelectorAll(`[data-testid^="${p}-day-"]`)].filter((e) => e.getAttribute('aria-selected') === 'true').length, pre);
      check(`${name}: the selected day is the one tab with aria-selected`, selected === 1, `${selected}`);
      const d0 = await overline(f);
      // The owner's fault: a slow sideways drag while scrolling or reaching for a row moved the day.
      await drag(r, W / 2 - 35, W / 2 + 35, midY);
      check(`${name}: a slow 70 px sideways drag does not change the day`, (await overline(f)) === d0, `${d0} -> ${await overline(f)}`);
      await drag(r, 60, W - 60, midY);
      check(`${name}: a slow drag across the page does not change the day either`, (await overline(f)) === d0, `${d0} -> ${await overline(f)}`);
      await flick(r, W - 60, W - 180, midY);
      check(`${name}: a flick toward the future changes nothing`, (await overline(f)) === d0 && !(await toastText(f)), `${d0} -> ${await overline(f)}`);
      if (pre === 'today') {
        await flick(r, 100, 220, midY);
        check('Today: a fast flick does not change the day (Today changes day only from the strip)', (await overline(f)) === d0, `${d0} -> ${await overline(f)}`);
        // The strip is the way: a tap on the day before, then "Back to today".
        await tapYesterday(r, pre);
        const d1 = await overline(f);
        check('Today: a tap on a day in the strip shows that day, with "Back to today"', d1 !== d0 && (await f.locator(sel(jump)).count()) > 0, `${d0} -> ${d1}`);
        await f.locator(sel(jump)).first().tap();
        await r.page.waitForTimeout(600);
        check('Today: "Back to today" shows today again', (await overline(f)) === d0 && (await f.locator(sel(jump)).count()) === 0);
      } else {
        await flick(r, 100, 220, midY);
        const d1 = await overline(f);
        const said = await toastText(f);
        check('diary: a fast 120 px flick right shows the day before', d1 !== d0, `${d0} -> ${d1}`);
        check('diary: the move is said in a toast naming the day, with "Today"', /^(Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]{2} \d{1,2}/.test(said) && /Today$/.test(said), said.replace(/\n/g, ' | '));
        check('diary: away from today, "Back to today" shows', (await f.locator(sel(jump)).count()) > 0);
        await f.locator(sel('toast-action')).first().tap();
        await r.page.waitForTimeout(600);
        check('diary: the toast\'s "Today" goes back to today', (await overline(f)) === d0, await overline(f));
        await flick(r, 100, 220, midY);
        await flick(r, 8, 128, midY);
        check('diary: a flick from the screen edge is left to the system', (await overline(f)) !== d0 && (await f.evaluate(() => location.search)).length > 0);
        const d2 = await overline(f);
        await r.swipe(100, midY - 60, 220, midY + 20, 4, 8);
        check('diary: a quick slanted move (120 across, 80 down) does not change the day', (await overline(f)) === d2);
        await flick(r, W - 100, W - 220, midY);
        check('diary: a flick left comes back to today', (await overline(f)) === d0, await overline(f));
        check('diary: on today, "Back to today" is gone', (await f.locator(sel(jump)).count()) === 0);
      }
      const y0 = await scrolled(f);
      await r.swipe(W / 2, midY, W / 2, midY - 350, 10, 20);
      check(`${name}: a vertical swipe still scrolls the page`, (await scrolled(f)) > y0 + 100, `${y0} -> ${await scrolled(f)}`);
      await r.page.close();
      if (pre === 'diary') {
        // A flick across a full-width row moves the day and does not open the row.
        const r3 = await open(ctx, route);
        const row = await r3.frame.evaluate((h) => { const el = [...document.querySelectorAll('[role="button"]')].find((e) => { const b = e.getBoundingClientRect(); return b.width > innerWidth * 0.7 && b.top > 260 && b.bottom < h - 120; }); if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.top + b.height / 2), id: el.getAttribute('data-testid') || el.innerText.slice(0, 20) }; }, H);
        if (row) {
          const path0 = await r3.frame.evaluate(() => location.pathname);
          await flick(r3, 100, 220, row.y);
          check(`diary: a flick across a row (${row.id}) moves the day and does not open the row`, (await overline(r3.frame)) !== d0 && (await r3.frame.evaluate(() => location.pathname)) === path0 && !(await sheetOpen(r3.frame)));
        }
        await r3.page.close();
      }
      // The week strip pages weeks.
      const r4 = await open(ctx, route);
      const strip = await r4.frame.locator(sel(`${pre}-week`)).first().boundingBox();
      const w0 = await firstDayShown(r4.frame, pre);
      await r4.swipe(60, strip.y + 40, W - 60, strip.y + 40);
      const w1 = await firstDayShown(r4.frame, pre);
      const cap = await r4.frame.locator(sel(`${pre}-week-caption`)).first().innerText().catch(() => '');
      check(`${name}: a swipe right on the week strip shows the week before, not another day`, w1 < w0 && (await overline(r4.frame)) === d0 && /That week|Before you started/.test(cap), `${w0} -> ${w1}, ${cap}`);
      await r4.swipe(W - 60, strip.y + 40, 60, strip.y + 40);
      check(`${name}: a swipe left on the strip comes back to this week`, (await firstDayShown(r4.frame, pre)) === w0);
      await r4.swipe(W - 60, strip.y + 40, 60, strip.y + 40);
      const w3 = await firstDayShown(r4.frame, pre);
      check(`${name}: a swipe left on this week ${ahead ? 'shows next week' : 'stays (nothing after today)'}`, ahead ? w3 > w0 : w3 === w0, w3);
      await r4.page.close();
      // Coming back: a day picked a minute ago stays; after five minutes or more away, today again.
      const r5 = await open(ctx, route);
      await tapYesterday(r5, pre);
      const dp = await overline(r5.frame);
      await awayFor(r5.frame, 60_000);
      await r5.page.waitForTimeout(600);
      check(`${name}: back after a minute away, the picked day stays`, (await overline(r5.frame)) === dp && dp !== d0, `${dp} -> ${await overline(r5.frame)}`);
      await awayFor(r5.frame, 6 * 60_000);
      await r5.page.waitForTimeout(800);
      check(`${name}: back after six minutes away, it shows today again`, (await overline(r5.frame)) === d0 && (await r5.frame.locator(sel(jump)).count()) === 0, `${dp} -> ${await overline(r5.frame)}`);
      await r5.page.close();
    });
  }
  // A sideways swipe inside a sheet opened from Today or the diary leaves the day behind it alone.
  for (const [route, taps] of [['/', ['today-remaining-open']], ['/', ['today-share']], ['/diary', ['meal-menu-breakfast']]]) {
    await guard(`swipe in the sheet from ${taps[0]}`, async () => {
      const r = await open(ctx, route, taps);
      const d0 = await overline(r.frame);
      const s = await r.frame.locator(sel('sheet')).last().boundingBox();
      await r.swipe(60, s.y + s.height / 2, W - 60, s.y + s.height / 2 + 4);
      await r.frame.locator(sel('sheet-backdrop')).last().tap({ position: { x: 20, y: 20 } }).catch(() => {});
      await r.page.waitForTimeout(700);
      check(`a sideways swipe in the sheet from ${taps[0]} leaves the day behind it`, (await overline(r.frame)) === d0, `${d0} -> ${await overline(r.frame)}`);
      await r.page.close();
    });
  }
  // Under reduced motion a sheet does not follow the finger but a long drag still closes it.
  await guard('reduced motion sheet', async () => {
    const r = await open(ctx, '/', ['tab-add']);
    const rest = await sheetTop(r.frame);
    const h = await r.frame.locator(sel('sheet-drag')).last().boundingBox();
    await r.touch('touchStart', W / 2, h.y + 10);
    await r.move(W / 2, h.y + 10, W / 2, h.y + 110, 10, 20);
    check('reduced motion: the sheet stays put under the finger', (await sheetTop(r.frame)) === rest);
    await r.move(W / 2, h.y + 110, W / 2, h.y + 10 + (H - rest) * 0.4, 6, 40);
    await r.page.waitForTimeout(200);
    await r.touch('touchEnd');
    await r.page.waitForTimeout(600);
    check('reduced motion: dragged past a quarter, it still closes', !(await sheetOpen(r.frame)));
    await r.page.close();
  });
  await ctx.close();

  // ---- every kind of sheet, with motion on
  const SHEETS = [
    ['+ sheet', '/', ['tab-add']],
    ['a long scrolling body (exercise picker)', '/activity/strength', ['strength-add-first']],
    ['a pinned footer (glass sizes)', '/water', ['section-add-a-drink-action']],
    ['a confirm sheet (erase everything)', '/settings/data', ['data-erase']],
    ['a field focused (exercise search)', '/activity/strength', ['strength-add-first', 'exercise-search']],
    ['a field focused (a glass size)', '/water', ['section-add-a-drink-action', 'water-preset-0']],
  ];
  for (const [label, route, taps] of SHEETS) {
    ctx = await phone(true);
    await guard(`${label}`, async () => {
      let r = await open(ctx, route, taps, true);
      const rest = await sheetTop(r.frame);
      if (rest === null) throw new Error('did not open');
      let h = await r.frame.locator(sel('sheet-drag')).last().boundingBox();
      const x = Math.round(h.x + h.width / 2);
      await r.touch('touchStart', x, h.y + 10);
      await r.move(x, h.y + 10, x, h.y + 110, 10, 20);
      const mid = await sheetTop(r.frame);
      check(`${label}: follows the finger on the handle`, mid - rest > 80 && mid - rest < 120, `100 px down moved it ${mid - rest} px`);
      await r.move(x, h.y + 110, x, h.y + 40, 6, 40);
      await r.page.waitForTimeout(150);
      await r.touch('touchEnd');
      await r.page.waitForTimeout(800);
      check(`${label}: a short drag settles back`, Math.abs(((await sheetTop(r.frame)) ?? -99) - rest) <= 2);
      const body = await r.frame.evaluate(() => { const s = [...document.querySelectorAll('[data-testid="sheet-body"]')].pop(); const b = s.getBoundingClientRect(); return { over: s.scrollHeight > s.clientHeight + 20, y: b.top, h: b.height }; });
      if (body.over) {
        await r.swipe(x, body.y + body.h - 30, x, body.y + 30, 10, 20);
        const st = await r.frame.evaluate(() => [...document.querySelectorAll('[data-testid="sheet-body"]')].pop().scrollTop);
        check(`${label}: its body still scrolls`, st > 20 && (await sheetTop(r.frame)) === rest, `scrolled ${st} px`);
      }
      h = await r.frame.locator(sel('sheet-drag')).last().boundingBox();
      await r.touch('touchStart', x, h.y + 10);
      await r.move(x, h.y + 10, x, h.y + 10 + (H - rest) * 0.35, 12, 30);
      await r.page.waitForTimeout(200);
      await r.touch('touchEnd');
      await r.page.waitForTimeout(900);
      check(`${label}: dragged slowly past a quarter of its height, it closes`, !(await sheetOpen(r.frame)));
      await r.page.close();
      r = await open(ctx, route, taps, true);
      h = await r.frame.locator(sel('sheet-drag')).last().boundingBox();
      await r.swipe(x, h.y + 10, x, h.y + 70, 3, 8);
      check(`${label}: a flick down closes it`, !(await sheetOpen(r.frame)));
      await r.page.close();
    });
    await ctx.close();
  }

  // ---- a desktop-size window with a mouse
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
  for (const [label, route, taps] of [['+ sheet', '/', ['tab-add']], ['confirm sheet', '/settings/data', ['data-erase']]]) {
    await guard(`desktop ${label}`, async () => {
      // `load` taps with touch; on this window click instead.
      let r = await open(ctx, route, [], true);
      for (const t of taps) { await r.frame.locator(sel(t)).first().click(); await r.page.waitForTimeout(800); }
      const rest = await sheetTop(r.frame);
      const h = await r.frame.locator(sel('sheet-drag')).last().boundingBox();
      const x = h.x + h.width / 2;
      await r.page.mouse.move(x, h.y + 10);
      await r.page.mouse.down();
      for (let i = 1; i <= 10; i++) { await r.page.mouse.move(x, h.y + 10 + i * 10); await r.page.waitForTimeout(20); }
      const mid = await sheetTop(r.frame);
      for (let i = 1; i <= 10; i++) { await r.page.mouse.move(x, h.y + 110 + i * 25); await r.page.waitForTimeout(30); }
      await r.page.waitForTimeout(200);
      await r.page.mouse.up();
      await r.page.waitForTimeout(900);
      check(`desktop ${label}: follows a mouse drag on the handle and closes`, mid - rest > 80 && !(await sheetOpen(r.frame)), `moved ${mid - rest} px`);
      await r.page.close();
      r = await open(ctx, route, [], true);
      for (const t of taps) { await r.frame.locator(sel(t)).first().click(); await r.page.waitForTimeout(800); }
      await r.page.keyboard.press('Escape');
      await r.page.waitForTimeout(900);
      check(`desktop ${label}: Escape closes it`, !(await sheetOpen(r.frame)));
      await r.page.close();
    });
  }
  await guard('desktop arrows', async () => {
    const r = await open(ctx, '/', [], true);
    check('desktop: the week arrows show with a mouse', (await r.frame.locator(sel('today-week-prev')).count()) > 0);
    await r.page.close();
  });
  await ctx.close();
  return results;
}

// ------------------------------------------------------------------ main

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const { buildSeed } = await import('./seed.mjs');
  const seeds = {};
  for (const units of ['metric', 'imperial']) {
    const k = units === 'imperial' ? '-imperial' : '';
    seeds[`fresh${k}`] = null;
    seeds[`demo${k}`] = JSON.stringify(buildSeed({ theme: 'blossom', units }));
    seeds[`empty${k}`] = JSON.stringify(buildSeed({ theme: 'blossom', empty: true, units }));
    seeds[`stress${k}`] = JSON.stringify(buildSeed({ theme: 'blossom', stress: true, units }));
  }
  const all = targets();
  if (!all.length) { console.log('No targets match.'); process.exit(1); }
  const srv = hosted ? await serveHosted() : null;
  const browser = await chromium.launch();
  const done = new Set();
  const groups = new Map();
  const report = [];
  const problems = [];
  const unreached = [];
  let taps = 0;
  const t0 = Date.now();

  const contextFor = async () => browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    userAgent: devices['Pixel 7'].userAgent,
  });

  // Phase one lists each target's controls; phase two taps them, every tap from a fresh load,
  // spread over the workers as one queue.
  const jobs = [];
  async function enumerate(ctx, target) {
    const first = await load(ctx, target, seeds);
    if (first.problem) {
      unreached.push({ target: target.id, problem: first.problem });
      console.log(`  NOT REACHED ${target.id}: ${first.problem}`);
      await first.page.close();
      return;
    }
    const startPath = new URL(await first.frame.evaluate(() => location.href)).pathname;
    const controls = (await first.frame.evaluate(listControls)).slice(0, MAX);
    await first.page.close();
    for (const c of controls) {
      const scope = `${target.data}|${target.imperial ? 'imp' : ''}|${startPath}|${c.inSheet ? 'sheet' : 'page'}`;
      const dedupe = `${scope}|${c.key}|${c.nth}`;
      if (!flags.all && done.has(dedupe)) continue;
      // Rows of one list (activity-running, activity-cycling, today-day-2026-11-09, ...) do the same thing:
      // a few of each list are tapped, unless --all.
      const group = `${scope}|${c.testid ? c.testid.replace(/-[^-]+$/, '') : c.key}`;
      if (!flags.all && c.testid && (groups.get(group) || 0) >= GROUP_MAX) continue;
      groups.set(group, (groups.get(group) || 0) + 1);
      done.add(dedupe);
      jobs.push({ target, c });
    }
  }

  async function tapJob(ctx, { target, c }) {
    const run = await load(ctx, target, seeds);
    if (run.problem) { await run.page.close(); return; }
    let r = await tapOnce(run.page, run.frame, run.ev, c);
    taps += 1;
    const entry = { target: target.id, control: c.key, nth: c.nth, label: c.label, role: c.role, inSheet: c.inSheet, from: r.before.url, result: r.result };
    if (!r.result.length) {
      // A second tap: a control that answers only then needs two taps.
      const again = await tapOnce(run.page, run.frame, run.ev, c);
      if (again.result.length && !again.result[0].startsWith('GONE') && !again.result[0].startsWith('COULD NOT')) { entry.result = again.result; entry.twoTaps = true; r = again; }
      // A tab, chip or day that is already the selected one has nothing to change.
      else entry.result = [c.selected ? 'already selected' : 'nothing'];
    }
    const went = entry.result.find((x) => x.startsWith('went '));
    // A screen's own back or close control, tapped on a screen opened straight from a link, has nowhere
    // earlier to return to: where it lands is the result, there is no return to check.
    const ownBack = c.testid === 'header-back' || c.testid === 'header-close';
    // A move that replaced the page (no new history entry) leaves nothing of the start screen to go back to.
    if (went && r.after && r.after.hist === r.before.hist) entry.replaced = true;
    if (went && !ownBack && !entry.replaced && !entry.result.some((x) => /ERROR|NOT FOUND/.test(x))) {
      const fromKey = urlKey(r.before.url);
      const backBtn = await backControl(run.frame);
      if (backBtn) {
        try {
          await backBtn.tap({ timeout: 5000 });
          await run.page.waitForTimeout(900);
          const now = await run.frame.evaluate(() => location.pathname + location.search);
          entry.backControl = urlKey(now) === fromKey ? 'returned' : `ended on ${now}`;
        } catch (e) { entry.backControl = `could not tap back: ${String(e.message).split('\n')[0].slice(0, 80)}`; }
      } else if (r.after && r.after.tabHeader) entry.backControl = 'tab (no back control)';
      // The first-run screens and Today are where a flow starts or ends: nothing to go back to.
      else if (r.after && ROOTS.includes(new URL(r.after.url, 'http://x').pathname)) entry.backControl = 'root (no back control)';
      else entry.backControl = 'NO BACK CONTROL';
      await run.page.close();
      // The browser's back, from a fresh load and the same tap.
      const again = await load(ctx, target, seeds);
      if (!again.problem) {
        const r2 = await tapOnce(again.page, again.frame, again.ev, c);
        if (r2.result.some((x) => x.startsWith('went '))) {
          try {
            await again.page.goBack({ timeout: 8000 }).catch(() => null);
            await again.page.waitForTimeout(900);
            const now = await again.frame.evaluate(() => location.pathname + location.search);
            // Ending outside the app means the move replaced the page (router.replace) and this test
            // opened the start screen straight from a link: there was nothing before it.
            entry.browserBack = urlKey(now) === fromKey ? 'returned' : /^blank|about:/.test(now) || now === '' ? 'replaced (nothing before it here)' : `ended on ${now}`;
          } catch (e) { entry.browserBack = `failed: ${String(e.message).split('\n')[0].slice(0, 80)}`; }
        }
      }
      await again.page.close();
    } else await run.page.close();
    report.push(entry);
    const bad = [];
    if (entry.result.includes('nothing')) bad.push('does nothing');
    if (entry.result.some((x) => /ERROR|NOT FOUND|COULD NOT TAP|GONE/.test(x))) bad.push(entry.result.find((x) => /ERROR|NOT FOUND|COULD NOT TAP|GONE/.test(x)));
    if (entry.twoTaps) bad.push('needs two taps');
    if (entry.backControl && !/returned|tab|root/.test(entry.backControl)) bad.push(`back control: ${entry.backControl}`);
    if (entry.browserBack && !/returned|replaced/.test(entry.browserBack)) bad.push(`browser back: ${entry.browserBack}`);
    if (bad.length) {
      problems.push({ target: target.id, control: c.key, label: c.label, problems: bad, result: entry.result });
      console.log(`  PROBLEM ${target.id} :: ${c.key} (${(c.label || '').slice(0, 40)}): ${bad.join('; ')}  [${entry.result.join(', ')}]`);
    }
  }

  let gestures = [];
  if (!flags['no-gestures'] && !only) {
    try { gestures = await gestureChecks(browser, seeds); } catch (e) { gestures.push({ name: 'gesture checks', ok: false, detail: String(e.message).split('\n')[0] }); console.log(`  gesture checks failed: ${e.message}`); }
  }

  if (flags['gestures-only']) { console.log(`Gestures: ${gestures.filter((g) => g.ok).length} of ${gestures.length} as expected`); await browser.close(); if (srv) srv.close(); process.exit(gestures.some((g) => !g.ok) ? 1 : 0); }

  const pool = async (items, fn, label) => {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(WORKERS, items.length) }, async () => {
      let ctx = await contextFor();
      let used = 0;
      for (;;) {
        const k = i++;
        if (k >= items.length) break;
        // A fresh context now and then keeps memory flat over a long run.
        if (++used > 40) { await ctx.close(); ctx = await contextFor(); used = 1; }
        try { await fn(ctx, items[k]); } catch (e) {
          const t = items[k].target || items[k];
          unreached.push({ target: `${t.id}${items[k].c ? ` :: ${items[k].c.key}` : ''}`, problem: `crawler: ${String(e.message).split('\n')[0].slice(0, 120)}` });
        }
        if ((k + 1) % 25 === 0) console.log(`${label} ${k + 1}/${items.length}, ${Math.round((Date.now() - t0) / 60000)} min`);
      }
      await ctx.close();
    }));
  };
  await pool(all, enumerate, 'targets listed');
  console.log(`${jobs.length} controls to tap`);
  await pool(jobs, tapJob, 'controls tapped');
  await browser.close();
  if (srv) srv.close();

  const byOutcome = {};
  for (const e of report) for (const k of new Set(e.result.map((x) => x.split(' ')[0].replace(/"/g, '')))) byOutcome[k] = (byOutcome[k] || 0) + 1;
  const summary = [
    `Crawled ${hosted ? `the hosted page ${hosted}` : base} at ${W} x ${H} with touch: ${all.length} targets, ${report.length} controls tapped, ${Math.round((Date.now() - t0) / 60000)} min.`,
    `Outcomes (a tap can have several): ${Object.entries(byOutcome).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `Moves to another screen: ${report.filter((e) => e.backControl).length}; back control returned ${report.filter((e) => e.backControl === 'returned').length}, tabs ${report.filter((e) => /tab/.test(e.backControl || '')).length}; browser back returned ${report.filter((e) => e.browserBack === 'returned').length} of ${report.filter((e) => e.browserBack).length}.`,
    `Gestures: ${gestures.filter((g) => g.ok).length} of ${gestures.length} as expected`,
    ...gestures.filter((g) => !g.ok).map((g) => `  FAIL ${g.name}${g.detail ? `: ${g.detail}` : ''}`),
    `Targets not reached: ${unreached.length}`,
    ...unreached.map((u) => `  ${u.target}: ${u.problem}`),
    `Problems: ${problems.length}`,
    ...problems.map((p) => `  ${p.target} :: ${p.control} (${(p.label || '').slice(0, 40)}): ${p.problems.join('; ')}  [${p.result.join(', ')}]`),
  ].join('\n');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base: hosted || base, width: W, height: H, gestures, taps: report, problems, unreached }, null, 1));
  fs.writeFileSync(path.join(out, 'summary.txt'), summary + '\n');
  console.log(`\n${summary}`);
  process.exit(problems.length || gestures.some((g) => !g.ok) ? 1 : 0);
}

main().catch((e) => { console.error('FAIL', e); process.exit(2); });
