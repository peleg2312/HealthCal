import { describe, expect, it } from 'vitest';

import { foldPush, lastWordsTogether, nameTogether } from './lines';
import { ACCOUNT_UPLOAD_LINE, GOOGLE_INBOX_HINT, GOOGLE_LABEL, GOOGLE_WAITING, RESET_CHECKING, RESTORING } from './words';

const NBSP = ' ';
/** The pieces a browser may break the line between. */
const pieces = (s: string) => s.split(' ');

describe('lastWordsTogether', () => {
  it('joins the last two words, so a wrapped line never ends on one word alone', () => {
    expect(lastWordsTogether('Your plan and logs come next.')).toBe(`Your plan and logs come${NBSP}next.`);
    for (const line of [ACCOUNT_UPLOAD_LINE, GOOGLE_WAITING.body, RESET_CHECKING.body, RESTORING.body]) {
      const last = pieces(lastWordsTogether(line)).pop() ?? '';
      expect(last.split(NBSP).length, line).toBe(2);
    }
  });

  it('keeps every word and every other break', () => {
    const line = 'Bringing your plan and logs to this device.';
    expect(lastWordsTogether(line).split(NBSP).join(' ')).toBe(line);
    expect(pieces(lastWordsTogether(line)).length).toBe(pieces(line).length - 1);
    expect(pieces(lastWordsTogether(line, 3)).length).toBe(pieces(line).length - 2);
  });

  it('leaves a line of one or two words as it is', () => {
    expect(lastWordsTogether('Signed in')).toBe('Signed in');
    expect(lastWordsTogether('Syncing')).toBe('Syncing');
    expect(lastWordsTogether('')).toBe('');
    expect(lastWordsTogether('One two three', 1)).toBe('One two three');
  });
});

describe('nameTogether', () => {
  it("keeps a button's name on one line, so the inbox hint never ends on \"Google.\" alone", () => {
    const hint = nameTogether(GOOGLE_INBOX_HINT, GOOGLE_LABEL);
    expect(hint.split(NBSP).join(' ')).toBe(GOOGLE_INBOX_HINT);
    expect(pieces(hint).pop()).toBe(`Continue${NBSP}with${NBSP}Google.`);
  });

  it('changes nothing when the name is not in the line', () => {
    expect(nameTogether('Open it to confirm your email.', GOOGLE_LABEL)).toBe('Open it to confirm your email.');
    expect(nameTogether('Open it.', '')).toBe('Open it.');
  });
});

describe('foldPush: the terms block is seen whole or not at all', () => {
  const FOLD = 487; // the scroll area of the sign-in form at 320 x 640

  it('leaves a block that ends above the fold, or starts under it, where it is', () => {
    expect(foldPush(380, 59, FOLD)).toBe(0);
    expect(foldPush(428, 59, FOLD)).toBe(0); // ends exactly on the fold
    expect(foldPush(487, 59, FOLD)).toBe(0); // starts exactly on it
    expect(foldPush(520, 59, FOLD)).toBe(0);
  });

  it('pushes a block the fold would cut down to the fold, whether it cuts the sentence or the links', () => {
    expect(foldPush(450, 59, FOLD)).toBe(37); // the fold between the sentence and its links
    expect(foldPush(480, 59, FOLD)).toBe(7); // the fold through the first line
    expect(foldPush(429, 59, FOLD)).toBe(58); // one pixel of the links under the fold
  });

  it('is steady: the block is measured without its push, so the same numbers give the same push again', () => {
    // The component measures the block's own top (its wrapper's, whose padding is the push) and its own height.
    const top = 450;
    const first = foldPush(top, 59, FOLD);
    expect(foldPush(top, 59, FOLD)).toBe(first);
    // Once pushed, the block starts on the fold and nothing of it is above.
    expect(top + first).toBe(FOLD);
  });

  it('does nothing before layout is known, or for a block taller than the first view', () => {
    expect(foldPush(450, 59, 0)).toBe(0);
    expect(foldPush(450, 0, FOLD)).toBe(0);
    expect(foldPush(100, 600, FOLD)).toBe(0);
  });
});
