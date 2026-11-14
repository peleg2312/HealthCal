// Renders the app icon set from one SVG mark. Run: node scripts/dev/make-icons.cjs
const { chromium } = require('playwright');
const path = require('node:path');

const OUT = path.join(__dirname, '..', '..', 'assets', 'images');

// Pour: the day as a cup. An open, straight-sided vessel (no top edge) with a
// lip line across its mouth, flat persimmon poured in, the ink level line on
// the fill and the space still left visible above it. Flat colour only: no
// gradients, no glow. Colours are the light theme's tokens (oat paper bg,
// calories fill, rim ink, track), matching app.json's #F4EEE5 backgrounds.
const C = { paper: '#F4EEE5', fill: '#E2683F', ink: '#211913', track: '#ECE3D6', edge: '#211913' };

// The cup in a 100 x 100 box. `w` is the stroke width of sides, base and lip.
const cupPath = (x0, x1, top, bottom, r) =>
  `M ${x0} ${top} L ${x0} ${bottom - r} Q ${x0} ${bottom} ${x0 + r} ${bottom} L ${x1 - r} ${bottom} Q ${x1} ${bottom} ${x1} ${bottom - r} L ${x1} ${top}`;

const mark = (w, { mono = false } = {}) => {
  const x0 = 31, x1 = 69, top = 24, bottom = 80, r = 10, level = 50;
  const inner = `M ${x0} ${top} ${cupPath(x0, x1, top, bottom, r).slice(1)} Z`;
  const ink = mono ? '#FFFFFF' : C.ink;
  return `
  <defs><clipPath id="in"><path d="${inner}"/></clipPath></defs>
  ${mono ? '' : `<path d="${inner}" fill="${C.track}"/>`}
  <g clip-path="url(#in)">
    <rect x="0" y="${level}" width="100" height="60" fill="${mono ? '#FFFFFF' : C.fill}"/>
    ${mono ? '' : `<rect x="0" y="${level - 2.5}" width="100" height="5" fill="${ink}"/>`}
  </g>
  <path d="${cupPath(x0, x1, top, bottom, r)}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"/>
  <rect x="${x0 - 6}" y="${top - w / 2}" width="${x1 - x0 + 12}" height="${w}" rx="0.6" fill="${ink}"/>`;
};

const svg = (inner, { bg, scale = 1 }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${inner}</g>
</svg>`;

const files = [
  { name: 'icon.png', size: 1024, html: svg(mark(3.2), { bg: C.paper, scale: 1.2 }) },
  // Adaptive icons are masked to a circle or squircle; keep the cup inside the 66% safe zone.
  { name: 'android-icon-foreground.png', size: 1024, html: svg(mark(3.2), { scale: 0.68 }), transparent: true },
  { name: 'android-icon-background.png', size: 1024, html: svg('', { bg: C.paper }) },
  { name: 'android-icon-monochrome.png', size: 1024, html: svg(mark(3.2, { mono: true }), { scale: 0.68 }), transparent: true },
  // The splash draws the cup on app.json's oat background.
  { name: 'splash-icon.png', size: 512, html: svg(mark(3.2), { scale: 1.15 }), transparent: true },
  // Small sizes need heavier lines to stay crisp.
  { name: 'favicon.png', size: 96, html: svg(mark(5), { bg: C.paper, scale: 1.22 }) },
];

(async () => {
  const browser = await chromium.launch();
  for (const f of files) {
    const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${f.html}</body></html>`);
    await page.screenshot({ path: path.join(OUT, f.name), omitBackground: !!f.transparent });
    await page.close();
    console.log('wrote', f.name);
  }
  await browser.close();
})();
