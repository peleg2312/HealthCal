#!/usr/bin/env node
/**
 * Gathers the facts a reviewer needs about a set of screens, with no judgement:
 * a screenshot of each route in each theme and width, every runtime error, and a
 * scan of the page for text that is cut off, content wider than the screen and
 * touch targets under 44 px. Writes PNGs, contact sheets and report.json.
 *
 *   node scripts/dev/evidence.cjs --out=<dir> --routes=/,/diary,/water
 *        [--themes=blossom,light,dark] [--widths=390,320] [--empty] [--fresh]
 *        [--checks]   also run type-check, lint, unit tests, e2e and the route check
 *        [--url=http://localhost:8081]
 *
 * The page runs with reduced motion, so every screenshot is the resting state.
 */
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const out = path.resolve(flags.out || 'evidence');
const base = flags.url || 'http://localhost:8081';
const routes = String(flags.routes || '/').split(',').filter(Boolean);
const themes = String(flags.themes || 'blossom,light,dark').split(',');
const widths = String(flags.widths || '390,320').split(',').map(Number);
const ROOT = path.join(__dirname, '..', '..');

/** Runs in the page: what is visibly cut, too wide or too small to tap. */
function scan() {
  const seen = new Set();
  const cut = [];
  const small = [];
  const vw = document.documentElement.clientWidth;
  const label = (el) => (el.getAttribute('data-testid') || el.getAttribute('aria-label') || '').slice(0, 40);
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight * 4) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.opacity === '0') continue;
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (ownText && (el.scrollWidth > el.clientWidth + 1 || (style.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1)) && style.overflow !== 'visible') {
      const key = ownText.slice(0, 40);
      if (!seen.has(key)) { seen.add(key); cut.push({ text: ownText.slice(0, 60), shows: Math.round(el.clientWidth), needs: Math.round(el.scrollWidth) }); }
    }
    const role = el.getAttribute('role');
    if ((el.tagName === 'BUTTON' || role === 'button' || role === 'switch' || role === 'tab' || role === 'link') && r.top < window.innerHeight * 3) {
      // The kit widens small controls with an invisible area: measure what a tap would hit, 21 px from the centre.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hits = (dx, dy) => { const t = document.elementFromPoint(cx + dx, cy + dy); return !!t && (t === el || el.contains(t) || t.contains(el)); };
      if (r.top >= 0 && r.bottom <= window.innerHeight && (r.width < 44 || r.height < 44) && !(hits(-21, 0) && hits(21, 0) && hits(0, -21) && hits(0, 21))) {
        small.push({ id: label(el) || ownText.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }
  return { cut: cut.slice(0, 25), small: small.slice(0, 25), wide: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0 };
}

function runChecks() {
  const run = (name, cmd, timeout = 600000) => {
    try {
      const text = execSync(cmd, { cwd: ROOT, timeout, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      return { name, ok: true, tail: text.trim().split('\n').slice(-2).join(' | ').slice(0, 240) };
    } catch (e) {
      const text = `${e.stdout || ''}\n${e.stderr || ''}`.trim();
      return { name, ok: false, tail: text.split('\n').filter((l) => /error|FAIL|✗|×|aborted|failed/i.test(l)).slice(0, 8).join(' | ').slice(0, 900) || text.slice(-400) };
    }
  };
  return [
    run('type-check', 'npx tsc --noEmit'),
    run('lint', 'npx expo lint'),
    run('unit tests', 'npx vitest run'),
    run('first-day end to end', 'node scripts/dev/e2e.cjs'),
    run('every route opens', 'node scripts/dev/check-routes.cjs'),
  ];
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const { buildSeed } = await import('./seed.mjs');
  const browser = await chromium.launch();
  const screens = [];
  for (const theme of themes) {
    const seed = JSON.stringify(buildSeed({ theme, empty: !!flags.empty, onboarded: !flags.fresh }));
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 360 ? 640 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light', isMobile: true, hasTouch: true });
      await context.addInitScript((value) => {
        if (!sessionStorage.getItem('seeded')) { localStorage.setItem('healthcal-v1', value); sessionStorage.setItem('seeded', '1'); }
      }, seed);
      for (const route of routes) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message.split('\n')[0].slice(0, 140)));
        page.on('console', (m) => { if (m.type() === 'error' && !/Download the React DevTools|favicon/.test(m.text())) errors.push(`console: ${m.text().slice(0, 140)}`); });
        const name = `${(route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'today')}__${theme}__${width}${flags.empty ? '__empty' : ''}`;
        let found = { cut: [], small: [], wide: 0 };
        try {
          await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
          // Wait until the app has drawn something, so a slow start is not photographed as a blank page.
          await page.waitForSelector('[data-testid]', { timeout: 15000 }).catch(() => errors.push('nothing was drawn within 15 s'));
          await page.waitForTimeout(700);
          found = await page.evaluate(scan);
          await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
        } catch (e) {
          errors.push(`did not load: ${String(e.message).split('\n')[0].slice(0, 100)}`);
        }
        screens.push({ route, theme, width, image: `${name}.png`, crashed: (await page.getByTestId('error-retry').count().catch(() => 0)) > 0, errors: [...new Set(errors)].slice(0, 5), ...found });
        await page.close();
      }
      await context.close();
    }
  }
  await browser.close();

  // One sheet per route: every theme and width side by side, large enough to read.
  const sheets = [];
  for (const route of routes) {
    const mine = screens.filter((s) => s.route === route);
    const dir = path.join(out, '_tmp');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir);
    for (const s of mine) if (fs.existsSync(path.join(out, s.image))) fs.copyFileSync(path.join(out, s.image), path.join(dir, s.image));
    const sheet = `sheet-${(route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'today')}${flags.empty ? '-empty' : ''}.png`;
    try {
      execSync(`node ${JSON.stringify(path.join(__dirname, 'contact-sheet.cjs'))} ${JSON.stringify(dir)} ${JSON.stringify(path.join(out, sheet))} ${mine.length} 330 1100`, { stdio: 'ignore' });
      sheets.push(sheet);
    } catch { /* the single screenshots are still there */ }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const checks = flags.checks ? runChecks() : [];
  const report = { taken: new Date().toISOString(), base, sheets, checks, screens };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const problems = screens.filter((s) => s.crashed || s.errors.length || s.cut.length || s.wide || s.small.length);
  console.log(`${screens.length} screens in ${out}; ${problems.length} with something to look at; ${sheets.length} sheets`);
  for (const s of problems.slice(0, 40)) {
    const bits = [s.crashed ? 'ERROR SCREEN' : '', s.errors.length ? `${s.errors.length} error(s): ${s.errors[0]}` : '', s.wide ? `page ${s.wide}px too wide` : '', s.cut.length ? `cut: ${s.cut.slice(0, 3).map((c) => `"${c.text}"`).join(', ')}${s.cut.length > 3 ? ` +${s.cut.length - 3}` : ''}` : '', s.small.length ? `small targets: ${s.small.slice(0, 3).map((t) => `${t.id} ${t.w}x${t.h}`).join(', ')}` : ''].filter(Boolean);
    console.log(`  ${s.route} [${s.theme} ${s.width}] ${bits.join('; ')}`);
  }
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `: ${c.tail}`}`);
  process.exit(checks.some((c) => !c.ok) || screens.some((s) => s.crashed) ? 1 : 0);
})();
