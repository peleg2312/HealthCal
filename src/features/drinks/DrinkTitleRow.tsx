/**
 * The Water screen's "Add a drink" title row: the title (the kit's SectionTitle h3 and its 4 px top
 * margin), then on the right the kit's small secondary "Search" button with its magnifier (`water-search`,
 * "Search drinks": it opens the drink sheet with an empty search, whichever kind is showing), then "Edit
 * sizes" as the kit's small ghost button with its pencil (`section-add-a-drink-action`, the testID
 * SectionTitle gave it; it opens the glass sizes sheet). Both are the kit's own Button, so they have its
 * cup corners, heights and 44 px touch areas. Under 360 px, where the title and both labels do not fit one
 * line, "Edit sizes" keeps its pencil and the word "Sizes". The row is laid out at SectionTitle's height
 * (24 px), so everything under it stays put. With very large text (`useVeryLargeText`, `@/theme`) the title
 * takes its own line and the two buttons wrap under it at their full height. Through the phone's common text
 * steps (the app's 115% and 130%, Android's 1.15 and 1.3) and under a reader's own text spacing the row keeps
 * its one line while the title and both buttons, measured as drawn (`MeasureWidth`), fit it; where they do
 * not, "Edit sizes" says "Sizes" first, and only where even that does not fit does the title take its own
 * line (`titleRowLayout`). Built here because SectionTitle takes one action only.
 */
import { Pencil, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { MeasureWidth, SizeProbe, useMeasureKey } from '@/features/today/MeasureWidth';
import { fonts, useTheme, useVeryLargeText } from '@/theme';
import { Button, Text, useGrownText } from '@/ui';

import { titleRowLayout } from './grownFit';

/** The title's room to the buttons, and the ghost button's room to the one before it. */
const TITLE_GAP = 8;
const EDIT_GAP = 4;
/** The small Button's label as the kit draws it, for measuring the two labels of "Edit sizes". */
const SM_LABEL = { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold } as const;

export function DrinkTitleRow({ onSearch, onEditSizes }: { onSearch: () => void; onEditSizes: () => void }) {
  const { colors } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  // With very large text the title has the line to itself and the two buttons go under it, so it is never cut.
  const veryLarge = useVeryLargeText();
  // Grown text or a reader's own text spacing (`useGrownText`): the title wraps rather than be cut, as kit labels do,
  // and below very large text the row is laid out from its parts as drawn (`fit`).
  const grown = useGrownText();
  const fit = grown && !veryLarge;
  const measureKey = useMeasureKey();
  const [titleW, setTitleW] = useState(0);
  const [rowW, setRowW] = useState(0);
  // The two buttons as drawn, with the label they held when measured ("Sizes" or "Edit sizes"), and both labels' words.
  const [buttons, setButtons] = useState({ width: 0, short: false });
  const [fullW, setFullW] = useState(0);
  const [shortW, setShortW] = useState(0);
  const layout = fit ? titleRowLayout({ titleW, buttonsW: buttons.width, buttonsShort: buttons.short, fullW, shortW, rowW, gap: TITLE_GAP }) : veryLarge ? 'wrap' : 'full';
  const big = layout === 'wrap';
  const short = narrow || layout === 'short';
  const searchButton = (
    <Button
      testID="water-search"
      title="Search"
      accessibilityLabel="Search drinks"
      variant="secondary"
      size="sm"
      full={false}
      icon={<Search size={18} color={colors.text} strokeWidth={2.2} />}
      onPress={onSearch}
      style={{ marginVertical: big ? 0 : -6, paddingHorizontal: 10 }}
    />
  );
  const editButton = (
    <Button
      testID="section-add-a-drink-action"
      title={short ? 'Sizes' : 'Edit sizes'}
      accessibilityLabel={short ? 'Sizes, edit glass sizes' : 'Edit sizes'}
      variant="ghost"
      size="sm"
      full={false}
      icon={<Pencil size={18} color={colors.primaryInk} strokeWidth={2.2} />}
      onPress={onEditSizes}
      style={{ marginVertical: big ? 0 : -6, marginLeft: EDIT_GAP, paddingHorizontal: 8 }}
    />
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', alignItems: 'center', marginTop: 4, rowGap: big ? 12 : 0 }}>
      {fit ? <SizeProbe key={measureKey} onSize={(w) => setRowW(Math.floor(w))} /> : null}
      {fit ? (
        <>
          <MeasureWidth key={`title-${measureKey}`} onWidth={setTitleW}>
            <Text variant="h3">Add a drink</Text>
          </MeasureWidth>
          <MeasureWidth key={`full-${measureKey}`} onWidth={setFullW}>
            <Text variant="title" style={SM_LABEL}>
              Edit sizes
            </Text>
          </MeasureWidth>
          <MeasureWidth key={`short-${measureKey}`} onWidth={setShortW}>
            <Text variant="title" style={SM_LABEL}>
              Sizes
            </Text>
          </MeasureWidth>
        </>
      ) : null}
      <Text variant="h3" style={big ? { flexBasis: '100%' } : { flex: 1, minWidth: 0, marginRight: TITLE_GAP }} numberOfLines={big || grown ? undefined : 1}>
        Add a drink
      </Text>
      {/* The kit's small buttons are 36 px tall (44 to the finger); the -6 margins lay them out 24 px tall, the h3's line.
          With text grown they sit in one box, measured as drawn (their natural width: they never shrink in the row). */}
      {fit ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SizeProbe key={`buttons-${measureKey}`} onSize={(w) => setButtons({ width: Math.ceil(w), short })} />
          {searchButton}
          {editButton}
        </View>
      ) : (
        <>
          {searchButton}
          {editButton}
        </>
      )}
    </View>
  );
}
