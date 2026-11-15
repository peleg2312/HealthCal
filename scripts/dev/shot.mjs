#!/usr/bin/env node
// Screenshot a route of the running web app with demo data loaded.
//
//   node scripts/dev/shot.mjs <route> <out.png> [flags]
//
// Flags:
//   --empty        onboarded profile but no logged data (check empty states)
//   --fresh        no profile at all (welcome / onboarding flow)
//   --light        light theme (default is dark)
//   --theme=name   any theme by name: dark, light, blossom
//   --imperial     demo profile uses imperial units (lb, ft/in, fl oz, mi)
//   --stress       the demo weeks with long content: long names, big numbers (buildSeed stress in seed.mjs)
//   --full         capture the full scrollable page
//   --wait=1500    extra milliseconds to wait before the capture
//   --tap=a,b      testIDs to click in order before the capture
//   --type=id:text type text into the input with that testID (repeatable)
//   --width=360    phone width (default 360, the most common Android width; 390 an iPhone, 320 the narrowest).
//                  The height follows: 740 at 360, 640 at 320, 844 otherwise
//   --values=json  today's amounts on top of the demo data, as a state's `values` (seed.mjs), e.g.
//                  --values='{"eaten":0.6,"exercise":290}' for 60% of the budget with 290 kcal of exercise
//   --desktop      1280x800 viewport instead of a phone
//   --2x           render at double density (for screenshots people will look at)
//   --url=...      base URL (default http://localhost:8081)
//   --motion       turn animation on (by default the page runs with reduced motion, so every
//                  animation is instant and screenshots are deterministic)
//   --frames=8     after the taps (or as soon as --wait-for appears), save 8 frames as
//                  <out>-0.png, <out>-1.png, ... to look at an animation; use with --motion
//   --every=60     milliseconds between frames (default 60)
//   --wait-for=id  wait for this testID to appear before anything else
//   --slow=4       throttle the CPU this many times (Chrome DevTools), to judge a slow phone
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

const values = flags.values ? JSON.parse(String(flags.values)) : null;
const seed = buildSeed({ empty: !!flags.empty, stress: !!flags.stress, onboarded: !flags.fresh, theme: flags.theme || (flags.light ? 'light' : 'dark'), units: flags.imperial ? 'imperial' : 'metric', values });
// 360 first: the most common Android width and the owner's phone (AGENTS.md, "360 px first").
const width = Number(flags.width || 360);
const height = { 320: 640, 360: 740 }[width] || 844;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: flags.desktop ? { width: 1280, height: 800 } : { width, height },
  deviceScaleFactor: flags['2x'] ? 2 : 1,
  isMobile: !flags.desktop,
  hasTouch: !flags.desktop,
  colorScheme: flags.light ? 'light' : 'dark',
  // Reduced motion unless --motion: the app also treats any automated browser as reduced
  // motion unless the page opts in with window.__healthcalMotion = true (set below).
  reducedMotion: flags.motion ? 'no-preference' : 'reduce',
});
if (flags.motion) await context.addInitScript(() => { window.__healthcalMotion = true; });
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

const frames = Number(flags.frames || 0);
const tapIds = String(flags.tap || '').split(',').filter(Boolean);
// Catch an opening animation: do not wait for the page to settle when frames start at load.
const framesAtLoad = frames > 0 && tapIds.length === 0 && types.length === 0;
if (flags.slow) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(flags.slow) || 4 });
}
const t0 = Date.now();
await page.goto(base + route, { waitUntil: framesAtLoad ? 'commit' : 'networkidle', timeout: 120_000 }).catch((e) => errors.push(`goto: ${e.message}`));
if (flags['wait-for']) {
  await page.getByTestId(flags['wait-for']).first().waitFor({ timeout: 60_000 }).catch((e) => errors.push(`wait-for: ${e.message.split('\n')[0]}`));
  if (flags.slow) console.log(`${flags['wait-for']} visible after ${Date.now() - t0} ms`);
}
if (!framesAtLoad) await page.waitForTimeout(1200);
for (const t of types) {
  const [id, ...text] = t.split(':');
  await page.getByTestId(id).first().fill(text.join(':')).catch((e) => errors.push(`type ${id}: ${e.message.split('\n')[0]}`));
  await page.waitForTimeout(400);
}
for (const [i, id] of tapIds.entries()) {
  await page.getByTestId(id).first().click({ timeout: 8000 }).catch((e) => errors.push(`tap ${id}: ${e.message.split('\n')[0]}`));
  // With --frames, the frames start right after the last tap.
  if (!(frames && i === tapIds.length - 1)) await page.waitForTimeout(700);
}
if (frames) {
  const every = Number(flags.every || 60);
  const stem = out.replace(/\.png$/, '');
  const start = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.screenshot({ path: `${stem}-${i}.png` });
    console.log(`frame ${i} at ${Date.now() - start} ms`);
    await page.waitForTimeout(every);
  }
}
await page.waitForTimeout(Number(flags.wait || 0));
if (flags.full) {
  // React Native Web scrolls an inner element, not the page, so grow the viewport until that element fits.
  const extra = await page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll('*')) max = Math.max(max, el.scrollHeight - el.clientHeight);
    return max;
  });
  const vp = page.viewportSize();
  if (extra > 0) {
    await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + extra, 6000) });
    await page.waitForTimeout(500);
  }
}
await page.screenshot({ path: out });

const body = await page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '');
console.log(`saved ${out}  (${page.url()})`);
if (/Unmatched Route|Something went wrong|Uncaught Error|Unable to resolve/i.test(body)) errors.push(`page shows an error screen: ${body.replace(/\n+/g, ' | ')}`);
const real = errors.filter((e) => !/favicon|Download the React DevTools|shadow\*|pointerEvents is deprecated|useNativeDriver/i.test(e));
if (real.length) console.log(real.map((e) => `  ! ${e}`).join('\n'));
await browser.close();
process.exit(real.some((e) => /pageerror|error screen|goto/.test(e)) ? 1 : 0);
