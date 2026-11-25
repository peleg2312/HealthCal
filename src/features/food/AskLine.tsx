/**
 * The soft check's question under a field (./softCheck): "Is 5,000 kcal right for one entry? Tap Add again to add it."
 * Two sentences, so reading text (body, textSecondary), as Water's is. It is tied to its field (`askTie`): on the web
 * the field's `aria-describedby` points at a hidden copy with the units in full ("5,000 kilocalories"), the drawn
 * words hidden from assistive technology so they are not read twice; natively the field's hint and the line's own
 * label carry the same spoken words.
 */
import React from 'react';
import { Platform, View } from 'react-native';

import { spokenUnits } from '@/lib/spokenUnits';
import { Text } from '@/ui';

/** Hidden from sight, kept for screen readers. */
const SPOKEN_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const;

/** The question as drawn under the field; `id` is what the field's `askTie` names. */
export function AskLine({ id, line, testID }: { id: string; line: string; testID: string }) {
  const web = Platform.OS === 'web';
  return (
    <View>
      <Text testID={testID} variant="body" color="textSecondary" {...(web ? ({ 'aria-hidden': true } as object) : { accessibilityLabel: spokenUnits(line) })}>
        {line}
      </Text>
      {web ? (
        <Text nativeID={id} style={SPOKEN_ONLY}>
          {spokenUnits(line)}
        </Text>
      ) : null}
    </View>
  );
}

/** The props that tie a field to its question: `aria-describedby` on the web, the hint (units in full) natively. */
export function askTie(id: string, line: string): object {
  return Platform.OS === 'web' ? { 'aria-describedby': id } : { accessibilityHint: spokenUnits(line) };
}
