/**
 * No shame and no comparison (principle 4): every fixed string of the Friends screens about meals, the feed
 * and privacy, and every line their functions build over a grid of inputs, passes the coach's banned list
 * (src/features/coach/words.test.ts, the morning page's list), the food words that judge, and the words
 * that rank or compare people; none has an exclamation mark, and each starts with a capital.
 */
import { describe, expect, it } from 'vitest';

import type { MealType } from '@/types';

import * as W from './words';

// The coach's list, word for word (src/features/coach/words.test.ts).
const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
// Food words that judge, and words that rank people or set them side by side.
const JUDGING = /\b(junk|clean eating|clean food|good food|healthy|unhealthy|naughty|sinful|guilt|treat yourself|indulg\w*|binge|diet)\b/i;
const COMPARING = /\b(more than|less than|fewer than|than you|than your|better|worse|best|worst|rank\w*|leader\w*|top|ahead|behind|beat|beats|winner|win|wins|compare\w*|versus|vs)\b/i;

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const TODAY = '2026-11-25';
const NAMES = [[], ['Maya'], ['Maya', 'Sam'], ['Maya', 'Sam', 'Jo'], ['Maya', 'Sam', 'Jo', 'Li', 'Dana']];

function strings(): string[] {
  const out: string[] = [];
  for (const v of Object.values(W)) if (typeof v === 'string') out.push(v);
  for (const m of MEALS) {
    out.push(W.mealChip(m), W.friendMealTitle('Maya', m), W.showTitle(m), W.stoppedToast(m), W.addFrom('Maya', m), W.addButton(0, m, 0), W.addButton(1, m, 75), W.addButton(3, m, 1240));
    for (const day of [TODAY, '2026-11-24', '2026-11-22', '2026-11-12']) {
      out.push(W.mealMeta(m, day, TODAY, 1), W.mealMeta(m, day, TODAY, 3), W.myMealTitle(m, day, TODAY));
      // A cheer's target is the end of a sentence ("Maya: your lunch"), so it starts in lower case.
      out.push(`Maya: ${W.mealCheerTarget({ day, meal: m }, TODAY)}`);
    }
    for (const n of NAMES) out.push(W.shownToast(m, n));
  }
  for (const n of NAMES) out.push(W.showButton(n), W.shownTo(n), W.audienceLine(n), W.myMealLine(n, 0, 6), W.myMealLine(n, 3, 1), W.aboutYouLine({ workouts: true, streak: true, minutes: true }, n.length, n, true));
  out.push(W.aboutYouLine({ workouts: false, streak: false, minutes: false }, 0, [], false), W.aboutYouLine({ workouts: true, streak: false, minutes: false }, 0, [], true));
  out.push(W.showLine(TODAY, TODAY, 3), W.cheersTitle(1), W.cheersTitle(4), `Maya: ${W.mealCheerTarget(undefined, TODAY)}`);
  out.push(W.cheersSummary([{ displayName: 'Maya', ref: 'a' }, { displayName: 'Sam', ref: 'a' }, { displayName: 'Jo', ref: 'b' }], (c) => (c.ref === 'a' ? 'your lunch' : 'your run')));
  for (const auto of [[], ['lunch'], ['breakfast', 'dinner'], MEALS] as MealType[][]) out.push(W.autoLine(auto));
  out.push(W.friendsSince('Nov 2'), W.friendsSince(null), W.mealsTheyShow('Maya'), W.seesMyMealsTitle('Maya'), W.seesMyMealsOn('Maya'), W.theirMealsOn('Maya'), W.weekOf('Maya'), W.theyShowYou('Maya'), W.manageTitle('Maya'), W.manageLine(true), W.manageLine(false), W.manageLine(true, true), W.manageLine(false, true), W.nothingShownYet('Maya'), W.theirMealsTitle('Maya'), W.removeNote('Maya'), W.addNote('Maya'));
  out.push(W.itemCaption({ portion: '1 bowl', kcal: 310, source: 'builtin' }, true), W.itemCaption({ portion: '1 bowl', kcal: 310, kcalLow: 250, source: 'ai' }, true), W.itemCaption({ portion: '1 bowl', source: 'builtin' }, false));
  out.push(W.friendSourceLabel('custom', 'Maya', 'Your food'), W.friendSourceLabel('builtin', 'Maya', 'Reference data'));
  for (const [f, n] of [[0, 0], [1, 0], [3, 2], [12, 1]]) out.push(W.feedNewsLine(f, n));
  for (const m of MEALS) {
    const what = W.itemWhat('Maya', { kind: 'meal', meal: m });
    out.push(W.showShortcutTitle(m), W.cheerCupLabel(what, false), W.cheerCupLabel(what, true), W.addCupLabel(what));
  }
  out.push(W.cheerCupLabel(W.itemWhat('Maya', { kind: 'workout', name: 'Running' }), false), W.cheersChipLabel(1), W.cheersChipLabel(3));
  for (const meals of [true, false]) {
    out.push(W.leaveNote(meals), W.leaveConfirm(meals), W.leftToast(meals), W.removeNote('Maya', meals), W.removeConfirm(meals), W.removedToast('Maya', meals), W.neverSharedLine(meals));
  }
  // Together, buddies, notes and saved meals.
  for (const kind of ['minutes', 'days'] as const) {
    out.push(W.togetherKindWord(kind), W.goalChoice(kind, 480), W.lastWeekLine(kind, 328, 600), W.goalSavedToast(kind, 480), W.countsLine(kind), W.togetherSpoken(kind, 412, 600, false), W.togetherSpoken(kind, 600, 600, true));
    for (const n of NAMES) out.push(W.circleInviteLine(kind, 600, n));
  }
  for (const n of NAMES) {
    out.push(W.circleNames(n), W.circleLine(n, 3, false), W.circleLine(n, 1, true), W.askButton(n), W.savedShownToast('Chicken bowl', n));
    if (n.length) out.push(W.askedLine(n), W.startedToast(n));
  }
  for (const d of [7, 2, 1, 0]) out.push(W.daysToGo(d));
  for (const n of [0, 1, 3]) out.push(W.cheeredEveryoneToast(n), W.buddyRunLine(n), W.buddyWeekLine(n, false), W.buddyWeekLine(n, true), W.borrowedToast('Maya’s lunch', n));
  for (const c of [null, 0, 1, 2] as const) out.push(W.buddyDaySpoken('Mon', c));
  for (const k of ['thinking_of_you', 'walk_later', 'nice_week'] as const) out.push(W.NOTE_WORDS[k], W.noteSentLine(k), W.noteButtonLabel(k, 'Maya', false), W.noteButtonLabel(k, 'Maya', true), `Maya ${W.noteReceived(k)}`);
  for (const [c, n] of [[3, 0], [0, 1], [2, 1], [1, 3]]) out.push(W.cheersNotesTitle(c, n), W.cheersNotesLabel(c, n));
  for (const on of [true, false]) out.push(W.notesFromToast('Maya', on), W.notesAllToast(on));
  out.push(W.circleInviteTitle('Maya'), W.declineCircleLabel('Maya'), W.circleDeclinedToast('Maya'), W.buddyAsk('Maya'), W.buddyAskButton('Maya'), W.buddyAskedToast('Maya'), W.buddyAskedTitle('Maya'), W.buddyInviteTitle('Maya'));
  out.push(W.buddyAcceptedToast('Maya'), W.buddyDeclinedToast('Maya'), W.buddyWith('Maya'), W.buddyStopNote('Maya'), W.buddyStoppedToast('Maya'), W.noteTo('Maya'), W.notesLine('Maya'), W.noteSentToast('Maya'));
  out.push(`Maya: ${W.savedCheerTarget('Chicken bowl')}`, W.savedTheyShow('Maya'), W.notesFrom('Maya'), W.notesFromOn('Maya'), W.borrowedName('Maya', 'lunch'), W.saveCupLabel('Maya’s lunch'), W.savedMealLine(3), W.savedMealLine(3, 4), W.showSavedTitle('Chicken bowl'), W.savedStoppedToast('Chicken bowl'));
  return out;
}

