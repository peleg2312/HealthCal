#!/usr/bin/env node
/**
 * Gathers the facts a reviewer needs about a set of screens, with no judgement:
 * a screenshot of each route in each theme and width, every runtime error, and a
 * scan of the page for text that is cut off, content wider than the screen and
 * touch targets under 44 px. Writes PNGs, contact sheets and report.json.
 *
 * It also lays the whole page out at once (the window grown to the page's height) and
 * reports what sits wrongly:
 *   overText    text drawn over other text, or side by side with less than 3 px between
 *   broken      a word split over two lines because its box is too narrow
 *   sticksOut   text or a painted box reaching past the card, row or button that holds it
 *   controls    two controls whose visible boxes overlap
 *   hidden      content still under the tab bar or a pinned footer when the page is
 *               scrolled to its end (checked at the real window height)
 *   gaps        a card closer than 8 px to the card under it, text closer than 4 px to
 *               its card's edge, and a full-width card whose side margins differ
 * Not reported, because they are drawn that way on purpose: lines 6 px thick or less
 * (the level line, ticks, the brim line that is wider than its cup), the + cup over
 * the tab bar, labels on a corner such as the Friends count, and anything not drawn
 * (a hit area, an empty wrapper). Sheets are closed during the scan.
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
  // A control partly under the tab bar or a pinned footer is judged once it is scrolled into the open, not here.
  let chromeTop = window.innerHeight;
  const bar = document.querySelector('[data-testid="tab-bar"]');
  if (bar) chromeTop = Math.min(chromeTop, bar.getBoundingClientRect().top);
  for (const f of document.querySelectorAll('[data-testid="screen-footer"]')) chromeTop = Math.min(chromeTop, f.getBoundingClientRect().top);
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
      // Not judged: a control that is switched off, or one partly scrolled out of a sideways row (its edge is off the screen).
      const off = el.disabled || el.getAttribute('aria-disabled') === 'true';
      const inside = r.left >= 0 && r.right <= vw;
      if (!off && inside && r.top >= 0 && r.bottom + 21 <= chromeTop && (r.width < 44 || r.height < 44) && !(hits(-21, 0) && hits(21, 0) && hits(0, -21) && hits(0, 21))) {
        small.push({ id: label(el) || ownText.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }
  return { cut: cut.slice(0, 25), small: small.slice(0, 25), wide: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0 };
}

/**
 * Runs in the page, laid out at full height: what is drawn over, past or too close to
 * something else. Returns short descriptions, at most 12 of each kind.
 */
