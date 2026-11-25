/**
 * A month's or a year's share card as flat drawing primitives (360 x 640 card units, a 1080 x 1920 image), the
 * same design as the recap screen's cups (`gridPrims`, @/features/recap/grid): the title, the headline in words,
 * the period in cups, then the stats and, when chosen, the foods logged most. Pure, like `scene.ts`.
 */
import { columnCentre, gridGeometry, gridPrims, rowTop } from '@/features/recap/grid';

import type { PeriodCardContent } from './periodContent';
import { mark, statRow, wrap, type CardColors, type Prim, type Scene } from './scene';

export const PERIOD_SIZE = { width: 360, height: 640 };

const PAD = 28;
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function periodScene(content: PeriodCardContent, c: CardColors): Scene {
  const { width: W, height: H } = PERIOD_SIZE;
  const inner = W - 2 * PAD;
  const prims: Prim[] = [{ k: 'rect', x: 0, y: 0, w: W, h: H, fill: c.bg }];

  prims.push({ k: 'text', x: PAD, y: 54, runs: [{ text: content.overline, font: 'bold', size: 11, fill: c.textSecondary, letterSpacing: 1.3 }] });
  prims.push({ k: 'text', x: PAD, y: 96, runs: [{ text: content.title, font: 'extrabold', size: 40, fill: c.text, letterSpacing: -1.2 }] });
  // The last two words share a line, so the headline never ends on one word alone ("far.").
  const lines = wrap(content.headline.replace(/ (\S+)$/, '\u00A0$1'), inner, 19, 'display', 2);
  lines.forEach((line, i) => prims.push({ k: 'text', x: PAD, y: 128 + i * 24, runs: [{ text: line, font: 'display', size: 19, fill: c.text, letterSpacing: -0.2 }] }));

  // From the bottom up: the mark, the foods, the stats; the cups take the room left between them and the headline.
  const footerTop = H - 56;
  const foodLines = content.foods ? wrap(content.foods, inner, 13.5, 'regular', 2) : [];
  const foodsH = foodLines.length ? 22 + foodLines.length * 19 : 0;
  const statRows = content.stats.length ? Math.ceil(content.stats.length / (content.stats.length === 4 ? 2 : 3)) : 0;
  const statsH = statRows ? 16 + statRows * 64 - 6 : 0;
  const statsTop = footerTop - 12 - foodsH - (foodsH ? 18 : 0) - statsH;
  const gridTop = 128 + (lines.length - 1) * 24 + 30;
  const room = Math.max(80, statsTop - 24 - gridTop);
  const g = gridGeometry(content.kind, content.rows.length, inner, { maxHeight: room });
  const gy = gridTop + Math.max(0, Math.round((room - g.height) / 2));

  if (content.kind === 'month') {
    WEEKDAY_LETTERS.forEach((l, i) =>
      prims.push({ k: 'text', x: PAD + columnCentre(g, i), y: gy + 12, anchor: 'middle', runs: [{ text: l, font: 'bold', size: 11, fill: c.textSecondary }] }),
    );
  } else {
    content.rows.forEach((row, i) =>
      prims.push({ k: 'text', x: PAD, y: gy + rowTop(g, i) + g.top + g.cupH / 2 + 4, runs: [{ text: row.label, font: 'semibold', size: 11, fill: c.textSecondary }] }),
    );
  }
  prims.push(...gridPrims(c, g, content.rows, c.bg, PAD, gy));

  let y = statsTop;
  if (content.stats.length) {
    prims.push({ k: 'rect', x: PAD, y, w: inner, h: 1, fill: c.border });
    y += 16;
    const row = statRow(c, content.stats, PAD, y, inner);
    prims.push(...row.prims);
    y += row.height;
  }
  if (foodLines.length) {
    y += 18 + 4;
    prims.push({ k: 'text', x: PAD, y, runs: [{ text: 'LOGGED MOST', font: 'bold', size: 10.5, fill: c.textSecondary, letterSpacing: 1.2 }] });
    foodLines.forEach((line, i) => prims.push({ k: 'text', x: PAD, y: y + 20 + i * 19, runs: [{ text: line, font: 'regular', size: 13.5, fill: c.text }] }));
  }

  prims.push(...mark(c, PAD, H - 30));
  if (content.inProgress) {
    prims.push({ k: 'text', x: W - PAD, y: H - 31, anchor: 'end', runs: [{ text: content.kind === 'month' ? 'Month in progress' : 'Year in progress', font: 'semibold', size: 12, fill: c.textSecondary }] });
  }
  return { width: W, height: H, prims };
}
