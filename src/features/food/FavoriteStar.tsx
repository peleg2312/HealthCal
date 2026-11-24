/**
 * The favourite star, one look everywhere (the food detail header, saved-meal rows and cards): an outline
 * when off, filled `primaryInk` when on (the accent ink of a switch's "on"; never `warning`, which in this
 * app means over a target). The state reads from fill against outline, not from colour alone, and is told
 * to assistive technology as a selected toggle with one fixed name ("Favourite Banana", `favoriteLabel`):
 * only the pressed state changes with a tap, never the name. A name in Hebrew or Arabic is spoken in its own
 * language (`useLangName`). Built like the kit's IconButton (a cup, a 44 px target through `hitSlop`), which
 * takes no accessibility state.
 */
import { Star } from 'lucide-react-native';
import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { cupFor, useTheme } from '@/theme';
import { PressableScale } from '@/ui';

import { favoriteLabel } from './favoriteWords';
import { useLangName } from './langName';

export function FavoriteStar({
  on,
  onPress,
  name,
  testID,
  size = 36,
  tone = 'clear',
  offColor = 'textSecondary',
  style,
}: {
  on: boolean;
  onPress: () => void;
  /** The food's or the meal's name as drawn (raw, no direction marks): the star is "Favourite <name>". */
  name: string;
  testID?: string;
  size?: number;
  /** 'surface': the header's bordered cup; 'clear' on a card or a row. */
  tone?: 'clear' | 'surface';
  /** The outline when off: `text` in the header cup, `textSecondary` on cards and rows. */
  offColor?: 'text' | 'textSecondary';
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const lang = useLangName(favoriteLabel(name));
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      scaleTo={0.92}
      feedback="none"
      hitSlop={Math.max(0, Math.ceil((44 - size) / 2))}
      accessibilityLabel={lang.label}
      {...lang.props}
      accessibilityState={{ selected: on }}
      // react-native-web drops accessibilityState, so the browser is told directly.
      aria-pressed={on}
      style={[
        {
          width: size,
          height: size,
          ...cupFor(size),
          backgroundColor: tone === 'surface' ? colors.surface : 'transparent',
          borderWidth: tone === 'surface' ? 1 : 0,
          borderColor: colors.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      {lang.hidden}
      <Star
        testID={testID ? `${testID}-icon` : undefined}
        size={19}
        color={on ? colors.primaryInk : colors[offColor]}
        fill={on ? colors.primaryInk : 'transparent'}
        strokeWidth={on ? 2.2 : 1.9}
      />
    </PressableScale>
  );
}
