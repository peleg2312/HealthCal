#!/usr/bin/env node
/**
 * Gathers the facts a reviewer needs about a set of screens, with no judgement:
 * a screenshot of each route (or state, below) in each theme and width, every runtime
 * error, and a scan for text that is cut off, content wider than the screen and touch
 * targets under 44 px. Writes PNGs, one contact sheet per route or state, and report.json.
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
 *               its card's edge, a full-width card whose side margins differ (a text
 *               field's box is a field, not a card), and text closer than 12 px to the
 *               screen's left or right edge (a title that does not shorten inside the
 *               side padding; not in a row that scrolls sideways)
 *   header      the top of the screen against the header rule (checked at the real window height):
 *               a pushed screen's header without a back cup or X, a title and one short line, a
 *               tab header without its overline, or a second screen title under either (text of
 *               21 px or more with words, outside a card, in the first 160 px under the header)
 *   toast       a toast that covers a control in an open sheet, a pinned footer or the tab bar, or
 *               that starts above the top of the screen: judged after each tap and at the capture,
 *               always at the real window height (never against the page grown to its full height)
 * Text cut with no ellipsis is `cut`, and so is a field's placeholder wider than the field. A name
 * that ends in an ellipsis after its allowed lines is shortened by design: listed in report.json as
 * `shortened` and printed under its own heading, not counted as something to look at.
 * Not reported, because they are drawn that way on purpose: lines 6 px thick or less
 * (the level line, ticks, the brim line that is wider than its cup), the + cup over
 * the tab bar, labels on a corner such as the Friends count, lines a text clamp hides,
 * miniatures hidden from screen readers (the "Match my phone" preview draws two halves),
 * a control whose tap area is partly scrolled out of its list (under a pinned header),
 * and anything not drawn (a hit area, an empty wrapper). Text in a drawing (the share
 * card's SVG) is measured at the size it is drawn, its font size times the drawing's scale.
 *
 *   node scripts/dev/evidence.cjs --out=<dir> --routes=/,/diary,/water
 *        [--themes=blossom,light,dark] [--widths=390,320] [--empty] [--fresh] [--stress] [--imperial]
 *        [--states=<list>[,<list>]] [--only=<state id>[,<id>]]
 *        [--checks]   also run type-check, lint, unit tests, e2e and the route check
 *        [--tries=3]  attempts at a capture before it is reported as not captured
 *        [--show=40]  problems to print; [--url=http://localhost:8081]
 *
 * STATES. A route shows a screen as it first opens; a state opens it and then does what a
 * person would: taps, types, picks a file, opens a sheet. --states=<list> loads
 * scripts/dev/states/<list>.cjs, which exports an array of plain objects:
 *
 *   {
 *     id: 'diary-imperial',        kebab-case, unique; names the PNGs (<id>__<theme>__<width>.png),
 *                                  the contact sheet (sheet-<id>.png) and the report entries
 *     route: '/diary?date={day}',  where it starts; {day} is replaced by `day`
 *     day: -2,                     days from today for {day} (local calendar), e.g. a past diary day
 *     data: 'demo',                demo (default) | empty (profile, nothing logged) | fresh (nothing
 *                                  stored: welcome and onboarding) | stress (long names, big numbers:
 *                                  buildSeed({ stress: true }) in seed.mjs)
 *     imperial: true,              the profile in lb, ft in, fl oz and mi
 *     type: { 'food-search-input': 'banana' },   typed after the screen opens, before the taps
 *     taps: [                      done in order, ~0.7 s apart:
 *       'tab-add',                   tap the element with this testID ('^prefix-' taps the first
 *                                    whose testID starts with prefix-)
 *       { type: 'onb-name-input', text: 'Dana' },   type into an input between taps
 *       { choose: 'import-choose-files', files: ['scripts/dev/states/files/morning-run.gpx'] },
 *                                    tap a control that opens the file picker and pick these files
 *                                    (paths from the repository root)
 *       { wait: 800 },               wait this many milliseconds
 *     ],
 *     waitFor: 'import-list',      a testID that must be visible before the capture
 *     sheet: true,                 a sheet is open at the end (and must be: a capture with a
 *                                  sheet open when the state does not say so is not captured)
 *     note: 'what it shows',       for people; copied to report.json
 *   }
 *
 * Every state is captured in every theme and width, each in a fresh page with its own stored
 * data. A capture that is blank, half-loaded (fonts, data), whose step failed, whose waitFor
 * never showed or whose sheet is missing is tried again (--tries) and then reported as
 * NOT CAPTURED, never as clean, and the run exits 1. report.json has `states` (each state's
 * fields) and one `screens` entry per capture with `id`, `kind` ('route' | 'state'), theme,
 * width, image, sheetImage and the findings.
 *
 * OPEN SHEETS. With a sheet open, the sheet is scanned instead of the page (which is covered
 * and not judged): the same scans as a page inside the sheet (with the window grown until the
 * sheet's body no longer scrolls), plus, at the real window height, under `sheet`:
 *   - its top above the top of the screen;
 *   - content cut by the bottom of the screen where nothing scrolls to reach it;
 *   - its last control, with the sheet scrolled to its end, closer than 12 px to the bottom
 *     of the screen;
 *   - text, a control or a painted box closer to the sheet's left or right edge than the
 *     sheet's own side padding (read from the kit's sheet body, 20 px).
 * Left out of the sheet scan on purpose: anything in a sideways-scrolling row (its edges are
 * wherever it was scrolled to), boxes as wide as the sheet (its own surface, dividers), the
 * drag handle and the backdrop. `hidden` is not checked in a sheet.
 *
 * Two runs at once are safe: each has its own browser and writes only into its own --out.
 * The page runs with reduced motion, so every screenshot is the resting state.
 * scripts/dev/evidence-selftest.cjs proves the scans against hand-made faults.
 */
