import React from 'react';
import { View } from 'react-native';

import { fonts, useTheme } from '@/theme';
import { figure, Text } from '@/ui';

import { quoteAccessibilityLabel, type Quote } from './quotes';
import { quoteWords } from './quoteText';

/** The quote's own voice: Bricolage semibold at 20/26, a size and weight no heading on the page uses (titles are 18 px bold). */
const QUOTE_TYPE = { fontFamily: fonts.displaySemibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 } as const;

/**
 * The quote of the day on the bare page, no card, the one typographic centrepiece of the page: a
 * short level mark (the rim colour, the app's signature line), the words inside typographic
 * quotation marks in their own size and weight (quoteText.ts; verse breaks kept), then the author
 * and, quieter, the work. Read as one block by a screen reader; not pressable.
 *
 * Until `ready` (the device's pin read, useDayQuote) the block keeps its place but draws no words
 * and carries no test ids, so the first quote anyone sees is the final one.
 */
export function QuoteBlock({ quote, ready }: { quote: Quote; ready: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      testID={ready ? 'morning-quote' : undefined}
      {...figure(ready && quoteAccessibilityLabel(quote))}
      importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!ready}
      style={{ opacity: ready ? 1 : 0 }}>
      <View style={{ width: 28, height: 3, backgroundColor: colors.rim }} />
      <Text variant="h3" color="text" testID={ready ? 'morning-quote-text' : undefined} style={[QUOTE_TYPE, { marginTop: spacing.sm }]}>
        {quoteWords(quote.text)}
      </Text>
      <Text variant="label" color="text" numberOfLines={1} testID={ready ? 'morning-quote-author' : undefined} style={{ marginTop: spacing.sm }}>
        {quote.author}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={2} testID={ready ? 'morning-quote-work' : undefined}>
        {quote.work}
      </Text>
    </View>
  );
}
