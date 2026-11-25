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