const { chromium } = require('playwright');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const out = path.resolve(flags.out || 'evidence');
const base = flags.url || 'http://localhost:8081';
// Without --routes: the Today screen, unless states were asked for (then only the states).
const routes = String(flags.routes || (flags.states ? '' : '/')).split(',').filter(Boolean);
const themes = String(flags.themes || 'blossom,light,dark').split(',');
const widths = String(flags.widths || '390,320').split(',').map(Number);
const ROOT = path.join(__dirname, '..', '..');

/**
 * Runs in the page: what is visibly cut, too wide or too small to tap. With `rootSel`
 * (an open sheet) only what is inside the newest element it matches.
 */
function scan(rootSel) {
  const seen = new Set();
  const cut = [];
  const shortened = [];
  const small = [];
  const vw = document.documentElement.clientWidth;
  const root = rootSel ? [...document.querySelectorAll(rootSel)].pop() || document.body : document.body;
  // A control partly under the tab bar or a pinned footer is judged once it is scrolled into the open, not here.
  let chromeTop = window.innerHeight;
  if (!rootSel) {
    const bar = document.querySelector('[data-testid="tab-bar"]');
    if (bar) chromeTop = Math.min(chromeTop, bar.getBoundingClientRect().top);
    for (const f of document.querySelectorAll('[data-testid="screen-footer"]')) chromeTop = Math.min(chromeTop, f.getBoundingClientRect().top);
  }
  const label = (el) => (el.getAttribute('data-testid') || el.getAttribute('aria-label') || '').slice(0, 40);
  for (const el of root.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight * 4) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.opacity === '0') continue;
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (ownText && (el.scrollWidth > el.clientWidth + 1 || (style.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1)) && style.overflow !== 'visible') {
      const key = ownText.slice(0, 40);
      // A name that ends in an ellipsis after its allowed lines is shortened by design; "cut" is text clipped with no ellipsis.
      const ellipsis = style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none';
      if (!seen.has(key)) { seen.add(key); (ellipsis ? shortened : cut).push({ text: ownText.slice(0, 60), shows: Math.round(el.clientWidth), needs: Math.round(el.scrollWidth) }); }
    }
    // A one-line field's placeholder wider than the field: the browser clips it mid-word with no ellipsis.
    if (el.tagName === 'INPUT' && !el.value && el.placeholder && r.top < window.innerHeight * 3) {
      const ctx = (scan.canvas ||= document.createElement('canvas')).getContext('2d');
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const needs = ctx.measureText(el.placeholder).width;
      if (needs > room + 1 && style.textOverflow !== 'ellipsis' && !seen.has(el.placeholder)) { seen.add(el.placeholder); cut.push({ text: `placeholder "${el.placeholder.slice(0, 50)}"`, shows: Math.round(room), needs: Math.round(needs) }); }
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
      // Nor one whose tap area runs past the edge of the list it scrolls in (partly under a pinned header,
      // or past the bottom of a sheet's body): it is judged once it is scrolled into the open.
      let open = true;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (!/(auto|scroll)/.test(getComputedStyle(p).overflowY) || p.scrollHeight <= p.clientHeight + 1) continue;
        const q = p.getBoundingClientRect();
        if ((p.scrollTop > 0 && cy - 21 < q.top) || (p.scrollTop + p.clientHeight < p.scrollHeight - 1 && cy + 21 > q.bottom)) open = false;
        break;
      }
      if (!off && inside && open && r.top >= 0 && r.bottom + 21 <= chromeTop && (r.width < 44 || r.height < 44) && !(hits(-21, 0) && hits(21, 0) && hits(0, -21) && hits(0, 21))) {
        small.push({ id: label(el) || ownText.slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
  }
  return { cut: cut.slice(0, 25), shortened: shortened.slice(0, 25), small: small.slice(0, 25), wide: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0 };
}

/**
 * Runs in the page, laid out at full height: what is drawn over, past or too close to
 * something else. Returns short descriptions, at most 12 of each kind. With `rootSel`
 * (an open sheet) only what is inside it; the page behind is covered and not judged.
 */
function layoutScan(rootSel) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const root = rootSel ? [...document.querySelectorAll(rootSel)].pop() || document.body : document.body;
  const all = [...root.querySelectorAll('*')];
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
  // A box that hides its own overflow clips its own text too: the lines a clamp hides are not drawn.
  const ownClip = (el) => { const s = getComputedStyle(el); return s.overflowX !== 'visible' || s.overflowY !== 'visible' ? R(el.getBoundingClientRect()) : { l: -1e6, t: -1e6, r: 1e6, b: 1e6 }; };
  const visibleRect = (el, r = el.getBoundingClientRect()) => inter(inter(R(r), clipOf(el)), ownClip(el));
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
  // On purpose: the + cup over the tab bar, a count on a corner, and a miniature drawn for looks (hidden from
  // screen readers, such as the "Match my phone" preview that draws two halves). A toast is judged by
  // toastScan at the real window height, never against a page grown to its full height.
  const onPurpose = (el) => !!el.closest('[data-testid="tab-add"], [data-testid$="-count"], [aria-hidden="true"], [data-testid="toast"]');
  const fullPage = (r) => w(r) >= vw - 2;

  // Text, line by line, as drawn. A line's box is the font's whole height; the letters
  // themselves take about the middle 70% of it, so big numbers set with a tight line
  // height do not count as touching the line above.
  const texts = [];
  for (const el of all) {
    if (!shown(el) || onPurpose(el)) continue;
    // Text in a drawing (the share card) is drawn at its font size times the drawing's scale.
    const ctm = el.closest('svg') && el.getScreenCTM ? el.getScreenCTM() : null;
    const fs = (parseFloat(getComputedStyle(el).fontSize) || 14) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1);
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
        if (!empty(v) && w(v) > 1) texts.push({ el, r: v, fs });
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
      // Less than a word space apart (about a fifth of the letters' size; 3 px for body text).
      if (vo > Math.min(h(a.r), h(b.r)) * 0.5 && gap >= -2 && gap < Math.min(3, 0.18 * Math.min(a.fs, b.fs))) add('overText', `${name(a.el)} runs into ${name(b.el)} (${Math.round(gap)}px apart)`);
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
  // A text field's box (its border around an input) is a field, not a card.
  const fieldBox = (el) => h(R(el.getBoundingClientRect())) < 90 && !!el.querySelector('input, textarea');
  const cardLike = boxes.filter((b) => !b.art && !isControl(b.el) && !b.el.closest('button,[role="button"]') && w(b.r) >= 120 && h(b.r) >= 40 && !fullPage(b.r) && boxed(b.el) && !fieldBox(b.el));
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
  // Text that runs into the screen's side gutter (the content keeps 20 px): a title that does not
  // shorten, a line wider than its column. Not in a row that scrolls sideways (it bleeds on purpose).
  const sideways = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  for (const t of texts) {
    if (rootSel || t.el.closest('svg, [data-testid="tab-bar"]')) continue;
    const d = Math.min(t.r.l, vw - t.r.r);
    if (d < 12 && !sideways(t.el)) add('gaps', `${name(t.el)} ${Math.max(0, Math.round(d))}px from the screen's ${t.r.l < vw - t.r.r ? 'left' : 'right'} edge`);
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
    if (sc.contains(el) || el.contains(sc) || el.closest('[data-testid="toast"]')) continue;
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

/**
 * Runs in the page at its real height, with a sheet open: what only a sheet can get wrong.
 *   its top above the top of the screen;
 *   content cut by the bottom of the screen where nothing scrolls to reach it;
 *   its last control (with the sheet scrolled to its end) closer than 12 px to the bottom of the screen;
 *   content closer to the sheet's left or right edge than the sheet's own side padding.
 */
function sheetScan() {
  const vh = window.innerHeight;
  const sheet = [...document.querySelectorAll('[data-testid="sheet"]')].pop();
  const out = [];
  if (!sheet) return out;
  const add = (v) => { if (out.length < 12 && !out.includes(v)) out.push(v); };
  const sr = sheet.getBoundingClientRect();
  if (sr.top < -0.5) add(`sheet top ${Math.round(-sr.top)}px above the screen`);
  const shown = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  const name = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const id = e.getAttribute('data-testid') || e.getAttribute('aria-label');
      if (id) return id.slice(0, 40);
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (own) return `"${own.slice(0, 30)}"`;
    }
    return el.tagName.toLowerCase();
  };
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };
  const painted = (el) => {
    const s = getComputedStyle(el);
    if (alpha(s.backgroundColor) > 0) return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0);
  };
  const isControl = (el) => el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || ['button', 'link', 'switch', 'tab', 'checkbox', 'radio', 'slider'].includes(el.getAttribute('role'));
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const scrollsY = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1;
  const scrollsX = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1;
  const all = [...sheet.querySelectorAll('*')].filter(shown);
  // The part of an element that is not clipped by a scroller (or other clipping box) inside the sheet.
  const clipped = (el) => {
    const r = el.getBoundingClientRect();
    let c = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = el.parentElement; p && p !== sheet.parentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect();
      c = { l: Math.max(c.l, q.left), t: Math.max(c.t, q.top), r: Math.min(c.r, q.right), b: Math.min(c.b, q.bottom) };
    }
    return c;
  };
  const content = all.filter((el) => ownText(el) || isControl(el) || el.tagName === 'svg');

  // Cut by the bottom of the screen with no scroller to bring it up.
  for (const el of content) {
    const r = el.getBoundingClientRect();
    if (r.height < 1 || r.bottom <= vh + 0.5) continue;
    let reachable = false;
    for (let p = el.parentElement; p && p !== sheet.parentElement; p = p.parentElement) if (scrollsY(p)) { reachable = true; break; }
    if (!reachable) add(`${name(el)} cut by the bottom of the screen (${Math.round(r.bottom - vh)}px below)`);
  }

  // The last control, with every scroller in the sheet at its end.
  const scrollers = [sheet, ...sheet.querySelectorAll('*')].filter(scrollsY);
  const before = scrollers.map((el) => el.scrollTop);
  for (const el of scrollers) el.scrollTop = el.scrollHeight;
  let last = null;
  for (const el of all) {
    if (!isControl(el)) continue;
    const c = clipped(el);
    if (c.r - c.l < 1 || c.b - c.t < 1) continue;
    if (!last || c.b > last.b) last = { el, b: c.b };
  }
  if (last && vh - last.b < 12) add(`last control ${name(last.el)} ${Math.max(0, Math.round(vh - last.b))}px from the bottom of the screen`);
  scrollers.forEach((el, i) => { el.scrollTop = before[i]; });

  // Side padding: what the sheet's body sets (the kit's is 20 px).
  const body = sheet.querySelector('[data-testid="sheet-body"]');
  const inner = body && body.firstElementChild;
  const pad = inner ? parseFloat(getComputedStyle(inner).paddingLeft) || 20 : 20;
  for (const el of all) {
    if (el === body || el === inner) continue;
    const thin = (r) => Math.min(r.width, r.height) <= 6;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const isArt = el.tagName === 'svg' || el.tagName === 'IMG';
    if (el.closest('svg') && !isArt) continue;
    if (!(ownText(el) || isControl(el) || isArt || (painted(el) && !thin(r)))) continue;
    // Scrolled partly out of a sideways row: its edge is not where it rests.
    let sideways = false;
    for (let p = el.parentElement; p && p !== sheet; p = p.parentElement) if (scrollsX(p)) { sideways = true; break; }
    if (sideways) continue;
    // A box as wide as the sheet is the sheet's own surface (a divider, a backdrop strip), not content at its edge.
    if (r.width >= sr.width - 2) continue;
    let box = r;
    if (ownText(el)) {
      // Text: where its letters are, word by word, not its box (a wrapped line's box includes the space it broke at).
      const q = [];
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(n.textContent))) {
          const range = document.createRange();
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          for (const x of range.getClientRects()) if (x.width > 0) q.push(x);
        }
      }
      if (q.length) box = { left: Math.min(...q.map((x) => x.left)), right: Math.max(...q.map((x) => x.right)) };
    }
    const left = box.left - sr.left;
    const right = sr.right - box.right;
    const d = Math.min(left, right);
    if (d < pad - 1.5 && d > -400) add(`${name(el)} ${Math.round(d)}px from the sheet's ${left < right ? 'left' : 'right'} edge (its padding is ${Math.round(pad)}px)`);
  }
  return out;
}

