import { describe, expect, it } from 'vitest';

import { backClosesSheet, heldWrites, OWN_BACK_MS, ownBacks } from './sheetHistory';

describe('ownBacks (the app\'s own steps back)', () => {
  it('a step back is pending until its popstate arrives, and that popstate is counted once', () => {
    const log = ownBacks();
    expect(log.pending(0)).toBe(false);
    log.made(0);
    expect(log.pending(5)).toBe(true);
    expect(log.arrived(8)).toBe(true);
    expect(log.pending(9)).toBe(false);
    // The next popstate is the person's own Back.
    expect(log.arrived(500)).toBe(false);
  });
  it('two closing sheets: two steps, each popstate counted off in turn', () => {
    const log = ownBacks();
    log.made(0);
    log.made(1);
    expect(log.arrived(4)).toBe(true);
    expect(log.pending(4)).toBe(true);
    expect(log.arrived(6)).toBe(true);
    expect(log.pending(6)).toBe(false);
    expect(log.arrived(7)).toBe(false);
  });
  it('a step whose popstate never came is forgotten, so a later Back is the person\'s', () => {
    const log = ownBacks();
    log.made(0);
    expect(log.pending(OWN_BACK_MS)).toBe(true);
    expect(log.pending(OWN_BACK_MS + 1)).toBe(false);
    log.made(2000);
    expect(log.arrived(2000 + OWN_BACK_MS + 1)).toBe(false);
  });
});

describe('backClosesSheet', () => {
  const open = { own: false, pushed: true, closing: false, token: 7 };
  it("the person's Back from the sheet's own entry closes it", () => {
    expect(backClosesSheet({ ...open, at: undefined })).toBe(true);
    // Back to the entry of a sheet opened before it (stacked under it).
    expect(backClosesSheet({ ...open, at: 3 })).toBe(true);
  });
  it('still on its own entry, or on the entry of a sheet opened over it: stays open', () => {
    expect(backClosesSheet({ ...open, at: 7 })).toBe(false);
    expect(backClosesSheet({ ...open, at: 9 })).toBe(false);
  });
  it("the app's own step back never closes it, wherever it lands", () => {
    expect(backClosesSheet({ ...open, own: true, at: undefined })).toBe(false);
    expect(backClosesSheet({ ...open, own: true, at: 3 })).toBe(false);
  });
  it('before the sheet has added its entry, no step closes it', () => {
    expect(backClosesSheet({ ...open, pushed: false, at: undefined })).toBe(false);
  });
  it('a sheet already asked to close by one Back is not asked again', () => {
    expect(backClosesSheet({ ...open, closing: true, at: undefined })).toBe(false);
  });
});

/**
 * One tap closes sheet A and opens sheet B (Friends: a friend's sheet, "Remove friend", "Remove Sam?"), played
 * against a history of entries marked with the sheet that added each, as Sheet.tsx does on the web.
 */
describe('one tap closes sheet A and opens sheet B', () => {
  const PUSH_AFTER = 120;
  /** Millisecond by millisecond: A's step back is made at 0 and its popstate comes at `popAt` (never, for null). */
  function play(popAt: number | null) {
    const log = ownBacks();
    // The screen's entry, then sheet A's (token 1), which is current.
    const entries: (number | undefined)[] = [undefined, 1];
    let at = 1;
    const b = { token: 2, pushed: false, open: true };
    const popstate = (t: number) => {
      const own = log.arrived(t);
      if (b.open && backClosesSheet({ own, pushed: b.pushed, closing: false, at: entries[at], token: b.token })) b.open = false;
    };
    // The tap: A's clean-up steps back; B opens with no entry yet and adds it a beat later, once no step of the app's own is on its way.
    log.made(0);
    let pushAt = PUSH_AFTER;
    for (let t = 0; t <= 2000; t++) {
      if (t === pushAt && !b.pushed) {
        if (log.pending(t)) pushAt += 30;
        else {
          entries.splice(at + 1, entries.length, b.token);
          at += 1;
          b.pushed = true;
        }
      }
      if (t === popAt) {
        at -= 1;
        popstate(t);
      }
    }
    return {
      b,
      entries,
      at: () => at,
      back: (t: number) => {
        at -= 1;
        popstate(t);
      },
    };
  }
  it("B stays open on top of the screen's entry, and the person's Back then closes B on the same address", () => {
    for (const popAt of [2, 10, 119, 120, 121, 400, 999]) {
      const run = play(popAt);
      expect(run.b.open).toBe(true);
      expect(run.entries).toEqual([undefined, 2]);
      expect(run.at()).toBe(1);
      run.back(3000);
      expect(run.b.open).toBe(false);
      // Back took B's entry and left the screen's.
      expect(run.at()).toBe(0);
    }
  });
  it('a step back whose popstate never comes holds B\'s entry back for a second at most, and Back still closes B', () => {
    const run = play(null);
    expect(run.b.open).toBe(true);
    expect(run.b.pushed).toBe(true);
    run.back(3000);
    expect(run.b.open).toBe(false);
  });
});

describe('heldWrites (history writes wait for the app\'s own step back)', () => {
  it('runs a write at once when no step back is on its way', () => {
    const held = heldWrites();
    const done: string[] = [];
    expect(held.write(() => done.push('push /food/search'), false)).toBe(true);
    expect(done).toEqual(['push /food/search']);
    expect(held.waiting()).toBe(0);
  });
  it('holds writes while a step is on its way, then runs them in their order', () => {
    const held = heldWrites();
    const done: string[] = [];
    expect(held.write(() => done.push('push'), true)).toBe(false);
    // Made after the step has come but before the first ran: it waits behind it, so the order is kept.
    expect(held.write(() => done.push('replace'), false)).toBe(false);
    expect(done).toEqual([]);
    expect(held.waiting()).toBe(2);
    held.release();
    expect(done).toEqual(['push', 'replace']);
    expect(held.waiting()).toBe(0);
    expect(held.write(() => done.push('go'), false)).toBe(true);
    expect(done).toEqual(['push', 'replace', 'go']);
  });
});

/**
 * The tap on a sheet's row that opens a screen (the + sheet's "Search food"): the sheet's clean-up steps back
 * from its entry, and the router's move to the new screen comes some time after it, before or after the
 * step's popstate. The router never hears the step (Sheet.tsx stops it before anyone else does), and its move
 * waits while the step is on its way, so the screen's entry always lands on top of the screen it left.
 */
describe("a sheet's row that opens a screen", () => {
  function play(moveAt: number, popAt: number) {
    const backs = ownBacks();
    const held = heldWrites();
    // The screen's entry and the sheet's (on the same address), which is current.
    const entries = ['/', '/ sheet'];
    let at = 1;
    let routerHeard = 0;
    backs.made(0);
    for (let t = 0; t <= 1200; t++) {
      if (t === moveAt) held.write(() => {
        entries.splice(at + 1, entries.length, '/food/search');
        at += 1;
      }, backs.pending(t));
      if (t === popAt) {
        at -= 1;
        if (!backs.arrived(t)) routerHeard += 1;
        if (!backs.pending(t)) held.release();
      }
    }
    return { entries: entries.slice(0, at + 1), routerHeard };
  }
  it('the new screen lands on top of the one the sheet was over, whenever the move comes', () => {
    for (const [moveAt, popAt] of [[60, 5], [60, 59], [1, 5], [5, 300], [200, 900]]) {
      const run = play(moveAt, popAt);
      expect(run.entries).toEqual(['/', '/food/search']);
      expect(run.routerHeard).toBe(0);
    }
  });
});
