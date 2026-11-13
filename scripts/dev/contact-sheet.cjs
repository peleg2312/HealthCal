// Tiles a folder of screenshots into one overview image.
//   node scripts/dev/contact-sheet.cjs <dir> <out.png> [columns] [tileWidth] [maxTileHeight]
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const [dir, out, cols = '4', tileW = '300', maxH = '640'] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f) && !f.startsWith('_')).sort();
const html = `<html><body style="margin:0;background:#0b0d12;font-family:system-ui;color:#cfd6e4">
<div style="display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:18px;padding:18px">
${files
  .map(
    (f) => `<div><div style="font-size:12px;margin-bottom:6px;opacity:.8">${f.replace(/\.png$/, '')}</div>
<div style="width:${tileW}px;max-height:${maxH}px;overflow:hidden;border-radius:18px;border:1px solid #232936">
<img src="file://${path.resolve(dir, f)}" style="width:${tileW}px;display:block"/></div></div>`,
  )
  .join('')}
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(cols) * (Number(tileW) + 18) + 18, height: 800 } });
  const tmp = path.join(dir, '_sheet.html');
  fs.writeFileSync(tmp, html);
  await page.goto(`file://${tmp}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: true });
  fs.unlinkSync(tmp);
  await browser.close();
  console.log('wrote', out);
})();
