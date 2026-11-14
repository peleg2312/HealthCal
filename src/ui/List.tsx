import { ChevronRight } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';

import { cup, cupFor, fonts, motion, useReducedMotion, useTheme } from '@/theme';

import { Button } from './Button';
import { CupKey } from './Chip';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export function ListRow({
  title,
  subtitle,
  left,
  right,
  value,
  onPress,
  chevron,
  style,
  testID,
  accessibilityRole,
  accessibilityState,
  accessibilityHint,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Trailing value text. */
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** For rows that act as something other than a plain button (a radio choice, a link, a checkbox). */
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
}) {
  const { colors, spacing } = useTheme();
  const content = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="label" color="textSecondary" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ?? (!!onPress && !right) ? <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} /> : null}
    </>
  );
  const rowStyle: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 };
  if (onPress) {
    return (
      <PressableScale
        testID={testID}
        onPress={onPress}
        scaleTo={0.985}
        style={[rowStyle, style]}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        accessibilityHint={accessibilityHint}
        accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}>
        {content}
      </PressableScale>
    );
  }
  return (
    <View testID={testID} style={[rowStyle, style]}>
      {content}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />;
}

// 40 wide, as the platform switch was on web, so a row's text keeps the room it had.
const SWITCH_W = 40;
const SWITCH_H = 24;
const KNOB = 16;
const KNOB_INSET = (SWITCH_H - KNOB) / 2;

/**
 * The Pour switch, drawn the same on iOS, Android and web (no platform pill):
 * a small cup lying across (40 x 24, corners 4 4 8 8) with a square-ish knob
 * (16 x 16, corners 3 3 5 5). Off is an empty cup: a 1.5 px borderStrong edge
 * and a textTertiary knob on the left. On is a full one: the primary fill and
 * an onPrimary knob on the right. The knob slides (a transform), or jumps
 * under reduced motion. The touch target is 44 x 44.
 */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
  disabled,
  testID,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  // Held in state, not a ref: the value is read while rendering. 0 off, 1 on.
  const [x] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      x.setValue(value ? 1 : 0);
      return;
    }
    const anim = Animated.timing(x, { toValue: value ? 1 : 0, duration: motion.duration.fade, easing: Easing.bezier(...motion.easing.move), useNativeDriver: Platform.OS !== 'web' });
    anim.start();
    return () => anim.stop();
  }, [value, reduce, x]);
  return (
    <PressableScale
      testID={testID}
      onPress={() => onChange(!value)}
      disabled={disabled}
      feedback="select"
      scaleTo={1}
      hitSlop={{ top: (44 - SWITCH_H) / 2, bottom: (44 - SWITCH_H) / 2, left: (44 - SWITCH_W) / 2, right: (44 - SWITCH_W) / 2 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: SWITCH_W,
        height: SWITCH_H,
        ...cup(8, 4),
        justifyContent: 'center',
        backgroundColor: value ? colors.primary : 'transparent',
        borderWidth: 1.5,
        borderColor: value ? colors.primary : colors.borderStrong,
      }}>
      <Animated.View
        style={{
          width: KNOB,
          height: KNOB,
          // The border is inside the 40 x 24 box, so the knob's inset is measured from it.
          marginLeft: KNOB_INSET - 1.5,
          ...cup(5, 3),
          backgroundColor: value ? colors.onPrimary : colors.textTertiary,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, SWITCH_W - KNOB - 2 * KNOB_INSET] }) }],
        }}
      />
    </PressableScale>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  left,
  testID,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  left?: React.ReactNode;
  testID?: string;
}) {
  return <ListRow title={title} subtitle={subtitle} left={left} chevron={false} right={<Toggle testID={testID} value={value} onChange={onChange} accessibilityLabel={title} />} />;
}

/**
 * A cup tile (5 5 14 14) at the start of a row: an emoji, an icon or initials.
 * Pour prefers a bare 17 px emoji or an 18-20 px icon in rows (no tile); use
 * this where a row needs a tile, and initials (Bricolage) for people.
 */
export function Avatar({ emoji, initials, children, color, size = 44 }: { emoji?: string; initials?: string; children?: React.ReactNode; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        ...cupFor(size),
        backgroundColor: color ? `${color}22` : colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {initials ? (
        <Text variant="h3" style={{ fontSize: size * 0.38, lineHeight: size * 0.5 }}>
          {initials}
        </Text>
      ) : emoji ? (
        <Text style={{ fontSize: size * 0.44, lineHeight: size * 0.6 }}>{emoji}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/** An empty dashed cup: the mark for "nothing here yet". A tumbler like every other cup: open top, no lip. */
function EmptyCup() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 44,
        height: 54,
        borderWidth: 1.5,
        borderTopWidth: 0,
        borderStyle: 'dashed',
        borderColor: colors.vesselEdge,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
      }}
    />
  );
}

export function EmptyState({
  emoji: _emoji,
  title,
  message,
  action,
  onAction,
}: {
  /** @deprecated Emoji are content marks only in Pour; the empty state shows an empty cup. Accepted and ignored. */
  emoji?: string;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 8 }}>
      <EmptyCup />
      <Text variant="h3" align="center" style={{ marginTop: 6 }}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="textSecondary" align="center">
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action} onPress={onAction} size="md" full={false} style={{ marginTop: 8, alignSelf: 'center' }} /> : null}
    </View>
  );
}

/**
 * A number with its unit small beside it and a label under it. With `color`,
 * the label carries a cup-key square in that colour; the number stays in the
 * text colour (data colours are fills, never text).
 */
export function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="numM" numberOfLines={1}>
        {value}
        {unit ? <Text variant="unit">{` ${unit}`}</Text> : null}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <CupKey color={color} /> : null}
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
