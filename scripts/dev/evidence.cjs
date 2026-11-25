#!/usr/bin/env node
/**
 * Gathers the facts a reviewer needs about a set of screens, with no judgement:
 * a screenshot of each route (or state, below) in each theme and width, every runtime
 * error, and a scan for text that is cut off, content wider than the screen and touch
 * targets under 44 px. Writes PNGs, one contact sheet per route or state, and report.json.
 *
 * WIDTHS. By default every screen is taken at 360, 390 and 320 px, in that order: 360 x 740 is the
 * most common Android phone (the owner's), 390 x 844 an iPhone, 320 x 640 the narrowest. The
 * contact sheet of a route or state has one row per theme with the widths side by side in the
 * order given to --widths. Each capture is <id>__<theme>__<width>.png (the first view, at the real
 * window height) and, when the page or the open sheet scrolls, <id>__<theme>__<width>__full.png: the
 * window grown to the whole page, exactly what the layout scan below judged (report.json `fullImage`).
 * Open the full image to look at a layout finding; its coordinates are the ones the scan used.
 *
 * It also lays the whole page out at once (the window grown to the page's height) and
 * reports what sits wrongly:
 *   overText    text drawn over other text, or side by side with less than 3 px between
 *   tight       two pieces of text from different blocks that almost touch: one above the other
 *               (their letters overlapping sideways) less than 8 px apart, or side by side on one
 *               line less than 6 px apart, with the gap in px. Measured between the letters' ink
 *               (the font's real ascent and descent), not the line boxes. Left alone on purpose,
 *               decided from the page's structure: the lines of one paragraph, a number and its
 *               unit and other words of one text (nested text is one piece); one component's
 *               stacked lines (the nearest element holding both holds at most three pieces of
 *               text: a header's title and its line, a list row's title and subtitle, a stat and
 *               its caption); a title or label and the single line under it, neighbouring children
 *               of the element holding both; a label directly above its own field; a number and its
 *               unit set as two blocks side by side ("7" "h", the unit smaller); an emoji alone (a
 *               content mark beside a name, part of the name's line). None of these
 *               excuses text that is placed (absolutely positioned below the element holding both,
 *               such as a label set at a cup's level): placed text keeps its room at every value.
 *               Also under tight: text and a box it is not in (a button, a chip, a badge, a field,
 *               a dashed slot, a card) one above the other with less than 6 px between the letters
 *               and the box's edge ("Weekly check-in" 4px above the box of "New"), except a label
 *               directly above its own field and a caption under a picture (a box with no text).
 *               Letters are measured as drawn: capitals for an uppercased overline, without the tail
 *               of a comma. Text in a drawing (the share card's SVG) is left to overText. Text in pinned chrome
 *               (the tab bar, a screen's header or pinned footer) is judged only against text of the
 *               same chrome, never against the page that scrolls under it (overText too); what is
 *               left under the chrome at the end of the page is `hidden`'s.
 *   broken      a word split over two lines because its box is too narrow, a number split from
 *               its unit ("68 fl" / "oz"), or an overline (a one-line label in capitals) wrapped so
 *               its last word is alone on a second line, or a wrapping row of chips or tiles that
 *               leaves one alone on its last line under a line of three or more
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
 *               always at the real window height (never against the page grown to its full height);
 *               a control is measured by what of it shows, its box cut by every ancestor that clips
 *               (overflow not visible), so a tile scrolled out of a sheet's body is not under the toast
 * Text cut with no ellipsis is `cut`, and so are a field's placeholder wider than the field, a number
 * field's value wider than the field (a long name in a text field scrolls as fields do), and a clamped
 * name whose box is taller than its clamp (the lines after the ellipsis show under it). A name
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
 *        [--themes=blossom,light,dark] (also butter, honey, java) [--widths=360,390,320] [--empty] [--fresh] [--stress] [--imperial]
 *        [--states=<list>[,<list>]] [--only=<state id>[,<id>]]
 *        [--backend]  also the states that need accounts (start.cjs's "accounts"): only against a build
 *                     with a backend; with-build.cjs builds have none
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
 *     values: { eaten: 0.6, exercise: 290 },   today's amounts on top of the demo (or stress) data,
 *                                  as ordinary records (buildSeed's `values` in seed.mjs, which uses the
 *                                  app's own budget and goals): eaten and protein as a share of today's
 *                                  budget and protein target, exercise in net kcal, water as a share of
 *                                  today's goal, weekMinutes toward the weekly guideline, fasting as a
 *                                  share of the fasting target, eatBack 0 to leave exercise out of the
 *                                  budget; drinks, diaryDrink and diaryWater for drinks with calories (seed.mjs);
 *                                  oldBourekas for a usual food logged before its values changed;
 *                                  for the morning page lastNight, weighInGap, onboardedToday and
 *                                  name (seed.mjs says what each does). scripts/dev/states/sweep.cjs uses it to
 *                                  take every labelled cup and bar at the values that stress it.
 *     now: Date.parse('2026-11-19T18:00:00'),   the page's clock (Playwright's clock.setFixedTime: Date.now
 *                                  and new Date() return it, timers still run), for a screen whose words depend on
 *                                  the weekday; the stored data is still built around the real today
 *     flags: { __healthcalMorning: true },   window booleans set before the app loads (addInitScript), for
 *                                  a test hook that an automated browser leaves off unless asked: the morning
 *                                  page (src/features/morning/allowed.ts) opens by itself only with
 *                                  __healthcalMorning, together with a `now` in the morning of a day after one with data
 *     absent: ['morning-card'],    testIDs that must not be on the page once the steps and waitFor are done
 *                                  (checked after a 1.5 s settle): a capture that shows one is NOT CAPTURED
 *     health: { demo: { store: 'apple-health', workouts: [...], steps: [{ day, count }] }, state: { enabled: true } },
 *                                  the phone's health store in memory (window.__healthcalHealthDemo: the options of
 *                                  createFakeAdapter in src/features/health-sync/fake.ts) and this phone's sync memory
 *                                  (stored under healthcal-health-sync before the first load); development and E2E builds only
 *     type: { 'food-search-input': 'banana' },   typed after the screen opens, before the taps
 *     taps: [                      done in order, ~0.7 s apart:
 *       'tab-add',                   tap the element with this testID ('^prefix-' taps the first
 *                                    whose testID starts with prefix-)
 *       { type: 'onb-name-input', text: 'Dana' },   type into an input between taps
 *       { choose: 'import-choose-files', files: ['scripts/dev/states/files/morning-run.gpx'] },
 *                                    tap a control that opens the file picker and pick these files
 *                                    (paths from the repository root)
 *       { wait: 800 },               wait this many milliseconds
 *       { reload: true },            save what the app holds and load the page again, as after a restart
 *                                    (saved entries of bundled foods come back with today's food attached)
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
 *   - a body that almost fits: it scrolls by 80 px or less (beyond its bottom padding), so at rest
 *     its last line shows half cut at the bottom edge with nothing to say there is more;
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
const { toastActionReady } = require('./toastGuard.cjs');

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));
const out = path.resolve(flags.out || 'evidence');
const base = flags.url || 'http://localhost:8081';
// Without --routes: the Today screen, unless states were asked for (then only the states).
const routes = String(flags.routes || (flags.states ? '' : '/')).split(',').filter(Boolean);
const themes = String(flags.themes || 'blossom,light,dark').split(',');
// The theme names buildSeed takes (seed.mjs SEED_THEMES): a newer look is seeded as the app stores it.
const KNOWN_THEMES = ['system', 'light', 'dark', 'blossom', 'butter', 'honey', 'java'];
for (const t of themes) {
  if (!KNOWN_THEMES.includes(t)) {
    console.error(`Unknown theme "${t}" in --themes. Use any of: ${KNOWN_THEMES.join(', ')}.`);
    process.exit(2);
  }
}
// 360 first: the most common Android width, and the owner's phone. Each width has a phone's height.
const widths = String(flags.widths || '360,390,320').split(',').map(Number);
const HEIGHTS = { 320: 640, 360: 740, 390: 844 };
const heightFor = (width) => HEIGHTS[width] || (width < 360 ? 640 : 844);
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
    // A clamp whose box is taller than its lines (a clamped name given flex: 1 in a row of tiles): the lines
    // after the ellipsis are drawn under it, "Israeli salad (tomato, …" / "cucumber, onion,".
    const clamp = parseInt(style.webkitLineClamp, 10);
    if (ownText && clamp > 0) {
      const tops = new Set();
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) if (q.width > 0 && q.bottom <= r.bottom + 1) tops.add(Math.round(q.top));
      }
      const key = `clamp|${ownText.slice(0, 40)}`;
      if (tops.size > clamp && !seen.has(key)) { seen.add(key); cut.push({ text: `"${ownText.slice(0, 40)}" shows ${tops.size} lines under its ${clamp}-line clamp (the ellipsis is not its last line)`, shows: tops.size, needs: clamp }); }
    }
    // A one-line field's placeholder wider than the field: the browser clips it mid-word with no ellipsis.
    if (el.tagName === 'INPUT' && !el.value && el.placeholder && r.top < window.innerHeight * 3) {
      const ctx = (scan.canvas ||= document.createElement('canvas')).getContext('2d');
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const needs = ctx.measureText(el.placeholder).width;
      if (needs > room + 1 && style.textOverflow !== 'ellipsis' && !seen.has(el.placeholder)) { seen.add(el.placeholder); cut.push({ text: `placeholder "${el.placeholder.slice(0, 50)}"`, shows: Math.round(room), needs: Math.round(needs) }); }
    }
    // A number field whose value is wider than the field (a 13-digit barcode in a half-width field): its last
    // digits are clipped with nothing to say so. A long name in a text field scrolls as text fields do; a
    // number has to be read whole.
    if (el.tagName === 'INPUT' && el.value && /^(numeric|decimal|tel)$/.test(el.getAttribute('inputmode') || '') && r.top < window.innerHeight * 3) {
      const ctx = (scan.canvas ||= document.createElement('canvas')).getContext('2d');
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const needs = ctx.measureText(el.value).width;
      const key = `value|${el.value}`;
      if (needs > room + 1 && !seen.has(key)) { seen.add(key); cut.push({ text: `value "${el.value.slice(0, 30)}" in ${label(el) || 'a number field'}`, shows: Math.round(room), needs: Math.round(needs) }); }
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
      // Every control, the tab header's three cups included (36 px, 8 px apart, 44 x 44 to touch), is held to 44 px.
      const side = 21;
      if (!off && inside && open && r.top >= 0 && r.bottom + 21 <= chromeTop && (r.width < 44 || r.height < 44) && !(hits(-side, 0) && hits(side, 0) && hits(0, -21) && hits(0, 21))) {
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
  // Pinned chrome (the tab bar, a screen's header, a pinned footer) stays put while the page scrolls under it:
  // its text is judged against its own text only. What stays under it at the end of the page is `hidden`'s.
  const CHROME = '[data-testid="tab-bar"], [data-testid="screen-header"], [data-testid="tab-header"], [data-testid="screen-footer"]';
  const chromeOf = new Map();
  const sameLayer = (a, b) => {
    for (const e of [a, b]) if (!chromeOf.has(e)) chromeOf.set(e, e.closest(CHROME));
    return chromeOf.get(a) === chromeOf.get(b);
  };
  const add = (k, v) => { if (out[k].length < 12 && !out[k].includes(v)) out[k].push(v); };

  // 1. Text over text.
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el) || !sameLayer(a.el, b.el)) continue;
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
      // An overline is a one-line label: wrapped so one word is left alone on its second line
      // ("BARTHOLOMEW-CHRISTOPHE, YOUR PLAN IS" / "READY"), it reads as two labels.
      if (n === [...el.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim()) && getComputedStyle(el).textTransform === 'uppercase') {
        const words = [];
        const wr = /\S+/g;
        let w;
        while ((w = wr.exec(n.textContent))) {
          const range = document.createRange();
          range.setStart(n, w.index);
          range.setEnd(n, w.index + w[0].length);
          const q = [...range.getClientRects()].find((r) => r.width > 0);
          if (q) words.push(Math.round(q.top));
        }
        const tops = [...new Set(words)];
        if (tops.length === 2 && words.filter((t) => t === tops[1]).length === 1 && words.length >= 4) add('broken', `overline ${name(el)} leaves its last word alone on a second line`);
      }
      // A number and its unit on two lines ("68 fl" / "oz."): the kit's Text keeps them together, so a split
      // means a unit it does not know or text drawn outside it.
      const unit = /\d[\d,.]*[ \u00A0]+(?:fl[ \u00A0]+oz|kcal|kg|lb|ml|km|mi|min|cm|ft|in|oz|g|h|L)(?![A-Za-z])/g;
      while ((m = unit.exec(n.textContent))) {
        const range = document.createRange();
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
        if (lines.size > 1) add('broken', `"${m[0].replace(/\u00A0/g, ' ')}" split from its unit over two lines in ${name(el)}`);
      }
    }
  }
  // 1a'. A row of chips that wraps so one chip is left alone on its last line, right under a line of three or
  // more ("1 h  1 h 30 min  2 h  3 h" / "4 h"): it reads as a separate control. A cloud of tiles of many widths
  // that thins out line by line (3, 2, then 1) is left alone, and so is a last tile that grows to the whole
  // width (a row of its own, as in Train's Quick start). Rows that scroll sideways do not wrap.
  for (const el of all) {
    if (out.broken.length >= 12 || !shown(el) || onPurpose(el) || getComputedStyle(el).flexWrap !== 'wrap') continue;
    const kids = [...el.children].filter((k) => shown(k) && k.getBoundingClientRect().width > 0 && (isControl(k) || k.querySelector('button, [role="button"], [role="checkbox"], [role="radio"], [role="tab"]')));
    if (kids.length < 4 || kids.length !== [...el.children].filter((k) => shown(k) && k.getBoundingClientRect().width > 0).length) continue;
    const rows = new Map();
    for (const k of kids) { const t = Math.round(k.getBoundingClientRect().top); rows.set(t, (rows.get(t) || 0) + 1); }
    const counts = [...rows.entries()].sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    if (counts.length >= 2 && counts[counts.length - 1] === 1 && counts[counts.length - 2] >= 3 && kids[kids.length - 1].getBoundingClientRect().width < el.getBoundingClientRect().width * 0.9) add('broken', `${name(kids[kids.length - 1])} left alone on the last line of its row (${counts.join(' + ')})`);
  }
  // 1b. Text side by side with less than 4 px between (one label running into the next).
  for (let i = 0; i < texts.length; i++) {
    for (let j = 0; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (i === j || a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el) || !sameLayer(a.el, b.el)) continue;
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
  // A field's own box: a one-line field, or a text area that grows with its words (the coach's composer, up to five
  // lines) and fills its box, so a tall field beside its send cup is still a field, not a card.
  const fieldBox = (el) => {
    const bh = h(R(el.getBoundingClientRect()));
    if (bh < 90 && !!el.querySelector('input, textarea')) return true;
    const ta = el.querySelector('textarea');
    return !!ta && el.querySelectorAll('textarea, input').length === 1 && ta.getBoundingClientRect().height >= bh - 24;
  };
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
    // A card as wide as the content: the same margin each side. Not the coach's question bubble
    // (`coach-question`, `coach-question-<i>`): it sits on the right on purpose, as in every chat.
    if (w(a.r) >= vw * 0.7 && !/^coach-question(-\d+)?$/.test(a.el.getAttribute('data-testid') || '')) {
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
  /**
   * Inside layoutScan (so it goes to the page with it): two
   * pieces of text that belong to different blocks and almost touch. A piece of text is one text
   * component with the words nested in it (a number with its unit span, a bold lead in a sentence),
   * measured by its ink: the letters' real top and bottom from the font (canvas metrics), not the
   * line box. Reported:
   *   - one above the other, their ink overlapping sideways, less than 8 px apart;
   *   - side by side on one line, less than 6 px apart (closer than a word space is overText).
   * Tight by design, and left alone, decided from the page's structure:
   *   - the lines of one paragraph, a number and its unit, words of one sentence (one piece of text);
   *   - one component's stacked lines: the nearest element holding both holds at most three pieces of
   *     text (a header's title and its line, a list row's title and subtitle, a stat and its caption,
   *     a number beside its "kcal left");
   *   - a title or label and the single line under it, next to each other in the flow: the two are
   *     neighbouring children of the element holding both, each holding only that piece of text (a
   *     card's heading and its one line, a label over its value);
   *   - a label directly above its own field (the next child holds an input and at most one piece of text);
 *   - a number and its unit set as two blocks side by side ("7" "h" "45" "min"): a number, then a short
 *     word with no digits set smaller.
   * None of these applies when either piece is placed (an absolutely positioned element between it and
   * the element holding both, such as a label set at a cup's level): placed text must keep its room
   * whatever the value. Not judged: text in a drawing (the share card's SVG, judged by overText), and
   * what layoutScan leaves out on purpose (the + cup, corner counts, aria-hidden miniatures, toasts).
   * Then text against boxes (see the header): under 6 px between a line's letters and the edge of a painted
   * box above or below it that it is not inside, except a label over its own field and a caption under a
   * picture. Returns at most 12 descriptions with the gap in px.
   */
  function tightScan({ root, shown, onPurpose, visibleRect, empty, sameLayer, boxesNear }) {
    const ctx = (tightScan.canvas ||= document.createElement('canvas')).getContext('2d');
    const metrics = new Map();
    const ink = (el, word) => {
      const s = getComputedStyle(el);
      const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const key = `${font}|${s.textTransform}|${word}`;
      if (!metrics.has(key)) {
        ctx.font = font;
        // The letters as drawn: an overline set in capitals has no descender ("Today" is drawn "TODAY").
        // A comma or full stop after a word dips under the line by a hair: the letters are what a person sees.
        const tt = s.textTransform;
        const drawn = word.replace(/[,.;:]+$/, '') || word;
        const m = ctx.measureText(tt === 'uppercase' ? drawn.toUpperCase() : tt === 'lowercase' ? drawn.toLowerCase() : drawn);
        metrics.set(key, { asc: m.fontBoundingBoxAscent, up: m.actualBoundingBoxAscent, down: m.actualBoundingBoxDescent });
      }
      return metrics.get(key);
    };
    // The piece of text an element's words belong to: up through inline (nested) text.
    const pieceOf = (el) => { let e = el; while (e.parentElement && e !== root && getComputedStyle(e).display === 'inline') e = e.parentElement; return e; };
    const pieces = new Map();
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('svg') || !shown(el) || onPurpose(el)) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize) || 14;
        const re = /\S+/g;
        let m;
        while ((m = re.exec(n.textContent))) {
          const range = document.createRange();
          range.setStart(n, m.index);
          range.setEnd(n, m.index + m[0].length);
          const k = ink(el, m[0]);
          for (const q of range.getClientRects()) {
            if (q.width <= 0) continue;
            // The range's box is the font's content area, so its top plus the font's ascent is the baseline.
            const base = q.top + k.asc;
            const v = visibleRect(el, { left: q.left, right: q.right, top: base - k.up, bottom: base + k.down });
            if (empty(v)) continue;
            const p = pieceOf(el);
            if (!pieces.has(p)) pieces.set(p, []);
            const lines = pieces.get(p);
            // Words whose baselines are within half a letter of each other are on one line.
            const line = lines.find((l) => Math.abs(l.base - base) < fs * 0.5);
            if (line) Object.assign(line, { l: Math.min(line.l, v.l), r: Math.max(line.r, v.r), t: Math.min(line.t, v.t), b: Math.max(line.b, v.b), fs: Math.min(line.fs, fs) });
            else lines.push({ base, fs, ...v });
          }
        }
      }
    }
    const list = [...pieces.keys()];
    const words = (p) => `"${p.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
    const lca = (a, b) => { for (let e = a; e; e = e.parentElement) if (e.contains(b)) return e; return document.body; };
    const placed = (p, top) => { for (let e = p; e && e !== top; e = e.parentElement) { const pos = getComputedStyle(e).position; if (pos === 'absolute' || pos === 'fixed') return true; } return false; };
    const piecesIn = (el) => list.filter((p) => el === p || el.contains(p)).length;
    const branch = (p, top) => { let e = p; while (e.parentElement && e.parentElement !== top) e = e.parentElement; return e; };
    const area = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const nextShown = (e) => { for (let s = e.nextElementSibling; s; s = s.nextElementSibling) if (area(s) && shown(s)) return s; return null; };
    const NUMBER = /^[~+\u2212\-±]?[\d.,\u2060\u2013/]+%?$/;
    /** True when `a` (above or left) and `b` are tight by design (see the comment above). */
    // An emoji alone is a content mark beside its name (AGENTS.md: emoji in food and activity rows), part of
    // the name's line: what is under it is under the name, and judged there.
    const markOnly = (p) => !/[\p{L}\p{N}]/u.test(p.textContent);
    const byDesign = (a, b, how) => {
      if (a.contains(b) || b.contains(a) || markOnly(a) || markOnly(b)) return true;
      const top = lca(a, b);
      if (placed(a, top) || placed(b, top)) return false;
      if (piecesIn(top) <= 3) return true;
      // A number and its unit set as two blocks side by side ("7" "h" "45" "min"): the unit smaller than the number.
      if (how !== 'above') return NUMBER.test(a.textContent.trim()) && b.textContent.trim().length <= 8 && !/\d/.test(b.textContent) && parseFloat(getComputedStyle(b).fontSize) < parseFloat(getComputedStyle(a).fontSize);
      const ba = branch(a, top);
      const bb = branch(b, top);
      if (nextShown(ba) !== bb || piecesIn(ba) !== 1) return false;
      // A title or label: one line, or two lines set larger or bolder than the line under it (not a paragraph).
      const sa = getComputedStyle(a);
      const sb = getComputedStyle(b);
      const lines = pieces.get(a).length;
      const title = lines === 1 || (lines === 2 && (parseFloat(sa.fontSize) > parseFloat(sb.fontSize) || parseFloat(sa.fontWeight) > parseFloat(sb.fontWeight)));
      if (title && piecesIn(bb) === 1 && pieces.get(b).length === 1) return true;
      return lines === 1 && piecesIn(bb) <= 2 && !!bb.querySelector('input, textarea, select');
    };
    const boxName = (el) => { const id = el.getAttribute('data-testid') || el.getAttribute('aria-label'); if (id) return id.slice(0, 40); const t = el.textContent.trim().replace(/\s+/g, ' '); return t ? `"${t.slice(0, 30)}"` : el.tagName.toLowerCase(); };
    /** True when text and a box near it belong together by design. */
    const boxByDesign = (p, box, how) => {
      const top = lca(p, box);
      if (placed(p, top) || placed(box, top)) return false;
      // A caption under its picture (a theme swatch, a miniature): the box holds no text, and nothing else
      // but the caption shares their element.
      if (!box.textContent.trim() && piecesIn(top) <= 1) return true;
      // A label directly above its own field: the next block holds the input (the box is the field or in it).
      if (how === 'above the box of') {
        const bp = branch(p, top);
        const bb = branch(box, top);
        const field = 'input, textarea, select';
        if (nextShown(bp) === bb && piecesIn(bp) <= 1 && (bb.matches(field) || bb.querySelector(field))) return true;
      }
      return false;
    };
    const found = new Map();
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const pa = list[i];
        const pb = list[j];
        // Text in pinned chrome is judged against its own chrome's text only (see sameLayer).
        if (!sameLayer(pa, pb)) continue;
        for (const la of pieces.get(pa)) {
          for (const lb of pieces.get(pb)) {
            const side = Math.min(la.r, lb.r) - Math.max(la.l, lb.l);
            const vo = Math.min(la.b, lb.b) - Math.max(la.t, lb.t);
            let gap = null;
            let how = '';
            // One above the other: b's ink starts under a's (letters overlapping by more than 2 px are overText).
            if (side > 1 && lb.t >= la.t && lb.t - la.b > -2 && Math.round(lb.t - la.b) < 8) { gap = lb.t - la.b; how = 'above'; }
            // Side by side: on one line, b to the right of a, a word space or more but under 6 px apart.
            else if (vo > Math.min(la.b - la.t, lb.b - lb.t) * 0.5 && lb.l >= la.l) {
              const g = lb.l - la.r;
              if (g >= Math.min(3, 0.18 * Math.min(la.fs, lb.fs)) && Math.round(g) < 6) { gap = g; how = 'left of'; }
            }
            if (gap === null) continue;
            const key = `${i}|${j}`;
            if (!found.has(key) || found.get(key).gap > gap) found.set(key, { pa, pb, gap, how });
          }
        }
      }
    }
    const out = [];
    for (const f of [...found.values()].sort((x, y) => x.gap - y.gap)) {
      if (out.length >= 12) break;
      const v = `${words(f.pa)} ${Math.max(0, Math.round(f.gap))}px ${f.how} ${words(f.pb)}`;
      // For tuning (scripts set window.__tightWhy = []): what was left alone as tight by design.
      if (byDesign(f.pa, f.pb, f.how)) { if (Array.isArray(window.__tightWhy) && window.__tightWhy.length < 60) window.__tightWhy.push(v); continue; }
      if (!out.includes(v)) out.push(v);
    }
    // Text and a box it is not in (a button, a chip, a field, a dashed slot, a card) one above the other,
    // less than 8 px between the letters and the box's edge.
    const near = [];
    for (const b of boxesNear) {
      for (const p of list) {
        if (b.el.contains(p) || p.contains(b.el) || !sameLayer(p, b.el)) continue;
        for (const l of pieces.get(p)) {
          const side = Math.min(l.r, b.r.r) - Math.max(l.l, b.r.l);
          if (side <= 1) continue;
          let gap = null;
          let how = '';
          if (b.r.t >= l.b - 1 && Math.round(b.r.t - l.b) < 6) { gap = b.r.t - l.b; how = 'above the box of'; }
          else if (l.t >= b.r.b - 1 && Math.round(l.t - b.r.b) < 6) { gap = l.t - b.r.b; how = 'under the box of'; }
          if (gap === null) continue;
          if (boxByDesign(p, b.el, how)) { if (Array.isArray(window.__tightWhy) && window.__tightWhy.length < 120) window.__tightWhy.push(`${words(p)} ${Math.max(0, Math.round(gap))}px ${how} ${boxName(b.el)}`); continue; }
          near.push({ gap, v: `${words(p)} ${Math.max(0, Math.round(gap))}px ${how} ${boxName(b.el)}` });
        }
      }
    }
    for (const n of near.sort((x, y) => x.gap - y.gap)) if (out.length < 12 && !out.includes(n.v)) out.push(n.v);
    return out;
  }
  out.tight = tightScan({ root, shown, onPurpose, visibleRect, empty, sameLayer, boxesNear: boxes.filter((b) => !b.art && h(b.r) >= 12 && w(b.r) >= 24 && w(b.r) < vw - 2 && boxed(b.el)) });
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
 *   content cut by the bottom of the screen where nothing scrolls to reach it (lines a text clamp hides
 *   are not drawn, so they are not judged here nor in the check for a body that almost fits);
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
  // What a text clamp around an element (numberOfLines: -webkit-line-clamp with its overflow hidden, on the
  // element or a box holding it inside the sheet) leaves drawn of a box from `t` to `b`: the lines after the
  // ellipsis are laid out under the clamp's box but not drawn (a name inside a two-line list of foods).
  const unclamped = (el, t, b) => {
    for (let p = el; p && p !== sheet.parentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (!s.webkitLineClamp || s.webkitLineClamp === 'none' || (s.overflowX === 'visible' && s.overflowY === 'visible')) continue;
      const q = p.getBoundingClientRect();
      t = Math.max(t, q.top);
      b = Math.min(b, q.bottom);
    }
    return { t, b };
  };

  // Cut by the bottom of the screen with no scroller to bring it up. Only what is drawn: lines a clamp hides are left out.
  for (const el of content) {
    const r = el.getBoundingClientRect();
    const { t, b } = unclamped(el, r.top, r.bottom);
    if (r.height < 1 || b - t < 1 || b <= vh + 0.5) continue;
    let reachable = false;
    for (let p = el.parentElement; p && p !== sheet.parentElement; p = p.parentElement) if (scrollsY(p)) { reachable = true; break; }
    if (!reachable) add(`${name(el)} cut by the bottom of the screen (${Math.round(b - vh)}px below)`);
  }

  // Almost fits: the body scrolls by only a little, so at rest its last line shows half cut at the bottom
  // edge (above a pinned footer) with nothing to say there is more. Either make it fit or let it clearly
  // scroll. Counted beyond the body's own bottom padding; a long body (a list, a long text) is not judged.
  const body0 = sheet.querySelector('[data-testid="sheet-body"]');
  if (body0 && scrollsY(body0) && body0.scrollTop < 1) {
    const inner0 = body0.firstElementChild;
    const padB = inner0 ? parseFloat(getComputedStyle(inner0).paddingBottom) || 0 : 0;
    const hidden = body0.scrollHeight - body0.clientHeight - padB;
    // Only when a line of text is drawn across that edge: a list that ends between two rows shows nothing cut.
    const edge = body0.getBoundingClientRect().bottom;
    let across = null;
    for (const el of body0.querySelectorAll('*')) {
      if (across || !shown(el)) continue;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          const { t, b } = unclamped(el, q.top, q.bottom);
          if (q.width > 0 && b - t >= 1 && t < edge - 3 && b > edge + 3) across = el;
        }
      }
    }
    if (across && hidden > 2 && hidden <= 80) add(`sheet body almost fits: ${Math.round(hidden)}px hidden under its bottom edge at rest, and ${name(across)} shows cut there`);
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
      // Only the part that is drawn: a name shortened with an ellipsis keeps its whole text in the range,
      // past the box that clips it.
      const c = clipped(el);
      if (q.length) box = { left: Math.max(c.l, Math.min(...q.map((x) => x.left))), right: Math.min(c.r, Math.max(...q.map((x) => x.right))) };
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
 * card (a number with its unit, a heading inside a card or a section title at 18 px are content). At a
 * raised app text size the 21 px grows as the app's type does (36 px at 200%), so body text is not a title.
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
  // With the app's text size raised (a state's `__healthcalTextSize` flag, or the size chosen in Profile and kept
  // under `healthcal.textSize`, src/theme/textSize.ts) reading text grows past 21 px (body is 30 px at 200%, a
  // section title 33 px), so a title is 21 px scaled the way the app scales it: 36 px at 200%, 28.5 px at 150%.
  const flag = window.__healthcalTextSize;
  let asked = flag === true ? 2 : Number(flag) || 0;
  if (!asked) {
    try {
      asked = Number(window.localStorage.getItem('healthcal.textSize')) || 1;
    } catch {
      asked = 1;
    }
  }
  const ts = Math.min(2, Math.max(1, asked));
  const titleFrom = 21 + (36 - 21) * (ts - 1);
  for (const el of document.querySelectorAll('body *')) {
    // The coach's hero greeting (`coach-hello`) is the one stated exception: a greeting by name in the
    // middle of an empty chat, not a screen title (AGENTS.md, "The top of a screen").
    if (head.contains(el) || !visible(el) || el.closest('[data-testid="sheet"], [data-testid="toast"], [data-testid="tab-bar"], [data-testid="coach-hello"], svg, [aria-hidden="true"]')) continue;
    const text = own(el);
    if (!text || !/[A-Za-z]{3,}/.test(text)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const r = el.getBoundingClientRect();
    if (fs < titleFrom || r.top < hb - 1 || r.top > hb + 160 || inCard(el)) continue;
    out.push(`a second title under the header: "${text.slice(0, 40)}" (${Math.round(fs)} px)`);
    break;
  }
  return out;
}

/**
 * Runs in the page: whether a toast now on screen covers a control. With a sheet open the
 * sheet's controls are judged; otherwise every control of the focused screen (the screen whose
 * content lies under the toast: its scroll area, its pinned header and footer) and the tab bar.
 * A control is measured by the part of it that shows: its box cut by every ancestor whose
 * overflow is not visible (a scroll area, a sheet's scrolling body), so a row scrolled out of the
 * scroll area's view (a screen that ended its scroll area above the toast, as the kit does when
 * no band is clear) or a tile scrolled up out of a sheet's body, under its title, is not
 * "covered" by a toast resting over it.
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
  const visibleBox = (el) => {
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && (!el.checkVisibility || el.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  };
  // The focused screen: the one whose content is under the toast (tab screens stay mounted, a pushed screen covers
  // the one under it), else the last one drawn.
  const focusedScreen = () => {
    const screens = [...document.querySelectorAll('[id^="screen-"]')].filter((el) => visibleBox(el) && !el.closest('[data-testid="sheet"]'));
    const x = (tr.left + tr.right) / 2;
    for (const y of [(tr.top + tr.bottom) / 2, tr.top - 2, tr.bottom + 2]) {
      const under = document.elementsFromPoint(x, y).find((el) => !t.contains(el));
      const own = under && screens.find((sc) => sc.contains(under));
      if (own) return own;
    }
    return screens.pop() || null;
  };
  const screen = sheet ? null : focusedScreen();
  const roots = sheet ? [sheet] : [...(screen ? [screen] : document.querySelectorAll('[data-testid="screen-footer"]')), ...document.querySelectorAll('[data-testid="tab-bar"]')];
  const isControl = (el) => el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || ['button', 'link', 'switch', 'tab', 'checkbox', 'radio', 'slider'].includes(el.getAttribute('role'));
  // What of a control shows: its box cut by every ancestor that clips its content (overflow not visible,
  // per axis), up to a fixed box, which no ancestor above it clips. Measured inside the ancestor's border.
  // The body is left out: its overflow is the window's (it propagates to the viewport).
  const shown = (el) => {
    const b = el.getBoundingClientRect();
    const r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    let child = el;
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      if (getComputedStyle(child).position === 'fixed') break;
      const cs = getComputedStyle(a);
      const ar = a.getBoundingClientRect();
      if (cs.overflowX !== 'visible') {
        r.left = Math.max(r.left, ar.left + a.clientLeft);
        r.right = Math.min(r.right, ar.left + a.clientLeft + a.clientWidth);
      }
      if (cs.overflowY !== 'visible') {
        r.top = Math.max(r.top, ar.top + a.clientTop);
        r.bottom = Math.min(r.bottom, ar.top + a.clientTop + a.clientHeight);
      }
      child = a;
    }
    return r;
  };
  const judged = new Set();
  for (const root of roots) {
    for (const el of root.querySelectorAll('*')) {
      if (judged.has(el)) continue;
      judged.add(el);
      if (!isControl(el) || t.contains(el) || el.contains(t)) continue;
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const r = shown(el);
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

const STATE_FIELDS = ['id', 'route', 'data', 'imperial', 'day', 'values', 'health', 'type', 'taps', 'waitFor', 'sheet', 'note', 'now', 'flags', 'absent'];
const VALUES = ['eaten', 'protein', 'exercise', 'water', 'weekMinutes', 'fasting', 'eatBack', 'spread', 'lastNight', 'weighInGap', 'onboardedToday', 'name', 'drinks', 'diaryDrink', 'diaryWater', 'oldBourekas', 'load', 'favoriteMeal', 'savedEstimate'];
/** The morning page's knobs that are not numbers (seed.mjs checks them again). */
const VALUE_TYPES = { onboardedToday: 'boolean', name: 'string', load: 'string' };
const DATA = ['demo', 'empty', 'fresh', 'stress'];

/** What is wrong with one state's form (empty when nothing), `where` naming it in each message. */
function stateProblems(s, where) {
  const problems = [];
  const unknown = Object.keys(s || {}).filter((k) => !STATE_FIELDS.includes(k));
  if (unknown.length) problems.push(`${where}: unknown field ${unknown.join(', ')} (fields: ${STATE_FIELDS.join(', ')})`);
  if (!s.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id)) problems.push(`${where}: id must be kebab-case`);
  if (typeof s.route !== 'string' || !s.route.startsWith('/')) problems.push(`${where}: route must start with /`);
  if (s.data !== undefined && !DATA.includes(s.data)) problems.push(`${where}: data must be one of ${DATA.join(', ')}`);
  if (s.route && s.route.includes('{day}') !== (s.day !== undefined)) problems.push(`${where}: a route with {day} needs day, and day needs {day} in the route`);
  if (s.type !== undefined && (typeof s.type !== 'object' || Array.isArray(s.type))) problems.push(`${where}: type is { testID: text }`);
  if (s.health !== undefined && (!s.health || typeof s.health !== 'object' || Object.keys(s.health).some((k) => !['demo', 'state'].includes(k)))) problems.push(`${where}: health is { demo, state }`);
  if (s.now !== undefined && (typeof s.now !== 'number' || !Number.isFinite(s.now))) problems.push(`${where}: now is a time in milliseconds`);
  if (s.flags !== undefined && (!s.flags || typeof s.flags !== 'object' || Array.isArray(s.flags) || !Object.keys(s.flags).length || Object.entries(s.flags).some(([k, v]) => !/^__[A-Za-z][A-Za-z0-9]*$/.test(k) || typeof v !== 'boolean'))) problems.push(`${where}: flags is { __windowName: true | false }, at least one`);
  if (s.absent !== undefined && (!Array.isArray(s.absent) || !s.absent.length || s.absent.some((id) => typeof id !== 'string' || !id))) problems.push(`${where}: absent is a list of testIDs`);
  if (s.values !== undefined) {
    if (!s.values || typeof s.values !== 'object' || Array.isArray(s.values)) problems.push(`${where}: values is { ${VALUES.join(', ')} }`);
    else {
      for (const [k, v] of Object.entries(s.values)) if (!VALUES.includes(k) || (VALUE_TYPES[k] ? typeof v !== VALUE_TYPES[k] : typeof v !== 'number' || !(v >= 0))) problems.push(`${where}: values.${k} must be one of ${VALUES.join(', ')}, a number of 0 or more (onboardedToday a boolean, name a string)`);
      if (!['demo', 'stress', undefined].includes(s.data)) problems.push(`${where}: values go on the demo or stress data`);
    }
  }
  for (const t of s.taps || []) {
    const ok = typeof t === 'string' || (t && typeof t === 'object' && ((typeof t.type === 'string' && typeof t.text === 'string') || typeof t.wait === 'number' || t.reload === true || (typeof t.choose === 'string' && Array.isArray(t.files))));
    if (!ok) problems.push(`${where}: a step is a testID, { type, text }, { wait }, { reload: true } or { choose, files }; got ${JSON.stringify(t)}`);
    if (t && t.files) for (const f of t.files) if (!fs.existsSync(path.resolve(ROOT, f))) problems.push(`${where}: no file ${f}`);
  }
  return problems;
}

/** Sets a state's window booleans before any of the app's code runs, on every load of the page. */
async function applyFlags(page, values) {
  if (values) await page.addInitScript((f) => { for (const [k, v] of Object.entries(f)) window[k] = v; }, values);
}

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
      problems.push(...stateProblems(s || {}, where));
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
const EMPTY_LAYOUT = () => ({ overText: [], tight: [], broken: [], sticksOut: [], controls: [], gaps: [], hidden: [], header: [], sheet: [], toast: [] });

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
  // A health store in memory instead of the phone's (development and E2E builds only, sync.ts), and this phone's sync memory.
  if (job.health) {
    await page.addInitScript((h) => {
      if (h.demo) window.__healthcalHealthDemo = h.demo;
      if (h.state && !sessionStorage.getItem('__evidenceHealth')) {
        localStorage.setItem('healthcal-health-sync', JSON.stringify({ state: h.state, version: 1 }));
        sessionStorage.setItem('__evidenceHealth', '1');
      }
    }, job.health);
  }
  await applyFlags(page, job.flags);
  const toast = [];
  const step = async (what, fn) => {
    try { await fn(); return null; } catch (e) { return `${what}: ${String(e.message).split('\n')[0].slice(0, 120)}`; }
  };
  const tapped = async () => {
    await page.waitForTimeout(350);
    for (const t of await page.evaluate(toastScan).catch(() => [])) if (!toast.includes(t)) toast.push(t);
  };
  // The context's clock (the caller gives a job with `now` a context of its own).
  if (job.now !== undefined) await page.clock.setFixedTime(new Date(job.now));
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
      // A toast's action takes no press in its first moments on screen (toastGuard.cjs).
      if (t === 'toast-action') await toastActionReady(page).catch(() => {});
      problem = await step(`tap ${t}`, () => page.locator(sel(t)).first().click({ timeout: 10000 }));
      if (!problem) { await tapped(); await page.waitForTimeout(350); }
    } else if (t.type) {
      problem = await step(`type ${t.type}`, () => page.locator(sel(t.type)).first().fill(t.text, { timeout: 10000 }));
      await page.waitForTimeout(300);
    } else if (t.wait) {
      await page.waitForTimeout(t.wait);
    } else if (t.reload) {
      // The seed is written only on the first load of this tab, so what the app saved is what comes back.
      problem = await step('reload', async () => {
        await page.evaluate(() => window.__healthcal.flush());
        await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
        await page.waitForSelector('[data-testid]', { timeout: 15000 });
        await page.waitForTimeout(700);
      });
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
  if (!problem && job.absent) {
    // Long enough for something that opens by itself after a settle (the morning page waits 900 ms).
    await page.waitForTimeout(1500);
    for (const id of job.absent) if (!problem && (await page.locator(sel(id)).count()) > 0) problem = `${id} is on the page and must not be (absent)`;
  }
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
  let fullImage = null;
  if (extra > 0) {
    await page.setViewportSize({ width: vp.width, height: Math.min(vp.height + Math.ceil(sheet ? extra / 0.88 + 24 : extra), 8000) });
    await page.waitForTimeout(400);
    // What the layout scan judges: the whole page (or the sheet's whole body) at once, for the eyes too.
    fullImage = file.replace(/\.png$/, '__full.png');
    await page.screenshot({ path: fullImage });
  }
  Object.assign(layout, await page.evaluate(layoutScan, root));
  return { found, layout, fullImage: fullImage && path.basename(fullImage) };
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
    const key = `${theme}|${job.data}|${job.imperial}|${JSON.stringify(job.values || null)}`;
    const make = () => (job.data === 'fresh' ? null : JSON.stringify(buildSeed({ theme, empty: job.data === 'empty', stress: job.data === 'stress', units: job.imperial ? 'imperial' : 'metric', values: job.values || null })));
    // An open fast is measured from now, so a seed with one is built fresh for every capture.
    if (job.values && job.values.fasting !== undefined) return make();
    if (!seeds.has(key)) seeds.set(key, make());
    return seeds.get(key);
  };
  const tries = Number(flags.tries || 3);
  const browser = await chromium.launch();
  const screens = [];
  for (const theme of themes) {
    for (const width of widths) {
      // One browser context per theme and width keeps the app's bundle cached; every page clears and seeds its own storage.
      const options = { viewport: { width, height: heightFor(width) }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme === 'dark' || theme === 'java' ? 'dark' : 'light', isMobile: true, hasTouch: true };
      const context = await browser.newContext(options);
      for (const job of jobs) {
        const name = `${job.stem}__${theme}__${width}${job.tag}`;
        // Playwright's clock belongs to the whole context, so a state with its own `now` gets a context of its own:
        // the clock would otherwise stay fixed for every later job of this theme and width.
        const jobContext = job.now !== undefined ? await browser.newContext(options) : context;
        let result = null;
        // A blank, half-loaded or unfinished capture is tried again, and never reported as clean.
        for (let attempt = 1; attempt <= tries; attempt++) {
          if (result) await result.page.close();
          result = await open(jobContext, job, seedFor(theme, job));
          result.attempts = attempt;
          if (!result.problem) break;
        }
        const { page, errors, toast, problem } = result;
        let found = { cut: [], shortened: [], small: [], wide: 0 };
        let layout = EMPTY_LAYOUT();
        let fullImage = null;
        if (problem) {
          await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }).catch(() => {});
        } else {
          try {
            ({ found, layout, fullImage } = await capture(page, job, path.join(out, `${name}.png`)));
          } catch (e) {
            errors.push(`scan failed: ${String(e.message).split('\n')[0].slice(0, 100)}`);
          }
        }
        layout.toast = [...new Set([...toast, ...(layout.toast || [])])];
        const crashed = (await page.locator('[data-testid="error-retry"]').count().catch(() => 0)) > 0;
        screens.push({
          id: job.id, kind: job.kind, ...(job.list ? { list: job.list } : null), route: job.route, data: job.data, imperial: job.imperial, ...(job.values ? { values: job.values } : null), sheet: !!job.sheet, theme, width,
          image: `${name}.png`, fullImage, crashed, incomplete: problem && !crashed ? `${problem} (after ${result.attempts} tries)` : null,
          errors: [...new Set(errors)].slice(0, 5), ...found, layout,
        });
        await page.close();
        if (jobContext !== context) await jobContext.close();
      }
      await context.close();
    }
  }
  await browser.close();

  // One sheet per route or state: one row per theme, the widths side by side in the order asked (360, 390, 320).
  const sheets = [];
  const tmp = path.join(out, `_tmp-${process.pid}`);
  for (const job of jobs) {
    const mine = screens.filter((s) => s.id === job.id);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp);
    // The contact sheet tiles files by name: number them in theme and width order.
    mine.forEach((s, i) => { if (fs.existsSync(path.join(out, s.image))) fs.copyFileSync(path.join(out, s.image), path.join(tmp, `${String(i).padStart(3, '0')}-${s.image}`)); });
    const sheet = `sheet-${job.stem}${job.tag.replace(/__/g, '-')}.png`;
    try {
      execSync(`node ${JSON.stringify(path.join(__dirname, 'contact-sheet.cjs'))} ${JSON.stringify(tmp)} ${JSON.stringify(path.join(out, sheet))} ${Math.min(mine.length, widths.length)} 330 1100`, { stdio: 'ignore' });
      sheets.push(sheet);
      for (const s of mine) s.sheetImage = sheet;
    } catch { /* the single screenshots are still there */ }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  const checks = flags.checks ? runChecks() : [];
  const stateIndex = Object.fromEntries(states.map((s) => [s.id, { list: s.list, route: s.route, data: s.data || 'demo', imperial: !!s.imperial, ...(s.values ? { values: s.values } : null), ...(s.flags ? { flags: s.flags } : null), ...(s.now !== undefined ? { now: new Date(s.now).toString() } : null), sheet: !!s.sheet, note: s.note || null }]));
  const report = { taken: new Date().toISOString(), base, sheets, checks, states: stateIndex, screens };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const LAYOUT = ['overText', 'tight', 'broken', 'sticksOut', 'controls', 'hidden', 'gaps', 'header', 'sheet', 'toast'];
  const layoutCount = (s) => LAYOUT.reduce((n, k) => n + (s.layout?.[k]?.length || 0), 0);
  const problems = screens.filter((s) => s.crashed || s.incomplete || s.errors.length || s.cut.length || s.wide || s.small.length || layoutCount(s));
  console.log(`${screens.length} screens in ${out}; ${problems.length} with something to look at; ${sheets.length} sheets`);
  const kinds = [['cut', (s) => s.cut.length], ['small', (s) => s.small.length], ['wide', (s) => (s.wide ? 1 : 0)], ...LAYOUT.map((k) => [k, (s) => s.layout?.[k]?.length || 0])]
    .map(([k, f]) => [k, screens.filter((s) => f(s) > 0).length]).filter(([, n]) => n);
  if (kinds.length) console.log(`  screens with each kind: ${kinds.map(([k, n]) => `${k} ${n}`).join(', ')}`);
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
else module.exports = { scan, layoutScan, hiddenAtEnd, headerScan, sheetScan, toastScan, notReady, loadStates, stateProblems, applyFlags, open };
