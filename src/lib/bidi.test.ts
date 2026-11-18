import { describe, expect, it } from 'vitest';

import { FSI, hasRtl, isolateRtl, leftToRightStart, LRM, PDI, startsRtl, withoutMarks } from './bidi';
import { keepTogether } from './text';

describe('isolateRtl', () => {
  it('returns Latin text unchanged', () => {
    for (const s of ['Cottage cheese, 5% fat', '1 cup (240 ml)', 'Café crème', 'Ελληνικά', 'Борщ', '寿司', '120 kcal', '🍕 Pizza', ' ']) {
      expect(isolateRtl(s)).toBe(s);
    }
  });

  it('returns the empty string unchanged', () => {
    expect(isolateRtl('')).toBe('');
  });

  it('wraps Hebrew in a left-to-right mark and an isolate', () => {
    expect(isolateRtl("קוטג' 5%")).toBe(`${LRM}${FSI}קוטג' 5%${PDI}`);
    expect(isolateRtl('1 גביע')).toBe(`${LRM}${FSI}1 גביע${PDI}`);
  });

  it('wraps text that mixes Latin and Hebrew', () => {
    expect(isolateRtl('Pita פיתה מקמח מלא')).toBe(`${LRM}${FSI}Pita פיתה מקמח מלא${PDI}`);
  });

  it('wraps Arabic and the presentation forms', () => {
    expect(isolateRtl('حمص')).toBe(`${LRM}${FSI}حمص${PDI}`);
    // U+FB2A HEBREW LETTER SHIN WITH SHIN DOT, U+FEFB ARABIC LIGATURE LAM WITH ALEF
    expect(isolateRtl('שׁ')).toBe(`${LRM}${FSI}שׁ${PDI}`);
    expect(isolateRtl('ﻻ')).toBe(`${LRM}${FSI}ﻻ${PDI}`);
  });

  it('wraps a string with only vowel points', () => {
    expect(hasRtl('ָ')).toBe(true);
  });
});

describe('startsRtl and leftToRightStart (the Text safety net)', () => {
  it('finds the first strong letter past digits, spaces, punctuation and emoji', () => {
    expect(startsRtl('פיתה')).toBe(true);
    expect(startsRtl('  2 ביצים')).toBe(true);
    expect(startsRtl('🥙 שווארמה')).toBe(true);
    expect(startsRtl('"חומוס"')).toBe(true);
    expect(startsRtl('حمص')).toBe(true);
  });

  it('answers false for a line that starts with a left-to-right letter', () => {
    expect(startsRtl('Pita פיתה')).toBe(false);
    expect(startsRtl('2 eggs')).toBe(false);
    expect(startsRtl('120')).toBe(false);
    expect(startsRtl('')).toBe(false);
    expect(startsRtl('· —')).toBe(false);
    expect(startsRtl('Ωmega חומוס')).toBe(false);
  });

  it('answers false for a string already isolated', () => {
    expect(startsRtl(isolateRtl('פיתה'))).toBe(false);
    expect(leftToRightStart(isolateRtl('פיתה'))).toBe(isolateRtl('פיתה'));
  });

  it('puts one left-to-right mark in front of a Hebrew or Arabic start, nothing else', () => {
    expect(leftToRightStart('פיתה')).toBe(`${LRM}פיתה`);
    expect(leftToRightStart('3 ביצים')).toBe(`${LRM}3 ביצים`);
    expect(leftToRightStart('Pita')).toBe('Pita');
    expect(leftToRightStart('Pita פיתה')).toBe('Pita פיתה');
  });

  it('leaves every English string of keepTogether exactly as keepTogether made it', () => {
    for (const s of ['2,304 kcal · P 102 g · C 258 g · F 95 g', '1.5 × 1/2 cup · 60 g', '59-79 kg', '68 fl oz', '4 full days']) {
      const kept = keepTogether(s);
      expect(leftToRightStart(kept)).toBe(kept);
    }
  });

  it('does not stop keepTogether from joining a number and its unit after the mark', () => {
    const marked = keepTogether(leftToRightStart('קוטג 250 g'));
    expect(marked).toBe(`${LRM}קוטג 250 g`);
  });
});

describe('withoutMarks', () => {
  it('gives back the raw text', () => {
    for (const s of ['קוטג\' 5%', 'Pita פיתה', 'Banana', '']) expect(withoutMarks(isolateRtl(s))).toBe(s);
    expect(withoutMarks(leftToRightStart('פיתה'))).toBe('פיתה');
  });
});
