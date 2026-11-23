#!/usr/bin/env node
/**
 * The top of every screen, side by side, with the numbers that should match.
 *
 * Crops the top of each route (demo data, reduced motion) into <out>/NN-name.png, tiles
 * them into <out>/_sheet.png, and measures the header on every screen into
 * <out>/tops.json and the console:
 *
 *   top   distance from the top of the page to the first visible thing in the header
 *   h     the header's visible height (its first to its last visible pixel)
 *   gap   from the header's last visible pixel to the first visible content under it
 *   title where the title's text starts, below the header's top
 *   lines the lines of text in the title block (a title and its one short line make 2)
 *
 * Screens of the same kind (the four tabs; the pushed screens) must show the same
 * numbers: see "The top of a screen" in AGENTS.md. The header is the element with the
 * testID `tab-header` (tab screens) or `screen-header` (the kit's Header on pushed screens).
 *
 * Every width is measured: 360 (the most common Android width) first, then 390 and 320, each at a
 * phone's height. With more than one width the crops are named NN-name-<n>w<width>.png, so the
 * sheet shows each screen once per row with its widths side by side in the order asked, and
 * tops.json has one row per screen and width.
 *
 *   node scripts/dev/tops.cjs <outDir> [--theme=blossom|light|dark|butter|honey|java] [--width=360,390,320]
 *        [--height=150]   pixels of each screen to keep in the sheet
 *        [--routes=/,/diary]   only these routes (default: every screen with a header)
 *        [--url=http://localhost:8081]
 */
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const out = path.resolve(args.find((a) => !a.startsWith('--')) || 'tops');
const theme = String(flags.theme || 'blossom');
const widths = String(flags.width || flags.widths || '360,390,320').split(',').map(Number).filter(Boolean);
const HEIGHTS = { 320: 640, 360: 740, 390: 844 };
const keep = Number(flags.height || 150);
const base = flags.url || 'http://localhost:8081';

const TABS = ['/', '/diary', '/train', '/progress'];
const PUSHED = [
  '/profile', '/friends', '/water', '/weight', '/body', '/sleep', '/fasting', '/recap', '/consistency',
  '/settings/goals', '/settings/reminders', '/settings/account', '/settings/data', '/settings/about', '/settings/health-sync',
  '/food/search?meal=lunch', '/food/quick?meal=lunch', '/food/custom?meal=lunch', '/food/meals?meal=lunch', '/food/photo?meal=lunch&mode=text',
  '/activity/pick', '/activity/log?activityId=running', '/activity/strength', '/activity/import', '/friends/add?invite=ABCD2345', '/morning',
];
const ROUTES = flags.routes ? String(flags.routes).split(',').filter(Boolean) : [...TABS, ...PUSHED];

