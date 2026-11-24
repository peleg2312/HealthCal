#!/usr/bin/env node
/**
 * The Health app's export, imported end to end in a phone-size browser: a generated export.zip is
 * picked through the real file input at 360 x 740 with touch, read, reviewed and saved; then the
 * store is checked (the workouts saved, none twice, one already in HealthCal from a Garmin file left
 * alone; the nights in the sleep log, each the watch's time asleep without its time awake, none for a
 * night the watch was charging or for a nap, a night entered by hand left alone), Train's steps line
 * (the day's figure by the import's rule, and where it is from), the sleep screen (where the nights
 * are from), and a second import of the same file (adds nothing).
 *
 * Before that, nothing may be saved but by the Import button: closing the review with X keeps no
 * steps or nights; saving only the steps and sleep and tapping Undo takes them off again (and the same
 * file then leaves those nights out, as deleted ones; this runs in its own browser); closing the screen or going
 * back while a large export is read stops the read (reopening the import shows the start, and the
 * read never saves anything later). A large export's review (200 workouts) is checked for a filter
 * chip left alone on a line.
 *
 *   node scripts/dev/with-build.cjs --dir=<build> --port=8231 -- node scripts/dev/health-export-e2e.cjs --url={url}
 *        [--zip=<export.zip>]   a file made by make-health-export.mjs (its .expected.json beside it); default: an 8 MB one, made now
 *        [--dir=<folder>]       where the default file is written (default: the system temp folder)
 *        [--big=<export.zip>]   the large export for the close-while-reading checks (default: 180 MB of XML, 200 workouts, made now)
 *        [--measure]            also report the time to read, the peak JS heap, the longest frame, and try Cancel
 *        [--only-measure]       only the measurement (for a big file): pick, read to the review list, report, stop
 *        [--cancel]             with --only-measure: first start reading and tap Cancel, and check nothing changed
 *
 * The browser runs in UTC: the generator's expected step totals are UTC days.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { toastActionReady } = require('./toastGuard.cjs');

const HERE = path.dirname(path.resolve(process.argv[1]));
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const base = flags.url || process.env.HEALTHCAL_URL || 'http://localhost:8200';

let zip = flags.zip;
if (!zip) {
  const dir = flags.dir || path.join(os.tmpdir(), 'healthcal-health-export');
  fs.mkdirSync(dir, { recursive: true });
  zip = path.join(dir, 'export.zip');
  const run = spawnSync('node', [path.join(HERE, 'make-health-export.mjs'), `--out=${zip}`, '--mb=8', '--workouts=120'], { encoding: 'utf8' });
  if (run.status !== 0) {
    console.error(run.stderr);
    process.exit(2);
  }
  console.log(run.stdout.trim());
}
const expected = JSON.parse(fs.readFileSync(`${zip}.expected.json`, 'utf8'));
let big = flags.big;
if (!big && !flags['only-measure']) {
  big = path.join(path.dirname(zip), 'export-big.zip');
  if (!fs.existsSync(big)) {
    const run = spawnSync('node', [path.join(HERE, 'make-health-export.mjs'), `--out=${big}`, '--mb=180', '--workouts=200'], { encoding: 'utf8' });
    if (run.status !== 0) {
      console.error(run.stderr);
      process.exit(2);
    }
    console.log(run.stdout.trim());
  }
}

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
/** Text as a person reads it: the app keeps numbers with their units using no-break spaces and word joiners. */
const plain = (s) => s.replace(/\u00A0/g, ' ').replace(/[\u2060\u200E\u2068\u2069]/g, '').replace(/\s+/g, ' ').trim();
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())));
const tap = async (page, id) => {
  // A toast's action takes no press in its first moments on screen (toastGuard.cjs).
  if (id === 'toast-action') await toastActionReady(page, 20_000);
  const el = page.getByTestId(id).first();
  await el.waitFor({ state: 'visible', timeout: 20_000 });
  await el.tap();
};

