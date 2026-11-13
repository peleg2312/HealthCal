#!/usr/bin/env node
// Screenshot a route of the running web app with demo data loaded.
//
//   node scripts/dev/shot.mjs <route> <out.png> [flags]
//
// Flags:
//   --empty        onboarded profile but no logged data (check empty states)
//   --fresh        no profile at all (welcome / onboarding flow)
//   --light        light theme (default is dark)
//   --full         capture the full scrollable page
//   --wait=1500    extra milliseconds to wait before the capture
//   --tap=a,b      testIDs to click in order before the capture
//   --type=id:text type text into the input with that testID (repeatable)
//   --desktop      1280x800 viewport instead of a phone
//   --url=...      base URL (default http://localhost:8081)
//
// Prints page errors and console errors, and exits 1 if the page crashed.
import { createRequire } from 'node:module';

import { buildSeed } from './seed.mjs';

// Playwright is installed globally in the dev container, which only CommonJS resolution finds.
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const types = args.filter((a) => a.startsWith('--type=')).map((a) => a.slice(7));
const [route = '/', out = 'shot.png'] = args.filter((a) => !a.startsWith('--'));
const base = flags.url || 'http://localhost:8081';

const seed = buildSeed({ empty: !!flags.empty, onboarded: !flags.fresh, theme: flags.light ? 'light' : 'dark' });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: flags.desktop ? { width: 1280, height: 800 } : { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: !flags.desktop,
  hasTouch: !flags.desktop,
  colorScheme: flags.light ? 'light' : 'dark',
});
await context.addInitScript((value) => {
  // Seed once per browser context so in-page writes survive client-side navigation.
  if (!window.sessionStorage.getItem('__seeded')) {
    window.localStorage.setItem('healthcal-v1', value);
    window.sessionStorage.setItem('__seeded', '1');
  }
}, JSON.stringify(seed));

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 400)}`);
});

await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120_000 }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(1200);
for (const t of types) {
  const [id, ...text] = t.split(':');
  await page.getByTestId(id).first().fill(text.join(':')).catch((e) => errors.push(`type ${id}: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(400);
}
for (const id of String(flags.tap || '').split(',').filter(Boolean)) {
  await page.getByTestId(id).first().click({ timeout: 8000 }).catch((e) => errors.push(`tap ${id}: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(700);
}
await page.waitForTimeout(Number(flags.wait || 0));
await page.screenshot({ path: out, fullPage: !!flags.full });

const body = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '');
console.log(`saved ${out}  (${page.url()})`);
if (/Unmatched Route|Something went wrong|Uncaught Error|Unable to resolve/i.test(body)) errors.push(`page shows an error screen: ${body.replace(/\n+/g, ' | ')}`);
const real = errors.filter((e) => !/favicon|Download the React DevTools|shadow\*|pointerEvents is deprecated|useNativeDriver/i.test(e));
if (real.length) console.log(real.map((e) => `  ! ${e}`).join('\n'));
await browser.close();
process.exit(real.some((e) => /pageerror|error screen|goto/.test(e)) ? 1 : 0);
