/** An AI answer's layout (`answerBlocks`): paragraphs, rows, bold, headings, and nothing else interpreted. */
import { describe, expect, it } from 'vitest';

import { answerBlocks, firstSentence, spansOf } from './format';

const plain = (text: string) => [{ text, strong: false }];

describe('answerBlocks', () => {
  it('blank lines make paragraphs; a single line break stays inside one', () => {
    expect(answerBlocks('One.\nStill one.\n\nTwo.')).toEqual([
      { kind: 'para', spans: plain('One.\nStill one.') },
      { kind: 'para', spans: plain('Two.') },
    ]);
  });

  it('"- ", "* " and "• " lines are rows; "1. " and "2) " keep their number', () => {
    expect(answerBlocks('Try:\n- Tuesday: 30 min easy run\n* Thursday: strength\n• Sunday: rest\n1. First\n2) Second')).toEqual([
      { kind: 'para', spans: plain('Try:') },
      { kind: 'item', spans: plain('Tuesday: 30 min easy run') },
      { kind: 'item', spans: plain('Thursday: strength') },
      { kind: 'item', spans: plain('Sunday: rest') },
      { kind: 'item', spans: plain('First'), marker: '1.' },
      { kind: 'item', spans: plain('Second'), marker: '2.' },
    ]);
  });

  it('**bold** loses its stars; a lone ** stays as written', () => {
    expect(spansOf('Eat **more protein** at lunch')).toEqual([
      { text: 'Eat ', strong: false },
      { text: 'more protein', strong: true },
      { text: ' at lunch', strong: false },
    ]);
    expect(spansOf('5 ** 2 is not maths here')).toEqual(plain('5 ** 2 is not maths here'));
    expect(spansOf('**a** and **b')).toEqual([
      { text: 'a', strong: true },
      { text: ' and **b', strong: false },
    ]);
    expect(spansOf('****')).toEqual(plain('****'));
  });

  it('# marks are removed and the line becomes a heading', () => {
    expect(answerBlocks('## Your week\nText')).toEqual([
      { kind: 'head', spans: [{ text: 'Your week', strong: true }] },
      { kind: 'para', spans: plain('Text') },
    ]);
    expect(answerBlocks('#hashtag stays')).toEqual([{ kind: 'para', spans: plain('#hashtag stays') }]);
  });

  it('interprets nothing else: links, tags and tables stay plain characters', () => {
    const hostile = '<script>alert(1)</script> [click](javascript:alert(1)) ![img](http://x) | a | b |';
    const blocks = answerBlocks(hostile);
    expect(blocks).toEqual([{ kind: 'para', spans: plain(hostile) }]);
  });

  it('drops invisible direction overrides and control characters, keeps the letters', () => {
    expect(answerBlocks('abc‮def\u0007')).toEqual([{ kind: 'para', spans: plain('abcdef') }]);
  });

  it('leaves Hebrew text unchanged', () => {
    const he = 'שתו מים לפני האימון.\n- כוס אחת אחרי';
    expect(answerBlocks(he)).toEqual([
      { kind: 'para', spans: plain('שתו מים לפני האימון.') },
      { kind: 'item', spans: plain('כוס אחת אחרי') },
    ]);
  });

  it('an empty answer has no blocks', () => {
    expect(answerBlocks('')).toEqual([]);
    expect(answerBlocks('\n\n  \n')).toEqual([]);
  });
});

describe('firstSentence', () => {
  it('is the first sentence, without the stars, for the announcement', () => {
    expect(firstSentence('Most people do well with **one or two rest days**.\n\n- Put an easy day after.')).toBe('Most people do well with one or two rest days.');
    expect(firstSentence('No full stop here')).toBe('No full stop here');
    expect(firstSentence('x'.repeat(300)).length).toBeLessThanOrEqual(160);
  });
});