/** Runs in the page: where the header is drawn and where the content under it starts. */
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) === 0) return null;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const paint = (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0;
    const art = el.tagName === 'svg' || el.tagName === 'IMG' || el.tagName === 'CANVAS';
    return text || paint || art ? r : null;
  };
  // The page itself paints the background: ignore anything as wide and as tall as the screen.
  const isBackdrop = (r) => r.width >= window.innerWidth - 2 && r.height >= window.innerHeight * 0.6;
  let root = document.querySelector('[data-testid="tab-header"], [data-testid="screen-header"]');
  let how = root ? root.getAttribute('data-testid') : '';
  if (!root) {
    // Before the shared headers existed: the kit Header's row, or the row around the first big title.
    const back = document.querySelector('[data-testid="header-back"], [data-testid="header-close"]');
    if (back) { root = back.parentElement; how = 'back-row'; }
    else {
      const big = [...document.querySelectorAll('div')].find((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) >= 26);
      if (big) { root = big.parentElement.parentElement; how = 'big-title'; }
    }
  }
  if (!root) return null;
  let top = Infinity;
  let bottom = -Infinity;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const r = visible(el);
    if (!r || isBackdrop(r)) continue;
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  let next = Infinity;
  for (const el of document.querySelectorAll('body *')) {
    if (root.contains(el) || el.contains(root)) continue;
    const r = visible(el);
    if (!r || isBackdrop(r) || r.top < bottom - 1 || r.top > window.innerHeight) continue;
    next = Math.min(next, r.top);
  }
  // The title block: the lines of text outside the header's buttons, and where the biggest one (the title) starts.
  const words = [...root.querySelectorAll('*')].filter((el) => !el.closest('button, [role="button"], [role="link"]') && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && visible(el));
  const rowsOfText = new Set(words.map((el) => Math.round(el.getBoundingClientRect().top)));
  const title = words.reduce((a, el) => (!a || parseFloat(getComputedStyle(el).fontSize) > parseFloat(getComputedStyle(a).fontSize) ? el : a), null);
  return {
    how,
    top: Math.round(top),
    h: Math.round(bottom - top),
    gap: next === Infinity ? null : Math.round(next - bottom),
    title: title ? Math.round(title.getBoundingClientRect().top - top) : null,
    lines: rowsOfText.size,
  };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^\d\d-.*\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
  const { buildSeed } = await import('./seed.mjs');
  const seed = JSON.stringify(buildSeed({ theme }));
  const browser = await chromium.launch();
  const rows = [];
  for (const [w, width] of widths.entries()) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHTS[width] || 844 }, reducedMotion: 'reduce', colorScheme: theme === 'dark' || theme === 'java' ? 'dark' : 'light', isMobile: true, hasTouch: true });
    await context.addInitScript((v) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('healthcal-v1', v); sessionStorage.setItem('seeded', '1'); } }, seed);
    let i = 0;
    for (const route of ROUTES) {
      const page = await context.newPage();
      await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {});
      await page.waitForSelector('[data-testid]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      const name = `${String(++i).padStart(2, '0')}-${route.split('?')[0].replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'today'}${widths.length > 1 ? `-${w}w${width}` : ''}`;
      await page.screenshot({ path: path.join(out, `${name}.png`), clip: { x: 0, y: 0, width, height: keep } });
      const m = await page.evaluate(measure).catch(() => null);
      rows.push({ route, width, kind: TABS.includes(route) ? 'tab' : 'pushed', ...(m || { how: 'not found' }) });
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'tops.json'), JSON.stringify({ theme, widths, ...(widths.length === 1 ? { width: widths[0] } : null), rows }, null, 1));
  try {
    const tile = Math.max(...widths);
    execSync(`node ${JSON.stringify(path.join(__dirname, 'contact-sheet.cjs'))} ${JSON.stringify(out)} ${JSON.stringify(path.join(out, '_sheet.png'))} ${widths.length > 1 ? widths.length : 4} ${tile} ${keep}`, { stdio: 'ignore' });
  } catch { /* the single crops are still there */ }

  const col = (v, n) => String(v ?? '-').padStart(n);
  for (const width of widths) {
    const mineW = rows.filter((r) => r.width === width);
    console.log(`\n${theme} at ${width} px: ${path.join(out, '_sheet.png')}`);
    console.log('route'.padEnd(38) + 'kind    top    h  gap title lines  header');
    for (const r of mineW) console.log(`${r.route.padEnd(38)}${r.kind.padEnd(7)}${col(r.top, 4)} ${col(r.h, 4)} ${col(r.gap, 4)} ${col(r.title, 5)} ${col(r.lines, 5)}  ${r.how}`);
    // A kind with more than one value for any of these numbers is reported, so it can be put right.
    for (const kind of ['tab', 'pushed']) {
      const mine = mineW.filter((r) => r.kind === kind && r.top !== undefined);
      for (const k of ['top', 'h', 'gap', 'title', 'lines']) {
        const values = [...new Set(mine.map((r) => r[k]))];
        if (values.length > 1) console.log(`  ${kind} screens differ in ${k} at ${width} px: ${values.join(', ')}`);
      }
    }
  }
})();
