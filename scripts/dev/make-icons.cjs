// Renders the app icon set from one SVG mark. Run: node scripts/dev/make-icons.cjs
const { chromium } = require('playwright');
const path = require('node:path');

const OUT = path.join(__dirname, '..', '..', 'assets', 'images');

// An open progress ring with its leading dot: reads as progress, and as the C in Cal.
const mark = (stroke, { mono = false } = {}) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${mono ? '#FFFFFF' : '#C6F26B'}"/>
      <stop offset="1" stop-color="${mono ? '#FFFFFF' : '#3DE0A2'}"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="30" fill="none" stroke="${mono ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.09)'}" stroke-width="${stroke}"/>
  <circle cx="50" cy="50" r="30" fill="none" stroke="url(#g)" stroke-width="${stroke}" stroke-linecap="round"
          stroke-dasharray="${2 * Math.PI * 30 * 0.72} ${2 * Math.PI * 30}" transform="rotate(-90 50 50)"/>
  <circle cx="50" cy="50" r="8.5" fill="${mono ? '#FFFFFF' : '#C6F26B'}"/>`;

const svg = (inner, { bg, scale = 1 }) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${inner}</g>
</svg>`;

const files = [
  { name: 'icon.png', size: 1024, html: svg(mark(11), { bg: '#0A0C10', scale: 1.05 }) },
  { name: 'android-icon-foreground.png', size: 1024, html: svg(mark(11), { scale: 0.66 }), transparent: true },
  { name: 'android-icon-background.png', size: 1024, html: svg('', { bg: '#0A0C10' }) },
  { name: 'android-icon-monochrome.png', size: 1024, html: svg(mark(11, { mono: true }), { scale: 0.66 }), transparent: true },
  { name: 'splash-icon.png', size: 512, html: svg(mark(11), { scale: 1.2 }), transparent: true },
  { name: 'favicon.png', size: 96, html: svg(mark(13), { bg: '#0A0C10', scale: 1.15 }) },
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
