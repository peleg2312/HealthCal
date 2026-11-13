import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
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
}) {
  const { colors, spacing } = useTheme();
  const content = (
    <>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
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
      {chevron ?? (!!onPress && !right) ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
    </>
  );
  const rowStyle: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm };
  if (onPress) {
    return (
      <PressableScale testID={testID} onPress={onPress} scaleTo={0.985} style={[rowStyle, style]} accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}>
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
          accessibilityLabel={title}
        />
      }
    />
  );
}

/** Round emoji or icon tile used at the start of list rows. */
export function Avatar({ emoji, children, color, size = 44 }: { emoji?: string; children?: React.ReactNode; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        backgroundColor: color ? `${color}22` : colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {emoji ? <Text style={{ fontSize: size * 0.48, lineHeight: size * 0.62 }}>{emoji}</Text> : children}
    </View>
  );
}

export function EmptyState({
  emoji,
  title,
  message,
  action,
  onAction,
}: {
  emoji: string;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12, gap: 8 }}>
      <Text style={{ fontSize: 40, lineHeight: 50 }}>{emoji}</Text>
      <Text variant="h3" align="center">
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

export function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text variant="numM" tabular color={color ?? 'text'} numberOfLines={1}>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" color="textSecondary">
            {unit}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
