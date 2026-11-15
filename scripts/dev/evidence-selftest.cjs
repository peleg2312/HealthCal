#!/usr/bin/env node
/**
 * Proves the scans in evidence.cjs against faults made by hand: each case is a small page
 * (or the real + sheet with one style changed) that holds exactly one fault, and the scan
 * that should see it must report it, while the clean version of the same page reports nothing.
 *
 *   node scripts/dev/evidence-selftest.cjs [--url=http://localhost:8081]
 *
 * Exits 1 when a scan misses its fault or reports a clean page.
 */
const { chromium } = require('playwright');

const { scan, layoutScan, sheetScan, toastScan, notReady } = require('./evidence.cjs');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const base = flags.url || 'http://localhost:8081';

const SHEET = '[data-testid="sheet"]';
/** A page with a sheet like the kit's: a lid at the bottom, a scrolling body padded 20 px, a footer. */
const sheetPage = ({ top = null, pad = 20, bottomPad = 16, scrolls = true, tall = false, extra = '', footer = '<button style="width:100%;height:48px">Save</button>', toast = '' } = {}) => `
<body style="margin:0;background:#111;color:#eee;font:15px/20px sans-serif">
  <div style="padding:20px"><p>Page behind</p><p style="margin-top:-30px">Page behind, drawn over</p></div>
  <div style="position:fixed;inset:0;background:rgba(0,0,0,.5)"></div>
  <div style="position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center">
    ${toast}
    <div data-testid="sheet" style="width:100%;background:#222;border-top:1px solid #444;box-sizing:border-box;padding-bottom:${bottomPad}px;${top !== null ? `position:fixed;top:${top}px;` : 'max-height:88vh;'}display:flex;flex-direction:column">
      <div data-testid="sheet-body" style="${scrolls ? 'overflow-y:auto;' : ''}flex:1 1 auto;min-height:0">
        <div style="padding:0 ${pad}px;display:flex;flex-direction:column;gap:12px">
          <div style="font-size:22px;line-height:28px">A sheet</div>
          <p style="margin:0">Some words in the sheet.</p>
          ${tall ? '<div style="height:900px;background:#333">Tall content</div>' : ''}
          ${extra}
        </div>
      </div>
      <div data-testid="sheet-footer" style="padding:8px ${pad}px 0">${footer}</div>
    </div>
  </div>
</body>`;