/**
 * Runs in the page at its real height: whether the top of the screen keeps the header rule (AGENTS.md,
 * "The top of a screen"). A pushed screen's header (the kit's Header) has a back cup or an X, a title and
 * one short line under it; a tab's (TabHeader) has an overline over its title. Under either, no second
 * screen title: text of 21 px or more with words in it, in the first 160 px under the header, outside a
 * card (a number with its unit, a heading inside a card or a section title at 18 px are content).
 */
function headerScan() {
  const out = [];
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true })); };
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
  const head = [...document.querySelectorAll('[data-testid="screen-header"], [data-testid="tab-header"]')].filter((el) => visible(el) && !el.closest('[data-testid="sheet"]')).pop();
  if (!head) return out;
  const tab = head.getAttribute('data-testid') === 'tab-header';
  const words = [...head.querySelectorAll('*')].filter((el) => !el.closest('button, [role="button"], [role="link"]') && own(el) && visible(el));
  const lines = new Set(words.map((el) => Math.round(el.getBoundingClientRect().top))).size;
  if (lines < 2) out.push(tab ? 'no overline over the title' : lines ? 'no short line under the title' : 'no title');
  if (lines > 2) out.push(`${lines} lines in the title block (a title and one short line)`);
  if (!tab && !head.querySelector('[data-testid="header-back"], [data-testid="header-close"]')) out.push('no back cup or X');
  const hb = head.getBoundingClientRect().bottom;
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };
  const inCard = (el) => {
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width >= document.documentElement.clientWidth - 2) continue;
      if (['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s[`border${k}Width`]) > 0 && alpha(s[`border${k}Color`]) > 0) || alpha(s.backgroundColor) > 0) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (head.contains(el) || !visible(el) || el.closest('[data-testid="sheet"], [data-testid="toast"], [data-testid="tab-bar"], svg, [aria-hidden="true"]')) continue;
    const text = own(el);
    if (!text || !/[A-Za-z]{3,}/.test(text)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const r = el.getBoundingClientRect();
    if (fs < 21 || r.top < hb - 1 || r.top > hb + 160 || inCard(el)) continue;
    out.push(`a second title under the header: "${text.slice(0, 40)}" (${Math.round(fs)} px)`);
    break;
  }
  return out;
}

/**
 * Runs in the page: whether a toast now on screen covers a control. With a sheet open the
 * sheet's controls are judged; otherwise those in a pinned footer and the tab bar (content
 * that scrolls under a toast is not, it moves).
 */
function toastScan() {
  const t = document.querySelector('[data-testid="toast"]');
  if (!t) return [];
  const tr = t.getBoundingClientRect();
  if (tr.width < 1 || tr.height < 1) return [];
  const msg = t.textContent.trim().slice(0, 40);
  const out = [];
  if (tr.top < -0.5) out.push(`toast "${msg}" ${Math.round(-tr.top)}px above the screen`);
  const sheet = [...document.querySelectorAll('[data-testid="sheet"]')].pop();
  const roots = sheet ? [sheet] : [...document.querySelectorAll('[data-testid="screen-footer"], [data-testid="tab-bar"]')];
  const isControl = (el) => el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || ['button', 'link', 'switch', 'tab', 'checkbox', 'radio', 'slider'].includes(el.getAttribute('role'));
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if (!isControl(el) || t.contains(el) || el.contains(t)) continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      const w = Math.min(r.right, tr.right) - Math.max(r.left, tr.left);
      const h = Math.min(r.bottom, tr.bottom) - Math.max(r.top, tr.top);
      const id = (el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 40);
      if (w > 1 && h > 1 && out.length < 6) out.push(`toast "${msg}" covers ${id} (${Math.round(w)}x${Math.round(h)})`);
    }
  }
  return out;
}

