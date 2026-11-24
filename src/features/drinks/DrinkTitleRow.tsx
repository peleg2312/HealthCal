/**
 * The Water screen's "Add a drink" title row: the title (the kit's SectionTitle h3 and its 4 px top
 * margin), then on the right a small bordered "Search" button (`water-search`, "Search drinks": it opens
 * the drink sheet with an empty search, whichever kind is showing), then "Edit sizes" as the kit's small
 * ghost button (`section-add-a-drink-action`, the testID SectionTitle gave it; it opens the glass sizes
 * sheet). The same form at 320, 360 and 390 px, and the same layout height as SectionTitle (24 px), so
 * everything under it stays put. Built here because SectionTitle takes one action only.
 */
import { Search } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, PressableScale, Text } from '@/ui';

export function DrinkTitleRow({ onSearch, onEditSizes }: { onSearch: () => void; onEditSizes: () => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      <Text variant="h3" style={{ flex: 1, minWidth: 0, marginRight: 8 }} numberOfLines={1}>
        Add a drink
      </Text>
      {/* 32 visible, 44 to the finger (hitSlop 10 above and below; it is wider than 44 already). The -4
          margin lays it out 24 px tall, the h3's line, so the row keeps SectionTitle's height and nothing
          under it moves for someone who never searches. */}
      <PressableScale
        testID="water-search"
        onPress={onSearch}
        hitSlop={{ top: 10, bottom: 10, left: 4, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel="Search drinks"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 32,
          marginVertical: -4,
          paddingHorizontal: 10,
          borderRadius: radius.chip,
          borderWidth: 1,
          borderColor: colors.borderStrong,
        }}>
        <Search size={18} color={colors.text} strokeWidth={2.2} />
        <Text variant="label" color="text" numberOfLines={1} style={{ fontSize: 13.5 }}>
          Search
        </Text>
      </PressableScale>
      {/* The kit's small ghost button (36 visible, 44 to the finger); the -6 margins lay it out 24 px tall, the h3's line. */}
      <Button
        testID="section-add-a-drink-action"
        title="Edit sizes"
        accessibilityLabel="Edit sizes"
        variant="ghost"
        size="sm"
        full={false}
        onPress={onEditSizes}
        style={{ marginVertical: -6, marginLeft: 4, paddingHorizontal: 8 }}
      />
    </View>
  );
}