describe('the Friends words', () => {
  it('pass the banned lists, with no exclamation mark, in sentence case', () => {
    const all = strings();
    expect(all.length).toBeGreaterThan(150);
    const bad = all.filter((s) => !s || BANNED.test(s) || JUDGING.test(s) || COMPARING.test(s) || s.includes('!') || !/^[A-Z0-9~⁨]/.test(s));
    expect(bad).toEqual([]);
  });

  it('say "show" for friends, never "share", which is the picture sent through the share sheet', () => {
    expect(strings().filter((s) => /\bshar(e|es|ing)\b/i.test(s) && !/Never shared/.test(s) && s !== W.SHARE_INVITE)).toEqual([]);
  });

  it('never name a figure that could be compared: no total, no budget left or over', () => {
    expect(strings().filter((s) => /\b(left|over|under|remaining)\b/i.test(s) && !/left out|18 and over/.test(s))).toEqual([]);
  });

  it('name a circle by its people, you last, and never set one figure beside a name', () => {
    expect(W.circleNames([])).toBe('You');
    expect(W.circleNames(['Maya'])).toBe('Maya and you');
    expect(W.circleNames(['Jo', 'Maya'])).toBe('Jo, Maya and you');
    expect(W.circleNames(['a', 'b', 'c', 'd'])).toBe('4 friends and you');
    expect(W.circleLine(['Jo', 'Maya'], 3, false)).toBe('Jo, Maya and you · 3 days to go');
    // The join step says plainly what a circle of two gives away.
    expect(W.SEEN_NOTE).toMatch(/circle of two/);
    expect(W.SEEN_NOTE).toMatch(/names/);
  });

  it('keep notes to three fixed presets', () => {
    expect(Object.keys(W.NOTE_WORDS).sort()).toEqual(['nice_week', 'thinking_of_you', 'walk_later']);
  });

  it('name people in words, with a short form past three', () => {
    expect(W.namesLine(['Maya'])).toBe('Maya');
    expect(W.showButton(['Maya', 'Sam'])).toContain('Maya');
    expect(W.showButton(['a', 'b', 'c'])).toBe('Show to 3 friends');
    expect(W.namesLine(['A', 'B', 'C', 'D', 'E'])).toMatch(/and 3 more$/);
  });

  it('leave meals out of every line where meals do not work for this person, and keep them where they do', () => {
    const withMeals = [W.SCREEN_SUBTITLE, W.leaveNote(true), W.leaveConfirm(true), W.leftToast(true), W.removeNote('Maya', true), W.removeConfirm(true), W.removedToast('Maya', true), W.neverSharedLine(true)];
    const without = [W.SCREEN_SUBTITLE_WORKOUTS, W.leaveNote(false), W.leaveConfirm(false), W.leftToast(false), W.removeNote('Maya', false), W.removeConfirm(false), W.removedToast('Maya', false), W.neverSharedLine(false)];
    expect(withMeals.filter((s) => !/\bmeals?\b/i.test(s))).toEqual([]);
    expect(without.filter((s) => /\bmeals?\b/i.test(s))).toEqual([]);
    expect(W.SCREEN_SUBTITLE_WORKOUTS).toBe('Workouts and cheers');
    expect(W.removeNote('Maya')).toBe(W.removeNote('Maya', true));
    expect(W.leftToast(false)).toBe('Friends turned off. Your card, friendships and cheers were removed.');
    expect(W.removedToast('Maya', false)).toBe('Maya is no longer a friend. Cheers between you were removed too.');
  });

  it('say real news in the Friends header, and a friend’s meal or workout in the cups’ names', () => {
    expect(W.feedNewsLine(3, 2)).toBe('3 friends · 2 new today');
    expect(W.feedNewsLine(1, 0)).toBe('1 friend');
    expect(W.feedNewsLine(0, 0)).toBe('No friends yet');
    expect(W.cheerCupLabel(W.itemWhat('Maya', { kind: 'meal', meal: 'snack' }), false)).toBe('Cheer Maya’s snacks');
    expect(W.addCupLabel(W.itemWhat('Maya', { kind: 'meal', meal: 'lunch' }))).toBe('Add Maya’s lunch to my diary');
    expect(W.cheerCupLabel(W.itemWhat('Sam', { kind: 'workout', name: 'Running' }), true)).toBe('You cheered Sam’s running');
  });

  it('word the switches for what On does, never with "Off:" or a double negative', () => {
    for (const s of [W.seesMyMealsTitle('Jo'), W.seesMyMealsOn('Jo'), W.theirMealsTitle('Jo'), W.theirMealsOn('Jo'), W.SEE_MEALS, W.SEE_MEALS_ON]) expect(s).not.toMatch(/\bOff\b|\bnot\b|left out|\bno\b/i);
  });

  it('never offer a plausible code as the code field’s placeholder', () => {
    expect(W.CODE_PLACEHOLDER).not.toMatch(/[A-Z0-9]{4}/);
    expect(W.CODE_PLACEHOLDER_SHORT).not.toMatch(/[A-Z0-9]{4}/);
  });

  it('count days left from the clock, never below zero', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');
    expect(W.daysLeft('2026-11-29T12:00:00Z', now)).toBe(4);
    expect(W.daysLeft('2026-11-25T13:00:00Z', now)).toBe(1);
    expect(W.daysLeft('2026-11-20T12:00:00Z', now)).toBe(0);
  });
});