/**
 * Runs in the page: is this a finished drawing of the screen, or a blank or half-loaded one?
 * Returns null when it is ready, else the reason.
 */
function notReady({ profile, sheet }) {
  if (document.fonts && document.fonts.status !== 'loaded') return 'fonts still loading';
  if (document.querySelector('[data-testid="error-retry"]')) return null; // an error screen is a result, reported as such
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  let words = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && words < 3; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && (!n.parentElement.checkVisibility || n.parentElement.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) words += 1;
  }
  if (words < 2) return 'blank: almost no text on screen';
  const state = window.__healthcal && window.__healthcal.getState();
  if (!state) return 'the app has not started';
  if (profile && !state.profile) return 'the demo data did not load';
  const open = [...document.querySelectorAll('[data-testid="sheet"]')].pop();
  if (sheet && !open) return 'no sheet is open';
  if (!sheet && open) return 'a sheet is open: set sheet: true on the state';
  if (open) {
    const r = open.getBoundingClientRect();
    if (r.height < 40 || r.top >= vh - 20) return 'the sheet has not risen';
  }
  return null;
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

// ------------------------------------------------------------------ states

const STATE_FIELDS = ['id', 'route', 'data', 'imperial', 'day', 'type', 'taps', 'waitFor', 'sheet', 'note'];
const DATA = ['demo', 'empty', 'fresh', 'stress'];