(async () => {
  const { buildSeed } = await import(path.join(HERE, 'seed.mjs'));
  const seed = buildSeed({ empty: true, onboarded: true, theme: 'dark', units: 'metric' });
  const browser = await chromium.launch();
  const errors = [];
  /** A phone-size browser with the seed and nothing else stored. */
  async function freshPage() {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce', timezoneId: 'UTC' });
    await ctx.addInitScript((value) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem('healthcal-v1', value);
        window.sessionStorage.setItem('__seeded', '1');
      }
    }, JSON.stringify(seed));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return { ctx, p };
  }
  let { ctx: context, p: page } = await freshPage();

  /** Pick the file on the import screen; resolves when the review list shows. Returns timings. */
  async function importFile(measure) {
    await page.goto(`${base}/activity/import`);
    await page.getByTestId('import-apple-guide').waitFor({ timeout: 30_000 });
    const chooser = page.waitForEvent('filechooser');
    await tap(page, 'import-choose-files');
    const fileChooser = await chooser;
    let client = null;
    let peak = 0;
    let polling = null;
    if (measure) {
      client = await context.newCDPSession(page);
      await client.send('Performance.enable');
      await page.evaluate(() => {
        window.__frames = { last: performance.now(), worst: 0, stop: false };
        const loop = (t) => {
          const f = window.__frames;
          f.worst = Math.max(f.worst, t - f.last);
          f.last = t;
          if (!f.stop) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      polling = setInterval(async () => {
        try {
          const { metrics } = await client.send('Performance.getMetrics');
          const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
          peak = Math.max(peak, used);
        } catch {}
      }, 150);
    }
    const t0 = Date.now();
    await fileChooser.setFiles(zip);
    let sawProgress = false;
    // The review list (or its empty or all-known states) shows when reading is done.
    for (;;) {
      if (await page.getByTestId('import-reading-line').isVisible().catch(() => false)) {
        const line = await page.getByTestId('import-reading-line').innerText({ timeout: 300 }).catch(() => '');
        if (/% read/.test(line)) sawProgress = true;
      }
      if (await page.getByTestId('import-summary').isVisible().catch(() => false)) break;
      if (Date.now() - t0 > 9 * 60_000) throw new Error('reading did not finish in 9 minutes');
      await page.waitForTimeout(100);
    }
    const ms = Date.now() - t0;
    let worstFrame = null;
    if (measure) {
      clearInterval(polling);
      worstFrame = await page.evaluate(() => {
        window.__frames.stop = true;
        return window.__frames.worst;
      });
    }
    return { ms, peak, sawProgress, worstFrame };
  }

  const size = fs.statSync(zip).size;
  if (flags['only-measure']) {
    if (flags.cancel) {
      // Cancel while reading: back to the start, nothing changed.
      await page.goto(`${base}/activity/import`);
      await page.getByTestId('import-apple-guide').waitFor({ timeout: 30_000 });
      const before = Object.keys((await state(page)).activities).length;
      const chooser = page.waitForEvent('filechooser');
      await tap(page, 'import-choose-files');
      await (await chooser).setFiles(zip);
      await page.getByText(/% read/).first().waitFor({ timeout: 60_000 });
      const at = plain(await page.getByTestId('import-reading-line').innerText());
      await tap(page, 'import-cancel');
      await page.getByTestId('import-apple-guide').waitFor({ timeout: 30_000 });
      const after = Object.keys((await state(page)).activities).length;
      const hs = await page.evaluate(() => JSON.parse(localStorage.getItem('healthcal-health-sync') || 'null'));
      check(after === before && !hs?.state?.fileSteps, `Cancel at "${at}" went back to the start; nothing saved`);
    }
    const m = await importFile(true);
    console.log(JSON.stringify({ file: zip, zipMB: +(size / 1048576).toFixed(1), seconds: +(m.ms / 1000).toFixed(1), peakHeapMB: +(m.peak / 1048576).toFixed(1), worstFrameMs: Math.round(m.worstFrame), progressShown: m.sawProgress }));
    const rows = await page.getByTestId('import-found').innerText();
    console.log(`review: ${rows.replace(/\s+/g, ' ')}`);
    if (errors.length) console.log(`page errors: ${errors.join(' | ')}`);
    await browser.close();
    process.exit(errors.length || failures.length ? 1 : 0);
  }

  /**
   * Train's "Bring in workouts" row opens its sheet; with no steps on the web the sheet offers
   * "Add steps from your Health export" (`train-steps-import`). The sheet is closed again (Escape).
   */
  async function trainOffersStepsImport() {
    await tap(page, 'train-bring-in');
    const shown = await page.getByTestId('train-steps-import').waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
    await page.keyboard.press('Escape');
    await page.getByTestId('train-bring-sheet').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    return shown;
  }

  // Train before: no steps, and on the web its "Bring in workouts" sheet leads to the import.
  await page.goto(`${base}/train`);
  await page.getByTestId('train-screen').waitFor({ timeout: 30_000 });
  check(await trainOffersStepsImport(), 'Train without steps offers "Add steps from your Health export" in its "Bring in workouts" sheet');

  const fileSteps = () => page.evaluate(() => JSON.parse(localStorage.getItem('healthcal-health-sync') || 'null')?.state?.fileSteps ?? null);
  const activityCount = async () => Object.values((await state(page)).activities).filter((a) => !a.deleted).length;
  const liveNights = async () => Object.values((await state(page)).sleep).filter((n) => !n.deleted);
  const nightsPart = `sleep for ${expected.nights.length} nights`;
  /** From Train, open the import the way a person does ("Bring in workouts", then the steps row), and pick `file`. */
  async function pickFromTrain(file) {
    await page.goto(`${base}/train`);
    await tap(page, 'train-bring-in');
    await tap(page, 'train-steps-import');
    await page.getByTestId('import-apple-guide').waitFor({ timeout: 30_000 });
    const chooser = page.waitForEvent('filechooser');
    await tap(page, 'import-choose-files');
    await (await chooser).setFiles(file);
  }
  const startCount = await activityCount();

  // Closing the review with X is a no: nothing is saved, steps included.
  await pickFromTrain(zip);
  await page.getByTestId('import-summary').waitFor({ timeout: 120_000 });
  const footerLine = plain(await page.getByTestId('import-footer-line').innerText());
  check(new RegExp(`, with steps for \\d+ days and ${nightsPart}$`).test(footerLine), `the footer says the steps and nights go in with the import ("${footerLine}")`);
  const notes0 = plain(await page.getByTestId('import-warning-apple-steps').innerText().catch(() => ''));
  check(/^Steps for \d+ days are saved on this phone with the import\./.test(notes0), `the file note says when the steps are saved ("${notes0}")`);
  const sleepNote0 = plain(await page.getByTestId('import-warning-apple-sleep').innerText().catch(() => ''));
  check(sleepNote0.startsWith(`Sleep for ${expected.nights.length} nights goes to your sleep log with the import.`) && sleepNote0.endsWith('Time awake and time in bed are not counted as sleep.'), `the file note says how many nights go in ("${sleepNote0}")`);
  await tap(page, 'header-close');
  await page.getByTestId('train-screen').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  check((await fileSteps()) === null && (await activityCount()) === startCount && (await liveNights()).length === 0, 'X on the review saved nothing: no steps, no nights, no workouts');
  check(await trainOffersStepsImport(), 'Train still offers the import after X');

  // Only the steps and sleep (every workout unticked), then Undo: they go again.
  await pickFromTrain(zip);
  await page.getByTestId('import-summary').waitFor({ timeout: 120_000 });
  await tap(page, 'import-untick-all');
  const stepsOnly = plain(await page.getByTestId('import-submit').innerText());
  check(stepsOnly === 'Save steps and sleep', `with nothing ticked the button saves the steps and sleep ("${stepsOnly}")`);
  await tap(page, 'import-submit');
  await page.getByTestId('import-done-steps').waitFor({ timeout: 30_000 });
  const savedOnly = await fileSteps();
  check(!!savedOnly && Object.keys(savedOnly.days).length >= 30 && (await activityCount()) === startCount, 'Save saved the steps and no workout');
  const doneSleep0 = plain(await page.getByTestId('import-done-sleep').innerText().catch(() => ''));
  check(doneSleep0 === `Sleep for ${expected.nights.length} nights added to your sleep log.` && (await liveNights()).length === expected.nights.length, `and the nights ("${doneSleep0}")`);
  await tap(page, 'toast-action');
  await page.waitForTimeout(500);
  check((await fileSteps()) === null && (await liveNights()).length === 0, 'Undo took the steps off this phone and the nights out of the sleep log again');
  // A night taken out by Undo is a deleted night: the same file leaves it out, and says so.
  await pickFromTrain(zip);
  await page.getByTestId('import-summary').waitFor({ timeout: 120_000 });
  const sleepNote1 = plain(await page.getByTestId('import-warning-apple-sleep').innerText().catch(() => ''));
  check(sleepNote1 === `${expected.nights.length} nights you deleted are left out.`, `after Undo the same file leaves the nights out ("${sleepNote1}")`);
  await tap(page, 'header-close');
  await page.getByTestId('train-screen').waitFor({ timeout: 30_000 });
  // The rest starts again from the seed, in a browser of its own.
  await context.close();
  ({ ctx: context, p: page } = await freshPage());

  // Closing the screen while a large export is read stops it; reopening shows the start, and nothing is saved later.
  await pickFromTrain(big);
  await page.getByText(/[1-9]\d?% read/).first().waitFor({ timeout: 60_000 });
  const closedAt = plain(await page.getByTestId('import-reading-line').innerText());
  const headerLine = plain(await page.getByTestId('import-screen').innerText());
  check((headerLine.match(/% read/g) || []).length === 1, `the share read is shown once while reading ("${closedAt}")`);
  await tap(page, 'header-close');
  await page.getByTestId('train-screen').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await tap(page, 'train-bring-in');
  await tap(page, 'train-steps-import');
  await page.getByTestId('import-apple-guide').waitFor({ timeout: 30_000 });
  // Long enough for the closed read to have finished, had it gone on.
  await page.waitForTimeout(15_000);
  const startStill = await page.getByTestId('import-apple-guide').isVisible({ timeout: 5_000 }).catch(() => false);
  const reviewShown = await page.getByTestId('import-summary').isVisible().catch(() => false);
  check(startStill && !reviewShown, `closed at "${closedAt}" and reopened: the start stays, no review of the closed file`);
  check((await fileSteps()) === null && (await activityCount()) === startCount, 'the closed read saved nothing');

  // The browser's back button during the read does the same.
  await pickFromTrain(big);
  await page.getByText(/[1-9]\d?% read/).first().waitFor({ timeout: 60_000 });
  await page.goBack();
  await page.getByTestId('train-screen').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(15_000);
  check((await fileSteps()) === null && (await activityCount()) === startCount, 'back during the read: nothing saved, Train shows no steps from it');
  check(await trainOffersStepsImport().catch(() => false), 'Train still offers the import after back');

  // A real-size export's review: no filter chip alone on a line under three or more.
  await pickFromTrain(big);
  await page.getByTestId('import-summary').waitFor({ timeout: 5 * 60_000 });
  const lines = await page.evaluate(() => {
    const tops = [...document.querySelectorAll('[data-testid^="import-filter-"]')].map((el) => Math.round(el.getBoundingClientRect().top));
    const counts = {};
    for (const t of tops) counts[t] = (counts[t] ?? 0) + 1;
    return Object.keys(counts).map(Number).sort((a, b) => a - b).map((t) => counts[t]);
  });
  const lone = lines.length >= 2 && lines[lines.length - 1] === 1 && lines[lines.length - 2] >= 3;
  check(lines.length > 0 && !lone, `the large export's filter chips lie ${lines.join(' + ')} per line`);
  await tap(page, 'header-close');
  await page.getByTestId('train-screen').waitFor({ timeout: 30_000 });

  // One workout of the export is already in HealthCal from a Garmin file (same start, Garmin's identity).
  const known = expected.saved.find((w) => w.from === 'Apple Watch');
  await page.evaluate((w) => {
    window.__healthcal.getState().upsert('activities', {
      date: w.start.slice(0, 10), activityId: w.activity, name: 'From a Garmin file', emoji: '🏃', category: 'cardio', intensity: 'moderate', durationMin: 40, met: 8, kcalGross: 500, kcalNet: 400,
      weightKg: 70, baselineKcalPerDay: 2200, source: 'garmin', externalId: `garmin:${w.start}`, startedAt: w.start, loggedAt: w.start, measured: true,
    });
  }, known);

  // A night entered by hand is never replaced by the file.
  const handNight = expected.nights[Math.min(5, expected.nights.length - 1)];
  await page.evaluate((date) => window.__healthcal.getState().upsert('sleep', { date, hours: 5, quality: 3 }), handNight.date);

  const first = await importFile(!!flags.measure);
  check(true, `read ${(size / 1048576).toFixed(1)} MB export.zip in ${(first.ms / 1000).toFixed(1)} s`);
  const found = plain(await page.getByTestId('import-found').innerText());
  // Listed: every saved one, the one already in HealthCal, and those that need an activity.
  check(found.startsWith(`${expected.saved.length + expected.ask} `), `review lists ${expected.saved.length + expected.ask} workouts (${found})`);
  await tap(page, 'import-submit');
  await page.getByTestId('import-done').waitFor({ timeout: 30_000 });
  const doneSteps = plain(await page.getByTestId('import-done-steps').innerText().catch(() => ''));
  check(/^Steps for 3[0-9] days saved on this phone/.test(doneSteps), `done view: "${doneSteps}"`);
  const doneSleep = plain(await page.getByTestId('import-done-sleep').innerText().catch(() => ''));
  check(doneSleep === `Sleep for ${expected.nights.length - 1} nights added to your sleep log.`, `done view: "${doneSleep}"`);

  const s1 = await state(page);
  const acts = Object.values(s1.activities).filter((a) => !a.deleted);
  const fromExport = acts.filter((a) => a.source === 'health');
  check(fromExport.length === expected.saved.length - 1, `${fromExport.length} workouts saved from the export (expected ${expected.saved.length - 1})`);
  const starts = new Set(acts.map((a) => a.startedAt));
  check(expected.saved.every((w) => starts.has(w.start)), 'every expected workout is in the store by its start');
  check(acts.filter((a) => a.startedAt === known.start).length === 1, 'the workout already imported from a Garmin file is there once');
  check(fromExport.every((a) => /^health:com\.apple\.health\.watch:|^garmin:/.test(a.externalId) && a.measured === true), 'each keeps where it came from (Apple Watch or Garmin Connect) and its measured calories');
  check(!JSON.stringify(s1).includes('Jo’s'), 'no personal device name is stored');
  check(fromExport.some((a) => a.externalId.startsWith('garmin:')), 'a session also written by Garmin Connect is saved once, as Garmin Connect’s');

  // The sleep log: the watch's nights, each its time asleep (time awake and the iPhone's time in bed not counted, the nap not added).
  const byDate = Object.fromEntries((await liveNights()).map((n) => [n.date, n]));
  const wrong = expected.nights.filter((n) => n.date !== handNight.date).filter((n) => {
    const got = byDate[n.date];
    return !got || got.hours !== n.hours || got.source !== 'health' || got.store !== 'file' || got.origin !== n.origin || got.quality !== undefined || !got.stages || got.stages.awake === undefined;
  });
  check(wrong.length === 0, `${expected.nights.length - 1} nights saved from the export, each with the watch's hours and stages${wrong.length ? `; wrong: ${JSON.stringify(wrong.slice(0, 3).map((n) => [n, byDate[n.date]]))}` : ''}`);
  check(expected.noNight.every((d) => !byDate[d]), `no night for the ${expected.noNight.length} nights the watch was charging (only the iPhone's time in bed)`);
  check(Object.keys(byDate).length === expected.nights.length, `nothing else in the sleep log (${Object.keys(byDate).length} nights)`);
  const hand = byDate[handNight.date];
  check(!!hand && hand.hours === 5 && hand.quality === 3 && hand.source === undefined, `the night entered by hand on ${handNight.date} is left as it was`);

  // The sleep screen: last night (or the newest night) says it is from the Health export.
  await page.goto(`${base}/sleep`);
  await page.getByTestId('sleep-screen').waitFor({ timeout: 30_000 });
  const todayKey = new Date().toISOString().slice(0, 10);
  const lastNight = expected.nights.find((n) => n.date === todayKey && n.date !== handNight.date);
  if (lastNight) {
    const from = plain(await page.getByTestId('sleep-last-night-from').innerText().catch(() => ''));
    const stagesShown = plain(await page.getByTestId('sleep-last-night-stages').innerText().catch(() => ''));
    check(from === 'From your Health export' && /^Light .* · Deep .* · REM /.test(stagesShown), `sleep screen, last night: "${from}", "${stagesShown}"`);
  } else {
    const row = plain(await page.getByTestId('sleep-row-0').innerText().catch(() => ''));
    check(row.includes('From your Health export'), `sleep screen, newest night: "${row}"`);
  }

  // Train: today's steps by the rule, and where they are from.
  await page.goto(`${base}/train`);
  await page.getByTestId('train-steps').waitFor({ timeout: 30_000 });
  const line = plain(await page.getByTestId('train-steps-line').innerText());
  const source = plain(await page.getByTestId('train-steps-source').innerText());
  const today = new Date().toISOString().slice(0, 10);
  const want = expected.stepDays[today];
  check(want === undefined || line.startsWith(`${want.toLocaleString('en-US')} steps today`), `Train: "${line}" (expected today ${want})`);
  check(/^From your Health export, [A-Z][a-z]{2} \d+$/.test(source), `Train says where they are from: "${source}"`);
  const hs = await page.evaluate(() => JSON.parse(localStorage.getItem('healthcal-health-sync') || 'null'));
  const kept = hs?.state?.fileSteps?.days ?? {};
  const mismatched = Object.entries(kept).filter(([d, n]) => d !== today && expected.stepDays[d] !== n);
  check(Object.keys(kept).length >= 30 && mismatched.length === 0, `${Object.keys(kept).length} days kept on this phone, each equal to the rule's total${mismatched.length ? `; differ: ${JSON.stringify(mismatched.slice(0, 3))}` : ''}`);
  check(!JSON.stringify(s1).includes('fileSteps'), 'steps are not in the synced store');

  // The same file again adds nothing.
  await importFile(false);
  const summary = plain(await page.getByTestId('import-summary-line').innerText());
  // Nothing ticked: the one thing left to save is the file's steps (or nothing at all).
  const again = plain(await page.getByTestId('import-submit').innerText().catch(() => ''));
  check(/already in HealthCal|^0 ticked/.test(summary) && (again === '' || /^Save steps for \d+ days$|^Nothing to import$/.test(again)), `second import: "${summary}", button "${again}"`);
  const sleepNote2 = plain(await page.getByTestId('import-warning-apple-sleep').innerText().catch(() => ''));
  check(sleepNote2 === `The ${expected.nights.length} nights in this file are already in your sleep log.`, `second import, sleep: "${sleepNote2}"`);
  const s2 = await state(page);
  check(Object.values(s2.activities).filter((a) => !a.deleted).length === acts.length, 'the second import added nothing');

  if (flags.measure) console.log(JSON.stringify({ seconds: +(first.ms / 1000).toFixed(1), peakHeapMB: +(first.peak / 1048576).toFixed(1), worstFrameMs: Math.round(first.worstFrame), progressShown: first.sawProgress }));

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await browser.close();
  console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
