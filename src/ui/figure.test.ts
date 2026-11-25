import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { Platform } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';

import { figure } from './decorative';

const os = Platform.OS;
afterEach(() => {
  (Platform as { OS: string }).OS = os;
});

describe('figure', () => {
  it('names one element natively, with no role', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(figure('Protein, 75 of 152 grams')).toEqual({ accessible: true, accessibilityLabel: 'Protein, 75 of 152 grams' });
  });

  it('is an image on the web, so its name is read there', () => {
    (Platform as { OS: string }).OS = 'web';
    expect(figure('941 kilocalories left')).toEqual({ accessible: true, accessibilityLabel: '941 kilocalories left', role: 'img' });
  });

  it('spreads nothing without words', () => {
    for (const none of [undefined, null, false, ''] as const) expect(figure(none)).toEqual({});
  });
});

/** Every .tsx file under src. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith('.tsx') ? [p] : [];
  });
}

/** The opening tag that starts at `from` (`<View ...>`), braces and strings skipped. */
function openingTag(s: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from + 1; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return s.slice(from, i + 1);
  }
  return s.slice(from);
}

/** The tag's own attributes: what is inside `{...}` (a spread, an expression) is left out. */
function ownAttributes(tag: string): string {
  let out = '';
  let depth = 0;
  for (const c of tag) {
    if (c === '{') depth++;
    if (depth === 0) out += c;
    if (c === '}') depth--;
  }
  return out;
}

describe('figure blocks in the app', () => {
  it('names every non-interactive block through figure() or a role, never `accessible` and a label alone', () => {
    const root = path.resolve(__dirname, '..');
    const offenders: string[] = [];
    for (const file of sources(root)) {
      const s = readFileSync(file, 'utf8');
      for (const m of s.matchAll(/<(View|Animated\.View|Card)\b/g)) {
        const tag = openingTag(s, m.index ?? 0);
        const own = ownAttributes(tag);
        if (!/(^|\s)accessible(\s|=|$|>)/.test(own) || !/(^|\s)accessibilityLabel=/.test(own)) continue;
        if (/(^|\s)(accessibilityRole|role)=/.test(own)) continue;
        offenders.push(`${path.relative(root, file)}:${s.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