/** Loads scripts/dev/states/<list>.cjs for each list and checks every state is well formed. */
function loadStates(lists) {
  const states = [];
  const problems = [];
  for (const list of lists) {
    const file = path.join(__dirname, 'states', `${list}.cjs`);
    if (!fs.existsSync(file)) { problems.push(`no state list ${path.relative(ROOT, file)}`); continue; }
    const items = require(file);
    if (!Array.isArray(items)) { problems.push(`${list}: module.exports must be an array of states`); continue; }
    for (const s of items) {
      const where = `${list}: ${s && s.id ? s.id : JSON.stringify(s).slice(0, 60)}`;
      const unknown = Object.keys(s || {}).filter((k) => !STATE_FIELDS.includes(k));
      if (unknown.length) problems.push(`${where}: unknown field ${unknown.join(', ')} (fields: ${STATE_FIELDS.join(', ')})`);
      if (!s.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) problems.push(`${where}: id must be kebab-case`);
      if (typeof s.route !== 'string' || !s.route.startsWith('/')) problems.push(`${where}: route must start with /`);
      if (s.data !== undefined && !DATA.includes(s.data)) problems.push(`${where}: data must be one of ${DATA.join(', ')}`);
      if (s.route && s.route.includes('{day}') !== (s.day !== undefined)) problems.push(`${where}: a route with {day} needs day, and day needs {day} in the route`);
      if (s.type !== undefined && (typeof s.type !== 'object' || Array.isArray(s.type))) problems.push(`${where}: type is { testID: text }`);
      for (const t of s.taps || []) {
        const ok = typeof t === 'string' || (t && typeof t === 'object' && ((typeof t.type === 'string' && typeof t.text === 'string') || typeof t.wait === 'number' || (typeof t.choose === 'string' && Array.isArray(t.files))));
        if (!ok) problems.push(`${where}: a step is a testID, { type, text }, { wait } or { choose, files }; got ${JSON.stringify(t)}`);
        if (t && t.files) for (const f of t.files) if (!fs.existsSync(path.resolve(ROOT, f))) problems.push(`${where}: no file ${f}`);
      }
      if (states.some((x) => x.id === s.id)) problems.push(`${where}: id used twice`);
      states.push({ list, ...s });
    }
  }
  if (problems.length) {
    console.error(problems.map((p) => `state error: ${p}`).join('\n'));
    process.exit(2);
  }
  return states;
}

