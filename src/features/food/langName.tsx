/**
 * A control's name that holds a food's or a meal's name written in Hebrew or Arabic (WCAG 3.1.2, Language of
 * Parts). An aria-label is one plain string with no language for its parts, so on the web such a control is
 * named instead from a hidden copy of its words, in which the kit `Text` marks the name with its language
 * (a span with `lang`, `@/ui/textLang`), through `aria-labelledby`. Natively, and for a label with no Hebrew
 * or Arabic letter, the plain label stands as it is. The words are the same either way: the label with its
 * units in full (`spokenUnits`) and without direction marks (`withoutMarks`).
 */
import React, { useId } from 'react';
import { Platform, View } from 'react-native';

import { withoutMarks } from '@/lib/bidi';
import { spokenUnits } from '@/lib/spokenUnits';
import { Text } from '@/ui';
import { scriptLang } from '@/ui/textLang';

export interface LangName {
  /** The control's `accessibilityLabel`: the label, or nothing on the web when the hidden copy names it. */
  label: string | undefined;
  /** Spread on the control: `aria-labelledby` pointing at the hidden copy (web, a Hebrew or Arabic name only). */
  props: { 'aria-labelledby'?: string };
  /** Rendered inside the control: the hidden, language-marked copy of its name (or nothing). */
  hidden: React.ReactNode;
}

/** The name of one control (`label` as it would be its accessibilityLabel). One call per control. */
export function useLangName(label: string): LangName {
  const id = `lang-name-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  if (Platform.OS !== 'web' || !scriptLang(label)) return { label, props: {}, hidden: null };
  return {
    label: undefined,
    props: { 'aria-labelledby': id },
    hidden: (
      // Hidden from view and from the reading order; aria-labelledby still reads it (a referenced node counts when hidden).
      <View nativeID={id} style={{ display: 'none' }}>
        <Text>{spokenUnits(withoutMarks(label))}</Text>
      </View>
    ),
  };
}
