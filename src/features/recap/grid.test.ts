import { describe, expect, it } from 'vitest';

import { cupLeft, gridGeometry, gridPrims, rowPrims, rowTop, type GridColors } from './grid';
import { cupCell, monthPeriod, monthRows, yearPeriod, yearRows, type DayFacts } from './period';

const C: GridColors = { calories: '#c', rim: '#r', warning: '#w', vesselEdge: '#e', vesselEmpty: '#m', dashEdge: '#d', text: '#t' };
const day = (date: string, kcal: number, complete = true): DayFacts => ({ date, logged: kcal > 0, complete, kcal, budget: 2000 });

describe('grid geometry', () => {
  it('fits a year’s 31 days and the month names in the width, at every phone width', () => {
    for (const w of [248, 286, 316, 486]) {
      const g = gridGeometry('year', 12, w);
      expect(cupLeft(g, 30) + g.cupW).toBeLessThanOrEqual(w);
      expect(cupLeft(g, 0)).toBeGreaterThanOrEqual(g.labelW);
      // Room between neighbours, and the cups taller than wide (tumblers).
      expect(g.slot - g.cupW).toBeGreaterThanOrEqual(1.5);
      expect(g.cupH).toBeGreaterThan(g.cupW);
    }
  });

  it('fits a month’s weeks, and shrinks the cups to a share card’s room', () => {
    const g = gridGeometry('month', 6, 304);
    expect(cupLeft(g, 6) + g.cupW).toBeLessThanOrEqual(304);
    const tight = gridGeometry('month', 6, 304, { maxHeight: 220 });
    expect(tight.height).toBeLessThanOrEqual(220);
    const year = gridGeometry('year', 12, 304, { maxHeight: 200 });
    expect(year.height).toBeLessThanOrEqual(200);
  });

  it('stacks rows by their own height and gap', () => {
    const g = gridGeometry('month', 5, 286);
    expect(rowTop(g, 0)).toBe(g.headerH);
    expect(rowTop(g, 1)).toBe(g.headerH + g.rowH + g.rowGap);
    expect(g.height).toBe(rowTop(g, 4) + g.rowH);
  });
});

describe('row layers', () => {
  const today = '2026-11-25';
  it('draws a fill with its level line, amber at the top of a day above budget, and the check on a day on budget', () => {
    const rows = monthRows(monthPeriod('2026-11'), new Map([['2026-11-02', day('2026-11-02', 1900)], ['2026-11-03', day('2026-11-03', 2400)]].map(([k, v]) => [k as string, v as DayFacts])), today, '2026-11-01');
    const g = gridGeometry('month', rows.length, 286);
    const week = rowPrims(C, g, rows[1], '#bg');
    // Monday's fill (95%) and Tuesday's (full), each with a level line on top.
    expect(week.fills.filter((p) => p.k === 'rect' && p.fill === '#c')).toHaveLength(2);
    expect(week.fills.filter((p) => p.k === 'rect' && p.fill === '#r')).toHaveLength(2);
    // Tuesday is above its budget: amber across its own width; Monday is on budget: the check.
    const amber = week.marks.filter((p) => p.k === 'rect' && p.fill === '#w');
    expect(amber).toHaveLength(1);
    expect(amber[0].k === 'rect' && amber[0].w).toBe(g.cupW);
    expect(week.marks.filter((p) => p.k === 'path' && p.stroke === '#t')).toHaveLength(1);
    // Every drawn cup has its empty inside, its corners and its outline.
    expect(week.under).toHaveLength(7);
    expect(week.frame.filter((p) => p.k === 'path' && p.stroke === '#e')).toHaveLength(7);
  });

  it('draws days to come dashed, with no inside, and never a check in a year', () => {
    const rows = monthRows(monthPeriod('2026-11'), new Map(), today, '2026-11-01');
    const g = gridGeometry('month', rows.length, 286);
    const last = rowPrims(C, g, rows[rows.length - 1], '#bg');
    expect(last.frame.filter((p) => p.k === 'path' && p.stroke === '#d').length).toBeGreaterThan(0);
    const year = yearRows(yearPeriod('2026'), new Map([['2026-11-02', day('2026-11-02', 1900)]]), today, '2026-11-01');
    const yg = gridGeometry('year', year.length, 286);
    expect(rowPrims(C, yg, year[0], '#bg').marks).toEqual([]);
  });

  it('draws today hatched and a partly logged day in the lighter fill', () => {
    const cells = [cupCell(today, day(today, 800, false), today), cupCell('2026-11-24', day('2026-11-24', 400, false), today)];
    const g = gridGeometry('month', 1, 286);
    const layers = rowPrims(C, g, { key: 'x', label: '', cells }, '#bg');
    expect(layers.fills.some((p) => p.k === 'clip')).toBe(true);
    expect(layers.fills.some((p) => p.k === 'rect' && p.fill === '#c' && p.opacity === 0.45)).toBe(true);
  });

  it('puts every layer of every row in one picture for the image, bottom layer first', () => {
    const rows = yearRows(yearPeriod('2026'), new Map(), today, '2026-09-01');
    const g = gridGeometry('year', rows.length, 304);
    const all = gridPrims(C, g, rows, '#bg', 28, 200);
    expect(all[0]).toMatchObject({ k: 'path', fill: '#m' });
    expect(all.length).toBeGreaterThan(rows.length * 28);
  });
});
