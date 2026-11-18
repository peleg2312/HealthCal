import { describe, expect, it } from 'vitest';

import { morningTitle, morningTitleRoom } from './greeting';

describe('morningTitleRoom', () => {
  it('leaves the gutters, the X, the share button and two gaps', () => {
    expect(morningTitleRoom(360)).toBe(208);
    expect(morningTitleRoom(320)).toBe(168);
    expect(morningTitleRoom(390)).toBe(238);
    expect(morningTitleRoom(1200)).toBe(408);
  });
});

describe('morningTitle', () => {
  it('keeps the name when the line fits (cases A to E at 360)', () => {
    expect(morningTitle('Good morning', 'Gilad', 360)).toEqual({ title: 'Good morning, Gilad', nameShown: true });
    expect(morningTitle('Good afternoon', 'Gilad', 360)).toEqual({ title: 'Good afternoon, Gilad', nameShown: true });
  });
  it('leaves the name out at 320 for the morning, keeps it for the evening', () => {
    expect(morningTitle('Good morning', 'Gilad', 320)).toEqual({ title: 'Good morning', nameShown: false });
    expect(morningTitle('Good evening', 'Gilad', 320)).toEqual({ title: 'Good evening, Gilad', nameShown: true });
  });
  it('with no name set nothing is left out (case F)', () => {
    expect(morningTitle('Good evening', '', 360)).toEqual({ title: 'Good evening', nameShown: true });
    expect(morningTitle('Good evening', null, 320)).toEqual({ title: 'Good evening', nameShown: true });
    expect(morningTitle('Good evening', '   ', 320)).toEqual({ title: 'Good evening', nameShown: true });
  });
  it('a long name never fits (case G)', () => {
    expect(morningTitle('Good morning', 'Maximiliana Rosenkranz', 390)).toEqual({ title: 'Good morning', nameShown: false });
  });
});
