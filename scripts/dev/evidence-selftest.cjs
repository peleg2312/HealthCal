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

const { scan, layoutScan, hiddenAtEnd, headerScan, sheetScan, toastScan, notReady } = require('./evidence.cjs');

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

const BODY = 'margin:0;font:15px/20px sans-serif;color:#222;background:#fff';
/** A card holding more than three pieces of text, so only the structure under test decides. */
const CARD = (inner) => `<body style="${BODY}"><div style="margin:20px;padding:16px;border:1px solid #888;background:#fafafa"><div style="font-size:12px;margin-bottom:16px">Card heading</div>${inner}<div style="margin-top:16px">Card footer</div></div></body>`;
/** Today's calorie cup: a cup, labels placed beside it at its level (absolute), the macro rows under them. */
const CUP = ({ labelTop, rowsTop }) => `<body style="${BODY}"><div style="margin:20px;padding:16px;border:1px solid #888;display:flex;gap:12px">
  <div style="width:90px;height:220px;border:2px solid #888"></div>
  <div style="position:relative;flex:1;height:220px">
    <div style="position:absolute;left:0;right:0;top:${labelTop}px"><div style="font-size:17px;line-height:22px">1,219<span style="font-size:14px">  eaten</span></div></div>
    <div style="position:absolute;left:0;right:0;top:${rowsTop}px">${['Protein|75 / 152 g', 'Carbs|140 / 237 g', 'Fat|43 / 67 g'].map((r) => `<div style="display:flex;justify-content:space-between;font-size:13px;line-height:17px;margin-bottom:14px"><div>${r.split('|')[0]}</div><div>${r.split('|')[1]}</div></div>`).join('')}</div>
  </div></div></body>`;

/**
 * The real window before the page is scrolled: the tab bar is pinned at the bottom and the page's last row
 * ("250 ml") sits under it, 5 px below the bar's "Progress" label. With `chrome: false` the same bar is
 * an ordinary block of the page (no tab-bar testID), so the same two texts must be reported.
 */
