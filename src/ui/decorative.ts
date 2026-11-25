/**
 * Marks that only decorate (an icon beside its own words, a legend key, the drawn parts of a cup whose numbers
 * are said in its name) are hidden from assistive technology (WCAG 1.1.1), so a screen reader never stops on an
 * unnamed image. On the web that is `aria-hidden` (react-native-web does not read `importantForAccessibility`);
 * natively the iOS and Android props.
 *
 *   <View {...DECORATIVE}>...</View>                 a drawn part of a kit piece
 *   decorative(<Flame size={18} color={c} />)        a bare lucide icon on a screen, beside words that say it
 *
 * An icon given to a kit `Button`, `IconButton` or `ListRow` is hidden by the kit itself: the control or the
 * row is named by its words.
 *
 * A figure block is the other side: a piece that is not a control but is one element to a screen reader, read by
 * its name (a cup with its figures, a stat with its unit said in full, a line of a list said as one sentence).
 *
 *   <View {...figure(`Protein, 75 of 152 grams`)}>...</View>
 */
import React from 'react';
import { Platform } from 'react-native';

/** Spread on a View (or an Svg) that only decorates. */
export const DECORATIVE = (
  Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
) as { 'aria-hidden'?: true; accessibilityElementsHidden?: true; importantForAccessibility?: 'no-hide-descendants' };

/** The same icon, hidden from assistive technology: the one way a screen marks a bare lucide icon decorative. */
export function decorative<P>(icon: React.ReactElement<P>): React.ReactElement<P> {
  return React.cloneElement(icon, DECORATIVE as unknown as Partial<P>);
}


/** What `figure` spreads: one element with its name, and on the web the role that lets the name be read. */
export type FigureProps = { accessible?: true; accessibilityLabel?: string; role?: 'img' };

/**
 * Spread on a View (or a Text) that is not a control but is one element for a screen reader, named by `label`
 * (with its units in full: it has no visible label to match). Natively `accessible` with the label; on the web it
 * is also `role="img"`, because react-native-web ignores `accessible` and an aria-label on an element with no role
 * is not read. With no label (undefined, null, false or '') it spreads nothing, so `figure(ready && words)` names
 * the block only once it has its words. The one way to name a figure block: never `accessible` and a label alone.
 */
export function figure(label: string | null | undefined | false): FigureProps {
  if (!label) return {};
  return Platform.OS === 'web' ? { accessible: true, accessibilityLabel: label, role: 'img' } : { accessible: true, accessibilityLabel: label };
}
