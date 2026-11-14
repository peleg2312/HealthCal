import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Platform, Switch, View, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native';

import { cupFor, fonts, useTheme } from '@/theme';

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
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      left={left}
      chevron={false}
      right={
        <Switch
          testID={testID}
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.track, true: colors.primary }}
          thumbColor="#FFFFFF"
          // On web the "on" colours are separate props; without them the knob is the library's teal.
          {...(Platform.OS === 'web' ? ({ activeTrackColor: colors.primary, activeThumbColor: '#FFFFFF' } as object) : null)}
          accessibilityLabel={title}
        />
      }
    />
  );
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

/** An empty dashed cup: the mark for "nothing here yet". */
function EmptyCup() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 44, height: 54, alignItems: 'center' }}>
      <View
        style={{
          width: 44,
          height: 52,
          borderWidth: 1.5,
          borderTopWidth: 0,
          borderStyle: 'dashed',
          borderColor: colors.borderStrong,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
        }}
      />
      <View style={{ position: 'absolute', left: -6, right: -6, top: 0, height: 2, backgroundColor: colors.borderStrong }} />
    </View>
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