const TABBAR = ({ chrome, at = 788 }) => `<body style="${BODY}"><div style="position:absolute;left:20px;top:100px">Water today</div><div style="position:absolute;left:20px;top:${at}px;font-size:13px;line-height:15px">250 ml</div><div ${chrome ? 'data-testid="tab-bar" ' : ''}style="position:fixed;left:0;right:0;bottom:0;height:80px;border-top:1px solid #888"><div style="position:absolute;left:20px;top:10px;font-size:11px;line-height:13px">Progress</div></div></body>`;

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
  // The scans' own false alarms, each with the fault it must still see.
  {
    name: 'text in a scaled drawing is measured at its drawn size',
    html: '<body style="margin:0"><svg width="200" height="100" viewBox="0 0 800 400"><text x="10" y="120" font-size="100">56%</text><text x="10" y="210" font-size="40">of the budget</text></svg></body>',
    run: 'layoutPage',
    expect: '',
  },
  {
    name: 'text drawn over text in a drawing is still seen',
    html: '<body style="margin:0"><svg width="200" height="100" viewBox="0 0 800 400"><text x="10" y="120" font-size="100">56%</text><text x="10" y="110" font-size="40">of the budget</text></svg></body>',
    run: 'layoutPage',
    expect: 'over',
  },
  {
    name: 'a label and its value a word space apart in a small drawing are clean',
    html: '<body style="margin:0"><svg width="200" height="100" viewBox="0 0 800 400"><text id="a" x="10" y="100" font-size="24">Breakfast</text><text id="b" y="100" font-size="24">462 kcal</text></svg><script>const a = document.getElementById("a").getBBox(); document.getElementById("b").setAttribute("x", a.x + a.width + 7);</script></body>',
    run: 'layoutPage',
    expect: '',
  },
  {
    name: 'a label touching its value in a drawing is seen',
    html: '<body style="margin:0"><svg width="200" height="100" viewBox="0 0 800 400"><text id="a" x="10" y="100" font-size="24">Breakfast</text><text id="b" y="100" font-size="24">462 kcal</text></svg><script>const a = document.getElementById("a").getBBox(); document.getElementById("b").setAttribute("x", a.x + a.width + 1);</script></body>',
    run: 'layoutPage',
    expect: '462 kcal',
  },
  {
    name: 'the space where a sheet line wraps is not a letter',
    html: sheetPage({ extra: '<p style="margin:0;text-align:justify">Weight is never on a card. Calories show only when you turn them on, and a food list only when you choose it.</p>' }),
    run: 'sheet',
    expect: '',
  },
  {
    name: 'a sheet row shortened with an ellipsis is judged by what is drawn',
    html: sheetPage({ extra: '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Israeli salad, Pasta, cooked, Chicken breast, grilled, White rice</div>' }),
    run: 'sheet',
    expect: '',
  },
  {
    name: 'a toast over a card is not judged on the grown page',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="margin:20px;height:300px;border:1px solid #888;background:#eee">A card</div><div data-testid="toast" style="position:absolute;left:20px;right:20px;top:200px;height:44px;background:#111;color:#fff">Removed volleyball <span role="button">Undo</span></div></body>',
    run: 'layoutPage',
    expect: '',
  },
  {
    name: 'a toast is not footer chrome at the end of the page',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="height:100vh;overflow-y:auto"><div style="height:1400px"></div><button style="height:48px;width:200px">Erase all data</button><div style="height:24px"></div></div><div data-testid="toast" style="position:fixed;left:10px;right:10px;bottom:20px;height:60px;background:#111;color:#fff">This backup is from a newer version</div></body>',
    run: 'hidden',
    expect: '',
  },
  {
    name: 'content under a real footer at the end is still seen',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="height:100vh;overflow-y:auto"><div style="height:1400px"></div><button style="height:48px;width:200px">Erase all data</button></div><div data-testid="screen-footer" style="position:fixed;left:0;right:0;bottom:0;height:80px;background:#111"></div></body>',
    run: 'hidden',
    expect: 'under',
  },
  {
    name: 'a control scrolled partly under the pinned header is not judged',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div data-testid="screen-header" style="height:60px;background:#eee">Header</div><div id="list" style="height:600px;overflow-y:auto"><div style="height:300px"></div><button style="width:32px;height:32px;padding:0">x</button><div style="height:1200px"></div></div><script>document.getElementById("list").scrollTop = 310;</script></body>',
    run: 'small',
    expect: '',
  },
  {
    name: 'a small control in the open is still seen',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div data-testid="screen-header" style="height:60px;background:#eee">Header</div><div style="height:600px;overflow-y:auto"><div style="height:100px"></div><button style="width:32px;height:32px;padding:0">x</button><div style="height:1200px"></div></div></body>',
    run: 'small',
    expect: 'x',
  },
  {
    name: 'a miniature hidden from screen readers is a picture',
    html: '<body style="margin:0;font:24px/26px sans-serif"><div aria-hidden="true" style="position:relative;width:80px;height:40px"><div style="position:absolute;left:0;width:40px;height:40px;overflow:hidden"><span style="position:absolute;left:24px">941</span></div><div style="position:absolute;left:40px;width:40px;height:40px;overflow:hidden"><span style="position:absolute;left:-16px">941</span></div></div></body>',
    run: 'layoutPage',
    expect: '',
  },
  {
    name: 'a name ending in an ellipsis is shortened, not cut',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Israeli salad (tomato, cucumber, onion, oil, lemon)</div></body>',
    run: 'cut',
    expect: '',
  },
  {
    name: 'text clipped with no ellipsis is cut',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="width:120px;white-space:nowrap;overflow:hidden">Israeli salad (tomato, cucumber, onion, oil, lemon)</div></body>',
    run: 'cut',
    expect: 'Israeli salad',
  },
  {
    name: 'a clamped name in a box taller than its clamp shows its hidden lines: cut',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="width:120px;height:60px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Israeli salad (tomato, cucumber, onion, oil, lemon)</div></body>',
    run: 'cut',
    expect: 'under its 2-line clamp',
  },
  {
    name: 'a clamped name in a box of its own lines is shortened, not cut',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="width:120px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">Israeli salad (tomato, cucumber, onion, oil, lemon)</div></body>',
    run: 'cut',
    expect: '',
  },
  {
    name: 'a placeholder wider than its field is cut',
    html: '<body style="margin:0;font:15px/20px sans-serif"><input style="width:140px;font:15px sans-serif;padding:0 12px" placeholder="Search a city, such as Denver or Berlin"></body>',
    run: 'cut',
    expect: 'placeholder',
  },
  {
    name: 'a header with its title and one short line is clean',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div data-testid="screen-header" style="display:flex;gap:12px"><button data-testid="header-back" style="width:44px;height:44px">&lt;</button><div><div style="font-size:18px">Import from Garmin</div><div style="font-size:13px">1 workout added</div></div></div><p style="font-size:15px">40 min of activity on one day.</p></body>',
    run: 'header',
    expect: '',
  },
  {
    name: 'a header title with no short line is seen',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div data-testid="screen-header" style="display:flex;gap:12px"><button data-testid="header-close" style="width:44px;height:44px">x</button><div><div style="font-size:18px">Review estimate</div></div></div><p>Rows</p></body>',
    run: 'header',
    expect: 'no short line',
  },
  {
    name: 'a second large title under the header is seen',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div data-testid="screen-header" style="display:flex;gap:12px"><button data-testid="header-close" style="width:44px;height:44px">x</button><div><div style="font-size:18px">Import from Garmin</div><div style="font-size:13px">FIT, TCX or GPX files</div></div></div><div style="font-size:30px;line-height:34px">Two things to check</div></body>',
    run: 'header',
    expect: 'second title',
  },
  {
    name: 'a text field box is not a card with uneven margins',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="display:flex;gap:8px;padding:0 20px"><div style="flex:1;height:50px;border:1px solid #888;display:flex"><input style="flex:1;border:0"></div><button style="width:74px;height:50px">Set</button></div></body>',
    run: 'gaps',
    expect: '',
  },
  {
    name: 'a full-width card with uneven margins is still seen',
    html: '<body style="margin:0;font:15px/20px sans-serif"><div style="margin:0 94px 0 20px;height:80px;border:1px solid #888;background:#eee">A card</div></body>',
    run: 'gaps',
    expect: 'from the left',
  },
  {
    name: 'a header title running past the side padding is seen',
    html: '<body style="margin:0;font:18px/24px sans-serif"><div style="padding:0 20px"><div style="display:flex;gap:12px"><button style="width:44px;height:44px;flex:none">&lt;</button><div style="flex:1"><div style="white-space:nowrap">Stand-up paddleboarding on the lake and more</div></div></div></div></body>',
    run: 'gaps',
    expect: "from the screen's right edge",
  },
  {
    name: 'a header title that shortens inside the padding is clean',
    html: '<body style="margin:0;font:18px/24px sans-serif"><div style="padding:0 20px"><div style="display:flex;gap:12px"><button style="width:44px;height:44px;flex:none">&lt;</button><div style="flex:1;min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Stand-up paddleboarding on the lake and more</div></div></div></div></body>',
    run: 'gaps',
    expect: '',
  },
  // tight: two pieces of text from different blocks closer than 8 px (above) or 6 px (side by side).
  { name: 'tight: a label placed at a cup level 5 px above the rows beside the cup', html: CUP({ labelTop: 0, rowsTop: 21 }), run: 'tight', expect: 'eaten" 5px above "Protein' },
  { name: 'tight: the same label 16 px above the rows is clean', html: CUP({ labelTop: 0, rowsTop: 38 }), run: 'tight', expect: '' },
  { name: 'tight: two placed labels in a two-label cup 3 px apart', html: `<body style="${BODY}"><div style="position:relative;height:200px;width:200px"><div style="position:absolute;top:40px;left:0">1.2 L drunk</div><div style="position:absolute;top:56px;left:0">2.1 L to go</div></div></body>`, run: 'tight', expect: 'above "2.1 L to go' },
  { name: 'tight: a section label 2 px above the next row', html: CARD(`<div style="font-size:12px;line-height:14px">MEALS</div><div style="display:flex;justify-content:space-between"><span style="display:block">Breakfast</span><span style="display:block">462 kcal</span></div>`), run: 'tight', expect: 'MEALS" ' },
  { name: 'tight: two paragraphs 2 px apart', html: CARD(`<p style="margin:0;line-height:16px">Your budget grows with each workout you log, so a run adds room.</p><p style="margin:2px 0 0;line-height:16px">Weigh in once a week, at the same time of day and before breakfast, for a steady trend line.</p>`), run: 'tight', expect: 'above "Weigh in' },
  { name: 'tight: two labels 4 px apart on one line', html: CARD(`<div style="display:flex;gap:4px"><div>Protein</div><div>Carbs</div><div>Fat</div><div>Water</div></div>`), run: 'tight', expect: 'left of' },
  { name: 'tight: the lines of one paragraph are one piece', html: CARD(`<p style="margin:0;line-height:15px">One long paragraph that wraps over three lines at this width, set with a tight line height on purpose.</p>`), run: 'tight', expect: '' },
  { name: 'tight: a header title and its short line', html: `<body style="${BODY}"><div data-testid="screen-header" style="display:flex;gap:12px;padding:8px 20px"><button style="width:44px;height:44px">&lt;</button><div><div style="font-size:20px;line-height:22px">Goals and targets</div><div style="font-size:13px;line-height:14px">Budget, macros and water</div></div><button style="width:44px;height:44px">x</button></div>${CARD('<div>More</div><div>Content</div>')}</body>`, run: 'tight', expect: '' },
  { name: "tight: a list row's title and subtitle", html: CARD(['Oats, rolled, dry', 'Banana', 'Latte, whole milk'].map((t) => `<div style="display:flex;gap:12px;padding:6px 0"><span style="display:block">🥣</span><div style="flex:1"><div style="line-height:16px">${t}</div><div style="font-size:12px;line-height:13px">1/2 cup · 152 kcal</div></div><div>152</div></div>`).join('')), run: 'tight', expect: '' },
  { name: 'tight: a stat and its caption, among other stats', html: CARD(`<div style="display:flex;gap:24px">${['152 g|Protein', '185 g|Carbs', '58 g|Fat'].map((x) => `<div><div style="font-size:24px;line-height:24px">${x.split('|')[0].split(' ')[0]}<span style="font-size:12px"> g</span></div><div style="font-size:12px;line-height:13px">${x.split('|')[1]}</div></div>`).join('')}</div>`), run: 'tight', expect: '' },
  { name: 'tight: a number and its unit beside it', html: CARD(`<div style="display:flex;align-items:center;gap:4px"><div style="font-size:60px;line-height:62px">941</div><div style="font-size:13px;line-height:15px"><div>kcal</div><div>left</div></div></div><div>Budget 2,160</div>`), run: 'tight', expect: '' },
  { name: 'tight: a number and its unit in one sentence', html: CARD(`<div style="font-size:17px">1,219<span style="font-size:14px"> eaten</span></div><div style="margin-top:12px">Protein</div>`), run: 'tight', expect: '' },
  { name: 'tight: a title and the single line under it, in a card with more', html: CARD(`<div style="font-size:18px;line-height:20px">Water</div><div style="font-size:13px;line-height:14px">1.2 L of 3.3 L</div><div style="margin-top:16px">A glass is 250 ml.</div><button style="margin-top:12px;height:44px">Add 250 ml</button>`), run: 'tight', expect: '' },
  { name: 'tight: a label directly above its value, in a card with more', html: CARD(`<div style="font-size:12px;line-height:13px">YOUR PLAN</div><div style="margin-top:12px;font-size:12px;line-height:13px">Target weight</div><div style="font-size:20px;line-height:21px">74 kg</div><div style="margin-top:16px">Reaching it around Feb 7.</div>`), run: 'tight', expect: '' },
  { name: "tight: a row's emoji over the row's subtitle", html: CARD(`<div style="display:flex;gap:8px"><div style="width:20px">☑</div><div style="flex:1"><div style="display:flex;gap:6px"><span style="display:block;font-size:17px;line-height:18px">🏃</span><span style="display:block">Running</span></div><div style="font-size:13px;line-height:14px;margin-top:1px">Yesterday · 07:12 · 1 h 1 min</div></div><div>+555 kcal</div></div>`), run: 'tight', expect: '' },
  { name: 'tight: numbers and units set as blocks side by side', html: CARD(`<div style="display:flex;align-items:baseline;gap:4px"><div style="font-size:60px;line-height:62px">7</div><div style="font-size:14px">h</div><div style="font-size:60px;line-height:62px;margin-left:8px">45</div><div style="font-size:14px">min</div></div>`), run: 'tight', expect: '' },
  { name: 'tight: a number 4 px from the next label is still seen', html: CARD(`<div style="display:flex;align-items:baseline;gap:4px"><div>152 g</div><div>Carbs</div><div style="margin-left:24px">185 g</div><div>Fat</div></div>`), run: 'tight', expect: '"152 g" 4px left of "Carbs"' },
  // Text and a box it is not in (a button, a badge, a dashed slot): under 6 px between the letters and the box.
  { name: 'tight: a badge wrapped 3 px under a title', html: CARD(`<div style="font-size:20px;line-height:22px">Weekly check-in</div><div style="margin-top:2px;display:inline-block;padding:2px 8px;background:#f3d;font-size:13px">New</div><div style="margin-top:12px">Last week</div>`), run: 'tight', expect: 'above the box of "New"' },
  { name: 'tight: a link 3 px under a dashed slot', html: CARD(`<div style="height:48px;border:1px dashed #888;display:flex;align-items:center;justify-content:center">Log dinner</div><div style="margin-top:0;line-height:15px">Repeat yesterday: Israeli salad</div>`), run: 'tight', expect: 'under the box of' },
  { name: 'tight: an overline 7 px over its card is clean (capitals, no descender)', html: `<body style="${BODY}"><div style="padding:20px"><div style="font-size:12px;line-height:14px;text-transform:uppercase;letter-spacing:1px">Today, Nov 15</div><div style="margin-top:4px;height:60px;border:1px solid #888;background:#fafafa">Volleyball</div></div></body>`, run: 'tight', expect: '' },
  { name: 'tight: a caption under its picture is clean', html: CARD(`<div style="display:flex;gap:12px">${['System', 'Light', 'Dark'].map((t) => `<div><div style="width:60px;height:40px;background:#ccc;border:1px solid #888"></div><div style="margin-top:2px;font-size:13px">${t}</div></div>`).join('')}</div>`), run: 'tight', expect: '' },
  { name: 'tight: a label directly above its own field', html: CARD(`<div style="font-size:13px;line-height:14px">Target weight</div><div style="display:flex;border:1px solid #888;align-items:flex-start;line-height:16px"><span style="display:block">kg</span><input style="flex:1;border:0;height:16px;padding:0" value="74"></div><div style="margin-top:12px">Now 78.8 kg.</div><div style="margin-top:12px">Weekly pace</div>`), run: 'tight', expect: '' },
  // Pinned chrome: the tab bar's labels sit over whatever content scrolls under the bar at that moment.
  { name: 'tight: text in the tab bar is not judged against content scrolled under it', html: TABBAR({ chrome: true }), run: 'tight', expect: '' },
  { name: 'tight: the same two texts outside the tab bar are seen', html: TABBAR({ chrome: false }), run: 'tight', expect: 'Progress" ' },
  { name: 'text in the tab bar drawn over content scrolled under it is not overText', html: TABBAR({ chrome: true, at: 774 }), run: 'layoutPage', expect: '' },
  { name: 'the same two texts drawn over each other outside the tab bar are overText', html: TABBAR({ chrome: false, at: 774 }), run: 'layoutPage', expect: 'over' },
  { name: 'tight: two labels inside the tab bar 3 px apart are still seen', html: `<body style="${BODY}"><div data-testid="tab-bar" style="position:fixed;left:0;right:0;bottom:0;height:80px;background:#fff;border-top:1px solid #888"><div style="position:absolute;left:20px;top:10px;font-size:11px;line-height:13px">Progress</div><div style="position:absolute;left:20px;top:26px;font-size:11px;line-height:13px">Updated</div></div></body>`, run: 'tight', expect: 'above "Updated' },
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
    case 'hidden': return page.evaluate(hiddenAtEnd);
    case 'gaps': return (await page.evaluate(layoutScan, null)).gaps;
    case 'tight': return (await page.evaluate(layoutScan, null)).tight;
    case 'header': return page.evaluate(headerScan);
    case 'small': return (await page.evaluate(scan, null)).small.map((x) => x.id || 'unnamed');
    case 'cut': return (await page.evaluate(scan, null)).cut.map((x) => x.text);
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
  // Whatever the second row is (a block or a button): the selector must not depend on its tag.
  await real.addStyleTag({ content: '[data-testid="sheet-body"] > div > :nth-child(2) { margin-left: -16px !important }' });
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
  // The real Today at 360 px (the owner's phone), demo data. The calorie cup places its labels at the levels
  // they describe (absolutely positioned); the kit keeps them 8 px apart (Vessel's labelSpacing). Real
  // faults come and go as screens are fixed, so the positive is made by hand on the real page: the eaten
  // label is set where a cup without that spacing would put it, its letters 4 px under those of the label above.
  const narrow = await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await narrow.addInitScript((value) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('healthcal-v1', value); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(buildSeed({ theme: 'blossom' })));
  const today = await narrow.newPage();
  await today.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 120000 });
  await today.getByTestId('today-eaten').first().waitFor({ timeout: 15000 });
  await today.waitForTimeout(600);
  const asIs = (await today.evaluate(layoutScan, null)).tight;
  console.log(`INFO  real Today at 360 px as it is now: ${asIs.length ? asIs.join('; ') : 'nothing tight'}`);
  // At the real window height the page's end is under the tab bar: the bar's labels are not judged against it.
  const TAB_WORDS = ['"Today"', '"Diary"', '"Train"', '"Progress"'];
  judge('real Today at 360 px: the tab bar is not judged against the page under it', asIs.filter((t) => TAB_WORDS.some((w) => t.includes(w))), '');
  judge('real Today at 360 px: the tab header (overline and title) is tight by design', (await today.evaluate(layoutScan, '[data-testid="tab-header"]')).tight, '');
  const moved = await today.evaluate(() => {
    const placedBox = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === 'absolute') return e; return null; };
    const label = document.querySelector('[data-testid="today-eaten"]');
    const wrap = label && placedBox(label);
    if (!wrap) return false;
    // Ink, measured independently of the scan: a word's baseline is its range's top plus the font's ascent.
    const ctx = document.createElement('canvas').getContext('2d');
    const inkOf = (el) => {
      const n = [...el.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
      if (!n) return null;
      const s = getComputedStyle(el);
      ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const word = n.textContent.trim().split(/\s+/)[0];
      const m = ctx.measureText(word);
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getClientRects()[0];
      const base = r.top + m.fontBoundingBoxAscent;
      return { top: base - m.actualBoundingBoxAscent, bottom: base + m.actualBoundingBoxDescent, l: r.left, r: r.right };
    };
    const mine = inkOf(label);
    // The lowest ink of another placed label above it in the same cup, overlapping it sideways.
    const card = wrap.closest('[data-testid="today-energy"]') || document.body;
    let floor = null;
    for (const e of card.querySelectorAll('*')) {
      if (wrap.contains(e) || !placedBox(e) || placedBox(e) === wrap) continue;
      const k = inkOf(e);
      if (k && k.bottom <= mine.top && Math.min(k.r, mine.r) > Math.max(k.l, mine.l) && (floor === null || k.bottom > floor)) floor = k.bottom;
    }
    if (floor === null) return false;
    wrap.style.top = `${parseFloat(getComputedStyle(wrap).top) - (mine.top - floor - 4)}px`;
    return true;
  });
  if (moved) {
    await today.waitForTimeout(100);
    judge('real Today at 360 px: the eaten label set 4 px under the label above it', (await today.evaluate(layoutScan, null)).tight.filter((t) => t.includes('eaten"')), '4px above "1,');
  } else {
    judge('real Today has the eaten label (today-eaten) placed under another label in today-energy', [], 'both');
  }
  await narrow.close();
  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