const cases = [
  // name, html, what to run, what must be in the result ('' = nothing)
  { name: 'clean sheet', html: sheetPage(), run: 'sheet', expect: '' },
  { name: 'clean sheet, layout scan', html: sheetPage(), run: 'layoutSheet', expect: '' },
  { name: 'sheet top above the screen', html: sheetPage({ top: -30 }), run: 'sheet', expect: 'above the screen' },
  { name: 'content cut by the bottom, nothing scrolls', html: sheetPage({ top: 100, scrolls: false, tall: true }), run: 'sheet', expect: 'cut by the bottom of the screen' },
  { name: 'tall content in a scrolling body is fine', html: sheetPage({ tall: true }), run: 'sheet', expect: '' },
  { name: 'last control 4 px from the bottom', html: sheetPage({ bottomPad: 4 }), run: 'sheet', expect: 'from the bottom of the screen' },
  { name: 'text closer than the side padding', html: sheetPage({ extra: '<p style="margin:0 0 0 -14px">Pushed to the edge</p>' }), run: 'sheet', expect: "from the sheet's left edge" },
  { name: 'toast over a sheet control', html: sheetPage({ toast: '<div data-testid="toast" style="position:fixed;left:20px;right:20px;bottom:30px;height:44px;background:#eee;color:#111">Added 250 ml</div>' }), run: 'toast', expect: 'covers' },
  { name: 'toast above the sheet is fine', html: sheetPage({ toast: '<div data-testid="toast" style="height:44px;width:300px;margin-bottom:12px;background:#eee;color:#111">Added 250 ml</div>' }), run: 'toast', expect: '' },
  {
    name: 'toast over a pinned footer',
    html: '<body style="margin:0"><p>Screen</p><div data-testid="screen-footer" style="position:fixed;left:0;right:0;bottom:0;padding:16px"><button style="width:100%;height:48px">Save</button></div><div data-testid="toast" style="position:fixed;left:20px;right:20px;bottom:30px;height:44px;background:#000;color:#fff">Saved</div></body>',
    run: 'toast',
    expect: 'covers',
  },
  { name: 'the page behind a sheet is not judged', html: sheetPage(), run: 'layoutSheet', expect: '' },
  { name: 'the page alone is judged', html: sheetPage().replace(/<div style="position:fixed;left:0;right:0;bottom:0[\s\S]*$/, '</body>'), run: 'layoutPage', expect: 'over' },
  {
    name: 'lines hidden by a clamp are not drawn',
    html: '<body style="margin:0;font:15px/20px sans-serif;width:140px"><p style="margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">One long food name that runs on over three lines here</p><span style="position:absolute;top:44px;left:0">1 serving</span></body>',
    run: 'layoutPage',
    expect: '',
  },
  {
    name: 'text that is drawn over is still seen',
    html: '<body style="margin:0;font:15px/20px sans-serif;width:140px"><p style="margin:0">One long food name that runs on over three lines here</p><span style="position:absolute;top:44px;left:0">1 serving</span></body>',
    run: 'layoutPage',
    expect: 'over',
  },
  { name: 'a blank capture is not ready', html: '<body></body>', run: 'ready', expect: 'blank' },
  { name: 'a missing sheet is not ready', html: '<body><p>One</p><p>Two</p><p>Three</p></body>', run: 'readySheet', expect: 'no sheet is open' },
  { name: 'an undeclared sheet is not ready', html: sheetPage(), run: 'ready', expect: 'a sheet is open' },
  { name: 'a finished sheet is ready', html: sheetPage(), run: 'readySheet', expect: '' },
];

async function runCase(page, c) {
  const app = `window.__healthcal = { getState: () => ({ profile: { name: 'Test' } }) };`;
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><script>${app}</script></head>${c.html}</html>`);
  await page.waitForTimeout(50);
  switch (c.run) {
    case 'sheet': return page.evaluate(sheetScan);
    case 'toast': return page.evaluate(toastScan);
    case 'layoutSheet': { const r = await page.evaluate(layoutScan, SHEET); return [...r.overText, ...r.broken, ...r.sticksOut, ...r.controls, ...r.gaps, ...(await page.evaluate(scan, SHEET)).cut.map((x) => x.text)]; }
    case 'layoutPage': { const r = await page.evaluate(layoutScan, null); return [...r.overText, ...r.broken, ...r.sticksOut, ...r.controls]; }
    case 'ready': return [await page.evaluate(notReady, { profile: true, sheet: false })].filter(Boolean);
    case 'readySheet': return [await page.evaluate(notReady, { profile: true, sheet: true })].filter(Boolean);
    default: throw new Error(c.run);
  }
}

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  const judge = (name, got, expect) => {
    const ok = expect ? got.some((g) => g.includes(expect)) : got.length === 0;
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (expected ${expect ? `"${expect}"` : 'nothing'}, got ${JSON.stringify(got)})`}`);
  };
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const c of cases) judge(c.name, await runCase(page, c), c.expect);
  await page.close();

  // The real + sheet: clean, then with one style broken at a time.
  const { buildSeed } = await import('./seed.mjs');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await context.addInitScript((value) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('healthcal-v1', value); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(buildSeed({ theme: 'dark' })));
  const real = await context.newPage();
  await real.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 });
  await real.getByTestId('tab-add').first().click({ timeout: 15000 });
  await real.waitForSelector(SHEET, { timeout: 10000 });
  await real.waitForTimeout(500);
  judge('real + sheet is ready', [await real.evaluate(notReady, { profile: true, sheet: true })].filter(Boolean), '');
  judge('real + sheet: clean', await real.evaluate(sheetScan), '');
  // A screen's own row pulled out to the sheet's edge (the kit's padding itself is fixed).
  await real.addStyleTag({ content: '[data-testid="sheet-body"] > div > div:nth-child(2) { margin-left: -16px !important }' });
  await real.waitForTimeout(100);
  judge('real + sheet: a row pulled 16 px into the padding', await real.evaluate(sheetScan), "from the sheet's left edge");
  await real.addStyleTag({ content: '[data-testid="sheet"] { padding-bottom: 0 !important } [data-testid="sheet-body"] > div { padding-bottom: 0 !important }' });
  await real.waitForTimeout(100);
  judge('real + sheet: no space under the last control', await real.evaluate(sheetScan), 'from the bottom of the screen');
  // Log water from the sheet: its toast shows above the sheet, and must not be over anything.
  await real.reload({ waitUntil: 'networkidle' });
  await real.getByTestId('tab-add').first().click({ timeout: 15000 });
  await real.waitForSelector(SHEET, { timeout: 10000 });
  const water = real.locator(`${SHEET} [aria-label*="250"]`).first();
  if (await water.count()) {
    await water.click();
    await real.waitForTimeout(300);
    judge('real toast from the + sheet sits clear', await real.evaluate(toastScan), '');
    await real.addStyleTag({ content: '[data-testid="toast"] { transform: translateY(420px) !important }' });
    await real.waitForTimeout(100);
    judge('real toast pushed onto the sheet', await real.evaluate(toastScan), 'covers');
  } else {
    judge('real + sheet has a 250 ml water button', [], 'a button');
  }
  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
