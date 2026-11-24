/**
 * An AI answer laid out for reading: paragraphs, list rows and bold words, and nothing else. The
 * answer is text from a model, so nothing in it is ever rendered as Markdown or HTML: links, tables,
 * images and tags stay the plain characters they are, drawn by `Text` as strings. Pure.
 *
 * - A blank line ends a paragraph; lines inside one paragraph keep their line break.
 * - A line starting with "- ", "* " or "• " is a list row; "1. " or "1) " is a numbered row (its
 *   number kept as the row's marker, so the order still reads).
 * - Leading "#" marks are removed and the line becomes a heading row (drawn bold).
 * - "**x**" is a bold span with the stars removed; a lone "**" stays as written.
 */

export interface Span {
  text: string;
  strong: boolean;
}

export interface Block {
  kind: 'para' | 'item' | 'head';
  spans: Span[];
  /** A numbered row's number ("1."); absent for a plain row and for other blocks. */
  marker?: string;
}

const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEAD = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
/** Characters that draw nothing or turn text around unseen; a model's answer has no use for them. */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/** "**x**" pairs as bold spans; an unpaired "**" is kept as text. Adjacent spans of one kind are merged. */
export function spansOf(line: string): Span[] {
  const out: Span[] = [];
  const push = (text: string, strong: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.strong === strong) last.text += text;
    else out.push({ text, strong });
  };
  let rest = line;
  for (;;) {
    const open = rest.indexOf('**');
    if (open < 0) break;
    const close = rest.indexOf('**', open + 2);
    if (close < 0) break;
    const inner = rest.slice(open + 2, close);
    if (!inner.trim()) {
      // "****" or "** **": nothing to make bold; keep the characters.
      push(rest.slice(0, close + 2), false);
      rest = rest.slice(close + 2);
      continue;
    }
    push(rest.slice(0, open), false);
    push(inner, true);
    rest = rest.slice(close + 2);
  }
  push(rest, false);
  return out;
}

export function answerBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(INVISIBLE, '').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ kind: 'para', spans: spansOf(para.join('\n')) });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      endPara();
      continue;
    }
    const h = HEAD.exec(line);
    if (h && h[1]) {
      endPara();
      // A heading is bold as a whole: inner stars are dropped rather than nested.
      blocks.push({ kind: 'head', spans: [{ text: h[1].replace(/\*\*/g, ''), strong: true }] });
      continue;
    }
    const b = BULLET.exec(line);
    if (b && b[1].trim()) {
      endPara();
      blocks.push({ kind: 'item', spans: spansOf(b[1].trim()) });
      continue;
    }
    const n = NUMBERED.exec(line);
    if (n && n[2].trim()) {
      endPara();
      blocks.push({ kind: 'item', spans: spansOf(n[2].trim()), marker: `${n[1]}.` });
      continue;
    }
    para.push(line.trim());
  }
  endPara();
  return blocks;
}

/** The first sentence of an answer, for the screen reader's announcement (at most 160 characters). */
export function firstSentence(text: string): string {
  const plain = answerBlocks(text)
    .map((b) => b.spans.map((s) => s.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.+?[.?!])(\s|$)/.exec(plain);
  const s = m ? m[1] : plain;
  return s.length > 160 ? `${s.slice(0, 159).replace(/\s+\S*$/, '')}…` : s;
}
