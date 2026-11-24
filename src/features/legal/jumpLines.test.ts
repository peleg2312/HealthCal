import { describe, expect, it } from 'vitest';

import { jumpLabel, PRIVACY, TERMS } from './content';
import { jumpLines, jumpWidth } from './jumpLines';

/** The chips of a page as the screen lays them out in a column `room` px wide. */
const lay = (doc: typeof TERMS, room: number) => {
  const sections = doc.sections.filter((s) => !(doc.id === 'privacy' && s.id === 'short'));
  const widths = sections.map((s) => jumpWidth(jumpLabel(s), room));
  return { widths, lines: jumpLines(widths, room) };
};
const span = (widths: number[], line: number[]) => line.reduce((s, i) => s + widths[i], 0) + 8 * (line.length - 1);

describe('jumpLines', () => {
  it('keeps every chip once, in order', () => {
    for (const doc of [TERMS, PRIVACY]) {
      for (const room of [280, 320, 350, 520]) {
        const { widths, lines } = lay(doc, room);
        expect(lines.flat()).toEqual(widths.map((_, i) => i));
      }
    }
    expect(jumpLines([], 320)).toEqual([]);
    expect(jumpLines([100], 320)).toEqual([[0]]);
  });

  it('sits two or three chips to a line at 360 and 390 px, on both pages', () => {
    for (const doc of [TERMS, PRIVACY]) {
      for (const room of [320, 350]) {
        const { widths, lines } = lay(doc, room);
        for (const line of lines) {
          expect(line.length, `${doc.id} at ${room}`).toBeGreaterThanOrEqual(2);
          expect(line.length).toBeLessThanOrEqual(3);
          expect(span(widths, line)).toBeLessThanOrEqual(room);
        }
      }
    }
  });

  it('at 320 px leaves a chip alone only where it fits beside neither neighbour, and never last', () => {
    for (const doc of [TERMS, PRIVACY]) {
      const { widths, lines } = lay(doc, 280);
      const lone = lines.filter((l) => l.length === 1).map((l) => l[0]);
      expect(lone.length, doc.id).toBeLessThanOrEqual(1);
      expect(lines[lines.length - 1].length).toBeGreaterThanOrEqual(2);
      for (const line of lines) if (line.length > 1) expect(span(widths, line)).toBeLessThanOrEqual(280);
    }
  });

  it('prefers no lone chip to fewer lines, and fewer lines to anything else', () => {
    // A plain wrap gives [a b] [c d] [e]; one line more of pairs is not possible, so the last three share: [a b] [c d e] or [a b c] [d e].
    expect(jumpLines([100, 100, 100, 100, 100], 324).map((l) => l.length)).toEqual([3, 2]);
    // Four that fit two to a line: two lines, never three.
    expect(jumpLines([150, 150, 150, 150], 320).map((l) => l.length)).toEqual([2, 2]);
    // A chip as wide as the room has its own line.
    expect(jumpLines([320, 100, 100], 320).map((l) => l.length)).toEqual([1, 2]);
  });
});

describe('jump labels', () => {
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  it('are one to three words, each a word of the section’s own heading, and shorter than it', () => {
    let count = 0;
    for (const doc of [TERMS, PRIVACY]) {
      for (const s of doc.sections) {
        if (s.jump === undefined) continue;
        count += 1;
        const own = new Set(words(s.heading));
        expect(words(s.jump).length, s.heading).toBeGreaterThanOrEqual(1);
        expect(words(s.jump).length, s.heading).toBeLessThanOrEqual(3);
        for (const w of words(s.jump)) expect(own.has(w), `"${s.jump}" for "${s.heading}": ${w}`).toBe(true);
        expect(s.jump.length).toBeLessThan(s.heading.length);
        expect(s.jump).toMatch(/^[A-Z]/);
        expect(s.jump).not.toMatch(/[.!?]/);
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it('never turn a heading round: a "Not" or "No" in the heading stays in its label', () => {
    for (const doc of [TERMS, PRIVACY]) {
      for (const s of doc.sections) if (/^(Not|No)\b/.test(s.heading)) expect(jumpLabel(s)).toMatch(/^(Not|No)\b/);
    }
  });

  it('give every section a label of 20 letters or fewer, so two fit a line at 360 px', () => {
    for (const doc of [TERMS, PRIVACY]) for (const s of doc.sections) expect(jumpLabel(s).length, s.heading).toBeLessThanOrEqual(20);
  });

  it('are unique on their page', () => {
    for (const doc of [TERMS, PRIVACY]) {
      const labels = doc.sections.map(jumpLabel);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