function layoutScan() {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const all = [...document.querySelectorAll('body *')];
  const shown = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  const R = (r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const empty = (a) => a.r - a.l < 0.5 || a.b - a.t < 0.5;
  const w = (a) => a.r - a.l;
  const h = (a) => a.b - a.t;
  const name = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const id = e.getAttribute('data-testid') || e.getAttribute('aria-label');
      if (id) return id.slice(0, 40);
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (own) return `"${own.slice(0, 30)}"`;
    }
    return el.tagName.toLowerCase();
  };
  // What each element is clipped to by ancestors that hide their overflow.
  const clips = new Map();
  const clipOf = (el) => {
    if (!el || el === document.documentElement) return { l: -1e6, t: -1e6, r: 1e6, b: 1e6 };
    if (clips.has(el)) return clips.get(el);
    let c = clipOf(el.parentElement);
    const p = el.parentElement;
    if (p && p !== document.documentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') c = inter(c, R(p.getBoundingClientRect()));
    }
    clips.set(el, c);
    return c;
  };
  const visibleRect = (el, r = el.getBoundingClientRect()) => inter(R(r), clipOf(el));
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };
  const painted = (el) => {
    const s = getComputedStyle(el);
    if (alpha(s.backgroundColor) > 0) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0);
  };
  // A card or a row with a box of its own: a fill unlike what is behind it, or a border all round
  // (a row with only a divider line under it is not a box).
  const behind = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (alpha(c) > 0) return c; } return ''; };
  const boxed = (el) => {
    const s = getComputedStyle(el);
    if (alpha(s.backgroundColor) > 0 && s.backgroundColor !== behind(el)) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0);
  };
  const isControl = (el) => el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || ['button', 'link', 'switch', 'tab', 'checkbox', 'radio', 'slider'].includes(el.getAttribute('role'));
  const onPurpose = (el) => !!el.closest('[data-testid="tab-add"], [data-testid$="-count"]');
  const fullPage = (r) => w(r) >= vw - 2;

  // Text, line by line, as drawn. A line's box is the font's whole height; the letters
  // themselves take about the middle 70% of it, so big numbers set with a tight line
  // height do not count as touching the line above.
  const texts = [];
  for (const el of all) {
    if (!shown(el) || onPurpose(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      // Word by word, joined into lines: a wrapped line's own box would include the space it broke at.
      const lines = new Map();
      const re = /\S+/g;
      let m;
      while ((m = re.exec(n.textContent))) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        for (const q of range.getClientRects()) {
          if (q.width <= 0) continue;
          const k = Math.round(q.top);
          const l = lines.get(k);
          lines.set(k, l ? { left: Math.min(l.left, q.left), right: Math.max(l.right, q.right), top: Math.min(l.top, q.top), bottom: Math.max(l.bottom, q.bottom) } : { left: q.left, right: q.right, top: q.top, bottom: q.bottom });
        }
      }
      for (const line of lines.values()) {
        const mid = (line.top + line.bottom) / 2;
        const r = { left: line.left, right: line.right, top: Math.max(line.top, mid - fs * 0.42), bottom: Math.min(line.bottom, mid + fs * 0.42) };
        const v = visibleRect(el, r);
        if (!empty(v) && w(v) > 1) texts.push({ el, r: v });
      }
    }
  }
  // Painted boxes (a fill or a border) and drawings.
  const boxes = [];
  for (const el of all) {
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    if (!shown(el) || onPurpose(el)) continue;
    const art = el.tagName === 'svg' || el.tagName === 'IMG' || el.tagName === 'CANVAS';
    if (!art && !painted(el)) continue;
    const v = visibleRect(el);
    if (!empty(v)) boxes.push({ el, r: v, art });
  }
  const paintedSet = new Set(boxes.filter((b) => !b.art).map((b) => b.el));
  const holder = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (paintedSet.has(e)) return e;
    return null;
  };
  const out = { overText: [], broken: [], sticksOut: [], controls: [], gaps: [] };
  const add = (k, v) => { if (out[k].length < 12 && !out[k].includes(v)) out[k].push(v); };

  // 1. Text over text.
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const o = inter(a.r, b.r);
      if (w(o) > 2 && h(o) > 2) add('overText', `${name(a.el)} over ${name(b.el)} (${Math.round(w(o))}x${Math.round(h(o))})`);
    }
  }
  // 1a. A word split over two lines ("Moderat" / "e"): the box is too narrow for it.
  for (const el of all) {
    if (out.broken.length >= 12 || !shown(el) || onPurpose(el)) continue;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const re = /[A-Za-z\u00C0-\u024F]{2,}/g;
      let m;
      while ((m = re.exec(n.textContent))) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (lines.size > 1) add('broken', `"${m[0]}" split over two lines in ${name(el)}`);
      }
    }
  }
  // 1b. Text side by side with less than 4 px between (one label running into the next).
  for (let i = 0; i < texts.length; i++) {
    for (let j = 0; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (i === j || a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // Words of one sentence set in different styles (a bold lead, a number and its unit) flow together on purpose.
      const flows = (el) => !el.closest('svg') && getComputedStyle(el).display === 'inline';
      if (flows(a.el) || flows(b.el)) continue;
      const vo = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
      const gap = b.r.l - a.r.r;
      if (vo > Math.min(h(a.r), h(b.r)) * 0.5 && gap >= -2 && gap < 3) add('overText', `${name(a.el)} runs into ${name(b.el)} (${Math.round(gap)}px apart)`);
    }
  }
  // 2. Text or a box reaching past what holds it (thin lines and ticks are drawn past on purpose).
  const sticks = (el, r) => {
    const c = holder(el);
    if (!c) return;
    const cr = R(c.getBoundingClientRect());
    if (fullPage(cr) && h(cr) > vh * 0.5) return;
    const past = Math.max(cr.l - r.l, r.r - cr.r, cr.t - r.t, r.b - cr.b);
    if (past > 1.5) add('sticksOut', `${name(el)} ${Math.round(past)}px past ${name(c)}`);
  };
  for (const t of texts) sticks(t.el, t.r);
  for (const b of boxes) if (Math.min(w(b.r), h(b.r)) > 6) sticks(b.el, b.r);

  // 3. Controls whose visible boxes overlap: the box is what is drawn (fills, borders, text), not the hit area.
  const controls = all.filter((el) => isControl(el) && shown(el) && !onPurpose(el) && !el.closest('[aria-disabled="true"]'));
  const drawn = controls.map((el) => {
    let r = null;
    const grow = (x) => { r = r ? { l: Math.min(r.l, x.l), t: Math.min(r.t, x.t), r: Math.max(r.r, x.r), b: Math.max(r.b, x.b) } : x; };
    for (const b of boxes) if (b.el === el || el.contains(b.el)) grow(b.r);
    for (const t of texts) if (t.el === el || el.contains(t.el)) grow(t.r);
    return r;
  });
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      if (!drawn[i] || !drawn[j] || controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const o = inter(drawn[i], drawn[j]);
      if (w(o) > 1 && h(o) > 1) add('controls', `${name(controls[i])} and ${name(controls[j])} (${Math.round(w(o))}x${Math.round(h(o))})`);
    }
  }

  // 4. Cards: painted, at least 120 x 40, not a control, not the page, not inside another card.
  const cardLike = boxes.filter((b) => !b.art && !isControl(b.el) && !b.el.closest('button,[role="button"]') && w(b.r) >= 120 && h(b.r) >= 40 && !fullPage(b.r) && boxed(b.el));
  const cardSet = new Set(cardLike.map((b) => b.el));
  const cardOf = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (cardSet.has(e)) return e; return null; };
  const top = cardLike.filter((b) => !cardOf(b.el));
  for (const a of top) {
    let best = null;
    for (const b of top) {
      if (b === a || b.r.t < a.r.t + 1) continue;
      const ov = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l);
      if (ov < Math.min(w(a.r), w(b.r)) * 0.5) continue;
      const gap = b.r.t - a.r.b;
      if (!best || gap < best.gap) best = { b, gap };
    }
    if (best && best.gap < 8) add('gaps', `${Math.round(best.gap)}px between card ${name(a.el)} and ${name(best.b.el)}`);
    // A card as wide as the content: the same margin each side.
    if (w(a.r) >= vw * 0.7) {
      const left = a.r.l;
      const right = vw - a.r.r;
      if (Math.abs(left - right) > 2) add('gaps', `card ${name(a.el)} sits ${Math.round(left)}px from the left, ${Math.round(right)}px from the right`);
    }
  }
  for (const t of texts) {
    const c = cardOf(t.el) || (cardSet.has(t.el) ? t.el : null);
    if (!c) continue;
    const cr = R(c.getBoundingClientRect());
    const d = Math.min(t.r.l - cr.l, cr.r - t.r.r, t.r.t - cr.t, cr.b - t.r.b);
    if (d >= -1.5 && d < 4) add('gaps', `${name(t.el)} ${Math.max(0, Math.round(d))}px from the edge of ${name(c)}`);
  }
  return out;
}

