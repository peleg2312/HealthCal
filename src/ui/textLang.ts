/**
 * The language of a name inside the app's English lines (WCAG 3.1.2, Language of Parts). A food, a meal or
 * a person's name written in Hebrew or Arabic is marked as such, so a screen reader reads it in its own
 * voice: on the web the part is a span with `lang` (`langParts`), and on iOS a Text that is wholly such a
 * name carries `accessibilityLanguage` (`wholeLang`). Pure, no React.
 */

const HEBREW = /[֐-׿יִ-ﭏ]/;
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/** 'he' or 'ar' for text with a Hebrew or Arabic letter (Hebrew first when it holds both), else null. */
export function scriptLang(text: string): 'he' | 'ar' | null {
  if (HEBREW.test(text)) return 'he';
  if (ARABIC.test(text)) return 'ar';
  return null;
}

/** The language of a string that is wholly a Hebrew or Arabic name (no Latin letter in it), else null. */
export function wholeLang(text: string): 'he' | 'ar' | null {
  const lang = scriptLang(text);
  return lang && !LATIN.test(text) ? lang : null;
}

export interface LangPart {
  text: string;
  lang: 'he' | 'ar' | null;
}

/**
 * A line cut into its parts, each Hebrew or Arabic name with its language: a part is a run isolated by
 * `isolateRtl` (U+2068 ... U+2069, the way person-written text enters a line), or else a run of words from
 * the first to the last such letter. Joined back, the parts are the line exactly.
 */
export function langParts(text: string): LangPart[] {
  if (!scriptLang(text)) return [{ text, lang: null }];
  const parts: LangPart[] = [];
  const push = (t: string, lang: 'he' | 'ar' | null) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.lang === lang) last.text += t;
    else parts.push({ text: t, lang });
  };
  // Isolated runs first, then bare runs of right-to-left words in what is left.
  const iso = /⁨[^⁩]*⁩?/g;
  let at = 0;
  for (const m of text.matchAll(iso)) {
    bare(text.slice(at, m.index), push);
    push(m[0], scriptLang(m[0]));
    at = (m.index ?? 0) + m[0].length;
  }
  bare(text.slice(at), push);
  return parts;
}

/** A stretch with no isolate: from the first to the last Hebrew or Arabic letter of each run of such words. */
function bare(text: string, push: (t: string, lang: 'he' | 'ar' | null) => void) {
  if (!text) return;
  if (!scriptLang(text)) {
    push(text, null);
    return;
  }
  // A run of right-to-left letters and what sits inside a name (spaces, digits, %, quotes, hyphens),
  // starting and ending on such a letter.
  const run = /[֐-׿יִ-ﭏ؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿](?:[֐-׿יִ-ﭏ؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿0-9\s'"%.\-׳״]*[֐-׿יִ-ﭏ؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿])?/g;
  let at = 0;
  for (const m of text.matchAll(run)) {
    push(text.slice(at, m.index), null);
    push(m[0], scriptLang(m[0]));
    at = (m.index ?? 0) + m[0].length;
  }
  push(text.slice(at), null);
}
