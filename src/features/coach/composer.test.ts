import { describe, expect, it } from 'vitest';

import { composerLines, COMPOSER_MAX_LINES, composerMode, sendActive } from './composer';

describe('composerLines', () => {
  it('one line for nothing or a short question', () => {
    expect(composerLines('', 240)).toBe(1);
    expect(composerLines('How many rest days?', 240)).toBe(1);
  });
  it('grows with breaks and long text, up to five', () => {
    expect(composerLines('a\nb\nc', 240)).toBe(3);
    expect(composerLines('x'.repeat(60), 240)).toBe(3);
    expect(composerLines('x'.repeat(500), 240)).toBe(COMPOSER_MAX_LINES);
    expect(composerLines('\n\n\n\n\n\n\n', 240)).toBe(COMPOSER_MAX_LINES);
  });
  it('one line while the field has not been measured yet, so an empty field is never taller', () => {
    expect(composerLines('', 0)).toBe(1);
    expect(composerLines('', -28)).toBe(1);
  });
});

describe('composerMode (X11)', () => {
  it('signed in sends; a backend with nobody signed in goes to sign-in; no backend is off', () => {
    expect(composerMode({ backend: true, signedIn: true })).toBe('send');
    expect(composerMode({ backend: true, signedIn: false })).toBe('sign-in');
    expect(composerMode({ backend: false, signedIn: false })).toBe('off');
    expect(composerMode({ backend: false, signedIn: true })).toBe('off');
  });
});

describe('sendActive (X8)', () => {
  it('is the filled cup only with words and a tap that does something', () => {
    expect(sendActive('send', '', false)).toBe(false);
    expect(sendActive('send', '   ', false)).toBe(false);
    expect(sendActive('send', 'Rest days?', false)).toBe(true);
    expect(sendActive('send', 'Rest days?', true)).toBe(false);
    expect(sendActive('sign-in', 'Rest days?', false)).toBe(true);
    expect(sendActive('sign-in', '', false)).toBe(false);
    expect(sendActive('off', 'Rest days?', false)).toBe(false);
  });
});