/** A local-calendar YYYY-MM-DD `n` days from today (the page runs in the same time zone). */
function isoDay(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const slug = (route) => route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'today';

// ------------------------------------------------------------------ capture

const sel = (id) => (id.startsWith('^') ? `[data-testid^="${id.slice(1)}"]` : `[data-testid="${id}"]`);
const EMPTY_LAYOUT = () => ({ overText: [], broken: [], sticksOut: [], controls: [], gaps: [], hidden: [], header: [], sheet: [], toast: [] });

/**
 * Opens one job (a route, or a state: a route plus steps) in a fresh page with its own stored data,
 * then checks the capture is finished: the app started, its data loaded, text is drawn, every step
 * worked, the testID waited for is there, and a sheet is open exactly when the state says so.
 * Returns { page, errors, toast, problem }; problem is null when the screen is ready to be scanned.
 */
async function open(context, job, seed) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0].slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Download the React DevTools|favicon/.test(m.text())) errors.push(`console: ${m.text().slice(0, 140)}`); });
  // Each page starts from its own stored data: every key of the origin is cleared once, on the first load of this tab.
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('__evidence')) return;
    localStorage.clear();
    if (value) localStorage.setItem('healthcal-v1', value);
    sessionStorage.setItem('__evidence', '1');
  }, seed);
  const toast = [];
  const step = async (what, fn) => {
    try { await fn(); return null; } catch (e) { return `${what}: ${String(e.message).split('\n')[0].slice(0, 120)}`; }
  };
  const tapped = async () => {
    await page.waitForTimeout(350);
    for (const t of await page.evaluate(toastScan).catch(() => [])) if (!toast.includes(t)) toast.push(t);
  };
  let problem = await step('did not load', async () => {
    await page.goto(base + job.route, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForSelector('[data-testid]', { timeout: 15000 });
    await page.waitForTimeout(700);
  });
  for (const [id, text] of Object.entries(job.type || {})) {
    problem = problem || (await step(`type ${id}`, () => page.locator(sel(id)).first().fill(text, { timeout: 10000 })));
    if (!problem) await page.waitForTimeout(300);
  }
  for (const t of job.taps || []) {
    if (problem) break;
    if (typeof t === 'string') {
      problem = await step(`tap ${t}`, () => page.locator(sel(t)).first().click({ timeout: 10000 }));
      if (!problem) { await tapped(); await page.waitForTimeout(350); }
    } else if (t.type) {
      problem = await step(`type ${t.type}`, () => page.locator(sel(t.type)).first().fill(t.text, { timeout: 10000 }));
      await page.waitForTimeout(300);
    } else if (t.wait) {
      await page.waitForTimeout(t.wait);
    } else if (t.choose) {
      problem = await step(`choose files with ${t.choose}`, async () => {
        const chooser = page.waitForEvent('filechooser', { timeout: 15000 });
        await page.locator(sel(t.choose)).first().click({ timeout: 10000 });
        await (await chooser).setFiles(t.files.map((f) => path.resolve(ROOT, f)));
      });
      if (!problem) { await page.waitForTimeout(1500); await tapped(); }
    }
  }
  if (!problem && job.waitFor) problem = await step(`wait for ${job.waitFor}`, () => page.locator(sel(job.waitFor)).first().waitFor({ state: 'visible', timeout: 15000 }));
  if (!problem) {
    // Give the screen up to 10 s to finish drawing (fonts, data, the sheet rising).
    const until = Date.now() + 10000;
    for (;;) {
      problem = await page.evaluate(notReady, { profile: job.data !== 'fresh', sheet: !!job.sheet }).catch((e) => `could not read the page: ${e.message.split('\n')[0]}`);
      if (!problem || Date.now() > until) break;
      await page.waitForTimeout(400);
    }
  }
  return { page, errors, toast, problem };
}

