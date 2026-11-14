import { describe, expect, it } from 'vitest';

import { formatVolume } from '@/lib/units';

import { formatWaterLeft, shownMl, volumeNumber, volumeUnitFor, waterLeftMl } from './volume';

describe('water left adds up to the goal shown', () => {
  it('metric: 1.23 L drunk and 2.07 L left make the 3.3 L goal', () => {
    // 1,225 ml prints as 1.23 L; the separately rounded 2,075 ml would print 2.08 L (sum 3.31).
    expect(formatVolume(1225, 'metric')).toBe('1.23 L');
    expect(formatWaterLeft(1225, 3300, 'metric')).toBe('2.07 L');
  });
  it('imperial: 41 and 71 fl oz make the 112 fl oz goal', () => {
    expect(formatVolume(1225, 'imperial')).toBe('41 fl oz');
    expect(formatVolume(3300, 'imperial')).toBe('112 fl oz');
    expect(formatWaterLeft(1225, 3300, 'imperial')).toBe('71 fl oz');
  });
  it('keeps the sum exact across ml and litres', () => {
    expect(formatWaterLeft(995, 2600, 'metric')).toBe('1.605 L');
    expect(formatWaterLeft(250, 2550, 'metric')).toBe('2.3 L');
    expect(formatWaterLeft(1800, 2550, 'metric')).toBe('750 ml');
  });
  it('is never below zero', () => {
    expect(waterLeftMl(3500, 3300, 'metric')).toBe(0);
    expect(formatWaterLeft(3500, 3300, 'imperial')).toBe('0 fl oz');
  });
  it('reads a shown amount back in ml', () => {
    expect(shownMl(1225, 'metric')).toBe(1230);
    expect(shownMl(225, 'metric')).toBe(225);
  });
  it('rounds as the printed text does, so drunk, extra and goal agree', () => {
    // 3.425 is stored just under the half, so it prints 3.42 L: the extra over 3.3 L is 120 ml, not 130.
    expect(formatVolume(3425, 'metric')).toBe('3.42 L');
    expect(shownMl(3425, 'metric')).toBe(3420);
    expect(shownMl(3425, 'metric') - shownMl(3300, 'metric')).toBe(120);
    expect(formatWaterLeft(1235, 3300, 'metric')).toBe(`${Number((3.3 - Number(formatVolume(1235, 'metric').split(' ')[0])).toFixed(3))} L`);
  });
});

describe('volumeNumber', () => {
  it('ticks in the final unit', () => {
    expect(volumeNumber(980, 1230, 'metric')).toBe('0.98');
    expect(volumeNumber(1230, 1230, 'metric')).toBe('1.23');
    expect(volumeNumber(250, 500, 'metric')).toBe('250');
    expect(volumeNumber(200, 250, 'imperial')).toBe('6.8');
    expect(volumeNumber(1225, 1225, 'imperial')).toBe('41');
  });
  it('names the unit formatVolume prints', () => {
    expect(volumeUnitFor(1230, 'metric')).toBe('L');
    expect(volumeUnitFor(250, 'metric')).toBe('ml');
    expect(volumeUnitFor(250, 'imperial')).toBe('fl oz');
  });
});
