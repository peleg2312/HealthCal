// Renders the app icon set from one SVG mark.
//
//   node scripts/dev/make-icons.cjs                     writes assets/images/*.png
//   node scripts/dev/make-icons.cjs --sheet=out.png     also writes a sheet of the icon at 180, 120, 60 and 29 px
//                                   [--old=dir]         ...next to the icon.png found in that folder (the previous one)
//
// The mark is the app's own cup, the Pour tumbler: straight sides and a round base, open at the
// top with no lip or flange (a flange is what makes a cup read as a lab beaker), a flat fill and
// the level line on it. The part above the fill is left as the tile shows through, so the cup
// reads as having room left, exactly as `vesselEmpty` does in the app. Flat colour only.
//
// Colours are the Blossom lead look: a raspberry tile (app.json's adaptive-icon background and
// notification colour), a champagne glass and level line, the tickle-pink fill.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', '..', 'assets', 'images');
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; }));

const C = {
  raspberry: '#C43670',
  pink: '#F283AF',
  champagne: '#FBF4EB',
  aubergine: '#3B1427',
  // The dark splash sits on the dark theme's bg (#121110) and uses that theme's cream line and persimmon fill.
  cream: '#F6EEE3',
  persimmon: '#FF9466',
};

// The cup on a 1024 canvas, centred: 560 wide, 656 tall, a 176 px base radius, a 68 px line.
// It is stockier than the app's hero vessel so that it reads as a drinking glass at 29 px, where
// tall walls above the fill start to look like a letter. `level` is the y of the level line; the
// fill runs from it to the base (62% full, so the room left above it still shows).
const CUP = { x0: 232, x1: 792, top: 167, bottom: 823, r: 176, w: 68, level: 413 };

function cup({ edge, line, fill, w = CUP.w }) {
  const { x0, x1, top, bottom, r, level } = CUP;
  const open = `M ${x0} ${top} V ${bottom - r} A ${r} ${r} 0 0 0 ${x0 + r} ${bottom} H ${x1 - r} A ${r} ${r} 0 0 0 ${x1} ${bottom - r} V ${top}`;
  return `
  <defs><clipPath id="in"><path d="${open} Z"/></clipPath></defs>
  <g clip-path="url(#in)"><rect x="0" y="${level}" width="1024" height="1024" fill="${fill}"/></g>
  <rect x="${x0}" y="${level - w / 2}" width="${x1 - x0}" height="${w}" fill="${line}"/>
  <path d="${open}" fill="none" stroke="${edge}" stroke-width="${w}"/>`;
}

