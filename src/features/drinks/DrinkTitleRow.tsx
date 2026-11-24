/**
 * The Water screen's "Add a drink" title row: the title (the kit's SectionTitle h3 and its 4 px top
 * margin), then on the right the kit's small secondary "Search" button with its magnifier (`water-search`,
 * "Search drinks": it opens the drink sheet with an empty search, whichever kind is showing), then "Edit
 * sizes" as the kit's small ghost button with its pencil (`section-add-a-drink-action`, the testID
 * SectionTitle gave it; it opens the glass sizes sheet). Both are the kit's own Button, so they have its
 * cup corners, heights and 44 px touch areas. Under 360 px, where the title and both labels do not fit one
 * line, "Edit sizes" keeps its pencil and the word "Sizes". The row is laid out at SectionTitle's height
 * (24 px), so everything under it stays put; with large text (`useLargeText`, `@/theme`) the title takes its own line and
 * the two buttons wrap under it at their full height. Built here because SectionTitle takes one action only.
 */
import { Pencil, Search } from 'lucide-react-native';
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useLargeText, useTheme } from '@/theme';
import { Button, Text } from '@/ui';

export function DrinkTitleRow({ onSearch, onEditSizes }: { onSearch: () => void; onEditSizes: () => void }) {
  const { colors } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  // With large text the title has the line to itself and the two buttons go under it, so it is never cut.
  const big = useLargeText();
  return (
    <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', alignItems: 'center', marginTop: 4, rowGap: big ? 12 : 0 }}>
      <Text variant="h3" style={big ? { flexBasis: '100%' } : { flex: 1, minWidth: 0, marginRight: 8 }} numberOfLines={big ? undefined : 1}>
        Add a drink
      </Text>
      {/* The kit's small buttons are 36 px tall (44 to the finger); the -6 margins lay them out 24 px tall, the h3's line. */}
      <Button
        testID="water-search"
        title="Search"
        accessibilityLabel="Search drinks"
        variant="secondary"
        size="sm"
        full={false}
        icon={<Search size={16} color={colors.text} strokeWidth={2.2} />}
        onPress={onSearch}
        style={{ marginVertical: big ? 0 : -6, paddingHorizontal: 10 }}
      />
      <Button
        testID="section-add-a-drink-action"
        title={narrow ? 'Sizes' : 'Edit sizes'}
        accessibilityLabel={narrow ? 'Sizes, edit glass sizes' : 'Edit sizes'}
        variant="ghost"
        size="sm"
        full={false}
        icon={<Pencil size={15} color={colors.primaryInk} strokeWidth={2.2} />}
        onPress={onEditSizes}
        style={{ marginVertical: big ? 0 : -6, marginLeft: 4, paddingHorizontal: 8 }}
      />
    </View>
  );
}