/** Scans what is open: the sheet when one is (the page behind it is covered), else the whole page. */
async function capture(page, job, file) {
  const sheet = !!job.sheet;
  const root = sheet ? '[data-testid="sheet"]' : null;
  const found = await page.evaluate(scan, root);
  const layout = EMPTY_LAYOUT();
  if (sheet) layout.sheet = await page.evaluate(sheetScan);
  else { layout.hidden = await page.evaluate(hiddenAtEnd); layout.header = await page.evaluate(headerScan); }
  // A toast still showing is judged here, at the real window height, as well as after each tap.
  layout.toast = await page.evaluate(toastScan);
  await page.waitForTimeout(100);
  await page.screenshot({ path: file, fullPage: true });
  // Everything at once: grow the window until the scrolling element (the page's, or the sheet's body) fits.
  const extra = await page.evaluate((r) => {
    const scope = r ? [...document.querySelectorAll(r)].pop() : document.body;
    let m = 0;
    for (const el of [scope, ...scope.querySelectorAll('*')]) m = Math.max(m, el.scrollHeight - el.clientHeight);
    return m;
  }, root);
  const vp = page.viewportSize();
  // A sheet is at most 88% of the window, so the window grows by a little more than what it hides.
  if (extra > 0) { await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + Math.ceil(sheet ? extra / 0.88 + 24 : extra), 8000) }); await page.waitForTimeout(400); }
  Object.assign(layout, await page.evaluate(layoutScan, root));
  return { found, layout };
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const { buildSeed } = await import('./seed.mjs');
  const lists = String(flags.states || '').split(',').filter(Boolean);
  let states = loadStates(lists);
  if (flags.only) {
    const only = String(flags.only).split(',').filter(Boolean);
    const missing = only.filter((id) => !states.some((s) => s.id === id));
    if (missing.length) { console.error(`--only: no state ${missing.join(', ')} in ${lists.join(', ') || '(no --states)'}`); process.exit(2); }
    states = states.filter((s) => only.includes(s.id));
  }
  const routeData = flags.fresh ? 'fresh' : flags.empty ? 'empty' : flags.stress ? 'stress' : 'demo';
  const routeTag = flags.empty ? '__empty' : flags.fresh ? '__fresh' : flags.stress ? '__stress' : '';
  const jobs = [
    ...routes.map((route) => ({ kind: 'route', id: `${slug(route)}${routeTag ? `-${routeData}` : ''}`, stem: `${slug(route)}`, tag: routeTag, route, data: routeData, imperial: !!flags.imperial })),
    ...states.map((s) => ({ kind: 'state', stem: s.id, tag: '', ...s, data: s.data || 'demo', imperial: !!s.imperial, route: s.route.replace('{day}', s.day !== undefined ? isoDay(s.day) : '') })),
  ];
  const seeds = new Map();
  const seedFor = (theme, job) => {
    const key = `${theme}|${job.data}|${job.imperial}`;
    if (!seeds.has(key)) {
      seeds.set(key, job.data === 'fresh' ? null : JSON.stringify(buildSeed({ theme, empty: job.data === 'empty', stress: job.data === 'stress', units: job.imperial ? 'imperial' : 'metric' })));
    }
    return seeds.get(key);
  };
  const tries = Number(flags.tries || 3);
  const browser = await chromium.launch();
  const screens = [];
  for (const theme of themes) {
    for (const width of widths) {
      // One browser context per theme and width keeps the app's bundle cached; every page clears and seeds its own storage.
      const context = await browser.newContext({ viewport: { width, height: width < 360 ? 640 : 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light', isMobile: true, hasTouch: true });
      for (const job of jobs) {
        const name = `${job.stem}__${theme}__${width}${job.tag}`;
        let result = null;
        // A blank, half-loaded or unfinished capture is tried again, and never reported as clean.
        for (let attempt = 1; attempt <= tries; attempt++) {
          if (result) await result.page.close();
          result = await open(context, job, seedFor(theme, job));
          result.attempts = attempt;
          if (!result.problem) break;
        }
        const { page, errors, toast, problem } = result;
        let found = { cut: [], shortened: [], small: [], wide: 0 };
        let layout = EMPTY_LAYOUT();
        if (problem) {
          await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }).catch(() => {});
        } else {
          try {
            ({ found, layout } = await capture(page, job, path.join(out, `${name}.png`)));
          } catch (e) {
            errors.push(`scan failed: ${String(e.message).split('\n')[0].slice(0, 100)}`);
          }
        }
        layout.toast = [...new Set([...toast, ...(layout.toast || [])])];
        const crashed = (await page.locator('[data-testid="error-retry"]').count().catch(() => 0)) > 0;
        screens.push({
          id: job.id, kind: job.kind, ...(job.list ? { list: job.list } : null), route: job.route, data: job.data, imperial: job.imperial, sheet: !!job.sheet, theme, width,
          image: `${name}.png`, crashed, incomplete: problem && !crashed ? `${problem} (after ${result.attempts} tries)` : null,
          errors: [...new Set(errors)].slice(0, 5), ...found, layout,
        });
        await page.close();
      }
      await context.close();
    }
  }
  await browser.close();

  // One sheet per route or state: every theme and width side by side, large enough to read.
  const sheets = [];
  const tmp = path.join(out, `_tmp-${process.pid}`);
  for (const job of jobs) {
    const mine = screens.filter((s) => s.id === job.id);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    for (const s of mine) if (fs.existsSync(path.join(out, s.image))) fs.copyFileSync(path.join(out, s.image), path.join(tmp, s.image));
    const sheet = `sheet-${job.stem}${job.tag.replace(/__/g, '-')}.png`;
    try {
      execSync(`node ${JSON.stringify(path.join(__dirname, 'contact-sheet.cjs'))} ${JSON.stringify(tmp)} ${JSON.stringify(path.join(out, sheet))} ${mine.length} 330 1100`, { stdio: 'ignore' });
      sheets.push(sheet);
      for (const s of mine) s.sheetImage = sheet;
    } catch { /* the single screenshots are still there */ }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  const checks = flags.checks ? runChecks() : [];
  const stateIndex = Object.fromEntries(states.map((s) => [s.id, { list: s.list, route: s.route, data: s.data || 'demo', imperial: !!s.imperial, sheet: !!s.sheet, note: s.note || null }]));
  const report = { taken: new Date().toISOString(), base, sheets, checks, states: stateIndex, screens };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const LAYOUT = ['overText', 'broken', 'sticksOut', 'controls', 'hidden', 'gaps', 'header', 'sheet', 'toast'];
  const layoutCount = (s) => LAYOUT.reduce((n, k) => n + (s.layout?.[k]?.length || 0), 0);
  const problems = screens.filter((s) => s.crashed || s.incomplete || s.errors.length || s.cut.length || s.wide || s.small.length || layoutCount(s));
  console.log(`${screens.length} screens in ${out}; ${problems.length} with something to look at; ${sheets.length} sheets`);
  for (const s of problems.slice(0, Number(flags.show || 40))) {
    const bits = [s.crashed ? 'ERROR SCREEN' : '', s.incomplete ? `NOT CAPTURED: ${s.incomplete}` : '', s.errors.length ? `${s.errors.length} error(s): ${s.errors[0]}` : '', s.wide ? `page ${s.wide}px too wide` : '', s.cut.length ? `cut: ${s.cut.slice(0, 3).map((c) => `"${c.text}"`).join(', ')}${s.cut.length > 3 ? ` +${s.cut.length - 3}` : ''}` : '', s.small.length ? `small targets: ${s.small.slice(0, 3).map((t) => `${t.id} ${t.w}x${t.h}`).join(', ')}` : '', ...LAYOUT.filter((k) => s.layout?.[k]?.length).map((k) => `${k}: ${s.layout[k].slice(0, 2).join('; ')}${s.layout[k].length > 2 ? ` +${s.layout[k].length - 2}` : ''}`)].filter(Boolean);
    console.log(`  ${s.kind === 'state' ? s.id : s.route} [${s.theme} ${s.width}] ${bits.join('; ')}`);
  }
  // Shortened by design: names that end in an ellipsis after their allowed lines. Listed, not counted.
  const short = screens.filter((s) => s.shortened && s.shortened.length);
  if (short.length) {
    const names = [...new Set(short.flatMap((s) => s.shortened.map((c) => c.text)))];
    console.log(`shortened by design (an ellipsis after the allowed lines) on ${short.length} screens: ${names.slice(0, 6).map((t) => `"${t}"`).join(', ')}${names.length > 6 ? ` +${names.length - 6}` : ''}`);
  }
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `: ${c.tail}`}`);
  process.exit(checks.some((c) => !c.ok) || screens.some((s) => s.crashed || s.incomplete) ? 1 : 0);
}

// The in-page scans are exported for scripts/dev/evidence-selftest.cjs, which proves each one against hand-made faults.
if (require.main === module) main();
else module.exports = { scan, layoutScan, hiddenAtEnd, headerScan, sheetScan, toastScan, notReady, loadStates };