const svg = (inner, { bg, scale = 1, radius = 0 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  ${bg ? `<rect width="1024" height="1024" rx="${radius}" fill="${bg}"/>` : ''}
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${inner}</g>
</svg>`;

const brand = (w) => cup({ edge: C.champagne, line: C.champagne, fill: C.pink, w });
const white = cup({ edge: '#FFFFFF', line: '#FFFFFF', fill: '#FFFFFF' });

const files = [
  { name: 'icon.png', size: 1024, html: svg(brand(), { bg: C.raspberry }) },
  // Adaptive icons are masked to a circle or squircle. At 0.62 the whole cup, corners included,
  // sits inside the 66 dp safe circle and stands about 63% of the visible height.
  { name: 'android-icon-foreground.png', size: 1024, html: svg(brand(), { scale: 0.62 }), transparent: true },
  { name: 'android-icon-background.png', size: 1024, html: svg('', { bg: C.raspberry }) },
  // Themed icons are tinted by the launcher: the glass, the level line and a solid fill below it.
  { name: 'android-icon-monochrome.png', size: 1024, html: svg(white, { scale: 0.62 }), transparent: true },
  // Small sizes need heavier lines to stay crisp; the tile gets round corners in a browser tab.
  { name: 'favicon.png', size: 96, html: svg(brand(84), { bg: C.raspberry, radius: 220, scale: 1.06 }), transparent: true },
  // The splash draws the cup alone on app.json's background, 96 dp wide. On the oat paper it is
  // the Blossom cup (raspberry line, pink fill); on the dark background the dark theme's cup.
  // At 0.7 the cup also fits the circle Android 12 and later crop a splash icon to (two thirds of the image).
  { name: 'splash-icon.png', size: 512, html: svg(cup({ edge: C.raspberry, line: C.raspberry, fill: C.pink }), { scale: 0.7 }), transparent: true },
  { name: 'splash-icon-dark.png', size: 512, html: svg(cup({ edge: C.cream, line: C.cream, fill: C.persimmon }), { scale: 0.7 }), transparent: true },
];

async function sheet(browser, out, oldDir) {
  const data = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const icons = [];
  if (oldDir && fs.existsSync(path.join(oldDir, 'icon.png'))) icons.push(['Before', data(path.join(oldDir, 'icon.png'))]);
  icons.push(['Now', data(path.join(OUT, 'icon.png'))]);
  const sizes = [180, 120, 60, 29];
  const group = ([label, src]) => `
    <div><div style="font:600 13px system-ui;margin-bottom:10px;opacity:.7">${label}</div>
    <div style="display:flex;align-items:flex-end;gap:16px">${sizes
      .map((s) => `<div style="text-align:center"><img src="${src}" width="${s}" height="${s}" style="display:block;border-radius:${Math.round(s * 0.225)}px"/><div style="font:11px system-ui;margin-top:6px;opacity:.6">${s}</div></div>`)
      .join('')}</div></div>`;
  const band = (bg, fg) => `<div style="background:${bg};color:${fg};padding:26px 30px;display:flex;gap:56px">${icons.map(group).join('')}</div>`;
  const splash = (name, bg, fg, label) => `
    <div style="background:${bg};color:${fg};width:200px;height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      <img src="${data(path.join(OUT, name))}" width="96" height="96"/><div style="font:11px system-ui;opacity:.6">${label}</div></div>`;
  const mono = (bg, tint, label) => `
    <div style="text-align:center"><div style="width:96px;height:96px;border-radius:48px;background:${bg};overflow:hidden;position:relative">
      <div style="position:absolute;left:-24px;top:-24px;width:144px;height:144px;background:${tint};-webkit-mask:url(${data(path.join(OUT, 'android-icon-monochrome.png'))}) center/contain no-repeat"></div></div>
      <div style="font:11px system-ui;margin-top:6px;opacity:.6">${label}</div></div>`;
  const adaptive = (label, r) => `
    <div style="text-align:center"><div style="width:96px;height:96px;border-radius:${r};background:${C.raspberry};overflow:hidden;position:relative">
      <img src="${data(path.join(OUT, 'android-icon-foreground.png'))}" style="position:absolute;left:-24px;top:-24px;width:144px;height:144px"/></div>
      <div style="font:11px system-ui;margin-top:6px;opacity:.6">${label}</div></div>`;
  const page = await browser.newPage({ viewport: { width: 980, height: 600 }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0;background:#8A8F98">
    ${band('#FFFFFF', '#111111')}${band('#000000', '#EEEEEE')}
    <div style="background:#E9EBEF;color:#111;padding:26px 30px;display:flex;gap:28px;align-items:flex-end">
      ${adaptive('Android, circle', '48px')}${adaptive('Android, squircle', '30px')}
      ${mono('#D7E3FF', '#001A41', 'Themed, light')}${mono('#2B3A55', '#D7E3FF', 'Themed, dark')}
      <div style="text-align:center"><img src="${data(path.join(OUT, 'favicon.png'))}" width="32" height="32" style="display:block;margin:0 auto"/><div style="font:11px system-ui;margin-top:6px;opacity:.6">Favicon 32</div></div>
      <div style="text-align:center"><img src="${data(path.join(OUT, 'favicon.png'))}" width="16" height="16" style="display:block;margin:0 auto"/><div style="font:11px system-ui;margin-top:6px;opacity:.6">16</div></div>
      ${splash('splash-icon.png', '#F4EEE5', '#211913', 'Splash, light')}${splash('splash-icon-dark.png', '#121110', '#F6EEE3', 'Splash, dark')}
    </div></body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log('wrote', out);
}

(async () => {
  const browser = await chromium.launch();
  for (const f of files) {
    const page = await browser.newPage({ viewport: { width: f.size, height: f.size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${f.html}</body></html>`);
    await page.screenshot({ path: path.join(OUT, f.name), omitBackground: !!f.transparent });
    await page.close();
    console.log('wrote', f.name);
  }
  if (args.sheet) await sheet(browser, path.resolve(String(args.sheet)), args.old ? path.resolve(String(args.old)) : null);
  await browser.close();
})();