/** Runs in the page at its real height: scrolls the page to its end and reports what is still under the tab bar or a pinned footer. */
function hiddenAtEnd() {
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  let sc = null;
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight - el.clientHeight < 2 || el.clientWidth < vw * 0.6) continue;
    if (!sc || el.scrollHeight - el.clientHeight > sc.scrollHeight - sc.clientHeight) sc = el;
  }
  if (!sc) return [];
  const before = sc.scrollTop;
  sc.scrollTop = sc.scrollHeight;
  const area = sc.getBoundingClientRect();
  // Chrome: opaque, wide things outside the scroller in the lower half of the window (the tab bar, a footer).
  let cover = Math.min(area.bottom, vh);
  for (const el of document.querySelectorAll('body *')) {
    if (sc.contains(el) || el.contains(sc)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.8 || r.top < vh * 0.5 || r.height < 20) continue;
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) continue;
    cover = Math.min(cover, r.top);
  }
  const found = [];
  for (const el of sc.querySelectorAll('*')) {
    if (found.length >= 8) break;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own && !['BUTTON', 'INPUT'].includes(el.tagName) && el.getAttribute('role') !== 'button') continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.bottom <= cover + 1 || r.top >= vh) continue;
    found.push(`${(el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 40)} ${Math.round(r.bottom - cover)}px under`);
  }
  sc.scrollTop = before;
  return found;
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
        let layout = { overText: [], broken: [], sticksOut: [], controls: [], gaps: [], hidden: [] };
        try {
          await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
          // Wait until the app has drawn something, so a slow start is not photographed as a blank page.
          await page.waitForSelector('[data-testid]', { timeout: 15000 }).catch(() => errors.push('nothing was drawn within 15 s'));
          await page.waitForTimeout(700);
          found = await page.evaluate(scan);
          const hidden = await page.evaluate(hiddenAtEnd);
          await page.waitForTimeout(100);
          await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
          // The whole page at once: grow the window until the scrolling element fits (React Native Web scrolls an inner element).
          const extra = await page.evaluate(() => { let m = 0; for (const el of document.querySelectorAll('*')) m = Math.max(m, el.scrollHeight - el.clientHeight); return m; });
          const vp = page.viewportSize();
          if (extra > 0) { await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + extra, 8000) }); await page.waitForTimeout(400); }
          layout = { ...(await page.evaluate(layoutScan)), hidden };
        } catch (e) {
          errors.push(`did not load: ${String(e.message).split('\n')[0].slice(0, 100)}`);
        }
        screens.push({ route, theme, width, image: `${name}.png`, crashed: (await page.getByTestId('error-retry').count().catch(() => 0)) > 0, errors: [...new Set(errors)].slice(0, 5), ...found, layout });
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
  const LAYOUT = ['overText', 'broken', 'sticksOut', 'controls', 'hidden', 'gaps'];
  const layoutCount = (s) => LAYOUT.reduce((n, k) => n + (s.layout?.[k]?.length || 0), 0);
  const problems = screens.filter((s) => s.crashed || s.errors.length || s.cut.length || s.wide || s.small.length || layoutCount(s));
  console.log(`${screens.length} screens in ${out}; ${problems.length} with something to look at; ${sheets.length} sheets`);
  for (const s of problems.slice(0, Number(flags.show || 40))) {
    const bits = [s.crashed ? 'ERROR SCREEN' : '', s.errors.length ? `${s.errors.length} error(s): ${s.errors[0]}` : '', s.wide ? `page ${s.wide}px too wide` : '', s.cut.length ? `cut: ${s.cut.slice(0, 3).map((c) => `"${c.text}"`).join(', ')}${s.cut.length > 3 ? ` +${s.cut.length - 3}` : ''}` : '', s.small.length ? `small targets: ${s.small.slice(0, 3).map((t) => `${t.id} ${t.w}x${t.h}`).join(', ')}` : '', ...LAYOUT.filter((k) => s.layout?.[k]?.length).map((k) => `${k}: ${s.layout[k].slice(0, 2).join('; ')}${s.layout[k].length > 2 ? ` +${s.layout[k].length - 2}` : ''}`)].filter(Boolean);
    console.log(`  ${s.route} [${s.theme} ${s.width}] ${bits.join('; ')}`);
  }
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `: ${c.tail}`}`);
  process.exit(checks.some((c) => !c.ok) || screens.some((s) => s.crashed) ? 1 : 0);
})();
